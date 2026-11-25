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
  const filtersToggle = screen.getByRole('button', { name: /Filters/ })
  expect(filtersToggle).toHaveAttribute('aria-expanded', 'true')
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

it('expands filters by default, excludes remark tags from filters, and renders comma-separated remark tags distinctly on cards', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/api/pricing') throw new Error('catalog unavailable')
    return { data: { success: true, data: { models: [] } } }
  })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['status'], {})
  client.setQueryData(['pricing'], {
    success: true,
    vendors: [{ id: 1, name: 'Alba' }],
    group_ratio: { shared: 0.5 },
    data: [
      {
        id: 1,
        vendor_id: 1,
        model_name: 'Model A',
        created_time: 1000,
        supported_endpoint_types: ['openai'],
        tags: 'Text generation,推荐，200K 上下文,低延迟,@mr:catalog:v1=text',
        enable_groups: ['shared'],
        quota_type: 0,
        model_ratio: 1,
        completion_ratio: 3,
        cache_ratio: 0.25,
      },
      {
        id: 2,
        vendor_id: 1,
        model_name: 'Model B',
        created_time: 2000,
        supported_endpoint_types: ['openai'],
        enable_groups: ['shared'],
        quota_type: 0,
        model_ratio: 5,
        completion_ratio: 1,
      },
    ],
    usable_group: { shared: { desc: 'Shared', ratio: 0.5 } },
  })
  const root = createRootRoute()
  const pricing = createRoute({
    getParentRoute: () => root,
    path: 'pricing/',
    component: Pricing,
    validateSearch: pricingRoute.options.validateSearch,
  })
  const router = createRouter({
    routeTree: root.addChildren([pricing]),
    history: createMemoryHistory({ initialEntries: ['/pricing?tag=推荐'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )

  const filtersToggle = await screen.findByRole('button', { name: /Filters/ })
  expect(filtersToggle).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('group', { name: 'Multiplier groups' })).toBeVisible()
  expect(screen.queryByText('Model Tags')).toBeNull()
  expect(screen.queryByRole('button', { name: '推荐' })).toBeNull()
  expect(screen.queryByRole('button', { name: '/1M' })).toBeNull()

  // Filters button sits directly after the sort dropdown in the top controls bar
  const sortTrigger = screen.getByRole('button', { name: '排序方式' })
  expect(sortTrigger).toHaveTextContent('Time')
  expect(sortTrigger.closest('.sort-dropdown-wrap')?.nextElementSibling).toBe(
    filtersToggle
  )

  // Default sort is newest first (created_time descending: Model B before Model A)
  const cards = screen.getAllByRole('article')
  expect(cards).toHaveLength(2)
  expect(
    within(cards[0]).getByRole('heading', { name: 'Model B' })
  ).toBeVisible()
  expect(
    within(cards[1]).getByRole('heading', { name: 'Model A' })
  ).toBeVisible()

  const modelACard = cards[1]
  const capabilityTags = modelACard.querySelectorAll(
    '.zm-cap-tag:not(.is-configurable)'
  )
  const remarkTags = modelACard.querySelectorAll('.zm-cap-tag.is-configurable')
  expect([...capabilityTags].map((node) => node.textContent)).toEqual([
    'Text generation',
  ])
  expect([...remarkTags].map((node) => node.textContent)).toEqual([
    '推荐',
    '200K 上下文',
    '低延迟',
  ])

  // Default price mode is Your price (RMB with starting suffix)
  const priceModeBtn = screen.getByRole('button', { name: 'Your price' })
  expect(within(modelACard).getByText('¥1')).toBeVisible()
  expect(within(modelACard).getByText('/1M+')).toBeVisible()

  const user = userEvent.setup()

  // Toggle to Official price (backend 1x USD without starting suffix)
  await user.click(priceModeBtn)
  expect(screen.getByRole('button', { name: 'Official price' })).toBeVisible()
  expect(within(modelACard).getByText('$2 / $6')).toBeVisible()
  expect(within(modelACard).getByText('/1M')).toBeVisible()
  expect(within(modelACard).queryByText('/1M+')).toBeNull()

  // Sort dropdown lists compact Time / Price / Name entries without input/output split
  await user.click(sortTrigger)
  const sortMenuItems = screen.getAllByRole('menuitem')
  expect(sortMenuItems.map((node) => node.textContent)).toEqual([
    'Time',
    'Time',
    'Price',
    'Price',
    'Name',
    'Name',
  ])
  await user.click(screen.getByRole('menuitem', { name: 'Price: Low to High' }))
  const priceSortedCards = screen.getAllByRole('article')
  expect(
    within(priceSortedCards[0]).getByRole('heading', { name: 'Model A' })
  ).toBeVisible()

  await user.click(filtersToggle)
  expect(filtersToggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('group', { name: 'Multiplier groups' })).toBeNull()

  // Switch to list view and verify unified 6-column layout and availability ticks
  await user.click(screen.getByRole('button', { name: '价格表视图' }))
  const table = screen.getByRole('table')
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((node) => node.textContent)
  ).toEqual(['Model', 'Availability', 'Type', 'Price', 'Manufacturer', 'Tags'])

  const bodyRows = within(table).getAllByRole('row').slice(1)
  expect(bodyRows).toHaveLength(2)
  const modelARow = bodyRows[0]
  expect(within(modelARow).getByText('Model A')).toBeVisible()
  expect(modelARow.querySelectorAll('.zm-uptime-tick')).toHaveLength(24)
  expect(within(modelARow).getByText('Not monitored')).toBeVisible()
  expect(within(modelARow).getByText('按 Token')).toBeVisible()
  expect(within(modelARow).getByText('Input')).toBeVisible()
  expect(within(modelARow).getByText('$2')).toBeVisible()
  expect(within(modelARow).getByText('Output')).toBeVisible()
  expect(within(modelARow).getByText('$6')).toBeVisible()
  expect(within(modelARow).getByText('Cache')).toBeVisible()
  expect(within(modelARow).getByText('$0.5')).toBeVisible()
  expect(within(modelARow).getAllByText('/1M')).toHaveLength(3)
  expect(within(modelARow).getByText('Alba')).toBeVisible()
  expect(
    [...modelARow.querySelectorAll('.zm-cap-tag:not(.is-configurable)')].map(
      (node) => node.textContent
    )
  ).toEqual(['Text generation'])
  expect(
    [...modelARow.querySelectorAll('.zm-cap-tag.is-configurable')].map(
      (node) => node.textContent
    )
  ).toEqual(['推荐', '200K 上下文', '低延迟'])

  // Switching back to Your price updates table prices to RMB starting format
  await user.click(screen.getByRole('button', { name: 'Official price' }))
  expect(within(modelARow).getByText('¥1')).toBeVisible()
  expect(within(modelARow).getByText('¥3')).toBeVisible()
  expect(within(modelARow).getByText('¥0.25')).toBeVisible()
  expect(within(modelARow).getAllByText('/1M+')).toHaveLength(3)
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
