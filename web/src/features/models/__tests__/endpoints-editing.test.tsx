import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { ModelMutateDrawer } from '../components/drawers/model-mutate-drawer'
import { PrefillGroupFormDrawer } from '../components/drawers/prefill-group-form-drawer'
import { ModelEndpointsEditor } from '../components/model-endpoints-editor'
import { ModelsProvider } from '../components/models-provider'
import type { Model, PrefillGroup } from '../types'

const baseModel: Model = {
  id: 12,
  model_name: 'seedream-5.5',
  description: 'Image generation model',
  status: 1,
  sync_official: 1,
  name_rule: 0,
  vendor_id: 3,
  endpoints: '',
  supported_endpoints: [],
  created_time: 1,
  updated_time: 1,
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset()
})

function renderDrawer(currentModel: Model = baseModel) {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  render(
    <QueryClientProvider client={client}>
      <ModelsProvider>
        <ModelMutateDrawer
          open
          onOpenChange={() => undefined}
          currentRow={currentModel}
        />
      </ModelsProvider>
    </QueryClientProvider>
  )
  return client
}

describe('model endpoints editing', () => {
  it('adds multiple endpoint templates including image-edits without overwriting earlier entries', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/api/models/12') {
        return { data: { success: true, data: baseModel } }
      }
      if (url === '/api/vendors/') {
        return {
          data: {
            success: true,
            data: { items: [{ id: 3, name: 'ByteDance' }] },
          },
        }
      }
      return { data: { success: true, data: [] } }
    })
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true, data: baseModel } })

    const client = renderDrawer()
    const user = userEvent.setup()

    const templatePicker = await screen.findByRole('combobox', {
      name: 'Select endpoint templates...',
    })
    await user.click(templatePicker)
    await user.click(screen.getByRole('option', { name: /^image-generation/ }))
    await user.click(screen.getByRole('option', { name: /^image-edits/ }))
    await user.keyboard('{Escape}')

    expect(screen.getByDisplayValue('image-generation')).toBeVisible()
    expect(screen.getByDisplayValue('/v1/images/generations')).toBeVisible()
    expect(screen.getByDisplayValue('image-edits')).toBeVisible()
    expect(screen.getByDisplayValue('/v1/images/edits')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Save metadata' }))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))

    const savedEndpoints = JSON.parse(
      (put.mock.calls[0][1] as { endpoints: string }).endpoints
    )
    expect(savedEndpoints).toEqual({
      'image-generation': { path: '/v1/images/generations', method: 'POST' },
      'image-edits': { path: '/v1/images/edits', method: 'POST' },
    })

    client.clear()
  })

  it('searches templates by path, preserves custom endpoints when toggling templates, and saves edits', async () => {
    const modelWithExisting: Model = {
      ...baseModel,
      endpoints: JSON.stringify({
        'custom-image': { path: '/api/v3/images/generations', method: 'POST' },
      }),
    }
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/api/models/12') {
        return { data: { success: true, data: modelWithExisting } }
      }
      if (url === '/api/vendors/') {
        return {
          data: {
            success: true,
            data: { items: [{ id: 3, name: 'ByteDance' }] },
          },
        }
      }
      return { data: { success: true, data: [] } }
    })
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true, data: modelWithExisting } })

    const client = renderDrawer(modelWithExisting)
    const user = userEvent.setup()

    expect(await screen.findByDisplayValue('custom-image')).toBeVisible()

    const templatePicker = screen.getByRole('combobox', {
      name: 'Select endpoint templates...',
    })
    await user.click(templatePicker)
    await user.type(templatePicker, '/v1/videos')
    await user.click(screen.getByRole('option', { name: /^openai-video/ }))

    expect(screen.getByDisplayValue('openai-video')).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: 'Add custom endpoint' })
    )
    const typeInputs = screen.getAllByLabelText('Endpoint Type')
    const methodSelects = screen.getAllByLabelText('Method')
    const pathInputs = screen.getAllByLabelText('Path')

    await user.type(typeInputs[2], 'custom-fetch')
    await user.selectOptions(methodSelects[2], 'GET')
    await user.type(pathInputs[2], '/v1/tasks/{{id}')

    await user.click(templatePicker)
    await user.click(screen.getByRole('option', { name: /^openai-video/ }))
    await user.keyboard('{Escape}')

    expect(screen.queryByDisplayValue('openai-video')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('custom-image')).toBeVisible()
    expect(screen.getByDisplayValue('custom-fetch')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Save metadata' }))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))

    const savedEndpoints = JSON.parse(
      (put.mock.calls[0][1] as { endpoints: string }).endpoints
    )
    expect(savedEndpoints).toEqual({
      'custom-image': { path: '/api/v3/images/generations', method: 'POST' },
      'custom-fetch': { path: '/v1/tasks/{id}', method: 'GET' },
    })

    client.clear()
  })

  it('keeps invalid JSON draft when switching back to visual mode and syncs once valid', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/api/models/12') {
        return { data: { success: true, data: baseModel } }
      }
      if (url === '/api/vendors/') {
        return {
          data: {
            success: true,
            data: { items: [{ id: 3, name: 'ByteDance' }] },
          },
        }
      }
      return { data: { success: true, data: [] } }
    })

    const client = renderDrawer()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'JSON Mode' }))
    const editor = await screen.findByRole('textbox', {
      name: 'Endpoint Configuration',
    })
    fireEvent.input(editor, { target: { value: '{invalid' } })

    await user.click(screen.getByRole('button', { name: 'Visual Mode' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid JSON')
    expect(
      screen.getByRole('textbox', { name: 'Endpoint Configuration' })
    ).toHaveValue('{invalid')

    fireEvent.input(editor, {
      target: {
        value: '{"audio-speech":{"path":"/v1/audio/speech","method":"POST"}}',
      },
    })
    await user.click(screen.getByRole('button', { name: 'Visual Mode' }))
    expect(screen.getByDisplayValue('audio-speech')).toBeVisible()
    expect(screen.getByDisplayValue('/v1/audio/speech')).toBeVisible()

    client.clear()
  })

  it('parses array-form and string-path endpoints, warns on duplicate keys, and respects disabled state', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ModelEndpointsEditor
        value='["openai","image-generation"]'
        onChange={onChange}
      />
    )

    expect(screen.getByDisplayValue('openai')).toBeVisible()
    expect(screen.getByDisplayValue('/v1/chat/completions')).toBeVisible()
    expect(screen.getByDisplayValue('image-generation')).toBeVisible()
    expect(screen.getByDisplayValue('/v1/images/generations')).toBeVisible()

    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Add custom endpoint' })
    )
    const typeInputs = screen.getAllByLabelText('Endpoint Type')
    await user.type(typeInputs[2], 'openai')

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Duplicate endpoint types will overwrite earlier entries.'
    )
    expect(typeInputs[2]).toHaveAttribute('aria-invalid', 'true')

    rerender(
      <ModelEndpointsEditor
        value='{"legacy-endpoint":"/v1/custom"}'
        onChange={onChange}
        disabled
      />
    )

    expect(screen.getByDisplayValue('legacy-endpoint')).toBeDisabled()
    expect(screen.getByDisplayValue('/v1/custom')).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Add custom endpoint' })
    ).toBeDisabled()
  })

  it('supports adding multiple endpoint templates inside PrefillGroupFormDrawer', async () => {
    const group: PrefillGroup = {
      id: 5,
      name: 'Image endpoints',
      type: 'endpoint',
      items: JSON.stringify({
        'image-generation': { path: '/v1/images/generations', method: 'POST' },
      }),
    }
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true, data: group } })
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    render(
      <QueryClientProvider client={client}>
        <PrefillGroupFormDrawer
          open
          onClose={() => undefined}
          currentGroup={group}
        />
      </QueryClientProvider>
    )

    const user = userEvent.setup()
    expect(await screen.findByDisplayValue('image-generation')).toBeVisible()

    const templatePicker = screen.getByRole('combobox', {
      name: 'Select endpoint templates...',
    })
    await user.click(templatePicker)
    await user.click(screen.getByRole('option', { name: /^image-edits/ }))
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))

    const savedItems = JSON.parse(
      (put.mock.calls[0][1] as { items: string }).items
    )
    expect(savedItems).toEqual({
      'image-generation': { path: '/v1/images/generations', method: 'POST' },
      'image-edits': { path: '/v1/images/edits', method: 'POST' },
    })

    client.clear()
  })
})
