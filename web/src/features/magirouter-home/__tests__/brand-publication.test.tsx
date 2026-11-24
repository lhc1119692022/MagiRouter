import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import { MagiRouterWordmark } from '@/components/layout/components/magirouter-wordmark'
import { useUpdateOption } from '@/features/system-settings/hooks/use-update-option'
import { api } from '@/lib/api'
import { statusQueryOptions } from '@/lib/status-query'

import { BrandFooter } from '../components/brand-footer'

const clients: QueryClient[] = []

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  localStorage.clear()
  vi.restoreAllMocks()
})

async function openSite(initial: Record<string, unknown>) {
  const published = { ...initial }
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    expect(url).toBe('/api/status')
    return { data: { success: true, data: { ...published } } }
  })
  vi.spyOn(api, 'put').mockImplementation(async (url, payload) => {
    expect(url).toBe('/api/option/')
    const { key, value } = payload as { key: string; value: string }
    const publicFields: Record<string, string> = {
      SystemName: 'system_name',
      Logo: 'logo',
      Footer: 'footer_html',
    }
    published[publicFields[key]] = value
    return { data: { success: true } }
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  await client.fetchQuery(statusQueryOptions)
  const root = createRootRoute()
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <>
        <header>
          <MagiRouterWordmark />
        </header>
        <BrandFooter />
      </>
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  render(<RouterProvider router={router} />, { wrapper })
  const footer = within(await screen.findByRole('contentinfo'))
  const update = renderHook(useUpdateOption, { wrapper })
  return {
    footer,
    save: (key: string, value: string) =>
      act(async () => {
        await update.result.current.mutateAsync({ key, value })
      }),
  }
}

test('saved site identity and footer reach both published wordmarks without reloading or removing project credit', async () => {
  const { footer, save } = await openSite({
    system_name: 'Original site',
    logo: 'https://assets.example/first.svg',
    footer_html: '<p>Previous footer</p>',
  })
  const header = within(screen.getByRole('banner'))
  expect(footer.getByText('Previous footer')).toBeVisible()
  await save('SystemName', 'Operator Portal')
  expect(await header.findByText('Operator Portal')).toBeVisible()
  expect(footer.getByRole('link', { name: 'Operator Portal' })).toHaveAttribute(
    'href',
    '/'
  )
  await save('Logo', 'https://assets.example/new.svg')
  await waitFor(() =>
    expect(
      header.getByRole('img', { name: 'Operator Portal' })
    ).toHaveAttribute('src', 'https://assets.example/new.svg')
  )
  expect(footer.getByRole('img', { name: 'Operator Portal' })).toHaveAttribute(
    'src',
    'https://assets.example/new.svg'
  )
  await save('Footer', '<b>Published footer</b>')
  await waitFor(() =>
    expect(footer.getByText('Published footer')).toBeVisible()
  )
  expect(footer.queryByText('Previous footer')).toBeNull()
  expect(
    screen
      .getByRole('contentinfo')
      .querySelector('a[href="https://github.com/QuantumNous/new-api"]')
  ).toBeVisible()
})

test('disabled public navigation modules have no duplicate footer shortcuts; the default design wordmark and project credit stay visible', async () => {
  const { footer } = await openSite({
    HeaderNavModules: JSON.stringify({
      home: false,
      console: false,
      docs: false,
      pricing: false,
      creation: false,
      rankings: false,
      about: false,
    }),
  })
  const panel = screen.getByRole('contentinfo')
  expect(
    footer.queryByRole('button', { name: /^(Console|控制台)$/ })
  ).toBeNull()
  expect(footer.queryByRole('link', { name: /^(Console|控制台)$/ })).toBeNull()
  expect(
    panel.querySelector('a[href="/#home-billing"],a[href="/#home-integration"]')
  ).toBeNull()
  expect(
    footer.queryByRole('link', { name: 'Developer documentation' })
  ).toBeNull()
  expect(footer.getByRole('img', { name: 'MagiRouter' })).toHaveAttribute(
    'viewBox',
    '0 0 2762 512'
  )
  expect(
    panel.querySelector('a[href="https://github.com/QuantumNous/new-api"]')
  ).toBeVisible()
})

test('enabled footer shortcuts and the configured external documentation stay available', async () => {
  const { footer } = await openSite({
    HeaderNavModules: '{}',
    docs_link: 'https://docs.example/guides#setup',
  })
  const panel = screen.getByRole('contentinfo')
  expect(
    footer.getByRole('link', { name: 'Developer documentation' })
  ).toHaveAttribute('href', 'https://docs.example/guides#setup')
  expect(panel.querySelector('a[href="/#home-billing"]')).toBeVisible()
  expect(panel.querySelector('a[href="/#home-integration"]')).toBeVisible()
})

test('the shared footer lists the four supported protocols without ranking them', async () => {
  const { footer } = await openSite({})
  expect(
    footer.getByText(
      'One gateway for OpenAI Responses, Chat Completions, Anthropic Messages and Gemini.'
    )
  ).toBeVisible()
})
