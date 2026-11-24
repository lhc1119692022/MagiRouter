/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import type { Model } from '@/features/models/types'
import { api } from '@/lib/api'
import {
  getModelCategories,
  getModelTaskCapabilities,
} from '@/lib/model-task-capabilities'

import { fetchModels } from '../../api'
import { ChannelsProvider } from '../channels-provider'
import { ConfigureModelsDialog } from '../dialogs/configure-models-dialog'
import { FetchModelsDialog } from '../dialogs/fetch-models-dialog'
import { UpstreamModelSelection } from '../upstream-model-selection'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('edits global labels for one named channel model without applying the channel draft', async () => {
  const apply = vi.fn()
  const records: Partial<Model>[] = []
  const create = vi
    .spyOn(api, 'post')
    .mockImplementation(async (_url, fields) => {
      records.push({ ...(fields as Partial<Model>), id: 42 })
      return { data: { success: true, data: records[0] } }
    })
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: { success: true, data: { items: records, total: records.length } },
  }))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <ConfigureModelsDialog
        open
        models={['draft-a', 'draft-b']}
        onOpenChange={() => undefined}
        onApply={apply}
      />
    </QueryClientProvider>
  )
  await user.click(screen.getByRole('checkbox', { name: 'draft-b' }))
  await user.click(
    screen.getByRole('button', { name: 'Edit capability labels for draft-a' })
  )
  await user.click(
    await screen.findByRole('checkbox', { name: 'Video Generation' })
  )
  expect(create).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Save labels' }))
  expect(create).toHaveBeenCalledWith(
    '/api/models/',
    expect.objectContaining({
      model_name: 'draft-a',
      name_rule: 0,
      tags: '@mr:catalog:v1=video',
    }),
    expect.anything()
  )
  expect(
    await screen.findByRole('checkbox', { name: 'draft-b' })
  ).not.toBeChecked()
  expect(apply).not.toHaveBeenCalled()
  await user.click(
    screen.getByRole('button', { name: 'Edit capability labels for draft-a' })
  )
  expect(
    await screen.findByRole('checkbox', { name: 'Video Generation' })
  ).toBeChecked()
  await user.click(
    screen.getByRole('checkbox', { name: 'Speech transcription' })
  )
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(getModelCategories({ tags: records[0].tags })).toEqual(['video'])
  expect(create).toHaveBeenCalledTimes(1)
  expect(apply).not.toHaveBeenCalled()
})

test('inherits hidden rule metadata without changing that rule or granting the selected model new execution directions', async () => {
  const rule = {
    model_name: 'custom-',
    id: 3,
    name_rule: 1,
    tags: 'Studio,@mr:tasks:v1=i2i',
    status: 0,
    vendor_id: 12,
    sync_official: 0,
    endpoints: '{"image-edits":{}}',
    icon: 'Logo',
    description: 'Private',
  }
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    const items = url === '/api/models/' ? [rule] : []
    return { data: { success: true, data: { items, total: items.length } } }
  })
  const update = vi
    .spyOn(api, 'put')
    .mockRejectedValue(new Error('Rule must remain unchanged'))
  const create = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  const user = userEvent.setup()
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <ConfigureModelsDialog
        open
        models={['custom-one']}
        onApply={() => undefined}
        onOpenChange={() => undefined}
      />
    </QueryClientProvider>
  )
  await user.click(
    screen.getByRole('button', {
      name: 'Edit capability labels for custom-one',
    })
  )
  expect(
    await screen.findByRole('checkbox', { name: 'Image Generation' })
  ).toBeChecked()
  await user.click(screen.getByRole('checkbox', { name: 'Video Generation' }))
  await user.click(screen.getByRole('button', { name: 'Save labels' }))
  await screen.findByRole('button', {
    name: 'Edit capability labels for custom-one',
  })
  expect(update).not.toHaveBeenCalled()
  const fields = create.mock.calls[0][1] as Partial<Model>
  const { id: ruleId, ...inheritedFields } = rule
  expect(fields.id).not.toBe(ruleId)
  expect(fields).toMatchObject({
    ...inheritedFields,
    model_name: 'custom-one',
    name_rule: 0,
    tags: expect.stringContaining('Studio,@mr:tasks:v1=i2i'),
  })
  expect(getModelCategories(fields)).toEqual(['image', 'video'])
  expect(getModelTaskCapabilities(fields)).toEqual(['image-to-image'])
})

