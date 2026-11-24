import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { SubscriptionsMutateDrawer } from '../subscriptions-mutate-drawer'
import {
  SubscriptionsProvider,
  useSubscriptions,
} from '../subscriptions-provider'

function Availability() {
  const { complianceConfirmed } = useSubscriptions()
  return (
    <button type='button' disabled={!complianceConfirmed}>
      Create plan
    </button>
  )
}

afterEach(() => useAuthStore.getState().auth.setUser(null))

test.each([ROLE.ADMIN, ROLE.SUPER_ADMIN])(
  'role %i opens the plan editor without loading unavailable gateway settings',
  async (role) => {
    useAuthStore.getState().auth.setUser({ id: 1, username: 'operator', role })
    const catalog = '/api/option/waffo-pancake/subscription-product-options'
    const reads = vi
      .spyOn(api, 'get')
      .mockImplementation(async (url: string) => {
        if (url === '/api/user/topup/info') {
          return {
            data: {
              success: true,
              data: { payment_compliance_confirmed: true },
            },
          }
        }
        if (url === '/api/group') {
          return { data: { success: true, data: ['default'] } }
        }
        if (url === catalog) {
          return { data: { message: 'success', data: { products: [] } } }
        }
        throw new Error('Unexpected settings request')
      })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <SubscriptionsProvider>
          <SubscriptionsMutateDrawer open onOpenChange={vi.fn()} />
        </SubscriptionsProvider>
      </QueryClientProvider>
    )
    await waitFor(() => expect(reads).toHaveBeenCalledWith('/api/group'))
    const paths = reads.mock.calls.map(([path]) => path)
    expect(paths.includes(catalog)).toBe(role === ROLE.SUPER_ADMIN)
    expect(paths).not.toContain('/api/option/')
    expect(screen.getByRole('dialog')).toBeVisible()
  }
)

test.each([true, false])(
  'plan changes follow the server compliance flag (%s) without reading private system options',
  async (confirmed) => {
    const reads = vi
      .spyOn(api, 'get')
      .mockImplementation(async (url: string) => {
        if (url !== '/api/user/topup/info') {
          throw new Error('Unexpected privileged endpoint')
        }
        return {
          data: {
            success: true,
            data: { payment_compliance_confirmed: confirmed },
          },
        }
      })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <SubscriptionsProvider>
          <Availability />
        </SubscriptionsProvider>
      </QueryClientProvider>
    )
    await waitFor(() =>
      expect(reads).toHaveBeenCalledWith('/api/user/topup/info')
    )
    if (confirmed) {
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Create plan' })
        ).toBeEnabled()
      )
    } else {
      expect(screen.getByRole('button', { name: 'Create plan' })).toBeDisabled()
    }
    expect(reads.mock.calls.map(([url]) => url)).not.toContain('/api/option/')
  }
)
