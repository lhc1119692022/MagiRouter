/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { isPublishableApiUrl } from '@/features/dashboard/lib/api-info'
import { fetchTokenKey, getApiKeys } from '@/features/keys/api'
import { API_KEY_STATUS } from '@/features/keys/constants'
import type { ApiKey } from '@/features/keys/types'
import { ENDPOINT_TYPES } from '@/features/pricing/constants'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useStatus } from '@/hooks/use-status'
import { getUserModels } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import '@/styles/dashboard-overview.css'

import {
  useApiInfo,
  useDashboardContentVisibility,
} from '../../hooks/use-status-data'
import { DashboardSectionNavigation } from '../dashboard-section-navigation'
import { AnnouncementsPanel } from './announcements-panel'
import { FAQPanel } from './faq-panel'
import { GroupStatusPanel } from './group-status-panel'
import { SummaryCards } from './summary-cards'
import { UsageTrendPanel } from './usage-trend-panel'
import { useOverviewReport } from './use-overview-report'

const SETUP_GUIDE_VISIBILITY_STORAGE_KEY =
  'dashboard_overview_setup_guide_expanded'

const REQUEST_PROTOCOLS = [
  {
    id: ENDPOINT_TYPES.OPENAI_RESPONSE,
    label: 'Responses',
    path: '/v1/responses',
  },
  { id: ENDPOINT_TYPES.OPENAI, label: 'Chat', path: '/v1/chat/completions' },
  { id: ENDPOINT_TYPES.ANTHROPIC, label: 'Anthropic', path: '/v1/messages' },
] as const

type RequestProtocol = (typeof REQUEST_PROTOCOLS)[number]

interface StartStep {
  title: string
  description: string
  action: string
  to: '/keys' | '/wallet' | '/playground'
  completed: boolean
}

interface RequestExample {
  protocol: RequestProtocol
  endpoint: string
  model: string
  modelStatus: string
  keyName: string
  keyId?: number
  displayKey: string
  ready: boolean
}

function getSavedSetupGuideExpanded(): boolean | null {
  if (typeof window === 'undefined') return null
  const saved = window.localStorage.getItem(SETUP_GUIDE_VISIBILITY_STORAGE_KEY)
  if (saved === 'expanded') return true
  if (saved === 'collapsed') return false
  return null
}

function saveSetupGuideExpanded(expanded: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    SETUP_GUIDE_VISIBILITY_STORAGE_KEY,
    expanded ? 'expanded' : 'collapsed'
  )
}

function getPreferredKey(keys: ApiKey[]): ApiKey | null {
  const now = Math.floor(Date.now() / 1000)
  return (
    keys.find(
      (item) =>
        item.status === API_KEY_STATUS.ENABLED &&
        (item.expired_time == null ||
          item.expired_time === -1 ||
          item.expired_time >= now) &&
        (item.unlimited_quota !== false || item.remain_quota > 0)
    ) ?? null
  )
}

function formatDisplayKey(key?: string): string {
  if (!key || key.length <= 14) return 'sk-…'
  return `${key.slice(0, 7)}…${key.slice(-4)}`
}

function buildCurlCommand(args: {
  protocol: RequestProtocol
  endpoint: string
  apiKey: string
  model: string
}): string {
  const anthropic = args.protocol.id === ENDPOINT_TYPES.ANTHROPIC
  const input = 'Say hello in one sentence.'
  const body =
    args.protocol.id === ENDPOINT_TYPES.OPENAI_RESPONSE
      ? { model: args.model, input }
      : {
          model: args.model,
          ...(anthropic && { max_tokens: 128 }),
          messages: [{ role: 'user', content: input }],
        }
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  return [
    `curl ${quote(args.endpoint)} \\`,
    '  -H "Content-Type: application/json" \\',
    `  -H ${quote(anthropic ? `x-api-key: ${args.apiKey}` : `Authorization: Bearer ${args.apiKey}`)} \\`,
    ...(anthropic ? ['  -H "anthropic-version: 2023-06-01" \\'] : []),
    `  -d ${quote(JSON.stringify(body))}`,
  ].join('\n')
}

