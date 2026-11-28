import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { NoticeSection } from '../notice-section'

function Fixture({
  defaultValue = '',
  defaultImages = '[]',
}: {
  defaultValue?: string
  defaultImages?: string
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <NoticeSection
          defaultValue={defaultValue}
          defaultImages={defaultImages}
        />
      </SettingsPageProvider>
    </>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

test('NoticeSection lets admins add images, preview notice content, and save both Notice and NoticeImages', async () => {
  const putSpy = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true, message: '' } })
  const user = userEvent.setup()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <QueryClientProvider client={client}>
      <Fixture defaultValue='Initial notice' defaultImages='[]' />
    </QueryClientProvider>
  )

  const textarea = screen.getByRole('textbox', { name: 'Announcement content' })
  await user.clear(textarea)
  await user.type(textarea, 'Updated system notice')

  const urlInput = screen.getByRole('textbox', {
    name: 'Announcement image URL',
  })
  await user.type(urlInput, 'https://cdn.example.com/notice-qr.png')
  await user.click(screen.getByRole('button', { name: 'Add image link' }))

  await user.click(screen.getByRole('button', { name: 'Preview' }))
  expect(screen.getByText('Updated system notice')).toBeVisible()
  expect(
    screen.getAllByAltText('Announcement image 1').length
  ).toBeGreaterThanOrEqual(1)

  await user.click(screen.getByRole('button', { name: 'Save notice' }))

  await waitFor(() => {
    expect(putSpy).toHaveBeenCalledTimes(2)
  })
  expect(putSpy).toHaveBeenNthCalledWith(1, '/api/option/', {
    key: 'NoticeImages',
    value: JSON.stringify(['https://cdn.example.com/notice-qr.png']),
  })
  expect(putSpy).toHaveBeenNthCalledWith(2, '/api/option/', {
    key: 'Notice',
    value: 'Updated system notice',
  })
})
