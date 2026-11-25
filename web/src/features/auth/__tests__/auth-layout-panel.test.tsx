import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { ThemeProvider } from '@/context/theme-provider'
import { api } from '@/lib/api'

import { AuthLayout } from '../auth-layout'

async function renderAuthLayout(statusData: Record<string, unknown>) {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: statusData,
    },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const root = createRootRoute()
  const signUp = createRoute({
    getParentRoute: () => root,
    path: '/sign-up',
    component: () => (
      <AuthLayout>
        <div>Sign Up Body</div>
      </AuthLayout>
    ),
  })
  const signIn = createRoute({
    getParentRoute: () => root,
    path: '/sign-in',
    component: () => (
      <AuthLayout>
        <div>Sign In Body</div>
      </AuthLayout>
    ),
  })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <div>Home</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, signIn, signUp]),
    history: createMemoryHistory({ initialEntries: ['/sign-up'] }),
  })
  await router.load()

  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('shows platform advantages, QQ email note, and spam folder hint when auth domains are disabled', async () => {
  await renderAuthLayout({
    auth_domains_enabled: false,
    api_info_enabled: true,
    api_info: [
      { id: 1, route: '主站直连', url: 'https://magirouter.com' },
      { id: 2, route: '备用节点', url: 'https://us.magirouter.com' },
    ],
  })

  expect(await screen.findByText(/One API Key\./)).toBeVisible()
  expect(
    screen.getByText('Registration currently supports QQ Mail (@qq.com) only')
  ).toBeVisible()
  expect(
    screen.getByText(
      'Missing verification code? Check your Spam / Trash folder'
    )
  ).toBeVisible()
  expect(
    screen.queryByText('https://us.magirouter.com')
  ).not.toBeInTheDocument()
})

test('syncs only actual configured domains without fabricating extra entries when enabled', async () => {
  await renderAuthLayout({
    auth_domains_enabled: true,
    auth_domains: [
      { id: 1, route: '主站直连', url: 'https://magirouter.com/v1' },
      { id: 2, route: '香港备用', url: 'https://hk.magirouter.com/' },
    ],
  })

  expect(await screen.findByText('https://magirouter.com')).toBeVisible()
  expect(screen.getByText('https://hk.magirouter.com')).toBeVisible()
  expect(document.body).not.toHaveTextContent('cn.magirouter.com')
  expect(document.body).not.toHaveTextContent('cf.magirouter.com')
  expect(document.body).not.toHaveTextContent('us.magirouter.com')
})
