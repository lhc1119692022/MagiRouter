import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { HomeShowcaseSection } from '../home-showcase-section'

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

function renderEditor(initial = '{}') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <HomeShowcaseSection value={initial} />
    </QueryClientProvider>
  )
}

test('validates media URLs and persists home showcase configuration', async () => {
  const user = userEvent.setup()
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: [],
      vendors: [],
      usable_group: {},
      group_ratio: {},
    },
  })
  const putSpy = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })

  renderEditor()
  const mediaInput = screen.getAllByLabelText(
    'Background media URL (image or video)'
  )[0]
  const modelsInput = screen.getAllByLabelText(
    'Featured Playground models (comma-separated)'
  )[0]
  const saveButton = screen.getByRole('button', { name: 'Save changes' })

  await user.type(mediaInput, 'javascript:alert(1)')
  expect(
    await screen.findByText('Enter a relative /path or HTTP(S) media URL.')
  ).toBeVisible()
  expect(saveButton).toBeDisabled()

  await user.clear(mediaInput)
  await user.type(mediaInput, 'https://cdn.example.test/hero.mp4')
  await user.type(modelsInput, 'gpt-6.2-sol, claude-opus-5.5')

  await waitFor(() => expect(saveButton).toBeEnabled())
  await user.click(saveButton)

  await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(1))
  expect(putSpy).toHaveBeenCalledWith('/api/option/', {
    key: 'console_setting.home_showcase',
    value: JSON.stringify({
      text: {
        media_url: 'https://cdn.example.test/hero.mp4',
        models: ['gpt-6.2-sol', 'claude-opus-5.5'],
      },
    }),
  })
})