test('does not offer to create or write metadata when the lookup fails', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: false, message: 'Fixture lookup failed' },
  })
  const create = vi
    .spyOn(api, 'post')
    .mockRejectedValue(new Error('No write expected'))
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConfigureModelsDialog
        open
        models={['hidden-data']}
        onApply={() => undefined}
        onOpenChange={() => undefined}
      />
    </QueryClientProvider>
  )
  await user.click(
    screen.getByRole('button', {
      name: 'Edit capability labels for hidden-data',
    })
  )
  expect(await screen.findByText('Fixture lookup failed')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Save labels' })).toBeDisabled()
  expect(create).not.toHaveBeenCalled()
})

test.each([
  {
    result: 'nonempty',
    models: ['gpt-existing', 'gpt-new'],
    removedCount: 1,
    savedModels: ['gpt-existing', 'alias', 'gpt-new'],
  },
  {
    result: 'empty',
    models: [],
    removedCount: 2,
    savedModels: ['alias'],
  },
])(
  'removed models stay available after batch deselection with a $result upstream list and only checked models are saved',
  async ({ models, removedCount, savedModels }) => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: models },
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const select = vi.fn()
    const close = vi.fn()
    const user = userEvent.setup()
    const view = render(
      <QueryClientProvider client={client}>
        <ChannelsProvider>
          <FetchModelsDialog
            open
            onOpenChange={close}
            onModelsSelected={select}
            existingModelsOverride={['gpt-existing', 'alias', 'manual-model']}
            redirectSourceModels={['alias']}
            customFetcher={async () =>
              (
                await fetchModels({
                  type: 1,
                  base_url: 'https://example.com',
                  key: 'test-key',
                })
              ).data ?? []
            }
          />
        </ChannelsProvider>
      </QueryClientProvider>
    )
    const removedTab = await screen.findByRole('tab', {
      name: `Removed Models (${removedCount})`,
    })
    if (models.length > 0) {
      await user.click(screen.getByRole('checkbox', { name: 'gpt-new' }))
    }
    await user.click(removedTab)
    expect(
      screen.queryByRole('checkbox', { name: 'alias' })
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('checkbox', { name: 'Select all models in Removed' })
    )
    expect(removedTab).toHaveAttribute('aria-selected', 'true')
    const manualModel = screen.getByRole('checkbox', { name: 'manual-model' })
    expect(manualModel).not.toBeChecked()
    await user.click(manualModel)
    expect(manualModel).toBeChecked()
    await user.click(manualModel)
    expect(manualModel).not.toBeChecked()
    expect(
      screen.getByRole('tab', { name: `Removed Models (${removedCount})` })
    ).toHaveAttribute('aria-selected', 'true')
    expect(select).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save Models' }))
    expect(select).toHaveBeenCalledWith(savedModels)
    expect(close).toHaveBeenCalledWith(false)
    view.unmount()
    client.clear()
  }
)

function InlineSelection() {
  const [selected, setSelected] = useState(['manual-model'])
  return (
    <>
      <UpstreamModelSelection
        models={['gpt-one', 'gpt-two', 'another-model']}
        selected={selected}
        existingModels={[]}
        showChanges={false}
        onChange={setSelected}
      />
      <output aria-label='Selected models'>{selected.join(',')}</output>
    </>
  )
}

test('category headers keep a transparent background while expanding and collapsing without changing selection', async () => {
  const user = userEvent.setup()
  render(<InlineSelection />)
  const header = screen.getByRole('button', { name: /^OpenAI \(2\)/ })

  expect(header).toHaveAttribute('aria-expanded', 'true')
  expect(header).toHaveClass(
    'aria-expanded:bg-transparent',
    'hover:bg-transparent',
    'dark:hover:bg-transparent'
  )
  await user.click(header)
  expect(header).toHaveAttribute('aria-expanded', 'false')
  expect(
    screen.queryByRole('checkbox', { name: 'gpt-one' })
  ).not.toBeInTheDocument()
  await user.keyboard('{Enter}')
  expect(header).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('checkbox', { name: 'gpt-one' })).toBeVisible()
  expect(header).toHaveFocus()
  expect(screen.getByLabelText('Selected models')).toHaveTextContent(
    'manual-model'
  )
})

