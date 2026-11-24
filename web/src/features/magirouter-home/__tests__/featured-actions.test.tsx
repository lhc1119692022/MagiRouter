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

async function showCard(record: PricingModel) {
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
