import { Calculator, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'

import {
  computeQuickCostMetrics,
  formatEditableDecimal,
  formatSignedDecimal,
  roundDecimal,
} from '../lib/cost-calc'
import type {
  ProfitAnalyticsSetting,
  ProfitChannelBreakdown,
  ProfitChannelCostConfig,
  ProfitChannelPricingMode,
  ProfitFixedCostItem,
  ProfitPricingReference,
} from '../types'

interface ProfitCostSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: ProfitAnalyticsSetting | undefined
  channels: ProfitChannelBreakdown[]
  pricingRef?: ProfitPricingReference
  symbol: string
  focusChannelId?: number | null
  isSaving: boolean
  onSave: (payload: ProfitAnalyticsSetting) => Promise<void>
}

interface ChannelDraftRow {
  channelId: number
  channelName: string
  group: string
  pricingMode: ProfitChannelPricingMode
  costRatioText: string
  upstreamValueText: string
  platformValueText: string
  suggestedGroupRatio: number
  suggestedUnitPrice: number
  suggestedUnitPriceModel: string
  avgBilledPerRequest: number
  monthlyFixedCostText: string
  note: string
}

interface FeeRateDraftRow {
  id: string
  method: string
  ratePercentText: string
}

interface FixedCostDraftRow {
  id: string
  name: string
  category: ProfitFixedCostItem['category']
  monthlyCostText: string
  enabled: boolean
  note: string
}

