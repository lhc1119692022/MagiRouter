import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { expect, test } from 'vitest'

import { useNotifications } from '../use-notifications'

test('the archive keeps entries past the notification menu limit without changing its unread badge', () => {
  const records = Array.from({ length: 24 }, (_, index) => ({
    id: index + 1,
    content: `Published notice ${index + 1}`,
  }))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['notice'], { success: true, data: '' })
  client.setQueryData(['status'], {
    announcements_enabled: true,
    announcements: records,
  })
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const header = renderHook(() => useNotifications(), { wrapper })
  const timeline = renderHook(() => useNotifications('timeline'), { wrapper })
  expect(header.result.current.announcements).toHaveLength(20)
  expect(header.result.current.unreadAnnouncementsCount).toBe(20)
  expect(timeline.result.current.announcements).toEqual(records)
  header.unmount()
  timeline.unmount()
  client.clear()
})