function StartStepItem(props: { step: StartStep; index: number }) {
  return (
    <li className='setup-step-row'>
      <span className='setup-step-left'>
        <span
          className={
            props.step.completed ? 'setup-step-mark is-done' : 'setup-step-mark'
          }
        >
          {props.step.completed ? (
            <Check size={12} aria-hidden='true' />
          ) : (
            props.index + 1
          )}
        </span>
        <span className='min-w-0'>
          <span className='setup-step-name block truncate'>
            {props.step.title}
          </span>
          <span className='setup-step-desc block truncate'>
            {props.step.description}
          </span>
        </span>
      </span>
      <Link
        to={props.step.to}
        search={
          props.step.to === '/keys' && !props.step.completed
            ? { action: 'create' }
            : undefined
        }
        className='el-btn el-btn-xs el-btn-white'
      >
        {props.step.action}
      </Link>
    </li>
  )
}

function RequestCopyAction(props: {
  example: RequestExample
  expanded?: boolean
}) {
  const { t } = useTranslation()
  const [isCopying, setIsCopying] = useState(false)
  const { copyToClipboard } = useCopyToClipboard({ notify: false })
  const handleCopyRequest = async () => {
    if (!props.example.ready || !props.example.keyId || isCopying) return

    setIsCopying(true)
    try {
      const result = await fetchTokenKey(props.example.keyId)
      const key = result.success && result.data?.key ? result.data.key : ''
      if (!key) {
        handleServerError(result, t('Failed to copy to clipboard'))
        return
      }

      const realCurl = buildCurlCommand({
        protocol: props.example.protocol,
        endpoint: props.example.endpoint,
        apiKey: `sk-${key}`,
        model: props.example.model,
      })
      const copied = await copyToClipboard(realCurl)
      if (copied) {
        toast.success(t('Copied to clipboard'))
      } else {
        toast.error(t('Failed to copy to clipboard'))
      }
    } catch (error) {
      handleServerError(error, t('Failed to copy to clipboard'))
    } finally {
      setIsCopying(false)
    }
  }

  if (!props.example.ready) {
    if (props.example.keyId) {
      return (
        <span className='text-muted-foreground text-xs' role='status'>
          {props.example.modelStatus}
        </span>
      )
    }
    return (
      <Link
        to='/keys'
        search={{ action: 'create' }}
        className='el-btn el-btn-xs el-btn-white'
      >
        {t('Create API Key')}
      </Link>
    )
  }
  const label = props.expanded ? t('Copy cURL') : t('Copy first request')
  return (
    <Button
      type='button'
      className='el-btn el-btn-xs el-btn-white'
      disabled={isCopying}
      onClick={handleCopyRequest}
    >
      {isCopying ? t('Loading') : label}
    </Button>
  )
}

