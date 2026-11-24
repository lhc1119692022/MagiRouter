import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { PricingBannerSection } from '../pricing-banner-section'

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

function renderBannerSettings(initial = '[]') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <PricingBannerSection value={initial} />
    </QueryClientProvider>
  )
}

test('adds, validates, and saves model square banner slides with adaptive media URLs', async () => {
  const user = userEvent.setup()
  const putSpy = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })

  renderBannerSettings()
  const saveButton = screen.getByRole('button', { name: 'Save changes' })
  expect(saveButton).toBeDisabled()

  await user.click(screen.getByRole('button', { name: 'Add banner slide' }))
  expect(await screen.findByText('Enter a banner title.')).toBeVisible()
  expect(saveButton).toBeDisabled()

  await user.type(screen.getByLabelText('Headline'), '春季大模型特惠')
  await user.type(
    screen.getByLabelText('Description'),
    '全系旗舰模型低至 0.2× 倍率。'
  )
  await user.type(
    screen.getByLabelText('Background media URL (image or video)'),
    'https://cdn.example.test/banner-8x1.webp'
  )

  await waitFor(() => expect(saveButton).toBeEnabled())
  await user.click(saveButton)

  await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(1))
  expect(putSpy).toHaveBeenCalledWith('/api/option/', {
    key: 'console_setting.pricing_banner',
    value: JSON.stringify([
      {
        title: '春季大模型特惠',
        subtitle: '全系旗舰模型低至 0.2× 倍率。',
        cta_label: '立即体验',
        cta_href: '/playground',
        media_url: 'https://cdn.example.test/banner-8x1.webp',
      },
    ]),
  })
})
