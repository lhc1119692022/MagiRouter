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
import { getServerMessage } from '@/lib/server-error-message'

import {
  PAYMENT_TYPES,
  DEFAULT_PRESET_MULTIPLIERS,
  DEFAULT_PAYMENT_TYPE,
  DEFAULT_MIN_TOPUP,
} from '../constants'
import type {
  DailyTopUpContactMethod,
  DailyTopUpLimitStatus,
  PaymentMethod,
  PresetAmount,
  TopupInfo,
} from '../types'

// ============================================================================
// Payment Processing Functions
// ============================================================================

/**
 * Payment endpoints answer errors as {"message": "error", "data": text}. When
 * the response also carries a message_key, this is its translation; callers
 * fall back to the text they already read.
 */
export function getPaymentErrorTranslation(
  response: unknown
): string | undefined {
  if (!response || typeof response !== 'object') return undefined
  const body = response as Record<string, unknown>
  if (typeof body.message_key !== 'string' || !body.message_key) {
    return undefined
  }
  return getServerMessage(body)
}

export function resolveDailyTopUpContactMethod(
  dailyLimit:
    | {
        contact_method?: string | null
        contact_email?: string | null
        contact_wechat_qrcode?: string | null
      }
    | null
    | undefined
): DailyTopUpContactMethod {
  const normalized = dailyLimit?.contact_method?.trim().toLowerCase()
  if (normalized === 'wechat') {
    return 'wechat'
  }
  if (normalized === 'email') {
    return 'email'
  }
  if (
    dailyLimit?.contact_wechat_qrcode?.trim() &&
    !dailyLimit?.contact_email?.trim()
  ) {
    return 'wechat'
  }
  return 'email'
}

export function buildDailyLimitMailtoHref(
  email: string,
  subject: string
): string {
  const trimmed = email.trim()
  if (!trimmed) {
    return ''
  }
  return `mailto:${trimmed}?subject=${encodeURIComponent(subject)}`
}

export function extractDailyTopUpLimitExceeded(
  response: unknown
): DailyTopUpLimitStatus | null {
  if (!response || typeof response !== 'object') {
    return null
  }
  const body = response as Record<string, unknown>
  if (body.code !== 'daily_topup_limit_exceeded') {
    return null
  }
  const rawLimit = body.daily_limit
  if (!rawLimit || typeof rawLimit !== 'object') {
    return null
  }
  const limitObj = rawLimit as Record<string, unknown>
  const contactEmail =
    typeof limitObj.contact_email === 'string' ? limitObj.contact_email : ''
  const contactWeChatQR =
    typeof limitObj.contact_wechat_qrcode === 'string'
      ? limitObj.contact_wechat_qrcode
      : ''
  const contactMethod = resolveDailyTopUpContactMethod({
    contact_method:
      typeof limitObj.contact_method === 'string'
        ? limitObj.contact_method
        : undefined,
    contact_email: contactEmail,
    contact_wechat_qrcode: contactWeChatQR,
  })
  const parsed: DailyTopUpLimitStatus = {
    enabled: Boolean(limitObj.enabled),
    limit: Number(limitObj.limit) || 0,
    used: Number(limitObj.used) || 0,
    pending: Number(limitObj.pending) || 0,
    remaining: Number(limitObj.remaining) || 0,
    exempt: Boolean(limitObj.exempt),
    contact_method: contactMethod,
    contact_email: contactEmail,
    contact_wechat_qrcode: contactWeChatQR,
    contact_note:
      typeof limitObj.contact_note === 'string' ? limitObj.contact_note : '',
  }
  const pendingHoldMinutes = Number(limitObj.pending_hold_minutes)
  if (Number.isFinite(pendingHoldMinutes) && pendingHoldMinutes > 0) {
    parsed.pending_hold_minutes = pendingHoldMinutes
  }
  return parsed
}

export function isAmountOverDailyLimit(
  dailyLimit: DailyTopUpLimitStatus | null | undefined,
  paymentMoney: number
): boolean {
  if (!dailyLimit || !dailyLimit.enabled || dailyLimit.exempt) {
    return false
  }
  if (dailyLimit.remaining <= 0) {
    return true
  }
  return paymentMoney > 0 && paymentMoney - dailyLimit.remaining > 0.0001
}

/**
 * Check if browser is Safari
 */
