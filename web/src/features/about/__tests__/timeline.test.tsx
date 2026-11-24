import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'

import { getRankings } from '@/features/rankings/api'

import { getAboutContent } from '../api'
import { About } from '../index'

const notifications = vi.hoisted(() => ({
  notice: '',
  announcements: [] as Record<string, unknown>[],
  loading: false,
  noticeFailed: false,
  announcementsFailed: false,
  refetchNotice: vi.fn(),
}))
const site = vi.hoisted(() => ({ status: { HeaderNavModules: '{}' } }))

vi.mock('../api', () => ({ getAboutContent: vi.fn() }))
vi.mock('@/features/rankings/api', () => ({ getRankings: vi.fn() }))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => notifications,
}))
vi.mock('@/hooks/use-status', () => ({ useStatus: () => site }))
vi.mock('@/components/layout', () => ({
  PublicLayout: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}))
vi.mock('@/features/magirouter-home/components/brand-footer', () => ({
  BrandFooter: () => null,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

beforeEach(() => {
  vi.mocked(getRankings).mockImplementation(async (period) => ({
    success: true,
    data: {
      models: [
        {
          rank: 1,
          model_name: `published-${period}`,
          vendor: 'Test vendor',
          category: 'all',
          total_tokens: 5000,
          share: 1,
          growth_pct: 0,
        },
      ],
      vendors: [],
      top_movers: [],
      top_droppers: [],
      models_history: { points: [], models: [], buckets: 0 },
      vendor_share_history: { points: [], vendors: [], buckets: 0 },
    },
  }))
  vi.mocked(getAboutContent).mockResolvedValue({
    success: true,
    message: '',
    data: '',
  })
  notifications.notice = ''
  notifications.announcements = []
  notifications.loading = false
  notifications.noticeFailed = false
  notifications.announcementsFailed = false
  site.status.HeaderNavModules = '{}'
})

function openTimeline(showFeed = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <About showFeed={showFeed} />
    </QueryClientProvider>
  )
}

test('empty or disabled announcements do not appear as live events or billing promises', async () => {
  openTimeline()
  expect(
    await screen.findAllByText('No announcements at this time')
  ).toHaveLength(2)
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.queryByText(/magirouter\.com\/v1/)).not.toBeInTheDocument()
})

test('each published entry keeps its date, category and content in a distinct timeline row', async () => {
  notifications.announcements = [
    {
      id: 9,
      content: 'Scheduled maintenance',
      extra: 'Check back at noon.',
      publishDate: '2026-10-12',
      type: 'warning',
    },
  ]
  openTimeline()
  const entry = await screen.findByRole('article', {
    name: 'Scheduled maintenance',
  })
  expect(entry).toHaveClass('timeline-entry')
  expect(within(entry).getByText('2026-10-12').closest('time')).toHaveAttribute(
    'datetime',
    '2026-10-12'
  )
  expect(within(entry).getByText('Site notices')).toBeVisible()
  expect(entry.querySelector('.timeline-entry-rail')).toHaveAttribute(
    'aria-hidden',
    'true'
  )
  expect(within(entry).getByText('Check back at noon.')).toBeVisible()
})

test('pagination, type and keyword filters share a feed and reset to its first page', async () => {
  const user = userEvent.setup()
  notifications.announcements = Array.from({ length: 7 }, (_, index) => ({
    id: index,
    title: `Update ${index}`,
    content: index === 0 ? 'Group policy' : 'Scheduled release',
    publishDate: `2026-10-0${index + 1}`,
  }))
  openTimeline()
  await screen.findByRole('heading', { name: 'Update 6' })
  expect(screen.getAllByRole('article')).toHaveLength(5)
  await user.click(screen.getByRole('button', { name: 'Next page' }))
  expect(screen.getAllByRole('article')).toHaveLength(2)
  expect(
    screen.getByRole('button', { name: '2', current: 'page' })
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Group changes' }))
  expect(screen.getAllByRole('article')).toHaveLength(1)
  await user.type(screen.getByRole('searchbox'), 'missing')
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getAllByRole('article')).toHaveLength(5)
  expect(
    screen.getByRole('button', { name: '1', current: 'page' })
  ).toBeVisible()
})

test('a published badge is searchable without changing the archive category filter', async () => {
  notifications.announcements = [
    {
      content: 'November release',
      category: 'model',
      kindLabel: 'Decommissioned',
    },
  ]
  openTimeline()
  await userEvent.click(
    await screen.findByRole('button', { name: 'Model changes' })
  )
  await userEvent.type(screen.getByRole('searchbox'), 'Decommissioned')
  expect(
    within(screen.getByRole('article')).getByText('Decommissioned')
  ).toBeVisible()
})

test('a configured external about page still takes precedence over the default timeline', async () => {
  vi.mocked(getAboutContent).mockResolvedValue({
    success: true,
    message: '',
    data: 'https://example.invalid/our-site',
  })
  openTimeline()
  expect(await screen.findByTitle('About')).toHaveAttribute(
    'src',
    'https://example.invalid/our-site'
  )
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
})

test('the explicit notice archive anchor reads the published feed even with a custom About page', async () => {
  vi.mocked(getAboutContent).mockClear()
  vi.mocked(getAboutContent).mockResolvedValue({
    success: true,
    message: '',
    data: 'https://example.invalid/our-site',
  })
  notifications.announcements = [
    {
      id: 31,
      title: 'Live timeline entry',
      category: 'model',
      content: 'A new model',
      publishDate: '2026-11-20',
    },
  ]
  openTimeline(true)
  expect(
    await screen.findByRole('article', { name: 'Live timeline entry' })
  ).toBeVisible()
  expect(vi.mocked(getAboutContent)).not.toHaveBeenCalled()
  expect(screen.queryByTitle('About')).toBeNull()
})

test('a failed feed does not report an empty list and a failed notice offers retry', async () => {
  notifications.noticeFailed = true
  notifications.announcementsFailed = true
  openTimeline()
  expect(await screen.findAllByText('Could not load this source')).toHaveLength(
    2
  )
  expect(
    screen.queryByText('No announcements at this time')
  ).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(notifications.refetchNotice).toHaveBeenCalledOnce()
})

test('turning rankings off removes only the rankings action, not the time line or its anchors', async () => {
  site.status.HeaderNavModules = JSON.stringify({
    rankings: false,
    about: true,
  })
  openTimeline()
  expect(await screen.findByRole('heading', { name: 'Timeline' })).toBeVisible()
  expect(
    screen.queryByRole('link', { name: /Rankings/ })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Notifications' })).toHaveAttribute(
    'href',
    '#timeline-feed-section'
  )
})

test('the inline model ranking changes its real query period without leaving the timeline', async () => {
  const user = userEvent.setup()
  openTimeline()
  expect(await screen.findByText('published-week')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Today' }))
  expect(await screen.findByText('published-today')).toBeVisible()
  expect(vi.mocked(getRankings).mock.calls.map(([period]) => period)).toEqual([
    'week',
    'today',
  ])
})

test('a guest does not fetch protected rankings in the otherwise public timeline', async () => {
  site.status.HeaderNavModules = JSON.stringify({
    rankings: { enabled: true, requireAuth: true },
  })
  openTimeline()
  expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/sign-in'
  )
  expect(getRankings).not.toHaveBeenCalled()
  expect(screen.getByRole('heading', { name: 'Site updates' })).toBeVisible()
})
