import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  getRouteApi,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { PresetWorkspace } from '@/features/creation/preset-workspace'
import { Playground } from '@/features/playground'
import { playgroundSearchSchema } from '@/features/playground/lib/workspace-search'
import { api } from '@/lib/api'
import { Route as keysFileRoute } from '@/routes/_authenticated/keys'
import { useAuthStore } from '@/stores/auth-store'

import { ApiKeysDialogs } from '../api-keys-dialogs'
import { ApiKeysPrimaryButtons } from '../api-keys-primary-buttons'
import { ApiKeysProvider } from '../api-keys-provider'

let client: QueryClient
const playgroundRoute = getRouteApi('/_authenticated/playground/')

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.getState().auth.setUser(null)
  localStorage.clear()
})

function ReturnedPlaygroundKeys() {
  const { mode, model, preset, group } = playgroundRoute.useSearch()
  if (preset) return <PresetWorkspace id={preset} group={group} />
  return <Playground initialMode={mode ?? 'chat'} initialModel={model} />
}

async function openKeys(url: string) {
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValue({ data: { success: true, data: [] } })
  const post = vi
    .spyOn(api, 'post')
    .mockRejectedValue(new Error('Unexpected write or key disclosure'))
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], {})
  const root = createRootRoute()
  const dashboard = createRoute({
    getParentRoute: () => root,
    path: 'dashboard/overview',
  })
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const playground = createRoute({
    getParentRoute: () => auth,
    path: 'playground/',
    validateSearch: playgroundSearchSchema,
    component: ReturnedPlaygroundKeys,
  })
  const keys = createRoute({
    getParentRoute: () => auth,
    path: 'keys/',
    validateSearch: keysFileRoute.options.validateSearch,
    component: () => (
      <ApiKeysProvider>
        <ApiKeysPrimaryButtons />
        <ApiKeysDialogs />
      </ApiKeysProvider>
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([
      dashboard,
      auth.addChildren([keys, playground]),
    ]),
    history: createMemoryHistory({
      initialEntries: ['/dashboard/overview', url],
    }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { router, get, post }
}

it('opens only the real creation form from the dashboard link; closing preserves filters and Back returns to the overview', async () => {
  const user = userEvent.setup()
  const { router, post } = await openKeys('/keys?action=create&filter=team')
  expect(
    await screen.findByRole('dialog', { name: 'Create API Key' })
  ).toBeVisible()
  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(router.state.location.search).toEqual({ filter: 'team' })
  await act(async () => {
    router.history.back()
  })
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/dashboard/overview')
  )
  expect(post).not.toHaveBeenCalled()
})

it('ignores unknown actions and keeps manual key creation available', async () => {
  const { post } = await openKeys('/keys?action=unknown')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Create API Key' }))
  expect(
    await screen.findByRole('dialog', { name: 'Create API Key' })
  ).toBeVisible()
  expect(post).not.toHaveBeenCalled()
})

it.each([
  { mode: 'chat', model: 'catalog/text-model' },
  { preset: 'studio-cover', group: 'studio' },
])(
  'returns to the originating Playground when creation is cancelled: %o',
  async (playground) => {
    const query = new URLSearchParams({
      action: 'create',
      playground: JSON.stringify(playground),
    })
    const { router, post } = await openKeys(`/keys?${query}`)
    await screen.findByRole('dialog', { name: 'Create API Key' })
    await userEvent.click(
      screen.getByRole('button', { name: 'Back to Playground' })
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/playground')
    )
    expect(router.state.location.search).toEqual(playground)
    expect(router.state.location.state).not.toHaveProperty(
      'playgroundCreatedKey'
    )
    expect(post).not.toHaveBeenCalled()
  }
)

it('returns only recognized Playground fields when a link also contains unrelated state', async () => {
  const query = new URLSearchParams({
    action: 'create',
    playground: JSON.stringify({
      mode: 'image',
      model: 'art/model',
      tab: 'recent',
    }),
  })
  const { router, post } = await openKeys(`/keys?${query}`)
  await userEvent.click(
    await screen.findByRole('button', { name: 'Back to Playground' })
  )
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/playground')
  )
  expect(router.state.location.search).toEqual({
    mode: 'image',
    model: 'art/model',
  })
  expect(post).not.toHaveBeenCalled()
})

it('keeps a failed key form open and loads the newly created key when returning to its preset', async () => {
  const playground = { preset: 'voiceover', group: 'studio' }
  const query = new URLSearchParams({
    action: 'create',
    playground: JSON.stringify(playground),
  })
  const account = { id: 49, username: 'preset-author', role: 1 }
  useAuthStore.getState().auth.setUser(account)
  const { router, get, post } = await openKeys(`/keys?${query}`)
  client.setQueryData(['playground-billing-keys', account.id], [])
  const newKey = {
    id: 73,
    name: 'New fixture key',
    group: 'studio',
    status: 1,
    expired_time: -1,
    unlimited_quota: true,
  }
  const items: (typeof newKey)[] = []
  const preset = {
    id: 'voiceover',
    mode: 'chat',
    model: 'voiceover-text',
    title: 'Voiceover script',
    prompt: 'Write a voiceover script.',
  }
  get.mockImplementation(async (url, options) => {
    if (url === '/api/user/models') {
      const params = options?.params as Record<string, unknown> | undefined
      return {
        data: {
          success: true,
          data: [preset.model],
          group: 'studio',
          billing_key_id: params?.billing_key_id,
        },
      }
    }
    if (url === '/api/user/self/creation-presets') {
      return { data: { success: true, data: [preset] } }
    }
    if (url === '/api/user/self/groups') {
      return { data: { success: true, data: { studio: { ratio: 1 } } } }
    }
    if (url === '/api/pricing') {
      return {
        data: {
          success: true,
          vendors: [],
          data: [
            {
              model_name: preset.model,
              supported_endpoint_types: ['openai'],
              output_modalities: ['text'],
              enable_groups: ['studio'],
            },
          ],
        },
      }
    }
    return {
      data: {
        success: true,
        data: url.startsWith('/api/token/?')
          ? { items, total: items.length }
          : [],
      },
    }
  })
  post.mockResolvedValueOnce({
    data: { success: false, message: 'Fixture failure' },
  })
  post.mockImplementationOnce(async () => {
    items.push(newKey)
    return { data: { success: true, data: { id: newKey.id } } }
  })
  const user = userEvent.setup()
  await screen.findByRole('dialog', { name: 'Create API Key' })
  expect(
    screen.queryByRole('spinbutton', { name: 'Quantity' })
  ).not.toBeInTheDocument()
  await user.type(screen.getByRole('textbox', { name: /Name/i }), newKey.name)
  const save = screen.getByRole('button', { name: 'Save changes' })
  await user.click(save)
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  expect(router.state.location.pathname).toBe('/keys')
  expect(screen.getByRole('dialog')).toBeVisible()
  await user.click(save)
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/playground')
  )
  expect(router.state.location.search).toEqual(playground)
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'API Key' })).toHaveTextContent(
      newKey.name
    )
  )
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Ask anything' })).toHaveValue(
      preset.prompt
    )
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  )
  expect(post).toHaveBeenCalledTimes(2)
  expect(router.state.location.state).not.toHaveProperty('playgroundCreatedKey')
})

