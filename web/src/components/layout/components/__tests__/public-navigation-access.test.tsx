import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { PublicHeader } from '../public-header'

const config = vi.hoisted(() => ({
  modules: {} as Record<string, unknown>,
  docs: '',
}))
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: { HeaderNavModules: config.modules, docs_link: config.docs },
    loading: false,
  }),
}))
vi.mock('@/context/theme-provider', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))

async function renderHeader(
  modules: Record<string, unknown>,
  docs = '',
  path = '/'
) {
  config.modules = modules
  config.docs = docs
  const root = createRootRoute({
    component: () => (
      <PublicHeader showBanner={false} showNotifications={false} />
    ),
  })
  const pages = [
    '/',
    '/create',
    '/create/canvas',
    '/playground',
    '/sign-in',
  ].map((destination) =>
    createRoute({ getParentRoute: () => root, path: destination })
  )
  const router = createRouter({
    routeTree: root.addChildren(pages),
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
  await screen.findByRole('button', { name: /Open menu|打开导航菜单/ })
  return router
}

test('disabled header modules stay hidden on desktop and in the mobile menu, including when every module is off', async () => {
  const user = userEvent.setup()
  await renderHeader({
    home: false,
    console: false,
    pricing: false,
    docs: false,
    rankings: false,
    about: false,
  })
  expect(
    screen.queryByRole('link', { name: /^(Docs|文档|Model Square|模型广场)$/ })
  ).toBeNull()
  await user.click(
    screen.getByRole('button', { name: /Open menu|打开导航菜单/ })
  )
  const menu = await screen.findByRole('dialog', { name: /Navigation|导航/ })
  expect(
    within(menu).queryByRole('link', {
      name: /^(Docs|文档|Model Square|模型广场|Console|控制台)$/,
    })
  ).toBeNull()
})

test('both navigation surfaces preserve an external documentation link and the sign-in destination for protected pricing', async () => {
  const user = userEvent.setup()
  await renderHeader(
    { pricing: { enabled: true, requireAuth: true }, docs: true },
    'https://docs.example.test/start'
  )
  const assertLinks = (surface: typeof screen | ReturnType<typeof within>) => {
    const docs = surface.getByRole('link', {
      name: /^(Docs|Documentation|文档)$/,
    })
    expect(docs).toHaveAttribute('href', 'https://docs.example.test/start')
    expect(docs).toHaveAttribute('target', '_blank')
    const url = new URL(
      surface
        .getByRole('link', { name: /^(Model Square|模型广场)$/ })
        .getAttribute('href') ?? '',
      'https://app.example.test'
    )
    expect(url.pathname).toBe('/sign-in')
    expect(url.searchParams.get('redirect')).toBe('/pricing')
  }
  assertLinks(screen)
  await user.click(
    screen.getByRole('button', { name: /Open menu|打开导航菜单/ })
  )
  assertLinks(
    within(await screen.findByRole('dialog', { name: /Navigation|导航/ }))
  )
})

test('publishing a studio destination enables only that item and rejects unsafe destinations', async () => {
  const user = userEvent.setup()
  await renderHeader({
    canvasUrl: 'https://canvas.example.test/editor',
    workbenchUrl: 'javascript:void(0)',
  })
  await user.click(screen.getByRole('button', { name: 'AI Studio' }))
  const menu = within(screen.getByRole('group', { name: 'AI Studio menu' }))
  expect(menu.getByRole('link', { name: /Canvas/ })).toHaveAttribute(
    'href',
    'https://canvas.example.test/editor'
  )
  expect(
    menu.getByRole('button', { name: /Workbench.*Under construction/ })
  ).toBeDisabled()
})

test('a touch opens the navigation; Tab remains inside and Escape restores focus to the trigger', async () => {
  const user = userEvent.setup()
  await renderHeader({ docs: true })
  expect(
    screen.getByRole('button', { name: 'Change language' })
  ).toBeInTheDocument()
  const trigger = screen.getByRole('button', { name: /Open menu|打开导航菜单/ })
  await user.pointer([
    { keys: '[TouchA>]', target: trigger },
    { keys: '[/TouchA]' },
  ])
  const menu = await screen.findByRole('dialog', { name: /Navigation|导航/ })
  await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true))
  for (let step = 0; step < 12; step++) {
    await user.tab()
    expect(menu.contains(document.activeElement)).toBe(true)
  }
  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: /Navigation|导航/ })).toBeNull()
  )
  expect(trigger).toHaveFocus()
})

