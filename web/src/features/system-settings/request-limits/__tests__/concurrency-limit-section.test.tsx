import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import {
  ConcurrencyLimitSection,
  type ConcurrencyLimitFormValues,
} from '../concurrency-limit-section'

const DEFAULT_VALUES: ConcurrencyLimitFormValues = {
  UserConcurrencyLimitEnabled: false,
  UserConcurrencyLimitDefault: 0,
  UserConcurrencyLimitGroup: '',
  UserConcurrencyLimitWaitTimeoutSeconds: 0,
  UserConcurrencyLimitMaxWaitExtra: 10,
  UserConcurrencyLimitSlotTTLSeconds: 900,
}

type FixtureProps = {
  defaultValues: ConcurrencyLimitFormValues
}

function ConcurrencyLimitFixture(props: FixtureProps) {
  const [actionsContainer, setActionsContainer] =
    useState<HTMLDivElement | null>(null)

  return (
    <>
      <div ref={setActionsContainer} />
      <SettingsPageProvider actionsContainer={actionsContainer}>
        <ConcurrencyLimitSection defaultValues={props.defaultValues} />
      </SettingsPageProvider>
    </>
  )
}

async function renderConcurrencyLimitSection(
  overrides: Partial<ConcurrencyLimitFormValues> = {}
): Promise<void> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const defaultValues: ConcurrencyLimitFormValues = {
    ...DEFAULT_VALUES,
    ...overrides,
  }

  render(
    <QueryClientProvider client={queryClient}>
      <ConcurrencyLimitFixture defaultValues={defaultValues} />
    </QueryClientProvider>
  )

  await screen.findByRole('button', { name: 'Save concurrency limits' })
}

