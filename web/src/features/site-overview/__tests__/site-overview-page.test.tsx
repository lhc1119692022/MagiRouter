import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { SiteOverview } from '../index'
import type { SiteOverviewResponse } from '../types'

vi.mock('@visactor/react-vchart', () => ({
  VChart: () => <div data-testid='mock-vchart' />,
}))

vi.mock('@visactor/vchart', () => ({
  ThemeManager: {
    setCurrentTheme: vi.fn(),
  },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...rest
  }: {
    children?: ReactNode
    to?: string
    [key: string]: unknown
  }) => (
    <a href={to ?? '#'} {...rest}>
      {children}
    </a>
  ),
}))

const MOCK_REPORT: SiteOverviewResponse = {
  meta: {
    range: '7d',
    bucket_unit: 'day',
    start_time: 1700000000,
    end_time: 1700604800,
    prev_start_time: 1699395200,
    prev_end_time: 1699999999,
    generated_at: 1700604800,
    exclude_admin_users: true,
    excluded_admin_count: 2,
    currency: {
      quota_per_unit: 500000,
      display_type: 'CNY',
      symbol: '¥',
      usd_exchange_rate: 7,
      usd_to_currency_rate: 7,
      topup_price: 7,
    },
  },
  usage: {
    total_requests: 12450,
    prev_requests: 10000,
    requests_change_pct: 24.5,
    total_quota: 50_000_000,
    billed_usd: 100,
    billed_local: 700,
    prev_quota: 40_000_000,
    quota_change_pct: 25,
    total_tokens: 8_400_000,
    prev_tokens: 7_000_000,
    tokens_change_pct: 20,
    cache_read_tokens: 1_260_000,
    cache_creation_tokens: 200_000,
    cache_hit_rate: 15,
    avg_rpm: 1.2,
    avg_tpm: 833.3,
  },
  performance: {
    total_requests: 12450,
    success_requests: 12300,
    failed_requests: 150,
    success_rate: 98.8,
    prev_success_rate: 99.1,
    success_rate_delta: -0.3,
    avg_latency_ms: 1320,
    prev_avg_latency_ms: 1500,
    latency_change_pct: -12,
    avg_ttft_ms: 340,
    prev_avg_ttft_ms: 360,
    ttft_change_pct: -5.6,
    avg_tps: 46.8,
    prev_avg_tps: 44.2,
    has_data: true,
  },
  users: {
    total_users: 420,
    enabled_users: 408,
    disabled_users: 12,
    new_users: 28,
    prev_new_users: 20,
    new_users_change_pct: 40,
    today_new_users: 5,
    deleted_users: 3,
    net_user_change: 25,
    active_users: 136,
    prev_active_users: 118,
    active_users_change_pct: 15.3,
    dau: 54,
    wau: 136,
    mau: 289,
    login_active_users: 162,
    paying_users: 41,
    active_rate: 32.4,
    total_remaining_quota: 250_000_000,
    total_remaining_usd: 500,
    total_remaining_local: 3500,
  },
  channels: {
    total: 10,
    enabled: 8,
    manually_disabled: 1,
    auto_disabled: 1,
    unknown: 0,
    disabled_channels: [
      {
        id: 14,
        name: 'claude-backup-jp',
        type: 14,
        group: 'vip',
        status: 3,
        response_time: 4820,
        test_time: 1700600000,
        priority: 5,
      },
    ],
  },
  trend: [
    {
      ts: 1700518400,
      label: '2026-11-26',
      requests: 6000,
      quota: 24_000_000,
      billed_usd: 48,
      billed_local: 336,
      tokens: 4_000_000,
      cache_read_tokens: 600_000,
      cache_creation_tokens: 100_000,
      active_users: 92,
      new_users: 12,
      deleted_users: 1,
      cumulative_users: 415,
      perf_requests: 6000,
      success_rate: 98.9,
      avg_latency_ms: 1380,
      avg_ttft_ms: 350,
      avg_tps: 45.2,
    },
    {
      ts: 1700604800,
      label: '2026-11-27',
      requests: 6450,
      quota: 26_000_000,
      billed_usd: 52,
      billed_local: 364,
      tokens: 4_400_000,
      cache_read_tokens: 660_000,
      cache_creation_tokens: 100_000,
      active_users: 104,
      new_users: 16,
      deleted_users: 2,
      cumulative_users: 420,
      perf_requests: 6450,
      success_rate: 98.7,
      avg_latency_ms: 1260,
      avg_ttft_ms: 330,
      avg_tps: 48.1,
    },
  ],
  top_models: [
    {
      model_name: 'gpt-4o',
      requests: 7800,
      quota: 32_000_000,
      billed_usd: 64,
      billed_local: 448,
      tokens: 5_200_000,
      share_pct: 64,
      success_rate: 99.4,
      avg_latency_ms: 1180,
      avg_ttft_ms: 290,
      avg_tps: 52.3,
    },
  ],
  perf_alerts: [
    {
      model_name: 'claude-3-7-sonnet',
      model_kind: 'chat',
      request_count: 1450,
      success_count: 1380,
      success_rate: 95.17,
      avg_latency_ms: 2450,
      avg_ttft_ms: 610,
      avg_tps: 31.4,
      cache_hit_rate: 22.5,
    },
  ],
  groups: [
    {
      group: 'vip',
      requests: 9000,
      quota: 38_000_000,
      billed_usd: 76,
      billed_local: 532,
      tokens: 6_200_000,
      active_users: 68,
      success_rate: 99.2,
      avg_latency_ms: 1210,
      avg_ttft_ms: 300,
      avg_tps: 49.5,
    },
  ],
  top_users: [
    {
      user_id: 42,
      username: 'alice_dev',
      display_name: 'Alice Chen',
      group: 'vip',
      status: 1,
      requests: 3200,
      quota: 15_000_000,
      billed_usd: 30,
      billed_local: 210,
      tokens: 2_100_000,
      remaining_quota: 25_000_000,
      remaining_local: 350,
      last_login_at: 1700600000,
      created_at: 1690000000,
    },
  ],
  runtime: {
    alloc_bytes: 67_108_864,
    sys_bytes: 134_217_728,
    num_gc: 42,
    num_goroutine: 128,
    disk_cache_enabled: true,
    disk_cache_size_bytes: 524_288_000,
    disk_cache_files: 120,
    cpu_usage: 21.4,
    memory_usage: 48.2,
    disk_usage: 36.5,
    monitor_sampled: true,
  },
}

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'root',
    role: ROLE.SUPER_ADMIN,
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset()
})

