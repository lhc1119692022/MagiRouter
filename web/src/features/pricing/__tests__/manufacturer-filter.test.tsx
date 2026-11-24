import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { Route as pricingRoute } from '@/routes/pricing'
import { Route as detailsRoute } from '@/routes/pricing/$modelId'

import { Pricing } from '..'

vi.mock('@/components/layout', () => ({
  PublicLayout: ({ children }: React.PropsWithChildren) => children,
}))
vi.mock('../components/model-details-performance', () => ({
  ModelDetailsPerformance: () => null,
}))

let client: QueryClient
afterEach(() => {
  client.clear()
  vi.restoreAllMocks()
})

async function visit(url: string, catalogAvailable = true) {
  vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/api/pricing') throw new Error('catalog unavailable')
    return { data: { success: true, data: { models: [] } } }
  })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['status'], {})
  if (catalogAvailable) {
    client.setQueryData(['pricing'], {
      success: true,
      vendors: [
        { id: 1, name: 'Alba' },
        { id: 2, name: 'Birch' },
      ],
      data: [
        {
          id: 1,
          vendor_id: 1,
          model_name: 'Model A',
          enable_groups: ['shared', 'alpha', 'private'],
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
        },
        {
          id: 2,
          vendor_id: 2,
          model_name: 'Model B',
          enable_groups: ['shared', 'beta'],
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
        },
      ],
      usable_group: { shared: {}, alpha: {}, beta: {}, orphan: {} },
    })
  }
  const root = createRootRoute()
  const pricing = createRoute({
    getParentRoute: () => root,
    path: 'pricing/',
    component: Pricing,
    validateSearch: pricingRoute.options.validateSearch,
  })
  const details = createRoute({
    getParentRoute: () => root,
    path: 'pricing/$modelId/',
    component: detailsRoute.options.component,
    validateSearch: detailsRoute.options.validateSearch,
  })
  const router = createRouter({
    routeTree: root.addChildren([pricing, details]),
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}

it('unions the selected manufacturers’ groups, drops an unsupported group and restores the old single-manufacturer link on history navigation', async () => {
  const router = await visit('/pricing?vendor=Alba&group=alpha')
  const user = userEvent.setup()
  const manufacturers = within(
    await screen.findByRole('group', { name: 'Model manufacturers' })
  )
  await user.click(screen.getByRole('button', { name: /Filters/ }))
  const groups = within(
    screen.getByRole('group', { name: 'Multiplier groups' })
  )
  expect(
    groups.getByRole('button', { name: 'alpha', pressed: true })
  ).toBeVisible()
  expect(groups.queryByRole('button', { name: 'private' })).toBeNull()
  expect(groups.queryByRole('button', { name: 'orphan' })).toBeNull()
  expect(groups.queryByRole('button', { name: 'beta' })).toBeNull()
  await user.click(manufacturers.getByRole('button', { name: 'Birch' }))
  expect(await groups.findByRole('button', { name: 'beta' })).toBeVisible()
  expect(router.state.location.search).toMatchObject({
    vendor: ['Alba', 'Birch'],
    group: 'alpha',
  })
  await user.click(manufacturers.getByRole('button', { name: 'Alba' }))
  await waitFor(() =>
    expect(groups.queryByRole('button', { name: 'alpha' })).toBeNull()
  )
  expect(router.state.location.search).toEqual({ vendor: 'Birch' })
  expect(groups.getByRole('button', { name: 'shared' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Model A' })).toBeNull()
  act(() => router.history.back())
  expect(
    await groups.findByRole('button', { name: 'alpha', pressed: true })
  ).toBeVisible()
  act(() => router.history.back())
  await waitFor(() =>
    expect(
      manufacturers.getByRole('button', { name: 'Birch' })
    ).toHaveAttribute('aria-pressed', 'false')
  )
  expect(router.state.location.search).toEqual({
    vendor: 'Alba',
    group: 'alpha',
  })
})

it('keeps both selected manufacturers when navigating back from a direct model-details link', async () => {
  const query = new URLSearchParams({
    vendor: JSON.stringify(['Alba', 'Birch']),
    group: 'shared',
  })
  const router = await visit(`/pricing/Model%20A?${query}`)
  await userEvent
    .setup()
    .click(await screen.findByRole('button', { name: 'Back' }))
  const manufacturers = within(
    await screen.findByRole('group', { name: 'Model manufacturers' })
  )
  expect(manufacturers.getAllByRole('button', { pressed: true })).toHaveLength(
    2
  )
  await waitFor(() =>
    expect(router.state.location.search).toEqual({
      vendor: ['Alba', 'Birch'],
      group: 'shared',
    })
  )
})

it('preserves a bookmarked group while the catalog cannot be loaded', async () => {
  const router = await visit('/pricing?vendor=Alba&group=alpha', false)
  await waitFor(() =>
    expect(client.getQueryState(['pricing'])?.status).toBe('error')
  )
  expect(router.state.location.search).toEqual({
    vendor: 'Alba',
    group: 'alpha',
  })
})
