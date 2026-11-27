import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { AuditLogs } from '../../audit'
import { UsageLogs } from '../../index'
import {
  mapTaskStatusToTone,
  parseTaskProgressPercent,
} from '../../lib/editorial'
import { buildSearchParams } from '../../lib/filter'

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
})

afterEach(() => {
  cleanup()
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('editorial logs helpers', () => {
  it('parses task progress percentages and clamps bounds', () => {
    expect(parseTaskProgressPercent('100%')).toBe(100)
    expect(parseTaskProgressPercent('42.6%')).toBe(43)
    expect(parseTaskProgressPercent('0')).toBe(0)
    expect(parseTaskProgressPercent('150%')).toBe(100)
    expect(parseTaskProgressPercent('')).toBeNull()
    expect(parseTaskProgressPercent('queued')).toBeNull()
  })

  it('maps task status values to editorial tones', () => {
    expect(mapTaskStatusToTone('SUCCESS')).toBe('success')
    expect(mapTaskStatusToTone('IN_PROGRESS')).toBe('running')
    expect(mapTaskStatusToTone('QUEUED')).toBe('warn')
    expect(mapTaskStatusToTone('FAILURE')).toBe('err')
    expect(mapTaskStatusToTone('UNKNOWN')).toBe('muted')
  })

  it('serializes task status filter into URL search params', () => {
    const withStatus = buildSearchParams(
      { taskId: 'task-123', status: 'IN_PROGRESS' },
      'task'
    )
    expect(withStatus).toMatchObject({
      filter: 'task-123',
      status: 'IN_PROGRESS',
    })

    const withoutStatus = buildSearchParams({ taskId: 'task-123' }, 'task')
    expect(withoutStatus).not.toHaveProperty('status')
  })
})

describe('audit logs editorial layout', () => {
  it('renders stat strip, category pills, category column, and preserved filters', async () => {
    useAuthStore.getState().auth.setUser({
      id: 7,
      username: 'member',
      role: 1,
    })
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        data: {
          total: 2,
          items: [
            {
              event_id: 'evt-1',
              user_id: 7,
              username: 'member',
              actor_role: 1,
              created_at: 1788600600,
              category: 'access_token',
              action: 'access_token.request',
              content: '',
              other: {},
              request_id: 'req-1',
              token_ref: '',
              user_agent: 'curl/8.0',
              method: 'GET',
              route: '/api/user/self',
              ip: '127.0.0.1',
              status: 200,
              success: true,
            },
            {
              event_id: 'evt-2',
              user_id: 7,
              username: 'member',
              actor_role: 1,
              created_at: 1788600500,
              category: 'security',
              action: 'token.delete',
              content: '',
              other: {
                op: { action: 'token.delete', params: { id: 3, name: 'dev' } },
              },
              request_id: 'req-2',
              token_ref: '',
              user_agent: 'Mozilla/5.0',
              method: 'DELETE',
              route: '/api/token/3',
              ip: '10.0.0.1',
              status: 403,
              success: false,
            },
          ],
        },
      },
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <AuditLogs />
      </QueryClientProvider>
    )

    expect(await screen.findByText('Matching Events')).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Audit Logs' }).closest('main')
    ).toHaveClass('console-page-wide')
    expect(await screen.findByText('127.0.0.1')).toBeVisible()
    expect(screen.getByText('Access Token Calls')).toBeVisible()
    expect(screen.getByText('Security & Login')).toBeVisible()
    expect(screen.getByText('Failed / Blocked')).toBeVisible()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Export Audit Logs' })
      ).toBeEnabled()
    )
    expect(screen.getByRole('button', { name: 'Date Range' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Result' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Expand' })).toBeVisible()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Account security' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/audit/self', {
        params: expect.objectContaining({ category: 'security', p: 1 }),
      })
    )
  })
})

describe('usage logs wide layout', () => {
  it.each([
    { path: '/usage-logs/common', heading: 'LLM Logs' },
    { path: '/usage-logs/task', heading: 'Task Logs' },
  ])(
    'renders $heading in the wide console layout',
    async ({ path, heading }) => {
      useAuthStore.getState().auth.setUser({
        id: 7,
        username: 'member',
        role: 1,
      })
      vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/api/log/self/stat')) {
          return { data: { success: true, data: { quota: 0, rpm: 0, tpm: 0 } } }
        }
        if (url.includes('/api/subscription/self')) {
          return {
            data: {
              success: true,
              data: { subscriptions: [], all_subscriptions: [] },
            },
          }
        }
        return { data: { success: true, data: { items: [], total: 0 } } }
      })

      const root = createRootRoute()
      const auth = createRoute({
        getParentRoute: () => root,
        id: '_authenticated',
      })
      const logs = createRoute({
        getParentRoute: () => auth,
        path: '/usage-logs/$section',
        component: UsageLogs,
        validateSearch: (search: Record<string, unknown>) => search,
      })
      const router = createRouter({
        routeTree: root.addChildren([auth.addChildren([logs])]),
        history: createMemoryHistory({ initialEntries: [path] }),
      })
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })

      render(
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      )

      const title = await screen.findByRole('heading', { name: heading })
      expect(title.closest('main')).toHaveClass('console-page-wide')
    }
  )
})
