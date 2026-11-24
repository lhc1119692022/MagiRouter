import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'

import type { PricingModel } from '@/features/pricing/types'

import { RoutesSection } from '../components/routes-section'
import { buildBillingComparisonData } from '../lib/catalog-quote'

afterEach(cleanup)

const models: PricingModel[] = [
  {
    id: 1,
    model_name: 'claude-sonnet-5-5',
    vendor_name: 'Anthropic',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 5,
    cache_ratio: 0.1,
    enable_groups: ['promo', 'standard'],
    official_price: {
      source_url: 'https://anthropic.example/pricing',
      input_usd_per_million: 2,
      output_usd_per_million: 10,
    },
  },
]

async function renderBilling() {
  const comparison = buildBillingComparisonData(
    models,
    {
      promo: { desc: '特价线路', ratio: 0.2 },
      standard: { desc: '标准官渠', ratio: 1 },
    },
    { promo: 0.2, standard: 1 }
  )
  const root = createRootRoute()
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <RoutesSection comparison={comparison} loading={false} failed={false} />
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}

test('toggles interactively between your discounted price and official price and switches groups', async () => {
  const user = userEvent.setup()
  await renderBilling()

  const yourBtn = await screen.findByRole('button', { name: /你的价格/ })
  const officialBtn = screen.getByRole('button', { name: '官方价格' })
  expect(yourBtn).toHaveAttribute('aria-pressed', 'true')
  expect(officialBtn).toHaveAttribute('aria-pressed', 'false')

  const table = screen.getByRole('table')
  expect(table).toHaveTextContent('$0.4')
  expect(table).toHaveTextContent('省 80%')

  await user.click(officialBtn)
  expect(officialBtn).toHaveAttribute('aria-pressed', 'true')
  expect(yourBtn).toHaveAttribute('aria-pressed', 'false')
  expect(table).toHaveTextContent('$2')
  expect(table).toHaveTextContent('$10')
  expect(table).toHaveTextContent('官方价格')

  const standardGroupBtn = screen.getByRole('button', { name: /standard/ })
  await user.click(standardGroupBtn)
  expect(yourBtn).toHaveAttribute('aria-pressed', 'true')
  expect(standardGroupBtn).toHaveAttribute('aria-pressed', 'true')
  expect(table).toHaveTextContent('$2')
  expect(screen.getByText('计费案例')).toBeVisible()
})

test('defaults usable groups absent from group_ratio to 1x and caps displayed examples at 4 models', () => {
  const manyModels: PricingModel[] = Array.from({ length: 7 }, (_, index) => ({
    id: index + 1,
    model_name: `demo-model-${index + 1}`,
    quota_type: 0,
    model_ratio: 1 + index,
    completion_ratio: 2,
    enable_groups: ['default'],
  }))
  const comparison = buildBillingComparisonData(
    manyModels,
    { default: { desc: 'User group', ratio: 1 } },
    {}
  )
  expect(comparison.groups).toHaveLength(1)
  expect(comparison.groups[0]).toMatchObject({
    name: 'default',
    ratio: 1,
    modelCount: 7,
  })
  expect(comparison.rowsByGroup.default).toHaveLength(4)
})

test('supports single-tier tiered_expr token models alongside group discounts', () => {
  const tieredModels: PricingModel[] = [
    {
      id: 10,
      model_name: 'gpt-6.2-sol',
      quota_type: 0,
      model_ratio: 37.5,
      completion_ratio: 2,
      enable_groups: ['GPT 特惠'],
      billing_mode: 'tiered_expr',
      billing_expr: 'tier("base", p * 20 + c * 10)',
    },
  ]
  const comparison = buildBillingComparisonData(
    tieredModels,
    { 'GPT 特惠': '' },
    { 'GPT 特惠': 0.02 }
  )
  expect(comparison.groups).toHaveLength(1)
  expect(comparison.rowsByGroup['GPT 特惠'][0]).toMatchObject({
    modelName: 'gpt-6.2-sol',
    yourInputUsd: 0.4,
    yourOutputUsd: 0.2,
    officialInputUsd: 20,
    officialOutputUsd: 10,
    savingsPercent: 98,
  })
})
