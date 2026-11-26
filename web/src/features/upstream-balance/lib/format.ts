import type { TFunction } from 'i18next'

export function formatCNY(
  value: number | null | undefined,
  locale: string | undefined
): string {
  if (value == null || !Number.isFinite(value)) return '-'
  const absVal = Math.abs(value)
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absVal)
  return value < 0 ? `-¥${formatted}` : `¥${formatted}`
}

export function formatUSD(
  value: number | null | undefined,
  locale: string | undefined
): string {
  if (value == null || !Number.isFinite(value)) return '-'
  const absVal = Math.abs(value)
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absVal)
  return value < 0 ? `-$${formatted}` : `$${formatted}`
}

export function formatPercentValue(
  value: number | null | undefined,
  locale: string | undefined
): string {
  if (value == null || !Number.isFinite(value)) return '-'
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(value)
  return `${formatted}%`
}

export function formatRate(
  value: number | null | undefined,
  locale: string | undefined
): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 4,
  }).format(value)
}

export function formatCheckTime(
  unixSeconds: number | null | undefined,
  locale: string | undefined
): string {
  if (!unixSeconds || unixSeconds <= 0) return '-'
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(unixSeconds * 1000))
}

export function formatEditableNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  return String(value)
}

export function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export function getProviderLabel(provider: string, t: TFunction): string {
  switch (provider) {
    case 'new_api':
      return 'New API'
    case 'sub2api':
      return 'Sub2API'
    case 'ignore':
      return t('Ignored')
    default:
      return t('Unconfigured')
  }
}

export function getBalanceSourceLabel(
  source: string | undefined,
  t: TFunction
): string {
  switch (source) {
    case 'user_self':
      return t('Site Account (Access Token)')
    case 'token_user_quota':
      return t('Site Account (Token Query)')
    case 'token_quota':
      return t('Token Quota')
    case 'sub2api_wallet':
      return t('Sub2API Wallet')
    case 'sub2api_remaining':
      return t('Sub2API Remaining')
    default:
      return ''
  }
}

export function getPercentSourceLabel(
  source: string | undefined,
  t: TFunction
): string {
  switch (source) {
    case 'reference_total':
      return t('Reference Budget')
    case 'account_total':
      return t('Account Lifetime Total')
    case 'token_total':
      return t('Token Limit Total')
    case 'subscription_limit':
      return t('Subscription Limit')
    default:
      return ''
  }
}

export function getWindowPeriodLabel(period: string, t: TFunction): string {
  switch (period) {
    case 'daily':
      return t('Daily')
    case 'weekly':
      return t('Weekly')
    case 'monthly':
      return t('Monthly')
    default:
      return period
  }
}
