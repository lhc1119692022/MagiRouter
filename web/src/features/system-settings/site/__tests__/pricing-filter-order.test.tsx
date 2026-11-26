import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { PricingFilterOrderSection } from '../pricing-filter-order-section'

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
      Save
    </button>
  ),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderSection(initial = '{}') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(['status'], {})
  client.setQueryData(['pricing'], {
    success: true,
    vendors: [
      { id: 1, name: 'Google' },
      { id: 2, name: 'Anthropic' },
      { id: 3, name: 'OpenAI' },
    ],
    data: [
      {
        id: 1,
        vendor_id: 1,
        model_name: 'gemini-4',
        enable_groups: ['Gemini Ultra'],
        quota_type: 0,
        model_ratio: 1,
        completion_ratio: 1,
      },
      {
        id: 2,
        vendor_id: 2,
        model_name: 'claude-5',
        enable_groups: ['Claude Cursor'],
        quota_type: 0,
        model_ratio: 1,
        completion_ratio: 1,
      },
      {
        id: 3,
        vendor_id: 3,
        model_name: 'gpt-6',
        enable_groups: ['GPT Team'],
        quota_type: 0,
        model_ratio: 1,
        completion_ratio: 1,
      },
    ],
    usable_group: {
      'Gemini Ultra': { desc: '', ratio: 0.45 },
      'Claude Cursor': { desc: '', ratio: 0.5 },
      'GPT Team': { desc: '', ratio: 0.055 },
    },
    group_ratio: {
      'Gemini Ultra': 0.45,
      'Claude Cursor': 0.5,
      'GPT Team': 0.055,
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <PricingFilterOrderSection value={initial} />
    </QueryClientProvider>
  )
}

test('shows default alphabetical vendor order and saves manual reordering to console_setting.pricing_filter_order', async () => {
  const putSpy = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  const user = userEvent.setup()

  renderSection('{}')

  const vendorList = screen.getByRole('list', {
    name: 'Model manufacturers order list',
  })
  expect(
    [...vendorList.querySelectorAll('li')].map((li) => li.textContent)
  ).toEqual([
    expect.stringContaining('Anthropic'),
    expect.stringContaining('Google'),
    expect.stringContaining('OpenAI'),
  ])

  await user.click(screen.getByRole('button', { name: 'Move OpenAI to top' }))

  expect(
    [...vendorList.querySelectorAll('li')].map((li) => li.textContent)
  ).toEqual([
    expect.stringContaining('OpenAI'),
    expect.stringContaining('Anthropic'),
    expect.stringContaining('Google'),
  ])

  const saveButton = screen.getByRole('button', { name: 'Save' })
  await waitFor(() => expect(saveButton).toBeEnabled())
  await user.click(saveButton)

  await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(1))
  expect(putSpy).toHaveBeenCalledWith('/api/option/', {
    key: 'console_setting.pricing_filter_order',
    value: JSON.stringify({
      vendors: ['OpenAI', 'Anthropic', 'Google'],
    }),
  })
})
