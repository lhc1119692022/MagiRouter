import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SitePopupsSection } from '../site-popups-section'

vi.mock('../../components/settings-page-context', async (original) => ({
  ...(await original<
    typeof import('../../components/settings-page-context')
  >()),
  SettingsPageFormActions: (props: {
    onSave: () => void
    isSaveDisabled: boolean
  }) => (
    <button
      type='button'
      disabled={props.isSaveDisabled}
      onClick={props.onSave}
    >
      Save changes
    </button>
  ),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderEditor(initial = '[]') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <SitePopupsSection value={initial} />
    </QueryClientProvider>
  )
}

test('adds sign-up and console disclaimer templates, previews, and saves to console_setting.site_popups', async () => {
  const user = userEvent.setup()
  const putSpy = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })

  renderEditor()

  const saveButton = screen.getByRole('button', { name: 'Save changes' })
  expect(saveButton).toBeDisabled()

  await user.click(
    screen.getByRole('button', { name: 'Add Sign-up Notice Template' })
  )
  expect(screen.getByLabelText('Title')).toHaveValue('新站启航 · 注册提示')
  await user.click(screen.getByRole('button', { name: 'Apply' }))

  await user.click(
    screen.getByRole('button', { name: 'Add Console Disclaimer Template' })
  )
  expect(screen.getByLabelText('Title')).toHaveValue('控制台使用须知与免责声明')
  await user.click(screen.getByRole('button', { name: 'Apply' }))

  const previewButtons = screen.getAllByRole('button', { name: 'Preview' })
  await user.click(previewButtons[0])
  expect(await screen.findByRole('button', { name: '我知道了' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: '我知道了' }))

  await waitFor(() => expect(saveButton).toBeEnabled())
  await user.click(saveButton)

  await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(1))
  const callArg = putSpy.mock.calls[0]
  expect(callArg[0]).toBe('/api/option/')
  const payload = callArg[1] as { key: string; value: string }
  expect(payload.key).toBe('console_setting.site_popups')
  const saved = JSON.parse(payload.value) as Array<{
    id: string
    trigger: string
    require_confirm?: boolean
    checkbox_label?: string
  }>
  expect(saved).toHaveLength(2)
  expect(saved[0].trigger).toBe('sign_up')
  expect(saved[0].id).toBe('sign-up-qq-only')
  expect(saved[1].trigger).toBe('console')
  expect(saved[1].require_confirm).toBe(true)
  expect(saved[1].checkbox_label).toBe('我已阅读并同意上述使用须知与免责声明')
})
