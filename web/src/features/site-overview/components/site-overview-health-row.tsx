import { Link } from '@tanstack/react-router'
import { ArrowUpRight, CheckCircle2, Cpu, Radio, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { GroupBadge } from '@/components/group-badge'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatLatency } from '@/features/performance-metrics/lib/format'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import {
  formatBytes,
  formatOneDecimal,
  formatOverviewMoney,
  formatSignedInt,
} from '../lib/format'
import type {
  SiteOverviewChannelsSummary,
  SiteOverviewRuntimeSnapshot,
  SiteOverviewUsersSummary,
} from '../types'

interface SiteOverviewHealthRowProps {
  users: SiteOverviewUsersSummary
  channels: SiteOverviewChannelsSummary
  runtime?: SiteOverviewRuntimeSnapshot | null
  currencySymbol: string
}

export function SiteOverviewHealthRow(props: SiteOverviewHealthRowProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  let netTone = 'text-muted-foreground'
  if (props.users.net_user_change > 0) {
    netTone = 'text-emerald-600 dark:text-emerald-400'
  } else if (props.users.net_user_change < 0) {
    netTone = 'text-destructive'
  }

  const enabledRatio =
    props.channels.total > 0
      ? (props.channels.enabled / props.channels.total) * 100
      : 0

  return (
    <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
      <Card>
        <CardHeader className='flex flex-row items-start justify-between gap-2 space-y-0 pb-3'>
          <div className='space-y-1'>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Users className='text-muted-foreground size-4' />
              {t('User Activity & Inventory')}
            </CardTitle>
            <CardDescription>
              {t('DAU / WAU / MAU retention, user changes, and balance stock')}
            </CardDescription>
          </div>
          <Button
            variant='ghost'
            size='sm'
            className='h-7 gap-1 px-2 text-xs'
            render={<Link to='/users' />}
          >
            {t('Manage users')}
            <ArrowUpRight className='size-3.5' />
          </Button>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-3 gap-3'>
            <div className='bg-muted/40 rounded-lg border px-3 py-2.5'>
              <div className='text-muted-foreground text-xs'>DAU</div>
              <div className='mt-1 text-lg font-semibold tabular-nums'>
                {formatNumber(props.users.dau, locale)}
              </div>
              <div className='text-muted-foreground text-xs'>
                {t('Active today')}
              </div>
            </div>
            <div className='bg-muted/40 rounded-lg border px-3 py-2.5'>
              <div className='text-muted-foreground text-xs'>WAU</div>
              <div className='mt-1 text-lg font-semibold tabular-nums'>
                {formatNumber(props.users.wau, locale)}
              </div>
              <div className='text-muted-foreground text-xs'>
                {t('Last 7 days')}
              </div>
            </div>
            <div className='bg-muted/40 rounded-lg border px-3 py-2.5'>
              <div className='text-muted-foreground text-xs'>MAU</div>
              <div className='mt-1 text-lg font-semibold tabular-nums'>
                {formatNumber(props.users.mau, locale)}
              </div>
              <div className='text-muted-foreground text-xs'>
                {t('Last 30 days')}
              </div>
            </div>
          </div>

          <div className='grid grid-cols-2 gap-x-6 gap-y-2.5 border-t pt-3 text-sm sm:grid-cols-3'>
            <div>
              <div className='text-muted-foreground text-xs'>
                {t('Period net change')}
              </div>
              <div className={`font-semibold tabular-nums ${netTone}`}>
                {formatSignedInt(props.users.net_user_change, locale)}
              </div>
            </div>
            <div>
              <div className='text-muted-foreground text-xs'>
                {t('New / Deleted')}
              </div>
              <div className='font-medium tabular-nums'>
                <span className='text-emerald-600 dark:text-emerald-400'>
                  +{formatNumber(props.users.new_users, locale)}
                </span>
                {' / '}
                <span className='text-destructive'>
                  -{formatNumber(props.users.deleted_users, locale)}
                </span>
              </div>
            </div>
            <div>
              <div className='text-muted-foreground text-xs'>
                {t('Active rate')}
              </div>
              <div className='font-medium tabular-nums'>
                {formatOneDecimal(props.users.active_rate, locale)}%
              </div>
            </div>
            <div>
              <div className='text-muted-foreground text-xs'>
                {t('Logged in (period)')}
              </div>
              <div className='font-medium tabular-nums'>
                {formatNumber(props.users.login_active_users, locale)}
              </div>
            </div>
            <div>
              <div className='text-muted-foreground text-xs'>
                {t('Paying users')}
              </div>
              <div className='font-medium tabular-nums'>
                {formatNumber(props.users.paying_users, locale)}
              </div>
            </div>
            <div>
              <div className='text-muted-foreground text-xs'>
                {t('Remaining user balance')}
              </div>
              <div className='font-medium tabular-nums'>
                {formatOverviewMoney(
                  props.users.total_remaining_local,
                  props.currencySymbol,
                  locale
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-start justify-between gap-2 space-y-0 pb-3'>
          <div className='space-y-1'>
            <CardTitle className='flex items-center gap-2 text-base'>
              <Radio className='text-muted-foreground size-4' />
              {t('Channel Health & System')}
            </CardTitle>
            <CardDescription>
              {t('Upstream channel availability and abnormal channel alerts')}
            </CardDescription>
          </div>
          <Button
            variant='ghost'
            size='sm'
            className='h-7 gap-1 px-2 text-xs'
            render={<Link to='/channels' />}
          >
            {t('Channel management')}
            <ArrowUpRight className='size-3.5' />
          </Button>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-4 gap-2.5'>
            <div className='bg-muted/40 rounded-lg border px-3 py-2'>
              <div className='text-muted-foreground text-xs'>{t('Total')}</div>
              <div className='mt-0.5 text-base font-semibold tabular-nums'>
                {formatNumber(props.channels.total, locale)}
              </div>
            </div>
            <div className='bg-muted/40 rounded-lg border px-3 py-2'>
              <div className='text-muted-foreground text-xs'>
                {t('Enabled')}
              </div>
              <div className='mt-0.5 text-base font-semibold text-emerald-600 tabular-nums dark:text-emerald-400'>
                {formatNumber(props.channels.enabled, locale)}
              </div>
            </div>
            <div className='bg-muted/40 rounded-lg border px-3 py-2'>
              <div className='text-muted-foreground text-xs'>
                {t('Auto disabled')}
              </div>
              <div
                className={`mt-0.5 text-base font-semibold tabular-nums ${
                  props.channels.auto_disabled > 0
                    ? 'text-destructive'
                    : 'text-muted-foreground'
                }`}
              >
                {formatNumber(props.channels.auto_disabled, locale)}
              </div>
            </div>
            <div className='bg-muted/40 rounded-lg border px-3 py-2'>
              <div className='text-muted-foreground text-xs'>
                {t('Manual disabled')}
              </div>
              <div className='mt-0.5 text-base font-semibold tabular-nums'>
                {formatNumber(props.channels.manually_disabled, locale)}
              </div>
            </div>
          </div>

          {props.channels.disabled_channels.length > 0 ? (
            <div className='space-y-2'>
              <div className='flex items-center justify-between text-xs'>
                <span className='text-muted-foreground font-medium'>
                  {t('Disabled channels requiring attention')}
                </span>
                <span className='text-muted-foreground tabular-nums'>
                  {t('Availability')}: {formatOneDecimal(enabledRatio, locale)}%
                </span>
              </div>
              <div className='max-h-[132px] space-y-1.5 overflow-y-auto pr-1'>
                {props.channels.disabled_channels.map((channel) => (
                  <div
                    key={channel.id}
                    className='bg-muted/30 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs'
                  >
                    <div className='flex min-w-0 items-center gap-2'>
                      <span className='text-muted-foreground font-mono tabular-nums'>
                        #{channel.id}
                      </span>
                      <span className='truncate font-medium'>
                        {channel.name || `#${channel.id}`}
                      </span>
                      {channel.group && (
                        <GroupBadge group={channel.group} size='sm' />
                      )}
                    </div>
                    <div className='flex shrink-0 items-center gap-2'>
                      {channel.response_time > 0 && (
                        <span className='text-muted-foreground tabular-nums'>
                          {formatLatency(channel.response_time)}
                        </span>
                      )}
                      <StatusBadge
                        copyable={false}
                        variant={channel.status === 3 ? 'danger' : 'warning'}
                        label={
                          channel.status === 3
                            ? t('Auto disabled')
                            : t('Manual disabled')
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className='bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs text-emerald-600 dark:text-emerald-400'>
              <CheckCircle2 className='size-4 shrink-0' />
              <span>
                {props.channels.total > 0
                  ? t('All configured channels are currently enabled.')
                  : t('No channels configured yet.')}
              </span>
            </div>
          )}

          {props.runtime && (
            <div className='border-t pt-3'>
              <div className='mb-2 flex items-center justify-between'>
                <span className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
                  <Cpu className='size-3.5' />
                  {t('Runtime Snapshot')}
                </span>
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-6 gap-1 px-1.5 text-xs'
                  render={<Link to='/system-info' />}
                >
                  {t('System Info')}
                  <ArrowUpRight className='size-3' />
                </Button>
              </div>
              <div className='flex flex-wrap items-center gap-2 text-xs'>
                {props.runtime.monitor_sampled && (
                  <>
                    <Badge
                      variant='outline'
                      className='font-normal tabular-nums'
                    >
                      CPU {formatOneDecimal(props.runtime.cpu_usage, locale)}%
                    </Badge>
                    <Badge
                      variant='outline'
                      className='font-normal tabular-nums'
                    >
                      {t('Memory')}{' '}
                      {formatOneDecimal(props.runtime.memory_usage, locale)}%
                    </Badge>
                  </>
                )}
                {props.runtime.disk_usage > 0 && (
                  <Badge variant='outline' className='font-normal tabular-nums'>
                    {t('Disk')}{' '}
                    {formatOneDecimal(props.runtime.disk_usage, locale)}%
                  </Badge>
                )}
                <Badge variant='outline' className='font-normal tabular-nums'>
                  {t('Goroutines')}{' '}
                  {formatNumber(props.runtime.num_goroutine, locale)}
                </Badge>
                <Badge variant='outline' className='font-normal tabular-nums'>
                  {t('Heap')} {formatBytes(props.runtime.alloc_bytes)}
                </Badge>
                {props.runtime.disk_cache_enabled && (
                  <Badge variant='outline' className='font-normal tabular-nums'>
                    {t('Disk cache')}{' '}
                    {formatBytes(props.runtime.disk_cache_size_bytes)}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
