import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DailyLimitContactDialog } from '../components/dialogs/daily-limit-contact-dialog'
import { RechargeFormCard } from '../components/recharge-form-card'
import {
  extractDailyTopUpLimitExceeded,
  isAmountOverDailyLimit,
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

const activeDailyLimit: DailyTopUpLimitStatus = {
  enabled: true,
  limit: 200,
  used: 120,
  pending: 30,
  remaining: 50,
  exempt: false,
  contact_wechat_qrcode: 'https://cdn.example.com/wechat-qr.png',
  contact_note: 'Scan WeChat for larger top-ups',
}

describe('daily top-up limit helpers', () => {
  it('detects structured daily limit exceeded API responses', () => {
    expect(
      extractDailyTopUpLimitExceeded({
        message: 'error',
        code: 'daily_topup_limit_exceeded',
        daily_limit: activeDailyLimit,
      })
    ).toEqual(activeDailyLimit)

    expect(
      extractDailyTopUpLimitExceeded({ message: 'error', data: 'other' })
    ).toBeNull()
  })

  it('evaluates over-limit state accurately for regular and exempt users', () => {
    expect(isAmountOverDailyLimit(activeDailyLimit, 50)).toBe(false)
    expect(isAmountOverDailyLimit(activeDailyLimit, 50.01)).toBe(true)
    expect(
      isAmountOverDailyLimit({ ...activeDailyLimit, exempt: true }, 9999)
    ).toBe(false)
    expect(
      isAmountOverDailyLimit({ ...activeDailyLimit, enabled: false }, 9999)
    ).toBe(false)
  })
})

describe('RechargeFormCard daily top-up limit UI', () => {
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
        dailyLimit={activeDailyLimit}
        onOpenDailyLimitContact={onOpenContact}
      />
    )

    expect(
      screen.getByText('Daily online top-up remaining: 50 / 200')
    ).toBeInTheDocument()
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
        dailyLimit={{ ...activeDailyLimit, exempt: true }}
        onOpenDailyLimitContact={vi.fn()}
      />
    )

    expect(
      screen.getByText('Daily top-up limit: Exempt (whitelisted)')
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Daily Top-up Limit Exceeded')
    ).not.toBeInTheDocument()
  })
})

describe('DailyLimitContactDialog', () => {
  it('displays WeChat QR code, daily stats, and pending hold notice', () => {
    render(
      <DailyLimitContactDialog
        open
        onOpenChange={vi.fn()}
        dailyLimit={activeDailyLimit}
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
