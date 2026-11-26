import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Coins,
  CreditCard,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { GroupBadge } from '@/components/group-badge'
import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { getProfitAnalytics, updateProfitAnalyticsSettings } from './api'
import { ProfitCostSettingsDialog } from './components/profit-cost-settings-dialog'
import { ProfitDeletedUserCleanupDialog } from './components/profit-deleted-user-cleanup-dialog'
import {
  ProfitTrendChart,
  type ProfitChartBasis,
} from './components/profit-trend-chart'
import { formatEditableDecimal } from './lib/cost-calc'
import type { ProfitAnalyticsSetting } from './types'

const RANGE_OPTIONS = [7, 14, 30, 90] as const

function formatMoney(
  value: number,
  symbol: string,
  locale: string | undefined,
  signed = false
): string {
  const absVal = Math.abs(value)
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absVal)
  if (value < 0) return `-${symbol}${formatted}`
  if (signed && value > 0) return `+${symbol}${formatted}`
  return `${symbol}${formatted}`
}

function formatOneDecimal(value: number, locale: string | undefined): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    value
  )
}

function formatPercent(value: number, locale: string | undefined): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    value
  )
}

function formatDateTime(
  unixSeconds: number,
  locale: string | undefined
): string {
  if (!unixSeconds) return '-'
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(unixSeconds * 1000))
}

function marginToneClass(value: number): string {
  if (value > 0) return 'text-emerald-600 dark:text-emerald-400'
  if (value < 0) return 'text-destructive'
  return 'text-muted-foreground'
}

