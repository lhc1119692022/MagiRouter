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
      data: {
        success: true,
        data: dailyUsage
          ? [
              {
                created_at: Math.floor(Date.now() / 1000),
                quota: dailyUsage,
                count: 4,
                token_used: 12500,
              },
            ]
          : [],
      },
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

it('puts wallet and key creation after the amount and 24h usage without runway text, leaving the key count as a list link', async () => {
  const balance = await renderBalance(100000000, 10000000)
  expect(await balance.findByText('Sufficient balance')).toBeVisible()
  const amount = balance.getByText('$200')
  const recentUsage = balance.getByText('Last 24h usage')
  expect(balance.getByText('$20')).toBeVisible()
  expect(balance.queryByText(/Runway/)).not.toBeInTheDocument()
  expect(balance.queryByText(/~10 days/)).not.toBeInTheDocument()
  const topUp = balance.getByRole('link', { name: 'Top up balance' })
  const create = balance.getByRole('link', { name: 'Create key' })
  expect(amount).toAppearBefore(recentUsage)
  expect(recentUsage).toAppearBefore(topUp)
  expect(topUp).toAppearBefore(create)
  expect(topUp).toHaveAttribute('href', '/wallet')
  expect(create).toHaveAttribute('href', '/keys?action=create')
  expect(
    screen.getByRole('link', { name: /API Keys.*View all/ })
  ).toHaveAttribute('href', '/keys')

  const tokenCard = document.querySelector('[data-kpi="tokens"]')
  expect(tokenCard).not.toBeNull()
  expect(
    within(tokenCard as HTMLElement).getByText('Today’s token usage')
  ).toBeVisible()
  expect(within(tokenCard as HTMLElement).getByText('TOKENS')).toBeVisible()
  expect(within(tokenCard as HTMLElement).getByText('12.5K')).toBeVisible()
  expect(
    within(tokenCard as HTMLElement).getByText('Requests: 4')
  ).toBeVisible()
})

it.each([
  {
    quota: 0,
    usage: 0,
    health: 'Insufficient balance',
    usageLabel: '$0',
  },
  {
    quota: 1000000,
    usage: 500000,
    health: 'Consider topping up',
    usageLabel: '$1',
  },
  {
    quota: 500000,
    usage: 0,
    health: 'Sufficient balance',
    usageLabel: '$0',
  },
])(
  'keeps the actual balance status and 24h usage without runway estimate when quota=$quota and daily usage=$usage',
  async ({ quota, usage, health, usageLabel }) => {
    const balance = await renderBalance(quota, usage)
    expect(await balance.findByText(health)).toBeVisible()
    const recentUsage = balance.getByText('Last 24h usage').parentElement
    expect(recentUsage).not.toBeNull()
    expect(
      await within(recentUsage as HTMLElement).findByText(usageLabel)
    ).toBeVisible()
    expect(balance.queryByText(/Runway/)).not.toBeInTheDocument()
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
