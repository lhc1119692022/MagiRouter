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
import { zodResolver } from '@hookform/resolvers/zod'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { positiveIntegerSchema } from '../../utils/numeric-field'
import { GroupRatioForm } from '../group-ratio-form'
import { RatioSettingsCard } from '../ratio-settings-card'

const defaults = {
  GroupRatio: '{"default":1,"vip":0.8}',
  TopupGroupRatio: '{"vip":1.2}',
  UserUsableGroups: '{"default":"Standard access","vip":"Premium access"}',
  GroupGroupRatio: '{}',
  AutoGroups: '["default","vip"]',
  MaxTokenAutoGroups: 5,
  DefaultUseAutoGroup: false,
  GroupSpecialUsableGroup: '{}',
  UserManagementGroups: '{}',
}

const schema = z.object({
  GroupRatio: z.string(),
  TopupGroupRatio: z.string(),
  UserUsableGroups: z.string(),
  GroupGroupRatio: z.string(),
  AutoGroups: z.string(),
  MaxTokenAutoGroups: positiveIntegerSchema('Enter a positive integer'),
  DefaultUseAutoGroup: z.boolean(),
  GroupSpecialUsableGroup: z.string(),
  UserManagementGroups: z.string(),
})

const defaultModelDefaults = {
  ModelPrice: '{}',
  ModelRatio: '{}',
  CacheRatio: '{}',
  CreateCacheRatio: '{}',
  CompletionRatio: '{}',
  ImageRatio: '{}',
  AudioRatio: '{}',
  AudioCompletionRatio: '{}',
  ExposeRatioEnabled: false,
  BillingMode: '{}',
  BillingExpr: '{}',
  PluginBillingExpr: '{}',
}

function Fixture(props: {
  onSave?: (values: typeof defaults) => Promise<void>
  initial?: Partial<typeof defaults>
  isSaving?: boolean
}) {
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  const form = useForm({
    defaultValues: { ...defaults, ...props.initial },
    resolver: zodResolver(schema),
  })
  return (
    <SettingsPageProvider actionsContainer={actions}>
      <div ref={setActions} />
      <GroupRatioForm
        form={form}
        onSave={props.onSave ?? (async () => {})}
        isSaving={props.isSaving ?? false}
      />
    </SettingsPageProvider>
  )
}

