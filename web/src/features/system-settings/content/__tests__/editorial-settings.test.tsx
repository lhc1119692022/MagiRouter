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

test('auto-sync model notices switch persists option and renders auto-synced badge', async () => {
  const user = userEvent.setup()
  const write = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  const autoNotice = {
    id: 101,
    title: 'Model launched: deepseek-v4',
    category: 'model',
    kindLabel: 'Model launch',
    content: 'Newly available models (1): deepseek-v4',
    publishDate: '2026-11-27T11:20:00Z',
    type: 'success',
    source: 'auto_model_sync',
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AnnouncementsSection
        enabled
        autoModelChangeNoticeEnabled
        data={JSON.stringify([autoNotice])}
      />
    </QueryClientProvider>
  )
  expect(await screen.findByText('Auto-synced')).toBeInTheDocument()
  const toggle = screen.getByRole('switch', {
    name: /Auto-sync model notices/i,
  })
  await user.click(toggle)
  expect(write).toHaveBeenCalledWith('/api/option/', {
    key: 'console_setting.auto_model_change_notice_enabled',
    value: false,
  })
})
test('adding announcement images via link and local file upload persists images and supports title-only image posts', async () => {
  const user = userEvent.setup()
  const write = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AnnouncementsSection enabled data='[]' />
    </QueryClientProvider>
  )

  await user.click(
    await screen.findByRole('button', { name: 'Add Announcement' })
  )
  const dialog = within(screen.getByRole('dialog'))

  await user.type(
    dialog.getByRole('textbox', { name: 'Notice headline' }),
    'Holiday poster'
  )
  await user.type(
    dialog.getByRole('textbox', { name: 'Announcement image URL' }),
    'https://cdn.example.com/holiday.png'
  )
  await user.click(dialog.getByRole('button', { name: 'Add image link' }))

  const fileInput = screen
    .getByRole('dialog')
    .querySelector('input[type="file"]') as HTMLInputElement | null
  if (!fileInput) {
    throw new Error('Expected announcement image file input')
  }
  const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
  const uploadFile = new File([pngBytes], 'promo.png', { type: 'image/png' })
  await user.upload(fileInput, uploadFile)

  expect(await dialog.findByAltText('Announcement image 2')).toBeInTheDocument()

  await user.click(dialog.getByRole('button', { name: 'Add' }))
  await user.click(screen.getByRole('button', { name: 'Save Settings' }))

  expect(write).toHaveBeenCalled()
  const lastCall = write.mock.calls.at(-1)?.[1] as {
    key: string
    value: string
  }
  expect(lastCall.key).toBe('console_setting.announcements')
  const saved = JSON.parse(lastCall.value) as Array<{
    title?: string
    content: string
    images?: string[]
  }>
  expect(saved).toHaveLength(1)
  expect(saved[0]?.title).toBe('Holiday poster')
  expect(saved[0]?.content).toBe('')
  expect(saved[0]?.images).toHaveLength(2)
  expect(saved[0]?.images?.[0]).toBe('https://cdn.example.com/holiday.png')
  expect(saved[0]?.images?.[1]).toMatch(/^data:image\/png;base64,/)
})

test('FAQ editor preview preserves single line breaks while editing multi-line answers', async () => {
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FAQSection
        enabled
        data={JSON.stringify([
          {
            id: 1,
            question: 'Error code guide',
            answer: '・4xx client error.\n・5xx server error.',
          },
        ])}
      />
    </QueryClientProvider>
  )

  await user.click(await screen.findByRole('button', { name: 'Edit' }))
  const dialog = within(screen.getByRole('dialog'))
  await user.click(dialog.getByRole('button', { name: 'Preview' }))

  const previewLine = dialog.getByText(/4xx client error\./)
  expect(previewLine.querySelector('br')).not.toBeNull()
  expect(previewLine).toHaveTextContent('・5xx server error.')
})
