import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { playgroundSearchSchema } from '@/features/playground/lib/workspace-search'
import { api } from '@/lib/api'

import { Pricing } from '..'
import type { PricingModel } from '../types'

vi.mock('@/components/layout', () => ({
  PublicLayout: ({ children }: React.PropsWithChildren) => children,
}))
vi.mock('../components/model-details-performance', () => ({
  ModelDetailsPerformance: () => null,
}))

const catalogOnly: PricingModel = {
  id: 1,
  model_name: 'catalog/video-preview',
  tags: '@mr:catalog:v1=video',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['default'],
}
const runnable: PricingModel = {
  id: 2,
  model_name: 'studio/film',
  output_modalities: ['video'],
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['default'],
}

let client: QueryClient
afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
})

it.each([
  {
    label: 'opens the advertised video model',
    models: [catalogOnly, runnable],
    heading: /· studio\/film$/,
    search: { mode: 'video', model: 'studio/film' },
  },
  {
    label: 'opens the general workspace when video is only a catalog label',
    models: [catalogOnly],
    heading: /^Playground$/,
    search: {},
  },
])('$label', async ({ models, heading, search }) => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: [] } })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], {})
  client.setQueryData(['pricing'], { success: true, data: models, vendors: [] })
  const root = createRootRoute()
  const pricing = createRoute({
    getParentRoute: () => root,
    path: 'pricing/',
    component: Pricing,
  })
  const playground = createRoute({
    getParentRoute: () => root,
    path: 'playground',
    validateSearch: playgroundSearchSchema,
  })
  const router = createRouter({
    routeTree: root.addChildren([pricing, playground]),
    history: createMemoryHistory({ initialEntries: ['/pricing'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '第 2 条' }))
  expect(screen.getByRole('heading', { name: heading, level: 2 })).toBeVisible()
  await user.click(screen.getByRole('button', { name: '打开 Playground' }))
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/playground')
  )
  expect(router.state.location.search).toEqual(search)
})
