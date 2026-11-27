import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { usageLogSchema } from '../../data/schema'
import { UsageLogsProvider } from '../usage-logs-provider'
import { UsageLogsTable } from '../usage-logs-table'

vi.mock('@lobehub/icons', () => ({}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset()
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG },
  })
})

test('renders editorial LLM logs stat strip and split 12-column table layout with cache bar, billing details tooltip, and balance', async () => {
  useAuthStore.getState().auth.setUser({
    id: 7,
    username: 'alice',
    role: ROLE.USER,
    quota: 64200000,
  })
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG },
  })

  const records = [
    usageLogSchema.parse({
      id: 1,
      user_id: 7,
      created_at: 1788840000,
      type: 2,
      content: '',
      token_name: 'prod-claude-code',
      model_name: 'claude-opus-5.5',
      quota: 10800,
      prompt_tokens: 12600,
      completion_tokens: 2000,
      use_time: 20,
      is_stream: true,
      group: 'GPT Fast',
      other: JSON.stringify({
        request_path: '/v1/messages',
        reasoning_effort: 'medium',
        group_ratio: 0.5,
        cache_tokens: 8900,
        frt: 410,
        model_ratio: 1,
        completion_ratio: 2,
        wallet_remain: 64189200,
      }),
    }),
    usageLogSchema.parse({
      id: 2,
      user_id: 7,
      created_at: 1788839900,
      type: 2,
      content: '',
      token_name: 'cursor-agent',
      model_name: 'gpt-6.2-sol',
      quota: 125000,
      prompt_tokens: 4000,
      completion_tokens: 500,
      use_time: 5,
      is_stream: false,
      group: 'GPT Pro',
      other: JSON.stringify({
        request_path: '/v1/responses',
        reasoning_effort: 'high',
        group_ratio: 0.25,
        model_price: 0.25,
        response_model: {
          requested_model: 'gpt-6.2-sol',
          upstream_model: 'gpt-6.2-sol',
          returned_model: 'gpt-6.2-sol-preview',
        },
        wallet_remain: 64064200,
      }),
    }),
    usageLogSchema.parse({
      id: 3,
      user_id: 7,
      created_at: 1788839800,
      type: 5,
      content: 'upstream rate limited',
      token_name: 'cursor-agent',
      model_name: 'gpt-6.2-sol',
      quota: 0,
      use_time: 2,
      is_stream: true,
      group: 'GPT Pro',
      other: JSON.stringify({
        request_path: '/v1/responses',
        group_ratio: 0.25,
      }),
    }),
  ]

  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url.startsWith('/api/log/self/stat')) {
      return {
        data: { success: true, data: { quota: 135800, rpm: 12, tpm: 18000 } },
      }
    }
    if (url.startsWith('/api/log/self?')) {
      return {
        data: { success: true, data: { items: records, total: records.length } },
      }
    }
    if (url === '/api/user/self/groups') {
      return { data: { success: true, data: { 'GPT Fast': { desc: '', ratio: 0.5 } } } }
    }
    if (url === '/api/subscription/self') {
      return { data: { success: true, data: { subscriptions: [], all_subscriptions: [] } } }
    }
    return { data: { success: true, data: {} } }
  })

  const root = createRootRoute()
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const logs = createRoute({
    getParentRoute: () => auth,
    path: '/usage-logs/$section',
    component: () => (
      <UsageLogsProvider>
        <UsageLogsTable logCategory='common' />
      </UsageLogsProvider>
    ),
    validateSearch: (search: Record<string, unknown>) => search,
  })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([logs])]),
    history: createMemoryHistory({ initialEntries: ['/usage-logs/common'] }),
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )

  await waitFor(() => expect(screen.getByText('claude-opus-5.5')).toBeVisible())

  expect(screen.getByText('RPM / RPS')).toBeVisible()
  expect(screen.getByText('RPS 0.2')).toBeVisible()
  expect(screen.getByText('TPM / TPS')).toBeVisible()
  expect(screen.getByText('TPS 300')).toBeVisible()
  expect(screen.getByText('Current Balance')).toBeVisible()

  const headers = screen
    .getAllByRole('columnheader')
    .map((header) => header.textContent?.trim())
  expect(headers).toEqual([
    'Key Name',
    'Model Name',
    'Reasoning Effort',
    'Protocol',
    'Rate Group',
    'Type',
    'Tokens & Cache',
    'This Cost',
    'First Token / Throughput',
    'Details',
    'Time',
    'Balance',
  ])

  const rows = screen.getAllByRole('row').slice(1)
  expect(rows).toHaveLength(3)
  expect(within(rows[0]).getByText('Messages')).toBeVisible()
  expect(within(rows[0]).getByText('medium')).toBeVisible()
  expect(within(rows[0]).getByText('GPT Fast')).toBeVisible()
  expect(within(rows[0]).getByText('0.5x')).toBeVisible()
  expect(within(rows[0]).getByText('Stream')).toBeVisible()
  expect(within(rows[0]).getByText('100 t/s')).toBeVisible()
  expect(within(rows[0]).getByText('12.6K → 2K')).toBeVisible()
  expect(within(rows[0]).getByText('71%')).toBeVisible()
  expect(within(rows[0]).getByText('8.9K')).toBeVisible()
  expect(
    within(rows[0]).getByRole('button', { name: 'Billing Details' })
  ).toBeVisible()
  expect(within(rows[0]).getByText('410ms')).toBeVisible()
  expect(within(rows[0]).getByText('Per-token')).toBeVisible()
  expect(within(rows[0]).getByText('$128.3784')).toBeVisible()
  expect(within(rows[1]).getByText('Per-call')).toBeVisible()
  expect(within(rows[2]).getByText('Free on failure')).toBeVisible()
})
