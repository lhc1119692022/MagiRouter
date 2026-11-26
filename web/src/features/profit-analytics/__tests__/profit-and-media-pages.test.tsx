import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MediaTraffic } from '@/features/media-traffic'
import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { ProfitAnalytics } from '../index'

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

describe('ProfitAnalytics page', () => {
  it('renders profit metrics, switches breakdown tabs, and allows root to update cost settings', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/api/data/profit') {
        return {
          data: {
            success: true,
            message: '',
            data: {
              currency: {
                quota_per_unit: 500000,
                display_type: 'CNY',
                symbol: '¥',
                usd_exchange_rate: 7,
                usd_to_currency_rate: 7,
                topup_price: 7,
              },
              cost_settings: {
                default_cost_ratio: 0.5,
                payment_fee_rate: 0.01,
                payment_fee_rates: { alipay: 0.02 },
                channel_costs: {},
                extra_fixed_costs: [],
              },
              summary: {
                range_days: 30,
                start_time: 1700000000,
                end_time: 1702592000,
                cash_revenue: 170,
                wallet_topup_money: 100,
                wallet_topup_orders: 1,
                subscription_direct_money: 70,
                subscription_direct_orders: 1,
                subscription_balance_money: 70,
                subscription_balance_orders: 1,
                payment_fee_cost: 2.7,
                net_cash_inflow: 167.3,
                billed_quota: 7500000,
                billed_usd: 15,
                billed_local: 105,
                total_requests: 30,
                total_tokens: 20000,
                paying_users: 2,
                active_users: 2,
                upstream_variable_cost: 42,
                channel_fixed_cost: 300,
                platform_fixed_cost: 0,
                total_estimated_cost: 344.7,
                cash_net_profit: -174.7,
                cash_net_margin: -102.76,
                billed_gross_profit: 63,
                billed_gross_margin: 60,
                billed_net_profit: -237,
                billed_net_margin: -225.71,
              },
              liability: {
                user_remaining_quota: 1500000,
                user_remaining_usd: 3,
                user_remaining_local: 21,
                subscription_remaining_quota: 1500000,
                subscription_remaining_usd: 3,
                subscription_remaining_local: 21,
                redeemed_quota: 500000,
                redeemed_usd: 1,
                redeemed_local: 7,
                redeemed_count: 1,
                checkin_quota: 100000,
                checkin_usd: 0.2,
                checkin_local: 1.4,
                checkin_count: 1,
              },
              daily_trend: [
                {
                  date: '2026-11-25',
                  cash_revenue: 170,
                  wallet_topup_money: 100,
                  subscription_direct_money: 70,
                  payment_fee: 2.7,
                  billed_usd: 15,
                  billed_local: 105,
                  upstream_cost: 42,
                  fixed_cost: 10,
                  total_cost: 54.7,
                  cash_net_profit: 115.3,
                  billed_gross_profit: 63,
                  billed_net_profit: 53,
                  requests: 30,
                  tokens: 20000,
                  orders: 2,
                },
              ],
              channels: [
                {
                  channel_id: 7,
                  channel_name: 'OpenAI Relay',
                  channel_type: 1,
                  group: 'vip',
                  tag: '',
                  status: 1,
                  balance: 0,
                  requests: 20,
                  tokens: 12000,
                  billed_quota: 5000000,
                  billed_usd: 10,
                  billed_local: 70,
                  cost_ratio: 0.6,
                  custom_cost_ratio: true,
                  variable_cost: 42,
                  monthly_fixed_cost: 0,
                  amortized_fixed_cost: 0,
                  gross_profit: 28,
                  net_profit: 28,
                  margin_rate: 40,
                  note: 'API relay',
                },
              ],
              models: [
                {
                  model_name: 'gpt-4o',
                  requests: 20,
                  tokens: 12000,
                  billed_quota: 5000000,
                  billed_usd: 10,
                  billed_local: 70,
                  estimated_cost: 42,
                  gross_profit: 28,
                  margin_rate: 40,
                },
              ],
              groups: [
                {
                  group: 'vip',
                  requests: 20,
                  active_users: 1,
                  tokens: 12000,
                  billed_quota: 5000000,
                  billed_usd: 10,
                  billed_local: 70,
                  estimated_cost: 42,
                  gross_profit: 28,
                  margin_rate: 40,
                },
              ],
              payment_methods: [
                {
                  payment_method: 'alipay',
                  order_count: 1,
                  gross_money: 100,
                  fee_rate: 0.02,
                  estimated_fee: 2,
                  net_money: 98,
                  is_internal: false,
                },
              ],
              recent_orders: [
                {
                  order_type: 'topup',
                  trade_no: 'TOPUP-1',
                  user_id: 2,
                  username: 'alice',
                  display_name: 'Alice',
                  payment_method: 'alipay',
                  payment_provider: 'epay',
                  money: 100,
                  amount: 14,
                  completed_at: 1702591000,
                  is_internal: false,
                },
              ],
            },
          },
        }
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: {
          default_cost_ratio: 0.4,
          payment_fee_rate: 0.01,
          payment_fee_rates: { alipay: 0.02 },
          channel_costs: {},
          extra_fixed_costs: [],
        },
      },
    })

    renderWithQuery(<ProfitAnalytics />)

    expect(await screen.findByText('OpenAI Relay')).toBeInTheDocument()
    expect(screen.getByText('¥170.00')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /By model/ }))
    expect(await screen.findByText('gpt-4o')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Payments & orders/ }))
    expect(await screen.findByText('TOPUP-1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cost model' }))
    const ratioInput = await screen.findByLabelText(
      'Default upstream cost ratio (%)'
    )
    await user.clear(ratioInput)
    await user.type(ratioInput, '40')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/option/profit_analytics',
        expect.objectContaining({ default_cost_ratio: 0.4 })
      )
    })
  })

  it('hides root cost configuration controls for non-root administrators', async () => {
    useAuthStore.getState().auth.setUser({
      id: 2,
      username: 'admin',
      role: ROLE.ADMIN,
    })
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: {
          currency: {
            quota_per_unit: 500000,
            display_type: 'USD',
            symbol: '$',
            usd_exchange_rate: 7,
            usd_to_currency_rate: 1,
            topup_price: 7,
          },
          cost_settings: {
            default_cost_ratio: 0.5,
            payment_fee_rate: 0,
            payment_fee_rates: {},
            channel_costs: {},
            extra_fixed_costs: [],
          },
          summary: {
            range_days: 30,
            start_time: 1700000000,
            end_time: 1702592000,
            cash_revenue: 0,
            wallet_topup_money: 0,
            wallet_topup_orders: 0,
            subscription_direct_money: 0,
            subscription_direct_orders: 0,
            subscription_balance_money: 0,
            subscription_balance_orders: 0,
            payment_fee_cost: 0,
            net_cash_inflow: 0,
            billed_quota: 0,
            billed_usd: 0,
            billed_local: 0,
            total_requests: 0,
            total_tokens: 0,
            paying_users: 0,
            active_users: 0,
            upstream_variable_cost: 0,
            channel_fixed_cost: 0,
            platform_fixed_cost: 0,
            total_estimated_cost: 0,
            cash_net_profit: 0,
            cash_net_margin: 0,
            billed_gross_profit: 0,
            billed_gross_margin: 0,
            billed_net_profit: 0,
            billed_net_margin: 0,
          },
          liability: {
            user_remaining_quota: 0,
            user_remaining_usd: 0,
            user_remaining_local: 0,
            subscription_remaining_quota: 0,
            subscription_remaining_usd: 0,
            subscription_remaining_local: 0,
            redeemed_quota: 0,
            redeemed_usd: 0,
            redeemed_local: 0,
            redeemed_count: 0,
            checkin_quota: 0,
            checkin_usd: 0,
            checkin_local: 0,
            checkin_count: 0,
          },
          daily_trend: [],
          channels: [],
          models: [],
          groups: [],
          payment_methods: [],
          recent_orders: [],
        },
      },
    })

    renderWithQuery(<ProfitAnalytics />)
    expect(await screen.findByText('Profit Analysis')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Cost model' })
    ).not.toBeInTheDocument()
  })
})

