import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Eye,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  SecureVerificationDialog,
  useSecureVerification,
} from '@/features/auth/secure-verification'
import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  addViolationAllowlist,
  deleteViolationEvent,
  getViolationOverview,
  listViolationAllowlist,
  listViolationCases,
  listViolationEvents,
  removeViolationAllowlist,
  runViolationAuditNow,
  runViolationCaseAudit,
} from './api'
import { CaseVerdictDialog } from './components/case-verdict-dialog'
import { ViolationAuditSettingsDialog } from './components/settings-dialog'
import { caseStatusBadgeVariant, riskBadgeVariant } from './lib/badges'
import type { ViolationAllowlistEntry, ViolationEvent } from './types'

function formatTime(ts: number): string {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleString()
}

const PAGE_SIZE = 20

export function ViolationAudit() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.auth.user)
  const isRoot = (currentUser?.role ?? 0) >= ROLE.SUPER_ADMIN
  const verification = useSecureVerification()

  const [activeTab, setActiveTab] = useState<'cases' | 'events' | 'allowlist'>(
    'cases'
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null)

  // Cases filters
  const [caseStatus, setCaseStatus] = useState('open')
  const [caseRisk, setCaseRisk] = useState('all')
  const [caseKeyword, setCaseKeyword] = useState('')
  const [casePage, setCasePage] = useState(1)

  // Events filters
  const [eventPlugin, setEventPlugin] = useState('all')
  const [eventKeyword, setEventKeyword] = useState('')
  const [eventPage, setEventPage] = useState(1)
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null)
  const [deletingEvent, setDeletingEvent] = useState<ViolationEvent | null>(
    null
  )

  // Allowlist state
  const [allowlistKeyword, setAllowlistKeyword] = useState('')
  const [allowlistPage, setAllowlistPage] = useState(1)
  const [addAllowlistOpen, setAddAllowlistOpen] = useState(false)
  const [allowlistUserId, setAllowlistUserId] = useState('')
  const [allowlistReason, setAllowlistReason] = useState('')
  const [removingAllowlist, setRemovingAllowlist] =
    useState<ViolationAllowlistEntry | null>(null)

  const overviewQuery = useQuery({
    queryKey: ['violation-audit', 'overview'],
    queryFn: getViolationOverview,
  })

  const casesQuery = useQuery({
    queryKey: [
      'violation-audit',
      'cases',
      caseStatus,
      caseRisk,
      caseKeyword,
      casePage,
    ],
    queryFn: () =>
      listViolationCases({
        status: caseStatus,
        risk_level: caseRisk === 'all' ? undefined : caseRisk,
        keyword: caseKeyword.trim() || undefined,
        p: casePage,
        page_size: PAGE_SIZE,
      }),
    enabled: activeTab === 'cases',
  })

  const eventsQuery = useQuery({
    queryKey: [
      'violation-audit',
      'events',
      eventPlugin,
      eventKeyword,
      eventPage,
    ],
    queryFn: () =>
      listViolationEvents({
        plugin: eventPlugin === 'all' ? undefined : eventPlugin,
        keyword: eventKeyword.trim() || undefined,
        p: eventPage,
        page_size: PAGE_SIZE,
      }),
    enabled: activeTab === 'events',
  })

  const allowlistQuery = useQuery({
    queryKey: ['violation-audit', 'allowlist', allowlistKeyword, allowlistPage],
    queryFn: () =>
      listViolationAllowlist({
        keyword: allowlistKeyword.trim() || undefined,
        p: allowlistPage,
        page_size: PAGE_SIZE,
      }),
    enabled: activeTab === 'allowlist',
  })

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['violation-audit'] })
  }

  const runBatchMutation = useMutation({
    mutationFn: runViolationAuditNow,
    onSuccess: (summary) => {
      toast.success(
        t(
          'Audit pass finished: {{screened}} screened, {{succeeded}} audited, {{failed}} failed',
          {
            screened: summary.screened_accounts,
            succeeded: summary.succeeded_count,
            failed: summary.failed_count,
          }
        )
      )
      invalidateAll()
    },
    onError: (error) => {
      handleServerError(error, t('Failed to run violation audit'))
    },
  })

  const quickAuditMutation = useMutation({
    mutationFn: runViolationCaseAudit,
    onSuccess: () => {
      toast.success(t('Account audit completed'))
      invalidateAll()
    },
    onError: (error) => {
      handleServerError(error, t('Failed to run account audit'))
    },
  })

  const deleteEventMutation = useMutation({
    mutationFn: (eventId: number) => deleteViolationEvent(eventId),
    onSuccess: () => {
      toast.success(t('Violation event deleted'))
      setDeletingEvent(null)
      invalidateAll()
    },
    onError: (error) => {
      handleServerError(error, t('Failed to delete violation event'))
    },
  })

  const addAllowlistMutation = useMutation({
    mutationFn: addViolationAllowlist,
    onSuccess: () => {
      toast.success(t('Account added to violation audit allowlist'))
      setAddAllowlistOpen(false)
      setAllowlistUserId('')
      setAllowlistReason('')
      invalidateAll()
    },
    onError: (error) => {
      handleServerError(error, t('Failed to add account to allowlist'))
    },
  })

  const removeAllowlistMutation = useMutation({
    mutationFn: (userId: number) => removeViolationAllowlist(userId),
    onSuccess: () => {
      toast.success(t('Account removed from allowlist'))
      setRemovingAllowlist(null)
      invalidateAll()
    },
    onError: (error) => {
      handleServerError(error, t('Failed to remove account from allowlist'))
    },
  })

  const overview = overviewQuery.data?.overview
  const caseItems = casesQuery.data?.items ?? []
  const caseTotal = casesQuery.data?.total ?? 0
  const eventItems = eventsQuery.data?.items ?? []
  const eventTotal = eventsQuery.data?.total ?? 0
  const allowlistItems = allowlistQuery.data?.items ?? []
  const allowlistTotal = allowlistQuery.data?.total ?? 0

  let casesBody = null
  if (casesQuery.isLoading) {
    casesBody = <LoadingState />
  } else if (casesQuery.isError) {
    casesBody = (
      <ErrorState
        description={t('Failed to load violation cases')}
        onRetry={() => void casesQuery.refetch()}
      />
    )
  } else if (caseItems.length === 0) {
    casesBody = (
      <EmptyState
        title={t('No screened accounts found')}
        description={t(
          'Accounts appear here once their blocked requests meet the configured violation threshold.'
        )}
      />
    )
  } else {
    casesBody = (
      <div className='rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Account')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead>{t('Hits')}</TableHead>
              <TableHead>{t('AI Risk')}</TableHead>
              <TableHead>{t('AI Summary')}</TableHead>
              <TableHead>{t('Latest Hit')}</TableHead>
              <TableHead className='text-right'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {caseItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className='font-medium'>
                    {item.username || `#${item.user_id}`}
                  </div>
                  <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                    <span>ID: {item.user_id}</span>
                    {item.user_status === 2 && (
                      <Badge
                        variant='destructive'
                        className='px-1 py-0 text-[10px]'
                      >
                        {t('Disabled')}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className='flex flex-col items-start gap-1'>
                    <Badge variant={caseStatusBadgeVariant(item.status)}>
                      {t(`violation_case_status.${item.status}`)}
                    </Badge>
                    {item.needs_reaudit && (
                      <span className='text-muted-foreground text-[11px]'>
                        {t('Needs re-audit')}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className='whitespace-nowrap'>
                  <span className='font-medium'>{item.hit_count}</span>
                  <span className='text-muted-foreground text-xs'>
                    {' '}
                    / {item.window_hours}h
                  </span>
                </TableCell>
                <TableCell>
                  <div className='flex items-center gap-1.5'>
                    <Badge variant={riskBadgeVariant(item.risk_level)}>
                      {t(`violation_risk.${item.risk_level}`)}
                    </Badge>
                    {item.audited_at > 0 && (
                      <span className='text-muted-foreground text-xs'>
                        {item.risk_score}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className='max-w-md'>
                  <p className='line-clamp-2 text-xs leading-relaxed'>
                    {item.summary ||
                      (item.audit_error
                        ? `${t('Audit failed')}: ${item.audit_error}`
                        : t('Waiting for AI audit'))}
                  </p>
                </TableCell>
                <TableCell className='text-muted-foreground text-xs whitespace-nowrap'>
                  {formatTime(item.last_violation_at)}
                </TableCell>
                <TableCell className='text-right whitespace-nowrap'>
                  <div className='flex justify-end gap-1.5'>
                    {(item.status === 'pending_audit' ||
                      item.needs_reaudit) && (
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={quickAuditMutation.isPending}
                        onClick={() => quickAuditMutation.mutate(item.id)}
                      >
                        <Sparkles className='mr-1 size-3.5' />
                        {t('Audit')}
                      </Button>
                    )}
                    <Button
                      size='sm'
                      onClick={() => setSelectedCaseId(item.id)}
                    >
                      <Eye className='mr-1 size-3.5' />
                      {item.status === 'pending_audit' ||
                      item.status === 'pending_verdict'
                        ? t('Review & Decide')
                        : t('View')}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className='flex items-center justify-between border-t px-4 py-2 text-xs'>
          <span className='text-muted-foreground'>
            {t('Total {{count}} items', { count: caseTotal })}
          </span>
          <div className='flex gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={casePage <= 1}
              onClick={() => setCasePage((p) => Math.max(1, p - 1))}
            >
              {t('Previous')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={casePage * PAGE_SIZE >= caseTotal}
              onClick={() => setCasePage((p) => p + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  let eventsBody = null
  if (eventsQuery.isLoading) {
    eventsBody = <LoadingState />
  } else if (eventsQuery.isError) {
    eventsBody = (
      <ErrorState
        description={t('Failed to load violation events')}
        onRetry={() => void eventsQuery.refetch()}
      />
    )
  } else if (eventItems.length === 0) {
    eventsBody = (
      <EmptyState
        title={t('No violation events recorded')}
        description={t(
          'Requests blocked by tracked security plugins are automatically captured here.'
        )}
      />
    )
  } else {
    eventsBody = (
      <div className='rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Account')}</TableHead>
              <TableHead>{t('Plugin / Rule')}</TableHead>
              <TableHead>{t('Model')}</TableHead>
              <TableHead>{t('Blocked Prompt Excerpt')}</TableHead>
              <TableHead>{t('Time')}</TableHead>
              {isRoot && (
                <TableHead className='text-right'>{t('Actions')}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventItems.map((event) => {
              const expanded = expandedEventId === event.id
              return (
                <TableRow key={event.id}>
                  <TableCell className='whitespace-nowrap'>
                    <div className='font-medium'>
                      {event.username || `#${event.user_id}`}
                    </div>
                    <div className='text-muted-foreground text-xs'>
                      ID: {event.user_id}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-1'>
                      <Badge variant='secondary'>{event.plugin}</Badge>
                      {event.category && (
                        <Badge variant='outline'>{event.category}</Badge>
                      )}
                    </div>
                    {event.rule_id && (
                      <div className='text-muted-foreground mt-0.5 font-mono text-[11px]'>
                        {event.rule_id}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className='font-mono text-xs'>
                    {event.model || '-'}
                  </TableCell>
                  <TableCell className='max-w-lg'>
                    <button
                      type='button'
                      className='text-left font-mono text-xs break-words whitespace-pre-wrap hover:underline'
                      onClick={() =>
                        setExpandedEventId(expanded ? null : event.id)
                      }
                    >
                      <span className={expanded ? '' : 'line-clamp-2'}>
                        {event.prompt_excerpt || t('No text content extracted')}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className='text-muted-foreground text-xs whitespace-nowrap'>
                    {formatTime(event.created_at)}
                  </TableCell>
                  {isRoot && (
                    <TableCell className='text-right'>
                      <Button
                        size='icon'
                        variant='ghost'
                        aria-label={t('Delete violation event')}
                        onClick={() => setDeletingEvent(event)}
                      >
                        <Trash2 className='text-destructive size-4' />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <div className='flex items-center justify-between border-t px-4 py-2 text-xs'>
          <span className='text-muted-foreground'>
            {t('Total {{count}} items', { count: eventTotal })}
          </span>
          <div className='flex gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={eventPage <= 1}
              onClick={() => setEventPage((p) => Math.max(1, p - 1))}
            >
              {t('Previous')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={eventPage * PAGE_SIZE >= eventTotal}
              onClick={() => setEventPage((p) => p + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  let allowlistBody = null
  if (allowlistQuery.isLoading) {
    allowlistBody = <LoadingState />
  } else if (allowlistQuery.isError) {
    allowlistBody = (
      <ErrorState
        description={t('Failed to load allowlist')}
        onRetry={() => void allowlistQuery.refetch()}
      />
    )
  } else if (allowlistItems.length === 0) {
    allowlistBody = (
      <EmptyState
        title={t('No allowlisted accounts')}
        description={t(
          'Allowlisted accounts are exempted from automated multi-hit violation screening.'
        )}
      />
    )
  } else {
    allowlistBody = (
      <div className='rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Account')}</TableHead>
              <TableHead>{t('Reason')}</TableHead>
              <TableHead>{t('Added by')}</TableHead>
              <TableHead>{t('Time')}</TableHead>
              <TableHead className='text-right'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allowlistItems.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <div className='font-medium'>
                    {entry.username || `#${entry.user_id}`}
                  </div>
                  <div className='text-muted-foreground text-xs'>
                    ID: {entry.user_id}
                  </div>
                </TableCell>
                <TableCell className='max-w-md text-sm'>
                  {entry.reason || '-'}
                </TableCell>
                <TableCell className='text-muted-foreground text-xs'>
                  {entry.created_by_username || '-'}
                </TableCell>
                <TableCell className='text-muted-foreground text-xs whitespace-nowrap'>
                  {formatTime(entry.created_at)}
                </TableCell>
                <TableCell className='text-right'>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setRemovingAllowlist(entry)}
                  >
                    {t('Remove')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className='flex items-center justify-between border-t px-4 py-2 text-xs'>
          <span className='text-muted-foreground'>
            {t('Total {{count}} items', { count: allowlistTotal })}
          </span>
          <div className='flex gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={allowlistPage <= 1}
              onClick={() => setAllowlistPage((p) => Math.max(1, p - 1))}
            >
              {t('Previous')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={allowlistPage * PAGE_SIZE >= allowlistTotal}
              onClick={() => setAllowlistPage((p) => p + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {t('Violation Audit')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <div className='flex flex-wrap items-center gap-2'>
            {isRoot && (
              <>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={runBatchMutation.isPending}
                  onClick={() => runBatchMutation.mutate()}
                >
                  {runBatchMutation.isPending ? (
                    <Loader2 className='mr-1.5 size-4 animate-spin' />
                  ) : (
                    <Play className='mr-1.5 size-4' />
                  )}
                  {t('Run Audit Now')}
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings className='mr-1.5 size-4' />
                  {t('Audit Settings')}
                </Button>
              </>
            )}
            <Button size='sm' variant='ghost' onClick={invalidateAll}>
              <RefreshCw className='mr-1.5 size-4' />
              {t('Refresh')}
            </Button>
          </div>
        </SectionPageLayout.Actions>

        <SectionPageLayout.Content>
          <div className='space-y-4'>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-muted-foreground text-xs font-medium'>
                    {t('Pending Human Verdict')}
                  </CardTitle>
                  <ShieldAlert
                    className='text-destructive size-4'
                    aria-hidden='true'
                  />
                </CardHeader>
                <CardContent>
                  <div className='flex items-baseline gap-2'>
                    <span className='text-2xl font-semibold'>
                      {overview?.pending_verdict ?? 0}
                    </span>
                    {(overview?.high_risk_pending ?? 0) > 0 && (
                      <Badge variant='destructive' className='text-xs'>
                        {t('{{count}} high risk', {
                          count: overview?.high_risk_pending ?? 0,
                        })}
                      </Badge>
                    )}
                  </div>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {t('Audited by AI and waiting for your decision')}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-muted-foreground text-xs font-medium'>
                    {t('Pending AI Audit')}
                  </CardTitle>
                  <Sparkles
                    className='text-primary size-4'
                    aria-hidden='true'
                  />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-semibold'>
                    {overview?.pending_audit ?? 0}
                  </div>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {overview?.auto_audit_enabled
                      ? t('Auto audit every {{minutes}}m ({{model}})', {
                          minutes: overview.interval_minutes,
                          model: overview.model || '-',
                        })
                      : t('Scheduled AI audit is currently off')}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-muted-foreground text-xs font-medium'>
                    {t('24h Violation Hits')}
                  </CardTitle>
                  <AlertTriangle
                    className='size-4 text-amber-500'
                    aria-hidden='true'
                  />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-semibold'>
                    {overview?.events_24h ?? 0}
                  </div>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {t('Screen at {{threshold}} hits / {{hours}}h', {
                      threshold: overview?.threshold_count ?? 3,
                      hours: overview?.window_hours ?? 24,
                    })}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-muted-foreground text-xs font-medium'>
                    {t('Banned / Allowlisted')}
                  </CardTitle>
                  <ShieldCheck
                    className='size-4 text-emerald-600'
                    aria-hidden='true'
                  />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-semibold'>
                    {overview?.banned_count ?? 0} /{' '}
                    {overview?.allowlist_count ?? 0}
                  </div>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {t('{{count}} cases dismissed as false positive', {
                      count: overview?.dismissed_count ?? 0,
                    })}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(value) =>
                setActiveTab(value as 'cases' | 'events' | 'allowlist')
              }
            >
              <TabsList>
                <TabsTrigger value='cases'>
                  {t('Risk Accounts & Verdicts')}
                </TabsTrigger>
                <TabsTrigger value='events'>
                  {t('Violation Events')}
                </TabsTrigger>
                <TabsTrigger value='allowlist'>{t('Allowlist')}</TabsTrigger>
              </TabsList>

              <TabsContent value='cases' className='space-y-3 pt-2'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Select
                    value={caseStatus}
                    onValueChange={(value) => {
                      if (!value) return
                      setCaseStatus(value)
                      setCasePage(1)
                    }}
                  >
                    <SelectTrigger
                      className='w-40'
                      aria-label={t('Case status')}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='open'>{t('Open cases')}</SelectItem>
                      <SelectItem value='pending_verdict'>
                        {t('violation_case_status.pending_verdict')}
                      </SelectItem>
                      <SelectItem value='pending_audit'>
                        {t('violation_case_status.pending_audit')}
                      </SelectItem>
                      <SelectItem value='banned'>
                        {t('violation_case_status.banned')}
                      </SelectItem>
                      <SelectItem value='dismissed'>
                        {t('violation_case_status.dismissed')}
                      </SelectItem>
                      <SelectItem value='allowlisted'>
                        {t('violation_case_status.allowlisted')}
                      </SelectItem>
                      <SelectItem value='all'>{t('All statuses')}</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={caseRisk}
                    onValueChange={(value) => {
                      if (!value) return
                      setCaseRisk(value)
                      setCasePage(1)
                    }}
                  >
                    <SelectTrigger
                      className='w-36'
                      aria-label={t('Risk level')}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>
                        {t('All risk levels')}
                      </SelectItem>
                      <SelectItem value='high'>
                        {t('violation_risk.high')}
                      </SelectItem>
                      <SelectItem value='medium'>
                        {t('violation_risk.medium')}
                      </SelectItem>
                      <SelectItem value='low'>
                        {t('violation_risk.low')}
                      </SelectItem>
                      <SelectItem value='none'>
                        {t('violation_risk.none')}
                      </SelectItem>
                      <SelectItem value='unknown'>
                        {t('violation_risk.unknown')}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    className='max-w-xs'
                    value={caseKeyword}
                    onChange={(e) => {
                      setCaseKeyword(e.target.value)
                      setCasePage(1)
                    }}
                    placeholder={t('Search username, summary, or category...')}
                  />
                </div>

                {casesBody}
              </TabsContent>

              <TabsContent value='events' className='space-y-3 pt-2'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Select
                    value={eventPlugin}
                    onValueChange={(value) => {
                      if (!value) return
                      setEventPlugin(value)
                      setEventPage(1)
                    }}
                  >
                    <SelectTrigger
                      className='w-48'
                      aria-label={t('Plugin filter')}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>{t('All plugins')}</SelectItem>
                      <SelectItem value='request-filter'>
                        request-filter
                      </SelectItem>
                      <SelectItem value='llm-security-guard'>
                        llm-security-guard
                      </SelectItem>
                      <SelectItem value='content-moderation'>
                        content-moderation
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className='max-w-xs'
                    value={eventKeyword}
                    onChange={(e) => {
                      setEventKeyword(e.target.value)
                      setEventPage(1)
                    }}
                    placeholder={t('Search username, prompt text, or rule...')}
                  />
                </div>

                {eventsBody}
              </TabsContent>

              <TabsContent value='allowlist' className='space-y-3 pt-2'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <Input
                    className='max-w-xs'
                    value={allowlistKeyword}
                    onChange={(e) => {
                      setAllowlistKeyword(e.target.value)
                      setAllowlistPage(1)
                    }}
                    placeholder={t('Search username or reason...')}
                  />
                  <Button size='sm' onClick={() => setAddAllowlistOpen(true)}>
                    <Plus className='mr-1.5 size-4' />
                    {t('Add Account to Allowlist')}
                  </Button>
                </div>

                {allowlistBody}
              </TabsContent>
            </Tabs>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <CaseVerdictDialog
        caseId={selectedCaseId}
        open={selectedCaseId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCaseId(null)
        }}
        requestVerification={verification.requestVerification}
        onMutated={invalidateAll}
      />

      {isRoot && (
        <ViolationAuditSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onSaved={invalidateAll}
        />
      )}

      <Dialog open={addAllowlistOpen} onOpenChange={setAddAllowlistOpen}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>{t('Add Account to Allowlist')}</DialogTitle>
            <DialogDescription>
              {t(
                'Exempt a trusted user ID from automated violation screening.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='allowlist-user-id'>{t('User ID')}</Label>
              <Input
                id='allowlist-user-id'
                type='number'
                min={1}
                value={allowlistUserId}
                onChange={(e) => setAllowlistUserId(e.target.value)}
                placeholder='1001'
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='allowlist-reason'>{t('Reason')}</Label>
              <Input
                id='allowlist-reason'
                value={allowlistReason}
                onChange={(e) => setAllowlistReason(e.target.value)}
                placeholder={t('e.g., Authorized security researcher')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setAddAllowlistOpen(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              disabled={
                addAllowlistMutation.isPending ||
                !Number.isInteger(Number(allowlistUserId)) ||
                Number(allowlistUserId) < 1
              }
              onClick={() =>
                addAllowlistMutation.mutate({
                  user_id: Number(allowlistUserId),
                  reason: allowlistReason.trim(),
                })
              }
            >
              {t('Add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deletingEvent !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingEvent(null)
        }}
        title={t('Delete violation event')}
        desc={t(
          'Are you sure you want to permanently delete this captured violation record?'
        )}
        destructive
        isLoading={deleteEventMutation.isPending}
        handleConfirm={() => {
          if (deletingEvent) deleteEventMutation.mutate(deletingEvent.id)
        }}
      />

      <ConfirmDialog
        open={removingAllowlist !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingAllowlist(null)
        }}
        title={t('Remove from allowlist')}
        desc={t(
          'Future violation hits from {{username}} will count toward risk screening again.',
          {
            username:
              removingAllowlist?.username || `#${removingAllowlist?.user_id}`,
          }
        )}
        isLoading={removeAllowlistMutation.isPending}
        handleConfirm={() => {
          if (removingAllowlist) {
            removeAllowlistMutation.mutate(removingAllowlist.user_id)
          }
        }}
      />

      <SecureVerificationDialog {...verification.dialogProps} />
    </>
  )
}
