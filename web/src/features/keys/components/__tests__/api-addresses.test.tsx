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
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { STATUS_QUERY_KEY, type StatusData } from '@/lib/status-query'

import { ApiAddressesBar } from '../api-addresses-bar'
import { ApiKeysPrimaryButtons } from '../api-keys-primary-buttons'
import { ApiKeysProvider } from '../api-keys-provider'

let client: QueryClient

beforeEach(() => {
  localStorage.clear()
  client = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderAddresses(status: StatusData) {
  client.setQueryData(STATUS_QUERY_KEY, status)
  return render(
    <QueryClientProvider client={client}>
      <ApiKeysProvider>
        <ApiKeysPrimaryButtons />
        <ApiAddressesBar />
      </ApiKeysProvider>
    </QueryClientProvider>
  )
}

it('renders compact single-line endpoint chips without an outer label, marks the default line, copies, and tests latency', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  const user = userEvent.setup()
  const writeText = vi.spyOn(navigator.clipboard, 'writeText')
  renderAddresses({
    server_address: 'https://console.example.com',
    api_info_enabled: true,
    api_info: [
      {
        route: 'Global',
        description: 'Worldwide access',
        url: 'https://api.example.com/v1',
        color: 'blue',
      },
      {
        route: 'Asia',
        description: 'Regional access',
        url: 'https://asia.example.com/gateway/v1/',
        color: 'green',
      },
    ],
  })

  expect(screen.queryByRole('button', { name: 'API Addresses' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Create API Key' })).toBeVisible()

  const region = screen.getByRole('region', { name: 'API Addresses' })
  expect(within(region).queryByText('API Addresses')).not.toBeInTheDocument()
  const list = within(region).getByRole('list')
  expect(list).toHaveClass('flex-row')
  const rows = within(list).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(rows[0]).toHaveClass('w-fit')
  expect(rows[0]).not.toHaveClass('flex-1')
  expect(rows[0]).toHaveTextContent('Global')
  expect(within(rows[0]).getByText('Default')).toBeVisible()
  expect(within(rows[0]).getByText('https://api.example.com/v1')).toBeVisible()
  expect(rows[1]).toHaveTextContent('Asia')
  expect(within(rows[1]).queryByText('Default')).not.toBeInTheDocument()
  expect(
    within(rows[1]).getByText('https://asia.example.com/gateway/v1/')
  ).toBeVisible()
  expect(writeText).not.toHaveBeenCalled()
  expect(fetchMock).not.toHaveBeenCalled()

  await user.click(
    within(rows[1]).getByRole('button', {
      name: 'Copy API URL: https://asia.example.com/gateway/v1/',
    })
  )
  expect(writeText).toHaveBeenCalledWith('https://asia.example.com/gateway/v1/')
  expect(
    await within(rows[1]).findByRole('button', { name: 'Copied' })
  ).toBeVisible()
  expect(
    within(rows[0]).getByRole('button', {
      name: 'Copy API URL: https://api.example.com/v1',
    })
  ).toBeVisible()

  await user.click(
    within(rows[0]).getByRole('button', {
      name: 'Test latency: https://api.example.com/v1',
    })
  )
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    'https://api.example.com/v1',
    expect.objectContaining({
      method: 'HEAD',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      cache: 'no-store',
    })
  )
  expect(await within(rows[0]).findByText(/\d+ms/)).toBeVisible()
})

it('marks the endpoint matching server_address as default and shows failed status on probe error', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new TypeError('CORS unavailable'))
  )
  const user = userEvent.setup()
  renderAddresses({
    server_address: 'https://asia.example.com/gateway/v1',
    api_info_enabled: true,
    api_info: [
      {
        route: 'Global',
        description: 'Worldwide access',
        url: 'https://api.example.com/v1',
        color: 'blue',
      },
      {
        route: 'Asia',
        description: 'Regional access',
        url: 'https://asia.example.com/gateway/v1/',
        color: 'green',
      },
    ],
  })

  const rows = within(
    screen.getByRole('region', { name: 'API Addresses' })
  ).getAllByRole('listitem')
  expect(within(rows[0]).queryByText('Default')).not.toBeInTheDocument()
  expect(within(rows[1]).getByText('Default')).toBeVisible()

  await user.click(
    within(rows[1]).getByRole('button', {
      name: 'Test latency: https://asia.example.com/gateway/v1/',
    })
  )
  expect(await within(rows[1]).findByText('Failed')).toBeVisible()
})

it.each([
  {
    status: {
      api_info: [],
      server_address: 'https://gateway.example.com/proxy/',
    },
    label: 'Default API address',
    url: 'https://gateway.example.com/proxy/',
  },
  {
    status: { api_info: [] },
    label: 'Current domain',
    url: window.location.origin,
  },
  {
    status: {
      api_info_enabled: false,
      api_info: [
        {
          route: 'Hidden',
          description: 'Disabled address',
          url: 'https://hidden.example.com',
          color: 'blue',
        },
      ],
      server_address: 'https://gateway.example.com',
    },
    label: 'Default API address',
    url: 'https://gateway.example.com',
  },
])(
  'shows and copies the fallback $label when no configured addresses are available',
  async ({ status, label, url }) => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    renderAddresses(status)

    const region = screen.getByRole('region', { name: 'API Addresses' })
    expect(within(region).getAllByRole('listitem')).toHaveLength(1)
    expect(within(region).getByText(label)).toBeVisible()
    expect(within(region).getByText(url)).toBeVisible()
    const copy = within(region).getByRole('button', {
      name: `Copy API URL: ${url}`,
    })
    copy.focus()
    await user.keyboard('{Enter}')
    expect(writeText).toHaveBeenCalledWith(url)
  }
)

it('keeps long addresses readable inline and updates when configuration changes', async () => {
  const user = userEvent.setup()
  const url =
    'https://regional-api-gateway.example.com/organization/production/openai-compatible/v1/'
  renderAddresses({
    api_info: [
      {
        route: 'Regional gateway',
        description: 'Regional production gateway',
        url,
        color: 'blue',
      },
    ],
  })
  const region = screen.getByRole('region', { name: 'API Addresses' })
  expect(within(region).getByText(url)).toHaveClass('break-all')
  expect(within(region).getByText(url)).not.toHaveClass('truncate')

  act(() => {
    client.setQueryData(STATUS_QUERY_KEY, {
      api_info: [
        {
          route: 'Replacement',
          description: 'Updated gateway',
          url: 'https://new.example.com',
          color: 'blue',
        },
      ],
    })
  })
  expect(
    await within(region).findByText('https://new.example.com')
  ).toBeVisible()
  expect(within(region).queryByText(url)).not.toBeInTheDocument()
  await user.click(
    within(region).getByRole('button', {
      name: 'Copy API URL: https://new.example.com',
    })
  )
  expect(await navigator.clipboard.readText()).toBe('https://new.example.com')
})
