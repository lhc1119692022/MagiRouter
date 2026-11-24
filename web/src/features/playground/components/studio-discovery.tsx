import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Table } from '@/components/ui/table'
import {
  getCreationPresetsErrorMessage,
  presetAvailable,
  supportsStudioTask,
  useCreationPresets,
  type StudioMode,
} from '@/features/creation/presets'
import { SceneArt } from '@/features/creation/scene-art'
import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import { formatUptimePct } from '@/features/performance-metrics/lib/format'
import type { PerfModelSummary } from '@/features/performance-metrics/types'
import { usePricingData } from '@/features/pricing/hooks'
import {
  isMeasuredRate,
  monitoringWindowLabel,
} from '@/features/pricing/lib/monitored-requests'
import { REQUEST_PLUGIN_EFFORT_LABELS } from '@/features/task-plugins/lib/request-plugins'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { DEFAULT_CONFIG } from '../constants'
import { getComparisonFormats } from '../lib/comparison-formats'
import { resolveChatControls } from '../lib/parameters/playground-parameters'
import type { ModelOption } from '../types'
import { PlaygroundOfficialPrice } from './playground-price-quote'

interface DiscoveryProps {
  mode: StudioMode
  group: string
  currentModel: string
  currentPresetId?: string
  allowed: ModelOption[]
  loadingModels: boolean
  modelsError: Error | null
  retryModels: () => unknown
  busy: boolean
  onSelectModel: (model: string) => void
}

const titles = {
  chat: 'Text model comparison',
  image: 'Image model comparison',
  video: 'Video model comparison',
  audio: 'Audio model comparison',
} as const

type CompareStatusTone = 'available' | 'degraded' | 'unstable' | 'unmonitored'

interface CompareModelStatus {
  tone: CompareStatusTone
  label: string
  meta: string
  hint: string
}

interface CompareStatusState {
  perf: PerfModelSummary | undefined
  isError: boolean
  isPending: boolean
  monitoringHint: string
}

function resolveCompareModelStatus(
  state: CompareStatusState,
  t: TFunction
): CompareModelStatus {
  const rate = state.perf?.success_rate
  if (isMeasuredRate(rate)) {
    const meta = formatUptimePct(rate)
    if (rate >= 95) {
      return {
        tone: 'available',
        label: t('Available'),
        meta,
        hint: state.monitoringHint,
      }
    }
    if (rate >= 80) {
      return {
        tone: 'degraded',
        label: t('Degraded'),
        meta,
        hint: state.monitoringHint,
      }
    }
    return {
      tone: 'unstable',
      label: t('Unstable'),
      meta,
      hint: state.monitoringHint,
    }
  }
  if (state.isError) {
    const fallback = t('Monitoring unavailable')
    return {
      tone: 'available',
      label: t('Available'),
      meta: fallback,
      hint: fallback,
    }
  }
  if (state.isPending) {
    return {
      tone: 'available',
      label: t('Available'),
      meta: '',
      hint: '',
    }
  }
  return {
    tone: 'unmonitored',
    label: t('Available'),
    meta: t('Not monitored'),
    hint: t(
      'Channel enabled; no request samples recorded in the last 24 hours.'
    ),
  }
}