function RequestPreview(props: {
  example: RequestExample
  supported: Set<string>
  onProtocolChange: (protocol: RequestProtocol) => void
}) {
  const { t } = useTranslation()
  const previewCurl = buildCurlCommand({
    protocol: props.example.protocol,
    endpoint: props.example.endpoint,
    apiKey: props.example.displayKey,
    model: props.example.model,
  })

  return (
    <div className='setup-snippet-box'>
      <div className='setup-snippet-head'>
        <div
          className='setup-snippet-tabs'
          role='group'
          aria-label={t('First API request')}
        >
          {REQUEST_PROTOCOLS.map((option) => (
            <button
              key={option.id}
              type='button'
              className={cn(
                'setup-snippet-tab',
                option.id === props.example.protocol.id && 'is-active'
              )}
              aria-pressed={option.id === props.example.protocol.id}
              disabled={!props.supported.has(option.id)}
              onClick={() => props.onProtocolChange(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <RequestCopyAction example={props.example} expanded />
      </div>

      {props.example.model ? (
        <pre className='setup-snippet-pre'>
          <code>{previewCurl}</code>
        </pre>
      ) : (
        <p className='setup-snippet-pre'>{props.example.modelStatus}</p>
      )}

      <div className='setup-snippet-foot'>
        <span className='truncate'>
          {props.example.keyId
            ? props.example.keyName
            : t('Create an API key to unlock the real request')}
        </span>
        <span className='tabular-nums'>POST {props.example.protocol.path}</span>
      </div>
    </div>
  )
}

export function OverviewDashboard() {
  const { t } = useTranslation()
  const setupGuideId = useId()
  const setupGuideToggleRef = useRef<HTMLButtonElement>(null)
  const user = useAuthStore((state) => state.auth.user)
  const { items: apiInfoItems } = useApiInfo()
  const { status } = useStatus()
  const {
    quickstart: showQuickstart,
    report: showReport,
    distributions: showDistributions,
    announcements: showAnnouncementsPanel,
    faq: showFAQPanel,
    uptimeKuma: showUptimePanel,
  } = useDashboardContentVisibility()
  const report = useOverviewReport()
  const [manualSetupGuideExpanded, setManualSetupGuideExpanded] = useState<
    boolean | null
  >(() => getSavedSetupGuideExpanded())

  const requestCount = Number(user?.request_count ?? 0)
  const remainQuota = Number(user?.quota ?? 0)
  const usedQuota = Number(user?.used_quota ?? 0)

  const apiKeysQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'api-keys', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const result = requireServerSuccess(await getApiKeys({ p: 1, size: 10 }))
      return result.data
    },
    staleTime: 60 * 1000,
  })

  const modelsQuery = useQuery({
    enabled: showQuickstart && Boolean(user?.id),
    queryKey: ['dashboard', 'overview', 'user-models', user?.id],
    queryFn: async () => {
      const result = requireServerSuccess(await getUserModels())
      return result.success ? (result.data ?? []) : []
    },
    staleTime: 5 * 60 * 1000,
  })

  const preferredKey = useMemo(
    () => getPreferredKey(apiKeysQuery.data?.items ?? []),
    [apiKeysQuery.data]
  )

  const catalog = usePricingData(
    showQuickstart && Boolean(modelsQuery.data?.length)
  )
  const [requestedProtocol, setRequestedProtocol] = useState<RequestProtocol>(
    REQUEST_PROTOCOLS[0]
  )
  const supportedModels = useMemo(() => {
    const permitted = new Set(modelsQuery.data)
    const keyModels = preferredKey?.model_limits_enabled
      ? new Set(
          (preferredKey.model_limits ?? '')
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean)
        )
      : null
    const matches = new Map<string, string>()
    for (const model of catalog.models) {
      if (
        !permitted.has(model.model_name) ||
        (keyModels && !keyModels.has(model.model_name))
      ) {
        continue
      }
      for (const endpoint of model.supported_endpoint_types ?? []) {
        if (!matches.has(endpoint)) matches.set(endpoint, model.model_name)
      }
    }
    return matches
  }, [catalog.models, modelsQuery.data, preferredKey])
  const protocol = supportedModels.has(requestedProtocol.id)
    ? requestedProtocol
    : (REQUEST_PROTOCOLS.find((option) => supportedModels.has(option.id)) ??
      REQUEST_PROTOCOLS[0])
  const selectedModel = supportedModels.get(protocol.id) ?? ''
  let modelStatus = t('No available models')
  if (modelsQuery.isPending || catalog.isLoading) modelStatus = t('Loading')
  if (modelsQuery.isError || catalog.error) {
    modelStatus = t('Failed to load models')
  }

  const startSteps = useMemo<StartStep[]>(
    () => [
      {
        title: t('Create API Key'),
        description: preferredKey
          ? preferredKey.name
          : t('Create a key for your app or service'),
        action: preferredKey ? t('Manage Keys') : t('Create key'),
        to: '/keys',
        completed: Boolean(preferredKey),
      },
      {
        title: t('Check account balance'),
        description: `${t('Available Balance')}: ${user?.quota == null ? '—' : formatQuota(user.quota)}`,
        action: t('Recharge'),
        to: '/wallet',
        completed: remainQuota > 0 || usedQuota > 0,
      },
      {
        title: t('Send your first request'),
        description: t('Verify routing with Playground or your client'),
        action: t('Open studio'),
        to: '/playground',
        completed: requestCount > 0,
      },
    ],
    [preferredKey, remainQuota, requestCount, t, usedQuota, user?.quota]
  )

  const requestExample = useMemo<RequestExample>(() => {
    const serverAddress = status?.server_address
    const published = apiInfoItems[0]?.url
    const fallback =
      typeof serverAddress === 'string' && isPublishableApiUrl(serverAddress)
        ? serverAddress
        : window.location.origin
    const root = (published || fallback)
      .replace(/\/+$/, '')
      .replace(/\/v1(?:\/(?:chat\/completions|responses|messages))?$/, '')
    const endpoint = `${root}${protocol.path}`
    const model = selectedModel
    const keyName = preferredKey?.name ?? t('No API key yet')
    const ready = Boolean(preferredKey?.id && model)

    return {
      protocol,
      endpoint,
      model,
      modelStatus,
      keyName,
      keyId: preferredKey?.id,
      displayKey: preferredKey
        ? formatDisplayKey(`sk-${preferredKey.key}`)
        : 'sk-...',
      ready,
    }
  }, [
    apiInfoItems,
    status?.server_address,
    modelStatus,
    preferredKey,
    protocol,
    selectedModel,
    t,
  ])

  const completedStepCount = startSteps.filter((step) => step.completed).length
  const setupComplete = completedStepCount === startSteps.length
  const setupStatusReady = apiKeysQuery.isSuccess && Boolean(user)
  const setupGuideExpanded = manualSetupGuideExpanded ?? false

  const handleSetupGuideToggle = () => {
    const nextExpanded = !setupGuideExpanded
    setManualSetupGuideExpanded(nextExpanded)
    saveSetupGuideExpanded(nextExpanded)
    if (!nextExpanded) {
      setupGuideToggleRef.current?.focus({ preventScroll: true })
    }
  }

  return (
    <SectionPageLayout scrollWithDocument>
      <SectionPageLayout.Title>{t('Console')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <DashboardSectionNavigation current='overview' />
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='dashboard-overview'>
          {showQuickstart && (
            <section
              className={cn(
                'setup-guide-card',
                !setupGuideExpanded && 'is-collapsed'
              )}
              aria-label={t('Quickstart')}
            >
              <div className='setup-guide-top'>
                <div className='setup-guide-title-row'>
                  <span className='setup-guide-title'>{t('Quickstart')}</span>
                  {setupStatusReady && (
                    <span
                      className={cn(
                        'setup-progress-pill tabular-nums',
                        setupComplete && 'is-done'
                      )}
                    >
                      {t('Setup progress: {{completed}}/{{total}}', {
                        completed: completedStepCount,
                        total: startSteps.length,
                      })}
                    </span>
                  )}
                  {!setupGuideExpanded && requestExample.ready && (
                    <span className='console-head-meta'>
                      {t('Copy your first request using an active key.')}
                    </span>
                  )}
                </div>
                <div className='setup-guide-actions'>
                  {!setupGuideExpanded && apiKeysQuery.isSuccess && (
                    <RequestCopyAction example={requestExample} />
                  )}
                  <button
                    ref={setupGuideToggleRef}
                    type='button'
                    className='el-btn el-btn-xs el-btn-ghost'
                    aria-expanded={setupGuideExpanded}
                    aria-controls={setupGuideId}
                    aria-label={
                      setupGuideExpanded
                        ? t('Hide setup guide')
                        : t('Show setup guide')
                    }
                    onClick={handleSetupGuideToggle}
                  >
                    {setupGuideExpanded ? t('Collapse') : t('Expand')}
                  </button>
                </div>
              </div>
              <div
                id={setupGuideId}
                className='overview-setup-body'
                hidden={!setupGuideExpanded}
              >
                {setupGuideExpanded && (
                  <>
                    <ol className='setup-steps-list'>
                      {startSteps.map((step, index) => (
                        <StartStepItem
                          key={step.to}
                          step={step}
                          index={index}
                        />
                      ))}
                    </ol>
                    <RequestPreview
                      example={requestExample}
                      supported={new Set(supportedModels.keys())}
                      onProtocolChange={setRequestedProtocol}
                    />
                  </>
                )}
              </div>
            </section>
          )}
          <SummaryCards keyCount={apiKeysQuery.data?.total} report={report} />
          {showReport ? (
            <UsageTrendPanel
              report={report}
              showDistributions={showDistributions}
              notices={
                showAnnouncementsPanel ? <AnnouncementsPanel /> : undefined
              }
            />
          ) : (
            showAnnouncementsPanel && <AnnouncementsPanel />
          )}

          {(showUptimePanel || showFAQPanel) && (
            <div className='overview-pair overview-bottom'>
              {showUptimePanel && <GroupStatusPanel />}
              {showFAQPanel && <FAQPanel />}
            </div>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
