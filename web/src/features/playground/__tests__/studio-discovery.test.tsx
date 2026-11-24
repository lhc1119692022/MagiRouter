import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { formatTimestampToDate } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

import { StudioDiscovery } from '../components/studio-discovery'
import type { ModelOption } from '../types'

const clients: QueryClient[] = []
const originalUser = useAuthStore.getState().auth.user
const current = 'speaker/current'
const alternate = 'speaker/next + clean'
const degradedModel = 'speaker/degraded'
const unstableModel = 'speaker/unstable'
const unmonitoredModel = 'speaker/unmonitored'
const windowStart = Date.parse('2026-01-01T00:00:00Z') / 1000
const windowEnd = windowStart + 23 * 3600 + 1800
const published = {
  id: 'brief',
  mode: 'chat',
  title: 'Approved summary',
  model: alternate,
  prompt: ' Summarize this. ',
}

interface OpenDiscoveryOptions {
  mode?: 'chat' | 'image' | 'video' | 'audio'
  perfMetrics?: () => Promise<{ data: unknown }>
}

async function openDiscovery(
  group: string,
  allowed: ModelOption[],
  options: OpenDiscoveryOptions = {}
) {
  const mode = options.mode ?? 'chat'
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  const endpoint = {
    chat: 'openai',
    image: 'image-generation',
    video: 'openai-video',
    audio: 'audio-speech',
  }[mode]
  const pricingModels = [
    ...new Set([
      current,
      alternate,
      'forbidden',
      ...allowed.map((item) => item.value),
    ]),
  ]
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/self/creation-presets') {
      return { data: { success: true, data: [published] } }
    }
    if (url === '/api/pricing') {
      return {
        data: {
          success: true,
          vendors: [],
          supported_endpoint: {
            'provider-format': { path: '/v1/messages' },
            unrequested: { path: '/v1/responses/compact' },
          },
          data: pricingModels.map((model_name) => ({
            model_name,
            supported_endpoint_types:
              model_name === current && mode === 'chat'
                ? [endpoint, 'provider-format']
                : [endpoint],
            enable_groups: ['default'],
            model_ratio: 75,
            official_price:
              model_name === current
                ? {
                    source_url: 'https://publisher.example/prices',
                    input_usd_per_million: 0,
                  }
                : undefined,
            context_length: model_name === current ? 98304 : undefined,
            max_output_tokens: model_name === current ? 8192 : undefined,
            input_modalities: model_name === current ? ['text'] : undefined,
            output_modalities: [mode === 'chat' ? 'text' : mode],
          })),
        },
      }
    }
    if (url === '/api/perf-metrics/summary') {
      if (options.perfMetrics) {
        return options.perfMetrics()
      }
      return {
        data: {
          success: true,
          data: {
            window_start: windowStart,
            window_end: windowEnd,
            models: [
              {
                model_name: current,
                avg_latency_ms: 420,
                success_rate: 99.8,
                avg_tps: 48,
              },
            ],
          },
        },
      }
    }
    return { data: { success: true, data: {} } }
  })
  function Page() {
    const [model, setModel] = useState(current)
    return (
      <StudioDiscovery
        mode={mode}
        group={group}
        allowed={allowed}
        currentModel={model}
        onSelectModel={setModel}
        loadingModels={false}
        modelsError={null}
        retryModels={() => undefined}
        busy={false}
      />
    )
  }
  const router = createRouter({
    routeTree: createRootRoute({ component: Page }),
    history: createMemoryHistory(),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return get
}

it('shows scoped effort metadata and monitored availability separately from selection', async () => {
  const get = await openDiscovery('default', [
    {
      value: current,
      label: current,
      chatControls: { efforts: ['low', 'high'], default_effort: 'high' },
    },
    {
      value: alternate,
      label: alternate,
      chatControls: { efforts: ['medium'], default_effort: 'high' },
    },
  ])
  const table = await screen.findByRole('table')
  const first = within(table).getByRole('row', { name: /speaker\/current/ })
  const next = within(table).getByRole('row', { name: /speaker\/next/ })
  expect(within(first).getByText('Low · High')).toBeVisible()
  expect(within(first).queryByText('Default · High')).toBeNull()
  expect(within(first).getByText('98,304')).toBeVisible()
  expect(await within(first).findByText('99.80%')).toBeVisible()
  expect(within(first).getByText('Available')).toBeVisible()
  expect(within(next).getByText('Available')).toBeVisible()
  expect(within(next).getByText('Not monitored')).toBeVisible()
  expect(within(table).queryByText('Available to this key')).toBeNull()
  expect(first).toHaveAttribute('aria-current', 'true')
  expect(first.querySelector('.pg-compare-dot')).not.toBeNull()
  expect(within(next).getAllByText('Not provided').length).toBeGreaterThan(0)
  expect(within(first).getByRole('link')).toHaveTextContent(/\$0/)
  expect(within(first).getByRole('link')).toHaveAttribute(
    'href',
    'https://publisher.example/prices'
  )
  expect(within(next).queryByRole('link')).toBeNull()
  expect(within(table).queryByText(/\$75/)).toBeNull()
  expect(
    within(first).getByRole('cell', { name: 'Chat · Messages' })
  ).toBeVisible()
  expect(within(first).queryByText('Responses Compact')).toBeNull()
  expect(within(next).getByRole('cell', { name: 'Chat' })).toBeVisible()
  expect(within(next).getByRole('cell', { name: 'Medium' })).toBeVisible()
  expect(within(table).queryByText('forbidden')).toBeNull()
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((head) => head.textContent)
  ).toEqual([
    'Model',
    'Official list price',
    'Context window',
    'Supported efforts',
    'Request format',
    'Status',
    'Actions',
  ])
  await userEvent.click(
    within(next).getByRole('button', { name: `Switch to ${alternate}` })
  )
  expect(next).toHaveAttribute('aria-current', 'true')
  expect(next.querySelector('.pg-compare-dot')).not.toBeNull()
  expect(first).not.toHaveAttribute('aria-current')
  expect(within(table).queryByText('Available to this key')).toBeNull()
  expect(get).toHaveBeenCalledWith('/api/perf-metrics/summary', {
    params: { hours: 24, recent_model: undefined },
    paramsSerializer: { indexes: null },
  })
  expect(
    get.mock.calls.map(([url]) => url).filter((url) => url.includes('/v1/'))
  ).toEqual([])
})

