import { readFileSync } from 'node:fs'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'
import { useNotificationStore } from '@/stores/notification-store'

import { PublicHeader } from '../public-header'

const mockAnnouncements = [
  {
    id: 1,
    publishDate: '2026-11-28T00:53:21Z',
    title: '模型上线：seedream-5.5',
    content: '新上线模型（1个）：seedream-5.5',
    extra: '手动补充说明',
    images: ['https://cdn.example.com/seedream.png'],
  },
  {
    id: 2,
    publishDate: '2026-11-28T00:48:51Z',
    title: '模型下线：deepseek-v4-pro',
    content:
      '以下模型已下线并暂停服务（1个）：deepseek-v4-pro\n原所属分组：国模「特惠」',
    extra: '后台管理自动同步',
    source: 'auto_model_sync',
  },
]

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: {
      announcements_enabled: true,
      announcements: mockAnnouncements,
    },
    loading: false,
  }),
}))
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getNotice: vi.fn().mockResolvedValue({
      success: true,
      data: '站点运行正常',
      images: ['https://cdn.example.com/site-notice-qr.png'],
    }),
  }
})
vi.mock('@/context/theme-provider', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))

const stylesheet = document.createElement('style')
const originalUser = useAuthStore.getState().auth.user

beforeAll(() => {
  stylesheet.textContent = readFileSync(
    'src/styles/elevenlabs-spec.css',
    'utf8'
  )
  document.head.appendChild(stylesheet)
})

afterAll(() => {
  stylesheet.remove()
})

afterEach(() => {
  act(() => {
    useAuthStore.getState().auth.setUser(originalUser)
    useNotificationStore.setState({
      lastReadNotice: '',
      readAnnouncementKeys: [],
    })
  })
})

async function renderHeader() {
  useAuthStore.getState().auth.setUser({
    id: 8,
    username: 'notify-fixture',
    role: 1,
    quota: 1_000_000,
  })
  const root = createRootRoute({
    component: () => (
      <>
        <PublicHeader showBanner={false} showNotifications />
        <Outlet />
      </>
    ),
  })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => null,
  })
  const about = createRoute({
    getParentRoute: () => root,
    path: '/about',
    component: () => <h1>Timeline</h1>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, about]),
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
  const trigger = await screen.findByRole('button', { name: 'Notifications' })
  return { trigger, user: userEvent.setup() }
}

test('notification cards have symmetric horizontal and vertical insets matching the popover header', async () => {
  const { trigger, user } = await renderHeader()
  await user.click(trigger)

  const dialog = await screen.findByRole('dialog', { name: 'Notifications' })
  const notificationsTab = within(dialog).getByRole('tab', {
    name: /Notifications/,
  })
  await user.click(notificationsTab)

  const firstCard = within(dialog)
    .getByText('模型上线：seedream-5.5')
    .closest('.nav-notice-item')
  const secondCard = within(dialog)
    .getByText('模型下线：deepseek-v4-pro')
    .closest('.nav-notice-item')
  const head = within(dialog).getByRole('tablist').parentElement

  if (!firstCard || !secondCard || !head) {
    throw new Error('Expected notification cards and popover header')
  }

  const list = firstCard.parentElement
  expect(list).toBe(secondCard.parentElement)
  if (!list) {
    throw new Error('Expected notification cards inside a list container')
  }

  const headStyle = getComputedStyle(head)
  const listStyle = getComputedStyle(list)

  expect(headStyle.paddingLeft).toBe('14px')
  expect(headStyle.paddingRight).toBe('14px')
  expect(listStyle.paddingLeft).toBe(headStyle.paddingLeft)
  expect(listStyle.paddingRight).toBe(headStyle.paddingRight)
  expect(listStyle.paddingTop).toBe('12px')
  expect(listStyle.paddingBottom).toBe('12px')
  expect(listStyle.display).toBe('flex')
  expect(listStyle.flexDirection).toBe('column')
  expect(listStyle.gap).toBe('10px')
})

test('notification popover renders full notice body content and fully expanded images', async () => {
  const { trigger, user } = await renderHeader()
  await user.click(trigger)

  const dialog = await screen.findByRole('dialog', { name: 'Notifications' })
  const noticeTabImgButton = within(dialog).getByRole('button', {
    name: 'Preview announcement image 1',
  })
  expect(noticeTabImgButton).toHaveClass('w-full')
  expect(noticeTabImgButton).not.toHaveClass('h-16')
  expect(
    within(noticeTabImgButton).getByAltText('Announcement image 1')
  ).toHaveAttribute('src', 'https://cdn.example.com/site-notice-qr.png')

  await user.click(within(dialog).getByRole('tab', { name: /Notifications/ }))

  expect(
    within(dialog).getByText(/新上线模型（1个）：seedream-5.5/)
  ).toBeVisible()
  expect(within(dialog).getByText(/手动补充说明/)).toBeVisible()
  expect(
    within(dialog).getByText(/以下模型已下线并暂停服务（1个）：deepseek-v4-pro/)
  ).toBeVisible()
  expect(within(dialog).queryByText(/后台管理自动同步/)).toBeNull()

  const thumbButton = within(dialog).getByRole('button', {
    name: 'Preview announcement image 1',
  })
  expect(thumbButton).toHaveClass('w-full')
  expect(thumbButton).not.toHaveClass('h-16')
  const expandedImg = within(thumbButton).getByAltText('Announcement image 1')
  expect(expandedImg).toHaveAttribute(
    'src',
    'https://cdn.example.com/seedream.png'
  )
  expect(expandedImg).toHaveClass('object-contain')

  await user.click(thumbButton)
  const preview = await screen.findByRole('dialog', { name: 'Image preview' })
  expect(within(preview).getByAltText('Announcement image 1')).toHaveAttribute(
    'src',
    'https://cdn.example.com/seedream.png'
  )
})
