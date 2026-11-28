import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DailyLimitContactDialog } from '../components/dialogs/daily-limit-contact-dialog'
import { RechargeFormCard } from '../components/recharge-form-card'
import {
  buildDailyLimitMailtoHref,
  extractDailyTopUpLimitExceeded,
  isAmountOverDailyLimit,
  resolveDailyTopUpContactMethod,
} from '../lib/payment'
import type { DailyTopUpLimitStatus, TopupInfo } from '../types'

const baseTopupInfo: TopupInfo = {
  enable_online_topup: true,
  enable_stripe_topup: false,
  pay_methods: [{ name: 'Alipay', type: 'alipay' }],
  min_topup: 1,
  stripe_min_topup: 1,
  amount_options: [10, 50, 100],
  discount: {},
  enable_redemption: true,
}

const activeWeChatDailyLimit: DailyTopUpLimitStatus = {
  enabled: true,
  limit: 200,
  used: 120,
  pending: 30,
  remaining: 50,
  exempt: false,
  contact_method: 'wechat',
  contact_email: '',
  contact_wechat_qrcode: 'https://cdn.example.com/wechat-qr.png',
  contact_note: 'Scan WeChat for larger top-ups',
}

const activeEmailDailyLimit: DailyTopUpLimitStatus = {
  enabled: true,
  limit: 200,
  used: 120,
  pending: 30,
  remaining: 50,
  exempt: false,
  contact_method: 'email',
  contact_email: 'billing@example.com',
  contact_wechat_qrcode: '',
  contact_note: 'Email us for larger top-ups',
}

describe('daily top-up limit helpers', () => {
  it('detects structured daily limit exceeded API responses', () => {
    expect(
      extractDailyTopUpLimitExceeded({
        message: 'error',
        code: 'daily_topup_limit_exceeded',
        daily_limit: activeWeChatDailyLimit,
      })
    ).toEqual(activeWeChatDailyLimit)

    expect(
      extractDailyTopUpLimitExceeded({
        message: 'error',
        code: 'daily_topup_limit_exceeded',
        daily_limit: activeEmailDailyLimit,
      })
    ).toEqual(activeEmailDailyLimit)

    expect(
      extractDailyTopUpLimitExceeded({ message: 'error', data: 'other' })
    ).toBeNull()
  })

  it('resolves contact method and builds mailto href safely', () => {
    expect(resolveDailyTopUpContactMethod(activeEmailDailyLimit)).toBe('email')
    expect(resolveDailyTopUpContactMethod(activeWeChatDailyLimit)).toBe(
      'wechat'
    )
    expect(resolveDailyTopUpContactMethod(null)).toBe('email')
    expect(
      buildDailyLimitMailtoHref(
        'billing@example.com',
        'Large Top-up / Whitelist Request'
      )
    ).toBe(
      'mailto:billing@example.com?subject=Large%20Top-up%20%2F%20Whitelist%20Request'
    )
  })

  it('evaluates over-limit state accurately for regular and exempt users', () => {
    expect(isAmountOverDailyLimit(activeEmailDailyLimit, 50)).toBe(false)
    expect(isAmountOverDailyLimit(activeEmailDailyLimit, 50.01)).toBe(true)
    expect(
      isAmountOverDailyLimit({ ...activeEmailDailyLimit, exempt: true }, 9999)
    ).toBe(false)
    expect(
      isAmountOverDailyLimit({ ...activeEmailDailyLimit, enabled: false }, 9999)
    ).toBe(false)
  })
})

