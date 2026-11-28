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

import { ModelBatchEndpointsDialog } from '../components/dialogs/model-batch-endpoints-dialog'
import { ModelBatchManageDialog } from '../components/dialogs/model-batch-manage-dialog'
import {
  normalizeEndpointKeyList,
  summarizeSelectedModelEndpoints,
  validateBatchEndpointsInput,
} from '../lib'
import type { Model, PrefillGroup } from '../types'

const modelWithImageEndpoint: Model = {
  id: 10,
  model_name: 'seedream-5.5',
  status: 1,
  sync_official: 1,
  name_rule: 0,
  vendor_id: 2,
  endpoints: JSON.stringify({
    'image-generation': { path: '/v1/images/generations', method: 'POST' },
  }),
  created_time: 1,
  updated_time: 1,
}

const modelWithMultipleEndpoints: Model = {
  id: 11,
  model_name: 'flux-pro',
  status: 1,
  sync_official: 1,
  name_rule: 0,
  vendor_id: 2,
  endpoints: JSON.stringify({
    'image-generation': { path: '/v1/images/generations', method: 'POST' },
    'image-edits': { path: '/v1/images/edits', method: 'POST' },
  }),
  created_time: 1,
  updated_time: 1,
}

const channelOnlyModel: Model = {
  id: 0,
  model_name: 'new-channel-image',
  status: 1,
  sync_official: 1,
  name_rule: 0,
  endpoints: '',
  created_time: 0,
  updated_time: 0,
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

describe('batch endpoints helpers', () => {
  it('normalizes endpoint keys by trimming whitespace and removing duplicates', () => {
    expect(
      normalizeEndpointKeyList([' openai ', '', 'image-edits', 'openai'])
    ).toEqual(['openai', 'image-edits'])
  })

  it('validates batch endpoint payloads across every action mode', () => {
    expect(validateBatchEndpointsInput('unchanged', '', [])).toEqual({
      valid: true,
    })
    expect(validateBatchEndpointsInput('clear', '', [])).toEqual({
      valid: true,
    })
    expect(validateBatchEndpointsInput('remove', '', [])).toEqual({
      valid: false,
      reason: 'empty',
    })
    expect(validateBatchEndpointsInput('remove', '', ['image-edits'])).toEqual({
      valid: true,
    })
    expect(validateBatchEndpointsInput('append', '', [])).toEqual({
      valid: false,
      reason: 'empty',
    })
    expect(validateBatchEndpointsInput('replace', '{}', [])).toEqual({
      valid: false,
      reason: 'empty',
    })
    expect(validateBatchEndpointsInput('append', '{bad', [])).toEqual({
      valid: false,
      reason: 'invalid',
      messageKey: 'Endpoints must be valid JSON',
    })
    expect(
      validateBatchEndpointsInput(
        'replace',
        JSON.stringify({ custom: { path: 'v1/no-slash', method: 'POST' } }),
        []
      )
    ).toEqual({
      valid: false,
      reason: 'invalid',
      messageKey: 'Endpoint paths must start with /',
    })
    expect(
      validateBatchEndpointsInput(
        'append',
        JSON.stringify({
          'image-edits': { path: '/v1/images/edits', method: 'POST' },
        }),
        []
      )
    ).toEqual({ valid: true })
  })

  it('summarizes existing endpoints across selected models sorted by frequency', () => {
    const summary = summarizeSelectedModelEndpoints([
      modelWithImageEndpoint,
      modelWithMultipleEndpoints,
      channelOnlyModel,
    ])
    expect(summary.configuredModelCount).toBe(2)
    expect(summary.modelsWithEndpoints).toHaveLength(2)
    expect(summary.endpointCounts).toEqual([
      { key: 'image-generation', count: 2 },
      { key: 'image-edits', count: 1 },
    ])
  })
})

describe('ModelBatchEndpointsDialog', () => {
  it('appends selected templates across metadata and channel-only models', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: [] },
    })
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { updated_count: 1, created_count: 1 } },
    })
    const onOpenChange = vi.fn()
    const onSuccess = vi.fn()
    const client = createClient()

    render(
      <QueryClientProvider client={client}>
        <ModelBatchEndpointsDialog
          models={[modelWithImageEndpoint, channelOnlyModel]}
          open
          onOpenChange={onOpenChange}
          onSuccess={onSuccess}
        />
      </QueryClientProvider>
    )

    const user = userEvent.setup()
    expect(
      screen.getByText(
        '1 selected channel models do not have metadata yet and will be initialized automatically.'
      )
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Apply to selected' })
    ).toBeDisabled()

    const templatePicker = screen.getByRole('combobox', {
      name: 'Select endpoint templates...',
    })
    await user.click(templatePicker)
    await user.click(screen.getByRole('option', { name: /^image-edits/ }))
    await user.keyboard('{Escape}')

    const applyButton = screen.getByRole('button', {
      name: 'Apply to selected',
    })
    expect(applyButton).toBeEnabled()
    await user.click(applyButton)

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith('/api/models/batch_update', {
      model_ids: [10],
      channel_models: ['new-channel-image'],
      endpoints_mode: 'append',
      endpoints: JSON.stringify(
        {
          'image-edits': { path: '/v1/images/edits', method: 'POST' },
        },
        null,
        2
      ),
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    client.clear()
  })

  it('loads endpoint prefill group presets and submits replace mode', async () => {
    const prefillGroups: PrefillGroup[] = [
      {
        id: 7,
        name: 'Standard Image Suite',
        type: 'endpoint',
        items: JSON.stringify({
          'image-generation': {
            path: '/v1/images/generations',
            method: 'POST',
          },
          'image-edits': { path: '/v1/images/edits', method: 'POST' },
        }),
      },
    ]
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/api/prefill_group') {
        return { data: { success: true, data: prefillGroups } }
      }
      return { data: { success: true, data: [] } }
    })
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { updated_count: 2, created_count: 0 } },
    })
    const client = createClient()

    render(
      <QueryClientProvider client={client}>
        <ModelBatchEndpointsDialog
          models={[modelWithImageEndpoint, modelWithMultipleEndpoints]}
          open
          onOpenChange={() => undefined}
          onSuccess={() => undefined}
        />
      </QueryClientProvider>
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Endpoints' }))
    await user.click(screen.getByRole('option', { name: 'Replace endpoints' }))

    const presetTrigger = await screen.findByRole('combobox', {
      name: 'Load endpoint preset',
    })
    await user.click(presetTrigger)
    await user.click(
      screen.getByRole('option', {
        name: 'Prefill group: Standard Image Suite (2)',
      })
    )

    expect(screen.getByDisplayValue('image-generation')).toBeVisible()
    expect(screen.getByDisplayValue('image-edits')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Apply to selected' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const payload = post.mock.calls[0][1] as {
      endpoints_mode: string
      endpoints: string
      model_ids: number[]
    }
    expect(payload.model_ids).toEqual([10, 11])
    expect(payload.endpoints_mode).toBe('replace')
    expect(JSON.parse(payload.endpoints)).toEqual({
      'image-generation': { path: '/v1/images/generations', method: 'POST' },
      'image-edits': { path: '/v1/images/edits', method: 'POST' },
    })
    client.clear()
  })

  it('removes selected endpoint keys and clears all custom endpoints', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: [] },
    })
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { updated_count: 2, created_count: 0 } },
    })
    const client = createClient()

    render(
      <QueryClientProvider client={client}>
        <ModelBatchEndpointsDialog
          models={[modelWithImageEndpoint, modelWithMultipleEndpoints]}
          open
          onOpenChange={() => undefined}
          onSuccess={() => undefined}
        />
      </QueryClientProvider>
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Endpoints' }))
    await user.click(screen.getByRole('option', { name: 'Remove endpoints' }))

    expect(
      screen.getByRole('button', { name: 'Apply to selected' })
    ).toBeDisabled()

    const removePicker = screen.getByRole('combobox', {
      name: 'Select or type endpoint types to remove...',
    })
    await user.click(removePicker)
    await user.click(screen.getByRole('option', { name: /^image-edits/ }))
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Apply to selected' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith('/api/models/batch_update', {
      model_ids: [10, 11],
      channel_models: [],
      endpoints_mode: 'remove',
      endpoint_keys: ['image-edits'],
    })

    await user.click(screen.getByRole('combobox', { name: 'Endpoints' }))
    await user.click(
      screen.getByRole('option', { name: 'Clear custom endpoints' })
    )
    expect(
      screen.getByText(
        'Custom endpoints will be cleared for 2 selected models (2 currently have custom endpoints).'
      )
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Apply to selected' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    expect(post).toHaveBeenLastCalledWith('/api/models/batch_update', {
      model_ids: [10, 11],
      channel_models: [],
      endpoints_mode: 'clear',
    })
    client.clear()
  })

  it('shows inline validation error and blocks submission for invalid JSON or invalid path', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: [] },
    })
    const client = createClient()

    render(
      <QueryClientProvider client={client}>
        <ModelBatchEndpointsDialog
          models={[modelWithImageEndpoint]}
          open
          onOpenChange={() => undefined}
          onSuccess={() => undefined}
        />
      </QueryClientProvider>
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'JSON Mode' }))
    const editor = await screen.findByRole('textbox', {
      name: 'Endpoint Configuration',
    })
    fireEvent.input(editor, { target: { value: '{broken' } })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Endpoints must be valid JSON'
    )
    expect(
      screen.getByRole('button', { name: 'Apply to selected' })
    ).toBeDisabled()

    fireEvent.input(editor, {
      target: {
        value: '{"custom":{"path":"no-slash","method":"POST"}}',
      },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Endpoint paths must start with /'
    )
    expect(
      screen.getByRole('button', { name: 'Apply to selected' })
    ).toBeDisabled()
    client.clear()
  })
})

