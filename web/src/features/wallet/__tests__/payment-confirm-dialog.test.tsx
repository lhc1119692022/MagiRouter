import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PaymentConfirmDialog } from '../components/dialogs/payment-confirm-dialog'

afterEach(cleanup)

describe('PaymentConfirmDialog', () => {
  it('displays the RMB symbol for payment, original, and saved amounts', () => {
    render(
      <PaymentConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        topupAmount={10}
        paymentAmount={8}
        paymentMethod={{ name: 'Alipay', type: 'alipay' }}
        calculating={false}
        processing={false}
        discountRate={0.8}
        usdExchangeRate={1}
      />
    )

    expect(screen.getByText('¥8')).toBeVisible()
    expect(screen.getByText('¥10')).toBeVisible()
    expect(screen.getByText('¥2')).toBeVisible()
  })
})
