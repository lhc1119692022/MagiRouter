import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type {
  RequestVerificationOptions,
  SecurityProof,
} from '@/features/auth/secure-verification'
import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'
import { AuthOperationError } from '@/lib/secure-verification'

import {
  getViolationCaseDetail,
  runViolationCaseAudit,
  submitViolationCaseVerdict,
} from '../api'
import { caseStatusBadgeVariant, riskBadgeVariant } from '../lib/badges'
import { HighlightedExcerpt } from '../lib/highlight'
import type { ViolationVerdictDecision } from '../types'

function formatTimestamp(ts: number): string {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleString()
}

interface CaseVerdictDialogProps {
  caseId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  requestVerification: (
    options: RequestVerificationOptions
  ) => Promise<SecurityProof | null>
  onMutated: () => void
}

export function CaseVerdictDialog(props: CaseVerdictDialogProps) {
  const { caseId, open, onOpenChange, requestVerification, onMutated } = props
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [submittingDecision, setSubmittingDecision] =
    useState<ViolationVerdictDecision | null>(null)

  const detailQuery = useQuery({
    queryKey: ['violation-audit', 'case-detail', caseId],
    queryFn: () => {
      if (caseId === null) {
        return Promise.reject(new Error('Invalid case ID'))
      }
      return getViolationCaseDetail(caseId)
    },
    enabled: open && caseId !== null,
  })

  const auditMutation = useMutation({
    mutationFn: () => {
      if (caseId === null) {
        return Promise.reject(new Error('Invalid case ID'))
      }
      return runViolationCaseAudit(caseId)
    },
    onSuccess: () => {
      toast.success(t('Account audit completed'))
      void queryClient.invalidateQueries({
        queryKey: ['violation-audit', 'case-detail', caseId],
      })
      onMutated()
    },
    onError: (error) => {
      handleServerError(error, t('Failed to run account audit'))
    },
  })

  const handleVerdict = async (decision: ViolationVerdictDecision) => {
    const accountCase = detailQuery.data?.case
    if (!accountCase) return
    setSubmittingDecision(decision)
    try {
      let proofToken: string | undefined
      if (decision === 'ban') {
        const proof = await requestVerification({
          scope: 'admin.user.manage',
          context: { user_id: accountCase.user_id, action: 'disable' },
          title: t('Verify to ban user'),
          description: t(
            'Confirm your identity before banning the account {{username}}.',
            { username: accountCase.username || `#${accountCase.user_id}` }
          ),
        })
        if (!proof) return
        proofToken = proof.proof_token
      }
      await submitViolationCaseVerdict(
        accountCase.id,
        { decision, note: note.trim() },
        proofToken
      )
      const messageMap: Record<ViolationVerdictDecision, string> = {
        ban: t('Account banned and verdict recorded'),
        dismiss: t('Case dismissed as false positive'),
        allowlist: t('Account added to violation audit allowlist'),
      }
      toast.success(messageMap[decision])
      setNote('')
      void queryClient.invalidateQueries({
        queryKey: ['violation-audit', 'case-detail', caseId],
      })
      onMutated()
      onOpenChange(false)
    } catch (error) {
      handleServerError(
        AuthOperationError.from(error),
        t('Failed to submit verdict')
      )
    } finally {
      setSubmittingDecision(null)
    }
  }

  const accountCase = detailQuery.data?.case
  const events = detailQuery.data?.events ?? []
  const isOpenCase =
    accountCase?.status === 'pending_audit' ||
    accountCase?.status === 'pending_verdict'
  const isRootTarget = (accountCase?.user_role ?? 0) >= ROLE.SUPER_ADMIN
  const isAlreadyDisabled = accountCase?.user_status === 2

  let dialogBody = null
  if (detailQuery.isLoading) {
    dialogBody = <LoadingState />
  } else if (detailQuery.isError || !accountCase) {
    dialogBody = (
      <ErrorState
        description={t('Failed to load violation case details')}
        onRetry={() => void detailQuery.refetch()}
      />
    )
  } else {
    dialogBody = (
      <div className='min-h-0 flex-1 overflow-y-auto pr-2'>
        <div className='space-y-4 pb-2'>
          <div className='bg-muted/40 grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm sm:grid-cols-4'>
            <div>
              <div className='text-muted-foreground text-xs'>
                {t('Hits in window')}
              </div>
              <div className='font-semibold'>
                {accountCase.hit_count} / {accountCase.window_hours}h
              </div>
            </div>
            <div>
              <div className='text-muted-foreground text-xs'>
                {t('AI Risk Level')}
              </div>
              <div className='mt-0.5 flex items-center gap-1.5'>
                <Badge variant={riskBadgeVariant(accountCase.risk_level)}>
                  {t(`violation_risk.${accountCase.risk_level}`)}
                </Badge>
                {accountCase.audited_at > 0 && (
                  <span className='text-muted-foreground text-xs'>
                    {accountCase.risk_score}/100
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className='text-muted-foreground text-xs'>
                {t('First violation')}
              </div>
              <div className='text-xs'>
                {formatTimestamp(accountCase.first_violation_at)}
              </div>
            </div>
            <div>
              <div className='text-muted-foreground text-xs'>
                {t('Latest violation')}
              </div>
              <div className='text-xs'>
                {formatTimestamp(accountCase.last_violation_at)}
              </div>
            </div>
          </div>

          <div className='space-y-3 rounded-lg border p-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='flex items-center gap-2 font-medium'>
                <Sparkles className='text-primary size-4' aria-hidden='true' />
                <span>{t('AI Comprehensive Assessment')}</span>
                {accountCase.audit_model && (
                  <Badge variant='outline' className='font-mono text-xs'>
                    {accountCase.audit_model}
                  </Badge>
                )}
                {accountCase.needs_reaudit && (
                  <Badge variant='secondary'>
                    {t('New hits since last audit')}
                  </Badge>
                )}
              </div>
              {isOpenCase && (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={auditMutation.isPending}
                  onClick={() => auditMutation.mutate()}
                >
                  {auditMutation.isPending ? (
                    <Loader2 className='mr-1.5 size-3.5 animate-spin' />
                  ) : (
                    <Sparkles className='mr-1.5 size-3.5' />
                  )}
                  {accountCase.audited_at > 0
                    ? t('Re-run AI Audit')
                    : t('Run AI Audit Now')}
                </Button>
              )}
            </div>

            {accountCase.audit_status === 'failed' &&
              accountCase.audit_error && (
                <Alert variant='destructive'>
                  <AlertTriangle className='size-4' />
                  <AlertDescription>{accountCase.audit_error}</AlertDescription>
                </Alert>
              )}

            {accountCase.audited_at > 0 && accountCase.summary ? (
              <div className='space-y-2.5 text-sm'>
                <div className='flex flex-wrap items-center gap-2 text-xs'>
                  <span className='text-muted-foreground'>
                    {t('Recommended action')}:
                  </span>
                  <Badge variant='outline'>
                    {t(
                      `violation_recommend.${accountCase.recommended_action || 'review'}`
                    )}
                  </Badge>
                  {accountCase.category && (
                    <>
                      <span className='text-muted-foreground'>
                        {t('Category')}:
                      </span>
                      <Badge variant='secondary'>{accountCase.category}</Badge>
                    </>
                  )}
                  <span className='text-muted-foreground ml-auto'>
                    {formatTimestamp(accountCase.audited_at)}
                  </span>
                </div>
                <p className='leading-relaxed whitespace-pre-wrap'>
                  {accountCase.summary}
                </p>
                {accountCase.evidence_quotes.length > 0 && (
                  <div className='space-y-1.5 pt-1'>
                    <div className='text-muted-foreground text-xs font-medium'>
                      {t('Verified evidence quotes')}
                    </div>
                    <div className='space-y-1.5'>
                      {accountCase.evidence_quotes.map((item) => (
                        <div
                          key={`${item.event_id}-${item.quote}`}
                          className='rounded border border-amber-300/60 bg-amber-50/70 px-2.5 py-1.5 text-xs dark:border-amber-500/30 dark:bg-amber-950/20'
                        >
                          <div className='font-mono font-medium'>
                            #{item.event_id}: “{item.quote}”
                          </div>
                          {item.note && (
                            <div className='text-muted-foreground mt-0.5'>
                              {item.note}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className='text-muted-foreground text-sm'>
                {t(
                  'This account has not been audited by the AI model yet. Wait for the scheduled audit or click "Run AI Audit Now".'
                )}
              </p>
            )}
          </div>

          <div className='space-y-2'>
            <div className='text-sm font-medium'>
              {t('Captured Violation Evidence')} ({events.length})
            </div>
            {events.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {t('No captured violation events available for this case.')}
              </p>
            ) : (
              <div className='space-y-2.5'>
                {events.map((event) => {
                  const quotesForEvent = accountCase.evidence_quotes
                    .filter((quote) => quote.event_id === event.id)
                    .map((quote) => quote.quote)
                  return (
                    <div
                      key={event.id}
                      className='space-y-2 rounded-lg border p-3 text-xs'
                    >
                      <div className='flex flex-wrap items-center gap-1.5'>
                        <Badge variant='outline' className='font-mono'>
                          #{event.id}
                        </Badge>
                        <Badge variant='secondary'>{event.plugin}</Badge>
                        {event.category && (
                          <Badge variant='outline'>{event.category}</Badge>
                        )}
                        {event.model && (
                          <span className='text-muted-foreground font-mono'>
                            {event.model}
                          </span>
                        )}
                        <span className='text-muted-foreground ml-auto'>
                          {formatTimestamp(event.created_at)}
                        </span>
                      </div>
                      {event.message && (
                        <div className='text-muted-foreground'>
                          {t('Block reason')}: {event.message}
                          {event.rule_id ? ` (${event.rule_id})` : ''}
                        </div>
                      )}
                      <pre className='bg-muted/50 max-h-48 overflow-auto rounded p-2.5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap'>
                        {event.prompt_excerpt ? (
                          <HighlightedExcerpt
                            text={event.prompt_excerpt}
                            quotes={quotesForEvent}
                          />
                        ) : (
                          t('No text content extracted')
                        )}
                      </pre>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {isOpenCase ? (
            <div className='space-y-3 rounded-lg border p-4'>
              <div className='space-y-1.5'>
                <Label htmlFor='violation-verdict-note'>
                  {t('Human Verdict Note')}
                </Label>
                <Textarea
                  id='violation-verdict-note'
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t(
                    'Record the reason for banning, dismissing, or allowlisting this account...'
                  )}
                />
              </div>
              <div className='flex flex-wrap items-center justify-end gap-2'>
                <Button
                  variant='outline'
                  disabled={submittingDecision !== null}
                  onClick={() => void handleVerdict('allowlist')}
                >
                  <ShieldCheck className='mr-1.5 size-4' />
                  {t('Add to Allowlist')}
                </Button>
                <Button
                  variant='secondary'
                  disabled={submittingDecision !== null}
                  onClick={() => void handleVerdict('dismiss')}
                >
                  <CheckCircle2 className='mr-1.5 size-4' />
                  {t('Dismiss (False Positive)')}
                </Button>
                <Button
                  variant='destructive'
                  disabled={
                    submittingDecision !== null ||
                    isRootTarget ||
                    isAlreadyDisabled
                  }
                  onClick={() => void handleVerdict('ban')}
                >
                  <Ban className='mr-1.5 size-4' />
                  {t('Confirm Violation & Ban')}
                </Button>
              </div>
            </div>
          ) : (
            <div className='bg-muted/30 space-y-1 rounded-lg border p-3 text-sm'>
              <div className='font-medium'>
                {t('Verdict Recorded')}:{' '}
                {t(`violation_case_status.${accountCase.status}`)}
              </div>
              <div className='text-muted-foreground text-xs'>
                {t('Decided by')}: {accountCase.decided_by_username || '-'} ·{' '}
                {formatTimestamp(accountCase.decided_at)}
              </div>
              {accountCase.verdict_note && (
                <div className='text-sm'>{accountCase.verdict_note}</div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[90vh] max-w-4xl flex-col overflow-hidden'>
        <DialogHeader>
          <DialogTitle className='flex flex-wrap items-center gap-2'>
            <span>{t('Account Audit & Human Verdict')}</span>
            {accountCase && (
              <>
                <Badge variant='outline'>
                  {accountCase.username || `ID #${accountCase.user_id}`} (ID:{' '}
                  {accountCase.user_id})
                </Badge>
                <Badge variant={caseStatusBadgeVariant(accountCase.status)}>
                  {t(`violation_case_status.${accountCase.status}`)}
                </Badge>
                {isAlreadyDisabled && (
                  <Badge variant='destructive'>{t('Account disabled')}</Badge>
                )}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Review AI findings alongside verbatim blocked prompts, then decide whether to ban, dismiss, or allowlist the account.'
            )}
          </DialogDescription>
        </DialogHeader>

        {dialogBody}
      </DialogContent>
    </Dialog>
  )
}
