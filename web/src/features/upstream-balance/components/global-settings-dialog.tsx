import { Mail, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

import { formatEditableNumber, parseOptionalNumber } from '../lib/format'
import type { UpstreamBalanceSetting } from '../types'

interface GlobalSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: UpstreamBalanceSetting | undefined
  emailConfigured: boolean
  isSaving: boolean
  isSendingTest: boolean
  onSave: (next: UpstreamBalanceSetting) => Promise<void>
  onTestEmail: (notifyEmails: string) => Promise<void>
}

export function GlobalSettingsDialog(props: GlobalSettingsDialogProps) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(false)
  const [checkInterval, setCheckInterval] = useState('30')
  const [cooldown, setCooldown] = useState('1440')
  const [notifyEmails, setNotifyEmails] = useState('')
  const [minBalanceCNY, setMinBalanceCNY] = useState('')
  const [minPercent, setMinPercent] = useState('')

  useEffect(() => {
    if (!props.open || !props.settings) return
    setEnabled(props.settings.enabled)
    setCheckInterval(String(props.settings.check_interval_minutes || 30))
    setCooldown(String(props.settings.alert_cooldown_minutes ?? 1440))
    setNotifyEmails(props.settings.notify_emails || '')
    setMinBalanceCNY(
      formatEditableNumber(props.settings.default_min_balance_cny)
    )
    setMinPercent(formatEditableNumber(props.settings.default_min_percent))
  }, [props.open, props.settings])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!props.settings) return
    const parsedInterval = Number(checkInterval)
    const parsedCooldown = Number(cooldown)
    const next: UpstreamBalanceSetting = {
      ...props.settings,
      enabled,
      check_interval_minutes: Number.isFinite(parsedInterval)
        ? Math.round(parsedInterval)
        : 30,
      alert_cooldown_minutes: Number.isFinite(parsedCooldown)
        ? Math.round(parsedCooldown)
        : 1440,
      notify_emails: notifyEmails.trim(),
      default_min_balance_cny: parseOptionalNumber(minBalanceCNY),
      default_min_percent: parseOptionalNumber(minPercent),
    }
    await props.onSave(next)
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Upstream Balance Alert Settings')}
      description={t(
        'Configure scheduled balance checks, default CNY/percentage alert thresholds, and email notifications.'
      )}
      footer={
        <div className='flex w-full flex-wrap items-center justify-between gap-2'>
          <Button
            type='button'
            variant='outline'
            disabled={props.isSendingTest || props.isSaving}
            onClick={() => {
              void props.onTestEmail(notifyEmails.trim())
            }}
          >
            <Send className='mr-1.5 h-4 w-4' />
            {props.isSendingTest
              ? t('Sending test email...')
              : t('Send test email')}
          </Button>
          <div className='flex items-center gap-2'>
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
              form='upstream-balance-global-settings-form'
              disabled={props.isSaving}
            >
              {props.isSaving ? t('Saving...') : t('Save settings')}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id='upstream-balance-global-settings-form'
        className='space-y-4'
        onSubmit={handleSubmit}
      >
        <div className='flex items-center justify-between rounded-lg border p-3'>
          <div className='space-y-0.5 pe-4'>
            <Label htmlFor='ub-monitor-enabled'>
              {t('Enable scheduled balance checks & email alerts')}
            </Label>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Periodically refresh configured upstream sites and channels and email you when balances drop below thresholds.'
              )}
            </p>
          </div>
          <Switch
            id='ub-monitor-enabled'
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='ub-check-interval'>
              {t('Check interval (minutes)')}
            </Label>
            <Input
              id='ub-check-interval'
              type='number'
              min={5}
              max={1440}
              step={1}
              value={checkInterval}
              onChange={(event) => setCheckInterval(event.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
              {t('Range: 5 to 1440 minutes (recommended: 15–60).')}
            </p>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='ub-alert-cooldown'>
              {t('Alert cooldown (minutes)')}
            </Label>
            <Input
              id='ub-alert-cooldown'
              type='number'
              min={0}
              max={43200}
              step={1}
              value={cooldown}
              onChange={(event) => setCooldown(event.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                '0 means alert once per breach until balance recovers above threshold.'
              )}
            </p>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='ub-default-min-cny'>
              {t('Default low-balance amount (CNY ¥)')}
            </Label>
            <Input
              id='ub-default-min-cny'
              type='number'
              min={0}
              step='0.01'
              placeholder={t('e.g. 50')}
              value={minBalanceCNY}
              onChange={(event) => setMinBalanceCNY(event.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'Alert when balance falls below this CNY amount. Leave blank to disable.'
              )}
            </p>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='ub-default-min-pct'>
              {t('Default low-balance percentage (%)')}
            </Label>
            <Input
              id='ub-default-min-pct'
              type='number'
              min={0}
              max={100}
              step='0.1'
              placeholder={t('e.g. 20')}
              value={minPercent}
              onChange={(event) => setMinPercent(event.target.value)}
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'Alert when remaining percentage drops below this value. Either amount or percentage triggers an alert.'
              )}
            </p>
          </div>
        </div>

        <div className='space-y-1.5'>
          <Label
            htmlFor='ub-notify-emails'
            className='flex items-center gap-1.5'
          >
            <Mail className='h-3.5 w-3.5' />
            {t('Alert recipient emails')}
          </Label>
          <Input
            id='ub-notify-emails'
            type='text'
            placeholder={t('alice@example.com; bob@example.com')}
            value={notifyEmails}
            onChange={(event) => setNotifyEmails(event.target.value)}
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'Separate multiple addresses with commas or semicolons. Leave blank to use administrator channel notification settings.'
            )}
          </p>
          {!props.emailConfigured ? (
            <p className='text-xs text-amber-600 dark:text-amber-400'>
              {t(
                'No SMTP or Resend email sender is configured yet. Configure email delivery in System Settings → Operations first.'
              )}
            </p>
          ) : null}
        </div>
      </form>
    </Dialog>
  )
}