test('the matching-model action only appears for a nonblank search and disappears when cleared', async () => {
  const user = userEvent.setup()
  render(<InlineSelection />)
  const search = screen.getByRole('textbox', { name: 'Search models...' })
  expect(
    screen.queryByRole('button', { name: 'Select all matching models' })
  ).not.toBeInTheDocument()

  await user.type(search, '  ')
  expect(
    screen.queryByRole('button', { name: 'Select all matching models' })
  ).not.toBeInTheDocument()

  await user.type(search, 'gpt-')
  expect(
    screen.getByRole('button', { name: 'Select all matching models' })
  ).toBeEnabled()
  await user.clear(search)
  expect(
    screen.queryByRole('button', { name: 'Select all matching models' })
  ).not.toBeInTheDocument()

  await user.type(search, 'missing')
  expect(
    screen.getByRole('button', { name: 'Select all matching models' })
  ).toBeDisabled()
})

test('selecting search results adds only matching models and retains the manual selection', async () => {
  const user = userEvent.setup()
  render(<InlineSelection />)
  await user.type(
    screen.getByRole('textbox', { name: 'Search models...' }),
    'gpt-'
  )
  await user.click(
    screen.getByRole('button', { name: 'Select all matching models' })
  )
  expect(screen.getByLabelText('Selected models')).toHaveTextContent(
    'manual-model,gpt-one,gpt-two'
  )
  expect(
    screen.queryByRole('checkbox', { name: 'another-model' })
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('checkbox', { name: 'gpt-one' }))
  expect(screen.getByLabelText('Selected models')).toHaveTextContent(
    'manual-model,gpt-two'
  )
})

test('the redirect action appears per model only when a handler is provided and reports the model without toggling it', async () => {
  const user = userEvent.setup()
  const onRedirect = vi.fn()
  const view = render(
    <UpstreamModelSelection
      models={['gpt-one']}
      selected={[]}
      existingModels={[]}
      showChanges={false}
      onChange={() => undefined}
    />
  )
  expect(
    screen.queryByRole('button', { name: 'Redirect gpt-one' })
  ).not.toBeInTheDocument()

  view.rerender(
    <UpstreamModelSelection
      models={['gpt-one']}
      selected={[]}
      existingModels={[]}
      showChanges={false}
      onChange={() => undefined}
      onRedirectModel={onRedirect}
    />
  )
  await user.click(screen.getByRole('button', { name: 'Redirect gpt-one' }))
  expect(onRedirect).toHaveBeenCalledWith('gpt-one')
  expect(screen.getByRole('checkbox', { name: 'gpt-one' })).not.toBeChecked()
})

test('models published under another name show that name as a badge next to the row', () => {
  render(
    <UpstreamModelSelection
      models={['gpt-4o-all', 'o3']}
      selected={[]}
      existingModels={[]}
      showChanges={false}
      onChange={() => undefined}
      aliases={{ 'gpt-4o-all': 'gpt-4o' }}
    />
  )
  expect(screen.getByLabelText('Published as gpt-4o')).toHaveTextContent(
    'gpt-4o'
  )
  expect(screen.queryByLabelText(/Published as o3/)).not.toBeInTheDocument()
})

test('long model names remain fully labeled and selectable in a container-responsive list', async () => {
  const user = userEvent.setup()
  const model = 'gpt-4.1-mini-deployment-with-a-long-region-name-2025-04-14'
  const onChange = vi.fn()
  render(
    <UpstreamModelSelection
      models={[model]}
      selected={[]}
      existingModels={[]}
      showChanges={false}
      onChange={onChange}
    />
  )
  const checkbox = screen.getByRole('checkbox', { name: model })
  const category = checkbox.closest('[data-slot="collapsible"]')
  expect(category).toHaveClass('@container')
  const grid = checkbox.parentElement?.parentElement
  expect(grid).toHaveClass('@lg:grid-cols-2')
  expect(grid).not.toHaveClass('sm:grid-cols-2')
  expect(screen.getByText(model)).toBeVisible()
  await user.click(checkbox)
  expect(onChange).toHaveBeenCalledWith([model])
})
