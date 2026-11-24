import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { DocsCenter } from '../index'

async function showDocs(doc: string, catalog: () => Promise<object[]>) {
  vi.spyOn(api, 'get').mockImplementation(async (url) =>
    url === '/api/pricing'
      ? { data: { success: true, data: await catalog(), vendors: [] } }
      : { data: { success: true, data: url === '/api/notice' ? '' : {} } }
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const root = createRootRoute()
  const docs = createRoute({
    getParentRoute: () => root,
    path: '/docs/',
    validateSearch: (value: Record<string, unknown>) => ({
      doc: typeof value.doc === 'string' ? value.doc : undefined,
    }),
    component: DocsCenter,
  })
  const router = createRouter({
    routeTree: root.addChildren([docs]),
    history: createMemoryHistory({
      initialEntries: [`/docs?doc=${encodeURIComponent(doc)}`],
    }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('keeps the requested model link pending, then renders only a catalog-backed article', async () => {
  let resolveCatalog: (models: object[]) => void = () => {
    throw new Error('Uninitialized catalog')
  }
  const pending = new Promise<object[]>((resolve) => {
    resolveCatalog = resolve
  })
  await showDocs('model:catalog-only', () => pending)
  expect(await screen.findByRole('heading', { name: 'Loading' })).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: 'Model documentation unavailable' })
  ).not.toBeInTheDocument()
  await act(async () => {
    resolveCatalog([
      {
        id: 1,
        model_name: 'catalog-only',
        supported_endpoint_types: ['openai'],
      },
    ])
    await pending
  })
  expect(
    await screen.findByRole('heading', { name: 'catalog-only' })
  ).toBeVisible()
})

it('leaves an unknown model deep link in place until the user returns to the directory', async () => {
  const user = userEvent.setup()
  const router = await showDocs('model:absent', async () => [])
  expect(
    await screen.findByRole('heading', {
      name: 'Model documentation unavailable',
    })
  ).toBeVisible()
  expect(router.state.location.search.doc).toBe('model:absent')
  expect(document.body).not.toHaveTextContent(
    '可直接通过 MagiRouter 统一密钥调用'
  )
  await user.click(screen.getByRole('link', { name: 'Back to documentation' }))
  expect(
    await screen.findByRole('heading', { level: 1, name: '快速开始' })
  ).toBeVisible()
})

it('reports a catalog error without inventing a model document', async () => {
  await showDocs('model:unknown', async () => {
    throw new Error('Offline')
  })
  expect(
    await screen.findByRole('heading', { name: 'Failed to load models' })
  ).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: 'unknown' })
  ).not.toBeInTheDocument()
})
