import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { GroupBadge } from '@/components/group-badge'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
  formatCacheHitRate,
  formatLatency,
  formatThroughputDisplay,
  formatUptimePct,
  getSuccessRateDotClass,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber } from '@/lib/format'

import {
  formatOneDecimal,
  formatOverviewMoney,
  formatShortDateTime,
} from '../lib/format'
import type {
  SiteOverviewGroupItem,
  SiteOverviewModelItem,
  SiteOverviewPerfModel,
  SiteOverviewUserItem,
} from '../types'

interface SiteOverviewTablesProps {
  topModels: SiteOverviewModelItem[]
  perfAlerts: SiteOverviewPerfModel[]
  groups: SiteOverviewGroupItem[]
  topUsers: SiteOverviewUserItem[]
  currencySymbol: string
}

function SuccessRateCell(props: { rate: number | null | undefined }) {
  if (props.rate == null) {
    return <span className='text-muted-foreground'>—</span>
  }
  return (
    <span className='inline-flex items-center gap-1.5 tabular-nums'>
      <span
        className={`size-2 rounded-full ${getSuccessRateDotClass(props.rate)}`}
        aria-hidden='true'
      />
      <span className={getSuccessRateTextClass(props.rate)}>
        {formatUptimePct(props.rate)}
      </span>
    </span>
  )
}