function RatioCardFixture(props: {
  initial?: Partial<typeof defaults>
  queryClient: QueryClient
}) {
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  const groupDefaults = useMemo(
    () => ({ ...defaults, ...props.initial }),
    [props.initial]
  )
  return (
    <QueryClientProvider client={props.queryClient}>
      <SettingsPageProvider actionsContainer={actions}>
        <div ref={setActions} />
        <RatioSettingsCard
          modelDefaults={defaultModelDefaults}
          groupDefaults={groupDefaults}
          toolPricesDefault='{}'
          visibleTabs={['groups']}
        />
      </SettingsPageProvider>
    </QueryClientProvider>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('group settings workspace', () => {
  it('filters by description and clears search without discarding edits', async () => {
    const user = userEvent.setup()
    render(<Fixture />)
    const search = screen.getByRole('textbox', {
      name: 'Search groups by name or description',
    })
    await user.type(search, 'PREMIUM')
    expect(screen.getAllByRole('textbox', { name: 'Group name' })).toHaveLength(
      1
    )
    expect(screen.getByRole('textbox', { name: 'Group name' })).toHaveValue(
      'vip'
    )
    await user.clear(screen.getByRole('spinbutton', { name: 'Ratio' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Ratio' }), '0.6')
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getAllByRole('textbox', { name: 'Group name' })).toHaveLength(
      2
    )
    expect(screen.getAllByRole('spinbutton', { name: 'Ratio' })[1]).toHaveValue(
      0.6
    )
    await user.type(search, 'missing')
    expect(screen.getByText('No results found')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Add group' }))
    expect(search).toHaveValue('')
    expect(
      screen
        .getAllByRole<HTMLInputElement>('textbox', { name: 'Group name' })
        .map((input) => input.value)
    ).toEqual(['group_1', 'default', 'vip'])
    expect(screen.getAllByRole('spinbutton', { name: 'Ratio' })[2]).toHaveValue(
      0.6
    )
  })

  it('prepends consecutive new groups and saves them without changing existing settings', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (_values: typeof defaults) => {})
    render(<Fixture onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: 'Add group' }))
    await user.click(screen.getByRole('button', { name: 'Add group' }))
    expect(
      screen
        .getAllByRole<HTMLInputElement>('textbox', { name: 'Group name' })
        .map((input) => input.value)
    ).toEqual(['group_2', 'group_1', 'default', 'vip'])

    await user.click(
      screen.getByRole('button', { name: 'Save group settings' })
    )
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = onSave.mock.calls[0][0]
    expect(JSON.parse(saved.GroupRatio)).toEqual({
      group_2: 1,
      group_1: 1,
      default: 1,
      vip: 0.8,
    })
    expect(JSON.parse(saved.UserUsableGroups)).toEqual({
      group_2: '',
      group_1: '',
      default: 'Standard access',
      vip: 'Premium access',
    })
    expect(JSON.parse(saved.TopupGroupRatio)).toEqual({ vip: 1.2 })
    expect(saved.AutoGroups).toBe(defaults.AutoGroups)
  })

  it('keeps unfinished visibility rules while switching sections and supports keyboard tabs', async () => {
    const user = userEvent.setup()
    render(
      <Fixture
        initial={{
          GroupSpecialUsableGroup: '{"vip":{"+:default":"Standard"}}',
        }}
      />
    )
    const pricing = screen.getByRole('tab', { name: 'Pricing groups' })
    pricing.focus()
    await user.keyboard('{ArrowRight}{Enter}')
    expect(
      screen.getByRole('tab', { name: 'Special ratio rules' })
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.queryByRole('table', { name: 'Pricing groups' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Group visibility' }))
    await user.click(screen.getByRole('button', { name: 'Add rule' }))
    expect(
      screen.getAllByRole('combobox', { name: 'Group name' })
    ).toHaveLength(2)
    await user.click(pricing)
    await user.click(screen.getByRole('tab', { name: 'Group visibility' }))
    expect(
      screen.getAllByRole('combobox', { name: 'Group name' })
    ).toHaveLength(2)
    const toggle = screen.getByRole('button', { name: 'Rules for vip' })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(screen.getByRole('button', { name: 'Add rule' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('reorders and removes auto groups with named controls and saves across sections', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (_values: typeof defaults) => {})
    render(<Fixture onSave={onSave} />)
    await user.click(screen.getByRole('tab', { name: 'Auto group order' }))
    const list = screen.getByRole('list', { name: 'Auto group order' })
    expect(
      screen.getByRole('button', { name: 'Move default up' })
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move vip down' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Move vip up' }))
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('vip')
    await user.click(
      screen.getByRole('switch', { name: 'Default to auto groups' })
    )
    await user.click(screen.getByRole('button', { name: 'Remove default' }))
    expect(screen.getByRole('button', { name: 'Move vip up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move vip down' })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: 'Pricing groups' }))
    await user.click(
      screen.getByRole('button', { name: 'Save group settings' })
    )
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        AutoGroups: '[\n  "vip"\n]',
        DefaultUseAutoGroup: true,
      })
    )
  })

  it('reorders from the drag handle with arrow keys, preserves unknown groups and saves the new order', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (_values: typeof defaults) => {})
    render(
      <Fixture
        onSave={onSave}
        initial={{
          AutoGroups: '["default","vip","retired"]',
          MaxTokenAutoGroups: 1,
        }}
      />
    )
    await user.click(screen.getByRole('tab', { name: 'Auto group order' }))
    const list = screen.getByRole('list', { name: 'Auto group order' })
    const handle = screen.getByRole('button', {
      name: 'Drag default to reorder',
    })
    handle.focus()
    await user.keyboard('{ArrowUp}')
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent(
      'default'
    )
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(within(list).getAllByRole('listitem')[2]).toHaveTextContent(
      'default'
    )
    expect(handle).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent(
      'default'
    )
    expect(screen.getByText('Not in pricing table')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Pricing groups' }))
    await user.click(
      screen.getByRole('button', { name: 'Save group settings' })
    )
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(JSON.parse(onSave.mock.calls[0][0].AutoGroups)).toEqual([
      'vip',
      'default',
      'retired',
    ])
  })

  it('keeps a single auto group unchanged when using its drag handle keyboard controls', async () => {
    const user = userEvent.setup()
    render(<Fixture initial={{ AutoGroups: '["default"]' }} />)
    await user.click(screen.getByRole('tab', { name: 'Auto group order' }))
    const handle = screen.getByRole('button', {
      name: 'Drag default to reorder',
    })
    handle.focus()
    await user.keyboard('{ArrowUp}{ArrowDown}')
    const list = screen.getByRole('list', { name: 'Auto group order' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByRole('listitem')).toHaveTextContent('default')
    expect(handle).toHaveFocus()
    expect(
      screen.getByRole('button', { name: 'Move default up' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Move default down' })
    ).toBeDisabled()
  })

  it('opens the auto section and focuses its invalid limit when saving from another section', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (_values: typeof defaults) => {})
    render(<Fixture onSave={onSave} />)
    await user.click(screen.getByRole('tab', { name: 'Auto group order' }))
    fireEvent.change(
      screen.getByRole('spinbutton', {
        name: 'Maximum custom groups per token',
      }),
      { target: { value: '0' } }
    )
    await user.click(screen.getByRole('tab', { name: 'Pricing groups' }))
    await user.click(
      screen.getByRole('button', { name: 'Save group settings' })
    )
    await waitFor(() =>
      expect(
        screen.getByRole('tab', { name: 'Auto group order' })
      ).toHaveAttribute('aria-selected', 'true')
    )
    const input = screen.getByRole('spinbutton', {
      name: 'Maximum custom groups per token',
    })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(input).toHaveFocus())
    expect(screen.getByText('Enter a positive integer')).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows empty state guidance and disables save during a pending request', async () => {
    const user = userEvent.setup()
    render(
      <Fixture
        isSaving
        initial={{
          GroupRatio: '{}',
          TopupGroupRatio: '{}',
          UserUsableGroups: '{}',
          AutoGroups: '[]',
        }}
      />
    )
    expect(
      screen.getByText('No groups yet. Add a group to get started.')
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: 'Special ratio rules' }))
    expect(
      screen.getByText('Base group ratios apply until you add an override.')
    ).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Auto group order' }))
    expect(screen.getByText('No auto groups configured')).toBeVisible()
  })

  it('preserves pricing edits when switching between visual and JSON editors', async () => {
    const user = userEvent.setup()
    render(<Fixture />)
    await user.clear(
      screen.getAllByRole('textbox', { name: 'Group description' })[1]
    )
    await user.type(
      screen.getAllByRole('textbox', { name: 'Group description' })[1],
      'Updated description'
    )
    await user.click(screen.getByRole('button', { name: 'Switch to JSON' }))
    await user.click(screen.getByRole('button', { name: 'Switch to Visual' }))
    expect(
      screen.getAllByRole('textbox', { name: 'Group description' })[1]
    ).toHaveValue('Updated description')
  })

  it('toggles a group to user management only, updates serialized fields, and restores ratio and selectability when toggled back', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (_values: typeof defaults) => {})
    render(
      <Fixture
        onSave={onSave}
        initial={{
          GroupRatio: '{"default":1.5,"vip":0.8}',
          TopupGroupRatio: '{"default":1.1,"vip":1.2}',
        }}
      />
    )

    const defaultRow = screen.getByDisplayValue('default').closest('tr')
    expect(defaultRow).not.toBeNull()
    const rowScope = within(defaultRow as HTMLTableRowElement)

    expect(rowScope.getByRole('spinbutton', { name: 'Ratio' })).toHaveValue(1.5)
    expect(
      rowScope.getByRole('checkbox', { name: 'User selectable' })
    ).toBeChecked()
    expect(
      rowScope.getByRole('textbox', { name: 'Group description' })
    ).toHaveValue('Standard access')

    const userManagementCheckbox = rowScope.getByRole('checkbox', {
      name: 'User management only',
    })
    await user.click(userManagementCheckbox)

    expect(userManagementCheckbox).toBeChecked()
    expect(
      rowScope.queryByRole('spinbutton', { name: 'Ratio' })
    ).not.toBeInTheDocument()
    expect(
      rowScope.queryByRole('checkbox', { name: 'User selectable' })
    ).not.toBeInTheDocument()
    expect(
      rowScope.getByRole('spinbutton', { name: 'Top-up ratio' })
    ).toHaveValue(1.1)
    expect(
      rowScope.getByRole('textbox', { name: 'Group description' })
    ).toHaveValue('Standard access')

    await user.click(
      screen.getByRole('button', { name: 'Save group settings' })
    )
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const savedWhenUserManaged = onSave.mock.calls[0][0]
    expect(JSON.parse(savedWhenUserManaged.GroupRatio)).toEqual({ vip: 0.8 })
    expect(JSON.parse(savedWhenUserManaged.UserUsableGroups)).toEqual({
      vip: 'Premium access',
    })
    expect(JSON.parse(savedWhenUserManaged.TopupGroupRatio)).toEqual({
      default: 1.1,
      vip: 1.2,
    })
    expect(JSON.parse(savedWhenUserManaged.UserManagementGroups)).toEqual({
      default: 'Standard access',
    })

    await user.click(userManagementCheckbox)

    expect(userManagementCheckbox).not.toBeChecked()
    expect(rowScope.getByRole('spinbutton', { name: 'Ratio' })).toHaveValue(1.5)
    expect(
      rowScope.getByRole('checkbox', { name: 'User selectable' })
    ).toBeChecked()

    await user.click(
      screen.getByRole('button', { name: 'Save group settings' })
    )
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    const savedWhenRestored = onSave.mock.calls[1][0]
    expect(JSON.parse(savedWhenRestored.GroupRatio)).toEqual({
      default: 1.5,
      vip: 0.8,
    })
    expect(JSON.parse(savedWhenRestored.UserUsableGroups)).toEqual({
      default: 'Standard access',
      vip: 'Premium access',
    })
    expect(JSON.parse(savedWhenRestored.UserManagementGroups)).toEqual({})
  })

  it('treats user-management-only groups as user groups while excluding them from billing and auto targets', async () => {
    const user = userEvent.setup()
    render(
      <Fixture
        initial={{
          GroupRatio: '{"standard":1,"vip_line":0.8}',
          TopupGroupRatio: '{"default":1.1}',
          UserUsableGroups: '{"standard":"Standard access"}',
          UserManagementGroups:
            '{"default":"Default user tier","member":"Member tier"}',
          GroupGroupRatio: '{"standard":{"default":0.5}}',
          GroupSpecialUsableGroup:
            '{"default":{"+:vip_line":"VIP line"},"standard":{"+:default":"Legacy target"}}',
          AutoGroups: '["default","standard"]',
        }}
      />
    )

    const pricingTable = screen.getByRole('table', { name: 'Pricing groups' })
    const defaultRow = within(pricingTable)
      .getByDisplayValue('default')
      .closest('tr')
    expect(defaultRow).not.toBeNull()
    await user.click(
      within(defaultRow as HTMLTableRowElement).getByRole('button', {
        name: 'Details',
      })
    )
    const detailDialog = screen.getByRole('dialog')
    expect(within(detailDialog).getByText('User management only')).toBeVisible()
    expect(
      within(detailDialog).getByText('Effective billing groups')
    ).toBeVisible()
    expect(within(detailDialog).getByText('standard')).toBeVisible()
    expect(within(detailDialog).getByText('vip_line')).toBeVisible()
    expect(within(detailDialog).queryByText('member')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('tab', { name: 'Special ratio rules' }))
    await user.click(screen.getByRole('button', { name: 'Rules for standard' }))
    const overridesPanel = screen.getByRole('tabpanel', {
      name: 'Special ratio rules',
    })
    expect(
      within(overridesPanel).getByText('User management only')
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Add user group' }))
    const addUserDialog = screen.getByRole('dialog')
    const userGroupPicker = within(addUserDialog).getByRole('combobox', {
      name: 'Select a group',
    })
    await user.click(userGroupPicker)
    const userGroupOptions = screen
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(userGroupOptions).toContain('default')
    expect(userGroupOptions).toContain('member')
    expect(userGroupOptions).toContain('standard')
    await user.click(screen.getByRole('option', { name: 'default' }))
    await user.click(within(addUserDialog).getByRole('button', { name: 'Add' }))

    const defaultRulesHeader = screen
      .getByRole('button', { name: 'Rules for default' })
      .closest('div')
    expect(defaultRulesHeader).not.toBeNull()
    await user.click(
      within(defaultRulesHeader as HTMLDivElement).getByRole('button', {
        name: 'Add ratio override',
      })
    )
    const overrideDialog = screen.getByRole('dialog')
    await user.click(
      within(overrideDialog).getByRole('combobox', { name: 'Select a group' })
    )
    const billingTargetOptions = screen
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(billingTargetOptions).toContain('standard')
    expect(billingTargetOptions).toContain('vip_line')
    expect(billingTargetOptions).not.toContain('default')
    expect(billingTargetOptions).not.toContain('member')
    await user.keyboard('{Escape}{Escape}')

    await user.click(screen.getByRole('tab', { name: 'Group visibility' }))
    const visibilityPanel = screen.getByRole('tabpanel', {
      name: 'Group visibility',
    })
    expect(
      within(visibilityPanel).getByText('User management only')
    ).toBeVisible()
    const visibilityPicker = within(visibilityPanel).getByRole('combobox', {
      name: 'Add rules for a user group',
    })
    await user.click(visibilityPicker)
    const visibilityUserOptions = screen
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(visibilityUserOptions).toContain('member')
    expect(visibilityUserOptions).toContain('vip_line')
    await user.keyboard('{Escape}')

    const defaultVisibilitySection = within(visibilityPanel)
      .getByRole('button', { name: 'Rules for default' })
      .closest('div')?.parentElement
    expect(defaultVisibilitySection).not.toBeNull()
    const targetCombo = within(
      defaultVisibilitySection as HTMLElement
    ).getByRole('combobox', { name: 'Group name' })
    await user.click(targetCombo)
    const visibilityTargetOptions = screen
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(visibilityTargetOptions).toContain('standard')
    expect(visibilityTargetOptions).toContain('vip_line')
    expect(visibilityTargetOptions).not.toContain('default')
    expect(visibilityTargetOptions).not.toContain('member')
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('tab', { name: 'Auto group order' }))
    const autoList = screen.getByRole('list', { name: 'Auto group order' })
    expect(within(autoList).getByText('User management only')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove default' }))
    await user.click(screen.getByRole('combobox', { name: 'Add group' }))
    const autoCandidates = screen
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(autoCandidates).toContain('vip_line')
    expect(autoCandidates).not.toContain('default')
    expect(autoCandidates).not.toContain('member')
  })

  it('persists group_ratio_setting.user_management_groups via atomic diff-only PUT /api/option/group_settings and invalidates group queries', async () => {
    const user = userEvent.setup()
    const putSpy = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    render(<RatioCardFixture queryClient={queryClient} />)

    const defaultRow = screen.getByDisplayValue('default').closest('tr')
    expect(defaultRow).not.toBeNull()
    await user.click(
      within(defaultRow as HTMLTableRowElement).getByRole('checkbox', {
        name: 'User management only',
      })
    )

    await user.click(
      screen.getByRole('button', { name: 'Save group settings' })
    )

    await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(1))
    const [url, payload] = putSpy.mock.calls[0] as [
      string,
      { options: Record<string, unknown> },
    ]
    expect(url).toBe('/api/option/group_settings')
    expect(Object.keys(payload.options)).toEqual([
      'GroupRatio',
      'UserUsableGroups',
      'group_ratio_setting.user_management_groups',
    ])
    expect(
      JSON.parse(
        String(payload.options['group_ratio_setting.user_management_groups'])
      )
    ).toEqual({ default: 'Standard access' })
    expect(JSON.parse(String(payload.options.GroupRatio))).toEqual({ vip: 0.8 })
    expect(JSON.parse(String(payload.options.UserUsableGroups))).toEqual({
      vip: 'Premium access',
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['groups'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user-groups'] })
  })

  it('locks the default group from renaming or deletion and protects the last billing group', async () => {
    const user = userEvent.setup()
    render(
      <Fixture
        initial={{
          GroupRatio: '{"default":1}',
          TopupGroupRatio: '{}',
          UserUsableGroups: '{"default":"Default group"}',
        }}
      />
    )

    const defaultInput = screen.getByDisplayValue('default')
    expect(defaultInput).toBeDisabled()
    const defaultRow = defaultInput.closest('tr') as HTMLTableRowElement
    expect(
      within(defaultRow).getByRole('button', { name: 'Delete' })
    ).toBeDisabled()
    const defaultUmgCheckbox = within(defaultRow).getByRole('checkbox', {
      name: 'User management only',
    })
    expect(defaultUmgCheckbox).toHaveAttribute('aria-disabled', 'true')

    // Adding a second billing group enables toggling default to user-management-only,
    // while protecting the remaining billing group from deletion.
    await user.click(screen.getByRole('button', { name: 'Add group' }))
    expect(defaultUmgCheckbox).not.toHaveAttribute('aria-disabled', 'true')
    await user.click(defaultUmgCheckbox)

    const newGroupRow = screen
      .getByDisplayValue('group_1')
      .closest('tr') as HTMLTableRowElement
    expect(
      within(newGroupRow).getByRole('button', { name: 'Delete' })
    ).toBeDisabled()
    expect(
      within(newGroupRow).getByRole('checkbox', {
        name: 'User management only',
      })
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('blocks saving JSON when default is deleted or zero billing groups remain, and allows restoring default', async () => {
    const user = userEvent.setup()
    const putSpy = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    render(<RatioCardFixture queryClient={queryClient} />)

    await user.click(screen.getByRole('button', { name: 'Switch to JSON' }))
    const groupRatioEditor = screen.getByRole('textbox', {
      name: 'Group ratios',
    })
    fireEvent.input(groupRatioEditor, { target: { value: '{"vip":0.8}' } })
    await user.click(
      screen.getByRole('button', { name: 'Save group settings' })
    )

    await waitFor(() =>
      expect(
        screen.getByText('The default group cannot be deleted')
      ).toBeVisible()
    )
    expect(putSpy).not.toHaveBeenCalled()

    // Switching back to visual shows the restore banner and lets the admin restore default.
    await user.click(screen.getByRole('button', { name: 'Switch to Visual' }))
    await user.click(
      screen.getByRole('button', { name: 'Restore default group' })
    )
    expect(screen.getByDisplayValue('default')).toBeDisabled()

    // Emptying GroupRatio while default is in UserManagementGroups is also blocked.
    await user.click(screen.getByRole('button', { name: 'Switch to JSON' }))
    const umgEditor = screen.getByRole('textbox', {
      name: 'User management only groups',
    })
    fireEvent.input(screen.getByRole('textbox', { name: 'Group ratios' }), {
      target: { value: '{}' },
    })
    fireEvent.input(umgEditor, {
      target: { value: '{"default":"Standard member"}' },
    })
    await user.click(
      screen.getByRole('button', { name: 'Save group settings' })
    )
    await waitFor(() =>
      expect(
        screen.getByText('At least one billing group must be kept')
      ).toBeVisible()
    )
    expect(putSpy).not.toHaveBeenCalled()
  })

  it('rejects reserved group names in UserManagementGroups JSON and prevents saving', async () => {
    const user = userEvent.setup()
    const putSpy = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    render(<RatioCardFixture queryClient={queryClient} />)

    await user.click(screen.getByRole('button', { name: 'Switch to JSON' }))
    const editor = screen.getByRole('textbox', {
      name: 'User management only groups',
    })
    fireEvent.input(editor, { target: { value: '{"auto":"Reserved"}' } })
    await user.click(
      screen.getByRole('button', { name: 'Save group settings' })
    )

    await waitFor(() =>
      expect(
        screen.getByText(
          'Expected a JSON object mapping non-reserved group names to description strings'
        )
      ).toBeVisible()
    )
    expect(putSpy).not.toHaveBeenCalled()
  })
})