describe('SiteOverview page', () => {
  it('renders site-wide KPIs, channel alerts, runtime snapshot, and switches breakdown tabs and filters', async () => {
    const user = userEvent.setup()
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: MOCK_REPORT,
      },
    })

    renderWithQuery(<SiteOverview />)

    expect(await screen.findByText('Site Overview')).toBeVisible()
    expect(await screen.findByText('98.80%')).toBeVisible()
    expect(screen.getByText('420')).toBeVisible()
    expect(screen.getByText('claude-backup-jp')).toBeVisible()
    expect(screen.getByText(/Goroutines 128/)).toBeVisible()
    expect(screen.getByText('gpt-4o')).toBeVisible()

    // Switch to Performance Watchlist tab
    await user.click(
      screen.getByRole('tab', { name: /Performance Watchlist/i })
    )
    expect(await screen.findByText('claude-3-7-sonnet')).toBeVisible()

    // Switch to Top Users tab and filter by keyword
    await user.click(screen.getByRole('tab', { name: /Top Users/i }))
    expect(await screen.findByText('Alice Chen')).toBeVisible()

    const filterInput = screen.getByPlaceholderText(
      'Filter models, groups, or users...'
    )
    await user.type(filterInput, 'nonexistent-user')
    expect(await screen.findByText('No user consumption records')).toBeVisible()

    // Switch range to 30d and verify API query param
    await user.click(screen.getByRole('button', { name: '30d' }))
    await waitFor(() =>
      expect(getSpy).toHaveBeenCalledWith('/api/data/site-overview', {
        params: { range: '30d' },
      })
    )

    // Toggle exclude admins switch and verify API query param
    await user.click(screen.getByRole('switch', { name: 'Exclude admins' }))
    await waitFor(() =>
      expect(getSpy).toHaveBeenCalledWith('/api/data/site-overview', {
        params: { range: '30d', exclude_admins: false },
      })
    )
  })

  it('shows error state and retries when loading fails', async () => {
    const user = userEvent.setup()
    const getSpy = vi
      .spyOn(api, 'get')
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({
        data: {
          success: true,
          message: '',
          data: MOCK_REPORT,
        },
      })

    renderWithQuery(<SiteOverview />)

    expect(
      await screen.findByText('Failed to load site overview')
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Retry|Try again/i }))
    expect(await screen.findByText('gpt-4o')).toBeVisible()
    expect(getSpy).toHaveBeenCalledTimes(2)
  })
})
