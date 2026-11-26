import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { PasswordInput } from '@/components/password-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'

import { formatEditableNumber, parseOptionalNumber } from '../lib/format'
import type {
  UpstreamBalanceSiteConfig,
  UpstreamBalanceSiteView,
  UpstreamProviderType,
} from '../types'

interface SiteConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  site: UpstreamBalanceSiteView | null
  defaultExchangeRate: number
  isSaving: boolean
  onSave: (siteKey: string, config: UpstreamBalanceSiteConfig) => Promise<void>
}

export function SiteConfigDialog(props: SiteConfigDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [providerType, setProviderType] = useState<UpstreamProviderType>('auto')
  const [cnyRate, setCnyRate] = useState('')
  const [referenceTotalCNY, setReferenceTotalCNY] = useState('')
  const [alertEnabled, setAlertEnabled] = useState(true)
  const [minBalanceCNY, setMinBalanceCNY] = useState('')
  const [minPercent, setMinPercent] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [clearAccessToken, setClearAccessToken] = useState(false)
  const [userID, setUserID] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!props.open || !props.site) return
    const cfg = props.site.config
    setName(cfg.name || '')
    setProviderType(cfg.provider_type || 'auto')
    setCnyRate(formatEditableNumber(cfg.cny_rate))
    setReferenceTotalCNY(formatEditableNumber(cfg.reference_total_cny))
    setAlertEnabled(cfg.alert_enabled ?? true)
    setMinBalanceCNY(formatEditableNumber(cfg.min_balance_cny))
    setMinPercent(formatEditableNumber(cfg.min_percent))
    setAccessToken('')
    setClearAccessToken(false)
    setUserID(cfg.user_id || '')
    setNote(cfg.note || '')
  }, [props.open, props.site])

  const effectiveNewAPI =
    providerType === 'new_api' ||
    (providerType === 'auto' && props.site?.inferred_provider === 'new_api')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!props.site) return
    const payload: UpstreamBalanceSiteConfig = {
      name: name.trim(),
      provider_type: providerType,
      cny_rate: parseOptionalNumber(cnyRate),
      reference_total_cny: parseOptionalNumber(referenceTotalCNY),
      alert_enabled: alertEnabled,
      min_balance_cny: parseOptionalNumber(minBalanceCNY),
      min_percent: parseOptionalNumber(minPercent),
      access_token: accessToken.trim() || undefined,
      clear_access_token: clearAccessToken,
      user_id: userID.trim(),
      note: note.trim(),
    }
    await props.onSave(props.site.site_key, payload)
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Configure Upstream Site')}
      description={props.site?.site_key}
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
            form='upstream-balance-site-config-form'
            disabled={props.isSaving}
          >
            {props.isSaving ? t('Saving...') : t('Save')}
          </Button>
        </div>
      }
    >
      <form
        id='upstream-balance-site-config-form'
        className='space-y-4'
        onSubmit={handleSubmit}
      >
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='ub-site-name'>{t('Site display name')}</Label>
            <Input
              id='ub-site-name'
              value={name}
              placeholder={props.site?.display_name || ''}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='ub-site-provider'>{t('Upstream type')}</Label>
            <NativeSelect
              id='ub-site-provider'
              value={providerType}
              onChange={(event) =>
                setProviderType(event.target.value as UpstreamProviderType)
              }
            >
              <NativeSelectOption value='auto'>
                {t('Auto detect')}
              </NativeSelectOption>
              <NativeSelectOption value='new_api'>New API</NativeSelectOption>
              <NativeSelectOption value='sub2api'>Sub2API</NativeSelectOption>
              <NativeSelectOption value='ignore'>
                {t('Ignore this site')}
              </NativeSelectOption>
            </NativeSelect>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='ub-site-cny-rate'>
              {t('CNY exchange rate (1 USD = ¥)')}
            </Label>
            <Input
              id='ub-site-cny-rate'
              type='number'
              min={0.0001}
              max={1000}
              step='any'
              placeholder={t('System default: {{rate}}', {
                rate: props.defaultExchangeRate,
              })}
              value={cnyRate}
              onChange={(event) => setCnyRate(event.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'Leave blank to use global USD exchange rate. Set your actual recharge rate (e.g. 2.0) for discounted relays.'
              )}
            </p>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='ub-site-ref-total'>
              {t('Reference budget total (CNY ¥)')}
            </Label>
            <Input
              id='ub-site-ref-total'
              type='number'
              min={0}
              step='0.01'
              placeholder={t('Optional, e.g. 500')}
              value={referenceTotalCNY}
              onChange={(event) => setReferenceTotalCNY(event.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'Used as denominator for remaining percentage (recommended for Sub2API wallets or recharged budgets).'
              )}
            </p>
          </div>
        </div>

        <div className='flex items-center justify-between rounded-lg border p-3'>
          <div className='space-y-0.5 pe-4'>
            <Label htmlFor='ub-site-alert-enabled'>
              {t('Enable low-balance alert for this site')}
            </Label>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Leave thresholds blank to inherit global defaults. Enter 0 to disable a specific condition for this site.'
              )}
            </p>
          </div>
          <Switch
            id='ub-site-alert-enabled'
            checked={alertEnabled}
            onCheckedChange={setAlertEnabled}
          />
        </div>

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='ub-site-min-cny'>
              {t('Min balance threshold (CNY ¥)')}
            </Label>
            <Input
              id='ub-site-min-cny'
              type='number'
              min={0}
              step='0.01'
              placeholder={t('Inherit global default')}
              value={minBalanceCNY}
              onChange={(event) => setMinBalanceCNY(event.target.value)}
            />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='ub-site-min-pct'>
              {t('Min remaining percentage (%)')}
            </Label>
            <Input
              id='ub-site-min-pct'
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

        {effectiveNewAPI ? (
          <div className='space-y-3 rounded-lg border border-dashed p-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div>
                <p className='text-sm font-medium'>
                  {t('Site Account Balance Fallback (Optional)')}
                </p>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Only needed if your upstream New API does not return account quota from API keys. Calls /api/user/self directly.'
                  )}
                </p>
              </div>
              {props.site?.config.has_access_token && !clearAccessToken ? (
                <div className='flex items-center gap-2'>
                  <Badge variant='secondary'>{t('Token saved')}</Badge>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() => {
                      setClearAccessToken(true)
                      setAccessToken('')
                    }}
                  >
                    <Trash2 className='mr-1 h-3.5 w-3.5' />
                    {t('Clear')}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
              <div className='space-y-1.5 sm:col-span-2'>
                <Label htmlFor='ub-site-access-token'>
                  {t('System Access Token')}
                </Label>
                <PasswordInput
                  id='ub-site-access-token'
                  value={accessToken}
                  placeholder={
                    props.site?.config.has_access_token && !clearAccessToken
                      ? t('Leave blank to keep saved token')
                      : t('Optional upstream system access token')
                  }
                  onChange={(event) => {
                    setAccessToken(event.target.value)
                    if (event.target.value.trim()) {
                      setClearAccessToken(false)
                    }
                  }}
                />
              </div>

              <div className='space-y-1.5'>
                <Label htmlFor='ub-site-user-id'>
                  {t('User ID (Optional)')}
                </Label>
                <Input
                  id='ub-site-user-id'
                  value={userID}
                  placeholder={t('e.g. 123')}
                  onChange={(event) => setUserID(event.target.value)}
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className='space-y-1.5'>
          <Label htmlFor='ub-site-note'>{t('Note')}</Label>
          <Input
            id='ub-site-note'
            value={note}
            placeholder={t('Optional memo for this upstream site')}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </form>
    </Dialog>
  )
}
