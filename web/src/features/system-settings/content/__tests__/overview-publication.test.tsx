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

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { DashboardSection } from '../dashboard-section'

let client: QueryClient
afterEach(() => {
  cleanup()
  client.clear()
  localStorage.removeItem('status')
})

async function openDashboardSettings() {
  const actions = document.createElement('div')
  document.body.appendChild(actions)
  const defaults = {
    DataExportEnabled: false,
    DataExportInterval: 5,
    DataExportDefaultTime: 'hour' as const,
    overview_quickstart_enabled: true,
    overview_report_enabled: true,
    overview_distributions_enabled: true,
  }
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const write = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: [] } })
  const root = createRootRoute()
  const settings = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <SettingsPageProvider actionsContainer={actions}>
        <DashboardSection defaultValues={defaults} />
      </SettingsPageProvider>
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([settings]),
    history: createMemoryHistory(),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { actions, write }
}

it('publishes only the changed overview switch without turning on statistics collection', async () => {
  const { actions, write } = await openDashboardSettings()
  try {
    const control = await screen.findByRole('switch', { name: 'Quickstart' })
    expect(control).toBeChecked()
    await userEvent.click(control)
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() =>
      expect(write).toHaveBeenCalledExactlyOnceWith('/api/option/', {
        key: 'SidebarModulesAdmin',
        value: JSON.stringify({
          overview_panels: { overview_quickstart_enabled: false },
        }),
      })
    )
    expect(
      screen.getByRole('switch', { name: 'Enable Data Dashboard' })
    ).not.toBeChecked()
  } finally {
    actions.remove()
  }
})

it('preserves sidebar and unknown settings, and links the original editors', async () => {
  const { actions, write } = await openDashboardSettings()
  try {
    const control = await screen.findByRole('switch', { name: 'Quickstart' })
    const existing = {
      console: { boards: false },
      future: { custom: true },
      overview_panels: { future_panel: false },
    }
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: [{ key: 'SidebarModulesAdmin', value: JSON.stringify(existing) }],
      },
    })
    await userEvent.click(control)
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    expect(write).toHaveBeenCalledWith('/api/option/', {
      key: 'SidebarModulesAdmin',
      value: JSON.stringify({
        ...existing,
        overview_panels: {
          ...existing.overview_panels,
          overview_quickstart_enabled: false,
        },
      }),
    })
    for (const [label, href] of [
      ['API Addresses', 'api-info'],
      ['Announcements', 'announcements'],
      ['FAQ', 'faq'],
      ['Uptime Kuma', 'uptime-kuma'],
    ]) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute(
        'href',
        `/system-settings/content/${href}`
      )
    }
  } finally {
    actions.remove()
  }
})
