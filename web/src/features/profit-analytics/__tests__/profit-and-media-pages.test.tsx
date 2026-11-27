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
import {
  computeQuickCostMetrics,
  formatEditableDecimal,
  formatSignedDecimal,
} from '../lib/cost-calc'

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
    const getSpy = vi.spyOn(api, 'get').mockImplementation(async (url) => {
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
              pricing_ref: {
                default_group_ratio: 1,
                group_ratios: { default: 1, vip: 1.2 },
              },
              cost_settings: {
                exclude_admin_users: true,
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
                exclude_admin_users: true,
                excluded_admin_count: 2,
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
                  suggested_group_ratio: 1.2,
                  variable_cost: 42,
                  monthly_fixed_cost: 0,
                  amortized_fixed_cost: 0,
                  gross_profit: 28,
                  net_profit: 28,
                  margin_rate: 40,
                  note: 'API relay',
                },
                {
                  channel_id: 8,
                  channel_name: 'Flux Per-Image',
                  channel_type: 1,
                  group: 'default',
                  tag: '',
                  status: 1,
                  balance: 0,
                  requests: 100,
                  tokens: 0,
                  billed_quota: 100000,
                  billed_usd: 0.2,
                  billed_local: 2.5,
                  cost_ratio: 0.5,
                  custom_cost_ratio: false,
                  suggested_group_ratio: 1,
                  suggested_unit_price: 0.025,
                  suggested_unit_price_model: 'flux-pro',
                  variable_cost: 1.25,
                  monthly_fixed_cost: 0,
                  amortized_fixed_cost: 0,
                  gross_profit: 1.25,
                  net_profit: 1.25,
                  margin_rate: 50,
                  note: '',
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
          exclude_admin_users: true,
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
    expect(screen.getByText('Admins excluded (2)')).toBeInTheDocument()

    // Toggle admin exclusion switch on the toolbar -> triggers refetch with exclude_admins: false.
    const excludeSwitch = screen.getByRole('switch', {
      name: 'Exclude admins',
    })
    expect(excludeSwitch).toBeChecked()
    await user.click(excludeSwitch)
    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith('/api/data/profit', {
        params: { days: 30, order_limit: 50, exclude_admins: false },
      })
    })

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
        expect.objectContaining({
          exclude_admin_users: true,
          default_cost_ratio: 0.4,
        })
      )
    })
  })

  it('auto-fills platform ratio & unit price and computes quick cost ratios in settings dialog', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'get').mockResolvedValue({
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
          pricing_ref: {
            default_group_ratio: 1,
            group_ratios: { default: 1, vip: 1.2 },
          },
          cost_settings: {
            exclude_admin_users: true,
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
            exclude_admin_users: true,
            excluded_admin_count: 1,
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
              cost_ratio: 0.5,
              custom_cost_ratio: false,
              suggested_group_ratio: 1.2,
              variable_cost: 35,
              monthly_fixed_cost: 0,
              amortized_fixed_cost: 0,
              gross_profit: 35,
              net_profit: 35,
              margin_rate: 50,
              note: '',
            },
            {
              channel_id: 8,
              channel_name: 'Flux Per-Image',
              channel_type: 1,
              group: 'default',
              tag: '',
              status: 1,
              balance: 0,
              requests: 100,
              tokens: 0,
              billed_quota: 100000,
              billed_usd: 0.2,
              billed_local: 2.5,
              cost_ratio: 0.5,
              custom_cost_ratio: false,
              suggested_group_ratio: 1,
              suggested_unit_price: 0.025,
              suggested_unit_price_model: 'flux-pro',
              variable_cost: 1.25,
              monthly_fixed_cost: 0,
              amortized_fixed_cost: 0,
              gross_profit: 1.25,
              net_profit: 1.25,
              margin_rate: 50,
              note: '',
            },
          ],
          models: [],
          groups: [],
          payment_methods: [],
          recent_orders: [],
        },
      },
    })

    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: {
          exclude_admin_users: false,
          default_cost_ratio: 0.8,
          payment_fee_rate: 0,
          payment_fee_rates: {},
          channel_costs: {},
          extra_fixed_costs: [],
        },
      },
    })

    renderWithQuery(<ProfitAnalytics />)
    expect(await screen.findByText('OpenAI Relay')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cost model' }))

    // Default quick calculator auto-fills default group ratio (1), typing 0.8 fills default cost ratio to 80%.
    const defaultQuickPlatform =
      await screen.findByLabelText('My ratio / price')
    expect(defaultQuickPlatform).toHaveValue(1)
    const defaultQuickUpstream = screen.getByLabelText('Upstream ratio / price')
    await user.type(defaultQuickUpstream, '0.8')
    expect(
      screen.getByLabelText('Default upstream cost ratio (%)')
    ).toHaveValue(80)

    // Switch OpenAI Relay to By ratio -> My ratio auto-fills 1.2 from group vip.
    const ratioButtons = screen.getAllByRole('button', { name: 'By ratio' })
    await user.click(ratioButtons[0])
    const relayPlatformInput = screen.getByLabelText('OpenAI Relay My ratio')
    expect(relayPlatformInput).toHaveValue(1.2)
    await user.type(
      screen.getByLabelText('OpenAI Relay Upstream ratio'),
      '0.72'
    )

    // Switch Flux Per-Image to Unit price -> My unit price auto-fills 0.025 from model price.
    const unitPriceButtons = screen.getAllByRole('button', {
      name: 'Unit price',
    })
    await user.click(unitPriceButtons[1])
    const imagePlatformInput = screen.getByLabelText(
      'Flux Per-Image My unit price'
    )
    expect(imagePlatformInput).toHaveValue(0.025)
    await user.type(
      screen.getByLabelText('Flux Per-Image Upstream unit price'),
      '0.02'
    )

    // Toggle persistent Exclude admin accounts by default off.
    await user.click(
      screen.getByRole('switch', { name: 'Exclude admin accounts by default' })
    )

    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/option/profit_analytics',
        expect.objectContaining({
          exclude_admin_users: false,
          default_cost_ratio: 0.8,
          channel_costs: {
            '7': expect.objectContaining({
              cost_ratio: 0.6,
              pricing_mode: 'ratio',
              upstream_value: 0.72,
              platform_value: 1.2,
            }),
            '8': expect.objectContaining({
              cost_ratio: 0.8,
              pricing_mode: 'unit_price',
              upstream_value: 0.02,
              platform_value: 0.025,
            }),
          },
        })
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
            exclude_admin_users: true,
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
            exclude_admin_users: true,
            excluded_admin_count: 1,
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
          orphaned_deleted_users: {
            user_count: 1,
            topup_orders: 1,
            completed_topup_orders: 1,
            completed_topup_money: 1,
            subscription_orders: 0,
            completed_subscription_orders: 0,
            completed_subscription_money: 0,
            quota_data_records: 1,
            quota_data_requests: 2,
            billed_quota: 10000,
            billed_usd: 0.02,
            billed_local: 0.02,
            user_subscriptions: 0,
            used_redemptions: 0,
            checkins: 0,
            total_records: 2,
          },
        },
      },
    })

    renderWithQuery(<ProfitAnalytics />)
    expect(await screen.findByText('Profit Analysis')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Cost model' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Review & clean up' })
    ).not.toBeInTheDocument()
  })

  it('surfaces deleted-user residual records and lets root review and clean up a deleted user from orders', async () => {
    const user = userEvent.setup()
    const getSpy = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/api/data/profit') {
        return {
          data: {
            success: true,
            message: '',
            data: {
              currency: {
                quota_per_unit: 500000,
                display_type: 'USD',
                symbol: '$',
                usd_exchange_rate: 1,
                usd_to_currency_rate: 1,
                topup_price: 1,
              },
              cost_settings: {
                exclude_admin_users: true,
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
                exclude_admin_users: true,
                excluded_admin_count: 1,
                cash_revenue: 1,
                wallet_topup_money: 1,
                wallet_topup_orders: 1,
                subscription_direct_money: 0,
                subscription_direct_orders: 0,
                subscription_balance_money: 0,
                subscription_balance_orders: 0,
                payment_fee_cost: 0,
                net_cash_inflow: 1,
                billed_quota: 10000,
                billed_usd: 0.02,
                billed_local: 0.02,
                total_requests: 2,
                total_tokens: 64000,
                paying_users: 1,
                active_users: 1,
                upstream_variable_cost: 0.01,
                channel_fixed_cost: 0,
                platform_fixed_cost: 0,
                total_estimated_cost: 0.01,
                cash_net_profit: 0.99,
                cash_net_margin: 99,
                billed_gross_profit: 0.01,
                billed_gross_margin: 50,
                billed_net_profit: 0.01,
                billed_net_margin: 50,
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
              orphaned_deleted_users: {
                user_count: 1,
                topup_orders: 1,
                completed_topup_orders: 1,
                completed_topup_money: 1,
                subscription_orders: 0,
                completed_subscription_orders: 0,
                completed_subscription_money: 0,
                quota_data_records: 1,
                quota_data_requests: 2,
                billed_quota: 10000,
                billed_usd: 0.02,
                billed_local: 0.02,
                user_subscriptions: 0,
                used_redemptions: 0,
                checkins: 0,
                total_records: 2,
              },
              daily_trend: [],
              channels: [
                {
                  channel_id: 6,
                  channel_name: '#6',
                  channel_type: 0,
                  group: '',
                  tag: '',
                  status: 0,
                  channel_deleted: true,
                  balance: 0,
                  requests: 2,
                  tokens: 64000,
                  billed_quota: 10000,
                  billed_usd: 0.02,
                  billed_local: 0.02,
                  cost_ratio: 0.5,
                  custom_cost_ratio: false,
                  suggested_group_ratio: 1,
                  variable_cost: 0.01,
                  monthly_fixed_cost: 0,
                  amortized_fixed_cost: 0,
                  gross_profit: 0.01,
                  net_profit: 0.01,
                  margin_rate: 50,
                  note: '',
                },
              ],
              models: [],
              groups: [],
              payment_methods: [],
              recent_orders: [
                {
                  order_type: 'topup',
                  trade_no: 'TOPUP-DEL-1',
                  user_id: 42,
                  username: 'ghost_user',
                  display_name: '',
                  user_deleted: true,
                  payment_method: 'alipay',
                  payment_provider: 'epay',
                  money: 1,
                  amount: 1,
                  completed_at: 1702500000,
                  is_internal: false,
                },
              ],
            },
          },
        }
      }
      if (url === '/api/data/profit/deleted-user-records') {
        return {
          data: {
            success: true,
            message: '',
            data: {
              currency: {
                quota_per_unit: 500000,
                display_type: 'USD',
                symbol: '$',
                usd_exchange_rate: 1,
                usd_to_currency_rate: 1,
                topup_price: 1,
              },
              summary: {
                user_count: 1,
                topup_orders: 1,
                completed_topup_orders: 1,
                completed_topup_money: 1,
                subscription_orders: 0,
                completed_subscription_orders: 0,
                completed_subscription_money: 0,
                quota_data_records: 1,
                quota_data_requests: 2,
                billed_quota: 10000,
                billed_usd: 0.02,
                billed_local: 0.02,
                user_subscriptions: 0,
                used_redemptions: 0,
                checkins: 0,
                total_records: 2,
              },
              users: [
                {
                  user_id: 42,
                  username: 'ghost_user',
                  display_name: '',
                  soft_deleted: false,
                  topup_orders: 1,
                  completed_topup_orders: 1,
                  completed_topup_money: 1,
                  subscription_orders: 0,
                  completed_subscription_orders: 0,
                  completed_subscription_money: 0,
                  quota_data_records: 1,
                  quota_data_requests: 2,
                  billed_quota: 10000,
                  billed_local: 0.02,
                  user_subscriptions: 0,
                  used_redemptions: 0,
                  checkins: 0,
                  total_records: 2,
                  latest_activity_at: 1702500000,
                },
              ],
            },
          },
        }
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: {
          target_user_id: 42,
          topups_deleted: 1,
          subscription_orders_deleted: 0,
          quota_data_deleted: 1,
          user_subscriptions_deleted: 0,
          used_redemptions_deleted: 0,
          checkins_deleted: 0,
          total_deleted: 2,
        },
      },
    })

    renderWithQuery(<ProfitAnalytics />)

    expect(
      await screen.findByText('Residual records from deleted users detected')
    ).toBeInTheDocument()
    expect(screen.getByText('Deleted channel')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Payments & orders/ }))
    expect(await screen.findByText('TOPUP-DEL-1')).toBeInTheDocument()
    expect(screen.getByText('Deleted user')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clean up' }))
    const scopeSelect = await screen.findByLabelText('Cleanup scope')
    expect(scopeSelect).toHaveValue('42')

    await user.click(
      screen.getByRole('button', { name: 'Clean up selected (2)' })
    )

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/data/profit/deleted-user-records/cleanup',
        {
          user_id: 42,
          include_topups: true,
          include_subscription_orders: true,
          include_quota_data: true,
          include_user_subscriptions: true,
          include_used_redemptions: true,
          include_checkins: true,
        }
      )
    })
    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith(
        '/api/data/profit/deleted-user-records'
      )
    })
  })
})

