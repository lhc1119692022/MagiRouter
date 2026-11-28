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

async function renderImagePlayground(
  modelName: string,
  options?: { role?: number; autoSelectKey?: boolean }
) {
  useAuthStore.getState().auth.setUser({
    id: 37,
    username: 'studio-user',
    role: options?.role ?? 1,
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
              quota_type: 1,
              model_price: 0.01,
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
  if (options?.autoSelectKey !== false) {
    await user.click(keyPicker)
    await user.click(await screen.findByRole('option', { name: 'Studio key' }))
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Select model' })
      ).toHaveValue(modelName)
    )
  }
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
  it('renders clean sidebar without Parameters header/doc link/watermark/safety_id, places Save as preset right of Copy cURL, and shows minimal icon+price next to Generate', async () => {
    const user = await renderImagePlayground('seedream-5.5', { role: 100 })

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

    expect(screen.queryByText('Parameters')).toBeNull()
    expect(
      screen.queryByRole('link', { name: /Volcengine Ark API Reference/ })
    ).toBeNull()
    expect(screen.queryByTestId('pg-image-route-indicator')).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Watermark' })).toBeNull()
    expect(
      screen.queryByRole('textbox', { name: 'End-user identifier' })
    ).toBeNull()

    const copyCurlBtn = screen.getByRole('button', { name: '复制 cURL' })
    const savePresetBtn = screen.getByRole('button', { name: 'Save as preset' })
    expect(copyCurlBtn.parentElement).toBe(savePresetBtn.parentElement)
    expect(
      Boolean(
        copyCurlBtn.compareDocumentPosition(savePresetBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true)

    const generateBtn = screen.getByRole('button', { name: /^Generate/ })
    const priceReadout = screen.getByLabelText('Reference price')
    expect(priceReadout).toHaveClass('pg-price-minimal')
    expect(priceReadout).toHaveTextContent(/^[¥￥]0\.07$/)
    expect(priceReadout.parentElement).toBe(generateBtn.parentElement)
    expect(
      Boolean(
        priceReadout.compareDocumentPosition(generateBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true)

    expect(screen.getByRole('button', { name: '2K' })).toHaveClass('is-active')
    expect(screen.getByTestId('pg-resolved-pixel-size')).toHaveTextContent(
      '2048 × 2048 px'
    )
    expect(
      screen.getByRole('switch', { name: 'Layer decomposition' })
    ).not.toBeChecked()

    await user.click(screen.getByRole('combobox', { name: 'Aspect ratio' }))
    await user.click(await screen.findByRole('option', { name: '16:9' }))
    expect(screen.getByTestId('pg-resolved-pixel-size')).toHaveTextContent(
      '2816 × 1584 px'
    )

    await user.click(screen.getByRole('button', { name: '1K' }))
    expect(screen.getByTestId('pg-resolved-pixel-size')).toHaveTextContent(
      '1424 × 800 px'
    )

    await user.click(screen.getByRole('button', { name: 'Custom pixels' }))
    expect(
      screen.getByRole('textbox', { name: 'Custom pixel size' })
    ).toHaveValue('1424x800')

    await user.click(screen.getByRole('button', { name: 'JPEG' }))
    await user.click(screen.getByRole('button', { name: 'Transparent (RGBA)' }))
    expect(screen.getByRole('button', { name: 'PNG' })).toHaveClass('is-active')
  })

  it('shows Select API key on the primary button when no key is chosen and expands the key dropdown on click', async () => {
    const user = await renderImagePlayground('seedream-5.5', {
      autoSelectKey: false,
    })

    const selectKeyBtn = screen.getByRole('button', { name: 'Select API key' })
    expect(selectKeyBtn).toBeEnabled()
    expect(screen.queryByRole('button', { name: /^Generate/ })).toBeNull()

    await user.click(selectKeyBtn)
    const keyOption = await screen.findByRole('option', { name: 'Studio key' })
    expect(keyOption).toBeVisible()
    await user.click(keyOption)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Generate/ })).toBeVisible()
    )
  })

  it('adds drag handles for multiple reference images, reorders via handle/drop, and routes endpoints silently via prompt lexicon', async () => {
    const user = await renderImagePlayground('seedream-5.5')
    expect(screen.queryByTestId('pg-image-route-indicator')).toBeNull()
    expect(screen.getAllByTestId('pg-ref-slot-empty')).toHaveLength(1)
    expect(screen.queryAllByTestId('pg-ref-drag-handle')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Add image URL' }))
    await user.type(
      screen.getByPlaceholderText('Paste image URL and press Enter'),
      'https://example.com/ref-1.png{Enter}'
    )

    expect(screen.getAllByTestId('pg-ref-slot-filled')).toHaveLength(1)
    expect(screen.queryAllByTestId('pg-ref-drag-handle')).toHaveLength(0)
    expect(screen.getAllByTestId('pg-ref-slot-empty')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Add image URL' }))
    await user.type(
      screen.getByPlaceholderText('Paste image URL and press Enter'),
      'https://example.com/ref-2.png{Enter}'
    )
    const filledSlots = screen.getAllByTestId('pg-ref-slot-filled')
    expect(filledSlots).toHaveLength(2)
    expect(screen.getAllByTestId('pg-ref-drag-handle')).toHaveLength(2)
    expect(filledSlots[0]).toHaveTextContent('ref-1.png')
    expect(filledSlots[1]).toHaveTextContent('ref-2.png')
    expect(screen.getAllByTestId('pg-ref-slot-empty')).toHaveLength(1)

    fireEvent.keyDown(screen.getAllByTestId('pg-ref-drag-handle')[1], {
      key: 'ArrowUp',
    })
    const reorderedSlots = screen.getAllByTestId('pg-ref-slot-filled')
    expect(reorderedSlots[0]).toHaveTextContent('ref-2.png')
    expect(reorderedSlots[1]).toHaveTextContent('ref-1.png')

    const promptBox = screen.getByRole('textbox', { name: /Prompt/ })
    await user.type(promptBox, '参考这张图的画风和构图生成新场景')
    expect(screen.getByText('POST /v1/images/generations')).toBeVisible()

    await user.clear(promptBox)
    await user.type(promptBox, '把背景换成樱花街道')
    expect(screen.getByText('POST /v1/images/edits')).toBeVisible()
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
        size: '2048x1152',
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
    expect(screen.getByTestId('pg-resolved-pixel-size')).toHaveTextContent(
      '2048 × 1152 px'
    )
  })

  it('supports Seedream 5.5 layer decomposition end-to-end with interactive composite/solo inspector and OCR details', async () => {
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
              size: '2048x1152',
            },
            {
              url: 'https://cdn.example.test/title.png',
              z_index: 1,
              name: 'Title',
              description: 'White bold headline text at top center',
              size: '820x160',
              bounding_box: {
                absolute: [614, 120, 1434, 280],
                normalized: [300, 104, 700, 243],
              },
              text_recognition: {
                text: 'SUMMER SALE',
                lines: [
                  {
                    runs: [
                      {
                        text: 'SUMMER SALE',
                        style: {
                          similar_font_family: 'PingFang SC',
                          foreground_color: '#FFFFFF',
                          bold: true,
                        },
                      },
                    ],
                  },
                ],
              },
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
    expect(screen.getByText('POST /v1/images/generations')).toBeVisible()

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
    expect(sentPayload.watermark).toBe(false)
    expect(sentPayload).not.toHaveProperty('background')
    expect(sentPayload).not.toHaveProperty('prompt')
    expect(String(sentPayload.image)).toMatch(/^data:image\/png;base64,/)

    const inspector = await screen.findByTestId('pg-layer-inspector')
    expect(
      within(inspector).getByRole('tab', { name: 'Composite' })
    ).toHaveAttribute('aria-selected', 'true')
    const titleRowBtn = within(inspector)
      .getAllByRole('button', { name: /Title/ })
      .find((btn) => btn.classList.contains('pg-layer-select-btn'))
    expect(titleRowBtn).toBeDefined()
    if (!titleRowBtn) {
      throw new Error('Expected Title layer row button to be rendered')
    }
    await user.click(titleRowBtn)

    const ocrBox = within(inspector).getByTestId('pg-layer-ocr-box')
    expect(ocrBox).toHaveTextContent('SUMMER SALE')
    expect(ocrBox).toHaveTextContent('PingFang SC')
    expect(ocrBox).toHaveTextContent('#FFFFFF')

    await user.click(within(inspector).getByRole('tab', { name: 'Solo layer' }))
    expect(
      within(inspector).getByRole('tab', { name: 'Solo layer' })
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('adapts form controls, 16-reference edits routing, compression, background, and extended quality for gpt-image-2.5-flare', async () => {
    const user = await renderImagePlayground('gpt-image-2.5-flare')
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { key: 'oai-test-key' } },
    })
    const gateway = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: 'iVBORw0KGgo=' }],
        })
      )
    )
    vi.stubGlobal('fetch', gateway)

    expect(screen.getByText('0 / 32000')).toBeVisible()
    expect(screen.getByText('0 / 16')).toBeVisible()

    const tierGroup = screen.getByRole('group', { name: 'Resolution tier' })
    expect(within(tierGroup).getByRole('button', { name: 'auto' })).toHaveClass(
      'is-active'
    )
    expect(within(tierGroup).getByRole('button', { name: '2K' })).toBeVisible()
    expect(within(tierGroup).getByRole('button', { name: '4K' })).toBeVisible()
    expect(screen.queryByRole('combobox', { name: 'Aspect ratio' })).toBeNull()

    await user.click(within(tierGroup).getByRole('button', { name: '2K' }))
    const ratioSelect = screen.getByRole('combobox', { name: 'Aspect ratio' })
    await user.click(ratioSelect)
    await user.click(await screen.findByRole('option', { name: '16:9' }))
    expect(screen.getByTestId('pg-resolved-pixel-size')).toHaveTextContent(
      '2048 × 1152 px'
    )

    const qualityGroup = screen.getByRole('group', { name: 'Quality' })
    expect(
      within(qualityGroup).getByRole('button', { name: 'auto' })
    ).toHaveClass('is-active')
    await user.click(
      within(qualityGroup).getByRole('button', { name: 'xhigh' })
    )
    expect(
      within(qualityGroup).getByRole('button', { name: 'max' })
    ).toBeVisible()
    expect(
      screen.queryByRole('group', { name: 'Planning complexity' })
    ).toBeNull()

    const formatGroup = screen.getByRole('group', { name: 'Output format' })
    await user.click(within(formatGroup).getByRole('button', { name: 'JPEG' }))
    const compressionSlider = screen.getByRole('slider', {
      name: 'Output compression',
    })
    expect(compressionSlider).toHaveValue('100')
    fireEvent.change(compressionSlider, { target: { value: '85' } })

    const bgGroup = screen.getByRole('group', { name: 'Background alpha' })
    await user.click(
      within(bgGroup).getByRole('button', { name: 'Transparent (RGBA)' })
    )
    expect(
      within(formatGroup).getByRole('button', { name: 'PNG' })
    ).toHaveClass('is-active')
    await user.click(within(formatGroup).getByRole('button', { name: 'WEBP' }))
    expect(
      within(bgGroup).getByRole('button', { name: 'Transparent (RGBA)' })
    ).toHaveClass('is-active')

    await user.click(
      within(screen.getByRole('group', { name: 'Moderation level' })).getByRole(
        'button',
        { name: 'Low (less restrictive)' }
      )
    )

    await user.click(screen.getByRole('switch', { name: 'Stream output' }))
    await user.click(
      within(
        screen.getByRole('group', { name: 'Partial preview images' })
      ).getByRole('button', { name: '2' })
    )

    await user.click(screen.getByRole('button', { name: 'Add image URL' }))
    await user.type(
      screen.getByPlaceholderText('Paste image URL and press Enter'),
      'https://example.com/cat.png{Enter}'
    )
    await user.type(
      screen.getByRole('textbox', { name: /Prompt/ }),
      '参考这张图的画风生成雪山新场景'
    )
    expect(screen.getByText('POST /v1/images/edits')).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Input fidelity' })).toBeNull()

    await user.click(screen.getByRole('button', { name: /^Generate/ }))
    await waitFor(() =>
      expect(gateway).toHaveBeenCalledWith(
        '/v1/images/edits',
        expect.objectContaining({ method: 'POST' })
      )
    )
    const sentPayload = JSON.parse(
      String(gateway.mock.calls[0]?.[1]?.body ?? '{}')
    ) as Record<string, unknown>
    expect(sentPayload).toEqual({
      model: 'gpt-image-2.5-flare',
      prompt: '参考这张图的画风生成雪山新场景',
      images: [{ image_url: 'https://example.com/cat.png' }],
      size: '2048x1152',
      quality: 'xhigh',
      n: 1,
      background: 'transparent',
      output_format: 'webp',
      output_compression: 85,
      moderation: 'low',
      stream: true,
      partial_images: 2,
    })
  })

  it('shows discrete sizes without custom pixel toggle and edit-only input fidelity for gpt-image-1.5', async () => {
    const user = await renderImagePlayground('gpt-image-1.5')
    expect(screen.queryByRole('button', { name: 'Custom pixels' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resolution tier' })).toBeNull()
    expect(
      within(screen.getByRole('group', { name: 'Image size' })).getByRole(
        'button',
        { name: 'auto' }
      )
    ).toHaveClass('is-active')
    expect(screen.queryByRole('group', { name: 'Input fidelity' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Add image URL' }))
    await user.type(
      screen.getByPlaceholderText('Paste image URL and press Enter'),
      'https://example.com/portrait.png{Enter}'
    )
    const fidelityGroup = screen.getByRole('group', { name: 'Input fidelity' })
    expect(
      within(fidelityGroup).getByRole('button', { name: 'low' })
    ).toHaveClass('is-active')
    expect(
      within(fidelityGroup).getByRole('button', { name: 'high' })
    ).toBeVisible()
  })

  it('exposes complexity, GIF frame controls, and SVG safeguards for gpt-image-2.6-flare', async () => {
    const user = await renderImagePlayground('gpt-image-2.6-flare')
    const complexityGroup = screen.getByRole('group', {
      name: 'Planning complexity',
    })
    expect(
      within(complexityGroup).getByRole('button', { name: 'high' })
    ).toHaveClass('is-active')
    await user.click(
      within(complexityGroup).getByRole('button', { name: 'low' })
    )

    const formatGroup = screen.getByRole('group', { name: 'Output format' })
    await user.click(within(formatGroup).getByRole('button', { name: 'GIF' }))
    expect(screen.getByRole('slider', { name: 'Frame count' })).toHaveValue('9')
    expect(screen.getByRole('slider', { name: 'Frame duration' })).toHaveValue(
      '200'
    )
    expect(screen.queryByRole('switch', { name: 'Stream output' })).toBeNull()

    await user.click(within(formatGroup).getByRole('button', { name: 'SVG' }))
    expect(
      screen.getByText('SVG output supports 1 image per request.')
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Add image URL' }))
    await user.type(
      screen.getByPlaceholderText('Paste image URL and press Enter'),
      'https://example.com/icon.png{Enter}'
    )
    expect(
      within(formatGroup).getByRole('button', { name: 'PNG' })
    ).toHaveClass('is-active')
    expect(
      within(formatGroup).getByRole('button', { name: 'SVG' })
    ).toBeDisabled()
  })
})
