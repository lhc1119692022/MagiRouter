import { Mail, QrCode } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  buildDailyLimitMailtoHref,
  formatCurrency,
  resolveDailyTopUpContactMethod,
} from '../../lib'
import type { DailyTopUpLimitStatus } from '../../types'

interface DailyLimitContactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dailyLimit: DailyTopUpLimitStatus | null
  requestedAmount?: number
}

export function DailyLimitContactDialog(props: DailyLimitContactDialogProps) {
  const { t } = useTranslation()
  const dailyLimit = props.dailyLimit
  const isLimitExceeded = Boolean(
    (props.requestedAmount && props.requestedAmount > 0) ||
    (dailyLimit &&
      dailyLimit.enabled &&
      !dailyLimit.exempt &&
      dailyLimit.remaining <= 0)
  )
  const contactMethod = resolveDailyTopUpContactMethod(dailyLimit)
  const isWeChatContact = contactMethod === 'wechat'
  const contactEmail = dailyLimit?.contact_email?.trim() || ''
  const qrCode = dailyLimit?.contact_wechat_qrcode?.trim() || ''
  const contactNote = dailyLimit?.contact_note?.trim() || ''
  const mailtoHref = buildDailyLimitMailtoHref(
    contactEmail,
    t('Large Top-up / Whitelist Request')
  )

  let dialogTitle = t('Contact via Email for Large Top-ups')
  if (isLimitExceeded) {
    dialogTitle = t('Daily Top-up Limit Exceeded')
  } else if (isWeChatContact) {
    dialogTitle = t('Contact via WeChat for Large Top-ups')
  }

  const defaultDescription = isWeChatContact
    ? t(
        'Online top-ups are capped per day. Scan the WeChat QR code below to contact us for larger top-ups or whitelist exemption.'
      )
    : t(
        'Online top-ups are capped per day. Send an email to the address below to contact us for larger top-ups or whitelist exemption.'
      )

  let contactSection = (
    <Alert>
      <AlertDescription>
        {t(
          'The administrator has not configured a contact email yet. Please contact site support to arrange a larger top-up or whitelist exemption.'
        )}
      </AlertDescription>
    </Alert>
  )

  if (isWeChatContact) {
    contactSection = qrCode ? (
      <div className='flex flex-col items-center gap-2.5 py-1'>
        <div className='rounded-xl border bg-white p-3 shadow-xs'>
          <img
            src={qrCode}
            alt={t('WeChat Contact QR Code')}
            className='h-52 w-52 object-contain'
          />
        </div>
        <p className='text-muted-foreground flex items-center gap-1.5 text-xs'>
          <QrCode className='h-3.5 w-3.5' />
          <span>{t('Scan with WeChat to contact support')}</span>
        </p>
      </div>
    ) : (
      <Alert>
        <AlertDescription>
          {t(
            'The administrator has not uploaded a WeChat QR code yet. Please contact site support to arrange a larger top-up or whitelist exemption.'
          )}
        </AlertDescription>
      </Alert>
    )
  } else if (contactEmail) {
    contactSection = (
      <div className='bg-muted/30 space-y-3 rounded-xl border p-4'>
        <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
          <Mail className='h-3.5 w-3.5' />
          <span>{t('Contact Email')}</span>
        </div>
        <div className='bg-background flex items-center justify-between gap-2 rounded-lg border px-3 py-2'>
          <span className='font-mono text-sm font-medium break-all select-all'>
            {contactEmail}
          </span>
          <CopyButton
            value={contactEmail}
            variant='outline'
            size='sm'
            aria-label={t('Copy email')}
            tooltip={t('Copy email')}
            successTooltip={t('Email copied')}
          >
            {t('Copy')}
          </CopyButton>
        </div>
        <a
          href={mailtoHref}
          className={cn(
            buttonVariants({ variant: 'default' }),
            'w-full gap-1.5'
          )}
        >
          <Mail className='h-4 w-4' />
          {t('Send Email')}
        </a>
        <p className='text-muted-foreground text-xs leading-relaxed'>
          {t(
            'Please include your username or registered email and desired top-up amount so we can assist you faster.'
          )}
        </p>
      </div>
    )
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'
      title={dialogTitle}
      description={contactNote || defaultDescription}
      footer={
        <Button onClick={() => props.onOpenChange(false)}>{t('Close')}</Button>
      }
    >
      <div className='space-y-4'>
        {dailyLimit?.enabled && !dailyLimit.exempt && (
          <div className='bg-muted/40 space-y-2 rounded-lg border p-3 text-sm'>
            <div className='grid grid-cols-3 gap-2 text-center'>
              <div className='bg-background rounded-md border px-2 py-2'>
                <div className='text-muted-foreground text-[11px]'>
                  {t('Daily Limit')}
                </div>
                <div className='mt-0.5 font-semibold'>
                  {formatCurrency(dailyLimit.limit)}
                </div>
              </div>
              <div className='bg-background rounded-md border px-2 py-2'>
                <div className='text-muted-foreground text-[11px]'>
                  {t('Used Today')}
                </div>
                <div className='mt-0.5 font-semibold'>
                  {formatCurrency(dailyLimit.used)}
                </div>
              </div>
              <div className='bg-background rounded-md border px-2 py-2'>
                <div className='text-muted-foreground text-[11px]'>
                  {t('Remaining Today')}
                </div>
                <div className='mt-0.5 font-semibold'>
                  {formatCurrency(dailyLimit.remaining)}
                </div>
              </div>
            </div>

            {props.requestedAmount && props.requestedAmount > 0 ? (
              <p className='text-muted-foreground text-xs'>
                {t('Current payment amount: {{amount}}', {
                  amount: formatCurrency(props.requestedAmount),
                })}
              </p>
            ) : null}

            {dailyLimit.pending > 0 ? (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Includes {{amount}} temporarily held by unpaid orders within the last {{minutes}} minutes.',
                  {
                    amount: formatCurrency(dailyLimit.pending),
                    minutes: dailyLimit.pending_hold_minutes || 20,
                  }
                )}
              </p>
            ) : null}
          </div>
        )}

        {contactSection}
      </div>
    </Dialog>
  )
}
