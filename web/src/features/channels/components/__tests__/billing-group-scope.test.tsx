import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api, type ApiRequestConfig } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { getGroups } from '../../api'
import { channelSchema, type Channel } from '../../types'
import { ChannelsProvider } from '../channels-provider'
import { ChannelMutateDrawer } from '../drawers/channel-mutate-drawer'

const originalAuth = useAuthStore.getState().auth
let client: QueryClient
let billingGroups: string[]
let groupRequestConfigs: Array<ApiRequestConfig | undefined>

function ChannelDrawerHarness(props: { currentRow?: Channel }) {
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
          <ChannelMutateDrawer
            open={open}
            onOpenChange={setOpen}
            currentRow={props.currentRow}
          />
        </ChannelsProvider>
      </RouterContextProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  billingGroups = ['standard', 'vip']
  groupRequestConfigs = []
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  useAuthStore.setState({
    auth: {
      ...originalAuth,
      user: { id: 1, username: 'root', role: ROLE.SUPER_ADMIN },
    },
  })
  vi.spyOn(api, 'get').mockImplementation(
    async (url, config?: ApiRequestConfig) => {
      if (url === '/api/group/') {
        groupRequestConfigs.push(config)
        return { data: { success: true, data: billingGroups } }
      }
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
      if (url === '/api/prefill_group') {
        return { data: { success: true, data: [] } }
      }
      if (url === '/api/channel/42') {
        return {
          data: {
            success: true,
            data: channelSchema.parse({
              id: 42,
              name: 'Existing channel',
              type: 1,
              key: '',
              status: 1,
              created_time: 1,
              test_time: 0,
              response_time: 0,
              balance_updated_time: 0,
              models: 'gpt-4o',
              group: 'default',
              base_url: 'https://saved.example',
            }),
          },
        }
      }
      throw new Error(`Unexpected GET ${url}`)
    }
  )
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState({ auth: originalAuth })
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('channels billing group scope', () => {
  test('getGroups requests /api/group/ with scope=billing', async () => {
    const response = await getGroups()

    expect(response).toEqual({ success: true, data: ['standard', 'vip'] })
    expect(groupRequestConfigs).toEqual([{ params: { scope: 'billing' } }])
  })

  test('clears untouched default group on new channel when default is not in billing groups', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { success: true } })
    const user = userEvent.setup()

    render(<ChannelDrawerHarness />)
    await user.click(await screen.findByRole('option', { name: /^OpenAI / }))

    await waitFor(() => {
      expect(groupRequestConfigs).toEqual([{ params: { scope: 'billing' } }])
    })
    expect(client.getQueryData(['groups', 'billing'])).toEqual({
      success: true,
      data: ['standard', 'vip'],
    })

    const groupField = screen
      .getByText('Groups')
      .closest<HTMLElement>('[data-slot="form-item"]')
    expect(groupField).toBeTruthy()
    if (!groupField) return

    await waitFor(() => {
      expect(within(groupField).queryByText('default')).not.toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('textbox', { name: /^Name\s*\*$/ }), {
      target: { value: 'Billing Channel' },
    })
    fireEvent.change(screen.getByLabelText('API Key *'), {
      target: { value: 'sk-test-key' },
    })
    await user.type(
      screen.getByRole('combobox', {
        name: 'Select models or add custom ones',
      }),
      'gpt-4o,'
    )
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Create Channel' }))
    expect(
      await within(groupField).findByText('Group is required')
    ).toBeVisible()
    expect(post).not.toHaveBeenCalled()

    await user.click(within(groupField).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'standard' }))
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Create Channel' }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0]?.[1]).toMatchObject({
      mode: 'single',
      channel: {
        name: 'Billing Channel',
        group: 'standard',
      },
    })
  })

  test('keeps default group on new channel when default is included in billing groups', async () => {
    billingGroups = ['default', 'vip']
    const user = userEvent.setup()

    render(<ChannelDrawerHarness />)
    await user.click(await screen.findByRole('option', { name: /^OpenAI / }))

    await waitFor(() => {
      expect(groupRequestConfigs).toEqual([{ params: { scope: 'billing' } }])
    })

    const groupField = screen
      .getByText('Groups')
      .closest<HTMLElement>('[data-slot="form-item"]')
    expect(groupField).toBeTruthy()
    if (!groupField) return

    expect(await within(groupField).findByText('default')).toBeVisible()
  })

  test('preserves saved default group when editing an existing channel even if default is absent from billing groups', async () => {
    const existingChannel = channelSchema.parse({
      id: 42,
      name: 'Existing channel',
      type: 1,
      key: '',
      status: 1,
      created_time: 1,
      test_time: 0,
      response_time: 0,
      balance_updated_time: 0,
      models: 'gpt-4o',
      group: 'default',
      base_url: 'https://saved.example',
    })

    render(<ChannelDrawerHarness currentRow={existingChannel} />)
    await screen.findByDisplayValue('Existing channel')
    await waitFor(() => {
      expect(groupRequestConfigs).toEqual([{ params: { scope: 'billing' } }])
    })

    const groupField = screen
      .getByText('Groups')
      .closest<HTMLElement>('[data-slot="form-item"]')
    expect(groupField).toBeTruthy()
    if (!groupField) return

    expect(await within(groupField).findByText('default')).toBeVisible()
  })
})
