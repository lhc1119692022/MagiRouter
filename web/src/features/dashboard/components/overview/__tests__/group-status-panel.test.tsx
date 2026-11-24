import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { Route as channelStatusRoute } from '@/routes/_authenticated/channel-status'

import { GroupStatusPanel } from '../group-status-panel'

const sample = [
  {
    categoryName: 'North',
    monitors: [
      {
        name: 'Chat A',
        status: 1,
        uptime: 0.99,
        uptimeKnown: true,
        latencyMs: 120,
      },
      {
        name: 'Chat B',
        status: 0,
        uptime: 0.95,
        uptimeKnown: true,
        latencyMs: 80,
      },
    ],
  },
  {
    categoryName: 'South',
    monitors: [{ name: 'Voice', status: 1, uptime: 1, uptimeKnown: true }],
  },
  {
    categoryName: 'No signal',
    monitors: [
      { name: 'New model', status: -1, uptime: 0, uptimeKnown: false },
    ],
  },
]

let client: QueryClient

afterEach(() => {
  cleanup()
  client.clear()
})

async function setup(enabled: boolean, path = '/') {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], { uptime_kuma_enabled: enabled })
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValue({ data: { success: true, data: sample } })
  const root = createRootRoute()
  const overview = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: GroupStatusPanel,
  })
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const status = createRoute({
    getParentRoute: () => auth,
    path: 'channel-status',
    component: channelStatusRoute.options.component,
    validateSearch: channelStatusRoute.options.validateSearch,
  })
  const router = createRouter({
    routeTree: root.addChildren([overview, auth.addChildren([status])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { get, router }
}

it('navigates from partial group health to the original filtered monitor list and allows clearing the filter', async () => {
  const { router } = await setup(true)
  const group = await screen.findByRole('link', { name: /North/ })
  expect(group).toHaveTextContent('Degraded')
  expect(group).toHaveTextContent('97.00%')
  expect(group).toHaveAttribute('href', '/channel-status?group=North')
  expect(
    within(await screen.findByRole('link', { name: /No signal/ })).getByText(
      'Awaiting data'
    )
  ).toBeVisible()
  expect(screen.queryByText('0.00%')).not.toBeInTheDocument()
  await userEvent.click(group)
  expect(await screen.findByText('Chat A')).toBeVisible()
  expect(screen.queryByText('Voice')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'Show all groups' }))
  expect(await screen.findByText('Voice')).toBeVisible()
  expect(router.state.location.search).not.toHaveProperty('group')
})

it('does not query monitoring on a disabled status-page deep link', async () => {
  const { get } = await setup(false, '/channel-status?group=North')
  expect(await screen.findByText('Monitoring is not published.')).toBeVisible()
  expect(get).not.toHaveBeenCalled()
  expect(screen.queryByText('Chat A')).not.toBeInTheDocument()
})

it('shows a confirmed zero but leaves a zero from the previous server without availability metadata unknown', async () => {
  const { get } = await setup(true, '/channel-status')
  await screen.findByText('Chat A')
  get.mockResolvedValue({
    data: {
      success: true,
      data: [
        {
          categoryName: 'Comparison',
          monitors: [
            { name: 'Legacy monitor', group: 'Example', status: 0, uptime: 0 },
            {
              name: 'Measured monitor',
              group: 'Example',
              status: 0,
              uptime: 0,
              uptimeKnown: true,
            },
          ],
        },
      ],
    },
  })
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await screen.findByText('Measured monitor')
  expect(screen.getAllByText('0.00%')).toHaveLength(1)
  expect(screen.getByText('—')).toBeVisible()
})

it('distinguishes an obsolete group link from all groups instead of silently showing the wrong monitors', async () => {
  await setup(true, '/channel-status?group=Retired')
  expect(
    await screen.findByText('This group is no longer published.')
  ).toBeVisible()
  expect(screen.queryByText('Voice')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Show all groups' })).toBeVisible()
})
