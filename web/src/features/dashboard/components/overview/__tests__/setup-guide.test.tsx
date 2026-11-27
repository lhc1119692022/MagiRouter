/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
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
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { DashboardSectionNavigation } from '../../dashboard-section-navigation'
import { OverviewDashboard } from '../overview-dashboard'

const storageKey = 'dashboard_overview_setup_guide_expanded'
let client: QueryClient
let keyLookupError: Error | null
let modelNames: string[]
let hasActiveGuideKey: boolean
let guideKeyModels: string | null
let supportedProtocols: string[]

beforeEach(() => {
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'dashboard-user',
    role: 1,
    quota: 1000000,
    used_quota: 1000,
    request_count: 1,
  })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  keyLookupError = null
  modelNames = ['fixture-model-qa']
  hasActiveGuideKey = true
  guideKeyModels = null
  supportedProtocols = ['openai-response', 'openai', 'anthropic']
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    switch (url) {
      case '/api/token/?p=1&size=10':
        if (keyLookupError) throw keyLookupError
        return {
          data: {
            success: true,
            data: {
              items: [
                {
                  id: 1,
                  name: 'App key',
                  key: 'masked',
                  status: hasActiveGuideKey ? 1 : 2,
                  model_limits_enabled: guideKeyModels !== null,
                  model_limits: guideKeyModels,
                },
              ],
              total: 26,
            },
          },
        }
      case '/api/status':
        return {
          data: {
            data: {
              api_info_enabled: false,
              announcements_enabled: false,
              faq_enabled: false,
              uptime_kuma_enabled: false,
            },
          },
        }
      case '/api/user/models':
        return { data: { success: true, data: modelNames } }
      case '/api/pricing':
        return {
          data: {
            success: true,
            vendors: [],
            data: modelNames.map((model_name) => ({
              model_name,
              supported_endpoint_types: supportedProtocols,
            })),
          },
        }
      case '/api/data/self':
        return { data: { success: true, data: [] } }
      default:
        throw new Error(`Unexpected dashboard request: ${url}`)
    }
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  window.localStorage.clear()
})

