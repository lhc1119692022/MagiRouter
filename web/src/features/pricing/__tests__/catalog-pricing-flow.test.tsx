import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'
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
  expect(within(card).getByText('¥1.5')).toBeVisible()
  expect(within(detail).getAllByText('$1.5').length).toBeGreaterThan(0)
  act(() => vi.advanceTimersByTime(1000))
  expect(within(card).getByText('¥3')).toBeVisible()
  expect(within(detail).getAllByText('$3').length).toBeGreaterThan(0)
})

test('a display currency change updates a legacy fixed price in both the catalog card and model overview', () => {
  render(pricingView({ ...model, quota_type: 1, model_price: 2 }))
  const card = screen.getByRole('article')
  expect(within(card).getByText('¥2')).toBeVisible()
  act(() =>
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CNY',
        usdExchangeRate: 7,
      },
    })
  )
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

test('the catalog card renders 创建 instead of 新建 in Simplified Chinese', async () => {
  const zhI18n = createInstance()
  await zhI18n.init({
    lng: 'zh',
    fallbackLng: 'zh',
    resources: { zh },
  })

  render(
    <I18nextProvider i18n={zhI18n}>
      <QueryClientProvider client={client}>
        <ZmModelCardGrid
          models={[{ ...model, output_modalities: ['text'] }]}
          onModelClick={vi.fn()}
          tokenUnit='M'
        />
      </QueryClientProvider>
    </I18nextProvider>
  )

  const card = screen.getByRole('article')
  expect(within(card).getByRole('button', { name: '创建' })).toBeVisible()
  expect(within(card).queryByRole('button', { name: '新建' })).toBeNull()
  expect(within(card).getByText('输入').parentElement).toHaveTextContent(
    '输入¥2'
  )
  expect(within(card).getByText('输出').parentElement).toHaveTextContent(
    '输出¥6'
  )
})

