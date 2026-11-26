import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'

import type { PricingModel } from '@/features/pricing/types'

import { ModelsSection } from '../components/models-section'

const catalogRecord: PricingModel = {
  id: 3,
  model_name: 'team/alias + blue&gold',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['eligible'],
  supported_endpoint_types: ['image-generation'],
}

async function showCard(
  record: PricingModel,
  groupRatio?: Record<string, number>
) {
  const root = createRootRoute()
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <ModelsSection
        models={[record]}
        isLoading={false}
        priceRate={1}
        usdExchangeRate={1}
        groupRatio={groupRatio}
      />
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  return within(await screen.findByRole('article'))
}

test('a keyboard user can open the original Playground with the exact catalog alias or open details separately', async () => {
  const user = userEvent.setup()
  const card = await showCard(catalogRecord)
  const start = card.getByRole('link', { name: 'Get started' })
  const destination = new URL(
    start.getAttribute('href') ?? '',
    'https://preview.test'
  )
  expect(destination.pathname).toBe('/playground')
  expect(Object.fromEntries(destination.searchParams)).toEqual({
    mode: 'image',
    model: catalogRecord.model_name,
  })
  const details = card.getByRole('link', { name: 'View details' })
  expect(details).toHaveAttribute(
    'href',
    `/pricing/${encodeURIComponent(catalogRecord.model_name)}`
  )
  start.focus()
  await user.tab()
  expect(details).toHaveFocus()
})

test('a model without a supported workspace mode retains details without a misleading launch link', async () => {
  const card = await showCard({
    ...catalogRecord,
    supported_endpoint_types: ['embedding'],
    output_modalities: ['file'],
  })
  expect(card.queryByRole('link', { name: 'Get started' })).toBeNull()
  expect(card.getByRole('link', { name: 'View details' })).toBeInTheDocument()
})

test('shows only the hottest group badge together with its group multiplier', async () => {
  const card = await showCard(
    {
      ...catalogRecord,
      model_name: 'gpt-6.2-sol',
      enable_groups: ['GPT Team', 'GPT Fast「企业」', 'GPT Plus'],
      hot_group: 'GPT Fast「企业」',
      model_ratio: 10,
      completion_ratio: 2,
      supported_endpoint_types: ['openai'],
    },
    {
      'GPT Team': 0.055,
      'GPT Fast「企业」': 0.25,
      'GPT Plus': 0.08,
    }
  )

  expect(card.getByText('GPT Fast「企业」')).toBeVisible()
  expect(card.getByText('×0.25')).toBeVisible()
  expect(card.queryByText(/GPT Team/)).toBeNull()
  expect(card.queryByText(/GPT Plus/)).toBeNull()
})

test('falls back to the lowest-multiplier group with its ratio when hot_group is absent', async () => {
  const card = await showCard(
    {
      ...catalogRecord,
      model_name: 'claude-opus-5-5',
      enable_groups: ['Claude Max 「0注 企业」', 'Claude Cursor'],
      supported_endpoint_types: ['anthropic'],
    },
    {
      'Claude Max 「0注 企业」': 1.1,
      'Claude Cursor': 0.5,
    }
  )

  expect(card.getByText('Claude Cursor')).toBeVisible()
  expect(card.getByText('×0.5')).toBeVisible()
  expect(card.queryByText(/Claude Max/)).toBeNull()
})
