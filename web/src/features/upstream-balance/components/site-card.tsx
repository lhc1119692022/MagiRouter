import {
  AlertTriangle,
  Bell,
  ChevronDown,
  ChevronRight,
  Clock,
  Globe,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { GroupBadge } from '@/components/group-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

import {
  formatCNY,
  formatCheckTime,
  formatPercentValue,
  formatRate,
  formatUSD,
  getBalanceSourceLabel,
  getPercentSourceLabel,
  getProviderLabel,
  getWindowPeriodLabel,
} from '../lib/format'
import type {
  UpstreamBalanceChannelView,
  UpstreamBalanceSiteView,
  UpstreamBalanceStatus,
  UpstreamProviderType,
} from '../types'

interface SiteCardProps {
  site: UpstreamBalanceSiteView
  locale: string | undefined
  isRoot: boolean
  isRefreshing: boolean
  refreshingSiteKey: string | null
  refreshingChannelId: number | null
  onRefreshSite: (siteKey: string) => void
  onRefreshChannel: (channelId: number) => void
  onQuickSetProvider: (siteKey: string, provider: UpstreamProviderType) => void
  onEditSite: (site: UpstreamBalanceSiteView) => void
  onEditChannel: (
    site: UpstreamBalanceSiteView,
    channel: UpstreamBalanceChannelView
  ) => void
}

function StatusBadge(props: { status: UpstreamBalanceStatus }) {
  const { t } = useTranslation()
  switch (props.status) {
    case 'low':
      return (
        <Badge variant='destructive' className='gap-1'>
          <AlertTriangle className='h-3 w-3' />
          {t('Low balance')}
        </Badge>
      )
    case 'error':
      return <Badge variant='destructive'>{t('Query failed')}</Badge>
    case 'ok':
      return (
        <Badge
          variant='secondary'
          className='bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
        >
          {t('Healthy')}
        </Badge>
      )
    case 'unlimited':
      return <Badge variant='secondary'>{t('Unlimited')}</Badge>
    case 'follows_site':
      return <Badge variant='outline'>{t('Follows site balance')}</Badge>
    case 'ignored':
      return <Badge variant='outline'>{t('Ignored')}</Badge>
    default:
      return (
        <Badge
          variant='outline'
          className='border-amber-500/40 text-amber-700 dark:text-amber-300'
        >
          {t('Unconfigured')}
        </Badge>
      )
  }
}

function ChannelStatusTag(props: { channelStatus: number }) {
  const { t } = useTranslation()
  if (props.channelStatus === 1) {
    return null
  }
  if (props.channelStatus === 3) {
    return (
      <Badge variant='destructive' className='text-[11px]'>
        {t('Auto disabled')}
      </Badge>
    )
  }
  return (
    <Badge variant='outline' className='text-[11px]'>
      {t('Disabled')}
    </Badge>
  )
}

export function SiteCard(props: SiteCardProps) {
  const { t } = useTranslation()
  const site = props.site
  const snap = site.snapshot
  const [expanded, setExpanded] = useState(
    () => site.limited_channel_count > 0 || site.low_channel_count > 0
  )

  const isThisSiteRefreshing =
    props.isRefreshing &&
    (props.refreshingSiteKey === null ||
      props.refreshingSiteKey === site.site_key)
  const isUnconfigured = snap.status === 'unconfigured'
  const isIgnored = snap.status === 'ignored'
  const isLow = snap.status === 'low' || site.low_channel_count > 0
  const balanceSourceLabel = getBalanceSourceLabel(snap.balance_source, t)
  const percentSourceLabel = getPercentSourceLabel(snap.percent_source, t)

  const alertRuleParts = [
    site.effective_min_balance_cny != null
      ? `< ${formatCNY(site.effective_min_balance_cny, props.locale)}`
      : null,
    site.effective_min_percent != null
      ? `< ${formatPercentValue(site.effective_min_percent, props.locale)}`
      : null,
  ].filter(Boolean)

  let alertRuleText = t('Not set')
  if (!site.effective_alert_enabled) {
    alertRuleText = t('Disabled')
  } else if (alertRuleParts.length > 0) {
    alertRuleText = alertRuleParts.join(' / ')
  }

  return (
    <Card
      className={cn(
        'transition-colors',
        isLow && 'border-destructive/50',
        isIgnored && 'opacity-70'
      )}
    >
      <CardHeader className='space-y-3 pb-3'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0 flex-1 space-y-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <Globe className='text-muted-foreground h-4 w-4 shrink-0' />
              <h3 className='truncate text-base font-semibold'>
                {site.display_name}
              </h3>
              <Badge variant='secondary'>
                {getProviderLabel(site.effective_provider, t)}
              </Badge>
              <StatusBadge status={snap.status} />
              {site.low_channel_count > 0 ? (
                <Badge variant='destructive'>
                  {t('{{count}} channel low', {
                    count: site.low_channel_count,
                  })}
                </Badge>
              ) : null}
            </div>
            <div className='text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
              <span className='font-mono break-all'>{site.site_key}</span>
              <span>
                {t('{{enabled}}/{{total}} enabled channels', {
                  enabled: site.enabled_channel_count,
                  total: site.channels.length,
                })}
              </span>
              <span>
                1 USD = ¥{formatRate(site.effective_cny_rate, props.locale)}
                {site.custom_cny_rate ? ` (${t('Custom')})` : ''}
              </span>
              {balanceSourceLabel ? <span>{balanceSourceLabel}</span> : null}
            </div>
            {site.config.note ? (
              <p className='text-muted-foreground text-xs'>
                {site.config.note}
              </p>
            ) : null}
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            {isUnconfigured && props.isRoot ? (
              <>
                <Button
                  type='button'
                  size='sm'
                  variant='secondary'
                  onClick={() =>
                    props.onQuickSetProvider(site.site_key, 'new_api')
                  }
                >
                  {t('Set as New API')}
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='secondary'
                  onClick={() =>
                    props.onQuickSetProvider(site.site_key, 'sub2api')
                  }
                >
                  {t('Set as Sub2API')}
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  onClick={() =>
                    props.onQuickSetProvider(site.site_key, 'ignore')
                  }
                >
                  {t('Ignore')}
                </Button>
              </>
            ) : null}

            {!isUnconfigured && !isIgnored ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={isThisSiteRefreshing}
                onClick={() => props.onRefreshSite(site.site_key)}
              >
                <RefreshCw
                  className={cn(
                    'mr-1.5 h-3.5 w-3.5',
                    isThisSiteRefreshing && 'animate-spin'
                  )}
                />
                {t('Refresh')}
              </Button>
            ) : null}

            {props.isRoot ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => props.onEditSite(site)}
              >
                <Settings2 className='mr-1.5 h-3.5 w-3.5' />
                {t('Configure')}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {!isUnconfigured && !isIgnored ? (
          <div className='bg-muted/35 grid grid-cols-1 gap-4 rounded-lg border p-3.5 md:grid-cols-3'>
            <div className='space-y-1'>
              <p className='text-muted-foreground text-xs'>
                {t('Site Account Balance')}
              </p>
              <div className='flex items-baseline gap-2'>
                <span
                  className={cn(
                    'text-2xl font-bold tabular-nums',
                    snap.status === 'low' && 'text-destructive'
                  )}
                >
                  {snap.unlimited
                    ? t('Unlimited')
                    : formatCNY(snap.balance_cny, props.locale)}
                </span>
                {snap.balance_usd != null ? (
                  <span className='text-muted-foreground text-xs tabular-nums'>
                    ({formatUSD(snap.balance_usd, props.locale)})
                  </span>
                ) : null}
              </div>
              {snap.used_usd != null ? (
                <p className='text-muted-foreground text-xs tabular-nums'>
                  {t('Used: {{amount}}', {
                    amount: formatCNY(
                      snap.used_usd * site.effective_cny_rate,
                      props.locale
                    ),
                  })}{' '}
                  ({formatUSD(snap.used_usd, props.locale)})
                </p>
              ) : null}
            </div>

            <div className='space-y-2'>
              <div className='flex items-center justify-between text-xs'>
                <span className='text-muted-foreground'>
                  {t('Remaining Ratio')}
                  {percentSourceLabel ? ` · ${percentSourceLabel}` : ''}
                </span>
                <span className='font-medium tabular-nums'>
                  {formatPercentValue(snap.remaining_percent, props.locale)}
                </span>
              </div>
              {snap.remaining_percent != null ? (
                <Progress
                  value={Math.max(0, Math.min(100, snap.remaining_percent))}
                  className={cn(
                    snap.status === 'low' &&
                      '[&_[data-slot=progress-indicator]]:bg-destructive'
                  )}
                />
              ) : (
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Set a reference budget in site settings to track remaining percentage.'
                  )}
                </p>
              )}
              {snap.total_cny != null ? (
                <p className='text-muted-foreground text-xs tabular-nums'>
                  {t('Total: {{amount}}', {
                    amount: formatCNY(snap.total_cny, props.locale),
                  })}
                </p>
              ) : null}
            </div>

            <div className='space-y-1.5 text-xs'>
              <div className='flex items-center gap-1.5'>
                <Bell className='text-muted-foreground h-3.5 w-3.5' />
                <span className='text-muted-foreground'>
                  {t('Alert Rules:')}
                </span>
                <span
                  className={cn(
                    site.effective_alert_enabled &&
                      alertRuleParts.length > 0 &&
                      'font-medium tabular-nums'
                  )}
                >
                  {alertRuleText}
                </span>
              </div>
              <div className='text-muted-foreground flex items-center gap-1.5'>
                <Clock className='h-3.5 w-3.5' />
                <span>
                  {t('Checked: {{time}}', {
                    time: formatCheckTime(snap.checked_at, props.locale),
                  })}
                </span>
              </div>
              {snap.last_alert_at ? (
                <p className='text-amber-600 dark:text-amber-400'>
                  {t('Last alerted: {{time}}', {
                    time: formatCheckTime(snap.last_alert_at, props.locale),
                  })}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {snap.error ? (
          <div className='bg-destructive/10 text-destructive border-destructive/25 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs'>
            <span className='break-words'>{snap.error}</span>
            {props.isRoot ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => props.onEditSite(site)}
              >
                {t('Check site settings')}
              </Button>
            ) : null}
          </div>
        ) : null}

        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger
            render={
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='text-muted-foreground hover:text-foreground -ml-2 h-8 px-2 text-xs'
              />
            }
          >
            {expanded ? (
              <ChevronDown className='mr-1 h-4 w-4' />
            ) : (
              <ChevronRight className='mr-1 h-4 w-4' />
            )}
            {t('Associated channels ({{count}})', {
              count: site.channels.length,
            })}
            {site.limited_channel_count > 0 ? (
              <Badge variant='secondary' className='ml-2 text-[11px]'>
                {t('{{count}} with independent limit', {
                  count: site.limited_channel_count,
                })}
              </Badge>
            ) : null}
          </CollapsibleTrigger>

          <CollapsibleContent className='mt-2 space-y-2'>
            {site.channels.map((channel) => {
              const chSnap = channel.snapshot
              const isChRefreshing =
                props.isRefreshing &&
                props.refreshingChannelId === channel.channel_id
              const chPercentSrc = getPercentSourceLabel(
                chSnap.percent_source,
                t
              )

              return (
                <div
                  key={channel.channel_id}
                  className={cn(
                    'flex flex-col gap-2.5 rounded-lg border p-3',
                    chSnap.status === 'low' &&
                      'border-destructive/50 bg-destructive/5'
                  )}
                >
                  <div className='flex flex-wrap items-start justify-between gap-2'>
                    <div className='min-w-0 space-y-1'>
                      <div className='flex flex-wrap items-center gap-1.5'>
                        <span className='text-sm font-medium'>
                          {channel.channel_name}
                        </span>
                        <span className='text-muted-foreground font-mono text-xs'>
                          #{channel.channel_id}
                        </span>
                        <Badge variant='outline' className='text-[11px]'>
                          {channel.channel_type_name}
                        </Badge>
                        {channel.group ? (
                          <GroupBadge group={channel.group} />
                        ) : null}
                        <ChannelStatusTag
                          channelStatus={channel.channel_status}
                        />
                        <StatusBadge status={chSnap.status} />
                      </div>

                      {chSnap.has_independent_limit && (
                        <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-xs'>
                          <span
                            className={cn(
                              'font-semibold tabular-nums',
                              chSnap.status === 'low' && 'text-destructive'
                            )}
                          >
                            {t('Channel quota: {{cny}}', {
                              cny: formatCNY(chSnap.balance_cny, props.locale),
                            })}
                            {chSnap.balance_usd != null
                              ? ` (${formatUSD(chSnap.balance_usd, props.locale)})`
                              : ''}
                          </span>
                          {chSnap.total_cny != null ? (
                            <span className='text-muted-foreground tabular-nums'>
                              {t('Limit: {{cny}}', {
                                cny: formatCNY(chSnap.total_cny, props.locale),
                              })}
                            </span>
                          ) : null}
                          {chSnap.remaining_percent != null ? (
                            <span className='text-muted-foreground tabular-nums'>
                              {t('Remaining: {{pct}}', {
                                pct: formatPercentValue(
                                  chSnap.remaining_percent,
                                  props.locale
                                ),
                              })}
                              {chPercentSrc ? ` (${chPercentSrc})` : ''}
                            </span>
                          ) : null}
                          {chSnap.expires_at ? (
                            <span className='text-muted-foreground'>
                              {t('Expires: {{time}}', {
                                time: formatCheckTime(
                                  chSnap.expires_at,
                                  props.locale
                                ),
                              })}
                            </span>
                          ) : null}
                        </div>
                      )}
                      {!chSnap.has_independent_limit &&
                      chSnap.follows_site_balance ? (
                        <p className='text-muted-foreground text-xs'>
                          {t(
                            'Unlimited API key — spends directly from site account balance.'
                          )}
                        </p>
                      ) : null}

                      {chSnap.has_independent_limit &&
                      chSnap.remaining_percent != null ? (
                        <div className='max-w-xs pt-0.5'>
                          <Progress
                            value={Math.max(
                              0,
                              Math.min(100, chSnap.remaining_percent)
                            )}
                            className={cn(
                              chSnap.status === 'low' &&
                                '[&_[data-slot=progress-indicator]]:bg-destructive'
                            )}
                          />
                        </div>
                      ) : null}

                      {chSnap.windows && chSnap.windows.length > 0 ? (
                        <div className='flex flex-wrap gap-1.5 pt-1'>
                          {chSnap.windows.map((win) => (
                            <Badge
                              key={win.period}
                              variant='secondary'
                              className='text-[11px] font-normal tabular-nums'
                            >
                              {getWindowPeriodLabel(win.period, t)}:{' '}
                              {win.remaining_cny != null
                                ? `${formatCNY(win.remaining_cny, props.locale)} / ${formatCNY(win.limit_cny, props.locale)}`
                                : formatCNY(win.limit_cny, props.locale)}
                              {win.remaining_percent != null
                                ? ` (${formatPercentValue(win.remaining_percent, props.locale)})`
                                : ''}
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      {chSnap.error ? (
                        <p className='text-destructive text-xs break-words'>
                          {chSnap.error}
                        </p>
                      ) : null}
                    </div>

                    <div className='flex items-center gap-1.5'>
                      {channel.effective_provider &&
                      channel.effective_provider !== 'ignore' ? (
                        <Button
                          type='button'
                          size='sm'
                          variant='ghost'
                          disabled={isChRefreshing}
                          onClick={() =>
                            props.onRefreshChannel(channel.channel_id)
                          }
                          aria-label={t('Refresh channel {{name}}', {
                            name: channel.channel_name,
                          })}
                        >
                          <RefreshCw
                            className={cn(
                              'h-3.5 w-3.5',
                              isChRefreshing && 'animate-spin'
                            )}
                          />
                        </Button>
                      ) : null}
                      {props.isRoot ? (
                        <Button
                          type='button'
                          size='sm'
                          variant='ghost'
                          onClick={() => props.onEditChannel(site, channel)}
                          aria-label={t('Configure channel {{name}}', {
                            name: channel.channel_name,
                          })}
                        >
                          <SlidersHorizontal className='h-3.5 w-3.5' />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
