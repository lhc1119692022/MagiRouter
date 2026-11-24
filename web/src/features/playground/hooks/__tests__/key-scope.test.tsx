import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { usePlaygroundOptions } from '../use-playground-options'

const studio = { id: 61, group: 'studio' }
const archive = { id: 62, group: 'archive' }
const originalAdapter = api.defaults.adapter

type PendingScope = {
  keyId: number
  allow: (model: string) => void
  deny: () => void
}

let client: QueryClient

afterEach(() => {
  cleanup()
  client.clear()
  focusManager.setFocused(undefined)
  useAuthStore.getState().auth.setUser(null)
  api.defaults.adapter = originalAdapter
})

function openStudio() {
  useAuthStore.getState().auth.setUser({ id: 70, username: 'fixture', role: 1 })
  const requests: PendingScope[] = []
  api.defaults.adapter = async (config) => {
    const response = { config, status: 200, statusText: 'OK', headers: {} }
    if (config.url === '/api/user/self/groups') {
      return { ...response, data: { success: true, data: {} } }
    }
    const key = [studio, archive].find(
      (candidate) => candidate.id === config.params?.billing_key_id
    )
    if (config.url !== '/api/user/models' || !key) {
      throw new Error('Unexpected request')
    }
    const models = await new Promise<string[]>((resolve, reject) => {
      requests.push({
        keyId: key.id,
        allow: (model) => resolve([model]),
        deny: () => reject(new Error('Permission unavailable')),
      })
    })
    return {
      ...response,
      data: {
        success: true,
        billing_key_id: key.id,
        group: key.group,
        data: models,
      },
    }
  }
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const hook = renderHook(
    (selectedKey) => usePlaygroundOptions({ selectedKey }),
    {
      initialProps: studio,
      wrapper: (props: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
          {props.children}
        </QueryClientProvider>
      ),
    }
  )
  return {
    ...hook,
    requestFor: (key: typeof studio, attempt = 0) =>
      waitFor(() => {
        const request = requests.filter((entry) => entry.keyId === key.id)[
          attempt
        ]
        if (!request) {
          throw new Error(`No scope request ${attempt + 1} for key ${key.id}`)
        }
        return request
      }),
  }
}

it('ignores a late reply for the previous key and requires a fresh scope when switching back', async () => {
  const { result, rerender, requestFor } = openStudio()
  const previousStudio = await requestFor(studio)
  rerender(archive)
  expect(result.current.scope).toBeUndefined()
  const archiveRequest = await requestFor(archive)
  await act(async () => archiveRequest.allow('archive-model'))
  await waitFor(() => expect(result.current.scope?.keyId).toBe(archive.id))
  await act(async () => previousStudio.allow('removed-model'))
  await waitFor(() => expect(client.isFetching()).toBe(0))
  expect(result.current.scope?.models.map((model) => model.value)).toEqual([
    'archive-model',
  ])
  rerender(studio)
  expect(result.current.scope).toBeUndefined()
  const refreshedStudio = await requestFor(studio, 1)
  await act(async () => refreshedStudio.allow('current-model'))
  await waitFor(() =>
    expect(result.current.scope?.models.map((model) => model.value)).toEqual([
      'current-model',
    ])
  )
})

it('does not reuse a request started before the user left and reselected the same key', async () => {
  const { result, rerender, requestFor } = openStudio()
  const previousStudio = await requestFor(studio)
  rerender(archive)
  const archiveRequest = await requestFor(archive)
  await act(async () => archiveRequest.allow('archive-model'))
  await waitFor(() => expect(result.current.scope?.keyId).toBe(archive.id))
  rerender(studio)
  const refreshedStudio = await requestFor(studio, 1)
  await act(async () => previousStudio.allow('removed-model'))
  expect(result.current.scope).toBeUndefined()
  await act(async () => refreshedStudio.allow('current-model'))
  await waitFor(() =>
    expect(result.current.scope?.models[0].value).toBe('current-model')
  )
})

it('keeps the confirmed scope during a background refresh but revokes it on failure', async () => {
  const { result, requestFor } = openStudio()
  const initial = await requestFor(studio)
  await act(async () => initial.allow('confirmed-model'))
  await waitFor(() =>
    expect(result.current.scope?.models[0].value).toBe('confirmed-model')
  )
  act(() => focusManager.setFocused(false))
  act(() => focusManager.setFocused(true))
  const refresh = await requestFor(studio, 1)
  expect(result.current.scope?.models[0].value).toBe('confirmed-model')
  expect(result.current.isLoadingModels).toBe(false)
  await act(async () => refresh.deny())
  await waitFor(() => expect(result.current.modelsError).toBeTruthy())
  expect(result.current.scope).toBeUndefined()
})
