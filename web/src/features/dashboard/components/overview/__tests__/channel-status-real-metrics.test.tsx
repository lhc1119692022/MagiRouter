import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { Route as channelStatusRoute } from '@/routes/_authenticated/channel-status'

import { GroupStatusPanel } from '../group-status-panel'

const realMetricsFixture = {
  window_hours: 24,
  window_start: 1764000000,
  window_end: 1764086400,
  bucket_seconds: 3600,
  summary: {
    total_groups: 3,
    operational_groups: 2,
    degraded_groups: 1,
    outage_groups: 0,
    idle_groups: 0,
    total_requests: 1280,
    success_rate: 98.5,
    avg_latency_ms: 1180,
    avg_ttft_ms: 480,
    avg_tps: 68.4,
  },
  groups: [
    {
      group: 'default',
      description: 'Default routing pool',
      ratio: 1,
      status: 'operational',
      capabilities: ['text'],
      media_only: false,
      metric_focus: 'cache_rate',
      enabled_models: 18,
      has_active_channels: true,
      request_count: 1000,
      success_count: 996,
      success_rate: 99.6,
      avg_latency_ms: 1100,
      avg_ttft_ms: 450,
      avg_tps: 71.2,
      cache_hit_rate: 42.8,
      series: [
        {
          ts: 1764082800,
          request_count: 500,
          success_count: 498,
          success_rate: 99.6,
          avg_latency_ms: 1120,
          avg_ttft_ms: 460,
          avg_tps: 70.4,
        },
        {
          ts: 1764086400,
          request_count: 500,
          success_count: 498,
          success_rate: 99.6,
          avg_latency_ms: 1080,
          avg_ttft_ms: 440,
          avg_tps: 72.0,
        },
      ],
      top_models: [
        {
          model_name: 'claude-sonnet-4-5',
          model_kind: 'text',
          metric_focus: 'cache_rate',
          request_count: 620,
          success_count: 618,
          success_rate: 99.68,
          avg_latency_ms: 1200,
          avg_ttft_ms: 470,
          avg_tps: 74.5,
          cache_hit_rate: 46.2,
        },
      ],
      recent_probe: {
        last_tested_at: 1764086000,
        tested_model: 'gpt-4o-mini',
        success: true,
        latency_ms: 340,
        recent_samples: 8,
        recent_success_rate: 100,
        recent_models: ['gpt-4o-mini', 'claude-sonnet-4-5'],
      },
    },
    {
      group: 'media-studio',
      description: 'Image and video generation pool',
      ratio: 1,
      status: 'operational',
      capabilities: ['image', 'video'],
      media_only: true,
      metric_focus: 'duration',
      enabled_models: 5,
      has_active_channels: true,
      request_count: 80,
      success_count: 79,
      success_rate: 98.75,
      avg_latency_ms: 18400,
      avg_ttft_ms: 0,
      avg_tps: 0,
      series: [
        {
          ts: 1764086400,
          request_count: 80,
          success_count: 79,
          success_rate: 98.75,
          avg_latency_ms: 18400,
          avg_ttft_ms: 0,
          avg_tps: 0,
        },
      ],
      top_models: [
        {
          model_name: 'sora-2',
          model_kind: 'video',
          metric_focus: 'duration',
          request_count: 50,
          success_count: 49,
          success_rate: 98.0,
          avg_latency_ms: 24500,
          avg_ttft_ms: 0,
          avg_tps: 0,
        },
      ],
    },
    {
      group: 'vip',
      description: 'Priority route',
      ratio: 1.5,
      status: 'degraded',
      capabilities: ['text'],
      media_only: false,
      metric_focus: 'cache_rate',
      enabled_models: 6,
      has_active_channels: true,
      request_count: 200,
      success_count: 186,
      success_rate: 93.0,
      avg_latency_ms: 1580,
      avg_ttft_ms: 630,
      avg_tps: 54.4,
      cache_hit_rate: 19.5,
      series: [
        {
          ts: 1764086400,
          request_count: 200,
          success_count: 186,
          success_rate: 93.0,
          avg_latency_ms: 1580,
          avg_ttft_ms: 630,
          avg_tps: 54.4,
        },
      ],
      top_models: [],
    },
  ],
}

let client: QueryClient

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  client?.clear()
})

async function renderAt(path: string, withUptime = false) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], { uptime_kuma_enabled: true })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/perf-metrics/groups') {
      return { data: { success: true, data: realMetricsFixture } }
    }
    return {
      data: {
        success: true,
        data: withUptime
          ? [
              {
                categoryName: 'LA Probe VPS',
                monitors: [
                  {
                    name: 'us.magirouter.com',
                    group: 'Gateway',
                    status: 1,
                    uptime: 0.9995,
                    uptimeKnown: true,
                    latencyMs: 42,
                  },
                ],
              },
            ]
          : [],
      },
    }
  })

  const root = createRootRoute()
  const overview = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: GroupStatusPanel,
  })
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const status = createRoute({
    getParentRoute: () => auth,
    path: 'channel-status',
    component: channelStatusRoute.options.component,
    validateSearch: channelStatusRoute.options.validateSearch,
  })
  const router = createRouter({
    routeTree: root.addChildren([overview, auth.addChildren([status])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('channel status real-request metrics', () => {
  it('renders real-request cards with cache rate for token groups, avg duration for media groups, and opens slide-over detail drawer on click', async () => {
    await renderAt('/channel-status', true)

    expect(await screen.findByText('default')).toBeVisible()
    expect(screen.getByText('99.60%')).toBeVisible()
    expect(screen.getByText('0.45s')).toBeVisible()
    expect(screen.getByText('42.8%')).toBeVisible()
    expect(screen.getByText(/gpt-4o-mini · 0\.34s/)).toBeVisible()
    expect(screen.getByText('media-studio')).toBeVisible()
    expect(screen.getByText('Real user traffic only')).toBeVisible()
    expect(screen.getByText('18.40s')).toBeVisible()
    expect(screen.getByText('us.magirouter.com')).toBeVisible()

    // Click the card to open the slide-over detail drawer
    await userEvent.click(
      screen.getByRole('button', { name: 'View model details for default' })
    )
    expect(await screen.findByText('Model details (1)')).toBeVisible()
    expect(screen.getAllByText('claude-sonnet-4-5').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('46.2%')).toBeVisible()

    // Close drawer then test status filtering
    await userEvent.keyboard('{Escape}')
    await userEvent.click(
      screen.getByRole('button', { name: /^Degraded$/ })
    )
    expect(screen.getByText('vip')).toBeVisible()
    expect(screen.queryByText('default')).not.toBeInTheDocument()

    // Reset and test Model-Plaza-style capability filtering
    await userEvent.click(screen.getByRole('button', { name: /^Reset$/ }))
    await userEvent.click(
      screen.getByRole('button', { name: /Video Generation/ })
    )
    expect(screen.getByText('media-studio')).toBeVisible()
    expect(screen.queryByText('default')).not.toBeInTheDocument()
    expect(screen.queryByText('vip')).not.toBeInTheDocument()

    // Reset back to all capabilities
    await userEvent.click(screen.getByRole('button', { name: /^Reset$/ }))
    expect(screen.getByText('default')).toBeVisible()
    expect(screen.getByText('media-studio')).toBeVisible()
  })

  it('shows real-request group summary rows in overview GroupStatusPanel without Uptime Kuma', async () => {
    await renderAt('/', false)
    const defaultRow = await screen.findByRole('link', { name: /default/ })
    expect(defaultRow).toHaveTextContent('99.60%')
    expect(defaultRow).toHaveAttribute('href', '/channel-status?group=default')
  })
})
