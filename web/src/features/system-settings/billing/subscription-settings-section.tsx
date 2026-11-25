import { Link } from '@tanstack/react-router'
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { SubscriptionsDialogs } from '@/features/subscriptions/components/subscriptions-dialogs'
import { SubscriptionsPrimaryButtons } from '@/features/subscriptions/components/subscriptions-primary-buttons'
import {
  SubscriptionsProvider,
  useSubscriptions,
} from '@/features/subscriptions/components/subscriptions-provider'
import { SubscriptionsTable } from '@/features/subscriptions/components/subscriptions-table'
import { cn } from '@/lib/utils'

import { SettingsSection } from '../components/settings-section'

interface SubscriptionSettingsSectionProps {
  complianceConfirmed: boolean
  hasEpay: boolean
  hasStripe: boolean
  hasCreem: boolean
  hasWaffoPancake: boolean
}

function SubscriptionSettingsContent({
  complianceConfirmed,
  hasEpay,
  hasStripe,
  hasCreem,
  hasWaffoPancake,
}: SubscriptionSettingsSectionProps) {
  const { t } = useTranslation()
  const { complianceConfirmed: serverComplianceConfirmed } = useSubscriptions()
  const effectiveCompliance = complianceConfirmed || serverComplianceConfirmed

  const channels = [
    { key: 'balance', label: t('Wallet Balance'), active: true },
    { key: 'epay', label: t('Online Payment'), active: hasEpay },
    { key: 'stripe', label: 'Stripe', active: hasStripe },
    { key: 'creem', label: 'Creem', active: hasCreem },
    { key: 'pancake', label: 'Waffo Pancake', active: hasWaffoPancake },
  ]

  return (
    <>
      <SettingsSection title={t('Subscription Plans')}>
        <div className='space-y-5'>
          <div className='bg-muted/25 grid gap-4 rounded-xl border p-4'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div className='space-y-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <CreditCard className='text-primary h-4 w-4' />
                  <h3 className='text-sm font-semibold'>
                    {t('Wallet Subscription Panel & Checkout Pipeline')}
                  </h3>
                </div>
                <p className='text-muted-foreground text-xs leading-relaxed'>
                  {t(
                    'Plans created and enabled below automatically appear in the right-hand Subscription panel of the Top-up page. When no enabled plans exist, users see a Coming Soon preview alongside pay-as-you-go recharge.'
                  )}
                </p>
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                <Link
                  to='/wallet'
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'gap-1.5'
                  )}
                >
                  <Wallet className='h-3.5 w-3.5' />
                  {t('Preview Wallet Page')}
                </Link>
                <Link
                  to='/subscriptions'
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'gap-1.5'
                  )}
                >
                  <ExternalLink className='h-3.5 w-3.5' />
                  {t('Full Subscription Manager')}
                </Link>
              </div>
            </div>

            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='bg-background flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5'>
                <div className='flex items-center gap-2 text-xs font-medium'>
                  {effectiveCompliance ? (
                    <CheckCircle2 className='h-4 w-4 text-emerald-600 dark:text-emerald-400' />
                  ) : (
                    <AlertCircle className='h-4 w-4 text-amber-600 dark:text-amber-400' />
                  )}
                  <span>{t('Payment Compliance Status')}</span>
                </div>
                <div className='flex items-center gap-2'>
                  <StatusBadge
                    variant={effectiveCompliance ? 'success' : 'warning'}
                    copyable={false}
                  >
                    {effectiveCompliance ? t('Confirmed') : t('Required')}
                  </StatusBadge>
                  {!effectiveCompliance && (
                    <Link
                      to='/system-settings/billing/$section'
                      params={{ section: 'payment' }}
                      className={cn(
                        buttonVariants({ variant: 'link', size: 'sm' }),
                        'h-auto p-0 text-xs'
                      )}
                    >
                      {t('Confirm')}
                    </Link>
                  )}
                </div>
              </div>

              <div className='bg-background flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5'>
                <span className='text-xs font-medium'>
                  {t('Available Payment Channels')}
                </span>
                <div className='flex flex-wrap gap-1.5'>
                  {channels.map((channel) => (
                    <StatusBadge
                      key={channel.key}
                      variant={channel.active ? 'success' : 'neutral'}
                      copyable={false}
                    >
                      {channel.label}
                    </StatusBadge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {!effectiveCompliance && (
            <Alert variant='destructive'>
              <AlertDescription>
                {t(
                  'Subscription plan creation and changes are locked until the administrator confirms compliance terms in Payment Gateway settings.'
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className='flex items-center justify-between gap-2'>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Configure plan pricing, validity duration, periodic quota resets, group upgrades, and third-party checkout IDs.'
              )}
            </p>
            <SubscriptionsPrimaryButtons />
          </div>

          <SubscriptionsTable />
        </div>
      </SettingsSection>

      <SubscriptionsDialogs />
    </>
  )
}

export function SubscriptionSettingsSection(
  props: SubscriptionSettingsSectionProps
) {
  return (
    <SubscriptionsProvider>
      <SubscriptionSettingsContent {...props} />
    </SubscriptionsProvider>
  )
}
