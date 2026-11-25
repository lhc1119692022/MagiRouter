/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  AlertCircle,
  ExternalLink,
  FileText,
  Loader2,
  QrCode,
  Receipt,
  ShieldCheck,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  formatCurrency,
  getDiscountLabel,
  getPaymentIcon,
  getMinTopupAmount,
  calculatePresetPricing,
  isAmountOverDailyLimit,
} from '../lib'
import type {
  DailyTopUpLimitStatus,
  PaymentMethod,
  PresetAmount,
  TopupInfo,
  CreemProduct,
  WaffoPayMethod,
} from '../types'
import { CreemProductsSection } from './creem-products-section'

interface RechargeFormCardProps {
  topupInfo: TopupInfo | null
  presetAmounts: PresetAmount[]
  selectedPreset: number | null
  onSelectPreset: (preset: PresetAmount) => void
  topupAmount: number
  onTopupAmountChange: (amount: number) => void
  paymentAmount: number
  calculating: boolean
  onPaymentMethodSelect: (method: PaymentMethod) => void
  paymentLoading: string | null
  redemptionCode: string
  onRedemptionCodeChange: (code: string) => void
  onRedeem: () => void
  redeeming: boolean
  topupLink?: string
  loading?: boolean
  priceRatio?: number
  usdExchangeRate?: number
  onOpenBilling?: () => void
  creemProducts?: CreemProduct[]
  enableCreemTopup?: boolean
  onCreemProductSelect?: (product: CreemProduct) => void
  enableWaffoTopup?: boolean
  waffoPayMethods?: WaffoPayMethod[]
  waffoMinTopup?: number
  onWaffoMethodSelect?: (method: WaffoPayMethod, index: number) => void
  enableWaffoPancakeTopup?: boolean
  dailyLimit?: DailyTopUpLimitStatus | null
  onOpenDailyLimitContact?: (requestedAmount?: number) => void
  onOpenPaymentSettings?: () => void
}