describe('MediaTraffic page', () => {
  it('renders media traffic summary, browses uploaded objects, and resets user traffic for root', async () => {
    const user = userEvent.setup()
    const mib = 1024 * 1024
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/api/data/media_traffic') {
        return {
          data: {
            success: true,
            message: '',
            data: {
              config: {
                enabled: true,
                is_ready: true,
                provider: 'aliyun-oss',
                region: 'oss-cn-hongkong',
                bucket: 'magi-media',
                retention_days: 3,
                max_file_size_mb: 200,
                default_daily_traffic_mb: 500,
                group_daily_bonus_mb: {},
                active_global_temp_bonus_mb: 0,
                temp_global_expires_at: 0,
                temp_global_note: '',
                traffic_date: '2026-11-26',
                reset_at: 1795708800,
              },
              summary: {
                days: 30,
                start_date: '2026-10-28',
                end_date: '2026-11-26',
                today_used_bytes: 256 * mib,
                yesterday_used_bytes: 128 * mib,
                today_upload_count: 5,
                today_active_users: 1,
                range_used_bytes: 512 * mib,
                range_upload_count: 10,
                range_active_users: 2,
                avg_daily_bytes: 17 * mib,
                peak_daily_bytes: 256 * mib,
                peak_date: '2026-11-26',
                active_objects_count: 4,
                active_objects_bytes: 64 * mib,
                ready_objects_count: 8,
                pending_objects_count: 1,
                aborted_objects_count: 1,
                active_overrides_count: 1,
                near_limit_users_count: 0,
              },
              daily_trend: [
                {
                  date: '2026-11-26',
                  used_bytes: 256 * mib,
                  upload_count: 5,
                  active_users: 1,
                },
              ],
              content_types: [
                {
                  category: 'image',
                  count: 8,
                  total_bytes: 64 * mib,
                  share_percent: 100,
                },
              ],
              top_users: [
                {
                  user_id: 9,
                  username: 'creator_a',
                  display_name: 'Creator A',
                  group: 'vip',
                  today_used_bytes: 256 * mib,
                  today_upload_count: 5,
                  effective_daily_bytes: 500 * mib,
                  today_usage_percent: 51.2,
                  range_used_bytes: 512 * mib,
                  range_upload_count: 10,
                  active_override_bytes: 0,
                  override_expires_at: 0,
                  override_note: '',
                },
              ],
            },
          },
        }
      }
      if (url === '/api/data/media_traffic/objects') {
        return {
          data: {
            success: true,
            message: '',
            data: {
              items: [
                {
                  id: 101,
                  user_id: 9,
                  username: 'creator_a',
                  display_name: 'Creator A',
                  group: 'vip',
                  object_key: 'media/hero.png',
                  file_name: 'hero.png',
                  content_type: 'image/png',
                  category: 'image',
                  size_bytes: 12 * mib,
                  status: 'ready',
                  traffic_date: '2026-11-26',
                  created_at: 1795632000,
                  expires_at: 1795891200,
                  expired: false,
                },
              ],
              total: 1,
              page: 1,
              page_size: 20,
            },
          },
        }
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, message: '', data: {} },
    })

    renderWithQuery(<MediaTraffic />)

    expect(await screen.findByText('creator_a')).toBeInTheDocument()
    expect(screen.getByText('Relay active')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reset today' }))
    await user.click(await screen.findByRole('button', { name: 'Reset today' }))
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/option/media_relay/usage/9/reset'
      )
    })

    await user.click(screen.getByRole('tab', { name: 'Uploaded objects' }))
    expect(await screen.findByText('hero.png')).toBeInTheDocument()
  })
})