export function ProfitCostSettingsDialog(props: ProfitCostSettingsDialogProps) {
  const { t } = useTranslation()
  const [excludeAdminUsers, setExcludeAdminUsers] = useState(true)
  const [defaultCostRatioPct, setDefaultCostRatioPct] = useState('50')
  const [defaultQuickUpstream, setDefaultQuickUpstream] = useState('')
  const [defaultQuickPlatform, setDefaultQuickPlatform] = useState('')
  const [defaultPaymentFeePct, setDefaultPaymentFeePct] = useState('0')
  const [feeRows, setFeeRows] = useState<FeeRateDraftRow[]>([])
  const [channelRows, setChannelRows] = useState<ChannelDraftRow[]>([])
  const [fixedRows, setFixedRows] = useState<FixedCostDraftRow[]>([])
  const [validationError, setValidationError] = useState('')

  const defaultGroupRatio =
    props.pricingRef && props.pricingRef.default_group_ratio > 0
      ? props.pricingRef.default_group_ratio
      : 1

  useEffect(() => {
    if (!props.open || !props.settings) return
    setValidationError('')
    setExcludeAdminUsers(props.settings.exclude_admin_users ?? true)
    setDefaultCostRatioPct(
      formatEditableDecimal(props.settings.default_cost_ratio * 100, 2)
    )
    setDefaultQuickUpstream('')
    setDefaultQuickPlatform(formatEditableDecimal(defaultGroupRatio))
    setDefaultPaymentFeePct(
      formatEditableDecimal(props.settings.payment_fee_rate * 100, 2)
    )

    const methodEntries = Object.entries(props.settings.payment_fee_rates ?? {})
    setFeeRows(
      methodEntries.map(([method, rate], index) => ({
        id: `fee-${index}-${method}`,
        method,
        ratePercentText: String(Math.round(rate * 10000) / 100),
      }))
    )

    const seen = new Set<number>()
    const rows: ChannelDraftRow[] = []
    for (const ch of props.channels) {
      if (ch.channel_id <= 0) continue
      seen.add(ch.channel_id)
      const existing = props.settings.channel_costs?.[String(ch.channel_id)]
      const savedMode = existing?.pricing_mode
      const pricingMode: ProfitChannelPricingMode =
        savedMode === 'ratio' || savedMode === 'unit_price'
          ? savedMode
          : 'percent'
      const suggestedGroupRatio =
        ch.suggested_group_ratio > 0
          ? ch.suggested_group_ratio
          : defaultGroupRatio
      const suggestedUnitPrice = ch.suggested_unit_price ?? 0
      const avgBilledPerRequest =
        ch.requests > 0 && ch.billed_local > 0
          ? roundDecimal(ch.billed_local / ch.requests, 6)
          : 0
      let platformValueText =
        existing?.platform_value != null
          ? formatEditableDecimal(existing.platform_value)
          : ''
      if (!platformValueText && pricingMode === 'ratio') {
        platformValueText = formatEditableDecimal(suggestedGroupRatio)
      } else if (
        !platformValueText &&
        pricingMode === 'unit_price' &&
        suggestedUnitPrice > 0
      ) {
        platformValueText = formatEditableDecimal(suggestedUnitPrice)
      }
      rows.push({
        channelId: ch.channel_id,
        channelName: ch.channel_name,
        group: ch.group,
        pricingMode,
        costRatioText:
          existing?.cost_ratio != null
            ? formatEditableDecimal(existing.cost_ratio * 100, 2)
            : '',
        upstreamValueText:
          existing?.upstream_value != null
            ? formatEditableDecimal(existing.upstream_value)
            : '',
        platformValueText,
        suggestedGroupRatio,
        suggestedUnitPrice,
        suggestedUnitPriceModel: ch.suggested_unit_price_model ?? '',
        avgBilledPerRequest,
        monthlyFixedCostText:
          existing && existing.monthly_fixed_cost > 0
            ? String(existing.monthly_fixed_cost)
            : '',
        note: existing?.note ?? '',
      })
    }
    for (const [idStr, cfg] of Object.entries(
      props.settings.channel_costs ?? {}
    )) {
      const parsed = Number(idStr)
      if (!Number.isInteger(parsed) || parsed <= 0 || seen.has(parsed)) continue
      const savedMode = cfg.pricing_mode
      const pricingMode: ProfitChannelPricingMode =
        savedMode === 'ratio' || savedMode === 'unit_price'
          ? savedMode
          : 'percent'
      rows.push({
        channelId: parsed,
        channelName: `#${parsed}`,
        group: '',
        pricingMode,
        costRatioText:
          cfg.cost_ratio != null
            ? formatEditableDecimal(cfg.cost_ratio * 100, 2)
            : '',
        upstreamValueText:
          cfg.upstream_value != null
            ? formatEditableDecimal(cfg.upstream_value)
            : '',
        platformValueText:
          cfg.platform_value != null
            ? formatEditableDecimal(cfg.platform_value)
            : '',
        suggestedGroupRatio: defaultGroupRatio,
        suggestedUnitPrice: 0,
        suggestedUnitPriceModel: '',
        avgBilledPerRequest: 0,
        monthlyFixedCostText:
          cfg.monthly_fixed_cost > 0 ? String(cfg.monthly_fixed_cost) : '',
        note: cfg.note ?? '',
      })
    }
    if (props.focusChannelId) {
      rows.sort((a, b) => {
        if (a.channelId === props.focusChannelId) return -1
        if (b.channelId === props.focusChannelId) return 1
        return a.channelId - b.channelId
      })
    }
    setChannelRows(rows)

    setFixedRows(
      (props.settings.extra_fixed_costs ?? []).map((item, idx) => ({
        id: item.id || `cost-${idx + 1}`,
        name: item.name,
        category: item.category || 'other',
        monthlyCostText: String(item.monthly_cost),
        enabled: item.enabled,
        note: item.note ?? '',
      }))
    )
  }, [
    defaultGroupRatio,
    props.channels,
    props.focusChannelId,
    props.open,
    props.settings,
  ])

  const defaultQuickMetrics = computeQuickCostMetrics(
    defaultQuickUpstream,
    defaultQuickPlatform
  )

  const handleDefaultQuickChange = (upstream: string, platform: string) => {
    setDefaultQuickUpstream(upstream)
    setDefaultQuickPlatform(platform)
    const metrics = computeQuickCostMetrics(upstream, platform)
    if (metrics && metrics.costRatio <= 10) {
      setDefaultCostRatioPct(formatEditableDecimal(metrics.costRatioPercent, 2))
    }
  }

  const handleChannelModeChange = (
    channelId: number,
    nextMode: ProfitChannelPricingMode
  ) => {
    setChannelRows((prev) =>
      prev.map((item) => {
        if (item.channelId !== channelId) return item
        if (item.pricingMode === nextMode) return item

        if (nextMode === 'percent') {
          const metrics = computeQuickCostMetrics(
            item.upstreamValueText,
            item.platformValueText
          )
          return {
            ...item,
            pricingMode: 'percent',
            costRatioText: metrics
              ? formatEditableDecimal(metrics.costRatioPercent, 2)
              : item.costRatioText,
          }
        }

        if (nextMode === 'ratio') {
          const shouldAutoFill =
            item.pricingMode !== 'ratio' &&
            (item.platformValueText.trim() === '' ||
              item.pricingMode === 'unit_price')
          const nextPlatform = shouldAutoFill
            ? formatEditableDecimal(item.suggestedGroupRatio)
            : item.platformValueText
          const nextUpstream =
            item.pricingMode === 'unit_price' ? '' : item.upstreamValueText
          return {
            ...item,
            pricingMode: 'ratio',
            upstreamValueText: nextUpstream,
            platformValueText: nextPlatform,
          }
        }

        const shouldAutoFillUnit =
          item.pricingMode !== 'unit_price' &&
          (item.platformValueText.trim() === '' || item.pricingMode === 'ratio')
        let nextPlatformUnit = item.platformValueText
        if (shouldAutoFillUnit) {
          nextPlatformUnit =
            item.suggestedUnitPrice > 0
              ? formatEditableDecimal(item.suggestedUnitPrice)
              : ''
        }
        const nextUpstreamUnit =
          item.pricingMode === 'ratio' ? '' : item.upstreamValueText
        return {
          ...item,
          pricingMode: 'unit_price',
          upstreamValueText: nextUpstreamUnit,
          platformValueText: nextPlatformUnit,
        }
      })
    )
  }

  const handleSave = async () => {
    setValidationError('')
    const defaultCostPct = Number(defaultCostRatioPct)
    if (
      Number.isNaN(defaultCostPct) ||
      defaultCostPct < 0 ||
      defaultCostPct > 1000
    ) {
      setValidationError(
        t('Default upstream cost ratio must be between 0% and 1000%')
      )
      return
    }
    const defaultFeePct = Number(defaultPaymentFeePct)
    if (
      Number.isNaN(defaultFeePct) ||
      defaultFeePct < 0 ||
      defaultFeePct > 100
    ) {
      setValidationError(t('Payment fee rate must be between 0% and 100%'))
      return
    }

    const paymentFeeRates: Record<string, number> = {}
    for (const row of feeRows) {
      const method = row.method.trim().toLowerCase()
      if (!method) continue
      const pct = Number(row.ratePercentText)
      if (Number.isNaN(pct) || pct < 0 || pct > 100) {
        setValidationError(t('Payment fee rate must be between 0% and 100%'))
        return
      }
      paymentFeeRates[method] = Math.round(pct * 100) / 10000
    }

    const channelCosts: Record<string, ProfitChannelCostConfig> = {}
    for (const row of channelRows) {
      const ratioTrimmed = row.costRatioText.trim()
      const upstreamTrimmed = row.upstreamValueText.trim()
      const platformTrimmed = row.platformValueText.trim()
      const fixedTrimmed = row.monthlyFixedCostText.trim()
      const noteTrimmed = row.note.trim()

      let costRatio: number | undefined
      let pricingMode: ProfitChannelPricingMode | undefined
      let upstreamValue: number | undefined
      let platformValue: number | undefined

      if (row.pricingMode === 'ratio' || row.pricingMode === 'unit_price') {
        if (upstreamTrimmed !== '') {
          const upstream = Number(upstreamTrimmed)
          const platform = Number(platformTrimmed)
          if (!Number.isFinite(upstream) || upstream < 0) {
            setValidationError(
              t('Upstream ratio or unit price must be non-negative')
            )
            return
          }
          if (
            platformTrimmed === '' ||
            !Number.isFinite(platform) ||
            platform <= 0
          ) {
            setValidationError(
              t('Platform ratio or unit price must be greater than 0')
            )
            return
          }
          const derived = roundDecimal(upstream / platform, 6)
          if (derived < 0 || derived > 10) {
            setValidationError(
              t('Channel cost ratio must be between 0% and 1000%')
            )
            return
          }
          costRatio = derived
          pricingMode = row.pricingMode
          upstreamValue = roundDecimal(upstream, 6)
          platformValue = roundDecimal(platform, 6)
        }
      } else if (ratioTrimmed !== '') {
        const pct = Number(ratioTrimmed)
        if (Number.isNaN(pct) || pct < 0 || pct > 1000) {
          setValidationError(
            t('Channel cost ratio must be between 0% and 1000%')
          )
          return
        }
        costRatio = Math.round(pct * 100) / 10000
      }

      if (costRatio === undefined && !fixedTrimmed && !noteTrimmed) continue

      const fixedVal = fixedTrimmed === '' ? 0 : Number(fixedTrimmed)
      if (Number.isNaN(fixedVal) || fixedVal < 0) {
        setValidationError(t('Monthly fixed cost must be non-negative'))
        return
      }
      channelCosts[String(row.channelId)] = {
        ...(costRatio !== undefined ? { cost_ratio: costRatio } : {}),
        ...(pricingMode ? { pricing_mode: pricingMode } : {}),
        ...(upstreamValue !== undefined
          ? { upstream_value: upstreamValue }
          : {}),
        ...(platformValue !== undefined
          ? { platform_value: platformValue }
          : {}),
        monthly_fixed_cost: fixedVal,
        note: noteTrimmed,
      }
    }

    const extraFixedCosts: ProfitFixedCostItem[] = []
    for (const row of fixedRows) {
      const name = row.name.trim()
      if (!name) continue
      const cost = Number(row.monthlyCostText)
      if (Number.isNaN(cost) || cost < 0) {
        setValidationError(t('Monthly fixed cost must be non-negative'))
        return
      }
      extraFixedCosts.push({
        id: row.id,
        name,
        category: row.category,
        monthly_cost: cost,
        enabled: row.enabled,
        note: row.note.trim(),
      })
    }

    await props.onSave({
      exclude_admin_users: excludeAdminUsers,
      default_cost_ratio: Math.round(defaultCostPct * 100) / 10000,
      payment_fee_rate: Math.round(defaultFeePct * 100) / 10000,
      payment_fee_rates: paymentFeeRates,
      channel_costs: channelCosts,
      extra_fixed_costs: extraFixedCosts,
    })
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Profit & cost model settings')}
      description={t(
        'Configure upstream cost ratios, payment gateway fees, and monthly fixed costs to estimate true net profit.'
      )}
      contentClassName='sm:max-w-4xl'
      bodyClassName='max-h-[70vh] overflow-y-auto space-y-6 pr-1'
      footer={
        <div className='flex w-full items-center justify-between gap-2'>
          <span className='text-destructive text-xs'>{validationError}</span>
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => props.onOpenChange(false)}
              disabled={props.isSaving}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='button'
              onClick={() => void handleSave()}
              disabled={props.isSaving}
            >
              {props.isSaving ? t('Saving...') : t('Save settings')}
            </Button>
          </div>
        </div>
      }
    >
      <div className='flex items-start justify-between gap-4 rounded-md border p-3'>
        <div className='space-y-0.5'>
          <Label
            htmlFor='profit-exclude-admin-default'
            className='text-sm font-medium'
          >
            {t('Exclude admin accounts by default')}
          </Label>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Exclude admin and super-admin test consumption, paid orders, redemptions, check-ins, and unspent balances from profit metrics.'
            )}
          </p>
        </div>
        <Switch
          id='profit-exclude-admin-default'
          checked={excludeAdminUsers}
          onCheckedChange={setExcludeAdminUsers}
        />
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='space-y-1.5'>
          <Label htmlFor='profit-default-cost-ratio'>
            {t('Default upstream cost ratio (%)')}
          </Label>
          <Input
            id='profit-default-cost-ratio'
            type='number'
            min={0}
            max={1000}
            step='any'
            value={defaultCostRatioPct}
            onChange={(event) => setDefaultCostRatioPct(event.target.value)}
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'Applied to channels without a custom cost ratio. Example: 50% means 0.50 cost per 1.00 billed.'
            )}
          </p>
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='profit-default-payment-fee'>
            {t('Default payment gateway fee (%)')}
          </Label>
          <Input
            id='profit-default-payment-fee'
            type='number'
            min={0}
            max={100}
            step='0.01'
            value={defaultPaymentFeePct}
            onChange={(event) => setDefaultPaymentFeePct(event.target.value)}
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'Deducted from external cash revenue. Wallet balance redemptions are excluded.'
            )}
          </p>
        </div>
      </div>

      <div className='bg-muted/30 space-y-2.5 rounded-md border p-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex items-center gap-1.5 text-xs font-medium'>
            <Calculator className='h-3.5 w-3.5' aria-hidden='true' />
            <span>
              {t(
                'Quick calculator for default cost ratio (ratio / unit price)'
              )}
            </span>
          </div>
          {defaultQuickMetrics ? (
            <div className='flex flex-wrap items-center gap-2 text-xs tabular-nums'>
              <Badge variant='secondary' className='font-normal'>
                {t('Cost ratio')}:{' '}
                {formatEditableDecimal(defaultQuickMetrics.costRatioPercent, 2)}
                %
              </Badge>
              <span
                className={
                  defaultQuickMetrics.grossMarginPercent >= 0
                    ? 'font-medium text-emerald-600 dark:text-emerald-400'
                    : 'text-destructive font-medium'
                }
              >
                {t('Gross margin')}{' '}
                {formatSignedDecimal(defaultQuickMetrics.grossMarginPercent, 2)}
                %
              </span>
              <span className='text-muted-foreground'>
                {t('Spread')} {formatSignedDecimal(defaultQuickMetrics.spread)}
              </span>
            </div>
          ) : (
            <span className='text-muted-foreground text-xs'>
              {t(
                'Enter upstream and platform ratio or unit price to fill the default cost ratio automatically.'
              )}
            </span>
          )}
        </div>
        <div className='grid gap-2.5 sm:grid-cols-12 sm:items-end'>
          <div className='space-y-1 sm:col-span-5'>
            <Label
              htmlFor='profit-default-quick-upstream'
              className='text-muted-foreground text-xs'
            >
              {t('Upstream ratio / price')}
            </Label>
            <Input
              id='profit-default-quick-upstream'
              type='number'
              min={0}
              step='any'
              placeholder={t('e.g. 0.5 or 0.02')}
              value={defaultQuickUpstream}
              onChange={(event) =>
                handleDefaultQuickChange(
                  event.target.value,
                  defaultQuickPlatform
                )
              }
            />
          </div>
          <div className='space-y-1 sm:col-span-5'>
            <Label
              htmlFor='profit-default-quick-platform'
              className='text-muted-foreground text-xs'
            >
              {t('My ratio / price')}
            </Label>
            <Input
              id='profit-default-quick-platform'
              type='number'
              min={0}
              step='any'
              placeholder={t('e.g. 0.6 or 0.025')}
              value={defaultQuickPlatform}
              onChange={(event) =>
                handleDefaultQuickChange(
                  defaultQuickUpstream,
                  event.target.value
                )
              }
            />
          </div>
          <div className='sm:col-span-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='w-full text-xs'
              onClick={() =>
                handleDefaultQuickChange(
                  defaultQuickUpstream,
                  formatEditableDecimal(defaultGroupRatio)
                )
              }
            >
              <Sparkles className='mr-1 h-3 w-3' aria-hidden='true' />
              {t('Default {{ratio}}', {
                ratio: formatEditableDecimal(defaultGroupRatio),
              })}
            </Button>
          </div>
        </div>
      </div>

      <div className='space-y-2.5'>
        <div className='flex items-center justify-between'>
          <div>
            <h4 className='text-sm font-medium'>
              {t('Per-channel cost overrides')}
            </h4>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Enter a cost percentage directly, or switch to By ratio / Unit price to calculate from upstream vs. platform pricing automatically.'
              )}
            </p>
          </div>
        </div>
        {channelRows.length === 0 ? (
          <p className='text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center text-xs'>
            {t('No enabled channels found')}
          </p>
        ) : (
          <div className='space-y-2.5'>
            {channelRows.map((row) => {
              const quickMetrics =
                row.pricingMode === 'ratio' || row.pricingMode === 'unit_price'
                  ? computeQuickCostMetrics(
                      row.upstreamValueText,
                      row.platformValueText
                    )
                  : null
              const suggestedGroupText = formatEditableDecimal(
                row.suggestedGroupRatio
              )
              const suggestedUnitText =
                row.suggestedUnitPrice > 0
                  ? formatEditableDecimal(row.suggestedUnitPrice)
                  : ''
              const avgBilledText =
                row.avgBilledPerRequest > 0
                  ? formatEditableDecimal(row.avgBilledPerRequest)
                  : ''
              const isQuickMode =
                row.pricingMode === 'ratio' || row.pricingMode === 'unit_price'
              const isRatioMode = row.pricingMode === 'ratio'
              const upstreamLabel = isRatioMode
                ? t('Upstream ratio')
                : t('Upstream unit price')
              const platformLabel = isRatioMode
                ? t('My ratio')
                : t('My unit price')
              const upstreamPlaceholder = isRatioMode
                ? t('e.g. 0.5')
                : t('e.g. 0.02')
              const platformPlaceholder = isRatioMode
                ? suggestedGroupText
                : suggestedUnitText || t('e.g. 0.025')
              const quickEmptyHint = isRatioMode
                ? t(
                    'My ratio auto-fills from the channel group; enter upstream ratio to compute cost ratio & margin.'
                  )
                : t(
                    'Use the same currency for upstream and platform unit prices (supports cent/milli markups like 0.005).'
                  )
              const spreadLabel = isRatioMode
                ? t('Ratio spread')
                : t('Per-call markup')
              let quickMarginClass = 'text-destructive font-medium'
              if (quickMetrics && quickMetrics.grossMarginPercent >= 0) {
                quickMarginClass =
                  'font-medium text-emerald-600 dark:text-emerald-400'
              }

              return (
                <div
                  key={row.channelId}
                  className={`space-y-2.5 rounded-md border p-3 ${
                    props.focusChannelId === row.channelId
                      ? 'border-primary bg-primary/5'
                      : 'border-border'
                  }`}
                >
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <div className='min-w-0'>
                      <div className='truncate text-sm font-medium'>
                        {row.channelName}
                      </div>
                      <div className='text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs'>
                        <span>#{row.channelId}</span>
                        {row.group && <span>· {row.group}</span>}
                        <span>
                          ·{' '}
                          {t('Platform ratio {{ratio}}', {
                            ratio: suggestedGroupText,
                          })}
                        </span>
                        {suggestedUnitText && (
                          <span>
                            ·{' '}
                            {t('Model price {{symbol}}{{price}}', {
                              symbol: props.symbol,
                              price: suggestedUnitText,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      role='group'
                      aria-label={`${row.channelName} ${t('Calculation mode')}`}
                      className='bg-muted/60 inline-flex items-center rounded-md border p-0.5'
                    >
                      <Button
                        type='button'
                        size='sm'
                        variant={
                          row.pricingMode === 'percent' ? 'secondary' : 'ghost'
                        }
                        aria-pressed={row.pricingMode === 'percent'}
                        className='h-6 px-2 text-xs'
                        onClick={() =>
                          handleChannelModeChange(row.channelId, 'percent')
                        }
                      >
                        {t('Cost %')}
                      </Button>
                      <Button
                        type='button'
                        size='sm'
                        variant={
                          row.pricingMode === 'ratio' ? 'secondary' : 'ghost'
                        }
                        aria-pressed={row.pricingMode === 'ratio'}
                        className='h-6 px-2 text-xs'
                        onClick={() =>
                          handleChannelModeChange(row.channelId, 'ratio')
                        }
                      >
                        {t('By ratio')}
                      </Button>
                      <Button
                        type='button'
                        size='sm'
                        variant={
                          row.pricingMode === 'unit_price'
                            ? 'secondary'
                            : 'ghost'
                        }
                        aria-pressed={row.pricingMode === 'unit_price'}
                        className='h-6 px-2 text-xs'
                        onClick={() =>
                          handleChannelModeChange(row.channelId, 'unit_price')
                        }
                      >
                        {t('Unit price')}
                      </Button>
                    </div>
                  </div>

                  {isQuickMode && (
                    <div className='space-y-2'>
                      <div className='grid gap-2 sm:grid-cols-12 sm:items-end'>
                        <div className='space-y-1 sm:col-span-3'>
                          <Label className='text-muted-foreground text-xs'>
                            {upstreamLabel}
                          </Label>
                          <Input
                            type='number'
                            min={0}
                            step='any'
                            placeholder={upstreamPlaceholder}
                            aria-label={`${row.channelName} ${upstreamLabel}`}
                            value={row.upstreamValueText}
                            onChange={(event) => {
                              const val = event.target.value
                              setChannelRows((prev) =>
                                prev.map((item) =>
                                  item.channelId === row.channelId
                                    ? { ...item, upstreamValueText: val }
                                    : item
                                )
                              )
                            }}
                          />
                        </div>
                        <div className='space-y-1 sm:col-span-3'>
                          <Label className='text-muted-foreground text-xs'>
                            {platformLabel}
                          </Label>
                          <Input
                            type='number'
                            min={0}
                            step='any'
                            placeholder={platformPlaceholder}
                            aria-label={`${row.channelName} ${platformLabel}`}
                            value={row.platformValueText}
                            onChange={(event) => {
                              const val = event.target.value
                              setChannelRows((prev) =>
                                prev.map((item) =>
                                  item.channelId === row.channelId
                                    ? { ...item, platformValueText: val }
                                    : item
                                )
                              )
                            }}
                          />
                        </div>
                        <div className='space-y-1 sm:col-span-3'>
                          <Label className='text-muted-foreground text-xs'>
                            {t('Fixed/mo')} ({props.symbol})
                          </Label>
                          <Input
                            type='number'
                            min={0}
                            step='1'
                            placeholder={`${t('Fixed/mo')} (${props.symbol})`}
                            aria-label={`${row.channelName} ${t('Monthly fixed cost')}`}
                            value={row.monthlyFixedCostText}
                            onChange={(event) => {
                              const val = event.target.value
                              setChannelRows((prev) =>
                                prev.map((item) =>
                                  item.channelId === row.channelId
                                    ? { ...item, monthlyFixedCostText: val }
                                    : item
                                )
                              )
                            }}
                          />
                        </div>
                        <div className='space-y-1 sm:col-span-3'>
                          <Label className='text-muted-foreground text-xs'>
                            {t('Note (optional)')}
                          </Label>
                          <Input
                            placeholder={t('Note (optional)')}
                            value={row.note}
                            onChange={(event) => {
                              const val = event.target.value
                              setChannelRows((prev) =>
                                prev.map((item) =>
                                  item.channelId === row.channelId
                                    ? { ...item, note: val }
                                    : item
                                )
                              )
                            }}
                          />
                        </div>
                      </div>

                      <div className='bg-muted/30 flex flex-wrap items-center justify-between gap-2 rounded px-2.5 py-1.5 text-xs'>
                        {quickMetrics && (
                          <div className='flex flex-wrap items-center gap-2 tabular-nums'>
                            <span className='font-medium'>
                              {t('Cost ratio')}:{' '}
                              {formatEditableDecimal(
                                quickMetrics.costRatioPercent,
                                2
                              )}
                              %
                            </span>
                            <span className={quickMarginClass}>
                              {t('Gross margin')}{' '}
                              {formatSignedDecimal(
                                quickMetrics.grossMarginPercent,
                                2
                              )}
                              %
                            </span>
                            <span className='text-muted-foreground'>
                              {spreadLabel}{' '}
                              {formatSignedDecimal(quickMetrics.spread)}
                            </span>
                          </div>
                        )}
                        {!quickMetrics && (
                          <span className='text-muted-foreground'>
                            {quickEmptyHint}
                          </span>
                        )}

                        <div className='flex flex-wrap items-center gap-1.5'>
                          {row.pricingMode === 'ratio' &&
                            row.platformValueText.trim() !==
                              suggestedGroupText && (
                              <Button
                                type='button'
                                variant='ghost'
                                size='sm'
                                className='h-6 px-2 text-xs'
                                onClick={() =>
                                  setChannelRows((prev) =>
                                    prev.map((item) =>
                                      item.channelId === row.channelId
                                        ? {
                                            ...item,
                                            platformValueText:
                                              suggestedGroupText,
                                          }
                                        : item
                                    )
                                  )
                                }
                              >
                                <Sparkles
                                  className='mr-1 h-3 w-3'
                                  aria-hidden='true'
                                />
                                {t('Auto-fill {{value}}', {
                                  value: suggestedGroupText,
                                })}
                              </Button>
                            )}
                          {row.pricingMode === 'unit_price' &&
                            suggestedUnitText &&
                            row.platformValueText.trim() !==
                              suggestedUnitText && (
                              <Button
                                type='button'
                                variant='ghost'
                                size='sm'
                                className='h-6 px-2 text-xs'
                                onClick={() =>
                                  setChannelRows((prev) =>
                                    prev.map((item) =>
                                      item.channelId === row.channelId
                                        ? {
                                            ...item,
                                            platformValueText:
                                              suggestedUnitText,
                                          }
                                        : item
                                    )
                                  )
                                }
                              >
                                <Sparkles
                                  className='mr-1 h-3 w-3'
                                  aria-hidden='true'
                                />
                                {t('Model price {{symbol}}{{price}}', {
                                  symbol: props.symbol,
                                  price: suggestedUnitText,
                                })}
                              </Button>
                            )}
                          {row.pricingMode === 'unit_price' &&
                            !suggestedUnitText &&
                            avgBilledText &&
                            row.platformValueText.trim() !== avgBilledText && (
                              <Button
                                type='button'
                                variant='ghost'
                                size='sm'
                                className='h-6 px-2 text-xs'
                                onClick={() =>
                                  setChannelRows((prev) =>
                                    prev.map((item) =>
                                      item.channelId === row.channelId
                                        ? {
                                            ...item,
                                            platformValueText: avgBilledText,
                                          }
                                        : item
                                    )
                                  )
                                }
                              >
                                <Sparkles
                                  className='mr-1 h-3 w-3'
                                  aria-hidden='true'
                                />
                                {t('Recent avg {{symbol}}{{price}}', {
                                  symbol: props.symbol,
                                  price: avgBilledText,
                                })}
                              </Button>
                            )}
                        </div>
                      </div>
                    </div>
                  )}
                  {!isQuickMode && (
                    <div className='grid gap-2 sm:grid-cols-12 sm:items-center'>
                      <div className='sm:col-span-4'>
                        <Input
                          type='number'
                          min={0}
                          max={1000}
                          step='any'
                          placeholder={`${defaultCostRatioPct}%`}
                          aria-label={`${row.channelName} ${t('Cost ratio (%)')}`}
                          value={row.costRatioText}
                          onChange={(event) => {
                            const val = event.target.value
                            setChannelRows((prev) =>
                              prev.map((item) =>
                                item.channelId === row.channelId
                                  ? { ...item, costRatioText: val }
                                  : item
                              )
                            )
                          }}
                        />
                      </div>
                      <div className='sm:col-span-4'>
                        <Input
                          type='number'
                          min={0}
                          step='1'
                          placeholder={`${t('Fixed/mo')} (${props.symbol})`}
                          aria-label={`${row.channelName} ${t('Monthly fixed cost')}`}
                          value={row.monthlyFixedCostText}
                          onChange={(event) => {
                            const val = event.target.value
                            setChannelRows((prev) =>
                              prev.map((item) =>
                                item.channelId === row.channelId
                                  ? { ...item, monthlyFixedCostText: val }
                                  : item
                              )
                            )
                          }}
                        />
                      </div>
                      <div className='sm:col-span-4'>
                        <Input
                          placeholder={t('Note (optional)')}
                          value={row.note}
                          onChange={(event) => {
                            const val = event.target.value
                            setChannelRows((prev) =>
                              prev.map((item) =>
                                item.channelId === row.channelId
                                  ? { ...item, note: val }
                                  : item
                              )
                            )
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className='space-y-2.5'>
        <div className='flex items-center justify-between'>
          <div>
            <h4 className='text-sm font-medium'>
              {t('Platform fixed operating costs')}
            </h4>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Monthly servers, bandwidth, OSS storage, or pool subscriptions amortized across the selected range.'
              )}
            </p>
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() =>
              setFixedRows((prev) => [
                ...prev,
                {
                  id: `cost-${Date.now()}`,
                  name: '',
                  category: 'server',
                  monthlyCostText: '0',
                  enabled: true,
                  note: '',
                },
              ])
            }
          >
            <Plus className='mr-1 h-3.5 w-3.5' />
            {t('Add fixed cost')}
          </Button>
        </div>
        {fixedRows.length > 0 && (
          <div className='space-y-2'>
            {fixedRows.map((row) => (
              <div
                key={row.id}
                className='grid gap-2 rounded-md border p-2.5 sm:grid-cols-12 sm:items-center'
              >
                <div className='sm:col-span-4'>
                  <Input
                    placeholder={t('Cost item name')}
                    value={row.name}
                    onChange={(event) => {
                      const val = event.target.value
                      setFixedRows((prev) =>
                        prev.map((item) =>
                          item.id === row.id ? { ...item, name: val } : item
                        )
                      )
                    }}
                  />
                </div>
                <div className='sm:col-span-3'>
                  <NativeSelect
                    value={row.category}
                    onChange={(event) => {
                      const val = event.target
                        .value as ProfitFixedCostItem['category']
                      setFixedRows((prev) =>
                        prev.map((item) =>
                          item.id === row.id ? { ...item, category: val } : item
                        )
                      )
                    }}
                  >
                    <NativeSelectOption value='server'>
                      {t('Server & network')}
                    </NativeSelectOption>
                    <NativeSelectOption value='media'>
                      {t('Media storage / CDN')}
                    </NativeSelectOption>
                    <NativeSelectOption value='account_pool'>
                      {t('Account pool')}
                    </NativeSelectOption>
                    <NativeSelectOption value='other'>
                      {t('Other')}
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className='sm:col-span-3'>
                  <Input
                    type='number'
                    min={0}
                    step='1'
                    placeholder={`${t('Monthly cost')} (${props.symbol})`}
                    value={row.monthlyCostText}
                    onChange={(event) => {
                      const val = event.target.value
                      setFixedRows((prev) =>
                        prev.map((item) =>
                          item.id === row.id
                            ? { ...item, monthlyCostText: val }
                            : item
                        )
                      )
                    }}
                  />
                </div>
                <div className='flex items-center justify-end gap-2 sm:col-span-2'>
                  <Switch
                    checked={row.enabled}
                    onCheckedChange={(checked) =>
                      setFixedRows((prev) =>
                        prev.map((item) =>
                          item.id === row.id
                            ? { ...item, enabled: checked }
                            : item
                        )
                      )
                    }
                  />
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('Delete')}
                    onClick={() =>
                      setFixedRows((prev) =>
                        prev.filter((item) => item.id !== row.id)
                      )
                    }
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className='space-y-2.5'>
        <div className='flex items-center justify-between'>
          <div>
            <h4 className='text-sm font-medium'>
              {t('Per-payment-method fee overrides')}
            </h4>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Optional overrides by payment method code (e.g. alipay, wxpay, stripe, creem, waffo).'
              )}
            </p>
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() =>
              setFeeRows((prev) => [
                ...prev,
                {
                  id: `fee-${Date.now()}`,
                  method: '',
                  ratePercentText: defaultPaymentFeePct,
                },
              ])
            }
          >
            <Plus className='mr-1 h-3.5 w-3.5' />
            {t('Add fee rule')}
          </Button>
        </div>
        {feeRows.length > 0 && (
          <div className='space-y-2'>
            {feeRows.map((row) => (
              <div
                key={row.id}
                className='grid gap-2 rounded-md border p-2.5 sm:grid-cols-12 sm:items-center'
              >
                <div className='sm:col-span-6'>
                  <Input
                    placeholder={t('Payment method (e.g. alipay)')}
                    value={row.method}
                    onChange={(event) => {
                      const val = event.target.value
                      setFeeRows((prev) =>
                        prev.map((item) =>
                          item.id === row.id ? { ...item, method: val } : item
                        )
                      )
                    }}
                  />
                </div>
                <div className='sm:col-span-4'>
                  <Input
                    type='number'
                    min={0}
                    max={100}
                    step='0.01'
                    placeholder={t('Fee (%)')}
                    value={row.ratePercentText}
                    onChange={(event) => {
                      const val = event.target.value
                      setFeeRows((prev) =>
                        prev.map((item) =>
                          item.id === row.id
                            ? { ...item, ratePercentText: val }
                            : item
                        )
                      )
                    }}
                  />
                </div>
                <div className='flex justify-end sm:col-span-2'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('Delete')}
                    onClick={() =>
                      setFeeRows((prev) =>
                        prev.filter((item) => item.id !== row.id)
                      )
                    }
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  )
}
