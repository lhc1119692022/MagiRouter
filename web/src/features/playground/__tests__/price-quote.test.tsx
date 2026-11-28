import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PricingModel } from '@/features/pricing/types'

import {
  PlaygroundOfficialPrice,
  PlaygroundPriceQuote,
} from '../components/playground-price-quote'

const rate = vi.hoisted(() => ({ value: 7 as number | undefined }))
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: { usd_exchange_rate: rate.value } }),
}))

const model: PricingModel = {
  id: 10,
  model_name: 'example-model',
  quota_type: 0,
  model_ratio: 2,
  completion_ratio: 3,
  enable_groups: ['standard'],
  official_price: {
    source_url: 'https://example.org/prices',
    input_usd_per_million: 4,
    output_usd_per_million: 3,
  },
}
const groups = [{ label: 'Standard', value: 'standard', ratio: 0.5 }]

afterEach(() => {
  cleanup()
  rate.value = 7
})

describe('Playground price comparison', () => {
  it('shows a sourced USD list price even when zero, without converting it to a platform quote', () => {
    rate.value = undefined
    const { rerender } = render(
      <PlaygroundOfficialPrice
        price={{
          source_url: 'https://publisher.example/pricing',
          input_usd_per_million: 0,
        }}
      />
    )
    const reference = screen.getByRole('link')
    expect(reference).toHaveAttribute(
      'href',
      'https://publisher.example/pricing'
    )
    expect(reference).toHaveTextContent(/Input.*\$0.*1M token/)
    expect(reference).not.toHaveTextContent(/Output|Per-request|CNY/)
    rerender(
      <PlaygroundOfficialPrice
        price={{
          source_url: 'https://publisher.example/pricing',
          usd_per_request: 0.25,
        }}
      />
    )
    expect(screen.getByRole('link')).toHaveTextContent(/\$0.25.*request/)
    expect(screen.queryByText(/token/)).toBeNull()
  })

  it.each([
    undefined,
    {
      source_url: 'http://publisher.example/pricing',
      input_usd_per_million: 3,
    },
    { source_url: 'https://publisher.example/pricing', usd_per_request: -1 },
    {
      source_url: 'https://publisher.example/pricing',
      output_usd_per_million: Infinity,
    },
    {
      source_url: 'https://publisher.example/pricing',
      usd_per_request: 1,
      input_usd_per_million: 3,
    },
  ])(
    'does not publish missing or invalid official pricing as a reference price (%j)',
    (price) => {
      render(<PlaygroundOfficialPrice price={price} />)
      expect(screen.getByText('Not provided')).toBeVisible()
      expect(screen.queryByRole('link')).toBeNull()
    }
  )

  it('does not advertise a fallback ratio or a discount when the catalog explicitly marks the price as unconfigured', () => {
    const unpriced = { ...model, model_ratio: 37.5, price_unconfigured: true }
    const { container } = render(
      <PlaygroundPriceQuote model={unpriced} group='standard' groups={groups} />
    )
    expect(screen.getByText('Unset price')).toBeVisible()
    expect(screen.queryByText(/^[¥￥]/)).toBeNull()
    expect(container.querySelector('del')).toBeNull()
  })

  it('uses the effective key multiplier and CNY rate once, striking only a higher published price in the same unit', () => {
    const { container } = render(
      <PlaygroundPriceQuote model={model} group='standard' groups={groups} />
    )
    expect(
      screen.getByRole('link', { name: 'Publisher list price' })
    ).toHaveAttribute('href', model.official_price?.source_url)
    expect(screen.getByText(/^[¥￥]14$/)).toBeVisible()
    expect(screen.getByText(/^[¥￥]42$/)).toBeVisible()
    expect(container.querySelectorAll('del')).toHaveLength(1)
    expect(container.querySelector('del')).toHaveTextContent(/4/)
  })

  it('does not invent official token or request prices when the units or the source do not match', () => {
    const request = {
      ...model,
      quota_type: 1,
      model_price: 2,
      official_price: {
        source_url: 'https://example.org/prices',
        input_usd_per_million: 10,
      },
    }
    const { container, rerender } = render(
      <PlaygroundPriceQuote model={request} group='standard' groups={groups} />
    )
    expect(screen.getByText(/^[¥￥]7$/)).toBeVisible()
    expect(
      screen.queryByRole('link', { name: 'Publisher list price' })
    ).toBeNull()
    expect(container.querySelector('del')).toBeNull()
    rerender(
      <PlaygroundPriceQuote
        model={{ ...request, official_price: undefined }}
        group='standard'
        groups={[{ ...groups[0], ratio: 0 }]}
      />
    )
    expect(screen.getByText(/^[¥￥]0$/)).toBeVisible()
    expect(screen.getByText('No published list price')).toBeVisible()
  })

  it('does not quote a made-up total for automatic routing, unknown exchange rates or tier-dependent charges', () => {
    const { container, rerender } = render(
      <PlaygroundPriceQuote model={model} group='auto' groups={groups} />
    )
    expect(screen.getByText('Determined by the routed group')).toBeVisible()
    rate.value = undefined
    rerender(
      <PlaygroundPriceQuote model={model} group='standard' groups={groups} />
    )
    expect(screen.getByText('CNY exchange rate unavailable')).toBeVisible()
    rate.value = 7
    rerender(
      <PlaygroundPriceQuote
        model={{
          ...model,
          billing_mode: 'tiered_expr',
          billing_expr:
            'len > 4000 ? tier("long", p * 5) : tier("short", p * 2)',
        }}
        group='standard'
        groups={groups}
      />
    )
    expect(screen.getByText('Tiered pricing')).toBeVisible()
    expect(container.querySelector('del')).toBeNull()
  })

  it('renders a single-line compact quote with full platform and publisher tooltip metadata', () => {
    const { rerender } = render(
      <PlaygroundPriceQuote
        compact
        model={model}
        group='standard'
        groups={groups}
      />
    )
    const tokenQuote = screen.getByLabelText('Reference price')
    expect(tokenQuote).toHaveTextContent(
      /Input [¥￥]14 · Output [¥￥]42 \/ 1M token/
    )
    expect(tokenQuote.getAttribute('title')).toMatch(
      /Platform price · CNY.*Publisher list price/
    )

    rerender(
      <PlaygroundPriceQuote
        compact
        model={{ ...model, quota_type: 1, model_price: 2 }}
        group='standard'
        groups={groups}
      />
    )
    expect(screen.getByLabelText('Reference price')).toHaveTextContent(
      /^[¥￥]7 \/ request$/
    )

    rerender(
      <PlaygroundPriceQuote
        compact
        model={model}
        group='auto'
        groups={groups}
      />
    )
    expect(screen.getByLabelText('Reference price')).toHaveTextContent(
      'Determined by the routed group'
    )
  })

  it('renders a minimal unboxed icon + concise price readout for media studio footers', () => {
    const { container, rerender } = render(
      <PlaygroundPriceQuote
        minimal
        model={{ ...model, quota_type: 1, model_price: 2 }}
        group='standard'
        groups={groups}
      />
    )
    const readout = screen.getByLabelText('Reference price')
    expect(readout).toHaveClass('pg-price-minimal')
    expect(readout).toHaveTextContent(/^[¥￥]7$/)
    expect(container.querySelector('svg')).not.toBeNull()

    rerender(
      <PlaygroundPriceQuote
        minimal
        model={model}
        group='standard'
        groups={groups}
      />
    )
    expect(screen.getByLabelText('Reference price')).toHaveTextContent(
      /^[¥￥]14 \/ [¥￥]42$/
    )
  })

  it('quotes per-group billing override for the selected group while preserving default group billing', () => {
    const multiGroupModel = {
      ...model,
      billing_mode: 'tiered_expr',
      billing_expr: 'tier("standard", p * 4 + c * 12)',
      group_billing_exprs: {
        percall: 'tier("image", fixed(0.1)) * image_count',
      },
      enable_groups: ['standard', 'percall'],
    }
    const extendedGroups = [
      ...groups,
      { value: 'percall', label: 'Per image', ratio: 1.5 },
    ]
    const { rerender } = render(
      <PlaygroundPriceQuote
        compact
        model={multiGroupModel}
        group='standard'
        groups={extendedGroups}
      />
    )
    expect(screen.getByLabelText('Reference price')).toHaveTextContent(
      /Input [¥￥]14 · Output [¥￥]42 \/ 1M token/
    )

    rerender(
      <PlaygroundPriceQuote
        compact
        model={multiGroupModel}
        group='percall'
        groups={extendedGroups}
      />
    )
    // 0.1 USD * 1.5 group ratio * 7 CNY/USD = ¥1.05 / image
    expect(screen.getByLabelText('Reference price')).toHaveTextContent(
      /[¥￥]1\.05 \/ image/
    )
  })
})