describe('ConcurrencyLimitSection', () => {
  beforeEach(() => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        data: ['default', 'vip', 'premium'],
      },
    })
    vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  test('renders default visual mode values and priority description', async () => {
    await renderConcurrencyLimitSection()

    expect(
      screen.getByRole('switch', { name: 'Enable user concurrency limits' })
    ).not.toBeChecked()
    expect(
      screen.getByRole('spinbutton', {
        name: 'Default max concurrent requests',
      })
    ).toHaveValue(0)
    expect(
      screen.getByRole('spinbutton', { name: 'Queue wait timeout' })
    ).toHaveValue(0)
    expect(
      screen.getByRole('spinbutton', { name: 'Extra wait queue capacity' })
    ).toHaveValue(10)
    expect(
      screen.getByRole('spinbutton', { name: 'Slot lease TTL' })
    ).toHaveValue(900)
    expect(screen.getByRole('button', { name: 'JSON Mode' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add group' })).toBeVisible()
    expect(screen.getByPlaceholderText('Search group names...')).toBeVisible()
    expect(
      screen.getByText(
        'No group concurrency limits configured. Click "Add group" to get started.'
      )
    ).toBeVisible()
    expect(
      screen.queryByRole('textbox', { name: 'Group concurrency limits' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/Per-user override > Token group > User group > Default/)
    ).toBeVisible()
  })

  test('renders configured group limits in visual mode with formatted numbers and Unlimited', async () => {
    await renderConcurrencyLimitSection({
      UserConcurrencyLimitGroup: '{"default": 1000, "vip": 0}',
    })

    const defaultRow = screen.getByRole('row', { name: /default/ })
    expect(within(defaultRow).getByText('1,000')).toBeVisible()

    const vipRow = screen.getByRole('row', { name: /vip/ })
    expect(within(vipRow).getByText('Unlimited')).toBeVisible()
  })

  test('adds a group via dialog without submitting the outer settings form', async () => {
    const user = userEvent.setup()
    await renderConcurrencyLimitSection()

    await user.click(screen.getByRole('button', { name: 'Add group' }))

    const dialog = await screen.findByRole('dialog', {
      name: 'Add group concurrency limit',
    })
    expect(
      within(dialog).getByText(
        'Configure simultaneous request limit for a specific group.'
      )
    ).toBeVisible()

    await user.click(within(dialog).getByRole('button', { name: 'Add' }))
    expect(
      await within(dialog).findByText('Group name is required')
    ).toBeVisible()
    expect(api.put).not.toHaveBeenCalled()

    const groupSelect = within(dialog).getByRole('combobox', {
      name: 'Group Name',
    })
    await waitFor(() => expect(groupSelect).not.toBeDisabled())
    const maxConcurrencyInput = within(dialog).getByRole('spinbutton', {
      name: 'Max concurrency',
    })

    await user.click(groupSelect)
    await user.click(await screen.findByRole('option', { name: 'vip' }))
    await waitFor(() => expect(groupSelect).toHaveValue('vip'))
    fireEvent.change(maxConcurrencyInput, { target: { value: '100001' } })
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(maxConcurrencyInput).toHaveAttribute('aria-invalid', 'true')
    )
    expect(api.put).not.toHaveBeenCalled()

    fireEvent.change(maxConcurrencyInput, { target: { value: '20' } })
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(api.put).not.toHaveBeenCalled()

    const vipRow = screen.getByRole('row', { name: /vip/ })
    expect(within(vipRow).getByText('vip')).toBeVisible()
    expect(within(vipRow).getByText('20')).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: 'Save concurrency limits' })
    )

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'UserConcurrencyLimitGroup',
      value: '{\n  "vip": 20\n}',
    })
  })

  test('edits an existing group via row action and displays Unlimited for 0', async () => {
    const user = userEvent.setup()
    await renderConcurrencyLimitSection({
      UserConcurrencyLimitGroup: '{"default": 5, "vip": 20}',
    })

    const defaultRow = screen.getByRole('row', { name: /default/ })
    await user.click(within(defaultRow).getByRole('button', { name: 'Edit' }))

    const dialog = await screen.findByRole('dialog', {
      name: 'Edit group concurrency limit',
    })
    const groupSelect = within(dialog).getByRole('combobox', {
      name: 'Group Name',
    })
    expect(groupSelect).toHaveValue('default')
    expect(groupSelect).toBeDisabled()
    expect(api.get).not.toHaveBeenCalled()

    const maxConcurrencyInput = within(dialog).getByRole('spinbutton', {
      name: 'Max concurrency',
    })
    expect(maxConcurrencyInput).toHaveValue(5)

    fireEvent.change(maxConcurrencyInput, { target: { value: '0' } })
    await user.click(within(dialog).getByRole('button', { name: 'Update' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(api.put).not.toHaveBeenCalled()

    const updatedRow = screen.getByRole('row', { name: /default/ })
    expect(within(updatedRow).getByText('Unlimited')).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: 'Save concurrency limits' })
    )

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'UserConcurrencyLimitGroup',
      value: '{\n  "default": 0,\n  "vip": 20\n}',
    })
  })

  test('marks already configured groups as disabled in the group dropdown', async () => {
    const user = userEvent.setup()
    await renderConcurrencyLimitSection({
      UserConcurrencyLimitGroup: '{"vip": 20}',
    })

    await user.click(screen.getByRole('button', { name: 'Add group' }))

    const dialog = await screen.findByRole('dialog', {
      name: 'Add group concurrency limit',
    })
    const groupSelect = within(dialog).getByRole('combobox', {
      name: 'Group Name',
    })
    await waitFor(() => expect(groupSelect).not.toBeDisabled())

    await user.click(groupSelect)
    const configuredOption = await screen.findByRole('option', {
      name: /vip/i,
    })
    expect(configuredOption).toHaveAttribute('aria-disabled', 'true')
    expect(within(configuredOption).getByText('Configured')).toBeVisible()

    const availableOption = screen.getByRole('option', { name: 'premium' })
    expect(availableOption).not.toHaveAttribute('aria-disabled', 'true')
    await user.click(availableOption)
    await waitFor(() => expect(groupSelect).toHaveValue('premium'))
  })

  test('deletes a group via row action menu and saves empty object when last removed', async () => {
    const user = userEvent.setup()
    await renderConcurrencyLimitSection({
      UserConcurrencyLimitGroup: '{"vip": 10}',
    })

    const vipRow = screen.getByRole('row', { name: /vip/ })
    await user.click(within(vipRow).getByRole('button', { name: 'Open menu' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    expect(screen.queryByRole('row', { name: /vip/ })).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'No group concurrency limits configured. Click "Add group" to get started.'
      )
    ).toBeVisible()
    expect(api.put).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', { name: 'Save concurrency limits' })
    )

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'UserConcurrencyLimitGroup',
      value: '{}',
    })
  })

  test('filters configured groups by search text', async () => {
    const user = userEvent.setup()
    await renderConcurrencyLimitSection({
      UserConcurrencyLimitGroup: '{"default": 5, "vip": 20, "enterprise": 100}',
    })

    const searchInput = screen.getByPlaceholderText('Search group names...')
    await user.type(searchInput, 'VIP')

    expect(screen.getByRole('row', { name: /vip/ })).toBeVisible()
    expect(
      screen.queryByRole('row', { name: /default/ })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('row', { name: /enterprise/ })
    ).not.toBeInTheDocument()

    await user.clear(searchInput)
    await user.type(searchInput, 'unknown')

    expect(screen.getByText('No groups match your search')).toBeVisible()
  })

  test.each([
    ['malformed JSON', '{invalid'],
    ['array JSON', '[]'],
    ['negative limit', '{"default": -1}'],
    ['limit above maximum', '{"default": 100001}'],
    ['non-integer limit', '{"default": 2.5}'],
    ['non-numeric limit', '{"default": "5"}'],
    ['empty group name', '{"": 5}'],
  ])(
    'rejects invalid group concurrency JSON (%s) and blocks saving',
    async (_label, invalidJson) => {
      const user = userEvent.setup()
      await renderConcurrencyLimitSection()

      await user.click(screen.getByRole('button', { name: 'JSON Mode' }))
      expect(screen.getByRole('button', { name: 'Visual Mode' })).toBeVisible()
      expect(
        screen.getByText(
          /Per-user override > Token group > User group > Default/
        )
      ).toBeVisible()

      const editor = screen.getByRole('textbox', {
        name: 'Group concurrency limits',
      })
      fireEvent.input(editor, { target: { value: invalidJson } })

      await user.click(
        screen.getByRole('button', { name: 'Save concurrency limits' })
      )

      await waitFor(() =>
        expect(editor).toHaveAttribute('aria-invalid', 'true')
      )
      expect(
        screen.getByText('Invalid JSON format or values out of allowed range')
      ).toBeVisible()
      expect(api.put).not.toHaveBeenCalled()
    }
  )

  test('preserves invalid JSON and keeps validation error when toggling to Visual Mode', async () => {
    const user = userEvent.setup()
    await renderConcurrencyLimitSection()

    await user.click(screen.getByRole('button', { name: 'JSON Mode' }))
    const editor = screen.getByRole('textbox', {
      name: 'Group concurrency limits',
    })
    fireEvent.input(editor, { target: { value: '{invalid' } })

    expect(
      await screen.findByText(
        'Invalid JSON format or values out of allowed range'
      )
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Visual Mode' }))
    expect(
      screen.getByText('Invalid JSON format or values out of allowed range')
    ).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: 'Save concurrency limits' })
    )
    expect(api.put).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'JSON Mode' }))
    expect(
      screen.getByRole('textbox', { name: 'Group concurrency limits' })
    ).toHaveValue('{invalid')
  })

  test.each([
    ['Default max concurrent requests', '-1'],
    ['Default max concurrent requests', '100001'],
    ['Default max concurrent requests', '1.5'],
    ['Queue wait timeout', '-1'],
    ['Queue wait timeout', '301'],
    ['Extra wait queue capacity', '-1'],
    ['Extra wait queue capacity', '1001'],
    ['Slot lease TTL', '29'],
    ['Slot lease TTL', '7201'],
  ])(
    'rejects out-of-range or non-integer value for %s (%s)',
    async (fieldLabel, invalidValue) => {
      const user = userEvent.setup()
      await renderConcurrencyLimitSection()

      const input = screen.getByRole('spinbutton', { name: fieldLabel })
      fireEvent.change(input, { target: { value: invalidValue } })

      await user.click(
        screen.getByRole('button', { name: 'Save concurrency limits' })
      )

      await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
      expect(api.put).not.toHaveBeenCalled()
    }
  )

  test('submits only changed options via updateOption in JSON mode', async () => {
    const user = userEvent.setup()
    await renderConcurrencyLimitSection()

    await user.click(
      screen.getByRole('switch', { name: 'Enable user concurrency limits' })
    )
    fireEvent.change(
      screen.getByRole('spinbutton', {
        name: 'Default max concurrent requests',
      }),
      { target: { value: '8' } }
    )
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Queue wait timeout' }),
      { target: { value: '15' } }
    )
    await user.click(screen.getByRole('button', { name: 'JSON Mode' }))
    fireEvent.input(
      screen.getByRole('textbox', { name: 'Group concurrency limits' }),
      { target: { value: '{"default": 5, "vip": 20}' } }
    )

    await user.click(
      screen.getByRole('button', { name: 'Save concurrency limits' })
    )

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(4))
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'UserConcurrencyLimitEnabled',
      value: true,
    })
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'UserConcurrencyLimitDefault',
      value: 8,
    })
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'UserConcurrencyLimitWaitTimeoutSeconds',
      value: 15,
    })
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'UserConcurrencyLimitGroup',
      value: '{"default": 5, "vip": 20}',
    })
  })

  test('does not send updates when no fields changed', async () => {
    const user = userEvent.setup()
    await renderConcurrencyLimitSection({
      UserConcurrencyLimitEnabled: true,
      UserConcurrencyLimitDefault: 4,
      UserConcurrencyLimitGroup: '{"vip": 10}',
    })

    await user.click(
      screen.getByRole('button', { name: 'Save concurrency limits' })
    )

    await waitFor(() => expect(api.put).not.toHaveBeenCalled())
  })
})
