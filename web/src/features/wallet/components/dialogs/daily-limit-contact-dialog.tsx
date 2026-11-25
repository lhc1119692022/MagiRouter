import { QrCode } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { formatCurrency } from '../../lib'
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
  const qrCode = dailyLimit?.contact_wechat_qrcode?.trim() || ''
  const contactNote = dailyLimit?.contact_note?.trim() || ''

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'
      title={
        isLimitExceeded
          ? t('Daily Top-up Limit Exceeded')
          : t('Contact via WeChat for Large Top-ups')
      }
      description={
        contactNote ||
        t(
          'Online top-ups are capped per day. Scan the WeChat QR code below to contact us for larger top-ups or whitelist exemption.'
        )
      }
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
                  'Includes {{amount}} temporarily held by unpaid orders within the last 15 minutes.',
                  { amount: formatCurrency(dailyLimit.pending) }
                )}
              </p>
            ) : null}
          </div>
        )}

        {qrCode ? (
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
        )}
      </div>
    </Dialog>
  )
}
