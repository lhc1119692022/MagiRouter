import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { CheckinCalendarCard } from '@/features/profile/components/checkin-calendar-card'
import { api } from '@/lib/api'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { CheckinSettingsSection } from '../checkin-settings-section'

vi.mock('../../components/settings-page-context', async (original) => ({
  ...(await original<
    typeof import('../../components/settings-page-context')
  >()),
  SettingsPageFormActions: (props: {
    onSave: () => void
    isSaveDisabled?: boolean
  }) => (
    <button
      type='button'
      disabled={props.isSaveDisabled}
      onClick={props.onSave}
    >
      Save check-in settings
    </button>
  ),
}))

beforeEach(() => {
  useSystemConfigStore.setState({
    currency: {
      quotaPerUnit: 500_000,
      quotaDisplayType: 'USD',
      usdExchangeRate: 1,
      customCurrencySymbol: '¤',
      customCurrencyExchangeRate: 1,
    },
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('saves decimal check-in rewards, allowed groups, and cumulative top-up upgrade rules', async () => {
  const user = userEvent.setup()
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/group') {
      return { data: { success: true, data: ['default', 'vip', 'svip'] } }
    }
    throw new Error(`Unexpected GET ${url}`)
  })
  const putSpy = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={client}>
      <CheckinSettingsSection
        defaultValues={{
          enabled: true,
          minQuota: 1000,
          maxQuota: 10000,
          allowedGroups: '[]',
          topUpUpgradeEnabled: false,
          topUpUpgradeRules: '[]',
        }}
      />
    </QueryClientProvider>
  )

  const minInput = screen.getByLabelText(/Minimum check-in reward/)
  const maxInput = screen.getByLabelText(/Maximum check-in reward/)
  await user.clear(minInput)
  await user.type(minInput, '0.01')
  await user.clear(maxInput)
  await user.type(maxInput, '0.05')

  const vipCheckbox = await screen.findByRole('checkbox', { name: 'vip' })
  await user.click(vipCheckbox)

  const upgradeSwitch = screen.getByRole('switch', {
    name: /Auto-upgrade user group by cumulative top-up/,
  })
  await user.click(upgradeSwitch)

  await user.click(screen.getByRole('button', { name: 'Add upgrade rule' }))
  const thresholdInput = screen.getByLabelText('Cumulative top-up ≥')
  await user.type(thresholdInput, '50.5')
  const targetSelect = screen.getByLabelText('Upgrade to user group')
  await user.selectOptions(targetSelect, 'vip')

  await user.click(
    screen.getByRole('button', { name: 'Save check-in settings' })
  )

  await waitFor(() => expect(putSpy).toHaveBeenCalled())
  const saved = Object.fromEntries(
    putSpy.mock.calls.map(([, body]) => {
      const payload = body as { key: string; value: string }
      return [payload.key, payload.value]
    })
  )
  expect(saved['checkin_setting.min_quota']).toBe('5000')
  expect(saved['checkin_setting.max_quota']).toBe('25000')
  expect(JSON.parse(saved['checkin_setting.allowed_groups'])).toEqual(['vip'])
  expect(saved['checkin_setting.topup_upgrade_enabled']).toBe('true')
  expect(JSON.parse(saved['checkin_setting.topup_upgrade_rules'])).toEqual([
    { threshold_amount: 50.5, target_group: 'vip' },
  ])
})

test('displays decimal check-in totals accurately on the profile check-in card', async () => {
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        enabled: true,
        eligible: true,
        stats: {
          checked_in_today: true,
          total_checkins: 3,
          total_quota: 625_000, // $1.25
          checkin_count: 1,
          records: [{ checkin_date: dateStr, quota_awarded: 625_000 }],
        },
      },
    },
  })

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={client}>
      <CheckinCalendarCard checkinEnabled />
    </QueryClientProvider>
  )

  expect(await screen.findByText(/\$1\.25/)).toBeVisible()
})
