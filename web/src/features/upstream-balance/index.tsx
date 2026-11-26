import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  Bell,
  Globe,
  MailWarning,
  RefreshCw,
  Search,
  Settings2,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatCard } from '@/features/dashboard/components/ui/stat-card'
import { toIntlLocale } from '@/i18n/languages'
import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  getUpstreamBalanceOverview,
  refreshUpstreamBalances,
  testUpstreamBalanceAlertEmail,
  updateUpstreamBalanceSettings,
} from './api'
import { ChannelConfigDialog } from './components/channel-config-dialog'
import { GlobalSettingsDialog } from './components/global-settings-dialog'
import { SiteCard } from './components/site-card'
import { SiteConfigDialog } from './components/site-config-dialog'
import {
  formatCNY,
  formatCheckTime,
  formatPercentValue,
  formatUSD,
} from './lib/format'
import type {
  UpstreamBalanceChannelConfig,
  UpstreamBalanceChannelView,
  UpstreamBalanceSetting,
  UpstreamBalanceSiteConfig,
  UpstreamBalanceSiteView,
  UpstreamProviderType,
} from './types'

type FilterTab = 'all' | 'monitored' | 'low' | 'unconfigured' | 'ignored'

export function UpstreamBalance() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const isRoot = useAuthStore(
    (state) => (state.auth.user?.role ?? 0) >= ROLE.SUPER_ADMIN
  )

  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [keyword, setKeyword] = useState('')
  const [globalSettingsOpen, setGlobalSettingsOpen] = useState(false)
  const [editingSite, setEditingSite] =
    useState<UpstreamBalanceSiteView | null>(null)
  const [editingChannelTarget, setEditingChannelTarget] = useState<{
    siteName: string
    channel: UpstreamBalanceChannelView
  } | null>(null)
  const [refreshTarget, setRefreshTarget] = useState<{
    siteKey: string | null
    channelId: number | null
  }>({ siteKey: null, channelId: null })

  const overviewQuery = useQuery({
    queryKey: ['upstream-balance-overview'],
    queryFn: getUpstreamBalanceOverview,
  })

  const refreshMutation = useMutation({
    mutationFn: async (params?: {
      site_key?: string
      channel_id?: number
      send_alerts?: boolean
    }) => {
      setRefreshTarget({
        siteKey: params?.site_key ?? null,
        channelId: params?.channel_id ?? null,
      })
      return refreshUpstreamBalances(params)
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['upstream-balance-overview'], result.overview)
      if (result.summary.alert_email_error) {
        toast.error(
          t('Balances refreshed, but sending alert email failed: {{error}}', {
            error: result.summary.alert_email_error,
          })
        )
      } else if (result.summary.alert_email_sent) {
        toast.success(
          t('Refreshed balances and sent alert email for {{count}} item(s)', {
            count: result.summary.alerts_triggered,
          })
        )
      } else {
        toast.success(
          t('Refreshed {{sites}} site(s) and {{channels}} channel(s)', {
            sites: result.summary.refreshed_sites,
            channels: result.summary.refreshed_channels,
          })
        )
      }
    },
    onError: (error) => {
      handleServerError(error)
    },
    onSettled: () => {
      setRefreshTarget({ siteKey: null, channelId: null })
    },
  })

  const saveSettingsMutation = useMutation({
    mutationFn: updateUpstreamBalanceSettings,
    onSuccess: (overview) => {
      queryClient.setQueryData(['upstream-balance-overview'], overview)
      setGlobalSettingsOpen(false)
      setEditingSite(null)
      setEditingChannelTarget(null)
      toast.success(t('Upstream balance settings saved'))
    },
    onError: (error) => {
      handleServerError(error)
    },
  })

  const testEmailMutation = useMutation({
    mutationFn: testUpstreamBalanceAlertEmail,
    onSuccess: () => {
      toast.success(t('Test alert email sent'))
    },
    onError: (error) => {
      handleServerError(error)
    },
  })

  const data = overviewQuery.data

  const filteredSites = useMemo(() => {
    const list = data?.sites ?? []
    const q = keyword.trim().toLowerCase()
    return list.filter((site) => {
      switch (activeTab) {
        case 'monitored':
          if (
            site.snapshot.status === 'unconfigured' ||
            site.snapshot.status === 'ignored'
          ) {
            return false
          }
          break
        case 'low':
          if (site.snapshot.status !== 'low' && site.low_channel_count === 0) {
            return false
          }
          break
        case 'unconfigured':
          if (site.snapshot.status !== 'unconfigured') return false
          break
        case 'ignored':
          if (site.snapshot.status !== 'ignored') return false
          break
        default:
          break
      }
      if (!q) return true
      if (
        site.display_name.toLowerCase().includes(q) ||
        site.site_key.toLowerCase().includes(q)
      ) {
        return true
      }
      return site.channels.some(
        (ch) =>
          ch.channel_name.toLowerCase().includes(q) ||
          ch.channel_type_name.toLowerCase().includes(q) ||
          String(ch.channel_id) === q
      )
    })
  }, [data?.sites, activeTab, keyword])

  const handleSaveGlobalSettings = async (next: UpstreamBalanceSetting) => {
    await saveSettingsMutation.mutateAsync(next)
  }

  const handleSaveSiteConfig = async (
    siteKey: string,
    siteConfig: UpstreamBalanceSiteConfig
  ) => {
    if (!data) return
    const next: UpstreamBalanceSetting = {
      ...data.settings,
      sites: {
        ...data.settings.sites,
        [siteKey]: siteConfig,
      },
    }
    await saveSettingsMutation.mutateAsync(next)
  }

  const handleQuickSetProvider = async (
    siteKey: string,
    provider: UpstreamProviderType
  ) => {
    if (!data) return
    const existingSite = data.settings.sites[siteKey]
    const next: UpstreamBalanceSetting = {
      ...data.settings,
      sites: {
        ...data.settings.sites,
        [siteKey]: {
          name: existingSite?.name ?? '',
          provider_type: provider,
          cny_rate: existingSite?.cny_rate ?? null,
          reference_total_cny: existingSite?.reference_total_cny ?? null,
          alert_enabled: existingSite?.alert_enabled ?? true,
          min_balance_cny: existingSite?.min_balance_cny ?? null,
          min_percent: existingSite?.min_percent ?? null,
          user_id: existingSite?.user_id ?? '',
          note: existingSite?.note ?? '',
        },
      },
    }
    await saveSettingsMutation.mutateAsync(next)
    if (provider === 'new_api' || provider === 'sub2api') {
      refreshMutation.mutate({ site_key: siteKey, send_alerts: false })
    }
  }

  const handleSaveChannelConfig = async (
    channelId: number,
    channelConfig: UpstreamBalanceChannelConfig
  ) => {
    if (!data) return
    const next: UpstreamBalanceSetting = {
      ...data.settings,
      channels: {
        ...data.settings.channels,
        [String(channelId)]: channelConfig,
      },
    }
    await saveSettingsMutation.mutateAsync(next)
  }

  const renderMainBody = () => {
    if (overviewQuery.isLoading) {
      return (
        <LoadingState message={t('Loading upstream balance overview...')} />
      )
    }
    if (overviewQuery.isError) {
      return (
        <ErrorState
          title={t('Failed to load upstream balance overview')}
          onRetry={() => {
            void overviewQuery.refetch()
          }}
        />
      )
    }
    if (!data) {
      return null
    }
    return (
      <div className='space-y-5'>
        {!data.meta.email_configured ? (
          <Alert>
            <MailWarning className='h-4 w-4' />
            <AlertTitle>{t('Email delivery not configured')}</AlertTitle>
            <AlertDescription className='flex flex-wrap items-center justify-between gap-2'>
              <span>
                {t(
                  'Configure SMTP or Resend email settings before low-balance email alerts can be delivered.'
                )}
              </span>
              {isRoot ? (
                <Button
                  size='sm'
                  variant='outline'
                  render={<Link to='/system-settings/operations' />}
                >
                  {t('Go to Email Settings')}
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <StatCard
            title={t('Total Monitored Balance')}
            value={formatCNY(data.summary.total_balance_cny, locale)}
            description={`${formatUSD(data.summary.total_balance_usd, locale)} · ${t(
              'Last checked: {{time}}',
              {
                time: formatCheckTime(data.meta.last_checked_at, locale),
              }
            )}`}
            icon={Wallet}
            tone='accent-1'
          />
          <StatCard
            title={t('Monitored Sites')}
            value={`${data.summary.monitored_sites} / ${data.summary.total_sites}`}
            description={t('{{count}} unconfigured · {{ignored}} ignored', {
              count: data.summary.unconfigured_sites,
              ignored: data.summary.ignored_sites,
            })}
            icon={Globe}
            tone='accent-2'
          />
          <StatCard
            title={t('Low Balance Alerts')}
            value={String(data.summary.low_sites + data.summary.low_channels)}
            description={t('{{sites}} site(s) · {{channels}} channel(s)', {
              sites: data.summary.low_sites,
              channels: data.summary.low_channels,
            })}
            icon={AlertTriangle}
            tone='accent-3'
          />
          <StatCard
            title={t('Scheduled Monitor')}
            value={
              data.settings.enabled
                ? t('Every {{minutes}} min', {
                    minutes: data.settings.check_interval_minutes,
                  })
                : t('Paused')
            }
            description={
              [
                data.settings.default_min_balance_cny != null &&
                data.settings.default_min_balance_cny > 0
                  ? `< ${formatCNY(data.settings.default_min_balance_cny, locale)}`
                  : null,
                data.settings.default_min_percent != null &&
                data.settings.default_min_percent > 0
                  ? `< ${formatPercentValue(data.settings.default_min_percent, locale)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' / ') || t('No default threshold set')
            }
            icon={Bell}
            tone='accent-1'
          />
        </div>

        <div className='flex flex-wrap items-center justify-between gap-3'>
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as FilterTab)}
          >
            <TabsList>
              <TabsTrigger value='all'>
                {t('All')} ({data.summary.total_sites})
              </TabsTrigger>
              <TabsTrigger value='monitored'>
                {t('Monitored')} ({data.summary.monitored_sites})
              </TabsTrigger>
              <TabsTrigger value='low'>
                {t('Low Alert')} (
                {
                  data.sites.filter(
                    (site) =>
                      site.snapshot.status === 'low' ||
                      site.low_channel_count > 0
                  ).length
                }
                )
              </TabsTrigger>
              <TabsTrigger value='unconfigured'>
                {t('Unconfigured')} ({data.summary.unconfigured_sites})
              </TabsTrigger>
              <TabsTrigger value='ignored'>
                {t('Ignored')} ({data.summary.ignored_sites})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className='flex items-center gap-2'>
            {data.meta.skipped_channels_count > 0 ? (
              <Badge variant='outline' className='text-xs font-normal'>
                {t('{{count}} official channel(s) without custom URL hidden', {
                  count: data.meta.skipped_channels_count,
                })}
              </Badge>
            ) : null}
            <div className='relative w-64'>
              <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2' />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder={t('Search site, URL, or channel...')}
                className='pl-8'
              />
            </div>
          </div>
        </div>

        {filteredSites.length === 0 ? (
          <EmptyState
            title={t('No upstream sites found')}
            description={
              data.summary.total_sites === 0
                ? t(
                    'Add channels with custom upstream Base URLs in Channel Management to monitor their balances here.'
                  )
                : t(
                    'No upstream sites match the current filter or search query.'
                  )
            }
          />
        ) : (
          <div className='space-y-4'>
            {filteredSites.map((site) => (
              <SiteCard
                key={site.site_key}
                site={site}
                locale={locale}
                isRoot={isRoot}
                isRefreshing={refreshMutation.isPending}
                refreshingSiteKey={refreshTarget.siteKey}
                refreshingChannelId={refreshTarget.channelId}
                onRefreshSite={(siteKey) =>
                  refreshMutation.mutate({
                    site_key: siteKey,
                    send_alerts: false,
                  })
                }
                onRefreshChannel={(channelId) =>
                  refreshMutation.mutate({
                    channel_id: channelId,
                    send_alerts: false,
                  })
                }
                onQuickSetProvider={(siteKey, provider) => {
                  void handleQuickSetProvider(siteKey, provider)
                }}
                onEditSite={setEditingSite}
                onEditChannel={(targetSite, channel) =>
                  setEditingChannelTarget({
                    siteName: targetSite.display_name,
                    channel,
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              {t('Upstream Balance')}
            </h1>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t(
                'Monitor upstream New API & Sub2API account balances and per-channel quota limits with CNY/percentage email alerts.'
              )}
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              variant='outline'
              disabled={refreshMutation.isPending || overviewQuery.isLoading}
              onClick={() => refreshMutation.mutate({ send_alerts: false })}
            >
              <RefreshCw
                className={cn(
                  'mr-1.5 h-4 w-4',
                  refreshMutation.isPending && 'animate-spin'
                )}
              />
              {t('Refresh all')}
            </Button>
            {isRoot ? (
              <>
                <Button
                  type='button'
                  variant='outline'
                  disabled={
                    refreshMutation.isPending || overviewQuery.isLoading
                  }
                  onClick={() => refreshMutation.mutate({ send_alerts: true })}
                >
                  <Bell className='mr-1.5 h-4 w-4' />
                  {t('Check & Alert Now')}
                </Button>
                <Button
                  type='button'
                  disabled={overviewQuery.isLoading}
                  onClick={() => setGlobalSettingsOpen(true)}
                >
                  <Settings2 className='mr-1.5 h-4 w-4' />
                  {t('Alert Settings')}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </SectionPageLayout.Title>

      <SectionPageLayout.Content>
        {renderMainBody()}

        <GlobalSettingsDialog
          open={globalSettingsOpen}
          onOpenChange={setGlobalSettingsOpen}
          settings={data?.settings}
          emailConfigured={data?.meta.email_configured ?? false}
          isSaving={saveSettingsMutation.isPending}
          isSendingTest={testEmailMutation.isPending}
          onSave={handleSaveGlobalSettings}
          onTestEmail={async (notifyEmails) => {
            await testEmailMutation.mutateAsync({ notify_emails: notifyEmails })
          }}
        />

        <SiteConfigDialog
          open={editingSite !== null}
          onOpenChange={(open) => {
            if (!open) setEditingSite(null)
          }}
          site={editingSite}
          defaultExchangeRate={data?.meta.default_usd_exchange_rate ?? 7.3}
          isSaving={saveSettingsMutation.isPending}
          onSave={handleSaveSiteConfig}
        />

        <ChannelConfigDialog
          open={editingChannelTarget !== null}
          onOpenChange={(open) => {
            if (!open) setEditingChannelTarget(null)
          }}
          channel={editingChannelTarget?.channel ?? null}
          siteName={editingChannelTarget?.siteName ?? ''}
          isSaving={saveSettingsMutation.isPending}
          onSave={handleSaveChannelConfig}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