test('displays the lowest group starting price for token and tiered models, and prefers the lowest per-request price for mixed billing', () => {
  const tokenEntry: PricingModel = {
    ...model,
    id: 11,
    model_name: 'gpt-5.3-codex-spark',
    icon: 'Spark',
    quota_type: 0,
    model_ratio: 37.5,
    completion_ratio: 6,
    enable_groups: ['GPT Fast', 'GPT Pro'],
    group_ratio: { 'GPT Fast': 0.5, 'GPT Pro': 0.25 },
  }
  const tieredTokenEntry: PricingModel = {
    ...model,
    id: 12,
    model_name: 'tiered-token-model',
    icon: 'OpenAI',
    quota_type: 0,
    billing_mode: 'tiered_expr',
    billing_expr:
      'len < 128000 ? tier("std", p * 4 + c * 16) : tier("long", p * 8 + c * 32)',
    enable_groups: ['GPT Fast', 'GPT Pro'],
    group_ratio: { 'GPT Fast': 0.5, 'GPT Pro': 0.25 },
  }
  const mixedEntry: PricingModel = {
    ...model,
    id: 13,
    model_name: 'mixed-billing-model',
    icon: 'Claude',
    quota_type: 0,
    billing_mode: 'tiered_expr',
    billing_expr:
      'len < 500 ? tier("small", fixed(0.04)) : len < 1000 ? tier("promo", fixed(0.02)) : tier("tokens", p * 2 + c * 8)',
    enable_groups: ['GPT Fast', 'GPT Pro'],
    group_ratio: { 'GPT Fast': 0.5, 'GPT Pro': 0.25 },
  }
  const requestEntry: PricingModel = {
    ...model,
    id: 14,
    model_name: 'per-call-model',
    icon: 'Gemini',
    quota_type: 1,
    model_ratio: 0,
    completion_ratio: 1,
    model_price: 0.04,
    enable_groups: ['GPT Fast', 'GPT Pro'],
    group_ratio: { 'GPT Fast': 0.5, 'GPT Pro': 0.25 },
  }

  const { rerender } = render(
    <QueryClientProvider client={client}>
      <ZmModelCardGrid
        models={[tokenEntry, tieredTokenEntry, mixedEntry, requestEntry]}
        onModelClick={vi.fn()}
        tokenUnit='M'
        priceRate={1}
      />
    </QueryClientProvider>
  )

  const cards = screen.getAllByRole('article')
  expect(cards).toHaveLength(4)

  // Your price (default): RMB symbol with starting suffix and lowest group ratio
  expect(within(cards[0]).getByText('Input').parentElement).toHaveTextContent(
    'Input¥18.75'
  )
  expect(within(cards[0]).getByText('Output').parentElement).toHaveTextContent(
    'Output¥112.5'
  )
  expect(within(cards[0]).getByText('/1M+')).toBeVisible()

  expect(within(cards[1]).getByText('Input').parentElement).toHaveTextContent(
    'Input¥1'
  )
  expect(within(cards[1]).getByText('Output').parentElement).toHaveTextContent(
    'Output¥4'
  )
  expect(within(cards[1]).getByText('/1M+')).toBeVisible()

  expect(within(cards[2]).getByText('¥0.005')).toBeVisible()
  expect(within(cards[2]).getByText('/call+')).toBeVisible()
  expect(within(cards[2]).getByText('Per-call / Token')).toBeVisible()
  expect(within(cards[2]).queryByText('Input')).toBeNull()

  expect(within(cards[3]).getByText('¥0.01')).toBeVisible()
  expect(within(cards[3]).getByText('/call+')).toBeVisible()
  expect(within(cards[3]).queryByText('Input')).toBeNull()

  // Your price scales by the site recharge rate (status.price)
  rerender(
    <QueryClientProvider client={client}>
      <ZmModelCardGrid
        models={[tokenEntry, mixedEntry]}
        onModelClick={vi.fn()}
        tokenUnit='M'
        priceRate={2}
      />
    </QueryClientProvider>
  )
  const scaledCards = screen.getAllByRole('article')
  expect(
    within(scaledCards[0]).getByText('Input').parentElement
  ).toHaveTextContent('Input¥37.5')
  expect(
    within(scaledCards[0]).getByText('Output').parentElement
  ).toHaveTextContent('Output¥225')
  expect(within(scaledCards[1]).getByText('¥0.01')).toBeVisible()

  // When a specific group filter is active, prices switch to that group's multiplier
  rerender(
    <QueryClientProvider client={client}>
      <ZmModelCardGrid
        models={[tokenEntry, tieredTokenEntry, mixedEntry]}
        onModelClick={vi.fn()}
        tokenUnit='M'
        priceRate={1}
        selectedGroup='GPT Fast'
      />
    </QueryClientProvider>
  )
  const filteredCards = screen.getAllByRole('article')
  expect(
    within(filteredCards[0]).getByText('Input').parentElement
  ).toHaveTextContent('Input¥37.5')
  expect(
    within(filteredCards[0]).getByText('Output').parentElement
  ).toHaveTextContent('Output¥225')
  expect(within(filteredCards[0]).getByText('/1M')).toBeVisible()
  expect(within(filteredCards[0]).queryByText('/1M+')).toBeNull()
  expect(
    within(filteredCards[1]).getByText('Input').parentElement
  ).toHaveTextContent('Input¥2')
  expect(
    within(filteredCards[1]).getByText('Output').parentElement
  ).toHaveTextContent('Output¥8')
  expect(within(filteredCards[1]).getByText('/1M+')).toBeVisible()
  expect(within(filteredCards[2]).getByText('¥0.01')).toBeVisible()

  // Official price mode: shows backend 1x USD prices without starting suffix
  rerender(
    <QueryClientProvider client={client}>
      <ZmModelCardGrid
        models={[tokenEntry, tieredTokenEntry, mixedEntry, requestEntry]}
        onModelClick={vi.fn()}
        tokenUnit='M'
        priceRate={7.3}
        priceMode='official'
      />
    </QueryClientProvider>
  )
  const officialCards = screen.getAllByRole('article')
  expect(
    within(officialCards[0]).getByText('Input').parentElement
  ).toHaveTextContent('Input$75')
  expect(
    within(officialCards[0]).getByText('Output').parentElement
  ).toHaveTextContent('Output$450')
  expect(within(officialCards[0]).getByText('/1M')).toBeVisible()
  expect(within(officialCards[0]).queryByText('/1M+')).toBeNull()

  expect(
    within(officialCards[1]).getByText('Input').parentElement
  ).toHaveTextContent('Input$4')
  expect(
    within(officialCards[1]).getByText('Output').parentElement
  ).toHaveTextContent('Output$16')
  expect(within(officialCards[1]).getByText('/1M')).toBeVisible()

  expect(within(officialCards[2]).getByText('$0.02')).toBeVisible()
  expect(within(officialCards[2]).getByText('/call')).toBeVisible()
  expect(within(officialCards[2]).queryByText('/call+')).toBeNull()

  expect(within(officialCards[3]).getByText('$0.04')).toBeVisible()
  expect(within(officialCards[3]).getByText('/call')).toBeVisible()
})