export function SiteOverviewTables(props: SiteOverviewTablesProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [activeTab, setActiveTab] = useState('models')
  const [keyword, setKeyword] = useState('')

  const needle = keyword.trim().toLowerCase()

  const filteredModels = useMemo(() => {
    if (!needle) return props.topModels
    return props.topModels.filter((item) =>
      item.model_name.toLowerCase().includes(needle)
    )
  }, [needle, props.topModels])

  const filteredPerfAlerts = useMemo(() => {
    if (!needle) return props.perfAlerts
    return props.perfAlerts.filter(
      (item) =>
        item.model_name.toLowerCase().includes(needle) ||
        item.model_kind.toLowerCase().includes(needle)
    )
  }, [needle, props.perfAlerts])

  const filteredGroups = useMemo(() => {
    if (!needle) return props.groups
    return props.groups.filter((item) =>
      item.group.toLowerCase().includes(needle)
    )
  }, [needle, props.groups])

  const filteredUsers = useMemo(() => {
    if (!needle) return props.topUsers
    return props.topUsers.filter(
      (item) =>
        item.username.toLowerCase().includes(needle) ||
        (item.display_name ?? '').toLowerCase().includes(needle) ||
        item.group.toLowerCase().includes(needle) ||
        String(item.user_id).includes(needle)
    )
  }, [needle, props.topUsers])

  return (
    <Card>
      <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-3'>
        <div className='space-y-1'>
          <CardTitle className='text-base'>
            {t('Site-wide Breakdown')}
          </CardTitle>
          <CardDescription>
            {t(
              'Inspect top models, slow or degraded models, user groups, and heavy consumers'
            )}
          </CardDescription>
        </div>
        <div className='relative w-full sm:w-64'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2' />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t('Filter models, groups, or users...')}
            className='h-8 pl-8 text-xs'
          />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className='mb-3 flex-wrap'>
            <TabsTrigger value='models'>
              {t('Top Models')} ({filteredModels.length})
            </TabsTrigger>
            <TabsTrigger value='perf'>
              {t('Performance Watchlist')} ({filteredPerfAlerts.length})
            </TabsTrigger>
            <TabsTrigger value='groups'>
              {t('User Groups')} ({filteredGroups.length})
            </TabsTrigger>
            <TabsTrigger value='users'>
              {t('Top Users')} ({filteredUsers.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value='models'>
            {filteredModels.length === 0 ? (
              <EmptyState
                className='min-h-[180px]'
                title={t('No model usage records')}
                description={t('No matching models found in this time range.')}
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
                        {t('Consumption')}
                      </TableHead>
                      <TableHead className='text-right'>{t('Share')}</TableHead>
                      <TableHead className='text-right'>
                        {t('Tokens')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Success rate')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Avg latency')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Avg TTFT')}
                      </TableHead>
                      <TableHead className='text-right'>{t('TPS')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredModels.map((item) => (
                      <TableRow key={item.model_name}>
                        <TableCell className='max-w-[240px] truncate font-mono text-xs font-medium'>
                          {item.model_name}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatNumber(item.requests, locale)}
                        </TableCell>
                        <TableCell className='text-right font-medium tabular-nums'>
                          {formatOverviewMoney(
                            item.billed_local,
                            props.currencySymbol,
                            locale
                          )}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatOneDecimal(item.share_pct, locale)}%
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatCompactNumber(item.tokens, locale)}
                        </TableCell>
                        <TableCell className='text-right'>
                          <SuccessRateCell rate={item.success_rate} />
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {item.avg_latency_ms != null
                            ? formatLatency(item.avg_latency_ms)
                            : '—'}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {item.avg_ttft_ms != null
                            ? formatLatency(item.avg_ttft_ms)
                            : '—'}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatThroughputDisplay(item.avg_tps ?? undefined, {
                            insufficient: item.tps_insufficient,
                            insufficientLabel: t('Low sample'),
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value='perf'>
            {filteredPerfAlerts.length === 0 ? (
              <EmptyState
                className='min-h-[180px]'
                title={t('No performance telemetry')}
                description={t(
                  'Performance metrics will appear once gateway requests are recorded.'
                )}
              />
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Model')}</TableHead>
                      <TableHead>{t('Type')}</TableHead>
                      <TableHead className='text-right'>
                        {t('Requests')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Success rate')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Avg latency')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Avg TTFT')}
                      </TableHead>
                      <TableHead className='text-right'>{t('TPS')}</TableHead>
                      <TableHead className='text-right'>
                        {t('Cache hit')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPerfAlerts.map((item) => (
                      <TableRow key={item.model_name}>
                        <TableCell className='max-w-[240px] truncate font-mono text-xs font-medium'>
                          {item.model_name}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant='outline'
                            className='font-normal capitalize'
                          >
                            {item.model_kind || 'chat'}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatNumber(item.request_count, locale)}
                        </TableCell>
                        <TableCell className='text-right'>
                          <SuccessRateCell rate={item.success_rate} />
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatLatency(item.avg_latency_ms)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatLatency(item.avg_ttft_ms)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatThroughputDisplay(item.avg_tps, {
                            insufficient: item.tps_insufficient,
                            insufficientLabel: t('Low sample'),
                          })}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatCacheHitRate(item.cache_hit_rate)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value='groups'>
            {filteredGroups.length === 0 ? (
              <EmptyState
                className='min-h-[180px]'
                title={t('No group activity')}
                description={t(
                  'No matching user groups recorded consumption in this period.'
                )}
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
                        {t('Consumption')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Tokens')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Success rate')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Avg latency')}
                      </TableHead>
                      <TableHead className='text-right'>{t('TPS')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredGroups.map((item) => (
                      <TableRow key={item.group}>
                        <TableCell>
                          <GroupBadge group={item.group} size='sm' />
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatNumber(item.active_users, locale)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatNumber(item.requests, locale)}
                        </TableCell>
                        <TableCell className='text-right font-medium tabular-nums'>
                          {formatOverviewMoney(
                            item.billed_local,
                            props.currencySymbol,
                            locale
                          )}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatCompactNumber(item.tokens, locale)}
                        </TableCell>
                        <TableCell className='text-right'>
                          <SuccessRateCell rate={item.success_rate} />
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {item.avg_latency_ms != null
                            ? formatLatency(item.avg_latency_ms)
                            : '—'}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatThroughputDisplay(item.avg_tps ?? undefined, {
                            insufficient: item.tps_insufficient,
                            insufficientLabel: t('Low sample'),
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value='users'>
            {filteredUsers.length === 0 ? (
              <EmptyState
                className='min-h-[180px]'
                title={t('No user consumption records')}
                description={t('No matching users found in this time range.')}
              />
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('User')}</TableHead>
                      <TableHead>{t('Group')}</TableHead>
                      <TableHead>{t('Status')}</TableHead>
                      <TableHead className='text-right'>
                        {t('Requests')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Consumption')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Tokens')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Remaining balance')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Last login')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((item) => (
                      <TableRow key={item.user_id}>
                        <TableCell>
                          <div className='flex flex-col'>
                            <span className='font-medium'>
                              {item.display_name || item.username}
                            </span>
                            <span className='text-muted-foreground font-mono text-xs'>
                              @{item.username} · #{item.user_id}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.group ? (
                            <GroupBadge group={item.group} size='sm' />
                          ) : (
                            <span className='text-muted-foreground'>—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            copyable={false}
                            variant={item.status === 1 ? 'success' : 'danger'}
                            label={
                              item.status === 1 ? t('Enabled') : t('Disabled')
                            }
                          />
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatNumber(item.requests, locale)}
                        </TableCell>
                        <TableCell className='text-right font-medium tabular-nums'>
                          {formatOverviewMoney(
                            item.billed_local,
                            props.currencySymbol,
                            locale
                          )}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatCompactNumber(item.tokens, locale)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatOverviewMoney(
                            item.remaining_local,
                            props.currencySymbol,
                            locale
                          )}
                        </TableCell>
                        <TableCell className='text-muted-foreground text-right text-xs tabular-nums'>
                          {formatShortDateTime(item.last_login_at, locale)}
                        </TableCell>
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
  )
}
