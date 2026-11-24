import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { ModelDetailsContent } from '../components/model-details'
import { ZmModelCardGrid } from '../components/zm-model-card-grid'
import { formatFixedPrice, formatRequestPrice } from '../lib/price'
import type { PricingModel } from '../types'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}))
vi.mock('../components/model-details-performance', () => ({
  ModelDetailsPerformance: () => null,
}))
vi.mock('@/components/layout', () => ({
  PublicLayout: ({ children }: React.PropsWithChildren) => children,
}))

const model: PricingModel = {
  id: 1,
  model_name: 'provider/catalog-example',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 3,
  enable_groups: ['default'],
  group_ratio: { default: 1 },
}
let client: QueryClient

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: [] } })
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
  })
})
afterEach(() => {
  client.clear()
  vi.useRealTimers()
  useSystemConfigStore
    .getState()
    .setConfig({ currency: DEFAULT_CURRENCY_CONFIG })
})

function pricingView(entry: PricingModel) {
  return (
    <QueryClientProvider client={client}>
      <ZmModelCardGrid models={[entry]} onModelClick={vi.fn()} tokenUnit='M' />
      <ModelDetailsContent
        model={entry}
        groupRatio={{ default: 1 }}
        usableGroup={{}}
        endpointMap={{}}
        autoGroups={[]}
        priceRate={1}
        usdExchangeRate={1}
        tokenUnit='M'
      />
    </QueryClientProvider>
  )
}

test('an unset request price remains unavailable while an explicitly configured zero is free in both formatters', () => {
  const missing = { ...model, quota_type: 1 }
  const free = { ...missing, model_price: 0 }
  expect(formatRequestPrice(missing)).toBe('-')
  expect(
    formatFixedPrice(missing, 'default', false, 1, 1, { default: 1 })
  ).toBe('-')
  expect(formatRequestPrice(free)).toBe('$0')
  expect(formatFixedPrice(free, 'default', false, 1, 1, { default: 1 })).toBe(
    '$0'
  )
})

test('catalog card and overview reprice the active billing period at the minute boundary', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-07T08:59:59Z'))
  const entry = {
    ...model,
    billing_mode: 'tiered_expr',
    billing_expr:
      'hour("UTC") < 9 ? tier("off", fixed(1.5)) : tier("on", fixed(3))',
  }
  render(pricingView(entry))
  const card = screen.getByRole('article')
  const detail = screen.getByRole('tabpanel')
  expect(within(card).getByText('$1.5')).toBeVisible()
  expect(within(detail).getAllByText('$1.5').length).toBeGreaterThan(0)
  act(() => vi.advanceTimersByTime(1000))
  expect(within(card).getByText('$3')).toBeVisible()
  expect(within(detail).getAllByText('$3').length).toBeGreaterThan(0)
})

test('a display currency change updates a legacy fixed price in both the catalog card and model overview', () => {
  render(pricingView({ ...model, quota_type: 1, model_price: 2 }))
  const card = screen.getByRole('article')
  expect(within(card).getByText('$2')).toBeVisible()
  act(() =>
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CNY',
        usdExchangeRate: 7,
      },
    })
  )
  expect(within(card).getByText('¥14')).toBeVisible()
  expect(
    within(screen.getByRole('tabpanel')).getAllByText('¥14').length
  ).toBeGreaterThan(0)
})

test.each([
  ['text', 'chat'],
  ['image', 'image'],
  ['video', 'video'],
  ['audio', 'audio'],
] as const)(
  'the create action passes the original model and its declared %s modality',
  async (output, mode) => {
    render(pricingView({ ...model, output_modalities: [output] }))
    await userEvent.setup().click(
      within(screen.getByRole('article')).getByRole('button', {
        name: /创建|Create/,
      })
    )
    expect(navigate).toHaveBeenCalledWith({
      to: '/playground',
      search: { mode, model: model.model_name },
    })
  }
)
