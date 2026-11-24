import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { AnnouncementsPanel } from '../announcements-panel'
import { FAQPanel } from '../faq-panel'

const clients: QueryClient[] = []

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
})

async function showPanels(status: Record<string, unknown>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: { success: true, data: status },
  }))
  client.setQueryData(['status'], status)
  const root = createRootRoute()
  const overview = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <>
        <AnnouncementsPanel />
        <FAQPanel />
      </>
    ),
  })
  const about = createRoute({
    getParentRoute: () => root,
    path: '/about',
    component: () => <h1>Archive destination</h1>,
  })
  const docs = createRoute({
    getParentRoute: () => root,
    path: '/docs',
    component: () => <h1>Docs destination</h1>,
  })
  const router = createRouter({
    routeTree: root.addChildren([overview, about, docs]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}

const notices = [1, 3, 5, 2, 4].map((day) => ({
  id: day,
  title: `Release ${day}`,
  content: `Details **published ${day}**`,
  extra: `Note ${day}`,
  category: 'group',
  type: 'warning',
  publishDate: `2026-11-0${day}T12:00:00Z`,
}))

test('the four latest configured notices use their timeline category and open the original full details', async () => {
  await showPanels({
    announcements: notices,
    announcements_enabled: true,
    faq_enabled: false,
  })
  const panel = within(
    await screen.findByRole('region', { name: 'Recent notices' })
  )
  const rows = panel.getAllByRole('button', { name: /Release/ })
  expect(rows.map((row) => row.querySelector('time')?.dateTime)).toEqual(
    [5, 4, 3, 2].map((day) => `2026-11-0${day}T12:00:00Z`)
  )
  const latest = panel.getByRole('button', { name: /Release 5/ })
  expect(within(latest).getByText('Group changes')).toBeVisible()
  expect(panel.getByRole('link', { name: 'See all notices' })).toHaveAttribute(
    'href',
    '/about#timeline-feed-section'
  )
  await userEvent.click(latest)
  const detail = within(await screen.findByRole('dialog'))
  expect(detail.getByText('published 5').tagName).toBe('STRONG')
  expect(detail.getByText('Note 5')).toBeVisible()
})

test('when the site hides its timeline, all published records remain readable without a dead link', async () => {
  await showPanels({
    HeaderNavModules: '{"about":false}',
    announcements_enabled: true,
    announcements: notices,
  })
  const panel = within(
    await screen.findByRole('region', { name: 'Recent notices' })
  )
  expect(panel.queryByRole('link', { name: 'See all notices' })).toBeNull()
  await userEvent.click(panel.getByRole('button', { name: 'See all notices' }))
  expect(panel.getByText('Release 1')).toBeVisible()
})

test('an explicit headline or question keeps identifiers and punctuation exactly as published', async () => {
  await showPanels({
    announcements_enabled: true,
    announcements: [
      { id: 12, title: 'Release model_a #2', content: 'Details' },
    ],
    faq_enabled: true,
    faq: [{ id: 13, question: 'Can I use **model_a**?', answer: 'Yes' }],
  })
  expect(
    await screen.findByRole('button', { name: /Release model_a #2/ })
  ).toBeVisible()
  const question = screen.getByRole('button', { name: /Can I use model_a/ })
  expect(within(question).getByText('model_a').tagName).toBe('STRONG')
})

test('FAQ starts with the first published answer open, supports Markdown, single opening and external documentation', async () => {
  await showPanels({
    faq_enabled: true,
    docs_link: 'https://guides.example.org/help#start',
    faq: [
      { id: 7, question: 'First question', answer: 'Read **this** answer.' },
      { id: 9, question: 'Second question', answer: 'Another answer.' },
    ],
  })
  const panel = within(
    await screen.findByRole('region', {
      name: 'Frequently asked questions (FAQ)',
    })
  )
  const first = panel.getByRole('button', { name: 'First question' })
  const second = panel.getByRole('button', { name: 'Second question' })
  expect(first).toHaveAttribute('aria-expanded', 'true')
  expect(panel.getByText('this').tagName).toBe('STRONG')
  expect(
    panel.getByRole('link', { name: 'Read documentation' })
  ).toHaveAttribute('href', 'https://guides.example.org/help#start')
  second.focus()
  await userEvent.keyboard('{Enter}')
  expect(second).toHaveAttribute('aria-expanded', 'true')
  expect(first).toHaveAttribute('aria-expanded', 'false')
  await userEvent.keyboard(' ')
  expect(second).toHaveAttribute('aria-expanded', 'false')
})

test('a disabled public module never displays previously cached items or a disabled documentation link', async () => {
  await showPanels({
    HeaderNavModules: '{"docs":false}',
    announcements_enabled: false,
    announcements: notices,
    faq_enabled: true,
    faq: [],
  })
  expect(await screen.findByText('No FAQ entries available')).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Read documentation' })).toBeNull()
  expect(screen.queryByRole('region', { name: 'Recent notices' })).toBeNull()
  expect(screen.queryByText('Release 5')).toBeNull()
})

test('a malformed public list is reported as unavailable rather than a successful empty list', async () => {
  await showPanels({
    faq_enabled: true,
    faq: 'bad data',
    announcements_enabled: true,
    announcements: {},
  })
  expect(await screen.findAllByRole('alert')).toHaveLength(2)
  expect(screen.queryByText('No FAQ entries available')).toBeNull()
})

test('a configured internal documentation article and section are preserved by the FAQ link', async () => {
  await showPanels({
    faq_enabled: true,
    faq: [],
    docs_link: '/docs?doc=quickstart#doc-sec-auth',
  })
  expect(
    await screen.findByRole('link', { name: 'Read documentation' })
  ).toHaveAttribute('href', '/docs?doc=quickstart#doc-sec-auth')
})
