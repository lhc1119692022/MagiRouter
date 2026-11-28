import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { Playground } from '..'

const clients: QueryClient[] = []

async function renderImagePlayground(modelName: string) {
  useAuthStore.getState().auth.setUser({
    id: 37,
    username: 'studio-user',
    role: 1,
    group: 'default',
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)

  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/models') {
      return {
        data: {
          success: true,
          group: 'default',
          billing_key_id: 42,
          data: [modelName],
        },
      }
    }
    if (url === '/api/user/self/groups') {
      return {
        data: {
          success: true,
          data: { default: { desc: 'Default', ratio: 1 } },
        },
      }
    }
    if (url === '/api/status') {
      return {
        data: { success: true, data: { usd_exchange_rate: 7 } },
      }
    }
    if (url === '/api/pricing') {
      return {
        data: {
          success: true,
          vendors: [],
          data: [
            {
              model_name: modelName,
              input_modalities: ['text', 'image'],
              output_modalities: ['image'],
              supported_endpoint_types: ['image-generation', 'image-edits'],
              enable_groups: ['default'],
            },
          ],
        },
      }
    }
    if (url.startsWith('/api/token/')) {
      return {
        data: {
          success: true,
          data: {
            items: [
              {
                id: 42,
                name: 'Studio key',
                status: 1,
                expired_time: -1,
                unlimited_quota: true,
                group: 'default',
              },
            ],
          },
        },
      }
    }
    return { data: { success: true, data: [], vendors: [] } }
  })

  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <Playground initialMode='image' initialModel={modelName} />
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )

  const user = userEvent.setup()
  const keyPicker = await screen.findByRole('combobox', { name: 'API Key' })
  await waitFor(() => expect(keyPicker).toBeEnabled())
  await user.click(keyPicker)
  await user.click(await screen.findByRole('option', { name: 'Studio key' }))
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Select model' })).toHaveValue(
      modelName
    )
  )
  return user
}

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  useAuthStore.getState().auth.reset()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Image Playground Studio', () => {
  it('renders panel title with top Form/JSON slider, stacked API Key & Model rows, and Seedream 5.5 Ark controls', async () => {
    const user = await renderImagePlayground('seedream-5.5')

    expect(
      screen.getByRole('heading', { name: 'Image generation' })
    ).toBeVisible()
    const switcher = screen.getByRole('tablist', { name: 'Input mode' })
    expect(
      within(switcher).getByRole('tab', { name: 'Form', selected: true })
    ).toBeVisible()
    expect(
      within(switcher).getByRole('tab', { name: 'JSON', selected: false })
    ).toBeVisible()

    const billing = screen.getByRole('region', { name: 'Billing' })
    expect(billing.querySelectorAll('.pg-api-row')).toHaveLength(2)

    expect(
      screen.getByRole('link', { name: /Volcengine Ark API Reference/ })
    ).toHaveAttribute(
      'href',
      'https://docs.volcengine.com/docs/zh/ark/image-generation-api.md'
    )
    expect(screen.getByRole('button', { name: '2K' })).toHaveClass('is-active')
    expect(
      screen.getByRole('switch', { name: 'Layer decomposition' })
    ).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Watermark' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'JPEG' }))
    await user.click(screen.getByRole('button', { name: 'Transparent (RGBA)' }))
    expect(screen.getByRole('button', { name: 'PNG' })).toHaveClass('is-active')
  })

  it('appends a new empty reference slot after each added image and routes endpoints via prompt lexicon with edit fallback', async () => {
    const user = await renderImagePlayground('seedream-5.5')
    const routeIndicator = screen.getByTestId('pg-image-route-indicator')

    expect(routeIndicator).toHaveTextContent('Text to Image')
    expect(routeIndicator).toHaveTextContent('/v1/images/generations')
    expect(screen.getAllByTestId('pg-ref-slot-empty')).toHaveLength(1)
    expect(screen.queryAllByTestId('pg-ref-slot-filled')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Add image URL' }))
    await user.type(
      screen.getByPlaceholderText('Paste image URL and press Enter'),
      'https://example.com/ref-1.png{Enter}'
    )

    expect(screen.getAllByTestId('pg-ref-slot-filled')).toHaveLength(1)
    expect(screen.getAllByTestId('pg-ref-slot-empty')).toHaveLength(1)

    const promptBox = screen.getByRole('textbox', { name: /Prompt/ })
    await user.type(promptBox, 'A calm mountain lake at sunrise')
    expect(routeIndicator).toHaveTextContent('Image edit')
    expect(routeIndicator).toHaveTextContent('/v1/images/edits')
    expect(routeIndicator).toHaveTextContent('Edit endpoint fallback')

    await user.clear(promptBox)
    await user.type(promptBox, '参考这张图的画风和构图生成新场景')
    expect(routeIndicator).toHaveTextContent('Reference generation')
    expect(routeIndicator).toHaveTextContent('/v1/images/generations')

    await user.click(screen.getByRole('button', { name: 'Add image URL' }))
    await user.type(
      screen.getByPlaceholderText('Paste image URL and press Enter'),
      'https://example.com/ref-2.png{Enter}'
    )
    expect(screen.getAllByTestId('pg-ref-slot-filled')).toHaveLength(2)
    expect(screen.getAllByTestId('pg-ref-slot-empty')).toHaveLength(1)

    await user.clear(promptBox)
    await user.type(promptBox, '把背景换成樱花街道')
    expect(routeIndicator).toHaveTextContent('Image edit')
    expect(routeIndicator).toHaveTextContent('/v1/images/edits')
  })

  it('switches the entire sidebar into an editable JSON request body, submits edited JSON, and syncs back to Form', async () => {
    const user = await renderImagePlayground('seedream-5.5')
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { key: 'ark-secret-key' } },
    })
    const gateway = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ url: 'https://cdn.example.test/out.png' }],
        })
      )
    )
    vi.stubGlobal('fetch', gateway)

    await user.type(
      screen.getByRole('textbox', { name: /Prompt/ }),
      'Initial form prompt'
    )
    await user.click(screen.getByRole('tab', { name: 'JSON' }))

    expect(screen.queryByRole('region', { name: 'Billing' })).toBeNull()
    const jsonEditor = screen.getByRole('textbox', {
      name: 'Request body JSON',
    })
    expect(jsonEditor).toBeVisible()

    fireEvent.input(jsonEditor, { target: { value: '{broken' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid JSON syntax.')
    expect(screen.getByRole('button', { name: /^Generate/ })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Sync from form' }))
    expect(screen.queryByRole('alert')).toBeNull()

    const editedBody = JSON.stringify(
      {
        model: 'seedream-5.5',
        prompt: '把背景换成海边日落',
        image: 'https://example.com/source.png',
        size: '1.5K',
        output_format: 'png',
        background: 'transparent',
        response_format: 'url',
        watermark: false,
      },
      null,
      2
    )
    fireEvent.input(jsonEditor, { target: { value: editedBody } })

    await user.click(screen.getByRole('button', { name: /^Generate/ }))
    await waitFor(() =>
      expect(gateway).toHaveBeenCalledWith(
        '/v1/images/edits',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(JSON.parse(editedBody)),
        })
      )
    )

    await user.click(screen.getByRole('tab', { name: 'Form' }))
    expect(screen.getByRole('textbox', { name: /Prompt/ })).toHaveValue(
      '把背景换成海边日落'
    )
    expect(screen.getByRole('button', { name: '1.5K' })).toHaveClass(
      'is-active'
    )
    expect(screen.getByRole('switch', { name: 'Watermark' })).not.toBeChecked()
  })

  it('supports Seedream 5.5 layer decomposition with optional prompt and local image upload', async () => {
    const user = await renderImagePlayground('seedream-5.5')
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { key: 'ark-layer-key' } },
    })
    const gateway = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              url: 'https://cdn.example.test/base.png',
              z_index: 0,
              name: 'Base',
            },
            {
              url: 'https://cdn.example.test/title.png',
              z_index: 1,
              name: 'Title',
            },
          ],
        })
      )
    )
    vi.stubGlobal('fetch', gateway)

    await user.click(
      screen.getByRole('switch', { name: 'Layer decomposition' })
    )
    expect(screen.getByRole('button', { name: 'auto' })).toHaveClass(
      'is-active'
    )
    expect(screen.getByRole('button', { name: /^Generate/ })).toBeDisabled()

    const fileInput = screen.getByLabelText(
      'Upload reference image'
    ) as HTMLInputElement
    const pngFile = new File(
      [new Uint8Array([137, 80, 78, 71])],
      'poster.png',
      {
        type: 'image/png',
      }
    )
    await user.upload(fileInput, pngFile)

    await waitFor(() =>
      expect(screen.getAllByTestId('pg-ref-slot-filled')).toHaveLength(1)
    )
    expect(screen.queryAllByTestId('pg-ref-slot-empty')).toHaveLength(0)
    expect(screen.getByTestId('pg-image-route-indicator')).toHaveTextContent(
      '/v1/images/generations'
    )

    await user.click(screen.getByRole('switch', { name: 'Rich text OCR' }))
    await user.click(screen.getByRole('button', { name: /^Generate/ }))

    await waitFor(() =>
      expect(gateway).toHaveBeenCalledWith(
        '/v1/images/generations',
        expect.objectContaining({ method: 'POST' })
      )
    )
    const sentPayload = JSON.parse(
      String(gateway.mock.calls[0]?.[1]?.body ?? '{}')
    ) as Record<string, unknown>
    expect(sentPayload.layer_decomposition).toBe(true)
    expect(sentPayload.layer_decomposition_options).toEqual({
      max_images: 30,
      text_recognition: true,
    })
    expect(sentPayload.size).toBe('auto')
    expect(sentPayload).not.toHaveProperty('background')
    expect(sentPayload).not.toHaveProperty('prompt')
    expect(String(sentPayload.image)).toMatch(/^data:image\/png;base64,/)

    expect(await screen.findByRole('button', { name: /Title/ })).toBeVisible()
  })
})
