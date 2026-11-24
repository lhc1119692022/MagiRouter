import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { createAppQueryClient } from '@/lib/query-client'

import { getCreationPresetsErrorMessage, useCreationPresets } from '../presets'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))
vi.mock('@/lib/handle-server-error', () => ({ handleServerError: vi.fn() }))

it.each([
  [404, 'Creation presets are unavailable on this site.'],
  [401, 'Sign in to view creation presets.'],
  [403, 'Your account cannot view creation presets.'],
  [500, 'Could not load creation presets.'],
  [
    undefined,
    'Could not reach the server to load creation presets. Check your connection and retry.',
  ],
])(
  'reports a failed preset lookup (%s) inline without leaving the current page',
  async (status, message) => {
    const error = status ? { response: { status } } : { code: 'ERR_NETWORK' }
    vi.mocked(api.get).mockRejectedValueOnce(error)
    const leavePage = vi.fn()
    const client = createAppQueryClient(leavePage)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(useCreationPresets, { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
    expect(getCreationPresetsErrorMessage(result.current.error)).toBe(message)
    expect(handleServerError).not.toHaveBeenCalled()
    expect(leavePage).not.toHaveBeenCalled()
    client.clear()
  }
)