describe('RechargeFormCard daily top-up limit UI', () => {
  it('shows email contact CTA, notice, and inline email card when contact method is email', async () => {
    const user = userEvent.setup()
    const onOpenContact = vi.fn()

    render(
      <RechargeFormCard
        topupInfo={baseTopupInfo}
        presetAmounts={[{ value: 10 }, { value: 50 }, { value: 100 }]}
        selectedPreset={100}
        onSelectPreset={vi.fn()}
        topupAmount={100}
        onTopupAmountChange={vi.fn()}
        paymentAmount={100}
        calculating={false}
        onPaymentMethodSelect={vi.fn()}
        paymentLoading={null}
        redemptionCode=''
        onRedemptionCodeChange={vi.fn()}
        onRedeem={vi.fn()}
        redeeming={false}
        dailyLimit={activeEmailDailyLimit}
        onOpenDailyLimitContact={onOpenContact}
      />
    )

    expect(
      screen.getByRole('button', { name: 'Large top-up? Email Us' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('note', { name: 'Daily top-up limit notice' })
    ).toHaveTextContent(
      'During our early launch stage, online top-ups are capped daily to protect payment channel stability and cashflow security. For larger top-ups or whitelist access, please contact us via email.'
    )
    expect(screen.getByText('billing@example.com')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Send Email' })).toHaveAttribute(
      'href',
      'mailto:billing@example.com?subject=Large%20Top-up%20%2F%20Whitelist%20Request'
    )
    expect(
      screen.queryByAltText('WeChat Contact QR Code')
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'View Contact Email' }))
    expect(onOpenContact).toHaveBeenCalledWith(100)
  })

  it('shows remaining limit and inline WeChat QR code when payment exceeds remaining cap', async () => {
    const user = userEvent.setup()
    const onOpenContact = vi.fn()

    render(
      <RechargeFormCard
        topupInfo={baseTopupInfo}
        presetAmounts={[{ value: 10 }, { value: 50 }, { value: 100 }]}
        selectedPreset={100}
        onSelectPreset={vi.fn()}
        topupAmount={100}
        onTopupAmountChange={vi.fn()}
        paymentAmount={100}
        calculating={false}
        onPaymentMethodSelect={vi.fn()}
        paymentLoading={null}
        redemptionCode=''
        onRedemptionCodeChange={vi.fn()}
        onRedeem={vi.fn()}
        redeeming={false}
        dailyLimit={activeWeChatDailyLimit}
        onOpenDailyLimitContact={onOpenContact}
      />
    )

    expect(
      screen.getByText('Daily online top-up remaining: 50 / 200')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('note', { name: 'Daily top-up limit notice' })
    ).toHaveTextContent(
      'During our early launch stage, online top-ups are capped daily to protect payment channel stability and cashflow security. For larger top-ups or whitelist access, please contact us via WeChat.'
    )
    expect(screen.getByText('Daily Top-up Limit Exceeded')).toBeInTheDocument()
    expect(screen.getByAltText('WeChat Contact QR Code')).toHaveAttribute(
      'src',
      'https://cdn.example.com/wechat-qr.png'
    )

    await user.click(
      screen.getByRole('button', { name: 'View WeChat QR Code' })
    )
    expect(onOpenContact).toHaveBeenCalledWith(100)
  })

  it('shows exempt indicator and hides over-limit callout for whitelisted users', () => {
    render(
      <RechargeFormCard
        topupInfo={baseTopupInfo}
        presetAmounts={[{ value: 100 }]}
        selectedPreset={100}
        onSelectPreset={vi.fn()}
        topupAmount={500}
        onTopupAmountChange={vi.fn()}
        paymentAmount={500}
        calculating={false}
        onPaymentMethodSelect={vi.fn()}
        paymentLoading={null}
        redemptionCode=''
        onRedemptionCodeChange={vi.fn()}
        onRedeem={vi.fn()}
        redeeming={false}
        dailyLimit={{ ...activeEmailDailyLimit, exempt: true }}
        onOpenDailyLimitContact={vi.fn()}
      />
    )

    expect(
      screen.getByText('Daily top-up limit: Exempt (whitelisted)')
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('note', { name: 'Daily top-up limit notice' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Daily Top-up Limit Exceeded')
    ).not.toBeInTheDocument()
  })

  it('hides daily top-up limit notice when daily limit is disabled', () => {
    render(
      <RechargeFormCard
        topupInfo={baseTopupInfo}
        presetAmounts={[{ value: 100 }]}
        selectedPreset={100}
        onSelectPreset={vi.fn()}
        topupAmount={100}
        onTopupAmountChange={vi.fn()}
        paymentAmount={100}
        calculating={false}
        onPaymentMethodSelect={vi.fn()}
        paymentLoading={null}
        redemptionCode=''
        onRedemptionCodeChange={vi.fn()}
        onRedeem={vi.fn()}
        redeeming={false}
        dailyLimit={{ ...activeEmailDailyLimit, enabled: false }}
        onOpenDailyLimitContact={vi.fn()}
      />
    )

    expect(
      screen.queryByRole('note', { name: 'Daily top-up limit notice' })
    ).not.toBeInTheDocument()
  })
})

describe('DailyLimitContactDialog', () => {
  it('displays contact email, copy action, and mailto link when contact method is email', () => {
    render(
      <DailyLimitContactDialog
        open
        onOpenChange={vi.fn()}
        dailyLimit={activeEmailDailyLimit}
      />
    )

    expect(
      screen.getByText('Contact via Email for Large Top-ups')
    ).toBeInTheDocument()
    expect(screen.getByText('billing@example.com')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Copy email' })
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Send Email' })).toHaveAttribute(
      'href',
      'mailto:billing@example.com?subject=Large%20Top-up%20%2F%20Whitelist%20Request'
    )
  })

  it('displays fallback notice when email contact method has no configured address', () => {
    render(
      <DailyLimitContactDialog
        open
        onOpenChange={vi.fn()}
        dailyLimit={{ ...activeEmailDailyLimit, contact_email: '' }}
      />
    )

    expect(
      screen.getByText(
        'The administrator has not configured a contact email yet. Please contact site support to arrange a larger top-up or whitelist exemption.'
      )
    ).toBeInTheDocument()
  })

  it('displays WeChat QR code, daily stats, and pending hold notice', () => {
    render(
      <DailyLimitContactDialog
        open
        onOpenChange={vi.fn()}
        dailyLimit={activeWeChatDailyLimit}
        requestedAmount={100}
      />
    )

    expect(screen.getByText('Daily Top-up Limit Exceeded')).toBeInTheDocument()
    expect(
      screen.getByText('Scan WeChat for larger top-ups')
    ).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.getByAltText('WeChat Contact QR Code')).toHaveAttribute(
      'src',
      'https://cdn.example.com/wechat-qr.png'
    )
  })
})