test('the AI Studio label and arrow toggle one button without navigating; protected destinations live inside', async () => {
  const user = userEvent.setup()
  const router = await renderHeader({
    pricing: { enabled: true, requireAuth: true },
  })
  const navigation = within(
    screen.getByRole('navigation', { name: 'Navigation links' })
  )
  expect(navigation.queryByRole('link', { name: 'AI Studio' })).toBeNull()
  expect(
    navigation.getAllByRole('link').map((link) => link.textContent)
  ).toEqual(['Home', 'Console', 'Model Square', 'Docs', 'Timeline'])
  const disclosure = navigation.getByRole('button', { name: 'AI Studio' })
  expect(disclosure.querySelector('a,button')).toBeNull()
  await user.click(within(disclosure).getByText('AI Studio'))
  expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  const arrow = disclosure.querySelector('svg')
  if (!arrow) throw new Error('Missing disclosure arrow')
  await user.click(arrow)
  expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  expect(router.state.location.href).toBe('/')
  await user.keyboard('{Enter}')
  const menu = within(navigation.getByRole('group', { name: 'AI Studio menu' }))
  const center = menu.getAllByRole('link')[0]
  expect(center).toHaveAccessibleName(/AI Creation Center/)
  const target = new URL(center.getAttribute('href') ?? '', 'http://localhost')
  expect(target.pathname).toBe('/sign-in')
  expect(target.searchParams.get('redirect')).toBe('/create')
  await user.tab()
  expect(center).toHaveFocus()
  expect(
    menu.getByRole('button', { name: /Canvas.*Under construction/ })
  ).toBeDisabled()
  expect(menu.getByRole('button', { name: /Workbench/ })).toBeDisabled()
  expect(
    new URL(
      menu
        .getByRole('link', { name: /All creative models/ })
        .getAttribute('href') ?? '',
      'http://localhost'
    ).searchParams.get('redirect')
  ).toBe('/pricing?task=creative')
  await user.keyboard('{Escape}')
  expect(disclosure).toHaveFocus()
  expect(disclosure).toHaveAttribute('aria-expanded', 'false')
})

test('mobile gives signed-in users the same creation destinations and keeps legacy ranking visibility separate from timeline', async () => {
  const user = userEvent.setup()
  const { auth } = useAuthStore.getState()
  const previous = auth.user
  auth.setUser({
    id: 99,
    username: 'fixture',
    role: 1,
    status: 1,
    group: 'default',
  } as NonNullable<typeof previous>)
  try {
    const router = await renderHeader(
      { rankings: false, about: true, pricing: false },
      '',
      '/playground'
    )
    await user.click(
      screen.getByRole('button', { name: /Open menu|打开导航菜单/ })
    )
    const drawer = within(await screen.findByRole('dialog'))
    const disclosure = drawer.getByRole('button', { name: 'AI Studio' })
    expect(disclosure).toHaveAttribute('aria-current', 'location')
    await user.pointer([
      { keys: '[TouchA>]', target: disclosure },
      { keys: '[/TouchA]' },
    ])
    expect(router.state.location.pathname).toBe('/playground')
    const center = drawer.getByRole('link', { name: /AI Creation Center/ })
    expect(center).toHaveAttribute('href', '/create')
    expect(
      drawer.getByRole('button', { name: /Canvas.*Under construction/ })
    ).toBeDisabled()
    expect(
      drawer.queryByRole('link', { name: /All creative models/ })
    ).not.toBeInTheDocument()
    expect(drawer.getByRole('link', { name: 'Timeline' })).toHaveAttribute(
      'href',
      '/about'
    )
    await user.tab()
    expect(center).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(disclosure).toHaveFocus()
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    await user.keyboard(' ')
    await user.click(drawer.getByRole('link', { name: /AI Creation Center/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/create'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  } finally {
    auth.setUser(previous)
  }
})

test('disabling about hides the timeline without renaming the ranking route or reintroducing a duplicate link', async () => {
  await renderHeader({ rankings: true, about: false, console: false })
  const navigation = within(
    screen.getByRole('navigation', { name: 'Navigation links' })
  )
  expect(
    navigation.queryByRole('link', { name: 'Timeline' })
  ).not.toBeInTheDocument()
  expect(
    navigation.queryByRole('button', { name: 'AI Studio' })
  ).not.toBeInTheDocument()
})

test('an explicit creation switch overrides its legacy console fallback without enabling the console', async () => {
  await renderHeader({ console: false, creation: true })
  const navigation = within(
    screen.getByRole('navigation', { name: 'Navigation links' })
  )
  expect(navigation.getByRole('button', { name: 'AI Studio' })).toBeVisible()
  expect(
    navigation.queryByRole('link', { name: 'Console' })
  ).not.toBeInTheDocument()
})
