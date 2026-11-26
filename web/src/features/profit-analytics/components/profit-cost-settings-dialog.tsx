import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'

import type {
  ProfitAnalyticsSetting,
  ProfitChannelBreakdown,
  ProfitChannelCostConfig,
  ProfitFixedCostItem,
} from '../types'

interface ProfitCostSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: ProfitAnalyticsSetting | undefined
  channels: ProfitChannelBreakdown[]
  symbol: string
  focusChannelId?: number | null
  isSaving: boolean
  onSave: (payload: ProfitAnalyticsSetting) => Promise<void>
}

interface ChannelDraftRow {
  channelId: number
  channelName: string
  group: string
  costRatioText: string
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
  const [defaultCostRatioPct, setDefaultCostRatioPct] = useState('50')
  const [defaultPaymentFeePct, setDefaultPaymentFeePct] = useState('0')
  const [feeRows, setFeeRows] = useState<FeeRateDraftRow[]>([])
  const [channelRows, setChannelRows] = useState<ChannelDraftRow[]>([])
  const [fixedRows, setFixedRows] = useState<FixedCostDraftRow[]>([])
  const [validationError, setValidationError] = useState('')

  useEffect(() => {
    if (!props.open || !props.settings) return
    setValidationError('')
    setDefaultCostRatioPct(
      String(Math.round(props.settings.default_cost_ratio * 10000) / 100)
    )
    setDefaultPaymentFeePct(
      String(Math.round(props.settings.payment_fee_rate * 10000) / 100)
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
      rows.push({
        channelId: ch.channel_id,
        channelName: ch.channel_name,
        group: ch.group,
        costRatioText:
          existing?.cost_ratio != null
            ? String(Math.round(existing.cost_ratio * 10000) / 100)
            : '',
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
      rows.push({
        channelId: parsed,
        channelName: `#${parsed}`,
        group: '',
        costRatioText:
          cfg.cost_ratio != null
            ? String(Math.round(cfg.cost_ratio * 10000) / 100)
            : '',
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
  }, [props.channels, props.focusChannelId, props.open, props.settings])

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
      const fixedTrimmed = row.monthlyFixedCostText.trim()
      const noteTrimmed = row.note.trim()
      if (!ratioTrimmed && !fixedTrimmed && !noteTrimmed) continue

      let costRatio: number | undefined
      if (ratioTrimmed !== '') {
        const pct = Number(ratioTrimmed)
        if (Number.isNaN(pct) || pct < 0 || pct > 1000) {
          setValidationError(
            t('Channel cost ratio must be between 0% and 1000%')
          )
          return
        }
        costRatio = Math.round(pct * 100) / 10000
      }
      const fixedVal = fixedTrimmed === '' ? 0 : Number(fixedTrimmed)
      if (Number.isNaN(fixedVal) || fixedVal < 0) {
        setValidationError(t('Monthly fixed cost must be non-negative'))
        return
      }
      channelCosts[String(row.channelId)] = {
        ...(costRatio !== undefined ? { cost_ratio: costRatio } : {}),
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
      contentClassName='sm:max-w-3xl'
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
            step='0.1'
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

      <div className='space-y-2.5'>
        <div className='flex items-center justify-between'>
          <div>
            <h4 className='text-sm font-medium'>
              {t('Per-channel cost overrides')}
            </h4>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Set 0% variable cost + monthly fixed cost for fixed-price account pools, or an exact procurement percentage for pay-as-you-go relays.'
              )}
            </p>
          </div>
        </div>
        {channelRows.length === 0 ? (
          <p className='text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center text-xs'>
            {t('No enabled channels found')}
          </p>
        ) : (
          <div className='space-y-2'>
            {channelRows.map((row) => (
              <div
                key={row.channelId}
                className={`grid gap-2 rounded-md border p-2.5 sm:grid-cols-12 sm:items-center ${
                  props.focusChannelId === row.channelId
                    ? 'border-primary bg-primary/5'
                    : 'border-border'
                }`}
              >
                <div className='sm:col-span-4'>
                  <div className='truncate text-sm font-medium'>
                    {row.channelName}
                  </div>
                  <div className='text-muted-foreground text-xs'>
                    #{row.channelId}
                    {row.group ? ` · ${row.group}` : ''}
                  </div>
                </div>
                <div className='sm:col-span-2'>
                  <Input
                    type='number'
                    min={0}
                    max={1000}
                    step='0.1'
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
                <div className='sm:col-span-3'>
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
                <div className='sm:col-span-3'>
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
            ))}
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
