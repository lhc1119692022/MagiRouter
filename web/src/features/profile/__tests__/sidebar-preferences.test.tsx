import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'

import { SidebarModulesCard } from '../components/sidebar-modules-card'

afterEach(() => {
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset()
})

it('only offers real, site-allowed sidebar entries to the current role and preserves hidden choices on reset', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(STATUS_QUERY_KEY, {
    SidebarModulesAdmin: '{"console":{"channel_status":false}}',
    HeaderNavModules: '{"docs":false}',
  })
  const old = {
    console: { channel_status: false },
    admin: { models: false, setting: false, future_tool: false },
  }
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { sidebar_modules: JSON.stringify(old) } },
  })
  const write = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  useAuthStore.getState().auth.setUser({
    id: 10,
    username: 'operator',
    role: 10,
    permissions: {
      sidebar_settings: true,
      sidebar_modules: { admin: { setting: false } },
    },
  })
  render(
    <QueryClientProvider client={client}>
      <SidebarModulesCard />
    </QueryClientProvider>
  )
  await waitFor(() =>
    expect(
      screen.getByRole('switch', { name: 'Models & operations' })
    ).not.toBeChecked()
  )
  expect(
    within(screen.getByRole('group', { name: 'Configuration' })).getByRole(
      'switch',
      { name: 'API Keys' }
    )
  ).toBeChecked()
  for (const name of [
    'Channel status',
    'Developer documentation',
    'System Settings',
  ]) {
    expect(screen.queryByRole('switch', { name })).not.toBeInTheDocument()
  }
  fireEvent.click(screen.getByRole('button', { name: 'Reset to Default' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  expect(
    JSON.parse(
      (write.mock.calls[0][1] as { sidebar_modules: string }).sidebar_modules
    )
  ).toMatchObject({
    console: { channel_status: false },
    admin: {
      models: true,
      deployments: true,
      setting: false,
      future_tool: false,
    },
  })
})

it('does not overwrite existing preferences when the original settings cannot be loaded', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(STATUS_QUERY_KEY, { SidebarModulesAdmin: '' })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: false, message: 'Unavailable' },
  })
  const write = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  useAuthStore.getState().auth.setUser({ id: 7, username: 'reader', role: 1 })
  render(
    <QueryClientProvider client={client}>
      <SidebarModulesCard />
    </QueryClientProvider>
  )
  expect(await screen.findByRole('button', { name: 'Retry' })).toBeEnabled()
  const save = screen.queryByRole('button', { name: 'Save Changes' })
  if (save) {
    fireEvent.click(save)
    expect(save).toBeDisabled()
  }
  expect(write).not.toHaveBeenCalled()
})

it('saves independent dashboard and model catalog preferences while preserving unknown legacy switches', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(STATUS_QUERY_KEY, { SidebarModulesAdmin: '' })
  const old = { console: { enabled: true, detail: false, future_report: true } }
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { sidebar_modules: JSON.stringify(old) } },
  })
  const save = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  useAuthStore.getState().auth.setUser({ id: 1, username: 'reader', role: 1 })
  render(
    <QueryClientProvider client={client}>
      <SidebarModulesCard />
    </QueryClientProvider>
  )
  const boards = await screen.findByRole('switch', { name: 'Dashboard' })
  const catalog = screen.getByRole('switch', { name: 'Model Square' })
  await waitFor(() => expect(boards).not.toBeChecked())
  expect(catalog).toBeChecked()
  fireEvent.click(boards)
  fireEvent.click(catalog)
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  const [endpoint, payload] = save.mock.calls[0]
  expect(endpoint).toBe('/api/user/self')
  expect(
    JSON.parse((payload as { sidebar_modules: string }).sidebar_modules).console
  ).toEqual({
    enabled: true,
    detail: false,
    future_report: true,
    boards: true,
    model_square: false,
  })
})