it('classifies healthy, degraded, unstable, and unmonitored models from 24-hour telemetry', async () => {
  await openDiscovery(
    'default',
    [
      { value: current, label: current },
      { value: degradedModel, label: degradedModel },
      { value: unstableModel, label: unstableModel },
      { value: unmonitoredModel, label: unmonitoredModel },
    ],
    {
      perfMetrics: async () => ({
        data: {
          success: true,
          data: {
            window_start: windowStart,
            window_end: windowEnd,
            models: [
              {
                model_name: current,
                avg_latency_ms: 350,
                success_rate: 99.8,
                avg_tps: 55,
              },
              {
                model_name: degradedModel,
                avg_latency_ms: 680,
                success_rate: 88.5,
                avg_tps: 32,
              },
              {
                model_name: unstableModel,
                avg_latency_ms: 1200,
                success_rate: 42.0,
                avg_tps: 14,
              },
            ],
          },
        },
      }),
    }
  )
  const table = await screen.findByRole('table')
  const healthyRow = within(table).getByRole('row', {
    name: /speaker\/current/,
  })
  const degradedRow = within(table).getByRole('row', {
    name: /speaker\/degraded/,
  })
  const unstableRow = within(table).getByRole('row', {
    name: /speaker\/unstable/,
  })
  const unmonitoredRow = within(table).getByRole('row', {
    name: /speaker\/unmonitored/,
  })

  expect(await within(healthyRow).findByText('99.80%')).toBeVisible()
  expect(within(healthyRow).getByText('Available')).toBeVisible()
  expect(
    healthyRow.querySelector('.pg-compare-status-badge.is-available')
  ).toHaveAttribute(
    'title',
    expect.stringContaining(formatTimestampToDate(windowStart))
  )
  expect(
    healthyRow.querySelector('.pg-compare-status-badge.is-available')
  ).toHaveAttribute(
    'title',
    expect.stringContaining(formatTimestampToDate(windowEnd))
  )

  expect(within(degradedRow).getByText('Degraded')).toBeVisible()
  expect(within(degradedRow).getByText('88.50%')).toBeVisible()
  expect(
    degradedRow.querySelector('.pg-compare-status-badge.is-degraded')
  ).not.toBeNull()

  expect(within(unstableRow).getByText('Unstable')).toBeVisible()
  expect(within(unstableRow).getByText('42.00%')).toBeVisible()
  expect(
    unstableRow.querySelector('.pg-compare-status-badge.is-unstable')
  ).not.toBeNull()

  expect(within(unmonitoredRow).getByText('Available')).toBeVisible()
  expect(within(unmonitoredRow).getByText('Not monitored')).toBeVisible()
  expect(within(unmonitoredRow).queryByText(/%/)).toBeNull()
  expect(
    unmonitoredRow.querySelector('.pg-compare-status-badge.is-unmonitored')
  ).toHaveAttribute(
    'title',
    'Channel enabled; no request samples recorded in the last 24 hours.'
  )
  expect(within(table).queryByText('Available to this key')).toBeNull()
  expect(
    screen.getByText(
      'Status combines active channel availability with observed 24-hour request success rates; models without recent samples are marked unmonitored.'
    )
  ).toBeVisible()
})

