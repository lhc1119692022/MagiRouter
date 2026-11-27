import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { PaymentSettingsSection } from '../payment-settings-section'

type PaymentProps = ComponentProps<typeof PaymentSettingsSection>
type PaymentValues = PaymentProps['defaultValues']

const defaults: PaymentValues = {
  PayAddress: 'https://pay.example.com',
  EpayId: '1001',
  EpayKey: '',
  EpaySignType: 'MD5',
  EpayMerchantPrivateKey: '',
  EpayPlatformPublicKey: '',
  Price: 7.3,
  MinTopUp: 1,
  CustomCallbackAddress: '',
  PayMethods: '[]',
  AmountOptions: '[]',
  AmountDiscount: '{}',
  DailyTopUpLimit: 200,
  DailyTopUpExemptUsers: '[]',
  DailyTopUpContactWeChatQRCode: '',
  DailyTopUpContactNote: '',
  OrderExpireMinutes: 20,
  StripeApiSecret: '',
  StripeWebhookSecret: '',
  StripePriceId: '',
  StripeUnitPrice: 8,
  StripeMinTopUp: 1,
  StripePromotionCodesEnabled: false,
  CreemApiKey: '',
  CreemWebhookSecret: '',
  CreemTestMode: false,
  CreemProducts: '[]',
}

function PaymentSettingsFixture(props: { values?: Partial<PaymentValues> }) {
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  const mergedValues: PaymentValues = {
    ...defaults,
    ...props.values,
  }

  return (
    <SettingsPageProvider actionsContainer={actions}>
      <div ref={setActions} />
      <PaymentSettingsSection
        defaultValues={mergedValues}
        waffoDefaultValues={{
          WaffoEnabled: false,
          WaffoApiKey: '',
          WaffoPrivateKey: '',
          WaffoPublicCert: '',
          WaffoSandboxPublicCert: '',
          WaffoSandboxApiKey: '',
          WaffoSandboxPrivateKey: '',
          WaffoSandbox: false,
          WaffoMerchantId: '',
          WaffoCurrency: 'USD',
          WaffoUnitPrice: 1,
          WaffoMinTopUp: 1,
          WaffoNotifyUrl: '',
          WaffoReturnUrl: '',
          WaffoPayMethods: '[]',
        }}
        waffoPancakeDefaultValues={{
          WaffoPancakeMerchantID: '',
          WaffoPancakePrivateKey: '',
          WaffoPancakeReturnURL: '',
        }}
        complianceDefaults={{
          confirmed: true,
          termsVersion: 'v1',
          confirmedAt: 1,
          confirmedBy: 1,
        }}
      />
    </SettingsPageProvider>
  )
}

function renderFixture(values?: Partial<PaymentValues>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PaymentSettingsFixture values={values} />
    </QueryClientProvider>
  )
}

describe('PaymentSettingsSection daily top-up limit settings', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('saves daily limit, whitelist entries, WeChat QR code, and contact note', async () => {
    const user = userEvent.setup()
    const putSpy = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true, message: '' } })
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        data: {
          items: [{ id: 88, username: 'vip_alice', email: 'vip@example.com' }],
          total: 1,
        },
      },
    })

    renderFixture()

    const limitInput = screen.getByLabelText(
      'Daily top-up limit per user (payment amount)'
    )
    expect(limitInput).toHaveValue(200)
    fireEvent.change(limitInput, { target: { value: '300' } })

    const noteInput = screen.getByLabelText('Over-limit contact message')
    await user.type(noteInput, 'Scan WeChat to arrange large top-up')

    const qrInput = screen.getByPlaceholderText(
      'Paste QR code image URL (https://...) or upload a local image'
    )
    await user.type(qrInput, 'https://cdn.example.com/wechat-qr.png')
    expect(screen.getByAltText('WeChat QR code preview')).toHaveAttribute(
      'src',
      'https://cdn.example.com/wechat-qr.png'
    )

    const whitelistInput = screen.getByPlaceholderText(
      'Search user or enter User ID / username / email, press Enter to add'
    )
    await user.type(whitelistInput, 'vip_alice')
    const suggestion = await screen.findByRole('button', {
      name: /vip_alice/i,
    })
    await user.click(suggestion)

    await user.type(whitelistInput, 'manual_vip{Enter}')

    const expireInput = screen.getByLabelText(
      'Order expiration timeout (minutes)'
    )
    expect(expireInput).toHaveValue(20)
    fireEvent.change(expireInput, { target: { value: '30' } })

    await user.click(screen.getByRole('button', { name: 'Save all settings' }))

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/api/option/', {
        key: 'payment_setting.daily_topup_limit',
        value: 300,
      })
      expect(putSpy).toHaveBeenCalledWith('/api/option/', {
        key: 'payment_setting.daily_topup_exempt_users',
        value: JSON.stringify(['88', 'manual_vip']),
      })
      expect(putSpy).toHaveBeenCalledWith('/api/option/', {
        key: 'payment_setting.daily_topup_contact_wechat_qrcode',
        value: 'https://cdn.example.com/wechat-qr.png',
      })
      expect(putSpy).toHaveBeenCalledWith('/api/option/', {
        key: 'payment_setting.daily_topup_contact_note',
        value: 'Scan WeChat to arrange large top-up',
      })
      expect(putSpy).toHaveBeenCalledWith('/api/option/', {
        key: 'payment_setting.order_expire_minutes',
        value: 30,
      })
    })
  })
})
