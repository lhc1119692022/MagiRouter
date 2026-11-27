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
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { ChannelsProvider } from '../channels-provider'
import { ChannelMutateDrawer } from '../drawers/channel-mutate-drawer'

const originalAuth = useAuthStore.getState().auth
let client: QueryClient

function DrawerHarness() {
  const [open, setOpen] = useState(true)
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
  )
  return (
    <QueryClientProvider client={client}>
      <RouterContextProvider router={router}>
        <ChannelsProvider>
          <ChannelMutateDrawer open={open} onOpenChange={setOpen} />
        </ChannelsProvider>
      </RouterContextProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  useAuthStore.setState({
    auth: {
      ...originalAuth,
      user: { id: 1, username: 'root', role: ROLE.SUPER_ADMIN },
    },
  })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/task_plugin_options') {
      return { data: { success: true, data: [] } }
    }
    if (url === '/api/request_plugin/instances') {
      return { data: { success: true, data: { instances: [] } } }
    }
    if (url === '/api/channel/models') {
      return { data: { success: true, data: [{ id: 'gpt-4o' }] } }
    }
    if (url === '/api/channel/default_base_urls') {
      return { data: { success: true, data: {} } }
    }
    if (url === '/api/group/') {
      return { data: { success: true, data: ['default', 'vip'] } }
    }
    if (url === '/api/prefill_group') {
      return { data: { success: true, data: [] } }
    }
    throw new Error(`Unexpected GET ${url}`)
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState({ auth: originalAuth })
  vi.restoreAllMocks()
})

async function openOpenAICreateForm(user: ReturnType<typeof userEvent.setup>) {
  render(<DrawerHarness />)
  await user.click(await screen.findByRole('option', { name: /^OpenAI\b/ }))
  await user.type(
    await screen.findByRole('textbox', { name: /^Name\s*\*$/ }),
    'Relay A'
  )
  await user.type(screen.getByLabelText('API Key *'), 'sk-test-key')
  await user.type(
    screen.getByRole('combobox', { name: 'Select models or add custom ones' }),
    'gpt-4o,'
  )
  await user.keyboard('{Escape}')
}

test('requires upstream group ratio before creating a channel and supports fetching upstream groups', async () => {
  const user = userEvent.setup()
  const postSpy = vi
    .spyOn(api, 'post')
    .mockImplementation(async (url: string) => {
      if (url === '/api/channel/fetch_upstream_ratios') {
        return {
          data: {
            success: true,
            data: {
              supported: true,
              source: 'https://relay.example/api/pricing',
              groups: [
                { group: 'default', ratio: 1, description: 'Default' },
                { group: 'vip', ratio: 0.75, description: 'VIP' },
              ],
            },
          },
        }
      }
      if (url === '/api/channel') {
        return { data: { success: true, data: { ids: [101] } } }
      }
      throw new Error(`Unexpected POST ${url}`)
    })

  await openOpenAICreateForm(user)
  await user.type(
    screen.getByLabelText(/Base URL/i),
    'https://relay.example/v1'
  )

  await user.click(screen.getByRole('button', { name: 'Create Channel' }))
  expect(
    await screen.findByText('Upstream group ratio is required')
  ).toBeVisible()
  expect(postSpy).not.toHaveBeenCalledWith(
    '/api/channel',
    expect.anything(),
    expect.anything()
  )

  await user.click(
    screen.getByRole('button', { name: 'Fetch upstream group ratios' })
  )
  const vipChip = await screen.findByRole('button', { name: /vip.*0\.75x/ })
  await user.click(vipChip)

  await user.click(screen.getByRole('button', { name: 'Create Channel' }))
  await waitFor(() =>
    expect(postSpy).toHaveBeenCalledWith(
      '/api/channel',
      expect.anything(),
      expect.anything()
    )
  )
  const createCall = postSpy.mock.calls.find(([url]) => url === '/api/channel')
  const payload = createCall?.[1] as { channel: { setting: string } }
  expect(JSON.parse(payload.channel.setting)).toMatchObject({
    upstream_group_ratio: 0.75,
    upstream_group_name: 'vip',
  })
})

test('guides manual entry when upstream does not expose group ratios', async () => {
  const user = userEvent.setup()
  const postSpy = vi
    .spyOn(api, 'post')
    .mockImplementation(async (url: string) => {
      if (url === '/api/channel/fetch_upstream_ratios') {
        return {
          data: {
            success: true,
            data: { supported: false, groups: [] },
          },
        }
      }
      if (url === '/api/channel') {
        return { data: { success: true, data: { ids: [102] } } }
      }
      throw new Error(`Unexpected POST ${url}`)
    })

  await openOpenAICreateForm(user)
  await user.click(
    screen.getByRole('button', { name: 'Fetch upstream group ratios' })
  )
  expect(
    await screen.findByText(/Upstream did not return public group ratios/)
  ).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Official 1x' }))
  await user.click(screen.getByRole('button', { name: 'Create Channel' }))

  await waitFor(() =>
    expect(postSpy).toHaveBeenCalledWith(
      '/api/channel',
      expect.anything(),
      expect.anything()
    )
  )
  const createCall = postSpy.mock.calls.find(([url]) => url === '/api/channel')
  const payload = createCall?.[1] as { channel: { setting: string } }
  expect(JSON.parse(payload.channel.setting)).toMatchObject({
    upstream_group_ratio: 1,
  })
})
