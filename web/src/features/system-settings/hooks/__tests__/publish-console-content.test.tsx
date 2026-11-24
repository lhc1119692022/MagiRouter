import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { useUpdateOption } from '../use-update-option'

afterEach(() => localStorage.removeItem('status'))

it.each([
  ['console_setting.announcements', false],
  ['console_setting.faq_enabled', false],
  ['console_setting.api_info', false],
  ['console_setting.uptime_kuma_groups', true],
  ['console_setting.official_model_prices', false],
  ['general_setting.docs_link', false],
])(
  'publishing %s refreshes the user-facing cache, not just the settings form',
  async (key, monitors) => {
    const client = new QueryClient()
    client.setQueryData(['status'], {})
    client.setQueryData(['uptime-status'], { groups: [] })
    client.setQueryData(['pricing'], { data: [] })
    localStorage.setItem('status', '{}')
    vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
    const hook = renderHook(useUpdateOption, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    })
    await act(async () => {
      await hook.result.current.mutateAsync({
        key,
        value: key === 'console_setting.official_model_prices' ? '{}' : '[]',
      })
    })
    expect(client.getQueryState(['status'])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['pricing'])?.isInvalidated).toBe(
      key === 'console_setting.official_model_prices'
    )
    expect(client.getQueryState(['uptime-status'])?.isInvalidated).toBe(
      monitors
    )
    expect(localStorage.getItem('status')).toBeNull()
    hook.unmount()
    client.clear()
  }
)
