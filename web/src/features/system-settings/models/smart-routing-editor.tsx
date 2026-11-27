import { RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
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
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'

import { previewSmartRouting } from '../api'
import type {
  SmartRoutingConfig,
  SmartRoutingPreviewData,
  SmartRoutingRankedCandidate,
} from '../types'

const DEFAULT_SMART_ROUTING_CONFIG: SmartRoutingConfig = {
  enabled: true,
  short_window_hours: 1,
  long_window_hours: 24,
  healthy_success_rate: 95,
  degraded_success_rate: 80,
  allow_outage_fallback: true,
  cost_max_fallback_ratio: 0,
  excluded_groups: [],
  pinned_groups: [],
  demoted_groups: [],
  stability_weights: {
    success_rate: 0.58,
    speed: 0.26,
    cache_hit: 0.12,
    price_tie_break: 0.04,
  },
}

function parseSmartRoutingConfig(raw?: string): SmartRoutingConfig {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) {
    return {
      ...DEFAULT_SMART_ROUTING_CONFIG,
      excluded_groups: [],
      pinned_groups: [],
      demoted_groups: [],
      stability_weights: { ...DEFAULT_SMART_ROUTING_CONFIG.stability_weights },
    }
  }
  try {
    const parsed = JSON.parse(trimmed) as Partial<SmartRoutingConfig>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_SMART_ROUTING_CONFIG }
    }
    return {
      enabled:
        typeof parsed.enabled === 'boolean'
          ? parsed.enabled
          : DEFAULT_SMART_ROUTING_CONFIG.enabled,
      short_window_hours:
        typeof parsed.short_window_hours === 'number' &&
        Number.isFinite(parsed.short_window_hours)
          ? parsed.short_window_hours
          : DEFAULT_SMART_ROUTING_CONFIG.short_window_hours,
      long_window_hours:
        typeof parsed.long_window_hours === 'number' &&
        Number.isFinite(parsed.long_window_hours)
          ? parsed.long_window_hours
          : DEFAULT_SMART_ROUTING_CONFIG.long_window_hours,
      healthy_success_rate:
        typeof parsed.healthy_success_rate === 'number' &&
        Number.isFinite(parsed.healthy_success_rate)
          ? parsed.healthy_success_rate
          : DEFAULT_SMART_ROUTING_CONFIG.healthy_success_rate,
      degraded_success_rate:
        typeof parsed.degraded_success_rate === 'number' &&
        Number.isFinite(parsed.degraded_success_rate)
          ? parsed.degraded_success_rate
          : DEFAULT_SMART_ROUTING_CONFIG.degraded_success_rate,
      allow_outage_fallback:
        typeof parsed.allow_outage_fallback === 'boolean'
          ? parsed.allow_outage_fallback
          : DEFAULT_SMART_ROUTING_CONFIG.allow_outage_fallback,
      cost_max_fallback_ratio:
        typeof parsed.cost_max_fallback_ratio === 'number' &&
        Number.isFinite(parsed.cost_max_fallback_ratio)
          ? parsed.cost_max_fallback_ratio
          : DEFAULT_SMART_ROUTING_CONFIG.cost_max_fallback_ratio,
      excluded_groups: Array.isArray(parsed.excluded_groups)
        ? parsed.excluded_groups.filter(
            (item): item is string => typeof item === 'string'
          )
        : [],
      pinned_groups: Array.isArray(parsed.pinned_groups)
        ? parsed.pinned_groups.filter(
            (item): item is string => typeof item === 'string'
          )
        : [],
      demoted_groups: Array.isArray(parsed.demoted_groups)
        ? parsed.demoted_groups.filter(
            (item): item is string => typeof item === 'string'
          )
        : [],
      stability_weights: {
        success_rate:
          typeof parsed.stability_weights?.success_rate === 'number' &&
          Number.isFinite(parsed.stability_weights.success_rate)
            ? parsed.stability_weights.success_rate
            : DEFAULT_SMART_ROUTING_CONFIG.stability_weights.success_rate,
        speed:
          typeof parsed.stability_weights?.speed === 'number' &&
          Number.isFinite(parsed.stability_weights.speed)
            ? parsed.stability_weights.speed
            : DEFAULT_SMART_ROUTING_CONFIG.stability_weights.speed,
        cache_hit:
          typeof parsed.stability_weights?.cache_hit === 'number' &&
          Number.isFinite(parsed.stability_weights.cache_hit)
            ? parsed.stability_weights.cache_hit
            : DEFAULT_SMART_ROUTING_CONFIG.stability_weights.cache_hit,
        price_tie_break:
          typeof parsed.stability_weights?.price_tie_break === 'number' &&
          Number.isFinite(parsed.stability_weights.price_tie_break)
            ? parsed.stability_weights.price_tie_break
            : DEFAULT_SMART_ROUTING_CONFIG.stability_weights.price_tie_break,
      },
    }
  } catch {
    return { ...DEFAULT_SMART_ROUTING_CONFIG }
  }
}

