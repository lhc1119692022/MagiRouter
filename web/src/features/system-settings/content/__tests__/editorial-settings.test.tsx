import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { AnnouncementsSection } from '../announcements-section'
import { FAQSection } from '../faq-section'

test('publishing a category and title keeps the old severity, content, id and extra fields', async () => {
  const user = userEvent.setup()
  const write = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  const original = {
    id: 8,
    content: 'Old content',
    publishDate: '2026-11-02T12:00:00Z',
    type: 'warning',
    extra: 'Note',
    preserved: 'extension',
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AnnouncementsSection enabled data={JSON.stringify([original])} />
    </QueryClientProvider>
  )
  await user.click(await screen.findByRole('button', { name: 'Edit' }))
  const form = within(screen.getByRole('dialog'))
  await user.type(
    form.getByRole('textbox', { name: 'Notice headline' }),
    'Service update'
  )
  await user.click(form.getByRole('combobox', { name: 'Timeline category' }))
  await user.click(await screen.findByRole('option', { name: 'Group changes' }))
  await user.type(
    form.getByRole('textbox', { name: 'Badge text (optional)' }),
    'Group launch'
  )
  await user.click(form.getByRole('button', { name: 'Update' }))
  await user.click(screen.getByRole('button', { name: 'Save Settings' }))
  expect(write).toHaveBeenCalledTimes(1)
  const payload = write.mock.calls[0]?.[1] as { key: string; value: string }
  expect(payload.key).toBe('console_setting.announcements')
  expect(JSON.parse(payload.value)).toEqual([
    {
      ...original,
      category: 'group',
      kindLabel: 'Group launch',
      title: 'Service update',
    },
  ])
})

test('reordering FAQ persists the published order through the original option', async () => {
  const write = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  const first = { id: 20, question: 'Earlier', answer: 'First answer' }
  const second = { id: 10, question: 'Later', answer: 'Next answer' }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FAQSection enabled data={JSON.stringify([first, second])} />
    </QueryClientProvider>
  )
  const row = await screen.findByRole('row', { name: /Later/ })
  await userEvent.click(within(row).getByRole('button', { name: 'Move up' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
  expect(write).toHaveBeenCalledWith('/api/option/', {
    key: 'console_setting.faq',
    value: JSON.stringify([second, first]),
  })
})
