import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { useSidebarConfig } from '@/hooks/use-sidebar-config'
import { useSidebarData } from '@/hooks/use-sidebar-data'
import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { SettingsPageProvider } from '../../components/settings-page-context'
import {
  parseSidebarModulesAdmin,
  serializeSidebarModulesAdmin,
} from '../config'
import { SidebarModulesSection } from '../sidebar-modules-section'

afterEach(() => {
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset()
})

function SavedSettings({ raw }: { raw: string }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const config = parseSidebarModulesAdmin(raw)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <SidebarModulesSection
          config={config}
          initialSerialized={serializeSidebarModulesAdmin(config)}
        />
      </SettingsPageProvider>
    </>
  )
}

function SidebarDestinations() {
  const groups = useSidebarConfig(useSidebarData().navGroups)
  return (
    <nav aria-label='Console sidebar'>
      {groups.flatMap((group) =>
        group.items.map((item) =>
          item.url ? (
            <a key={item.url} href={item.url}>
              {item.title}
            </a>
          ) : null
        )
      )}
    </nav>
  )
}

function renderSession(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

it('lets the owner disable the workspace while its sidebar group is already hidden without changing chat presets', async () => {
  let saved = JSON.stringify({
    chat: { enabled: false, playground: true, chat: true },
  })
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: {
      success: true,
      data:
        url === '/api/option/'
          ? [{ key: 'SidebarModulesAdmin', value: saved }]
          : { SidebarModulesAdmin: saved },
    },
  }))
  const write = vi.spyOn(api, 'put').mockImplementation(async (_, payload) => {
    saved = (payload as { value: string }).value
    return { data: { success: true } }
  })
  useAuthStore
    .getState()
    .auth.setUser({ id: 7, username: 'owner', role: ROLE.SUPER_ADMIN })
  renderSession(<SavedSettings raw={saved} />)
  const footer = screen.getByRole('group', { name: 'Sidebar footer' })
  const workspace = within(footer).getByRole('switch', {
    name: 'Canvas / Playground',
  })
  expect(workspace).not.toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByRole('switch', { name: /^Chat$/ })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
  fireEvent.click(workspace)
  fireEvent.click(screen.getByRole('button', { name: 'Save sidebar modules' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  expect(JSON.parse(saved).chat).toEqual({
    enabled: false,
    playground: false,
    chat: true,
  })
})

it('publishes saved switches through status to fresh user and administrator sidebars without losing old controls', async () => {
  let saved = JSON.stringify({
    console: { custom_report: false },
    admin: { models: 'false', custom_tool: false },
  })
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: {
      success: true,
      data:
        url === '/api/option/'
          ? [{ key: 'SidebarModulesAdmin', value: saved }]
          : { SidebarModulesAdmin: saved },
    },
  }))
  const write = vi
    .spyOn(api, 'put')
    .mockImplementation(async (url, payload) => {
      expect(url).toBe('/api/option/')
      const option = payload as { key: string; value: string }
      expect(option.key).toBe('SidebarModulesAdmin')
      saved = option.value
      return { data: { success: true } }
    })
  useAuthStore
    .getState()
    .auth.setUser({ id: 7, username: 'site-owner', role: ROLE.SUPER_ADMIN })
  const editor = renderSession(<SavedSettings raw={saved} />)
  const configuration = within(
    await screen.findByRole('group', { name: 'Configuration' })
  )
  const displayed = configuration.getAllByRole('switch')
  expect(displayed[0]).toHaveAccessibleName('API Keys')
  expect(displayed[1]).toHaveAccessibleName('Channel status')
  fireEvent.click(configuration.getByRole('switch', { name: 'Channel status' }))
  expect(
    screen.getByRole('switch', { name: 'Model management' })
  ).not.toBeChecked()
  const deployments = screen.getByRole('switch', {
    name: 'Models & operations',
  })
  expect(deployments).not.toBeChecked()
  fireEvent.click(deployments)
  saved = JSON.stringify({
    ...JSON.parse(saved),
    overview_panels: {
      overview_quickstart_enabled: false,
      future_label: 'unchanged',
    },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save sidebar modules' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  expect(JSON.parse(saved)).toMatchObject({
    console: { channel_status: false, custom_report: false },
    admin: { models: false, deployments: true, custom_tool: false },
    overview_panels: {
      overview_quickstart_enabled: false,
      future_label: 'unchanged',
    },
  })
  editor.unmount()
  useAuthStore.getState().auth.setUser({
    id: 8,
    username: 'reader',
    role: ROLE.USER,
    sidebar_modules: '{"console":{"channel_status":true}}',
  })
  const reopened = renderSession(<SidebarDestinations />)
  await waitFor(() =>
    expect(
      screen.queryByRole('link', { name: 'Channel status' })
    ).not.toBeInTheDocument()
  )
  expect(screen.getByRole('link', { name: 'API Keys' })).toHaveAttribute(
    'href',
    '/keys'
  )
  expect(
    screen.queryByRole('link', { name: 'Models & operations' })
  ).not.toBeInTheDocument()
  act(() =>
    useAuthStore
      .getState()
      .auth.setUser({ id: 9, username: 'operator', role: ROLE.ADMIN })
  )
  expect(
    await screen.findByRole('link', { name: 'Models & operations' })
  ).toHaveAttribute('href', '/models/deployments')
  expect(
    screen.queryByRole('link', { name: 'Model management' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'System Settings' })
  ).not.toBeInTheDocument()
  reopened.unmount()
  renderSession(<SavedSettings raw={saved} />)
  expect(
    screen.getByRole('switch', { name: 'Channel status' })
  ).not.toBeChecked()
  expect(
    screen.getByRole('switch', { name: 'Models & operations' })
  ).toBeChecked()
})