async function renderOverview() {
  const rootRoute = createRootRoute()
  const overview = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard/overview',
    component: OverviewDashboard,
  })
  const models = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard/models',
    component: () => <DashboardSectionNavigation current='models' />,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([overview, models]),
    history: createMemoryHistory({ initialEntries: ['/dashboard/overview'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('overview setup guide', () => {
  it('honors the site overview settings without changing the reader’s personal disclosure or wallet access', async () => {
    localStorage.setItem(storageKey, 'expanded')
    client.setQueryData(['status'], {
      SidebarModulesAdmin: JSON.stringify({
        overview_panels: {
          overview_quickstart_enabled: false,
          overview_report_enabled: false,
        },
      }),
      announcements_enabled: false,
      faq_enabled: false,
      uptime_kuma_enabled: false,
      api_info_enabled: false,
    })
    await renderOverview()
    expect(
      screen.queryByRole('region', { name: 'Quickstart' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'View detailed analytics' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Top up balance' })
    ).toHaveAttribute('href', '/wallet')
    expect(localStorage.getItem(storageKey)).toBe('expanded')
  })
  it('shows the Console title and an analytics destination without expanding a new account guide', async () => {
    useAuthStore.getState().auth.setUser({ id: 1, username: 'reader', role: 1 })
    await renderOverview()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Console' })
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(
      screen.getByRole('link', { name: 'Model Call Analytics' })
    ).toHaveAttribute('href', '/dashboard/models')
    const toggle = await screen.findByRole('button', {
      name: 'Hide setup guide',
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toAppearBefore(
      screen.getByRole('heading', { name: 'Usage at a glance' })
    )
    expect(
      screen.queryByRole('heading', {
        name: 'Build on your API gateway in minutes',
      })
    ).not.toBeInTheDocument()
  })

  it('keeps the two dashboard views when the site hides the independent analytics sidebar shortcut', async () => {
    client.setQueryData(['status'], {
      SidebarModulesAdmin: JSON.stringify({
        console: { enabled: true, detail: true, boards: false },
      }),
    })
    await renderOverview()
    const views = within(screen.getByRole('navigation', { name: 'Console' }))
    expect(views.getAllByRole('link').map((item) => item.textContent)).toEqual([
      'Overview',
      'Model Call Analytics',
    ])
    expect(
      views.getByRole('link', { name: 'Model Call Analytics' })
    ).toHaveAttribute('href', '/dashboard/models')
  })

  it('returns from model analytics to overview without giving a reader administrator links', async () => {
    const user = userEvent.setup()
    await renderOverview()
    await user.click(screen.getByRole('link', { name: 'Model Call Analytics' }))
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Model Call Analytics' })
      ).toHaveAttribute('aria-current', 'page')
    )
    expect(screen.queryByRole('link', { name: 'Flow' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'User Analytics' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Overview' }))
    expect(
      await screen.findByRole('heading', { name: 'Console' })
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('does not substitute Flow or admin tools for a dashboard view when personal shortcuts are hidden', async () => {
    useAuthStore.getState().auth.setUser({
      id: 1,
      username: 'admin-fixture',
      role: 10,
      sidebar_modules: JSON.stringify({ console: { boards: false } }),
    })
    await renderOverview()
    const views = within(screen.getByRole('navigation', { name: 'Console' }))
    expect(views.getAllByRole('link').map((item) => item.textContent)).toEqual([
      'Overview',
      'Model Call Analytics',
    ])
  })

  it('does not invent a model or offer a runnable request when the account model list is empty', async () => {
    modelNames = []
    const user = userEvent.setup()
    const reveal = vi.spyOn(api, 'post')
    try {
      await renderOverview()
      expect(await screen.findByText('No available models')).toBeVisible()
      expect(
        screen.queryByRole('button', { name: 'Copy first request' })
      ).not.toBeInTheDocument()
      await user.click(
        screen.getByRole('button', { name: 'Developer cURL example' })
      )
      expect(screen.getAllByText('No available models').length).toBeGreaterThan(
        0
      )
      expect(
        screen.queryByRole('button', { name: 'Copy cURL' })
      ).not.toBeInTheDocument()
      expect(
        document.querySelector('.setup-snippet-pre code')
      ).not.toBeInTheDocument()
      expect(reveal).not.toHaveBeenCalled()
    } finally {
      reveal.mockRestore()
    }
  })

  it('offers key creation instead of copying with an inactive key', async () => {
    hasActiveGuideKey = false
    const reveal = vi.spyOn(api, 'post')
    try {
      await renderOverview()
      expect(
        await screen.findByRole('link', { name: 'Create API Key' })
      ).toHaveAttribute('href', '/keys?action=create')
      expect(
        screen.queryByRole('button', { name: 'Copy first request' })
      ).not.toBeInTheDocument()
      expect(reveal).not.toHaveBeenCalled()
    } finally {
      reveal.mockRestore()
    }
  })

  it('copies the compact request with the real selected model and resolves the key only on click', async () => {
    const user = userEvent.setup()
    const fixture = 'only-on-click-test-value'
    const reveal = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { key: fixture } },
    })
    try {
      client.setQueryData(['status'], {
        server_address: 'https://fallback.example',
        api_info_enabled: true,
        api_info: [
          { url: 'https://published.example/gateway/v1', route: 'Gateway' },
        ],
      })
      await renderOverview()
      await user.click(
        await screen.findByRole('button', { name: 'Hide setup guide' })
      )
      const copy = await screen.findByRole('button', {
        name: 'Copy first request',
      })
      expect(reveal).not.toHaveBeenCalled()
      await user.click(copy)
      expect(reveal).toHaveBeenCalledExactlyOnceWith('/api/token/1/key')
      const copied = await navigator.clipboard.readText()
      expect(copied).toContain('https://published.example/gateway/v1/responses')
      expect(copied).toContain('"model":"fixture-model-qa"')
      expect(copied).toContain(`Bearer sk-${fixture}`)
      expect(document.body.textContent).not.toContain(fixture)
      await user.click(screen.getByRole('button', { name: 'Show setup guide' }))
      expect(document.body.textContent).not.toContain(fixture)
      expect(reveal).toHaveBeenCalledTimes(1)
    } finally {
      reveal.mockRestore()
    }
  })

  it.each([ROLE.USER, ROLE.ADMIN, ROLE.SUPER_ADMIN])(
    'shows role %s a single published route list and no tools drawer in the user overview',
    async (role) => {
      useAuthStore.getState().auth.setUser({ id: 1, username: 'reader', role })
      const entry = { url: 'https://public.example/v1', route: 'Public line' }
      client.setQueryData(['status'], {
        api_info_enabled: true,
        api_info: [entry],
        uptime_kuma_enabled: false,
      })
      await renderOverview()
      expect(
        await screen.findByRole('heading', { name: 'API routes' })
      ).toBeVisible()
      expect(screen.getAllByText(entry.url)).toHaveLength(1)
      expect(screen.queryByText('API Info')).not.toBeInTheDocument()
      expect(screen.queryByText('More tools')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('link', { name: 'Edit overview content' })
      ).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: /API Keys/ })).toHaveAttribute(
        'href',
        '/keys'
      )
      expect(
        screen.getByRole('link', { name: 'Model Call Analytics' })
      ).toHaveAttribute('href', '/dashboard/models')
      expect(vi.mocked(api.get).mock.calls.map(([url]) => url)).not.toContain(
        '/api/data/perf-metrics/summary'
      )
    }
  )

  it('links the account-wide key count to the key manager instead of counting the first page', async () => {
    await renderOverview()

    const counter = await screen.findByRole('link', { name: /API Keys.*26/ })
    expect(counter).toHaveAttribute('href', '/keys')
  })

  it('keeps the completed guide compact and the real progress available', async () => {
    await renderOverview()

    const toggle = await screen.findByRole('button', {
      name: 'Hide setup guide',
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(
      await screen.findByRole('heading', { name: 'Model spending share' })
    ).toAppearBefore(
      screen.getByRole('heading', { name: 'Vendor spending breakdown' })
    )
    expect(screen.queryByText('Setup guide complete')).not.toBeInTheDocument()
    expect(await screen.findByText('Setup progress: 3/3')).toBeVisible()
    for (const name of ['API Keys', 'Channels', 'Usage Logs', 'Pricing']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    const panel = document.querySelector(
      `#${toggle.getAttribute('aria-controls') ?? ''}`
    )
    expect(panel).toBeInTheDocument()
    expect(panel).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Prepare account balance' })
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Create & manage API keys' })
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Paste into an app & start' })
    ).toBeVisible()
    expect(screen.getByLabelText('API Base URL')).toHaveValue(
      'http://localhost:3000'
    )
    expect(
      screen.getByRole('link', { name: 'Create API Key' })
    ).toHaveAttribute('href', '/keys?action=create')
    expect(screen.getByRole('link', { name: 'Manage Keys' })).toHaveAttribute(
      'href',
      '/keys'
    )
  })

  it('toggles the completed guide with the keyboard and restores focus after hiding it', async () => {
    const user = userEvent.setup()
    await renderOverview()
    const toggle = await screen.findByRole('button', {
      name: 'Hide setup guide',
    })

    for (
      let index = 0;
      index < 8 && document.activeElement !== toggle;
      index++
    ) {
      await user.tab()
    }
    expect(toggle).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      document.querySelector(`#${toggle.getAttribute('aria-controls') ?? ''}`)
    ).not.toBeVisible()

    await user.keyboard(' ')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveFocus()
    expect(
      screen.getByRole('link', { name: 'Try in Playground' })
    ).toHaveAttribute('href', '/playground')
    await user.click(screen.getByRole('button', { name: 'Hide setup guide' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveFocus()
  })

  it('restores the completed guide preference after remounting', async () => {
    const user = userEvent.setup()
    const first = await renderOverview()
    await user.click(
      await screen.findByRole('button', { name: 'Hide setup guide' })
    )
    first.unmount()

    const second = await renderOverview()
    expect(
      await screen.findByRole('button', { name: 'Show setup guide' })
    ).toHaveAttribute('aria-expanded', 'false')
    await user.click(screen.getByRole('button', { name: 'Show setup guide' }))
    second.unmount()

    await renderOverview()
    expect(
      await screen.findByRole('button', { name: 'Hide setup guide' })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByText('Setup guide complete')).not.toBeInTheDocument()
  })

  it('keeps a single guide at the same position before usage in both disclosure states', async () => {
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'new-user', role: 1 })
    window.localStorage.setItem(storageKey, 'expanded')
    await renderOverview()

    const summary = screen.getByRole('heading', { name: 'Usage at a glance' })
    const card = await screen.findByRole('region', { name: 'Quickstart' })
    const toggle = within(card).getByRole('button', {
      name: 'Hide setup guide',
    })
    const target = document.querySelector<HTMLElement>(
      `#${toggle.getAttribute('aria-controls') ?? ''}`
    )
    expect(card).toContainElement(target)
    expect(card).toAppearBefore(summary)
    const user = userEvent.setup()
    await user.click(toggle)
    expect(card).toAppearBefore(summary)
    expect(target).not.toBeVisible()
    await user.click(toggle)
    expect(card).toContainElement(target)
    expect(target).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Usage at a glance' })).toBe(
      summary
    )
  })

  it('switches supported request examples without looking up the full key', async () => {
    const user = userEvent.setup()
    const reveal = vi.spyOn(api, 'post')
    try {
      await renderOverview()
      await user.click(
        await screen.findByRole('button', { name: 'Developer cURL example' })
      )
      const protocols = within(
        screen.getByRole('group', { name: 'First API request' })
      )
      expect(
        protocols.getByRole('button', { name: 'Responses' })
      ).toHaveAttribute('aria-pressed', 'true')
      for (const [name, path, header] of [
        ['Chat', '/v1/chat/completions', 'Authorization'],
        ['Anthropic', '/v1/messages', 'anthropic-version'],
        ['Responses', '/v1/responses', 'Authorization'],
      ]) {
        await user.click(protocols.getByRole('button', { name }))
        const example = screen
          .getByRole('region', { name: 'Quickstart' })
          .querySelector('code')
        expect(example).toHaveTextContent(path)
        expect(example).toHaveTextContent(header)
        expect(example).toHaveTextContent('fixture-model-qa')
      }
      expect(reveal).not.toHaveBeenCalled()
    } finally {
      reveal.mockRestore()
    }
  })

  it('does not offer an executable request for a catalog model with no supported text protocol', async () => {
    supportedProtocols = ['image-generation']
    await renderOverview()
    expect(await screen.findByText('No available models')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /Copy first request|Copy cURL/ })
    ).not.toBeInTheDocument()
  })

  it('does not offer an otherwise public model excluded by the selected key', async () => {
    guideKeyModels = 'another-model'
    await renderOverview()
    expect(await screen.findByText('No available models')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Copy first request' })
    ).not.toBeInTheDocument()
  })

  it('keeps the existing progress banner when an incomplete guide is manually collapsed', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(storageKey, 'expanded')
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'new-user', role: 1 })
    await renderOverview()

    await user.click(
      await screen.findByRole('button', { name: 'Hide setup guide' })
    )
    expect(screen.getByText('Setup progress: 1/3')).toBeVisible()
    expect(screen.getByText('Quickstart')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Copy first request' })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Setup guide' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show setup guide' }))
    expect(
      screen.getByRole('button', { name: 'Hide setup guide' })
    ).toBeVisible()
  })

  it('updates progress without expanding when the remaining setup step completes', async () => {
    useAuthStore.getState().auth.setUser({
      id: 1,
      username: 'dashboard-user',
      role: 1,
      quota: 1000000,
    })
    window.localStorage.setItem(storageKey, 'collapsed')
    await renderOverview()
    expect(await screen.findByText('Setup progress: 2/3')).toBeVisible()

    act(() => {
      useAuthStore.getState().auth.setUser({
        id: 1,
        username: 'dashboard-user',
        role: 1,
        quota: 1000000,
        request_count: 1,
      })
    })
    expect(
      await screen.findByRole('button', { name: 'Show setup guide' })
    ).toHaveAttribute('aria-expanded', 'false')
    expect(await screen.findByText('Setup progress: 3/3')).toBeVisible()
  })

  it('does not show a completed setup entry when the key lookup fails', async () => {
    keyLookupError = new Error('Key lookup unavailable')
    await renderOverview()

    expect(
      await screen.findByRole('button', { name: 'Hide setup guide' })
    ).toBeVisible()
    expect(screen.queryByText(/Setup progress:/)).not.toBeInTheDocument()
  })

  it('lets beginners switch client setup tips and copy Base URL and API key in step 3', async () => {
    const user = userEvent.setup()
    const fixture = 'beginner-copy-key-fixture'
    const reveal = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { key: fixture } },
    })
    try {
      await renderOverview()
      const baseUrlInput = await screen.findByLabelText('API Base URL')
      expect((baseUrlInput as HTMLInputElement).value).toBe(
        'http://localhost:3000'
      )
      expect((baseUrlInput as HTMLInputElement).value).not.toMatch(/\/v1\/?$/)

      await user.click(screen.getByRole('button', { name: 'Copy URL' }))
      expect(await navigator.clipboard.readText()).toBe('http://localhost:3000')

      await user.click(screen.getByRole('button', { name: 'Magpie' }))
      expect(screen.getByRole('button', { name: 'Magpie' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
      expect(screen.getByText(/Model Providers/)).toBeVisible()

      await user.click(screen.getByRole('button', { name: 'Copy API key' }))
      expect(reveal).toHaveBeenCalledExactlyOnceWith('/api/token/1/key')
      expect(await navigator.clipboard.readText()).toBe(`sk-${fixture}`)
    } finally {
      reveal.mockRestore()
    }
  })
})