it('keeps models marked available when monitoring summary fails', async () => {
  await openDiscovery(
    'default',
    [
      { value: current, label: current },
      { value: alternate, label: alternate },
    ],
    {
      perfMetrics: async () => {
        throw new Error('Metrics backend unreachable')
      },
    }
  )
  const table = await screen.findByRole('table')
  expect(
    await within(table).findAllByText('Monitoring unavailable')
  ).toHaveLength(2)
  expect(within(table).getAllByText('Available')).toHaveLength(2)
  expect(within(table).queryByText('Unstable')).toBeNull()
  expect(within(table).queryByText('Degraded')).toBeNull()
  expect(within(table).queryByText('Available to this key')).toBeNull()
})

it('keeps models clean while telemetry is loading and falls back on server failure payloads', async () => {
  let resolveMetrics!: (value: { data: unknown }) => void
  await openDiscovery('default', [{ value: current, label: current }], {
    perfMetrics: () =>
      new Promise((resolve) => {
        resolveMetrics = resolve
      }),
  })
  const table = await screen.findByRole('table')
  const row = within(table).getByRole('row', { name: /speaker\/current/ })
  expect(within(row).getByText('Available')).toBeVisible()
  expect(within(row).queryByText('Not monitored')).toBeNull()
  expect(within(row).queryByText('Monitoring unavailable')).toBeNull()
  expect(within(row).queryByText(/%/)).toBeNull()
  expect(row.querySelector('.pg-compare-status-meta')).toBeNull()

  resolveMetrics({
    data: { success: false, message: 'metrics disabled' },
  })
  expect(await within(row).findByText('Monitoring unavailable')).toBeVisible()
  expect(within(row).getByText('Available')).toBeVisible()
})

it('does not show cached models or published presets until a key group is confirmed', async () => {
  const get = await openDiscovery('', [{ value: alternate, label: alternate }])
  expect(
    (
      await screen.findAllByText(
        'Select an API key to see available models and presets.'
      )
    ).length
  ).toBeGreaterThan(0)
  expect(screen.queryByRole('table')).toBeNull()
  expect(screen.queryByRole('link', { name: /Approved summary/ })).toBeNull()
  expect(
    get.mock.calls
      .map(([url]) => url)
      .filter((url) => url.includes('perf-metrics'))
  ).toEqual([])
})

it.each(['image', 'video', 'audio'] as const)(
  'shows only authorized %s capabilities and labels missing model specifications',
  async (mode) => {
    await openDiscovery('default', [{ value: current, label: current }], {
      mode,
      perfMetrics: async () => ({
        data: { success: true, data: { models: [] } },
      }),
    })
    const table = await screen.findByRole('table')
    const row = within(table).getByRole('row', { name: /speaker\/current/ })
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(within(row).getByText('text')).toBeVisible()
    expect(within(row).getAllByText('Not provided').length).toBeGreaterThan(0)
    expect(await within(row).findByText('Not monitored')).toBeVisible()
    expect(within(row).getByText('Available')).toBeVisible()
    expect(within(row).queryByText('Available to this key')).toBeNull()
  }
)

