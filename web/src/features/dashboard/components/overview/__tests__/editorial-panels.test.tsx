import { readFileSync } from 'node:fs'

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
test('FAQ keeps unified panel header typography while enlarging FAQ item readability', async () => {
  const style = document.createElement('style')
  style.textContent = [
    readFileSync('src/styles/elevenlabs-spec.css', 'utf8'),
    readFileSync('src/styles/dashboard-editorial.css', 'utf8'),
  ].join('\n')
  document.head.appendChild(style)
  try {
    await showPanels({
      faq_enabled: true,
      announcements_enabled: false,
      faq: [
        {
          id: 11,
          question: 'Error code guide',
          answer:
            '・4xx（客户端错误）：请求本身存在问题。\n・5xx（服务端错误）：服务器内部故障。',
        },
      ],
    })

    const panel = await screen.findByRole('region', {
      name: 'Frequently asked questions (FAQ)',
    })
    expect(panel).toHaveClass('dash-faq-panel')
    const heading = within(panel).getByRole('heading', {
      name: 'Frequently asked questions (FAQ)',
    })
    const docsLink = within(panel).getByRole('link', {
      name: /Read documentation/,
    })
    const trigger = within(panel).getByRole('button', {
      name: /Error code guide/,
    })
    const answer = panel.querySelector('.dash-faq-answer')
    if (!answer) {
      throw new Error('Expected FAQ answer element')
    }
    expect(answer.querySelector('br')).not.toBeNull()
    expect(answer).toHaveTextContent('・4xx（客户端错误）：请求本身存在问题。')
    expect(answer).toHaveTextContent('・5xx（服务端错误）：服务器内部故障。')

    expect(Number.parseFloat(getComputedStyle(heading).fontSize)).toBe(15)
    expect(getComputedStyle(heading).fontWeight).toBe('500')
    expect(Number.parseFloat(getComputedStyle(docsLink).fontSize)).toBe(12.5)
    expect(
      Number.parseFloat(getComputedStyle(trigger).fontSize)
    ).toBeGreaterThanOrEqual(15)
    expect(
      Number.parseFloat(getComputedStyle(answer).fontSize)
    ).toBeGreaterThanOrEqual(14.5)
  } finally {
    style.remove()
  }
})

test('FAQ keeps only one item expanded at a time as more entries are clicked', async () => {
  const user = userEvent.setup()
  await showPanels({
    faq_enabled: true,
    announcements_enabled: false,
    faq: [
      { id: 1, question: 'Error code guide', answer: '4xx and 5xx guide.' },
      { id: 1, question: 'Rate limits', answer: 'RPM and TPM details.' },
      { question: 'Billing rules', answer: 'Quota usage details.' },
    ],
  })

  const panel = within(
    await screen.findByRole('region', {
      name: 'Frequently asked questions (FAQ)',
    })
  )
  const first = panel.getByRole('button', { name: 'Error code guide' })
  const second = panel.getByRole('button', { name: 'Rate limits' })
  const third = panel.getByRole('button', { name: 'Billing rules' })

  expect(first).toHaveAttribute('aria-expanded', 'true')
  expect(second).toHaveAttribute('aria-expanded', 'false')
  expect(third).toHaveAttribute('aria-expanded', 'false')

  await user.click(second)
  expect(first).toHaveAttribute('aria-expanded', 'false')
  expect(second).toHaveAttribute('aria-expanded', 'true')
  expect(third).toHaveAttribute('aria-expanded', 'false')

  await user.click(third)
  expect(first).toHaveAttribute('aria-expanded', 'false')
  expect(second).toHaveAttribute('aria-expanded', 'false')
  expect(third).toHaveAttribute('aria-expanded', 'true')
})

test('recent notices render colored category badges aligned flush with notice titles', async () => {
  const style = document.createElement('style')
  style.textContent = [
    readFileSync('src/styles/elevenlabs-spec.css', 'utf8'),
    readFileSync('src/styles/dashboard-editorial.css', 'utf8'),
  ].join('\n')
  document.head.appendChild(style)
  try {
    await showPanels({
      announcements_enabled: true,
      faq_enabled: false,
      announcements: [
        {
          id: 1,
          title: '模型下线：deepseek-v4-pro',
          content: '已下线',
          category: 'model',
          kindLabel: '模型下线',
          type: 'warning',
          publishDate: '2026-11-28T01:00:39Z',
        },
        {
          id: 2,
          title: '模型上线：seedream-5.5',
          content: '已上线',
          category: 'model',
          kindLabel: '模型上线',
          type: 'success',
          publishDate: '2026-11-28T00:53:21Z',
        },
      ],
    })

    const panel = within(
      await screen.findByRole('region', { name: 'Recent notices' })
    )
    const offlineRow = panel.getByRole('button', {
      name: /模型下线：deepseek-v4-pro/,
    })
    const offlineBadge = within(offlineRow).getByText('模型下线')
    const onlineRow = panel.getByRole('button', {
      name: /模型上线：seedream-5.5/,
    })
    const onlineBadge = within(onlineRow).getByText('模型上线')

    expect(offlineBadge).toHaveAttribute('data-tone', 'warning')
    expect(onlineBadge).toHaveAttribute('data-tone', 'success')
    expect(getComputedStyle(offlineRow).paddingLeft).toBe('0px')
    expect(getComputedStyle(offlineBadge).borderRadius).toBe('6px')
  } finally {
    style.remove()
  }
})

test('announcement detail dialog displays attached images and opens a full-size preview', async () => {
  const user = userEvent.setup()
  await showPanels({
    announcements_enabled: true,
    faq_enabled: false,
    announcements: [
      {
        id: 21,
        title: 'Visual release',
        content: 'Check the attached screenshot.',
        images: ['https://cdn.example.com/release-preview.png'],
        publishDate: '2026-11-28T10:00:00Z',
      },
    ],
  })

  const noticeButton = await screen.findByRole('button', {
    name: /Visual release/,
  })
  await user.click(noticeButton)

  const detail = within(await screen.findByRole('dialog'))
  const thumbnail = detail.getByRole('button', {
    name: 'Preview announcement image 1',
  })
  expect(
    within(thumbnail).getByAltText('Announcement image 1')
  ).toHaveAttribute('src', 'https://cdn.example.com/release-preview.png')

  await user.click(thumbnail)
  const previewDialog = await screen.findByRole('dialog', {
    name: 'Image preview',
  })
  expect(
    within(previewDialog).getByAltText('Announcement image 1')
  ).toHaveAttribute('src', 'https://cdn.example.com/release-preview.png')
})
