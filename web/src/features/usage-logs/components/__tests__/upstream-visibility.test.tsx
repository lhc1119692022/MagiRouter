import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import type { UsageLog } from '../../data/schema'
import { buildApiParams } from '../../lib/utils'
import { DetailsDialog } from '../dialogs/details-dialog'

afterEach(() => {
  cleanup()
})

function makeLog(): UsageLog {
  return {
    id: 1,
    user_id: 7,
    created_at: 1788840000,
    type: 5,
    content: 'status_code=502, Upstream service is temporarily unavailable',
    username: 'alice',
    token_name: 'demo-key',
    model_name: 'gpt-5',
    quota: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    use_time: 1,
    is_stream: false,
    channel: 12,
    channel_name: 'upstream-relay',
    token_id: 3,
    group: 'default',
    ip: '',
    other: JSON.stringify({ status_code: 502 }),
    request_id: 'local-req-123',
    upstream_request_id: 'upstream-req-secret-999',
  }
}

function renderDialog(isAdmin: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <DetailsDialog
        open
        onOpenChange={() => undefined}
        log={makeLog()}
        isAdmin={isAdmin}
        isRoot={false}
      />
    </QueryClientProvider>
  )
}

test('DetailsDialog hides upstream_request_id and channel for non-admin users', () => {
  renderDialog(false)

  expect(screen.getByText('local-req-123')).toBeTruthy()
  expect(screen.queryByText('upstream-req-secret-999')).toBeNull()
  expect(screen.queryByText('upstream-relay')).toBeNull()
})

test('DetailsDialog shows upstream_request_id and channel for admin users', () => {
  renderDialog(true)

  expect(screen.getByText('local-req-123')).toBeTruthy()
  expect(screen.getByText('upstream-req-secret-999')).toBeTruthy()
})

test('buildApiParams strips upstream_request_id and channel for non-admin users', () => {
  const searchParams = {
    requestId: 'local-req-123',
    upstreamRequestId: 'upstream-req-secret-999',
    channel: '12',
    username: 'alice',
  }

  const userParams = buildApiParams({
    page: 1,
    pageSize: 20,
    searchParams,
    isAdmin: false,
  })
  expect(userParams.request_id).toBe('local-req-123')
  expect(userParams.upstream_request_id).toBeUndefined()
  expect(userParams.channel).toBeUndefined()
  expect(userParams.username).toBeUndefined()

  const adminParams = buildApiParams({
    page: 1,
    pageSize: 20,
    searchParams,
    isAdmin: true,
  })
  expect(adminParams.request_id).toBe('local-req-123')
  expect(adminParams.upstream_request_id).toBe('upstream-req-secret-999')
  expect(adminParams.channel).toBe(12)
  expect(adminParams.username).toBe('alice')
})