type SmartRoutingEditorProps = {
  value: string
  billingGroupNames: string[]
  active: boolean
  onChange: (value: string) => void
}

function tierDotClass(tier: string) {
  if (tier === 'outage') return 'bg-destructive'
  if (tier === 'degraded') return 'bg-amber-500'
  return 'bg-emerald-500'
}

function CandidateChain({
  candidates,
  locale,
}: {
  candidates: SmartRoutingRankedCandidate[]
  locale?: Intl.LocalesArgument
}) {
  const { t } = useTranslation()
  if (candidates.length === 0) {
    return <span className='text-muted-foreground text-xs'>—</span>
  }
  const rateFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  })
  const scoreFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 3,
  })
  const ratioFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 4,
  })
  const pctFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  })
  return (
    <ol className='flex flex-wrap items-center gap-1.5'>
      {candidates.map((item, idx) => (
        <li key={item.group} className='flex items-center gap-1'>
          {idx > 0 && (
            <span
              className='text-muted-foreground text-[11px]'
              aria-hidden='true'
            >
              →
            </span>
          )}
          <span
            className='bg-muted/50 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs'
            title={t('Success {{rate}}% · TTFT {{ttft}}ms · Score {{score}}', {
              rate: rateFormatter.format(item.effective_success_rate),
              ttft: formatNumber(item.avg_ttft_ms, locale),
              score: scoreFormatter.format(item.score),
            })}
          >
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                tierDotClass(item.tier)
              )}
              aria-hidden='true'
            />
            <span className='font-medium'>{item.group}</span>
            <span className='text-muted-foreground tabular-nums'>
              {ratioFormatter.format(item.effective_ratio)}x
            </span>
            {!item.is_idle && (
              <span className='text-muted-foreground tabular-nums'>
                {pctFormatter.format(item.effective_success_rate)}%
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function SmartRoutingEditor({
  value,
  billingGroupNames,
  active,
  onChange,
}: SmartRoutingEditorProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const config = useMemo(() => parseSmartRoutingConfig(value), [value])
  const [preview, setPreview] = useState<SmartRoutingPreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [modelSearch, setModelSearch] = useState('')

  const selectableGroups = useMemo(
    () => billingGroupNames.filter((name) => name && name !== 'auto'),
    [billingGroupNames]
  )

  const emitConfig = useCallback(
    (next: SmartRoutingConfig) => {
      onChange(JSON.stringify(next, null, 2))
    },
    [onChange]
  )

  const updateNumeric = (
    key:
      | 'short_window_hours'
      | 'long_window_hours'
      | 'healthy_success_rate'
      | 'degraded_success_rate'
      | 'cost_max_fallback_ratio',
    rawValue: string
  ) => {
    const parsed = Number(rawValue)
    if (!Number.isFinite(parsed)) return
    emitConfig({ ...config, [key]: parsed })
  }

  const updateWeight = (
    key: keyof SmartRoutingConfig['stability_weights'],
    rawValue: string
  ) => {
    const parsed = Number(rawValue)
    if (!Number.isFinite(parsed) || parsed < 0) return
    emitConfig({
      ...config,
      stability_weights: {
        ...config.stability_weights,
        [key]: parsed,
      },
    })
  }

  const toggleGroupInList = (
    field: 'excluded_groups' | 'pinned_groups' | 'demoted_groups',
    groupName: string
  ) => {
    const current = new Set(config[field])
    if (current.has(groupName)) {
      current.delete(groupName)
    } else {
      current.add(groupName)
    }
    const next: SmartRoutingConfig = {
      ...config,
      [field]: [...current],
    }
    if (field === 'pinned_groups' && current.has(groupName)) {
      next.demoted_groups = config.demoted_groups.filter((g) => g !== groupName)
    } else if (field === 'demoted_groups' && current.has(groupName)) {
      next.pinned_groups = config.pinned_groups.filter((g) => g !== groupName)
    }
    emitConfig(next)
  }

  const loadPreview = useCallback(
    async (cfg: SmartRoutingConfig, notifyErrors = true) => {
      setPreviewLoading(true)
      try {
        const res = await previewSmartRouting(cfg)
        if (res.success && res.data) {
          setPreview(res.data)
        } else if (notifyErrors) {
          handleServerError(res, t('Failed to load smart routing preview'))
        }
      } catch (err) {
        if (notifyErrors) {
          toast.error(
            err instanceof Error
              ? err.message
              : t('Failed to load smart routing preview')
          )
        }
      } finally {
        setPreviewLoading(false)
      }
    },
    [t]
  )

  useEffect(() => {
    if (active && preview === null && !previewLoading) {
      void loadPreview(config, false)
    }
  }, [active, preview, previewLoading, config, loadPreview])

  const weightSum =
    config.stability_weights.success_rate +
    config.stability_weights.speed +
    config.stability_weights.cache_hit +
    config.stability_weights.price_tie_break

  const formatWeightPct = (val: number) => {
    if (weightSum <= 0) return '0%'
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
    }).format((val / weightSum) * 100)}%`
  }

  const filteredPreviewModels = useMemo(() => {
    const models = preview?.models ?? []
    const q = modelSearch.trim().toLowerCase()
    if (!q) return models
    return models.filter(
      (row) =>
        row.model.toLowerCase().includes(q) ||
        row.cost_first.some((c) => c.group.toLowerCase().includes(q)) ||
        row.stability_first.some((c) => c.group.toLowerCase().includes(q))
    )
  }, [preview, modelSearch])

  return (
    <div className='space-y-5'>
      <Card className='gap-4 rounded-xl py-4 shadow-none sm:gap-5 sm:py-5'>
        <CardHeader className='space-y-1'>
          <CardTitle>{t('Smart routing')}</CardTitle>
          <CardDescription>
            {t(
              'Configure built-in dynamic routing policies (Cost first & Stability first) for reasoning models based on live health, speed, cache hit rate, and group ratio.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-5'>
          <div className='bg-muted/20 flex items-center justify-between gap-4 rounded-lg border p-4'>
            <div className='space-y-0.5'>
              <Label
                htmlFor='smart-routing-enabled'
                className='text-sm font-medium'
              >
                {t('Enable smart routing')}
              </Label>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Expose Cost first and Stability first options when users create or edit API keys (reasoning models only).'
                )}
              </p>
            </div>
            <Switch
              id='smart-routing-enabled'
              checked={config.enabled}
              onCheckedChange={(checked) =>
                emitConfig({ ...config, enabled: checked })
              }
            />
          </div>

          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='smart-short-window'>
                {t('Short window (hours)')}
              </Label>
              <Input
                id='smart-short-window'
                type='number'
                min={1}
                max={168}
                step={1}
                value={config.short_window_hours}
                onChange={(e) =>
                  updateNumeric('short_window_hours', e.target.value)
                }
              />
              <p className='text-muted-foreground text-xs'>
                {t('React quickly to recent upstream outages (default 1h).')}
              </p>
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='smart-long-window'>
                {t('Long window (hours)')}
              </Label>
              <Input
                id='smart-long-window'
                type='number'
                min={config.short_window_hours}
                max={720}
                step={1}
                value={config.long_window_hours}
                onChange={(e) =>
                  updateNumeric('long_window_hours', e.target.value)
                }
              />
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Baseline stability window to smooth traffic noise (default 24h).'
                )}
              </p>
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='smart-cost-cap'>
                {t('Cost-first max fallback multiplier')}
              </Label>
              <Input
                id='smart-cost-cap'
                type='number'
                min={0}
                step={0.1}
                value={config.cost_max_fallback_ratio}
                onChange={(e) =>
                  updateNumeric('cost_max_fallback_ratio', e.target.value)
                }
              />
              <p className='text-muted-foreground text-xs'>
                {t(
                  '0 = unlimited. E.g. 2.0 caps cost-first failover at 2× the cheapest healthy group ratio.'
                )}
              </p>
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='smart-healthy-threshold'>
                {t('Healthy success rate (%)')}
              </Label>
              <Input
                id='smart-healthy-threshold'
                type='number'
                min={50}
                max={100}
                step={0.5}
                value={config.healthy_success_rate}
                onChange={(e) =>
                  updateNumeric('healthy_success_rate', e.target.value)
                }
              />
              <p className='text-muted-foreground text-xs'>
                {t('Groups at or above this rate are ranked as healthy.')}
              </p>
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='smart-degraded-threshold'>
                {t('Degraded success rate (%)')}
              </Label>
              <Input
                id='smart-degraded-threshold'
                type='number'
                min={0}
                max={config.healthy_success_rate}
                step={0.5}
                value={config.degraded_success_rate}
                onChange={(e) =>
                  updateNumeric('degraded_success_rate', e.target.value)
                }
              />
              <p className='text-muted-foreground text-xs'>
                {t('Groups below this rate are classified as outage tier.')}
              </p>
            </div>

            <div className='bg-muted/20 flex items-center justify-between gap-3 self-end rounded-lg border px-3 py-2.5'>
              <div className='space-y-0.5'>
                <Label
                  htmlFor='smart-outage-fallback'
                  className='text-xs font-medium'
                >
                  {t('Allow outage fallback')}
                </Label>
                <p className='text-muted-foreground text-[11px]'>
                  {t('Keep outage groups at the end as last resort.')}
                </p>
              </div>
              <Switch
                id='smart-outage-fallback'
                checked={config.allow_outage_fallback}
                onCheckedChange={(checked) =>
                  emitConfig({ ...config, allow_outage_fallback: checked })
                }
              />
            </div>
          </div>

          <Separator />

          <div className='space-y-3'>
            <div>
              <h4 className='text-sm font-medium'>
                {t('Stability-first scoring weights')}
              </h4>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Relative weights are automatically normalized when scoring candidate groups.'
                )}
              </p>
            </div>
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              {(
                [
                  ['success_rate', t('Reliability')],
                  ['speed', t('Speed (TTFT & TPS)')],
                  ['cache_hit', t('Cache hit rate')],
                  ['price_tie_break', t('Price tie-break')],
                ] as const
              ).map(([field, label]) => (
                <div key={field} className='space-y-1'>
                  <div className='flex items-center justify-between text-xs'>
                    <Label htmlFor={`smart-weight-${field}`}>{label}</Label>
                    <span className='text-muted-foreground tabular-nums'>
                      {formatWeightPct(config.stability_weights[field])}
                    </span>
                  </div>
                  <Input
                    id={`smart-weight-${field}`}
                    type='number'
                    min={0}
                    step={0.02}
                    value={config.stability_weights[field]}
                    onChange={(e) => updateWeight(field, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div className='space-y-4'>
            <div>
              <h4 className='text-sm font-medium'>{t('Group overrides')}</h4>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Exclude specific billing groups from smart routing, or gently boost/demote groups in ranking.'
                )}
              </p>
            </div>

            {(
              [
                [
                  'excluded_groups',
                  t('Excluded groups'),
                  t('Never selected by smart routing policies.'),
                ],
                [
                  'pinned_groups',
                  t('Preferred groups'),
                  t('Receive a mild priority boost during ranking.'),
                ],
                [
                  'demoted_groups',
                  t('Demoted groups'),
                  t('Receive a mild priority penalty and act as backup.'),
                ],
              ] as const
            ).map(([field, title, desc]) => (
              <div key={field} className='space-y-1.5'>
                <div className='flex flex-wrap items-baseline gap-2'>
                  <span className='text-xs font-medium'>{title}</span>
                  <span className='text-muted-foreground text-[11px]'>
                    {desc}
                  </span>
                </div>
                {selectableGroups.length === 0 ? (
                  <p className='text-muted-foreground text-xs'>
                    {t('No billing groups available.')}
                  </p>
                ) : (
                  <div className='flex flex-wrap gap-1.5'>
                    {selectableGroups.map((groupName) => {
                      const selected = config[field].includes(groupName)
                      let selectedClass =
                        'border-amber-500/50 bg-amber-500/10 font-medium text-amber-700 dark:text-amber-300'
                      if (field === 'excluded_groups') {
                        selectedClass =
                          'border-destructive/50 bg-destructive/10 text-destructive font-medium'
                      } else if (field === 'pinned_groups') {
                        selectedClass =
                          'border-emerald-500/50 bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-300'
                      }
                      return (
                        <button
                          key={`${field}:${groupName}`}
                          type='button'
                          aria-pressed={selected}
                          onClick={() => toggleGroupInList(field, groupName)}
                          className={cn(
                            'rounded-full border px-2.5 py-1 text-xs transition-colors',
                            selected
                              ? selectedClass
                              : 'border-border bg-background text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {groupName}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className='gap-4 rounded-xl py-4 shadow-none sm:gap-5 sm:py-5'>
        <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3 space-y-0'>
          <div className='space-y-1'>
            <CardTitle>{t('Live routing preview')}</CardTitle>
            <CardDescription>
              {t(
                'Preview how the current draft configuration ranks eligible groups for each reasoning model using live metrics.'
              )}
            </CardDescription>
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={previewLoading}
            onClick={() => void loadPreview(config, true)}
          >
            <RefreshCw
              className={cn('mr-2 size-3.5', previewLoading && 'animate-spin')}
              aria-hidden='true'
            />
            {t('Refresh preview')}
          </Button>
        </CardHeader>
        <CardContent className='space-y-4'>
          {preview && (
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='flex flex-wrap items-center gap-1.5'>
                <Badge variant='secondary'>
                  {t('{{count}} eligible groups', {
                    count: preview.meta.eligible_group_count,
                  })}
                </Badge>
                <Badge variant='secondary'>
                  {t('{{count}} reasoning models', {
                    count: preview.meta.model_count,
                  })}
                </Badge>
              </div>
              <div className='relative w-full sm:w-64'>
                <Search
                  className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2'
                  aria-hidden='true'
                />
                <Input
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder={t('Filter models or groups...')}
                  className='h-8 pl-8 text-xs'
                />
              </div>
            </div>
          )}

          {filteredPreviewModels.length === 0 ? (
            <EmptyState
              className='min-h-32'
              title={
                previewLoading
                  ? t('Loading preview...')
                  : t('No reasoning models available for preview')
              }
              description={t(
                'Ensure at least one non-excluded billing group has active reasoning channels.'
              )}
            />
          ) : (
            <div className='max-h-[420px] space-y-2 overflow-y-auto pr-1'>
              {filteredPreviewModels.slice(0, 40).map((row) => (
                <div
                  key={row.model}
                  className='bg-muted/15 space-y-2 rounded-lg border p-3'
                >
                  <div className='font-mono text-xs font-semibold'>
                    {row.model}
                  </div>
                  <div className='grid gap-2 md:grid-cols-2'>
                    <div className='space-y-1'>
                      <div className='text-muted-foreground text-[11px] font-medium'>
                        {t('Cost first')}
                      </div>
                      <CandidateChain
                        candidates={row.cost_first}
                        locale={locale}
                      />
                    </div>
                    <div className='space-y-1'>
                      <div className='text-muted-foreground text-[11px] font-medium'>
                        {t('Stability first')}
                      </div>
                      <CandidateChain
                        candidates={row.stability_first}
                        locale={locale}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
