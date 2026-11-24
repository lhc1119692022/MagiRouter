import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { Route as keysFileRoute } from '@/routes/_authenticated/keys'
import { useAuthStore } from '@/stores/auth-store'

import { SummaryCards } from '../summary-cards'
import { useOverviewReport } from '../use-overview-report'

let client: QueryClient

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
})

async function renderBalance(
  quota: number | undefined,
  dailyUsage: number | null
) {
  useAuthStore
    .getState()
    .auth.setUser({ id: 2, username: 'reader', role: 1, quota })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url !== '/api/data/self') throw new Error(`Unexpected request: ${url}`)
    if (dailyUsage === null) throw new Error('Usage unavailable')
    return {
      data: { success: true, data: dailyUsage ? [{ quota: dailyUsage }] : [] },
    }
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], {})
  const root = createRootRoute()
  const summary = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: function SummaryView() {
      return <SummaryCards report={useOverviewReport()} />
    },
  })
  const wallet = createRoute({ getParentRoute: () => root, path: 'wallet' })
  const keys = createRoute({
    getParentRoute: () => root,
    path: 'keys',
    validateSearch: keysFileRoute.options.validateSearch,
  })
  const router = createRouter({
    routeTree: root.addChildren([summary, wallet, keys]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return within(
    await screen.findByRole('region', { name: 'Available Balance' })
  )
}

it('puts wallet and key creation after the amount and live usage estimate, leaving the key count as a list link', async () => {
  const balance = await renderBalance(100000000, 10000000)
  expect(await balance.findByText('Sufficient balance')).toBeVisible()
  const amount = balance.getByText('$200')
  const estimate = balance.getByText(/~10 days/)
  const topUp = balance.getByRole('link', { name: 'Top up balance' })
  const create = balance.getByRole('link', { name: 'Create key' })
  expect(amount).toAppearBefore(estimate)
  expect(estimate).toAppearBefore(topUp)
  expect(topUp).toAppearBefore(create)
  expect(topUp).toHaveAttribute('href', '/wallet')
  expect(create).toHaveAttribute('href', '/keys?action=create')
  expect(
    screen.getByRole('link', { name: /API Keys.*View all/ })
  ).toHaveAttribute('href', '/keys')
})

it.each([
  {
    quota: 0,
    usage: 0,
    health: 'Insufficient balance',
    estimate: 'Balance depleted',
  },
  {
    quota: 1000000,
    usage: 500000,
    health: 'Consider topping up',
    estimate: '~2 days',
  },
  {
    quota: 500000,
    usage: 0,
    health: 'Sufficient balance',
    estimate: 'No recent usage',
  },
])(
  'keeps the actual balance status when quota=$quota and daily usage=$usage',
  async ({ quota, usage, health, estimate }) => {
    const balance = await renderBalance(quota, usage)
    expect(await balance.findByText(health)).toBeVisible()
    expect(await balance.findByText(estimate)).toBeVisible()
  }
)

it('does not claim spending is zero or the balance is healthy when usage cannot be loaded', async () => {
  const balance = await renderBalance(100000000, null)
  expect(await balance.findByText('Not available')).toBeVisible()
  expect(balance.queryByText('No recent usage')).not.toBeInTheDocument()
  expect(balance.queryByText('Sufficient balance')).not.toBeInTheDocument()
  expect(balance.getByText('$200')).toBeVisible()
})

it('does not label missing account quota as a depleted balance', async () => {
  const balance = await renderBalance(undefined, 0)
  expect(await balance.findByText('—')).toBeVisible()
  expect(balance.queryByText('Insufficient balance')).not.toBeInTheDocument()
  expect(balance.queryByText('Sufficient balance')).not.toBeInTheDocument()
})
