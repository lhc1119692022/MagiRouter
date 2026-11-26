import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance, type TFunction } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { api } from '@/lib/api'

import {
  getApiKeyFormDefaultValues,
  getApiKeyFormSchema,
} from '../../lib/api-key-form'
import type { ApiKey } from '../../types'
import { ApiKeyGroupCell } from '../api-key-group-cell'
import { ApiKeysMutateDrawer } from '../api-keys-mutate-drawer'
import { ApiKeysProvider } from '../api-keys-provider'

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

const identityT = ((key: string) => key) as unknown as TFunction

let activeQueryClient: QueryClient | null = null

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  if (activeQueryClient) {
    activeQueryClient.clear()
    activeQueryClient = null
  }
})

type GroupsFixture = {
  data: Record<
    string,
    { desc: string; ratio: number | string; has_models?: boolean }
  >
  user_group?: string
  require_explicit_group?: boolean
}

async function renderDrawerWithGroups(options: {
  groupsFixture: GroupsFixture
  defaultUseAutoGroup?: boolean
  currentRow?: ApiKey
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  activeQueryClient = queryClient

  const createdPayloads: Array<Record<string, unknown>> = []
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/status') {
      return {
        data: {
          data: {
            default_use_auto_group: options.defaultUseAutoGroup ?? false,
          },
        },
      }
    }
    if (url === '/api/user/models') {
      return { data: { success: true, data: [] } }
    }
    if (url === '/api/user/self/groups') {
      return {
        data: {
          success: true,
          message: '',
          ...options.groupsFixture,
        },
      }
    }
    if (url === '/api/token/auto-groups') {
      return { data: { success: true, data: { groups: [], max_count: 5 } } }
    }
    if (options.currentRow && url === `/api/token/${options.currentRow.id}`) {
      return { data: { success: true, data: options.currentRow } }
    }
    throw new Error(`Unexpected GET ${url}`)
  })
  const postSpy = vi
    .spyOn(api, 'post')
    .mockImplementation(async (url, data) => {
      if (url === '/api/token/' && data && typeof data === 'object') {
        createdPayloads.push(data as Record<string, unknown>)
      }
      return { data: { success: true, data: {} } }
    })

  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ApiKeysProvider>
          <ApiKeysMutateDrawer
            open
            onOpenChange={() => undefined}
            currentRow={options.currentRow}
          />
        </ApiKeysProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )

  const saveButton = screen.getByRole('button', { name: 'Save changes' })
  await waitFor(() => {
    expect(saveButton).toBeEnabled()
  })

  return { createdPayloads, postSpy, saveButton }
}

function CellHarness(props: { group: string; requireExplicitGroup?: boolean }) {
  return (
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <ApiKeyGroupCell
          group={props.group}
          crossGroupRetry={false}
          shouldReduceMotion={false}
          requireExplicitGroup={props.requireExplicitGroup}
        />
      </TooltipProvider>
    </I18nextProvider>
  )
}

describe('getApiKeyFormSchema explicit billing group validation', () => {
  test('allows empty group when requireExplicitGroup is false', () => {
    const values = {
      ...getApiKeyFormDefaultValues(false),
      name: 'Standard key',
      group: '',
    }
    const result = getApiKeyFormSchema(identityT, 5, false).safeParse(values)
    expect(result.success).toBe(true)
  })

  test('rejects empty or whitespace group when requireExplicitGroup is true', () => {
    for (const emptyGroup of ['', '   ']) {
      const values = {
        ...getApiKeyFormDefaultValues(false),
        name: 'UMG key',
        group: emptyGroup,
      }
      const result = getApiKeyFormSchema(identityT, 5, true).safeParse(values)
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['group'],
            message: 'Please select a billing group',
          }),
        ])
      )
    }
  })

  test('accepts a selected billing group when requireExplicitGroup is true', () => {
    const values = {
      ...getApiKeyFormDefaultValues(false),
      name: 'UMG key',
      group: 'standard',
    }
    const result = getApiKeyFormSchema(identityT, 5, true).safeParse(values)
    expect(result.success).toBe(true)
  })
})

