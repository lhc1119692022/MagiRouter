import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'

import { formatEditableNumber, parseOptionalNumber } from '../lib/format'
import type {
  UpstreamBalanceChannelConfig,
  UpstreamBalanceChannelView,
  UpstreamChannelProviderOverride,
} from '../types'

interface ChannelConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  channel: UpstreamBalanceChannelView | null
  siteName: string
  isSaving: boolean
  onSave: (
    channelId: number,
    config: UpstreamBalanceChannelConfig
  ) => Promise<void>
}

export function ChannelConfigDialog(props: ChannelConfigDialogProps) {
  const { t } = useTranslation()
  const [providerOverride, setProviderOverride] =
    useState<UpstreamChannelProviderOverride>('')
  const [referenceTotalCNY, setReferenceTotalCNY] = useState('')
  const [alertEnabled, setAlertEnabled] = useState(true)
  const [minBalanceCNY, setMinBalanceCNY] = useState('')
  const [minPercent, setMinPercent] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!props.open || !props.channel) return
    const cfg = props.channel.config
    setProviderOverride(cfg.provider_override || '')
    setReferenceTotalCNY(formatEditableNumber(cfg.reference_total_cny))
    setAlertEnabled(cfg.alert_enabled ?? true)
    setMinBalanceCNY(formatEditableNumber(cfg.min_balance_cny))
    setMinPercent(formatEditableNumber(cfg.min_percent))
    setNote(cfg.note || '')
  }, [props.open, props.channel])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!props.channel) return
    await props.onSave(props.channel.channel_id, {
      provider_override: providerOverride,
      reference_total_cny: parseOptionalNumber(referenceTotalCNY),
      alert_enabled: alertEnabled,
      min_balance_cny: parseOptionalNumber(minBalanceCNY),
      min_percent: parseOptionalNumber(minPercent),
      note: note.trim(),
    })
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Configure Channel Balance Rules')}
      description={
        props.channel
          ? `${props.siteName} / ${props.channel.channel_name} (#${props.channel.channel_id})`
          : undefined
      }
      footer={
        <div className='flex items-center justify-end gap-2'>
          <Button
            type='button'
            variant='outline'
            disabled={props.isSaving}
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='submit'
            form='upstream-balance-channel-config-form'
            disabled={props.isSaving}
          >
            {props.isSaving ? t('Saving...') : t('Save')}
          </Button>
        </div>
      }
    >
      <form
        id='upstream-balance-channel-config-form'
        className='space-y-4'
        onSubmit={handleSubmit}
      >
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='ub-ch-provider'>{t('Query method override')}</Label>
            <NativeSelect
              id='ub-ch-provider'
              value={providerOverride}
              onChange={(event) =>
                setProviderOverride(
                  event.target.value as UpstreamChannelProviderOverride
                )
              }
            >
              <NativeSelectOption value=''>
                {t('Inherit from site')}
              </NativeSelectOption>
              <NativeSelectOption value='new_api'>New API</NativeSelectOption>
              <NativeSelectOption value='sub2api'>Sub2API</NativeSelectOption>
              <NativeSelectOption value='ignore'>
                {t('Ignore this channel')}
              </NativeSelectOption>
            </NativeSelect>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='ub-ch-ref-total'>
              {t('Reference budget total (CNY ¥)')}
            </Label>
            <Input
              id='ub-ch-ref-total'
              type='number'
              min={0}
              step='0.01'
              placeholder={t('Optional, overrides upstream limit')}
              value={referenceTotalCNY}
              onChange={(event) => setReferenceTotalCNY(event.target.value)}
            />
          </div>
        </div>

        <div className='flex items-center justify-between rounded-lg border p-3'>
          <div className='space-y-0.5 pe-4'>
            <Label htmlFor='ub-ch-alert-enabled'>
              {t('Enable independent channel alert')}
            </Label>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Applies only when this channel has its own quota or subscription limit. Unlimited keys follow the site alert.'
              )}
            </p>
          </div>
          <Switch
            id='ub-ch-alert-enabled'
            checked={alertEnabled}
            onCheckedChange={setAlertEnabled}
          />
        </div>

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='ub-ch-min-cny'>
              {t('Min balance threshold (CNY ¥)')}
            </Label>
            <Input
              id='ub-ch-min-cny'
              type='number'
              min={0}
              step='0.01'
              placeholder={t('Inherit global default')}
              value={minBalanceCNY}
              onChange={(event) => setMinBalanceCNY(event.target.value)}
            />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='ub-ch-min-pct'>
              {t('Min remaining percentage (%)')}
            </Label>
            <Input
              id='ub-ch-min-pct'
              type='number'
              min={0}
              max={100}
              step='0.1'
              placeholder={t('Inherit global default')}
              value={minPercent}
              onChange={(event) => setMinPercent(event.target.value)}
            />
          </div>
        </div>

        <div className='space-y-1.5'>
          <Label htmlFor='ub-ch-note'>{t('Note')}</Label>
          <Input
            id='ub-ch-note'
            value={note}
            placeholder={t('Optional memo for this channel')}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </form>
    </Dialog>
  )
}