export function StudioDiscovery(props: DiscoveryProps) {
  const { t, i18n } = useTranslation()
  const published = useCreationPresets()
  const catalog = usePricingData(!!props.group)
  const loading = catalog.isLoading || props.loadingModels
  const error = props.modelsError || catalog.error
  const access = {
    allowed: props.allowed,
    catalog: catalog.models,
    loading,
    error,
  }
  const presets = (published.data ?? []).filter(
    (item) => item.mode === props.mode && presetAvailable(item, access)
  )
  const allowed = new Map(props.allowed.map((item) => [item.value, item]))
  const title = titles[props.mode]
  const columns =
    props.mode === 'chat'
      ? [t('Context window'), t('Supported efforts')]
      : [t('Input'), t('Output'), t('Capabilities')]
  const locale = toIntlLocale(i18n.language)
  const models = catalog.models.filter(
    (item) =>
      item.enable_groups?.length &&
      allowed.has(item.model_name) &&
      (supportsStudioTask(item, props.mode) ||
        (props.mode === 'image' && supportsStudioTask(item, 'image', 'edit')) ||
        (props.mode === 'video' && supportsStudioTask(item, 'video', 'i2v')))
  )
  const perfQuery = useQuery({
    queryKey: ['playground-compare-perf-metrics', 24],
    queryFn: async () => requireServerSuccess(await getPerfMetricsSummary(24)),
    enabled: Boolean(props.group) && models.length > 0,
    staleTime: 60_000,
    retry: false,
    meta: { errorToast: false, redirectOnInternalServerError: false },
  })
  const perfData = perfQuery.data?.data
  const perfMap = useMemo(() => {
    const map = new Map<string, PerfModelSummary>()
    for (const model of perfData?.models ?? []) {
      map.set(model.model_name, model)
    }
    return map
  }, [perfData])
  const monitoringHint = [
    t('All visible groups'),
    t(
      'Success rate excludes business rejections and includes the current partial hour.'
    ),
    monitoringWindowLabel(perfData),
  ]
    .filter(Boolean)
    .join(' · ')
  const retry = () => {
    if (catalog.error) void catalog.refetch()
    if (props.modelsError) void props.retryModels()
  }
  const modelError = error && (
    <ErrorState
      className='min-h-0'
      title={t('Failed to load models')}
      onRetry={retry}
    />
  )
  const waiting = (
    <p role='status' className='el-body-sm'>
      {t('Loading')}
    </p>
  )
  const selectKey = (
    <p className='pg-discovery-state'>
      {t('Select an API key to see available models and presets.')}
    </p>
  )
  const noScope =
    !props.group && (props.loadingModels ? waiting : modelError || selectKey)
  let presetContent
  if (noScope) presetContent = noScope
  else if (published.isError) {
    presetContent = (
      <div className='pg-preset-notice'>
        <span>{t(getCreationPresetsErrorMessage(published.error))}</span>
        <Button
          variant='outline'
          size='sm'
          onClick={() => void published.refetch()}
        >
          {t('Retry')}
        </Button>
      </div>
    )
  } else if (published.isLoading) {
    presetContent = waiting
  } else if (published.data?.length && modelError) {
    presetContent = modelError
  } else if (published.data?.length && loading) {
    presetContent = waiting
  } else if (!presets.length) {
    presetContent = (
      <p className='pg-discovery-state'>
        {t('No presets for this mode and group.')}
      </p>
    )
  } else {
    presetContent = (
      <div className='pg-preset-grid'>
        {presets.map((preset) => (
          <Link
            key={preset.id}
            to='/playground'
            search={{ preset: preset.id, group: props.group }}
            disabled={props.busy}
            className='pg-preset-card'
            aria-current={
              preset.id === props.currentPresetId ? 'true' : undefined
            }
          >
            <span className='pg-preset-art'>
              <SceneArt scene={preset} />
            </span>
            <span className='pg-preset-copy'>
              <span className='pg-preset-label'>
                {preset.category || preset.model}
              </span>
              <strong>{preset.title}</strong>
              <span className='pg-preset-prompt'>{preset.prompt}</span>
            </span>
          </Link>
        ))}
      </div>
    )
  }
  let modelContent
  if (noScope) modelContent = noScope
  else if (modelError) modelContent = modelError
  else if (loading) modelContent = waiting
  else if (!models.length) {
    modelContent = (
      <p className='pg-discovery-state'>{t('No models available')}</p>
    )
  } else {
    modelContent = (
      <div
        className='pg-compare-scroll'
        role='group'
        aria-labelledby='pg-models-title'
        tabIndex={0}
      >
        <Table
          withContainer={false}
          className='pg-compare-table'
          aria-labelledby='pg-models-title'
        >
          <colgroup>
            <col className='pg-model-column' />
            <col className='pg-price-column' />
            {columns.map((column) => (
              <col key={column} />
            ))}
            <col className='pg-endpoints-column' />
            <col className='pg-status-column' />
            <col className='pg-action-column' />
          </colgroup>
          <thead>
            <tr>
              {[
                t('Model'),
                t('Official list price'),
                ...columns,
                t('Request format'),
                t('Status'),
                t('Actions'),
              ].map((column) => (
                <th key={column} scope='col'>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((model) => {
              const current = model.model_name === props.currentModel
              const status = resolveCompareModelStatus(
                {
                  perf: perfMap.get(model.model_name),
                  isError: perfQuery.isError,
                  isPending: perfQuery.isPending,
                  monitoringHint,
                },
                t
              )
              let facts: Array<string | undefined>
              if (props.mode === 'chat') {
                const { efforts } = resolveChatControls(
                  DEFAULT_CONFIG,
                  allowed.get(model.model_name)?.chatControls
                )
                facts = [
                  model.context_length && model.context_length > 0
                    ? formatNumber(model.context_length, locale)
                    : undefined,
                  efforts
                    .map((effort) => REQUEST_PLUGIN_EFFORT_LABELS[effort])
                    .join(' · '),
                ]
              } else {
                facts = [
                  model.input_modalities?.join(' · '),
                  model.output_modalities?.join(' · '),
                  model.capabilities?.join(' · '),
                ]
              }
              return (
                <tr key={model.model_name} aria-current={current || undefined}>
                  <th scope='row'>
                    <span className='pg-compare-model'>
                      <span className='pg-compare-dot' aria-hidden='true' />
                      <span className='pg-model-name' title={model.model_name}>
                        {model.model_name}
                      </span>
                    </span>
                  </th>
                  <td className='pg-compare-price'>
                    <PlaygroundOfficialPrice price={model.official_price} />
                  </td>
                  {[
                    ...facts,
                    getComparisonFormats(
                      model.supported_endpoint_types,
                      catalog.endpointMap
                    ),
                  ].map((value, index) => (
                    <td key={columns[index] ?? 'endpoints'}>
                      {value ? (
                        <span className='pg-compare-fact'>{value}</span>
                      ) : (
                        <span
                          className='pg-compare-missing'
                          title={t('Not provided by this source')}
                        >
                          {t('Not provided')}
                        </span>
                      )}
                    </td>
                  ))}
                  <td>
                    <span
                      className={`pg-compare-status-badge is-${status.tone}`}
                      title={status.hint || undefined}
                    >
                      <span
                        className='pg-compare-status-dot'
                        aria-hidden='true'
                      />
                      <span>{status.label}</span>
                      {status.meta && (
                        <span className='pg-compare-status-meta'>
                          {status.meta}
                        </span>
                      )}
                    </span>
                  </td>
                  <td>
                    {current ? (
                      <span className='pg-compare-current pg-compare-action'>
                        {t('Current model')}
                      </span>
                    ) : (
                      <Button
                        className='pg-compare-action'
                        variant='outline'
                        size='sm'
                        disabled={props.busy}
                        aria-label={t('Switch to {{model}}', {
                          model: model.model_name,
                          interpolation: { escapeValue: false },
                        })}
                        onClick={() => props.onSelectModel(model.model_name)}
                      >
                        {t('Select model')}
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </div>
    )
  }
  return (
    <>
      <section
        className='pg-discovery-panel'
        aria-labelledby='pg-presets-title'
      >
        <div className='pg-discovery-head'>
          <h2 id='pg-presets-title'>{t('Scene presets')}</h2>
          <span className='el-body-sm'>
            {t('Open a preset to fill in its prompt and parameters.')}
          </span>
        </div>
        <div className='pg-discovery-content'>{presetContent}</div>
      </section>
      <section className='pg-discovery-panel' aria-labelledby='pg-models-title'>
        <div className='pg-discovery-head'>
          <div>
            <h2 id='pg-models-title'>{t(title)}</h2>
            <p className='pg-compare-subtitle'>
              {t(
                'Compare published specifications and prices. Switching models keeps your draft.'
              )}
            </p>
          </div>
          {props.group && !loading && !error && (
            <span className='pg-compare-count'>
              {t('{{count}} available models', { count: models.length })}
            </span>
          )}
        </div>
        <div className='pg-discovery-content pg-compare-content'>
          {modelContent}
        </div>
        {!!props.group && !error && !loading && models.length > 0 && (
          <p className='pg-compare-note'>
            {t(
              'Status combines active channel availability with observed 24-hour request success rates; models without recent samples are marked unmonitored.'
            )}
          </p>
        )}
      </section>
    </>
  )
}