describe('ModelBatchManageDialog endpoints integration', () => {
  it('keeps endpoints unchanged by default and supports combining vendor with batch endpoints', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/api/vendors/') {
        return {
          data: {
            success: true,
            data: { items: [{ id: 5, name: 'OpenAI' }] },
          },
        }
      }
      return { data: { success: true, data: [] } }
    })
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { updated_count: 1, created_count: 0 } },
    })
    const client = createClient()

    render(
      <QueryClientProvider client={client}>
        <ModelBatchManageDialog
          models={[modelWithImageEndpoint]}
          open
          onOpenChange={() => undefined}
          onSuccess={() => undefined}
        />
      </QueryClientProvider>
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Vendor' }))
    await user.click(await screen.findByRole('option', { name: 'OpenAI' }))
    await user.click(screen.getByRole('button', { name: 'Apply to selected' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith('/api/models/batch_update', {
      model_ids: [10],
      channel_models: [],
      vendor_id: 5,
    })

    await user.click(screen.getByRole('combobox', { name: 'Endpoints' }))
    await user.click(
      screen.getByRole('option', { name: 'Append / merge endpoints' })
    )
    expect(
      screen.getByRole('button', { name: 'Apply to selected' })
    ).toBeDisabled()

    const templatePicker = screen.getByRole('combobox', {
      name: 'Select endpoint templates...',
    })
    await user.click(templatePicker)
    await user.click(screen.getByRole('option', { name: /^image-edits/ }))
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Apply to selected' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    expect(post).toHaveBeenLastCalledWith('/api/models/batch_update', {
      model_ids: [10],
      channel_models: [],
      vendor_id: 5,
      endpoints_mode: 'append',
      endpoints: JSON.stringify(
        {
          'image-edits': { path: '/v1/images/edits', method: 'POST' },
        },
        null,
        2
      ),
    })
    client.clear()
  })
})