async function openStudio(presetsAvailable = true) {
  const { Playground } = await import('..')
  useAuthStore.getState().auth.setUser({
    id: 37,
    username: 'discovery-fixture',
    role: 1,
    group: 'default',
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url.startsWith('/api/token/?')) {
      return {
        data: {
          success: true,
          data: {
            items: [
              {
                id: 42,
                name: 'Discovery test key',
                group: 'default',
                status: 1,
                expired_time: -1,
                unlimited_quota: true,
              },
            ],
            total: 1,
          },
        },
      }
    }
    if (url === '/api/user/models') {
      const params = config?.params as Record<string, unknown> | undefined
      const keyId = params?.billing_key_id
      return {
        data: {
          success: true,
          billing_key_id: keyId,
          group: 'default',
          data: keyId ? [current, alternate, 'image-only'] : ['forbidden'],
        },
      }
    }
    if (url === '/api/user/self/groups') {
      return {
        data: {
          success: true,
          data: { default: { desc: 'Default', ratio: 1 } },
        },
      }
    }
    if (url === '/api/user/self/creation-presets') {
      if (!presetsAvailable) throw new Error('Fixture offline')
      return {
        data: {
          success: true,
          data: [
            published,
            {
              ...published,
              id: 'other',
              model: 'forbidden',
              title: 'Group restricted',
            },
          ],
        },
      }
    }
    if (url === '/api/pricing') {
      return {
        data: {
          success: true,
          vendors: [],
          data: [current, alternate, 'forbidden', 'image-only'].map((name) => ({
            model_name: name,
            context_length: name === current ? 98304 : undefined,
            max_output_tokens: name === current ? 8192 : undefined,
            supported_endpoint_types: [
              name === 'image-only' ? 'image-generation' : 'openai',
            ],
            enable_groups: ['default'],
          })),
        },
      }
    }
    if (url === '/api/perf-metrics/summary') {
      return {
        data: {
          success: true,
          data: {
            models: [
              {
                model_name: current,
                avg_latency_ms: 410,
                success_rate: 99.8,
                avg_tps: 42,
              },
            ],
          },
        },
      }
    }
    return { data: { success: true, data: {} } }
  })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <Playground initialMode='chat' initialModel={current} />,
    }),
    history: createMemoryHistory(),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  const picker = await screen.findByRole('combobox', { name: 'API Key' })
  await waitFor(() => expect(picker).toBeEnabled())
  await userEvent.click(picker)
  await userEvent.click(
    await screen.findByRole('option', { name: 'Discovery test key' })
  )
}

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  localStorage.clear()
  useAuthStore.getState().auth.setUser(originalUser)
  vi.restoreAllMocks()
})

it('offers only published compatible presets and the current group’s same-mode models below the workspace', async () => {
  const send = vi.spyOn(api, 'post')
  await openStudio()
  const presets = await screen.findByRole('region', { name: 'Scene presets' })
  const compare = screen.getByRole('region', { name: /Text model comparison/ })
  expect(
    await within(presets).findByRole('link', { name: /Approved summary/ })
  ).toHaveAttribute('href', '/playground?preset=brief&group=default')
  expect(within(presets).queryByText('Group restricted')).toBeNull()
  expect(within(compare).queryByText('forbidden')).toBeNull()
  expect(within(compare).queryByText('image-only')).toBeNull()
  const table = within(compare).getByRole('table')
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  expect(
    within(table).getByRole('columnheader', { name: 'Context window' })
  ).toBeVisible()
  const currentRow = within(table).getByRole('row', {
    name: /speaker\/current/,
  })
  expect(within(currentRow).getByText('98,304')).toBeVisible()
  expect(within(currentRow).queryByText('8,192')).toBeNull()
  expect(within(currentRow).getAllByText('Not provided')).toHaveLength(2)
  expect(await within(currentRow).findByText('99.80%')).toBeVisible()
  expect(currentRow).toHaveAttribute('aria-current', 'true')
  expect(currentRow.querySelector('.pg-compare-dot')).not.toBeNull()
  expect(within(compare).queryByText('Available to this key')).toBeNull()
  const draft = screen.getByRole('textbox')
  await userEvent.type(draft, 'My unsent draft')
  await userEvent.click(
    within(compare).getByRole('button', { name: `Switch to ${alternate}` })
  )
  const switchedRow = await within(compare).findByRole('row', {
    name: /speaker\/next \+ clean.*Current model/,
  })
  expect(switchedRow).toHaveAttribute('aria-current', 'true')
  expect(switchedRow.querySelector('.pg-compare-dot')).not.toBeNull()
  expect(draft).toHaveValue('My unsent draft')
  expect(send).not.toHaveBeenCalled()
  expect(
    presets.compareDocumentPosition(compare) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
})

it('keeps chat editable and alternatives available if the optional presets cannot be loaded', async () => {
  await openStudio(false)
  const presets = await screen.findByRole('region', { name: 'Scene presets' })
  expect(
    await within(presets).findByRole('button', { name: 'Retry' })
  ).toBeEnabled()
  expect(
    await screen.findByRole('button', { name: `Switch to ${alternate}` })
  ).toBeEnabled()
  expect(screen.getByRole('textbox')).toBeEnabled()
})
