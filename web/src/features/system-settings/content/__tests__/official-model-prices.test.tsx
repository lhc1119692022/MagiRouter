import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { OfficialModelPricesSection } from '../official-model-prices-section'

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

const priceSource = 'https://provider.example.test/prices'
const clients: QueryClient[] = []

function openPrices(value: string, role: number = ROLE.SUPER_ADMIN) {
  useAuthStore
    .getState()
    .auth.setUser({ id: 54, username: 'price-editor', role })
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data:
      url === '/api/pricing'
        ? {
            success: true,
            vendors: [],
            data: [{ model_name: 'catalog-suggestion' }],
          }
        : { success: true, data: {} },
  }))
  const write = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <OfficialModelPricesSection value={value} />
    </QueryClientProvider>
  )
  return write
}

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
})

it('publishes sourced exact prices only on Save, preserving zero and omitting unknown dimensions', async () => {
  const user = userEvent.setup()
  const write = openPrices(
    JSON.stringify({
      first: { source_url: priceSource, input_usd_per_million: 0 },
    })
  )
  expect(screen.getByLabelText('Input USD per million tokens')).toHaveValue('0')
  expect(screen.getByLabelText('Output USD per million tokens')).toHaveValue('')
  const save = screen.getByRole('button', { name: 'Save changes' })
  expect(save).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Output USD per million tokens'), {
    target: { value: '0.05' },
  })
  await user.click(screen.getByRole('button', { name: 'Add model' }))
  fireEvent.change(screen.getAllByLabelText('Exact model name')[1], {
    target: { value: 'manual-exact/version-2' },
  })
  fireEvent.change(
    screen.getAllByLabelText('Official pricing URL (HTTPS)')[1],
    { target: { value: priceSource } }
  )
  await user.selectOptions(screen.getAllByLabelText('Price unit')[1], 'request')
  fireEvent.change(screen.getByLabelText('USD per request'), {
    target: { value: '0' },
  })
  expect(write).not.toHaveBeenCalled()
  await user.click(save)
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  const [url, request] = write.mock.calls[0]
  const body = request as { key: string; value: string }
  expect(url).toBe('/api/option/')
  expect(body.key).toBe('console_setting.official_model_prices')
  expect(JSON.parse(body.value)).toEqual({
    first: {
      source_url: priceSource,
      input_usd_per_million: 0,
      output_usd_per_million: 0.05,
    },
    'manual-exact/version-2': { source_url: priceSource, usd_per_request: 0 },
  })
})

it('rejects duplicate names, wildcards, credential-bearing sources and negative or nonfinite rates', async () => {
  const user = userEvent.setup()
  const write = openPrices(
    JSON.stringify({ first: { source_url: priceSource, usd_per_request: 1 } })
  )
  await user.click(screen.getByRole('button', { name: 'Add model' }))
  const name = screen.getAllByLabelText('Exact model name')[1]
  const source = screen.getAllByLabelText('Official pricing URL (HTTPS)')[1]
  const rate = screen.getByLabelText('Input USD per million tokens')
  const save = screen.getByRole('button', { name: 'Save changes' })
  fireEvent.change(source, { target: { value: priceSource } })
  fireEvent.change(rate, { target: { value: '2' } })
  for (const invalid of ['first', 'all*', ' leading']) {
    fireEvent.change(name, { target: { value: invalid } })
    expect(save).toBeDisabled()
  }
  fireEvent.change(name, { target: { value: 'specific' } })
  for (const invalid of [
    'http://provider.example.test',
    'https://person@provider.example.test',
    'https:///incomplete',
  ]) {
    fireEvent.change(source, { target: { value: invalid } })
    expect(save).toBeDisabled()
  }
  fireEvent.change(source, { target: { value: priceSource } })
  for (const invalid of ['', '-1', '1e999', 'not a price']) {
    fireEvent.change(rate, { target: { value: invalid } })
    expect(save).toBeDisabled()
  }
  fireEvent.change(rate, { target: { value: '0.000001' } })
  expect(save).toBeEnabled()
  expect(write).not.toHaveBeenCalled()
})

it('does not publish stale token dimensions when a model switches to per-request pricing', async () => {
  const user = userEvent.setup()
  const write = openPrices(
    JSON.stringify({
      first: { source_url: priceSource, output_usd_per_million: 5 },
    })
  )
  await user.selectOptions(screen.getByLabelText('Price unit'), 'request')
  const save = screen.getByRole('button', { name: 'Save changes' })
  expect(save).toBeDisabled()
  fireEvent.change(screen.getByLabelText('USD per request'), {
    target: { value: '1' },
  })
  await user.click(save)
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  expect(
    JSON.parse((write.mock.calls[0][1] as { value: string }).value)
  ).toEqual({
    first: { source_url: priceSource, usd_per_request: 1 },
  })
})

it('retains a failed deletion as a draft and publishes an empty list only after retry', async () => {
  const user = userEvent.setup()
  const write = openPrices(
    JSON.stringify({ first: { source_url: priceSource, usd_per_request: 1 } })
  )
  write.mockResolvedValueOnce({
    data: { success: false, message: 'Fixture write refused' },
  })
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(write).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Failed to update setting'
  )
  expect(screen.queryByLabelText('Exact model name')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(2))
  expect(write.mock.calls[0]).toEqual([
    '/api/option/',
    { key: 'console_setting.official_model_prices', value: '{}' },
  ])
  expect(write.mock.calls[1]).toEqual(write.mock.calls[0])
})

it.each([
  '',
  'null',
  '[]',
  '{',
  JSON.stringify({ first: { source_url: priceSource, usd_per_request: null } }),
  JSON.stringify({
    first: {
      source_url: priceSource,
      usd_per_request: 1,
      input_usd_per_million: 0,
    },
  }),
  JSON.stringify({
    first: { source_url: priceSource, usd_per_request: 1, unknown_field: true },
  }),
])(
  'cannot overwrite an unavailable or invalid original configuration (%s)',
  (stored) => {
    const write = openPrices(stored)
    expect(screen.getByRole('alert')).toBeVisible()
    expect(screen.queryByRole('button')).toBeNull()
    expect(write).not.toHaveBeenCalled()
  }
)

it.each([1, 10])(
  'does not show price publication controls to non-Root role %i',
  (role) => {
    const write = openPrices('{}', role)
    expect(screen.queryByRole('button')).toBeNull()
    expect(write).not.toHaveBeenCalled()
  }
)