export function ProfitAnalytics() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const isRoot = useAuthStore(
    (state) => (state.auth.user?.role ?? 0) >= ROLE.SUPER_ADMIN
  )

  const [days, setDays] = useState<number>(30)
  const [excludeAdminsOverride, setExcludeAdminsOverride] = useState<
    boolean | null
  >(null)
  const [chartBasis, setChartBasis] = useState<ProfitChartBasis>('cash')
  const [activeTab, setActiveTab] = useState('channels')
  const [keyword, setKeyword] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [focusChannelId, setFocusChannelId] = useState<number | null>(null)
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [cleanupUserId, setCleanupUserId] = useState<number | null>(null)

  const reportQuery = useQuery({
    queryKey: ['profit-analytics', days, excludeAdminsOverride],
    queryFn: () =>
      getProfitAnalytics({
        days,
        order_limit: 50,
        ...(excludeAdminsOverride !== null
          ? { exclude_admins: excludeAdminsOverride }
          : {}),
      }),
  })

  const saveSettingsMutation = useMutation({
    mutationFn: (payload: ProfitAnalyticsSetting) =>
      updateProfitAnalyticsSettings(payload),
    onSuccess: () => {
      toast.success(t('Profit cost settings saved'))
      setSettingsOpen(false)
      setFocusChannelId(null)
      setExcludeAdminsOverride(null)
      void queryClient.invalidateQueries({ queryKey: ['profit-analytics'] })
    },
    onError: (error) => {
      handleServerError(error, t('Failed to save profit cost settings'))
    },
  })

  const report = reportQuery.data
  const symbol = report?.currency.symbol ?? '$'
  const summary = report?.summary
  const liability = report?.liability
  const orphanedDeletedUsers = report?.orphaned_deleted_users
  const hasOrphanedDeletedUsers = (orphanedDeletedUsers?.total_records ?? 0) > 0
  const effectiveExcludeAdmins =
    excludeAdminsOverride ??
    summary?.exclude_admin_users ??
    report?.cost_settings.exclude_admin_users ??
    true
  let adminFilterBadgeText = ''
  if (summary) {
    if (summary.exclude_admin_users) {
      adminFilterBadgeText =
        summary.excluded_admin_count > 0
          ? t('Admins excluded ({{count}})', {
              count: summary.excluded_admin_count,
            })
          : t('Admins excluded')
    } else {
      adminFilterBadgeText = t('Includes admins')
    }
  }

  const needle = keyword.trim().toLowerCase()

  const filteredChannels = useMemo(() => {
    const list = report?.channels ?? []
    if (!needle) return list
    return list.filter(
      (item) =>
        item.channel_name.toLowerCase().includes(needle) ||
        String(item.channel_id).includes(needle) ||
        item.group.toLowerCase().includes(needle) ||
        item.tag.toLowerCase().includes(needle)
    )
  }, [needle, report?.channels])

  const filteredModels = useMemo(() => {
    const list = report?.models ?? []
    if (!needle) return list
    return list.filter((item) => item.model_name.toLowerCase().includes(needle))
  }, [needle, report?.models])

  const filteredGroups = useMemo(() => {
    const list = report?.groups ?? []
    if (!needle) return list
    return list.filter((item) => item.group.toLowerCase().includes(needle))
  }, [needle, report?.groups])

  const filteredOrders = useMemo(() => {
    const list = report?.recent_orders ?? []
    if (!needle) return list
    return list.filter(
      (item) =>
        item.trade_no.toLowerCase().includes(needle) ||
        item.username.toLowerCase().includes(needle) ||
        item.display_name.toLowerCase().includes(needle) ||
        item.payment_method.toLowerCase().includes(needle) ||
        (item.plan_title ?? '').toLowerCase().includes(needle)
    )
  }, [needle, report?.recent_orders])

  const cashSparkline = useMemo(
    () => (report?.daily_trend ?? []).map((item) => item.cash_revenue),
    [report?.daily_trend]
  )
  const billedSparkline = useMemo(
    () => (report?.daily_trend ?? []).map((item) => item.billed_local),
    [report?.daily_trend]
  )
  const costSparkline = useMemo(
    () => (report?.daily_trend ?? []).map((item) => item.total_cost),
    [report?.daily_trend]
  )
  const profitSparkline = useMemo(
    () =>
      (report?.daily_trend ?? []).map((item) =>
        Math.max(0, item.billed_gross_profit)
      ),
    [report?.daily_trend]
  )

  const openChannelCostEditor = (channelId: number | null) => {
    setFocusChannelId(channelId)
    setSettingsOpen(true)
  }

  const openDeletedUserCleanup = (userId: number | null) => {
    setCleanupUserId(userId)
    setCleanupOpen(true)
  }

  const orderTypeLabel = (
    orderType: 'topup' | 'subscription' | 'subscription_balance'
  ): string => {
    if (orderType === 'subscription') return t('Subscription direct pay')
    if (orderType === 'subscription_balance') {
      return t('Subscription balance')
    }
    return t('Wallet top-up')
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <div className='flex flex-wrap items-center gap-2'>
          <span>{t('Profit Analysis')}</span>
          {report && (
            <Badge variant='outline' className='font-normal'>
              {t('Default cost ratio')}:{' '}
              {formatPercent(
                report.cost_settings.default_cost_ratio * 100,
                locale
              )}
              %
            </Badge>
          )}
          {summary && (
            <Badge
              variant={summary.exclude_admin_users ? 'secondary' : 'outline'}
              className='font-normal'
            >
              {adminFilterBadgeText}
            </Badge>
          )}
        </div>
      </SectionPageLayout.Title>

      <SectionPageLayout.Actions>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='bg-muted/60 inline-flex h-8 items-center gap-2 rounded-md border px-2.5'>
            <Switch
              id='profit-exclude-admins'
              checked={effectiveExcludeAdmins}
              onCheckedChange={(checked) => setExcludeAdminsOverride(checked)}
            />
            <Label
              htmlFor='profit-exclude-admins'
              className='cursor-pointer text-xs font-normal whitespace-nowrap'
            >
              {t('Exclude admins')}
            </Label>
          </div>
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
            onClick={() => void reportQuery.refetch()}
            disabled={reportQuery.isFetching}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${reportQuery.isFetching ? 'animate-spin' : ''}`}
            />
            {t('Refresh')}
          </Button>
          {isRoot && (
            <Button
              type='button'
              size='sm'
              onClick={() => openChannelCostEditor(null)}
            >
              <Settings2 className='mr-1.5 h-3.5 w-3.5' />
              {t('Cost model')}
            </Button>
          )}
        </div>
      </SectionPageLayout.Actions>

      <SectionPageLayout.Content>
        {reportQuery.isError ? (
          <ErrorState
            title={t('Failed to load profit analytics')}
            onRetry={() => void reportQuery.refetch()}
          />
        ) : (
          <div className='space-y-5'>
            {isRoot && hasOrphanedDeletedUsers && orphanedDeletedUsers && (
              <Alert className='border-amber-500/40 bg-amber-500/5'>
                <AlertTriangle className='text-amber-600 dark:text-amber-400' />
                <AlertTitle className='flex flex-wrap items-center justify-between gap-2'>
                  <span>
                    {t('Residual records from deleted users detected')}
                  </span>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    className='border-amber-500/40 hover:bg-amber-500/10'
                    onClick={() => openDeletedUserCleanup(null)}
                  >
                    <Trash2 className='mr-1.5 h-3.5 w-3.5' />
                    {t('Review & clean up')}
                  </Button>
                </AlertTitle>
                <AlertDescription>
                  {t(
                    '{{users}} deleted user(s) still have {{total}} residual records (top-ups: {{topups}} / {{topupAmount}}, usage stats: {{usage}} / {{billedAmount}}). You can review and permanently clean them up.',
                    {
                      users: formatNumber(
                        orphanedDeletedUsers.user_count,
                        locale
                      ),
                      total: formatNumber(
                        orphanedDeletedUsers.total_records,
                        locale
                      ),
                      topups: formatNumber(
                        orphanedDeletedUsers.topup_orders,
                        locale
                      ),
                      topupAmount: formatMoney(
                        orphanedDeletedUsers.completed_topup_money,
                        symbol,
                        locale
                      ),
                      usage: formatNumber(
                        orphanedDeletedUsers.quota_data_records,
                        locale
                      ),
                      billedAmount: formatMoney(
                        orphanedDeletedUsers.billed_local,
                        symbol,
                        locale
                      ),
                    }
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
              <StatCard
                title={t('Cash revenue')}
                value={
                  summary
                    ? formatMoney(summary.cash_revenue, symbol, locale)
                    : '-'
                }
                description={t('Paid orders in last {{days}} days', { days })}
                icon={Wallet}
                tone='accent-1'
                loading={reportQuery.isLoading}
                sparkline={cashSparkline}
                sparklineVariant='bars'
                details={
                  summary
                    ? [
                        {
                          label: t('Wallet top-up'),
                          value: `${formatMoney(summary.wallet_topup_money, symbol, locale)} (${summary.wallet_topup_orders})`,
                        },
                        {
                          label: t('Subscription direct'),
                          value: `${formatMoney(summary.subscription_direct_money, symbol, locale)} (${summary.subscription_direct_orders})`,
                        },
                        {
                          label: t('Paying users'),
                          value: formatNumber(summary.paying_users, locale),
                        },
                      ]
                    : undefined
                }
              />

              <StatCard
                title={t('Billed consumption')}
                value={
                  summary
                    ? formatMoney(summary.billed_local, symbol, locale)
                    : '-'
                }
                description={
                  summary
                    ? `${formatMoney(summary.billed_usd, '$', locale)} USD`
                    : ''
                }
                icon={Coins}
                tone='accent-2'
                loading={reportQuery.isLoading}
                sparkline={billedSparkline}
                sparklineVariant='line'
                details={
                  summary
                    ? [
                        {
                          label: t('Requests'),
                          value: formatCompactNumber(
                            summary.total_requests,
                            locale
                          ),
                        },
                        {
                          label: t('Tokens'),
                          value: formatCompactNumber(
                            summary.total_tokens,
                            locale
                          ),
                        },
                        {
                          label: t('Active users'),
                          value: formatNumber(summary.active_users, locale),
                        },
                      ]
                    : undefined
                }
              />

              <StatCard
                title={t('Estimated total cost')}
                value={
                  summary
                    ? formatMoney(summary.total_estimated_cost, symbol, locale)
                    : '-'
                }
                description={t('Upstream + fixed amortization + fees')}
                icon={CreditCard}
                tone='accent-3'
                loading={reportQuery.isLoading}
                sparkline={costSparkline}
                sparklineVariant='bars'
                details={
                  summary
                    ? [
                        {
                          label: t('Upstream variable'),
                          value: formatMoney(
                            summary.upstream_variable_cost,
                            symbol,
                            locale
                          ),
                        },
                        {
                          label: t('Fixed amortized'),
                          value: formatMoney(
                            summary.channel_fixed_cost +
                              summary.platform_fixed_cost,
                            symbol,
                            locale
                          ),
                        },
                        {
                          label: t('Payment fees'),
                          value: formatMoney(
                            summary.payment_fee_cost,
                            symbol,
                            locale
                          ),
                        },
                      ]
                    : undefined
                }
              />

              <StatCard
                title={t('Billed gross profit')}
                value={
                  summary
                    ? formatMoney(
                        summary.billed_gross_profit,
                        symbol,
                        locale,
                        true
                      )
                    : '-'
                }
                description={
                  summary
                    ? `${t('Gross margin')} ${formatOneDecimal(summary.billed_gross_margin, locale)}%`
                    : ''
                }
                icon={TrendingUp}
                tone='accent-1'
                loading={reportQuery.isLoading}
                sparkline={profitSparkline}
                sparklineVariant='line'
                details={
                  summary
                    ? [
                        {
                          label: t('Cash net profit'),
                          value: `${formatMoney(summary.cash_net_profit, symbol, locale, true)} (${formatOneDecimal(summary.cash_net_margin, locale)}%)`,
                          tone:
                            summary.cash_net_profit >= 0
                              ? 'success'
                              : 'destructive',
                        },
                        {
                          label: t('Billed net profit'),
                          value: formatMoney(
                            summary.billed_net_profit,
                            symbol,
                            locale,
                            true
                          ),
                          tone:
                            summary.billed_net_profit >= 0
                              ? 'success'
                              : 'destructive',
                        },
                        {
                          label: t('Balance sub conversion'),
                          value: formatMoney(
                            summary.subscription_balance_money,
                            symbol,
                            locale
                          ),
                          tone: 'muted',
                        },
                      ]
                    : undefined
                }
              />
            </div>

            <div className='grid gap-4 lg:grid-cols-12'>
              <Card className='lg:col-span-8'>
                <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-2 pb-2'>
                  <div>
                    <CardTitle className='text-base'>
                      {t('Daily revenue, cost & profit trend')}
                    </CardTitle>
                    <CardDescription>
                      {chartBasis === 'cash'
                        ? t(
                            'Cash basis: external paid orders minus total estimated costs'
                          )
                        : t(
                            'Billed basis: API consumption billed minus upstream variable cost'
                          )}
                    </CardDescription>
                  </div>
                  <div className='bg-muted/60 inline-flex items-center rounded-md border p-0.5'>
                    <Button
                      type='button'
                      size='sm'
                      variant={chartBasis === 'cash' ? 'secondary' : 'ghost'}
                      className='h-7 px-2.5 text-xs'
                      onClick={() => setChartBasis('cash')}
                    >
                      {t('Cash basis')}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant={chartBasis === 'billed' ? 'secondary' : 'ghost'}
                      className='h-7 px-2.5 text-xs'
                      onClick={() => setChartBasis('billed')}
                    >
                      {t('Billed basis')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ProfitTrendChart
                    data={report?.daily_trend ?? []}
                    symbol={symbol}
                    basis={chartBasis}
                  />
                </CardContent>
              </Card>

              <Card className='lg:col-span-4'>
                <CardHeader className='pb-3'>
                  <CardTitle className='text-base'>
                    {t('Deferred liability & giveaways')}
                  </CardTitle>
                  <CardDescription>
                    {t(
                      'Unspent user balances represent future upstream cost obligations.'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-3 text-sm'>
                  <div className='flex items-center justify-between rounded-md border px-3 py-2.5'>
                    <div>
                      <div className='font-medium'>
                        {t('User wallet unspent')}
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        {liability
                          ? `${formatMoney(liability.user_remaining_usd, '$', locale)} USD`
                          : '-'}
                      </div>
                    </div>
                    <div className='font-semibold tabular-nums'>
                      {liability
                        ? formatMoney(
                            liability.user_remaining_local,
                            symbol,
                            locale
                          )
                        : '-'}
                    </div>
                  </div>

                  <div className='flex items-center justify-between rounded-md border px-3 py-2.5'>
                    <div>
                      <div className='font-medium'>
                        {t('Active subscription unspent')}
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        {liability
                          ? `${formatMoney(liability.subscription_remaining_usd, '$', locale)} USD`
                          : '-'}
                      </div>
                    </div>
                    <div className='font-semibold tabular-nums'>
                      {liability
                        ? formatMoney(
                            liability.subscription_remaining_local,
                            symbol,
                            locale
                          )
                        : '-'}
                    </div>
                  </div>

                  <div className='flex items-center justify-between rounded-md border px-3 py-2.5'>
                    <div>
                      <div className='font-medium'>
                        {t('Redemption codes used')}
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        {t('{{count}} codes in range', {
                          count: liability?.redeemed_count ?? 0,
                        })}
                      </div>
                    </div>
                    <div className='font-semibold tabular-nums'>
                      {liability
                        ? formatMoney(liability.redeemed_local, symbol, locale)
                        : '-'}
                    </div>
                  </div>

                  <div className='flex items-center justify-between rounded-md border px-3 py-2.5'>
                    <div>
                      <div className='font-medium'>
                        {t('Check-in rewards issued')}
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        {t('{{count}} check-ins in range', {
                          count: liability?.checkin_count ?? 0,
                        })}
                      </div>
                    </div>
                    <div className='font-semibold tabular-nums'>
                      {liability
                        ? formatMoney(liability.checkin_local, symbol, locale)
                        : '-'}
                    </div>
                  </div>

                  {report && (
                    <p className='text-muted-foreground pt-1 text-xs'>
                      {t(
                        'Display currency rate: 1 USD = {{rate}} ({{symbol}}) · Top-up price: {{price}}',
                        {
                          rate: formatNumber(
                            report.currency.usd_to_currency_rate,
                            locale
                          ),
                          symbol,
                          price: formatNumber(
                            report.currency.topup_price,
                            locale
                          ),
                        }
                      )}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3 pb-3'>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value='channels'>
                      {t('By channel')} ({report?.channels.length ?? 0})
                    </TabsTrigger>
                    <TabsTrigger value='models'>
                      {t('By model')} ({report?.models.length ?? 0})
                    </TabsTrigger>
                    <TabsTrigger value='groups'>
                      {t('By group')} ({report?.groups.length ?? 0})
                    </TabsTrigger>
                    <TabsTrigger value='orders'>
                      {t('Payments & orders')} (
                      {report?.recent_orders.length ?? 0})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className='relative w-full sm:w-64'>
                  <Search className='text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 h-4 w-4' />
                  <Input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder={t('Filter by name, group, trade no...')}
                    className='h-9 pl-8'
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsContent value='channels' className='mt-0'>
                    {filteredChannels.length === 0 ? (
                      <EmptyState
                        className='min-h-[200px]'
                        title={t('No channel profitability data')}
                      />
                    ) : (
                      <div className='overflow-x-auto'>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('Channel')}</TableHead>
                              <TableHead className='text-right'>
                                {t('Requests')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Billed')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Cost ratio')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Variable cost')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Fixed amortized')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Net profit')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Margin')}
                              </TableHead>
                              {isRoot && (
                                <TableHead className='text-right'>
                                  {t('Actions')}
                                </TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredChannels.map((item) => (
                              <TableRow key={item.channel_id}>
                                <TableCell>
                                  <div className='flex flex-wrap items-center gap-1.5 font-medium'>
                                    <span>{item.channel_name}</span>
                                    {item.channel_deleted && (
                                      <Badge
                                        variant='outline'
                                        className='text-muted-foreground text-[11px] font-normal'
                                      >
                                        {t('Deleted channel')}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className='text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs'>
                                    {item.channel_name !==
                                      `#${item.channel_id}` && (
                                      <span>#{item.channel_id}</span>
                                    )}
                                    {item.group && <span>· {item.group}</span>}
                                    {item.note && <span>· {item.note}</span>}
                                  </div>
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  {formatNumber(item.requests, locale)}
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  <div>
                                    {formatMoney(
                                      item.billed_local,
                                      symbol,
                                      locale
                                    )}
                                  </div>
                                  <div className='text-muted-foreground text-xs'>
                                    {formatMoney(item.billed_usd, '$', locale)}
                                  </div>
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  <Badge
                                    variant={
                                      item.custom_cost_ratio
                                        ? 'secondary'
                                        : 'outline'
                                    }
                                  >
                                    {formatPercent(
                                      item.cost_ratio * 100,
                                      locale
                                    )}
                                    %
                                  </Badge>
                                  {(item.pricing_mode === 'ratio' ||
                                    item.pricing_mode === 'unit_price') &&
                                    item.upstream_value != null &&
                                    item.platform_value != null && (
                                      <div className='text-muted-foreground mt-0.5 text-xs'>
                                        {formatEditableDecimal(
                                          item.upstream_value
                                        )}{' '}
                                        /{' '}
                                        {formatEditableDecimal(
                                          item.platform_value
                                        )}
                                      </div>
                                    )}
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  {formatMoney(
                                    item.variable_cost,
                                    symbol,
                                    locale
                                  )}
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  <div>
                                    {formatMoney(
                                      item.amortized_fixed_cost,
                                      symbol,
                                      locale
                                    )}
                                  </div>
                                  {item.monthly_fixed_cost > 0 && (
                                    <div className='text-muted-foreground text-xs'>
                                      {formatMoney(
                                        item.monthly_fixed_cost,
                                        symbol,
                                        locale
                                      )}
                                      /{t('mo')}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell
                                  className={`text-right font-medium tabular-nums ${marginToneClass(item.net_profit)}`}
                                >
                                  {formatMoney(
                                    item.net_profit,
                                    symbol,
                                    locale,
                                    true
                                  )}
                                </TableCell>
                                <TableCell
                                  className={`text-right tabular-nums ${marginToneClass(item.margin_rate)}`}
                                >
                                  {item.billed_local > 0
                                    ? `${formatOneDecimal(item.margin_rate, locale)}%`
                                    : '-'}
                                </TableCell>
                                {isRoot && (
                                  <TableCell className='text-right'>
                                    {item.channel_id > 0 && (
                                      <Button
                                        type='button'
                                        variant='ghost'
                                        size='sm'
                                        onClick={() =>
                                          openChannelCostEditor(item.channel_id)
                                        }
                                      >
                                        {t('Edit cost')}
                                      </Button>
                                    )}
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value='models' className='mt-0'>
                    {filteredModels.length === 0 ? (
                      <EmptyState
                        className='min-h-[200px]'
                        title={t('No model profitability data')}
                      />
                    ) : (
                      <div className='overflow-x-auto'>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('Model')}</TableHead>
                              <TableHead className='text-right'>
                                {t('Requests')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Tokens')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Billed')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Estimated cost')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Gross profit')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Margin')}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredModels.map((item) => (
                              <TableRow key={item.model_name}>
                                <TableCell className='font-mono text-xs font-medium'>
                                  {item.model_name}
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  {formatNumber(item.requests, locale)}
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  {formatCompactNumber(item.tokens, locale)}
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  {formatMoney(
                                    item.billed_local,
                                    symbol,
                                    locale
                                  )}
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  {formatMoney(
                                    item.estimated_cost,
                                    symbol,
                                    locale
                                  )}
                                </TableCell>
                                <TableCell
                                  className={`text-right font-medium tabular-nums ${marginToneClass(item.gross_profit)}`}
                                >
                                  {formatMoney(
                                    item.gross_profit,
                                    symbol,
                                    locale,
                                    true
                                  )}
                                </TableCell>
                                <TableCell
                                  className={`text-right tabular-nums ${marginToneClass(item.margin_rate)}`}
                                >
                                  {formatOneDecimal(item.margin_rate, locale)}%
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value='groups' className='mt-0'>
                    {filteredGroups.length === 0 ? (
                      <EmptyState
                        className='min-h-[200px]'
                        title={t('No group profitability data')}
                      />
                    ) : (
                      <div className='overflow-x-auto'>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('Group')}</TableHead>
                              <TableHead className='text-right'>
                                {t('Active users')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Requests')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Billed')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Estimated cost')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Gross profit')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Margin')}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredGroups.map((item) => (
                              <TableRow key={item.group}>
                                <TableCell>
                                  <GroupBadge group={item.group} />
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  {formatNumber(item.active_users, locale)}
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  {formatNumber(item.requests, locale)}
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  {formatMoney(
                                    item.billed_local,
                                    symbol,
                                    locale
                                  )}
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  {formatMoney(
                                    item.estimated_cost,
                                    symbol,
                                    locale
                                  )}
                                </TableCell>
                                <TableCell
                                  className={`text-right font-medium tabular-nums ${marginToneClass(item.gross_profit)}`}
                                >
                                  {formatMoney(
                                    item.gross_profit,
                                    symbol,
                                    locale,
                                    true
                                  )}
                                </TableCell>
                                <TableCell
                                  className={`text-right tabular-nums ${marginToneClass(item.margin_rate)}`}
                                >
                                  {formatOneDecimal(item.margin_rate, locale)}%
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value='orders' className='mt-0 space-y-5'>
                    {(report?.payment_methods.length ?? 0) > 0 && (
                      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
                        {report?.payment_methods.map((method) => (
                          <div
                            key={method.payment_method}
                            className='rounded-lg border p-3 text-sm'
                          >
                            <div className='flex items-center justify-between gap-2'>
                              <span className='font-medium uppercase'>
                                {method.payment_method}
                              </span>
                              <Badge
                                variant={
                                  method.is_internal ? 'outline' : 'secondary'
                                }
                              >
                                {method.is_internal
                                  ? t('Internal balance')
                                  : `${method.order_count} ${t('orders')}`}
                              </Badge>
                            </div>
                            <div className='mt-2 text-lg font-semibold tabular-nums'>
                              {formatMoney(method.gross_money, symbol, locale)}
                            </div>
                            <div className='text-muted-foreground mt-1 flex items-center justify-between text-xs'>
                              <span>
                                {t('Fee')}:{' '}
                                {formatMoney(
                                  method.estimated_fee,
                                  symbol,
                                  locale
                                )}
                              </span>
                              <span>
                                {t('Net')}:{' '}
                                {formatMoney(method.net_money, symbol, locale)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {filteredOrders.length === 0 ? (
                      <EmptyState
                        className='min-h-[200px]'
                        title={t('No paid orders in this period')}
                      />
                    ) : (
                      <div className='overflow-x-auto'>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('Trade No.')}</TableHead>
                              <TableHead>{t('User')}</TableHead>
                              <TableHead>{t('Order type')}</TableHead>
                              <TableHead>{t('Payment method')}</TableHead>
                              <TableHead className='text-right'>
                                {t('Amount')}
                              </TableHead>
                              <TableHead className='text-right'>
                                {t('Completed at')}
                              </TableHead>
                              {isRoot && (
                                <TableHead className='text-right'>
                                  {t('Actions')}
                                </TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredOrders.map((order) => (
                              <TableRow
                                key={`${order.order_type}-${order.trade_no}`}
                              >
                                <TableCell className='font-mono text-xs'>
                                  {order.trade_no}
                                </TableCell>
                                <TableCell>
                                  <div className='flex flex-wrap items-center gap-1.5 font-medium'>
                                    <span>
                                      {order.username || `#${order.user_id}`}
                                    </span>
                                    {order.user_deleted && (
                                      <Badge
                                        variant='outline'
                                        className='border-amber-500/40 text-[11px] font-normal text-amber-700 dark:text-amber-400'
                                      >
                                        {t('Deleted user')}
                                      </Badge>
                                    )}
                                  </div>
                                  {(order.display_name ||
                                    (order.user_deleted && order.username)) && (
                                    <div className='text-muted-foreground text-xs'>
                                      {order.display_name ||
                                        `#${order.user_id}`}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      order.is_internal
                                        ? 'outline'
                                        : 'secondary'
                                    }
                                  >
                                    {orderTypeLabel(order.order_type)}
                                  </Badge>
                                  {order.plan_title && (
                                    <div className='text-muted-foreground mt-0.5 text-xs'>
                                      {order.plan_title}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className='uppercase'>
                                  {order.payment_method || '-'}
                                </TableCell>
                                <TableCell className='text-right font-medium tabular-nums'>
                                  {formatMoney(order.money, symbol, locale)}
                                </TableCell>
                                <TableCell className='text-muted-foreground text-right text-xs tabular-nums'>
                                  {formatDateTime(order.completed_at, locale)}
                                </TableCell>
                                {isRoot && (
                                  <TableCell className='text-right'>
                                    {order.user_deleted ? (
                                      <Button
                                        type='button'
                                        variant='ghost'
                                        size='sm'
                                        className='text-destructive hover:text-destructive'
                                        onClick={() =>
                                          openDeletedUserCleanup(order.user_id)
                                        }
                                      >
                                        <Trash2 className='mr-1 h-3.5 w-3.5' />
                                        {t('Clean up')}
                                      </Button>
                                    ) : (
                                      <span className='text-muted-foreground text-xs'>
                                        -
                                      </span>
                                    )}
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
          <ProfitCostSettingsDialog
            open={settingsOpen}
            onOpenChange={(open) => {
              setSettingsOpen(open)
              if (!open) setFocusChannelId(null)
            }}
            settings={report?.cost_settings}
            channels={report?.channels ?? []}
            pricingRef={report?.pricing_ref}
            symbol={symbol}
            focusChannelId={focusChannelId}
            isSaving={saveSettingsMutation.isPending}
            onSave={async (payload) => {
              await saveSettingsMutation.mutateAsync(payload)
            }}
          />
        )}

        {isRoot && (
          <ProfitDeletedUserCleanupDialog
            open={cleanupOpen}
            onOpenChange={(open) => {
              setCleanupOpen(open)
              if (!open) setCleanupUserId(null)
            }}
            initialUserId={cleanupUserId}
            symbol={symbol}
          />
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
