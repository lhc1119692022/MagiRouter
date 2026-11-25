import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { BillingHistoryCard } from '../components/billing-history-card'
import { RechargeFormCard } from '../components/recharge-form-card'
import { SubscriptionPlansCard } from '../components/subscription-plans-card'
import { WalletStatsCard } from '../components/wallet-stats-card'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.setUser(null)
})

test('shows prominent invoicing not supported notice in RechargeFormCard', () => {
  render(
    <RechargeFormCard
      topupInfo={{
        enable_online_topup: true,
        enable_stripe_topup: false,
        pay_methods: [],
        min_topup: 1,
        stripe_min_topup: 1,
        amount_options: [10],
        discount: {},
      }}
      presetAmounts={[{ value: 10 }]}
      selectedPreset={null}
      topupAmount={10}
      paymentAmount={10}
      calculating={false}
      paymentLoading={null}
      redemptionCode=''
      redeeming={false}
      onSelectPreset={vi.fn()}
      onTopupAmountChange={vi.fn()}
      onPaymentMethodSelect={vi.fn()}
      onRedemptionCodeChange={vi.fn()}
      onRedeem={vi.fn()}
    />
  )

  expect(screen.getByText('Invoicing Not Yet Supported')).toBeVisible()
  expect(
    screen.getByText(
      /does not support issuing invoices yet\. Please follow site announcements/
    )
  ).toBeVisible()
})

test('keeps SubscriptionPlansCard visible with Coming Soon state and admin configuration links when no plans exist', async () => {
  useAuthStore
    .getState()
    .auth.setUser({ id: 1, username: 'admin', role: ROLE.ADMIN })
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/subscription/plans') {
      return { data: { success: true, data: [] } }
    }
    if (url === '/api/subscription/self') {
      return {
        data: {
          success: true,
          data: {
            billing_preference: 'subscription_first',
            subscriptions: [],
            all_subscriptions: [],
          },
        },
      }
    }
    throw new Error(`Unexpected GET ${url}`)
  })

  const root = createRootRoute()
  const wallet = createRoute({
    getParentRoute: () => root,
    path: '/wallet',
    component: () => (
      <SubscriptionPlansCard
        topupInfo={{
          enable_online_topup: true,
          enable_stripe_topup: false,
          pay_methods: [{ name: 'Alipay', type: 'alipay' }],
          min_topup: 1,
          stripe_min_topup: 1,
          amount_options: [10],
          discount: {},
          payment_compliance_confirmed: true,
        }}
      />
    ),
  })
  const subscriptions = createRoute({
    getParentRoute: () => root,
    path: '/subscriptions',
    component: () => <div>Subscriptions</div>,
  })
  const billing = createRoute({
    getParentRoute: () => root,
    path: '/system-settings/billing/$section',
    component: () => <div>Billing</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([wallet, subscriptions, billing]),
    history: createMemoryHistory({ initialEntries: ['/wallet'] }),
  })
  await router.load()

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )

  expect(await screen.findByText('Coming Soon')).toBeVisible()
  expect(
    screen.getByText('Subscription plans are being prepared')
  ).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'Open Subscription Manager' })
  ).toHaveAttribute('href', '/subscriptions')
  expect(
    screen.getByRole('link', { name: 'Billing Settings Panel' })
  ).toHaveAttribute('href', '/system-settings/billing/subscriptions')
})

test('hides admin configuration shortcuts from regular users on empty subscription panel', async () => {
  useAuthStore
    .getState()
    .auth.setUser({ id: 2, username: 'member', role: ROLE.USER })
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/subscription/plans') {
      return { data: { success: true, data: [] } }
    }
    if (url === '/api/subscription/self') {
      return {
        data: {
          success: true,
          data: {
            billing_preference: 'subscription_first',
            subscriptions: [],
            all_subscriptions: [],
          },
        },
      }
    }
    throw new Error(`Unexpected GET ${url}`)
  })

  const root = createRootRoute()
  const wallet = createRoute({
    getParentRoute: () => root,
    path: '/wallet',
    component: () => (
      <SubscriptionPlansCard
        topupInfo={{
          enable_online_topup: true,
          enable_stripe_topup: false,
          pay_methods: [],
          min_topup: 1,
          stripe_min_topup: 1,
          amount_options: [10],
          discount: {},
          payment_compliance_confirmed: true,
        }}
      />
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([wallet]),
    history: createMemoryHistory({ initialEntries: ['/wallet'] }),
  })
  await router.load()

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )

  expect(await screen.findByText('Coming Soon')).toBeVisible()
  expect(
    screen.queryByRole('link', { name: 'Open Subscription Manager' })
  ).not.toBeInTheDocument()
})

test('renders compact billing balance hero with rate badge and invoicing note', async () => {
  const root = createRootRoute()
  const wallet = createRoute({
    getParentRoute: () => root,
    path: '/wallet',
    component: () => (
      <WalletStatsCard
        user={{
          id: 1,
          username: 'tester',
          quota: 100000000,
          used_quota: 5000000,
          request_count: 12,
          aff_quota: 0,
          aff_history_quota: 0,
          aff_count: 0,
        }}
      />
    ),
  })
  const docs = createRoute({
    getParentRoute: () => root,
    path: '/docs',
    component: () => <div>Docs</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([wallet, docs]),
    history: createMemoryHistory({ initialEntries: ['/wallet'] }),
  })
  await router.load()

  render(<RouterProvider router={router} />)

  expect(await screen.findByText('Current Available Balance')).toBeVisible()
  expect(screen.getByText('1:1 USD Exchange Billing')).toBeVisible()
  expect(
    screen.getByText('Invoicing is not yet supported during early launch.')
  ).toBeVisible()
  expect(screen.getByRole('link', { name: 'Billing rules' })).toHaveAttribute(
    'href',
    '/docs?doc=billing-model'
  )
})

test('always displays BillingHistoryCard table placeholder even when there are no top-up records', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        items: [],
        total: 0,
      },
    },
  })

  render(<BillingHistoryCard />)

  expect(await screen.findByText('No top-up records yet')).toBeVisible()
  expect(screen.getByText('Top-up & Order History')).toBeVisible()
  expect(
    screen.getByRole('columnheader', { name: 'Order Number' })
  ).toBeVisible()
  expect(screen.getByRole('columnheader', { name: 'Status' })).toBeVisible()
})

test('shows payment gateway configuration button for admins when online top-up is disabled', () => {
  const onOpenPaymentSettings = vi.fn()
  render(
    <RechargeFormCard
      topupInfo={{
        enable_online_topup: false,
        enable_stripe_topup: false,
        pay_methods: [],
        min_topup: 1,
        stripe_min_topup: 1,
        amount_options: [10],
        discount: {},
      }}
      presetAmounts={[]}
      selectedPreset={null}
      topupAmount={0}
      paymentAmount={0}
      calculating={false}
      paymentLoading={null}
      redemptionCode=''
      redeeming={false}
      onSelectPreset={vi.fn()}
      onTopupAmountChange={vi.fn()}
      onPaymentMethodSelect={vi.fn()}
      onRedemptionCodeChange={vi.fn()}
      onRedeem={vi.fn()}
      onOpenPaymentSettings={onOpenPaymentSettings}
    />
  )

  expect(
    screen.getByRole('button', { name: 'Configure Payment Gateway' })
  ).toBeVisible()
})
