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
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
  type CurrencyConfig,
} from '@/stores/system-config-store'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { QuotaSettingsSection } from '../quota-settings-section'

type RenderOptions = {
  QuotaForNewUser?: number
  QuotaForInviter?: number
  QuotaForInvitee?: number
  currency?: Partial<CurrencyConfig>
}

function renderQuotaSettings(options: RenderOptions = {}) {
  if (options.currency) {
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        ...options.currency,
      },
    })
  }

  function Fixture() {
    const [container, setContainer] = useState<HTMLDivElement | null>(null)
    return (
      <>
        <div ref={setContainer} />
        <SettingsPageProvider actionsContainer={container}>
          <QuotaSettingsSection
            defaultValues={{
              QuotaForNewUser: options.QuotaForNewUser ?? 0,
              QuotaForInviter: options.QuotaForInviter ?? 0,
              QuotaForInvitee: options.QuotaForInvitee ?? 0,
              TopUpLink: '',
              quota_setting: {
                enable_free_model_pre_consume: true,
                trust_quota_usd: 10,
                pre_consume_multiplier: 1,
              },
            }}
          />
        </SettingsPageProvider>
      </>
    )
  }

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createRouter({
    routeTree: createRootRoute({ component: Fixture }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
})

afterEach(() => {
  cleanup()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  vi.restoreAllMocks()
})

test('displays initial quota amounts in USD and saves edited decimal amounts as integer quota units', async () => {
  const user = userEvent.setup()
  renderQuotaSettings({
    QuotaForNewUser: 250_000,
    QuotaForInviter: 500_000,
    QuotaForInvitee: 0,
  })

  const newUserInput = await screen.findByRole('spinbutton', {
    name: 'New User Quota (USD)',
  })
  const inviterInput = screen.getByRole('spinbutton', {
    name: 'Inviter Reward (USD)',
  })
  const inviteeInput = screen.getByRole('spinbutton', {
    name: 'Invitee Reward (USD)',
  })

  expect(newUserInput).toHaveValue(0.5)
  expect(inviterInput).toHaveValue(1)
  expect(inviteeInput).toHaveValue(0)
  expect(
    screen.getByText(
      'Initial quota given to new users ($0.5, 250,000 raw quota)'
    )
  ).toBeVisible()

  await user.clear(newUserInput)
  await user.type(newUserInput, '1.25')
  await user.clear(inviteeInput)
  await user.type(inviteeInput, '0.5')

  expect(
    screen.getByText(
      'Initial quota given to new users ($1.25, 625,000 raw quota)'
    )
  ).toBeVisible()
  expect(
    screen.getByText('Quota given to invited users ($0.5, 250,000 raw quota)')
  ).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'QuotaForNewUser',
      value: 625_000,
    })
  )
  expect(api.put).toHaveBeenCalledWith('/api/option/', {
    key: 'QuotaForInvitee',
    value: 250_000,
  })
  expect(api.put).toHaveBeenCalledTimes(2)
})

test('converts CNY amounts using configured exchange rate and skips unchanged quota fields', async () => {
  const user = userEvent.setup()
  renderQuotaSettings({
    QuotaForNewUser: 250_000,
    currency: {
      quotaDisplayType: 'CNY',
      quotaPerUnit: 500_000,
      usdExchangeRate: 7,
    },
  })

  const newUserInput = await screen.findByRole('spinbutton', {
    name: 'New User Quota (CNY)',
  })
  expect(newUserInput).toHaveValue(3.5)

  const topUpInput = screen.getByRole('textbox', { name: 'Top-Up Link' })
  await user.type(topUpInput, 'https://pay.example.com')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'TopUpLink',
      value: 'https://pay.example.com',
    })
  )
  expect(api.put).toHaveBeenCalledTimes(1)
})

test('rejects fractional values in TOKENS mode and saves integer token quotas', async () => {
  const user = userEvent.setup()
  renderQuotaSettings({
    QuotaForNewUser: 250_000,
    currency: {
      quotaDisplayType: 'TOKENS',
      quotaPerUnit: 500_000,
    },
  })

  const newUserInput = await screen.findByRole('spinbutton', {
    name: 'New User Quota (Tokens)',
  })
  expect(newUserInput).toHaveValue(250_000)

  fireEvent.change(newUserInput, { target: { value: '0.5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() =>
    expect(newUserInput).toHaveAttribute('aria-invalid', 'true')
  )
  expect(screen.getByText('Enter a non-negative integer')).toBeInTheDocument()
  expect(api.put).not.toHaveBeenCalled()

  await user.clear(newUserInput)
  await user.type(newUserInput, '300000')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'QuotaForNewUser',
      value: 300_000,
    })
  )
})

test.each([
  { value: '', message: 'Please enter a valid number' },
  { value: '-0.5', message: 'Must be greater than or equal to 0' },
  { value: '0.0000001', message: 'Amount is smaller than 1 quota unit' },
])(
  'rejects invalid USD quota amount "$value" and blocks saving',
  async ({ value, message }) => {
    renderQuotaSettings()
    const input = await screen.findByRole('spinbutton', {
      name: 'New User Quota (USD)',
    })

    fireEvent.change(input, { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  }
)

test('updates quota labels and displayed values when currency display changes', async () => {
  renderQuotaSettings({
    QuotaForNewUser: 250_000,
  })

  expect(
    await screen.findByRole('spinbutton', { name: 'New User Quota (USD)' })
  ).toHaveValue(0.5)

  act(() => {
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CNY',
        usdExchangeRate: 7,
      },
    })
  })

  expect(
    await screen.findByRole('spinbutton', { name: 'New User Quota (CNY)' })
  ).toHaveValue(3.5)
})
