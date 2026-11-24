import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { Dashboard } from '@/features/dashboard'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

const now = Math.floor(Date.now() / 1000)
const usage = [
  {
    model_name: 'small/free',
    created_at: now - 4000,
    count: 3,
    quota: 0,
    token_used: 80,
    cache_read_tokens: 20,
    cache_creation_tokens: 5,
  },
  {
    model_name: 'small/free',
    created_at: now - 8000,
    count: 2,
    quota: 0,
    token_used: 20,
    cache_read_tokens: 10,
    cache_creation_tokens: 2,
  },
  {
    model_name: 'large-paid',
    created_at: now - 4000,
    count: 6,
    quota: 500000,
    token_used: 150,
  },
]
let client: QueryClient

async function openModels(role = 1, failure = false) {
  useAuthStore
    .getState()
    .auth.setUser({ id: 31, username: 'report-reader', role })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const request = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/status') {
      return { data: { success: true, data: { log_max_range_days: 90 } } }
    }
    if (url === (role === 1 ? '/api/data/self' : '/api/data')) {
      if (failure) {
        failure = false
        return { data: { success: false, message: 'Unavailable' } }
      }
      return { data: { success: true, data: usage } }
    }
    throw new Error(`Unexpected report request: ${url}`)
  })
  const root = createRootRoute()
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const dashboard = createRoute({
    getParentRoute: () => auth,
    path: 'dashboard/$section',
    component: Dashboard,
  })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([dashboard])]),
    history: createMemoryHistory({ initialEntries: ['/dashboard/models'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return request
}

afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  localStorage.clear()
})

it('opens a seven-day self report and filters its metrics, trend and table together without dropping free models', async () => {
  const user = userEvent.setup()
  const request = await openModels()
  const table = await screen.findByRole('table', {
    name: 'Model usage details',
  })
  expect(
    screen.getByRole('heading', { level: 1, name: 'Console' })
  ).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Last 7 days', pressed: true })
  ).toBeVisible()
  expect(request).toHaveBeenCalledWith('/api/data/self', {
    params: expect.objectContaining({ default_time: 'day' }),
  })
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  expect(
    within(table).getByRole('link', { name: 'small/free' })
  ).toHaveAttribute('href', '/pricing/small%2Ffree')
  await user.click(screen.getByRole('combobox', { name: 'Model' }))
  await user.click(await screen.findByRole('option', { name: /small\/free/ }))
  expect(within(table).queryByText('large-paid')).not.toBeInTheDocument()
  expect(within(table).getByText('30 / 7')).toBeVisible()
  const strip = screen.getByRole('group', { name: 'Model Call Analytics' })
  expect(within(strip).getByText('30.0%')).toBeVisible()
  expect(within(strip).getByText('5')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Requests' }))
  expect(
    screen.getByRole('heading', { name: 'Request count trend' })
  ).toBeVisible()
  expect(
    request.mock.calls.filter(([url]) => url === '/api/data/self')
  ).toHaveLength(1)
  expect(screen.getByRole('link', { name: 'Flow' })).toHaveAttribute(
    'href',
    '/dashboard/flow'
  )
  expect(
    screen.queryByRole('link', { name: 'User Analytics' })
  ).not.toBeInTheDocument()
})

it('keeps saved preferences, advanced controls and user analytics for administrators, querying the administrative scope', async () => {
  localStorage.setItem(
    'dashboard_models_chart_preferences',
    JSON.stringify({ defaultTimeRangeDays: 14, defaultTimeGranularity: 'week' })
  )
  const request = await openModels(10)
  await screen.findByRole('table', { name: 'Model usage details' })
  expect(request).toHaveBeenCalledWith('/api/data', {
    params: expect.objectContaining({ default_time: 'week' }),
  })
  expect(request).not.toHaveBeenCalledWith('/api/data/self', expect.anything())
  expect(screen.getByRole('button', { name: 'Preferences' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Filter' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'User Analytics' })).toHaveAttribute(
    'href',
    '/dashboard/users'
  )
})

it('keeps the selected model across ranges and resets it only when the successful report no longer includes it', async () => {
  const user = userEvent.setup()
  const request = await openModels()
  await screen.findByRole('table')
  const selector = screen.getByRole('combobox', { name: 'Model' })
  await user.click(selector)
  await user.click(await screen.findByRole('option', { name: /small\/free/ }))
  await user.click(screen.getByRole('button', { name: 'Last 30 days' }))
  let table = await screen.findByRole('table')
  expect(
    within(table).queryByRole('link', { name: 'large-paid' })
  ).not.toBeInTheDocument()
  request.mockResolvedValueOnce({
    data: { success: true, data: usage.slice(2) },
  })
  await user.click(screen.getByRole('button', { name: 'Today (report)' }))
  table = await screen.findByRole('table')
  expect(within(table).getByRole('link', { name: 'large-paid' })).toBeVisible()
  expect(
    within(table).queryByRole('link', { name: 'small/free' })
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Last 7 days' }))
  expect(
    within(await screen.findByRole('table')).getAllByRole('row')
  ).toHaveLength(3)
})

it('keeps a rejected report distinct from zero usage and permits retry', async () => {
  const user = userEvent.setup()
  await openModels(1, true)
  expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('link', { name: 'large-paid' })).toBeVisible()
})
