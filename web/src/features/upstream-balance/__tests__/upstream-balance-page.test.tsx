import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { UpstreamBalance } from '../index'
import type { UpstreamBalanceOverview } from '../types'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    children?: ReactNode
    to?: string
    [key: string]: unknown
  }) => {
    const { children, to, ...rest } = props
    return (
      <a href={to ?? '#'} {...rest}>
        {children}
      </a>
    )
  },
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

function buildOverviewFixture(): UpstreamBalanceOverview {
  return {
    settings: {
      enabled: true,
      check_interval_minutes: 30,
      alert_cooldown_minutes: 1440,
      notify_emails: 'ops@example.com',
      default_min_balance_cny: 50,
      default_min_percent: 20,
      sites: {
        'https://relay-a.example.com': {
          name: 'Relay A',
          provider_type: 'new_api',
          cny_rate: 2,
          has_access_token: false,
        },
      },
      channels: {},
    },
    meta: {
      default_usd_exchange_rate: 7.3,
      email_configured: true,
      server_address: 'https://router.example.com',
      last_checked_at: 1795669427,
      skipped_channels_count: 1,
    },
    summary: {
      total_sites: 2,
      monitored_sites: 1,
      low_sites: 0,
      error_sites: 0,
      unconfigured_sites: 1,
      ignored_sites: 0,
      total_channels: 3,
      limited_channels: 1,
      low_channels: 1,
      total_balance_cny: 200,
      total_balance_usd: 100,
    },
    sites: [
      {
        site_key: 'https://relay-a.example.com',
        display_name: 'Relay A',
        effective_provider: 'new_api',
        inferred_provider: '',
        effective_cny_rate: 2,
        custom_cny_rate: true,
        config: {
          name: 'Relay A',
          provider_type: 'new_api',
          cny_rate: 2,
        },
        effective_alert_enabled: true,
        effective_min_balance_cny: 50,
        effective_min_percent: 20,
        enabled_channel_count: 2,
        limited_channel_count: 1,
        low_channel_count: 1,
        snapshot: {
          site_key: 'https://relay-a.example.com',
          provider_type: 'new_api',
          status: 'ok',
          balance_source: 'token_user_quota',
          balance_usd: 100,
          used_usd: 400,
          total_usd: 500,
          balance_cny: 200,
          total_cny: 1000,
          remaining_percent: 20,
          percent_source: 'account_total',
          currency_rate: 2,
          checked_at: 1795669427,
        },
        channels: [
          {
            channel_id: 1,
            channel_name: 'Relay A OpenAI',
            channel_type: 1,
            channel_type_name: 'OpenAI',
            channel_status: 1,
            group: 'default',
            tag: '',
            base_url: 'https://relay-a.example.com/v1',
            is_multi_key: false,
            key_count: 1,
            effective_provider: 'new_api',
            config: {},
            effective_alert_enabled: true,
            effective_min_balance_cny: 50,
            effective_min_percent: 20,
            snapshot: {
              channel_id: 1,
              site_key: 'https://relay-a.example.com',
              provider_type: 'new_api',
              status: 'follows_site',
              has_independent_limit: false,
              follows_site_balance: true,
              unlimited: true,
              checked_at: 1795669427,
            },
          },
          {
            channel_id: 2,
            channel_name: 'Relay A Claude Limited',
            channel_type: 14,
            channel_type_name: 'Anthropic',
            channel_status: 1,
            group: 'default',
            tag: '',
            base_url: 'https://relay-a.example.com',
            is_multi_key: false,
            key_count: 1,
            effective_provider: 'new_api',
            config: {},
            effective_alert_enabled: true,
            effective_min_balance_cny: 50,
            effective_min_percent: 20,
            snapshot: {
              channel_id: 2,
              site_key: 'https://relay-a.example.com',
              provider_type: 'new_api',
              status: 'low',
              has_independent_limit: true,
              follows_site_balance: false,
              balance_usd: 5,
              total_usd: 50,
              balance_cny: 10,
              total_cny: 100,
              remaining_percent: 10,
              percent_source: 'token_total',
              checked_at: 1795669427,
              alert_reasons: ['amount', 'percent'],
            },
          },
        ],
      },
      {
        site_key: 'https://sub2-b.example.com',
        display_name: 'sub2-b.example.com',
        effective_provider: '',
        inferred_provider: '',
        effective_cny_rate: 7.3,
        custom_cny_rate: false,
        config: {
          name: '',
          provider_type: 'auto',
        },
        effective_alert_enabled: true,
        effective_min_balance_cny: 50,
        effective_min_percent: 20,
        enabled_channel_count: 1,
        limited_channel_count: 0,
        low_channel_count: 0,
        snapshot: {
          site_key: 'https://sub2-b.example.com',
          provider_type: '',
          status: 'unconfigured',
          currency_rate: 7.3,
        },
        channels: [
          {
            channel_id: 3,
            channel_name: 'Generic Claude',
            channel_type: 14,
            channel_type_name: 'Anthropic',
            channel_status: 1,
            group: 'default',
            tag: '',
            base_url: 'https://sub2-b.example.com',
            is_multi_key: false,
            key_count: 1,
            effective_provider: '',
            config: {},
            effective_alert_enabled: true,
            effective_min_balance_cny: 50,
            effective_min_percent: 20,
            snapshot: {
              channel_id: 3,
              site_key: 'https://sub2-b.example.com',
              provider_type: '',
              status: 'unconfigured',
              has_independent_limit: false,
              follows_site_balance: false,
            },
          },
        ],
      },
    ],
  }
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
})