describe('ApiKeysMutateDrawer explicit billing group flow', () => {
  test('shows guidance, blocks submit without a billing group, and submits after selection', async () => {
    const { createdPayloads, postSpy, saveButton } =
      await renderDrawerWithGroups({
        groupsFixture: {
          data: {
            standard: { desc: 'Standard billing', ratio: 1 },
            pro: { desc: 'Pro billing', ratio: 2 },
          },
          user_group: 'enterprise-team',
          require_explicit_group: true,
        },
      })

    expect(
      screen.getByText(
        'Your account group (enterprise-team) is for user management only. Select a billing group for this API key.'
      )
    ).toBeVisible()
    const groupCombobox = screen.getByRole('combobox')
    expect(groupCombobox).toHaveTextContent('Select a billing group (required)')

    fireEvent.input(screen.getByPlaceholderText('Enter a name'), {
      target: { value: 'Billing key' },
    })
    fireEvent.click(saveButton)

    expect(
      await screen.findByText('Please select a billing group')
    ).toBeVisible()
    expect(postSpy).not.toHaveBeenCalled()

    fireEvent.click(groupCombobox)
    const standardOption = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="command-item"]'),
    ].find((candidate) => candidate.textContent?.includes('Standard billing'))
    expect(standardOption).toBeTruthy()
    if (!standardOption) return
    fireEvent.click(standardOption)

    fireEvent.click(saveButton)
    await waitFor(() => expect(createdPayloads).toHaveLength(1))
    expect(createdPayloads[0]).toMatchObject({
      name: 'Billing key',
      group: 'standard',
    })
  })

  test('shows administrator warning when no billing groups are available', async () => {
    await renderDrawerWithGroups({
      groupsFixture: {
        data: {},
        user_group: 'enterprise-team',
        require_explicit_group: true,
      },
    })

    const warning = screen.getByText(
      'No billing groups are available for your account yet. Contact an administrator to configure billing groups.'
    )
    expect(warning).toBeVisible()
    expect(warning).toHaveClass('text-destructive')
  })

  test('resets an invalid existing key group to empty instead of auto-picking when explicit group is required', async () => {
    const existingKey: ApiKey = {
      id: 7,
      key: 'sk-test',
      status: 1,
      name: 'Legacy UMG Key',
      remain_quota: 0,
      used_quota: 0,
      unlimited_quota: true,
      expired_time: -1,
      created_time: 1,
      accessed_time: 0,
      group: 'enterprise-team',
      auto_groups: [],
      cross_group_retry: false,
      model_limits_enabled: false,
      model_limits: '',
      allow_ips: '',
      allow_user_quota_query: true,
    }

    await renderDrawerWithGroups({
      currentRow: existingKey,
      groupsFixture: {
        data: {
          standard: { desc: 'Standard billing', ratio: 1 },
        },
        user_group: 'enterprise-team',
        require_explicit_group: true,
      },
    })

    const groupCombobox = screen.getByRole('combobox')
    await waitFor(() => {
      expect(groupCombobox).toHaveTextContent(
        'Select a billing group (required)'
      )
    })
  })

  test('hides groups without available models when creating a new API key', async () => {
    const user = userEvent.setup()
    await renderDrawerWithGroups({
      groupsFixture: {
        data: {
          'Claude AWS': {
            desc: 'AWS line',
            ratio: 0.55,
            has_models: true,
          },
          'Claude Cursor': {
            desc: 'Temporarily empty',
            ratio: 0.5,
            has_models: false,
          },
          auto: {
            desc: 'Auto route',
            ratio: 'auto',
            has_models: false,
          },
        },
        user_group: 'default',
        require_explicit_group: true,
      },
    })

    await user.click(screen.getByRole('combobox'))
    expect(await screen.findByText('Claude AWS')).toBeVisible()
    expect(screen.queryByText('Claude Cursor')).not.toBeInTheDocument()
    expect(screen.queryByText('Auto route')).not.toBeInTheDocument()
  })

  test('preserves an existing key group on edit even when it temporarily has no models while hiding other empty groups', async () => {
    const user = userEvent.setup()
    const existingKey: ApiKey = {
      id: 9,
      key: 'sk-existing',
      status: 1,
      name: 'Existing Key',
      remain_quota: 0,
      used_quota: 0,
      unlimited_quota: true,
      expired_time: -1,
      created_time: 1,
      accessed_time: 0,
      group: 'Paused Group',
      auto_groups: [],
      cross_group_retry: false,
      model_limits_enabled: false,
      model_limits: '',
      allow_ips: '',
      allow_user_quota_query: true,
    }

    await renderDrawerWithGroups({
      currentRow: existingKey,
      groupsFixture: {
        data: {
          'Paused Group': {
            desc: 'Temporarily paused',
            ratio: 0.5,
            has_models: false,
          },
          'Other Empty Group': {
            desc: 'No models',
            ratio: 0.4,
            has_models: false,
          },
          'Active Group': {
            desc: 'Has models',
            ratio: 0.8,
            has_models: true,
          },
        },
        user_group: 'default',
        require_explicit_group: true,
      },
    })

    const groupCombobox = screen.getByRole('combobox')
    expect(groupCombobox).toHaveTextContent('Paused Group')

    await user.click(groupCombobox)
    expect(await screen.findByText('Active Group')).toBeVisible()
    expect(screen.queryByText('Other Empty Group')).not.toBeInTheDocument()
  })
})

describe('ApiKeyGroupCell explicit billing group warning', () => {
  test('renders Billing group required warning with tooltip when group is empty and requireExplicitGroup is true', async () => {
    const user = userEvent.setup()
    render(<CellHarness group='' requireExplicitGroup />)

    const badge = screen.getByText('Billing group required')
    expect(badge).toBeVisible()
    expect(screen.queryByText('Inherited')).not.toBeInTheDocument()

    await user.hover(badge)
    expect(
      await screen.findByText(
        'Your account group is for user management only. Edit this key and select a billing group.'
      )
    ).toBeVisible()
  })

  test('renders Inherited when group is empty and requireExplicitGroup is false', () => {
    render(<CellHarness group='' requireExplicitGroup={false} />)

    expect(screen.getByText('Inherited')).toBeVisible()
    expect(screen.queryByText('Billing group required')).not.toBeInTheDocument()
  })
})