describe('profit cost quick calculator utilities', () => {
  it('computes ratio spread, cent/milli markups, and loss margins cleanly', () => {
    expect(computeQuickCostMetrics('0.5', '0.6')).toEqual({
      costRatio: 0.833333,
      costRatioPercent: 83.33,
      grossMarginPercent: 16.67,
      spread: 0.1,
    })
    expect(computeQuickCostMetrics('0.02', '0.025')).toEqual({
      costRatio: 0.8,
      costRatioPercent: 80,
      grossMarginPercent: 20,
      spread: 0.005,
    })
    expect(computeQuickCostMetrics('0.02', '0.023')).toEqual({
      costRatio: 0.869565,
      costRatioPercent: 86.96,
      grossMarginPercent: 13.04,
      spread: 0.003,
    })
    expect(computeQuickCostMetrics('1.2', '1')).toEqual({
      costRatio: 1.2,
      costRatioPercent: 120,
      grossMarginPercent: -20,
      spread: -0.2,
    })
    expect(computeQuickCostMetrics('0.5', '0')).toBeNull()
    expect(formatEditableDecimal(0.0005)).toBe('0.0005')
    expect(formatSignedDecimal(0.005)).toBe('+0.005')
    expect(formatSignedDecimal(-0.002)).toBe('-0.002')
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

  it('displays auto-derived channel upstream ratio in profit analytics and preserves auto mode in cost settings', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: {
          currency: {
            quota_per_unit: 500000,
            display_type: 'USD',
            symbol: '$',
            usd_exchange_rate: 1,
            usd_to_currency_rate: 1,
            topup_price: 1,
          },
          pricing_ref: {
            default_group_ratio: 1.5,
            group_ratios: { default: 1.5 },
          },
          cost_settings: {
            exclude_admin_users: true,
            default_cost_ratio: 0.5,
            payment_fee_rate: 0,
            payment_fee_rates: {},
            channel_costs: {},
            extra_fixed_costs: [],
          },
          summary: {
            range_days: 30,
            start_time: 1793000000,
            end_time: 1795600000,
            exclude_admin_users: true,
            excluded_admin_count: 1,
            wallet_topup_money: 100,
            wallet_topup_orders: 1,
            subscription_direct_money: 0,
            subscription_direct_orders: 0,
            subscription_balance_money: 0,
            subscription_balance_count: 0,
            cash_revenue: 100,
            payment_fee_cost: 0,
            net_cash_inflow: 100,
            billed_quota: 7500000,
            billed_usd: 15,
            billed_local: 15,
            upstream_variable_cost: 6,
            channel_fixed_cost: 0,
            platform_fixed_cost: 0,
            total_fixed_cost: 0,
            total_cost: 6,
            billed_gross_profit: 9,
            billed_net_profit: 9,
            billed_margin_rate: 60,
            cash_net_profit: 94,
            cash_margin_rate: 94,
            outstanding_wallet_quota: 0,
            outstanding_wallet_local: 0,
            outstanding_sub_quota: 0,
            outstanding_sub_local: 0,
            total_requests: 10,
            total_tokens: 1000,
            active_users: 1,
            paying_users: 1,
            redemption_quota: 0,
            redemption_local: 0,
            redemption_count: 0,
            checkin_quota: 0,
            checkin_local: 0,
            checkin_count: 0,
          },
          orphaned_deleted_users: {
            user_count: 0,
            topup_orders: 0,
            completed_topup_orders: 0,
            completed_topup_money: 0,
            subscription_orders: 0,
            completed_subscription_orders: 0,
            completed_subscription_money: 0,
            quota_data_records: 0,
            quota_data_requests: 0,
            billed_quota: 0,
            billed_usd: 0,
            billed_local: 0,
            user_subscriptions: 0,
            used_redemptions: 0,
            checkins: 0,
            total_records: 0,
          },
          daily_trend: [],
          channels: [
            {
              channel_id: 9,
              channel_name: 'Auto Channel',
              channel_type: 1,
              group: 'default',
              tag: '',
              status: 1,
              balance: 0,
              requests: 10,
              tokens: 1000,
              billed_quota: 7500000,
              billed_usd: 15,
              billed_local: 15,
              cost_ratio: 0.4,
              custom_cost_ratio: false,
              cost_source: 'channel',
              pricing_mode: 'ratio',
              upstream_value: 0.6,
              platform_value: 1.5,
              channel_upstream_ratio: 0.6,
              channel_upstream_group: 'vip',
              suggested_group_ratio: 1.5,
              variable_cost: 6,
              monthly_fixed_cost: 0,
              amortized_fixed_cost: 0,
              gross_profit: 9,
              net_profit: 9,
              margin_rate: 60,
              note: '',
            },
          ],
          models: [],
          groups: [],
          payment_methods: [],
          recent_orders: [],
        },
      },
    })

    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({
      data: { success: true, message: '', data: {} },
    })

    renderWithQuery(<ProfitAnalytics />)

    expect(await screen.findByText('Auto Channel')).toBeInTheDocument()
    expect(screen.getByText('Auto from channel')).toBeInTheDocument()
    expect(screen.getByText('0.6 / 1.5')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cost model' }))
    expect(
      await screen.findByText(/Channel upstream ratio 0\.6/)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(putSpy).toHaveBeenCalled())
    const savedPayload = putSpy.mock.calls[0][1] as {
      channel_costs: Record<string, unknown>
    }
    expect(savedPayload.channel_costs).toEqual({})
  })
})