describe('UpstreamBalance page', () => {
  it('displays site balance, channel independent limits, and supports quick provider setup', async () => {
    const user = userEvent.setup()
    const fixture = buildOverviewFixture()

    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, message: '', data: fixture },
    })
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({
      data: { success: true, message: '', data: fixture },
    })
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: {
          summary: {
            refreshed_sites: 1,
            refreshed_channels: 1,
            alerts_triggered: 0,
            alert_email_sent: false,
          },
          overview: fixture,
        },
      },
    })

    renderWithQuery(<UpstreamBalance />)

    expect(await screen.findByText('Relay A')).toBeInTheDocument()
    expect(screen.getAllByText('¥200.00').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Relay A OpenAI')).toBeInTheDocument()
    expect(screen.getByText('Relay A Claude Limited')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Set as Sub2API' }))

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/option/upstream_balance',
        expect.objectContaining({
          sites: expect.objectContaining({
            'https://sub2-b.example.com': expect.objectContaining({
              provider_type: 'sub2api',
            }),
          }),
        })
      )
    })

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/upstream_balance/refresh', {
        site_key: 'https://sub2-b.example.com',
        send_alerts: false,
      })
    })
  })

  it('lets root configure CNY/percentage thresholds and send a test alert email', async () => {
    const user = userEvent.setup()
    const fixture = buildOverviewFixture()

    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, message: '', data: fixture },
    })
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({
      data: { success: true, message: '', data: fixture },
    })
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, message: 'Test alert email sent', data: null },
    })

    renderWithQuery(<UpstreamBalance />)

    await screen.findByText('Relay A')
    await user.click(screen.getByRole('button', { name: 'Alert Settings' }))

    const minCnyInput = await screen.findByLabelText(
      'Default low-balance amount (CNY ¥)'
    )
    await user.clear(minCnyInput)
    await user.type(minCnyInput, '80')

    await user.click(screen.getByRole('button', { name: 'Send test email' }))
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/option/upstream_balance/test_email',
        { notify_emails: 'ops@example.com' }
      )
    })

    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/option/upstream_balance',
        expect.objectContaining({
          default_min_balance_cny: 80,
        })
      )
    })
  })

  it('hides root-only settings controls for standard admin users', async () => {
    useAuthStore.getState().auth.setUser({
      id: 2,
      username: 'admin',
      role: ROLE.ADMIN,
    })
    const fixture = buildOverviewFixture()
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, message: '', data: fixture },
    })

    renderWithQuery(<UpstreamBalance />)
    await screen.findByText('Relay A')

    expect(
      screen.getByRole('button', { name: 'Refresh all' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Alert Settings' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Set as Sub2API' })
    ).not.toBeInTheDocument()
  })

  it('accepts integer and decimal CNY exchange rates in the site config dialog', async () => {
    const user = userEvent.setup()
    const fixture = buildOverviewFixture()

    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, message: '', data: fixture },
    })
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({
      data: { success: true, message: '', data: fixture },
    })

    renderWithQuery(<UpstreamBalance />)

    await screen.findByText('Relay A')
    const configureButtons = screen.getAllByRole('button', {
      name: 'Configure',
    })
    await user.click(configureButtons[0])

    const rateInput = (await screen.findByLabelText(
      'CNY exchange rate (1 USD = ¥)'
    )) as HTMLInputElement
    expect(rateInput).toHaveAttribute('step', 'any')

    await user.clear(rateInput)
    await user.type(rateInput, '0.1')
    expect(rateInput.checkValidity()).toBe(true)
    expect(rateInput.validity.stepMismatch).toBe(false)

    await user.clear(rateInput)
    await user.type(rateInput, '0')
    expect(rateInput.checkValidity()).toBe(false)
    expect(rateInput.validity.rangeUnderflow).toBe(true)

    await user.clear(rateInput)
    await user.type(rateInput, '10')
    expect(rateInput.checkValidity()).toBe(true)
    expect(rateInput.validity.stepMismatch).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/option/upstream_balance',
        expect.objectContaining({
          sites: expect.objectContaining({
            'https://relay-a.example.com': expect.objectContaining({
              cny_rate: 10,
            }),
          }),
        })
      )
    })
  })
})