function isSafariBrowser(): boolean {
  return (
    navigator.userAgent.includes('Safari') &&
    !navigator.userAgent.includes('Chrome')
  )
}

/**
 * Submit payment form (for non-Stripe payments)
 */
export function submitPaymentForm(
  url: string,
  params: Record<string, unknown>
): void {
  const form = document.createElement('form')
  form.action = url
  form.method = 'POST'

  // Don't open in new tab for Safari
  if (!isSafariBrowser()) {
    form.target = '_blank'
  }

  // Add form parameters
  Object.entries(params).forEach(([key, value]) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = key
    input.value = String(value)
    form.appendChild(input)
  })

  document.body.appendChild(form)
  form.submit()
  document.body.removeChild(form)
}

/**
 * Check if payment method is Stripe
 */
export function isStripePayment(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPES.STRIPE
}

/**
 * Check if payment method is Waffo
 */
export function isWaffoPayment(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPES.WAFFO
}

/**
 * Check if payment method is Waffo Pancake
 *
 * Pancake is a metered-style payment that goes through a dedicated checkout
 * URL flow rather than the generic epay form submission, so it must be
 * special-cased in payment dispatch logic.
 */
export function isWaffoPancakePayment(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPES.WAFFO_PANCAKE
}

export interface PaymentProcessors {
  regular: (topupAmount: number, paymentType: string) => Promise<boolean>
  waffo: (topupAmount: number, payMethodIndex: number) => Promise<boolean>
  waffoPancake: (topupAmount: number) => Promise<boolean>
}

export async function dispatchSelectedPayment(
  paymentMethod: PaymentMethod,
  topupAmount: number,
  waffoMethodIndex: number | null,
  processors: PaymentProcessors
): Promise<boolean> {
  if (isWaffoPayment(paymentMethod.type)) {
    if (waffoMethodIndex === null) {
      return false
    }
    return processors.waffo(topupAmount, waffoMethodIndex)
  }

  if (isWaffoPancakePayment(paymentMethod.type)) {
    return processors.waffoPancake(topupAmount)
  }

  return processors.regular(topupAmount, paymentMethod.type)
}

/**
 * Get default payment type from topup info
 */
export function getDefaultPaymentType(topupInfo: TopupInfo | null): string {
  if (!topupInfo) {
    return DEFAULT_PAYMENT_TYPE
  }

  // Return first available payment method or default
  if (topupInfo.pay_methods?.length > 0) {
    return topupInfo.pay_methods[0].type
  }

  if (topupInfo.enable_stripe_topup) {
    return PAYMENT_TYPES.STRIPE
  }

  if (topupInfo.enable_waffo_topup) {
    return PAYMENT_TYPES.WAFFO
  }

  if (topupInfo.enable_waffo_pancake_topup) {
    return PAYMENT_TYPES.WAFFO_PANCAKE
  }

  return DEFAULT_PAYMENT_TYPE
}

/**
 * Get minimum topup amount from topup info
 */
export function getMinTopupAmount(topupInfo: TopupInfo | null): number {
  if (!topupInfo) {
    return DEFAULT_MIN_TOPUP
  }

  if (topupInfo.enable_online_topup) {
    return topupInfo.min_topup
  }

  if (topupInfo.enable_stripe_topup) {
    return topupInfo.stripe_min_topup
  }

  if (topupInfo.enable_waffo_topup) {
    return topupInfo.waffo_min_topup || DEFAULT_MIN_TOPUP
  }

  if (topupInfo.enable_waffo_pancake_topup) {
    return topupInfo.waffo_pancake_min_topup || DEFAULT_MIN_TOPUP
  }

  return DEFAULT_MIN_TOPUP
}

/**
 * Generate preset amounts based on minimum topup
 */
export function generatePresetAmounts(minAmount: number): PresetAmount[] {
  return DEFAULT_PRESET_MULTIPLIERS.map((multiplier) => ({
    value: minAmount * multiplier,
  }))
}

/**
 * Merge custom preset amounts with discounts
 */
export function mergePresetAmounts(
  amountOptions: number[],
  discounts: Record<number, number>
): PresetAmount[] {
  if (!amountOptions || amountOptions.length === 0) {
    return []
  }

  return amountOptions.map((amount) => ({
    value: amount,
    discount: discounts[amount] || 1.0,
  }))
}
