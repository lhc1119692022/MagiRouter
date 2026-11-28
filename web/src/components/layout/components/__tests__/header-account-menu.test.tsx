import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { PublicHeader } from '../public-header'

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: {}, loading: false }),
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({
    announcements: [],
    notice: '',
    noticeImages: [],
    closePopover: () => {},
  }),
}))
vi.mock('@/context/theme-provider', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))

const originalUser = useAuthStore.getState().auth.user
const originalCurrency = useSystemConfigStore.getState().config.currency

afterEach(() => {
  act(() => {
    useAuthStore.getState().auth.setUser(originalUser)
    useSystemConfigStore.getState().setConfig({ currency: originalCurrency })
  })
})

async function renderHeader(quota?: number, role = 1) {
  useSystemConfigStore
    .getState()
    .setConfig({ currency: DEFAULT_CURRENCY_CONFIG })
  useAuthStore
    .getState()
    .auth.setUser({ id: 8, username: 'menu-fixture', role, quota })
  const onCommands = vi.fn()
  const root = createRootRoute({
    component: () => (
      <>
        <PublicHeader
          showBanner={false}
          showNotifications={false}
          onOpenCommands={onCommands}
        />
        <Outlet />
      </>
    ),
  })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => null,
  })
  const wallet = createRoute({
    getParentRoute: () => root,
    path: '/wallet',
    component: () => <h1>Wallet destination</h1>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, wallet]),
    history: createMemoryHistory(),
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  const trigger = await screen.findByTitle('Account menu')
  return { trigger, router, onCommands, user: userEvent.setup() }
}

test('a single recharge action inside the balance group opens the wallet and removes the redundant menu rows', async () => {
  const { trigger, router, onCommands, user } = await renderHeader(1_000_000)
  await user.click(trigger)
  const menu = within(await screen.findByRole('menu', { name: 'Account menu' }))
  const balance = within(menu.getByRole('group', { name: 'Available Balance' }))
  expect(balance.getByText('$2')).toBeVisible()
  expect(menu.getAllByRole('menuitem')).toHaveLength(4)
  expect(menu.queryByRole('menuitem', { name: /Command palette/i })).toBeNull()
  expect(menu.getAllByRole('menuitem', { name: /Recharge/ })).toHaveLength(1)
  expect(menu.getByRole('menuitem', { name: 'Console' })).toBeVisible()
  expect(
    menu.getByRole('menuitem', { name: 'Account security' })
  ).toHaveAttribute('href', '/security')
  expect(menu.getByRole('menuitem', { name: 'Log out' })).toBeVisible()
  expect(menu.getAllByText('menu-fixture')).toHaveLength(1)
  const recharge = balance.getByRole('menuitem', { name: 'Recharge' })
  expect(recharge).toHaveAttribute('href', '/wallet')
  await user.click(recharge)
  expect(
    await screen.findByRole('heading', { name: 'Wallet destination' })
  ).toBeVisible()
  expect(router.state.location.pathname).toBe('/wallet')
  expect(screen.queryByRole('menu', { name: 'Account menu' })).toBeNull()
  expect(onCommands).not.toHaveBeenCalled()
})

test('the displayed balance keeps zero and responds to a change of configured currency without changing the user', async () => {
  const { trigger, user } = await renderHeader(0)
  await user.click(trigger)
  const balance = within(
    await screen.findByRole('group', { name: 'Available Balance' })
  )
  expect(balance.getByText('$0')).toBeVisible()
  act(() =>
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CUSTOM',
        customCurrencySymbol: '€',
      },
    })
  )
  expect(balance.getByText('€ 0')).toBeVisible()
})

test('keyboard users can open the menu, move from recharge to console, and return focus with Escape', async () => {
  const { trigger, user } = await renderHeader()
  trigger.focus()
  await user.keyboard('{ArrowDown}')
  const menu = within(await screen.findByRole('menu', { name: 'Account menu' }))
  await waitFor(() =>
    expect(menu.getByRole('menuitem', { name: 'Recharge' })).toHaveFocus()
  )
  await user.keyboard('{ArrowDown}')
  expect(menu.getByRole('menuitem', { name: 'Console' })).toHaveFocus()
  await user.keyboard('{Escape}')
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

test('sign out still opens the confirmation dialog and can be cancelled without affecting the session', async () => {
  const { trigger, user } = await renderHeader()
  await user.click(trigger)
  await user.click(await screen.findByRole('menuitem', { name: 'Log out' }))
  const dialog = await screen.findByRole('alertdialog', { name: 'Sign out' })
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(dialog).not.toBeInTheDocument())
  expect(useAuthStore.getState().auth.user?.username).toBe('menu-fixture')
})

test('administrators see Site Overview and root administrators also see System Settings in the account menu', async () => {
  const regular = await renderHeader(1_000_000, 1)
  await regular.user.click(regular.trigger)
  const regularMenu = within(
    await screen.findByRole('menu', { name: 'Account menu' })
  )
  expect(
    regularMenu.queryByRole('menuitem', { name: 'Site Overview' })
  ).toBeNull()
  expect(
    regularMenu.queryByRole('menuitem', { name: 'System Settings' })
  ).toBeNull()
  await regular.user.keyboard('{Escape}')

  cleanup()
  const admin = await renderHeader(1_000_000, 10)
  await admin.user.click(admin.trigger)
  const adminMenu = within(
    await screen.findByRole('menu', { name: 'Account menu' })
  )
  expect(
    adminMenu.getByRole('menuitem', { name: 'Site Overview' })
  ).toHaveAttribute('href', '/site-overview')
  expect(
    adminMenu.queryByRole('menuitem', { name: 'System Settings' })
  ).toBeNull()
  await admin.user.keyboard('{Escape}')

  cleanup()
  const root = await renderHeader(1_000_000, 100)
  await root.user.click(root.trigger)
  const rootMenu = within(
    await screen.findByRole('menu', { name: 'Account menu' })
  )
  expect(
    rootMenu.getByRole('menuitem', { name: 'Site Overview' })
  ).toHaveAttribute('href', '/site-overview')
  expect(
    rootMenu.getByRole('menuitem', { name: 'System Settings' })
  ).toHaveAttribute('href', '/system-settings/site')
})
