import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Cloud,
  Database,
  Gauge,
  HardDrive,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { GroupBadge } from '@/components/group-badge'
import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatCard } from '@/features/dashboard/components/ui/stat-card'
import {
  deleteMediaTrafficOverride,
  resetUserMediaDailyTraffic,
  upsertMediaTrafficOverride,
} from '@/features/system-settings/media-relay/api'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  getAdminMediaTrafficAnalytics,
  listAdminMediaTrafficObjects,
  listAdminMediaTrafficOverrides,
} from './api'
import {
  MediaOverrideDialog,
  type MediaOverrideTarget,
} from './components/media-override-dialog'
import { MediaTrafficTrendChart } from './components/media-traffic-trend-chart'

const RANGE_OPTIONS = [7, 14, 30, 90] as const
const BYTES_PER_MIB = 1024 * 1024
const PAGE_SIZE = 20

function formatBytes(bytes: number, locale: string | undefined): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let val = bytes
  let idx = 0
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024
    idx++
  }
  const digits = idx <= 1 ? 0 : 2
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(val)} ${units[idx]}`
}

function formatDateTime(
  unixSeconds: number,
  locale: string | undefined
): string {
  if (!unixSeconds || unixSeconds <= 0) return '-'
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(unixSeconds * 1000))
}

function quotaBarClass(percent: number): string {
  if (percent >= 100) return 'bg-destructive'
  if (percent >= 80) return 'bg-amber-500'
  return 'bg-sky-500'
}

function objectStatusVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'ready') return 'secondary'
  if (status === 'aborted') return 'destructive'
  return 'outline'
}

export function MediaTraffic() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const isRoot = useAuthStore(
    (state) => (state.auth.user?.role ?? 0) >= ROLE.SUPER_ADMIN
  )

  const [days, setDays] = useState<number>(30)
  const [activeTab, setActiveTab] = useState<'users' | 'objects' | 'overrides'>(
    'users'
  )
  const [userKeyword, setUserKeyword] = useState('')

  // Objects tab filters
  const [objStatus, setObjStatus] = useState('all')
  const [objCategory, setObjCategory] = useState('all')
  const [objKeyword, setObjKeyword] = useState('')
  const [objPage, setObjPage] = useState(1)

  // Overrides tab filter
  const [overrideKeyword, setOverrideKeyword] = useState('')

  // Action dialogs (Root only)
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false)
  const [overrideTarget, setOverrideTarget] =
    useState<MediaOverrideTarget | null>(null)
  const [resetUserTarget, setResetUserTarget] = useState<{
    userId: number
    username: string
  } | null>(null)
  const [deleteOverrideTarget, setDeleteOverrideTarget] = useState<{
    userId: number
    username: string
  } | null>(null)

  const analyticsQuery = useQuery({
    queryKey: ['media-traffic', 'analytics', days],
    queryFn: () => getAdminMediaTrafficAnalytics({ days }),
  })

  const objectsQuery = useQuery({
    queryKey: [
      'media-traffic',
      'objects',
      objStatus,
      objCategory,
      objKeyword,
      objPage,
    ],
    queryFn: () =>
      listAdminMediaTrafficObjects({
        p: objPage,
        page_size: PAGE_SIZE,
        status: objStatus === 'all' ? undefined : objStatus,
        category: objCategory === 'all' ? undefined : objCategory,
        keyword: objKeyword.trim() || undefined,
      }),
    enabled: activeTab === 'objects',
  })

  const overridesQuery = useQuery({
    queryKey: ['media-traffic', 'overrides', overrideKeyword],
    queryFn: () => listAdminMediaTrafficOverrides(overrideKeyword),
    enabled: activeTab === 'overrides',
  })

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['media-traffic'] })
    void queryClient.invalidateQueries({ queryKey: ['media-relay-overrides'] })
  }

  const upsertOverrideMutation = useMutation({
    mutationFn: (payload: {
      userId: number
      extra_daily_mb: number
      expires_at: number
      note: string
    }) =>
      upsertMediaTrafficOverride(payload.userId, {
        extra_daily_mb: payload.extra_daily_mb,
        expires_at: payload.expires_at,
        note: payload.note,
      }),
    onSuccess: () => {
      toast.success(t('Targeted traffic override saved'))
      setOverrideDialogOpen(false)
      setOverrideTarget(null)
      invalidateAll()
    },
    onError: (error) => {
      handleServerError(error, t('Failed to save targeted traffic override'))
    },
  })

  const resetUsageMutation = useMutation({
    mutationFn: (userId: number) => resetUserMediaDailyTraffic(userId),
    onSuccess: () => {
      toast.success(t('Daily media traffic reset'))
      setResetUserTarget(null)
      invalidateAll()
    },
    onError: (error) => {
      handleServerError(error, t('Failed to reset daily media traffic'))
    },
  })

  const deleteOverrideMutation = useMutation({
    mutationFn: (userId: number) => deleteMediaTrafficOverride(userId),
    onSuccess: () => {
      toast.success(t('Targeted traffic override removed'))
      setDeleteOverrideTarget(null)
      invalidateAll()
    },
    onError: (error) => {
      handleServerError(error, t('Failed to remove targeted traffic override'))
    },
  })

  const report = analyticsQuery.data
  const config = report?.config
  const summary = report?.summary

  const filteredUsers = useMemo(() => {
    const list = report?.top_users ?? []
    const needle = userKeyword.trim().toLowerCase()
    if (!needle) return list
    return list.filter(
      (item) =>
        item.username.toLowerCase().includes(needle) ||
        item.display_name.toLowerCase().includes(needle) ||
        String(item.user_id).includes(needle) ||
        item.group.toLowerCase().includes(needle)
    )
  }, [report?.top_users, userKeyword])

  const dailySparkline = useMemo(
    () => (report?.daily_trend ?? []).map((item) => item.used_bytes),
    [report?.daily_trend]
  )

  const uploadsSparkline = useMemo(
    () => (report?.daily_trend ?? []).map((item) => item.upload_count),
    [report?.daily_trend]
  )

  const categoryLabel = (category: string): string => {
    if (category === 'image') return t('Images')
    if (category === 'video') return t('Videos')
    if (category === 'audio') return t('Audio')
    if (category === 'document') return t('Documents')
    return t('Other')
  }

  const statusLabel = (status: string): string => {
    if (status === 'ready') return t('Ready')
    if (status === 'pending') return t('Pending')
    if (status === 'aborted') return t('Aborted')
    return status
  }

  const totalObjectPages = Math.max(
    1,
    Math.ceil((objectsQuery.data?.total ?? 0) / PAGE_SIZE)
  )

  const refreshAll = () => {
    void analyticsQuery.refetch()
    if (activeTab === 'objects') void objectsQuery.refetch()
    if (activeTab === 'overrides') void overridesQuery.refetch()
  }

  let relayStatusBadge = null
  if (config) {
    if (config.is_ready) {
      relayStatusBadge = <Badge variant='secondary'>{t('Relay active')}</Badge>
    } else if (config.enabled) {
      relayStatusBadge = (
        <Badge variant='destructive'>{t('Relay incomplete')}</Badge>
      )
    } else {
      relayStatusBadge = <Badge variant='outline'>{t('Relay disabled')}</Badge>
    }
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <div className='flex flex-wrap items-center gap-2'>
          <span>{t('Media Traffic')}</span>
          {relayStatusBadge}
        </div>
      </SectionPageLayout.Title>

      <SectionPageLayout.Actions>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='bg-muted/60 inline-flex items-center rounded-md border p-0.5'>
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option}
                type='button'
                size='sm'
                variant={days === option ? 'secondary' : 'ghost'}
                className='h-7 px-2.5 text-xs'
                onClick={() => setDays(option)}
              >
                {t('{{days}}d', { days: option })}
              </Button>
            ))}
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={refreshAll}
            disabled={analyticsQuery.isFetching}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${analyticsQuery.isFetching ? 'animate-spin' : ''}`}
            />
            {t('Refresh')}
          </Button>
          {isRoot && (
            <Button
              variant='outline'
              size='sm'
              render={
                <Link
                  to='/system-settings/operations/$section'
                  params={{ section: 'media-relay' }}
                />
              }
            >
              <Settings2 className='mr-1.5 h-3.5 w-3.5' />
              {t('Relay settings')}
            </Button>
          )}
        </div>
      </SectionPageLayout.Actions>

      <SectionPageLayout.Content>
        {analyticsQuery.isError ? (
          <ErrorState
            title={t('Failed to load media traffic analytics')}
            onRetry={() => void analyticsQuery.refetch()}
          />
        ) : (
          <div className='space-y-5'>
            {config && (
              <Card>
                <CardContent className='flex flex-wrap items-center justify-between gap-3 py-3 text-xs'>
                  <div className='flex flex-wrap items-center gap-x-4 gap-y-1.5'>
                    <span className='flex items-center gap-1.5 font-medium'>
                      <Cloud className='text-muted-foreground h-3.5 w-3.5' />
                      {config.provider === 'aliyun-oss'
                        ? t('Aliyun OSS')
                        : t('S3 Compatible')}
                      {config.bucket ? ` · ${config.bucket}` : ''}
                      {config.region ? ` (${config.region})` : ''}
                    </span>
                    <span className='text-muted-foreground'>
                      {t('Base daily quota')}:{' '}
                      <strong className='text-foreground'>
                        {formatNumber(config.default_daily_traffic_mb, locale)}{' '}
                        MB
                      </strong>
                    </span>
                    <span className='text-muted-foreground'>
                      {t('Max file size')}:{' '}
                      <strong className='text-foreground'>
                        {formatNumber(config.max_file_size_mb, locale)} MB
                      </strong>
                    </span>
                    <span className='text-muted-foreground'>
                      {t('Retention')}:{' '}
                      <strong className='text-foreground'>
                        {t('{{days}}d', { days: config.retention_days })}
                      </strong>
                    </span>
                    {config.active_global_temp_bonus_mb > 0 && (
                      <Badge variant='secondary'>
                        {t('Global temp bonus')}: +
                        {formatNumber(
                          config.active_global_temp_bonus_mb,
                          locale
                        )}{' '}
                        MB
                      </Badge>
                    )}
                  </div>
                  <span className='text-muted-foreground tabular-nums'>
                    {t('Next daily reset')}:{' '}
                    {formatDateTime(config.reset_at, locale)}
                  </span>
                </CardContent>
              </Card>
            )}

            <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
              <StatCard
                title={t("Today's media traffic")}
                value={
                  summary ? formatBytes(summary.today_used_bytes, locale) : '-'
                }
                description={
                  summary
                    ? `${t('Yesterday')}: ${formatBytes(summary.yesterday_used_bytes, locale)}`
                    : ''
                }
                icon={UploadCloud}
                tone='accent-1'
                loading={analyticsQuery.isLoading}
                sparkline={uploadsSparkline}
                sparklineVariant='bars'
                details={
                  summary
                    ? [
                        {
                          label: t("Today's uploads"),
                          value: formatNumber(
                            summary.today_upload_count,
                            locale
                          ),
                        },
                        {
                          label: t('Active users today'),
                          value: formatNumber(
                            summary.today_active_users,
                            locale
                          ),
                        },
                      ]
                    : undefined
                }
              />

              <StatCard
                title={t('Range total traffic')}
                value={
                  summary ? formatBytes(summary.range_used_bytes, locale) : '-'
                }
                description={t('Last {{days}} days cumulative', { days })}
                icon={Database}
                tone='accent-2'
                loading={analyticsQuery.isLoading}
                sparkline={dailySparkline}
                sparklineVariant='line'
                details={
                  summary
                    ? [
                        {
                          label: t('Daily average'),
                          value: formatBytes(summary.avg_daily_bytes, locale),
                        },
                        {
                          label: t('Peak day'),
                          value: summary.peak_date
                            ? `${formatBytes(summary.peak_daily_bytes, locale)} (${summary.peak_date.slice(5)})`
                            : '-',
                        },
                        {
                          label: t('Range uploads'),
                          value: formatNumber(
                            summary.range_upload_count,
                            locale
                          ),
                        },
                      ]
                    : undefined
                }
              />

              <StatCard
                title={t('Active stored footprint')}
                value={
                  summary
                    ? formatBytes(summary.active_objects_bytes, locale)
                    : '-'
                }
                description={t('Ready non-expired objects on storage')}
                icon={HardDrive}
                tone='accent-3'
                loading={analyticsQuery.isLoading}
                details={
                  summary
                    ? [
                        {
                          label: t('Active objects'),
                          value: formatNumber(
                            summary.active_objects_count,
                            locale
                          ),
                        },
                        {
                          label: t('Ready / Pending'),
                          value: `${formatNumber(summary.ready_objects_count, locale)} / ${formatNumber(summary.pending_objects_count, locale)}`,
                        },
                        {
                          label: t('Aborted in range'),
                          value: formatNumber(
                            summary.aborted_objects_count,
                            locale
                          ),
                        },
                      ]
                    : undefined
                }
              />

              <StatCard
                title={t('Quota & overrides')}
                value={
                  summary
                    ? formatNumber(summary.active_overrides_count, locale)
                    : '-'
                }
                description={t('Active targeted user quota overrides')}
                icon={Gauge}
                tone='accent-1'
                loading={analyticsQuery.isLoading}
                details={
                  summary
                    ? [
                        {
                          label: t('Near daily limit (>=80%)'),
                          value: formatNumber(
                            summary.near_limit_users_count,
                            locale
                          ),
                          tone:
                            summary.near_limit_users_count > 0
                              ? 'warning'
                              : 'default',
                        },
                        {
                          label: t('Active uploaders in range'),
                          value: formatNumber(
                            summary.range_active_users,
                            locale
                          ),
                        },
                      ]
                    : undefined
                }
              />
            </div>

            <div className='grid gap-4 lg:grid-cols-12'>
              <Card className='lg:col-span-8'>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-base'>
                    {t('Daily media transfer trend')}
                  </CardTitle>
                  <CardDescription>
                    {t(
                      'Daily uploaded volume (MB) and upload count across the selected window.'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <MediaTrafficTrendChart data={report?.daily_trend ?? []} />
                </CardContent>
              </Card>

              <Card className='lg:col-span-4'>
                <CardHeader className='pb-3'>
                  <CardTitle className='text-base'>
                    {t('Content type distribution')}
                  </CardTitle>
                  <CardDescription>
                    {t('Non-aborted uploads grouped by MIME category.')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(report?.content_types.length ?? 0) === 0 ? (
                    <EmptyState
                      className='min-h-[220px]'
                      title={t('No uploaded objects in this period')}
                    />
                  ) : (
                    <div className='space-y-3.5'>
                      {report?.content_types.map((item) => (
                        <div key={item.category} className='space-y-1.5'>
                          <div className='flex items-center justify-between text-sm'>
                            <span className='font-medium'>
                              {categoryLabel(item.category)}
                            </span>
                            <span className='text-muted-foreground text-xs tabular-nums'>
                              {formatBytes(item.total_bytes, locale)} ·{' '}
                              {formatNumber(item.count, locale)} (
                              {new Intl.NumberFormat(locale, {
                                maximumFractionDigits: 1,
                              }).format(item.share_percent)}
                              %)
                            </span>
                          </div>
                          <div className='bg-muted h-2 w-full overflow-hidden rounded-full'>
                            <div
                              className='h-full rounded-full bg-sky-500 transition-all'
                              style={{
                                width: `${Math.min(100, Math.max(2, item.share_percent))}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3 pb-3'>
                <Tabs
                  value={activeTab}
                  onValueChange={(value) =>
                    setActiveTab(value as 'users' | 'objects' | 'overrides')
                  }
                >
                  <TabsList>
                    <TabsTrigger value='users'>
                      {t('User traffic ranking')} (
                      {report?.top_users.length ?? 0})
                    </TabsTrigger>
                    <TabsTrigger value='objects'>
                      {t('Uploaded objects')}
                    </TabsTrigger>
                    <TabsTrigger value='overrides'>
                      {t('Targeted overrides')} (
                      {summary?.active_overrides_count ?? 0})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                {activeTab === 'users' && (
                  <div className='relative w-full sm:w-64'>
                    <Search className='text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 h-4 w-4' />
                    <Input
                      value={userKeyword}
                      onChange={(event) => setUserKeyword(event.target.value)}
                      placeholder={t('Filter users by name, ID, group...')}
                      className='h-9 pl-8'
                    />
                  </div>
                )}
                {activeTab === 'overrides' && (
                  <div className='flex flex-wrap items-center gap-2'>
                    <div className='relative w-56'>
                      <Search className='text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 h-4 w-4' />
                      <Input
                        value={overrideKeyword}
                        onChange={(event) =>
                          setOverrideKeyword(event.target.value)
                        }
                        placeholder={t('Filter overrides...')}
                        className='h-9 pl-8'
                      />
                    </div>
                    {isRoot && (
                      <Button
                        type='button'
                        size='sm'
                        onClick={() => {
                          setOverrideTarget(null)
                          setOverrideDialogOpen(true)
                        }}
                      >
                        <Plus className='mr-1 h-3.5 w-3.5' />
                        {t('Add override')}
                      </Button>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <Tabs
                  value={activeTab}
                  onValueChange={(value) =>
                    setActiveTab(value as 'users' | 'objects' | 'overrides')
                  }
                >
                  <TabsContent value='users' className='mt-0'>
                    {filteredUsers.length === 0 ? (
                      <EmptyState
                        className='min-h-[200px]'
                        title={t('No user media traffic found')}
                      />
                    ) : (
                      <div className='overflow-x-auto'>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('User')}</TableHead>
                              <TableHead>{t('Group')}</TableHead>
                              <TableHead>{t("Today's quota usage")}</TableHead>
                              <TableHead className='text-right'>
                                {t('Range traffic')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Range uploads')}
                              </TableHead>
                              <TableHead>{t('Targeted bonus')}</TableHead>
                              {isRoot && (
                                <TableHead className='text-right'>
                                  {t('Actions')}
                                </TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredUsers.map((user) => (
                              <TableRow key={user.user_id}>
                                <TableCell>
                                  <div className='font-medium'>
                                    {user.username || `#${user.user_id}`}
                                  </div>
                                  <div className='text-muted-foreground text-xs'>
                                    ID: {user.user_id}
                                    {user.display_name
                                      ? ` · ${user.display_name}`
                                      : ''}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <GroupBadge group={user.group} />
                                </TableCell>
                                <TableCell className='min-w-[200px]'>
                                  <div className='flex items-center justify-between text-xs tabular-nums'>
                                    <span>
                                      {formatBytes(
                                        user.today_used_bytes,
                                        locale
                                      )}{' '}
                                      /{' '}
                                      {formatBytes(
                                        user.effective_daily_bytes,
                                        locale
                                      )}
                                    </span>
                                    <span className='text-muted-foreground'>
                                      {new Intl.NumberFormat(locale, {
                                        maximumFractionDigits: 1,
                                      }).format(user.today_usage_percent)}
                                      %
                                    </span>
                                  </div>
                                  <div className='bg-muted mt-1 h-1.5 w-full overflow-hidden rounded-full'>
                                    <div
                                      className={`h-full rounded-full ${quotaBarClass(user.today_usage_percent)}`}
                                      style={{
                                        width: `${Math.min(100, Math.max(0, user.today_usage_percent))}%`,
                                      }}
                                    />
                                  </div>
                                </TableCell>
                                <TableCell className='text-right font-medium tabular-nums'>
                                  {formatBytes(user.range_used_bytes, locale)}
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  {formatNumber(
                                    user.range_upload_count,
                                    locale
                                  )}
                                </TableCell>
                                <TableCell>
                                  {user.active_override_bytes > 0 ? (
                                    <div>
                                      <Badge variant='secondary'>
                                        +
                                        {formatBytes(
                                          user.active_override_bytes,
                                          locale
                                        )}
                                      </Badge>
                                      {user.override_note && (
                                        <div className='text-muted-foreground mt-0.5 text-xs'>
                                          {user.override_note}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className='text-muted-foreground text-xs'>
                                      -
                                    </span>
                                  )}
                                </TableCell>
                                {isRoot && (
                                  <TableCell className='text-right'>
                                    <div className='flex justify-end gap-1'>
                                      <Button
                                        type='button'
                                        variant='ghost'
                                        size='sm'
                                        onClick={() => {
                                          setOverrideTarget({
                                            userId: user.user_id,
                                            username: user.username,
                                            displayName: user.display_name,
                                            extraDailyMB: Math.round(
                                              user.active_override_bytes /
                                                BYTES_PER_MIB
                                            ),
                                            expiresAt: user.override_expires_at,
                                            note: user.override_note,
                                          })
                                          setOverrideDialogOpen(true)
                                        }}
                                      >
                                        {t('Adjust quota')}
                                      </Button>
                                      <Button
                                        type='button'
                                        variant='ghost'
                                        size='sm'
                                        disabled={user.today_used_bytes <= 0}
                                        onClick={() =>
                                          setResetUserTarget({
                                            userId: user.user_id,
                                            username:
                                              user.username ||
                                              `#${user.user_id}`,
                                          })
                                        }
                                      >
                                        <RotateCcw className='mr-1 h-3.5 w-3.5' />
                                        {t('Reset today')}
                                      </Button>
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value='objects' className='mt-0 space-y-4'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <NativeSelect
                        value={objStatus}
                        onChange={(event) => {
                          setObjStatus(event.target.value)
                          setObjPage(1)
                        }}
                        className='w-36'
                      >
                        <NativeSelectOption value='all'>
                          {t('All statuses')}
                        </NativeSelectOption>
                        <NativeSelectOption value='ready'>
                          {t('Ready')}
                        </NativeSelectOption>
                        <NativeSelectOption value='pending'>
                          {t('Pending')}
                        </NativeSelectOption>
                        <NativeSelectOption value='aborted'>
                          {t('Aborted')}
                        </NativeSelectOption>
                      </NativeSelect>

                      <NativeSelect
                        value={objCategory}
                        onChange={(event) => {
                          setObjCategory(event.target.value)
                          setObjPage(1)
                        }}
                        className='w-36'
                      >
                        <NativeSelectOption value='all'>
                          {t('All types')}
                        </NativeSelectOption>
                        <NativeSelectOption value='image'>
                          {t('Images')}
                        </NativeSelectOption>
                        <NativeSelectOption value='video'>
                          {t('Videos')}
                        </NativeSelectOption>
                        <NativeSelectOption value='audio'>
                          {t('Audio')}
                        </NativeSelectOption>
                        <NativeSelectOption value='document'>
                          {t('Documents')}
                        </NativeSelectOption>
                        <NativeSelectOption value='other'>
                          {t('Other')}
                        </NativeSelectOption>
                      </NativeSelect>

                      <div className='relative min-w-[220px] flex-1 sm:max-w-xs'>
                        <Search className='text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 h-4 w-4' />
                        <Input
                          value={objKeyword}
                          onChange={(event) => {
                            setObjKeyword(event.target.value)
                            setObjPage(1)
                          }}
                          placeholder={t('File name, object key, user...')}
                          className='h-9 pl-8'
                        />
                      </div>
                    </div>

                    {objectsQuery.isError && (
                      <ErrorState
                        title={t('Failed to load uploaded objects')}
                        onRetry={() => void objectsQuery.refetch()}
                      />
                    )}
                    {!objectsQuery.isError &&
                      (objectsQuery.data?.items.length ?? 0) === 0 && (
                        <EmptyState
                          className='min-h-[200px]'
                          title={t('No matching media objects')}
                        />
                      )}
                    {!objectsQuery.isError &&
                      (objectsQuery.data?.items.length ?? 0) > 0 && (
                        <>
                          <div className='overflow-x-auto'>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>{t('File')}</TableHead>
                                  <TableHead>{t('User')}</TableHead>
                                  <TableHead>{t('Type')}</TableHead>
                                  <TableHead className='text-right'>
                                    {t('Size')}
                                  </TableHead>
                                  <TableHead>{t('Status')}</TableHead>
                                  <TableHead className='text-right'>
                                    {t('Uploaded at')}
                                  </TableHead>
                                  <TableHead className='text-right'>
                                    {t('Expires at')}
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {objectsQuery.data?.items.map((obj) => (
                                  <TableRow key={obj.id}>
                                    <TableCell className='max-w-[260px]'>
                                      <div
                                        className='truncate font-medium'
                                        title={obj.file_name || obj.object_key}
                                      >
                                        {obj.file_name || obj.object_key}
                                      </div>
                                      <div
                                        className='text-muted-foreground truncate font-mono text-[11px]'
                                        title={obj.object_key}
                                      >
                                        {obj.object_key}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className='font-medium'>
                                        {obj.username || `#${obj.user_id}`}
                                      </div>
                                      <div className='text-muted-foreground text-xs'>
                                        {obj.group}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant='outline'>
                                        {categoryLabel(obj.category)}
                                      </Badge>
                                      <div className='text-muted-foreground mt-0.5 text-[11px]'>
                                        {obj.content_type || '-'}
                                      </div>
                                    </TableCell>
                                    <TableCell className='text-right font-medium tabular-nums'>
                                      {formatBytes(obj.size_bytes, locale)}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant={objectStatusVariant(
                                          obj.status
                                        )}
                                      >
                                        {statusLabel(obj.status)}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className='text-muted-foreground text-right text-xs tabular-nums'>
                                      {formatDateTime(obj.created_at, locale)}
                                    </TableCell>
                                    <TableCell className='text-right text-xs tabular-nums'>
                                      {obj.expires_at > 0 ? (
                                        <span
                                          className={
                                            obj.expired
                                              ? 'text-muted-foreground line-through'
                                              : ''
                                          }
                                        >
                                          {formatDateTime(
                                            obj.expires_at,
                                            locale
                                          )}
                                        </span>
                                      ) : (
                                        '-'
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>

                          <div className='flex items-center justify-between text-xs'>
                            <span className='text-muted-foreground'>
                              {t('Total {{total}} items', {
                                total: formatNumber(
                                  objectsQuery.data?.total ?? 0,
                                  locale
                                ),
                              })}
                            </span>
                            <div className='flex items-center gap-2'>
                              <Button
                                type='button'
                                variant='outline'
                                size='sm'
                                disabled={objPage <= 1}
                                onClick={() =>
                                  setObjPage((prev) => Math.max(1, prev - 1))
                                }
                              >
                                {t('Previous')}
                              </Button>
                              <span className='tabular-nums'>
                                {objPage} / {totalObjectPages}
                              </span>
                              <Button
                                type='button'
                                variant='outline'
                                size='sm'
                                disabled={objPage >= totalObjectPages}
                                onClick={() =>
                                  setObjPage((prev) =>
                                    Math.min(totalObjectPages, prev + 1)
                                  )
                                }
                              >
                                {t('Next')}
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                  </TabsContent>

                  <TabsContent value='overrides' className='mt-0'>
                    {overridesQuery.isError && (
                      <ErrorState
                        title={t('Failed to load targeted traffic overrides')}
                        onRetry={() => void overridesQuery.refetch()}
                      />
                    )}
                    {!overridesQuery.isError &&
                      (overridesQuery.data?.items.length ?? 0) === 0 && (
                        <EmptyState
                          className='min-h-[200px]'
                          title={t('No targeted traffic overrides configured')}
                        />
                      )}
                    {!overridesQuery.isError &&
                      (overridesQuery.data?.items.length ?? 0) > 0 && (
                        <div className='overflow-x-auto'>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('User')}</TableHead>
                                <TableHead>{t('Group')}</TableHead>
                                <TableHead className='text-right'>
                                  {t('Extra daily quota')}
                                </TableHead>
                                <TableHead className='text-right'>
                                  {t("Today's usage / Effective")}
                                </TableHead>
                                <TableHead>{t('Status')}</TableHead>
                                <TableHead>{t('Expires at')}</TableHead>
                                <TableHead>{t('Note')}</TableHead>
                                {isRoot && (
                                  <TableHead className='text-right'>
                                    {t('Actions')}
                                  </TableHead>
                                )}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {overridesQuery.data?.items.map((item) => (
                                <TableRow key={item.user_id}>
                                  <TableCell>
                                    <div className='font-medium'>
                                      {item.username || `#${item.user_id}`}
                                    </div>
                                    <div className='text-muted-foreground text-xs'>
                                      ID: {item.user_id}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <GroupBadge group={item.group} />
                                  </TableCell>
                                  <TableCell className='text-right font-medium tabular-nums'>
                                    +
                                    {formatBytes(
                                      item.extra_daily_bytes,
                                      locale
                                    )}
                                  </TableCell>
                                  <TableCell className='text-right text-xs tabular-nums'>
                                    {formatBytes(item.today_used_bytes, locale)}{' '}
                                    /{' '}
                                    {formatBytes(
                                      item.effective_daily_bytes,
                                      locale
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        item.active ? 'secondary' : 'outline'
                                      }
                                    >
                                      {item.active ? t('Active') : t('Expired')}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className='text-muted-foreground text-xs tabular-nums'>
                                    {item.expires_at > 0
                                      ? formatDateTime(item.expires_at, locale)
                                      : t('Permanent')}
                                  </TableCell>
                                  <TableCell className='max-w-[200px] truncate text-xs'>
                                    {item.note || '-'}
                                  </TableCell>
                                  {isRoot && (
                                    <TableCell className='text-right'>
                                      <div className='flex justify-end gap-1'>
                                        <Button
                                          type='button'
                                          variant='ghost'
                                          size='sm'
                                          onClick={() => {
                                            setOverrideTarget({
                                              userId: item.user_id,
                                              username: item.username,
                                              displayName: item.display_name,
                                              extraDailyMB: item.extra_daily_mb,
                                              expiresAt: item.expires_at,
                                              note: item.note,
                                            })
                                            setOverrideDialogOpen(true)
                                          }}
                                        >
                                          {t('Edit')}
                                        </Button>
                                        <Button
                                          type='button'
                                          variant='ghost'
                                          size='icon-sm'
                                          aria-label={t('Delete')}
                                          onClick={() =>
                                            setDeleteOverrideTarget({
                                              userId: item.user_id,
                                              username:
                                                item.username ||
                                                `#${item.user_id}`,
                                            })
                                          }
                                        >
                                          <Trash2 className='h-4 w-4' />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  )}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}

        {isRoot && (
          <>
            <MediaOverrideDialog
              open={overrideDialogOpen}
              onOpenChange={(open) => {
                setOverrideDialogOpen(open)
                if (!open) setOverrideTarget(null)
              }}
              target={overrideTarget}
              isSaving={upsertOverrideMutation.isPending}
              onSave={async (payload) => {
                await upsertOverrideMutation.mutateAsync(payload)
              }}
            />

            <ConfirmDialog
              open={resetUserTarget !== null}
              onOpenChange={(open) => {
                if (!open) setResetUserTarget(null)
              }}
              title={t('Reset daily media traffic')}
              desc={t(
                "Reset today's cloud media transfer usage to 0 for {{username}}?",
                { username: resetUserTarget?.username ?? '' }
              )}
              confirmText={t('Reset today')}
              isLoading={resetUsageMutation.isPending}
              handleConfirm={() => {
                if (resetUserTarget) {
                  resetUsageMutation.mutate(resetUserTarget.userId)
                }
              }}
            />

            <ConfirmDialog
              open={deleteOverrideTarget !== null}
              onOpenChange={(open) => {
                if (!open) setDeleteOverrideTarget(null)
              }}
              destructive
              title={t('Remove targeted traffic override')}
              desc={t(
                'Remove the extra daily media traffic override for {{username}}?',
                { username: deleteOverrideTarget?.username ?? '' }
              )}
              confirmText={t('Remove')}
              isLoading={deleteOverrideMutation.isPending}
              handleConfirm={() => {
                if (deleteOverrideTarget) {
                  deleteOverrideMutation.mutate(deleteOverrideTarget.userId)
                }
              }}
            />
          </>
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