export function RechargeFormCard({
  topupInfo,
  presetAmounts,
  selectedPreset,
  onSelectPreset,
  topupAmount,
  onTopupAmountChange,
  paymentAmount,
  calculating,
  onPaymentMethodSelect,
  paymentLoading,
  redemptionCode,
  onRedemptionCodeChange,
  onRedeem,
  redeeming,
  topupLink,
  loading,
  priceRatio = 1,
  usdExchangeRate = 1,
  onOpenBilling,
  creemProducts,
  enableCreemTopup,
  onCreemProductSelect,
  enableWaffoTopup,
  waffoPayMethods,
  waffoMinTopup,
  onWaffoMethodSelect,
  enableWaffoPancakeTopup,
  dailyLimit,
  onOpenDailyLimitContact,
  onOpenPaymentSettings,
}: RechargeFormCardProps) {
  const { t } = useTranslation()
  const [localAmount, setLocalAmount] = useState(topupAmount.toString())

  useEffect(() => {
    // Empty string must survive, otherwise the field can never be cleared
    setLocalAmount((prev) =>
      prev === '' && topupAmount === 0 ? prev : topupAmount.toString()
    )
  }, [topupAmount])

  const handleAmountChange = (value: string) => {
    setLocalAmount(value)
    const numValue = Number.parseInt(value) || 0
    if (numValue >= 0) {
      onTopupAmountChange(numValue)
    }
  }

  const hasConfigurableTopup =
    topupInfo?.enable_online_topup ||
    topupInfo?.enable_stripe_topup ||
    enableWaffoTopup ||
    enableWaffoPancakeTopup
  const hasAnyTopup = hasConfigurableTopup || enableCreemTopup
  const hasStandardPaymentMethods =
    Array.isArray(topupInfo?.pay_methods) && topupInfo.pay_methods.length > 0
  const hasWaffoPaymentMethods =
    Array.isArray(waffoPayMethods) && waffoPayMethods.length > 0
  const minTopup = getMinTopupAmount(topupInfo)
  const redemptionEnabled = topupInfo?.enable_redemption !== false
  const showDailyLimit = Boolean(dailyLimit?.enabled)
  const isOverDailyLimit = isAmountOverDailyLimit(dailyLimit, paymentAmount)
  const qrCode = dailyLimit?.contact_wechat_qrcode?.trim() || ''

  if (loading) {
    return (
      <div className='el-console-card'>
        <div className='el-console-card-head'>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='mt-2 h-4 w-48' />
        </div>
        <div className='space-y-4'>
          <div className='billing-preset-grid'>
            {Array.from({ length: 6 }, (_, index) => `preset-${index}`).map(
              (key) => (
                <Skeleton key={key} className='h-[68px] rounded-xl' />
              )
            )}
          </div>
          <Skeleton className='h-10 w-full rounded-[10px]' />
          <div className='flex gap-2 pt-2'>
            <Skeleton className='h-10 flex-1 rounded-[10px]' />
            <Skeleton className='h-10 w-24 rounded-full' />
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className='el-console-card'>
      <div className='el-console-card-head'>
        <div>
          <h2 className='el-console-card-title'>{t('Online Top-up')}</h2>
          <p className='el-console-card-sub'>
            {t('Pay-as-you-go balance, instant credit, never expires.')}
          </p>
        </div>
        {onOpenBilling ? (
          <button
            type='button'
            onClick={onOpenBilling}
            className='el-btn el-btn-xs el-btn-white'
          >
            <Receipt className='size-3.5' />
            {t('Order History')}
          </button>
        ) : null}
      </div>

      <div
        role='note'
        aria-label={t('Invoicing notice')}
        className='billing-invoice-banner'
      >
        <FileText className='size-4' />
        <div className='min-w-0'>
          <span className='font-semibold'>
            {t('Invoicing Not Yet Supported')}
          </span>
          {' · '}
          <span>
            {t(
              'Our platform has just launched and does not support issuing invoices yet. Please follow site announcements for future updates.'
            )}
          </span>
        </div>
      </div>

      {/* Online Topup Section */}
      {hasAnyTopup ? (
        <div className='space-y-4 sm:space-y-6'>
          {showDailyLimit && dailyLimit && (
            <div className='bg-muted/30 flex flex-col gap-2 rounded-lg border px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between'>
              {dailyLimit.exempt ? (
                <div className='flex items-center gap-2 text-xs font-medium text-green-600 dark:text-green-400'>
                  <ShieldCheck className='h-4 w-4 shrink-0' />
                  <span>{t('Daily top-up limit: Exempt (whitelisted)')}</span>
                </div>
              ) : (
                <>
                  <div className='space-y-0.5'>
                    <div className='text-xs font-medium'>
                      {t(
                        'Daily online top-up remaining: {{remaining}} / {{limit}}',
                        {
                          remaining: formatCurrency(dailyLimit.remaining),
                          limit: formatCurrency(dailyLimit.limit),
                        }
                      )}
                    </div>
                    {dailyLimit.pending > 0 && (
                      <div className='text-muted-foreground text-[11px]'>
                        {t('Pending orders hold: {{pending}}', {
                          pending: formatCurrency(dailyLimit.pending),
                        })}
                      </div>
                    )}
                  </div>
                  {onOpenDailyLimitContact && (
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => onOpenDailyLimitContact()}
                      className='h-7 shrink-0 gap-1.5 self-start text-xs sm:self-auto'
                    >
                      <QrCode className='h-3.5 w-3.5' />
                      {t('Large top-up? WeChat QR')}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          {hasConfigurableTopup && (
            <>
              {presetAmounts.length > 0 && (
                <div className='space-y-2'>
                  <Label className='text-muted-foreground text-xs font-medium'>
                    {t('Amount')}
                  </Label>
                  <div className='billing-preset-grid'>
                    {presetAmounts.map((preset) => {
                      const discount =
                        preset.discount ||
                        topupInfo?.discount?.[preset.value] ||
                        1.0
                      const {
                        displayValue,
                        actualPrice,
                        savedAmount,
                        hasDiscount,
                      } = calculatePresetPricing(
                        preset.value,
                        priceRatio,
                        discount,
                        usdExchangeRate
                      )
                      const isSelected = selectedPreset === preset.value
                      return (
                        <button
                          key={preset.value}
                          type='button'
                          className={cn(
                            'billing-preset-tile',
                            isSelected && 'is-active'
                          )}
                          onClick={() => onSelectPreset(preset)}
                        >
                          <div className='billing-preset-usd tabular-nums'>
                            {formatNumber(displayValue)}
                          </div>
                          {hasDiscount && (
                            <div className='billing-preset-tag'>
                              {getDiscountLabel(discount, t)}
                            </div>
                          )}
                          <div className='billing-preset-cny tabular-nums'>
                            {hasDiscount && savedAmount > 0 ? (
                              <Trans
                                t={t}
                                i18nKey='Pay {{amount}} <savings>• Save {{saved}}</savings>'
                                values={{
                                  amount: formatCurrency(actualPrice),
                                  saved: formatCurrency(savedAmount),
                                }}
                                components={{
                                  savings: (
                                    <span
                                      className={
                                        isSelected
                                          ? undefined
                                          : 'text-emerald-600 dark:text-emerald-400'
                                      }
                                    />
                                  ),
                                }}
                              />
                            ) : (
                              t('Pay {{amount}}', {
                                amount: formatCurrency(actualPrice),
                              })
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className='space-y-2'>
                <Label
                  htmlFor='topup-amount'
                  className='text-muted-foreground text-xs font-medium'
                >
                  {t('Custom Amount')}
                </Label>
                <div className='billing-custom-row'>
                  <div className='billing-input-box'>
                    <input
                      id='topup-amount'
                      type='number'
                      value={localAmount}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      min={minTopup}
                      placeholder={t('Minimum {{amount}}', {
                        amount: minTopup,
                      })}
                    />
                  </div>
                  <div className='billing-note-strip flex h-10 items-center gap-2 py-0'>
                    <span className='truncate text-xs'>
                      {t('Amount to pay:')}
                    </span>
                    {calculating ? (
                      <Skeleton className='h-5 w-16' />
                    ) : (
                      <span className='font-mono text-sm font-medium text-[var(--ink-strong)] tabular-nums'>
                        {formatCurrency(paymentAmount)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {isOverDailyLimit && dailyLimit && (
                <div className='rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 sm:p-4'>
                  <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='space-y-1.5'>
                      <div className='flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400'>
                        <AlertCircle className='h-4 w-4 shrink-0' />
                        <span>{t('Daily Top-up Limit Exceeded')}</span>
                      </div>
                      <p className='text-muted-foreground text-xs leading-relaxed'>
                        {dailyLimit.remaining <= 0
                          ? t(
                              'You have reached today’s online top-up limit of {{limit}}. Scan the WeChat QR code to contact us for larger top-ups.',
                              { limit: formatCurrency(dailyLimit.limit) }
                            )
                          : t(
                              'Payment amount {{amount}} exceeds today’s remaining limit of {{remaining}} (daily cap: {{limit}}). Scan the WeChat QR code to contact us.',
                              {
                                amount: formatCurrency(paymentAmount),
                                remaining: formatCurrency(dailyLimit.remaining),
                                limit: formatCurrency(dailyLimit.limit),
                              }
                            )}
                      </p>
                      {dailyLimit.contact_note && (
                        <p className='text-foreground text-xs'>
                          {dailyLimit.contact_note}
                        </p>
                      )}
                      {onOpenDailyLimitContact && (
                        <div className='pt-1'>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() =>
                              onOpenDailyLimitContact(
                                paymentAmount > 0 ? paymentAmount : undefined
                              )
                            }
                            className='h-8 gap-1.5 text-xs'
                          >
                            <QrCode className='h-3.5 w-3.5' />
                            {t('View WeChat QR Code')}
                          </Button>
                        </div>
                      )}
                    </div>
                    {qrCode && (
                      <div className='shrink-0 self-center rounded-lg border bg-white p-2 shadow-xs sm:self-auto'>
                        <img
                          src={qrCode}
                          alt={t('WeChat Contact QR Code')}
                          className='h-28 w-28 object-contain'
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className='space-y-2'>
                <Label className='text-muted-foreground text-xs font-medium'>
                  {t('Payment Method')}
                </Label>
                {hasStandardPaymentMethods ? (
                  <div className='billing-pay-grid'>
                    {topupInfo?.pay_methods?.map((method) => {
                      const minTopup = Math.max(
                        method.min_topup || 0,
                        getMinTopupAmount(topupInfo)
                      )
                      const disabled = minTopup > topupAmount
                      const disabledReason = disabled
                        ? t('Minimum topup amount: {{amount}}', {
                            amount: minTopup,
                          })
                        : undefined
                      const disabledLabel = disabled
                        ? `${t('Minimum:')} ${minTopup}`
                        : undefined

                      const button = (
                        <button
                          key={method.type}
                          type='button'
                          onClick={() => onPaymentMethodSelect(method)}
                          disabled={disabled || !!paymentLoading}
                          title={disabledReason}
                          aria-label={
                            disabledReason
                              ? `${method.name}. ${disabledReason}`
                              : method.name
                          }
                          className='billing-pay-tile'
                        >
                          {paymentLoading === method.type ? (
                            <Loader2 className='h-4 w-4 animate-spin' />
                          ) : (
                            getPaymentIcon(
                              method.type,
                              'h-4 w-4',
                              method.icon,
                              method.name
                            )
                          )}
                          <span className='flex min-w-0 flex-col items-start gap-0.5'>
                            <span className='max-w-full truncate'>
                              {method.name}
                            </span>
                            {disabledLabel && (
                              <span className='text-muted-foreground max-w-full truncate text-[11px] leading-4 font-normal'>
                                {disabledLabel}
                              </span>
                            )}
                          </span>
                        </button>
                      )

                      return disabled ? (
                        <TooltipProvider key={method.type}>
                          <Tooltip>
                            <TooltipTrigger render={button} />
                            <TooltipContent>{disabledReason}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        button
                      )
                    })}
                  </div>
                ) : null}
                {!hasStandardPaymentMethods && !hasWaffoPaymentMethods && (
                  <div className='billing-note-strip'>
                    {t(
                      'No payment methods available. Please contact administrator.'
                    )}
                  </div>
                )}
              </div>

              {enableWaffoTopup &&
                hasWaffoPaymentMethods &&
                onWaffoMethodSelect && (
                  <div className='space-y-2'>
                    <Label className='text-muted-foreground text-xs font-medium'>
                      {t('Waffo Payment')}
                    </Label>
                    <div className='billing-pay-grid'>
                      {waffoPayMethods?.map((method, index) => {
                        const loadingKey = `waffo-${index}`
                        const methodKey = `${method.payMethodType ?? 'unknown'}-${method.payMethodName ?? method.name}`
                        const waffoMin = waffoMinTopup || 0
                        const belowMin = waffoMin > topupAmount
                        const disabledReason = belowMin
                          ? t('Minimum topup amount: {{amount}}', {
                              amount: waffoMin,
                            })
                          : undefined
                        const disabledLabel = belowMin
                          ? `${t('Minimum:')} ${waffoMin}`
                          : undefined

                        let methodIcon = getPaymentIcon('waffo')
                        if (paymentLoading === loadingKey) {
                          methodIcon = (
                            <Loader2 className='h-4 w-4 animate-spin' />
                          )
                        } else if (method.icon) {
                          methodIcon = (
                            <img
                              src={method.icon}
                              alt={method.name}
                              className='h-4 w-4 object-contain'
                            />
                          )
                        }

                        const button = (
                          <button
                            key={methodKey}
                            type='button'
                            onClick={() => onWaffoMethodSelect(method, index)}
                            disabled={belowMin || !!paymentLoading}
                            title={disabledReason}
                            aria-label={
                              disabledReason
                                ? `${method.name}. ${disabledReason}`
                                : method.name
                            }
                            className='billing-pay-tile'
                          >
                            {methodIcon}
                            <span className='flex min-w-0 flex-col items-start gap-0.5'>
                              <span className='max-w-full truncate'>
                                {method.name}
                              </span>
                              {disabledLabel && (
                                <span className='text-muted-foreground max-w-full truncate text-[11px] leading-4 font-normal'>
                                  {disabledLabel}
                                </span>
                              )}
                            </span>
                          </button>
                        )

                        return belowMin ? (
                          <TooltipProvider key={methodKey}>
                            <Tooltip>
                              <TooltipTrigger render={button} />
                              <TooltipContent>{disabledReason}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          button
                        )
                      })}
                    </div>
                  </div>
                )}
            </>
          )}
        </div>
      ) : (
        <div className='billing-note-strip flex flex-wrap items-center justify-between gap-2.5'>
          <span>
            {t(
              'Online topup is not enabled. Please use redemption code or contact administrator.'
            )}
          </span>
          {onOpenPaymentSettings && (
            <button
              type='button'
              onClick={onOpenPaymentSettings}
              className='el-btn el-btn-xs el-btn-white shrink-0'
            >
              {t('Configure Payment Gateway')}
            </button>
          )}
        </div>
      )}

      {/* Creem Products Section */}
      {enableCreemTopup &&
        Array.isArray(creemProducts) &&
        creemProducts.length > 0 &&
        onCreemProductSelect && (
          <div className='space-y-2.5 border-t pt-4 sm:space-y-3 sm:pt-6'>
            <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
              {t('Creem Payment')}
            </Label>
            <CreemProductsSection
              products={creemProducts}
              onProductSelect={onCreemProductSelect}
            />
          </div>
        )}

      {/* Redemption Code Section */}
      {redemptionEnabled ? (
        <div className='space-y-2.5 border-t border-[var(--divider-color)] pt-4'>
          <Label
            htmlFor='redemption-code'
            className='text-xs font-medium text-[var(--ink-strong)]'
          >
            {t('Have a Code?')}
          </Label>
          <div className='flex items-center gap-2'>
            <div className='billing-input-box'>
              <input
                id='redemption-code'
                value={redemptionCode}
                onChange={(e) => onRedemptionCodeChange(e.target.value)}
                placeholder={t('Enter your redemption code')}
              />
            </div>
            <button
              type='button'
              onClick={onRedeem}
              disabled={redeeming}
              className='el-btn el-btn-md el-btn-primary shrink-0'
            >
              {redeeming && <Loader2 className='h-4 w-4 animate-spin' />}
              {t('Redeem')}
            </button>
          </div>
          {topupLink && (
            <p className='text-muted-foreground text-xs'>
              {t('Need a redemption code?')}{' '}
              <a
                href={topupLink}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1 underline-offset-4 hover:underline'
              >
                {t('Get one here')}
                <ExternalLink className='h-3 w-3' />
              </a>
            </p>
          )}
        </div>
      ) : (
        <div className='billing-note-strip'>
          {t(
            'Redemption codes are disabled until the administrator confirms compliance terms.'
          )}
        </div>
      )}
    </section>
  )
}