it('selects and confirms the newly created key by ID when an older key has the same name', async () => {
  const playground = { mode: 'chat' as const, model: 'studio-model' }
  const query = new URLSearchParams({
    action: 'create',
    playground: JSON.stringify(playground),
  })
  const account = { id: 49, username: 'preset-author', role: 1 }
  useAuthStore.getState().auth.setUser(account)
  const { router, get, post } = await openKeys(`/keys?${query}`)
  const olderKey = {
    id: 84,
    name: 'same-name',
    group: 'studio',
    status: 1,
    expired_time: -1,
    unlimited_quota: true,
  }
  const newKey = { ...olderKey, id: 73 }
  const items = [olderKey, newKey]
  get.mockImplementation(async (url, options) => {
    if (url === '/api/user/models') {
      const params = options?.params as Record<string, unknown> | undefined
      return {
        data: {
          success: true,
          group: 'studio',
          billing_key_id: params?.billing_key_id,
          data: params?.billing_key_id === newKey.id ? ['studio-model'] : [],
        },
      }
    }
    return {
      data: {
        success: true,
        data: url.startsWith('/api/token/?')
          ? { items, total: items.length }
          : [],
      },
    }
  })
  post.mockResolvedValueOnce({
    data: { success: true, data: { id: newKey.id } },
  })
  const user = userEvent.setup()
  await screen.findByRole('dialog', { name: 'Create API Key' })
  await user.type(screen.getByRole('textbox', { name: /Name/i }), newKey.name)
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/playground')
  )
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Select model' })).toHaveValue(
      'studio-model'
    )
  )
  expect(screen.getByRole('combobox', { name: 'API Key' })).toHaveTextContent(
    newKey.name
  )
  expect(screen.getByRole('combobox', { name: 'API Key' })).toHaveTextContent(
    'studio'
  )
  expect(router.state.location.search).toEqual(playground)
  expect(router.state.location.state).not.toHaveProperty('playgroundCreatedKey')
  expect(post).toHaveBeenCalledTimes(1)
})

it.each([
  { reason: 'an older server omits the ID', id: undefined, switchOwner: false },
  { reason: 'the new key is no longer eligible', id: 84, switchOwner: false },
  {
    reason: 'the account changes before the response arrives',
    id: 88,
    switchOwner: true,
  },
])('keeps selection manual when $reason', async ({ id, switchOwner }) => {
  const playground = { mode: 'chat', model: 'voiceover-text' }
  const query = new URLSearchParams({
    action: 'create',
    playground: JSON.stringify(playground),
  })
  const account = { id: 50, username: 'legacy-preset-author', role: 1 }
  useAuthStore.getState().auth.setUser(account)
  const { router, get, post } = await openKeys(`/keys?${query}`)
  get.mockImplementation(async (url) => ({
    data: {
      success: true,
      data: url.startsWith('/api/token/?')
        ? {
            items: [
              {
                id: 88,
                name: 'The only key',
                group: 'studio',
                status: 1,
                expired_time: -1,
                unlimited_quota: true,
              },
            ],
            total: 1,
          }
        : [],
    },
  }))
  post.mockImplementationOnce(async () => {
    if (switchOwner) {
      useAuthStore
        .getState()
        .auth.setUser({ id: 51, username: 'other-user', role: 1 })
    }
    return { data: { success: true, data: id ? { id } : undefined } }
  })
  const user = userEvent.setup()
  await screen.findByRole('dialog', { name: 'Create API Key' })
  await user.type(
    screen.getByRole('textbox', { name: /Name/i }),
    'The only key'
  )
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/playground')
  )
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'API Key' })).toBeEnabled()
  )
  expect(screen.getByRole('combobox', { name: 'API Key' })).toHaveValue('')
  expect(screen.queryByLabelText('Billing group')).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Select model' })).toBeDisabled()
  expect(router.state.location.search).toEqual(playground)
  expect(router.state.location.state).not.toHaveProperty('playgroundCreatedKey')
})
