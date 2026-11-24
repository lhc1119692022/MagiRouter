import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { MagiRouterHome } from '../index'

const noQuote =
  'No current token price is available for an eligible model and group.'
const model = {
  id: 1,
  model_name: 'catalog-text',
  quota_type: 0,
  model_ratio: 2,
  completion_ratio: 1,
  enable_groups: ['permitted'],
  supported_endpoint_types: ['openai-response'],
}

async function showHome(
  records: object[],
  fail = false,
  groupRatio: Record<string, number> = { unrelated: 0.25, permitted: 1.5 }
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/pricing') {
      if (fail) throw new Error('Catalog not available')
      return {
        data: {
          success: true,
          data: records,
          vendors: [],
          usable_group: { unrelated: {}, permitted: {} },
          group_ratio: groupRatio,
        },
      }
    }
    return { data: { success: true, data: {} } }
  })
  const root = createRootRoute()
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <MagiRouterHome isAuthenticated={false} />,
  })
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await waitFor(() =>
    expect(client.getQueryState(['pricing'])?.fetchStatus).toBe('idle')
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it.each([false, true])(
  'does not advertise sample models or quotes without a catalog (failure=%s)',
  async (failed) => {
    await showHome([], failed)
    expect(
      await screen.findByText(failed ? 'Failed to load models' : noQuote)
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'gpt-6.2-sol' })
    ).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('GPT Pro ×0.25')
    expect(document.querySelector('#home-billing')).not.toHaveTextContent(
      '18.75'
    )
  }
)

it('uses only the eligible group on a priceable catalog model', async () => {
  await showHome([model])
  const sample = await screen.findByRole('region', {
    name: 'Current catalog input price',
  })
  expect(sample).toHaveTextContent('permitted')
  expect(sample).toHaveTextContent('$6')
  expect(sample).not.toHaveTextContent('unrelated')
})

it.each([
  { records: [{ ...model, model_ratio: 0 }], ratios: { permitted: 1.5 } },
  { records: [model], ratios: { permitted: 0 } },
])(
  'keeps explicit zero prices and group ratios',
  async ({ records, ratios }) => {
    await showHome(records, false, ratios)
    const sample = await screen.findByRole('region', {
      name: 'Current catalog input price',
    })
    expect(sample).toHaveTextContent('$0')
    expect(sample).not.toHaveTextContent('18.75')
  }
)

it.each([
  { ...model, enable_groups: ['private'] },
  { ...model, billing_mode: 'tiered_expr' },
  { ...model, quota_type: 1 },
  { ...model, model_ratio: null },
])(
  'does not turn a missing price or ineligible billing model into a token quote',
  async (record) => {
    await showHome([record])
    expect(await screen.findByText(noQuote)).toBeVisible()
  }
)
