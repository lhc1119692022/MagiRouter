import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { CreationPresetsSection } from '../creation-presets-section'

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
      Publish
    </button>
  ),
}))

it('does not allow a legacy backend without preset support to accept a meaningless setting', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CreationPresetsSection value='' />
    </QueryClientProvider>
  )
  expect(
    screen.getByText(
      'This server does not support publishing creation presets.'
    )
  ).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
})

it('only publishes the visual editor draft after an explicit save using the existing site option', async () => {
  const user = userEvent.setup()
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: ['actual-model'] },
  })
  const write = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CreationPresetsSection value='[]' />
    </QueryClientProvider>
  )
  await user.click(screen.getByRole('button', { name: 'Add preset' }))
  await user.type(screen.getByLabelText('Name'), 'Studio lighting')
  await user.type(screen.getByLabelText('Model'), 'actual-model')
  await user.type(screen.getByLabelText('Prompt'), 'Diffuse morning light.')
  const cover = screen.getByLabelText('Cover image URL')
  await user.type(cover, 'https://admin@media.example.test/cover.jpg')
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  await user.clear(cover)
  await user.type(cover, 'https://media.example.test/cover.jpg')
  expect(screen.getByRole('checkbox', { name: 'Published' })).not.toBeChecked()
  await user.click(
    screen.getByRole('checkbox', { name: 'Show in Featured inspiration' })
  )
  await user.click(screen.getByRole('button', { name: 'Apply' }))
  expect(screen.getByText('Draft')).toBeVisible()
  expect(write).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Publish' }))
  expect(write).toHaveBeenCalledWith('/api/option/', {
    key: 'console_setting.creation_presets',
    previous_value: '[]',
    value: expect.stringContaining('Diffuse morning light.'),
  })
  const draft = JSON.parse(
    (write.mock.calls[0][1] as { value: string }).value
  )[0]
  expect(draft).toMatchObject({
    cover_url: 'https://media.example.test/cover.jpg',
    featured: true,
    published: false,
  })
  await user.click(screen.getByRole('button', { name: 'Edit' }))
  expect(screen.getByLabelText('Cover image URL')).toHaveValue(draft.cover_url)
  await user.click(screen.getByRole('checkbox', { name: 'Published' }))
  await user.click(screen.getByRole('button', { name: 'Apply' }))
  await user.click(screen.getByRole('button', { name: 'Publish' }))
  expect(
    JSON.parse((write.mock.calls[1][1] as { value: string }).value)[0]
  ).toEqual({ ...draft, published: true })
})

it('keeps uncommitted edits visible and blocks saving them over a newly captured preset', async () => {
  const user = userEvent.setup()
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: [] } })
  const write = vi.spyOn(api, 'put')
  const client = new QueryClient()
  const item = {
    id: 'first',
    title: 'First',
    model: 'site-model',
    mode: 'chat',
    prompt: 'Compose.',
  }
  const page = (items: (typeof item)[]) => (
    <QueryClientProvider client={client}>
      <CreationPresetsSection value={JSON.stringify(items)} />
    </QueryClientProvider>
  )
  const view = render(page([item]))
  await user.click(screen.getByRole('button', { name: 'Edit' }))
  await user.type(screen.getByLabelText('Name'), ' changed locally')
  view.rerender(
    page([item, { ...item, id: 'captured', title: 'Captured independently' }])
  )
  await user.click(screen.getByRole('button', { name: 'Apply' }))
  expect(screen.getByText('First changed locally')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Creation presets have changed.'
  )
  await user.click(screen.getByRole('button', { name: 'Discard changes' }))
  expect(screen.getByText('Captured independently')).toBeVisible()
  expect(write).not.toHaveBeenCalled()
})
