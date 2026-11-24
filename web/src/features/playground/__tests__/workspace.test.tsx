import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import type { CreationPreset } from '@/features/creation/presets'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { Playground } from '..'
import { saveConfig, saveMessages } from '../lib/storage/storage'
import type { ChatControls } from '../types'

const clients: QueryClient[] = []

async function chooseWorkspaceOption(
  user: ReturnType<typeof userEvent.setup>,
  field: string,
  option: string
) {
  const picker = await screen.findByRole('combobox', { name: field })
  await waitFor(() => expect(picker).toBeEnabled())
  await user.click(picker)
  await user.click(await screen.findByRole('option', { name: option }))
}

async function renderPlayground(
  initialModel?: string,
  preset?: CreationPreset,
  allowed: string[] = initialModel ? [initialModel] : [],
  chatControls?: Record<string, ChatControls>,
  keyAccess?: {
    hasKeys?: boolean
    group?: string
    inheritsGroup?: boolean
    alias?: string
    models?: string[]
    echo?: number | null
    controls?: Record<string, ChatControls>
    editPreset?: boolean
    priced?: boolean
  },
  initialMode: CreationPreset['mode'] | undefined = preset?.mode ??
    (initialModel ? 'image' : undefined)
) {
  if (!useAuthStore.getState().auth.user) {
    useAuthStore.getState().auth.setUser({
      id: 37,
      username: 'billing-fixture',
      role: 1,
      group: 'default',
    })
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  const group = keyAccess?.group ?? 'default'
  vi.spyOn(api, 'get').mockImplementation(async (url, options) => {
    if (url === '/api/user/models') {
      const params = options?.params as Record<string, unknown> | undefined
      const billingKeyId = params?.billing_key_id
      if (billingKeyId != null && params?.group != null) {
        return { data: { success: false, message: 'Wrong key group' } }
      }
      const models = billingKeyId ? (keyAccess?.models ?? allowed) : allowed
      return {
        data: {
          success: true,
          group: billingKeyId === 43 ? 'vip' : group,
          data: billingKeyId === 43 ? ['first-catalog-entry'] : models,
          model_limit_names:
            initialModel && keyAccess?.alias
              ? { [initialModel]: [keyAccess.alias] }
              : {},
          chat_controls: billingKeyId
            ? (keyAccess?.controls ?? chatControls)
            : chatControls,
          ...(billingKeyId
            ? {
                billing_key_id:
                  keyAccess?.echo === undefined ? billingKeyId : keyAccess.echo,
              }
            : {}),
        },
      }
    }
    if (url === '/api/user/self/groups') {
      return {
        data: {
          success: true,
          data: {
            [group]: {
              desc: 'Test group',
              ratio: group === 'auto' ? 'auto' : 2,
            },
            vip: {
              desc: 'VIP group',
              ratio: 1,
            },
          },
        },
      }
    }
    if (url === '/api/status') {
      return {
        data: {
          success: true,
          data: {
            usd_exchange_rate: 7,
          },
        },
      }
    }
    if (initialModel && url === '/api/pricing') {
      const studio = initialMode ?? 'image'
      const endpoints = {
        image: ['image-generation', 'image-edits'],
        chat: ['openai'],
        video: ['openai-video'],
        audio: ['audio-speech'],
      }
      return {
        data: {
          success: true,
          vendors: [],
          data: [
            {
              model_name: 'first-catalog-entry',
              output_modalities: ['image'],
              enable_groups: ['default'],
            },
            {
              model_name: initialModel,
              input_modalities: ['image', 'text'],
              supported_endpoint_types: endpoints[studio],
              output_modalities: [studio === 'chat' ? 'text' : studio],
              enable_groups: ['default', group],
              ...(keyAccess?.priced
                ? {
                    quota_type: 0,
                    model_ratio: 1,
                    completion_ratio: 2,
                  }
                : {}),
            },
          ],
        },
      }
    }
    if (
      (!initialModel || keyAccess?.hasKeys === false) &&
      url.startsWith('/api/token/')
    ) {
      return { data: { success: true, data: { items: [], total: 0 } } }
    }
    if (initialModel && url.startsWith('/api/token/')) {
      return {
        data: {
          success: true,
          data: {
            items: [
              {
                id: 42,
                name: 'Test key',
                status: 1,
                expired_time: -1,
                unlimited_quota: true,
                group: keyAccess?.inheritsGroup ? '' : group,
                model_limits_enabled: !!keyAccess?.alias,
                model_limits: keyAccess?.alias,
              },
              {
                id: 43,
                name: 'VIP key',
                status: 1,
                expired_time: -1,
                unlimited_quota: true,
                group: 'vip',
              },
              {
                id: 44,
                name: 'Expired at epoch',
                group,
                status: 1,
                expired_time: 0,
                unlimited_quota: true,
              },
              {
                id: 45,
                name: 'Alternative key',
                group,
                status: 1,
                expired_time: -1,
                unlimited_quota: true,
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
        <Playground
          editPreset={keyAccess?.editPreset}
          initialMode={initialMode}
          initialModel={initialModel}
          initialGroup={preset ? group : undefined}
          preset={preset}
        />
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  useAuthStore.getState().auth.reset()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('opening a scene prefills an editable prompt without revealing a key or starting a generation', async () => {
  const reveal = vi.spyOn(api, 'post')
  const gateway = vi.spyOn(globalThis, 'fetch')
  await renderPlayground('catalog-image', {
    id: 'site-photo',
    title: 'Site photo',
    model: 'catalog-image',
    mode: 'image',
    prompt: 'Keep my supplied background untouched.',
    parameters: { imageTask: 'edit', imageCount: 2, quality: 'low' },
  })
  expect(
    await screen.findByDisplayValue('Keep my supplied background untouched.')
  ).toBeVisible()
  expect(screen.getByRole('combobox', { name: 'Select model' })).toBeDisabled()
  await chooseWorkspaceOption(userEvent.setup(), 'API Key', 'Test key')
  expect(await screen.findByRole('button', { name: '2 张' })).toHaveClass(
    'is-active'
  )
  expect(screen.getByRole('button', { name: /^Generate/ })).toBeDisabled()
  expect(reveal).not.toHaveBeenCalled()
  expect(gateway).not.toHaveBeenCalled()
})

it.each([1, 10])('does not offer preset creation to role %s', async (role) => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'viewer', role })
  await renderPlayground('site-image', undefined, ['site-image'], undefined, {
    hasKeys: false,
    editPreset: true,
  })
  expect(
    await screen.findByRole('combobox', { name: 'Select model' })
  ).toBeDisabled()
  expect(
    screen.queryByRole('button', { name: 'Save as preset' })
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: 'Preset model' })).toBeNull()
  expect(
    vi.mocked(api.get).mock.calls.filter(([url]) => url === '/api/user/models')
  ).toHaveLength(0)
})

it('captures only enabled chat overrides and an explicitly supplied prompt, never chat history, and retains an unsaved form on failure', async () => {
  const user = userEvent.setup()
  useAuthStore
    .getState()
    .auth.setUser({ id: 11, username: 'editor', role: 100 })
  saveMessages([
    {
      key: 'private',
      from: 'user',
      versions: [{ id: 'original', content: 'Not part of the template' }],
    },
  ])
  const write = vi
    .spyOn(api, 'post')
    .mockImplementation(async (_url, item) => ({
      data: { success: true, data: item },
    }))
  write.mockResolvedValueOnce({
    data: { success: false, message: 'Fixture write unavailable' },
  })
  await renderPlayground(
    'site-text',
    {
      id: 'source',
      title: 'Source',
      mode: 'chat',
      model: 'site-text',
      prompt: 'Initial draft',
      parameters: { seed: 0, temperature: 0.7, reasoning_effort: 'low' },
    },
    ['site-text'],
    { 'site-text': { fields: ['seed'], efforts: ['low'] } }
  )
  const input = await screen.findByRole('textbox', { name: 'Ask anything' })
  await waitFor(() => expect(input).toBeEnabled())
  await user.clear(input)
  await screen.findByText('Not part of the template')
  await user.click(screen.getByRole('button', { name: 'Save as preset' }))
  const dialog = within(
    await screen.findByRole('dialog', { name: 'Save as preset' })
  )
  expect(dialog.getByLabelText('Prompt')).toHaveValue('')
  expect(dialog.queryByText('Not part of the template')).not.toBeInTheDocument()
  expect(dialog.getByRole('button', { name: 'Save draft' })).toBeDisabled()
  await user.type(dialog.getByLabelText('Prompt'), 'Public template text')
  await user.type(dialog.getByLabelText('Name'), 'Template')
  await user.type(dialog.getByLabelText('Tags'), 'Editing{Enter}')
  await user.click(dialog.getByRole('button', { name: 'Save draft' }))
  expect(await dialog.findByRole('alert')).toHaveTextContent(
    'Fixture write unavailable'
  )
  expect(dialog.getByLabelText('Name')).toHaveValue('Template')
  const captured = {
    id: expect.stringMatching(/^preset-/),
    title: 'Template',
    mode: 'chat',
    model: 'site-text',
    prompt: 'Public template text',
    category: '',
    description: '',
    tags: ['Editing'],
    featured: false,
    published: false,
    parameters: { temperature: 0.7, seed: 0, reasoning_effort: 'low' },
  }
  expect(write).toHaveBeenCalledWith('/api/option/creation-presets', captured)
  await user.click(dialog.getByRole('button', { name: 'Save draft' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(write.mock.calls).toEqual([write.mock.calls[0], write.mock.calls[0]])
  expect(input).toHaveValue('')
})

it.each([
  {
    mode: 'image',
    parameters: {
      imageTask: 'edit',
      imageSize: '1024x1536',
      quality: 'low',
      imageCount: 2,
      imageFormat: 'webp',
    },
    change: '1024x1024',
    expected: { imageSize: '1024x1024' },
  },
  {
    mode: 'video',
    parameters: {
      videoTask: 'i2v',
      resolution: '1080p',
      aspectRatio: '9:16',
      duration: 9,
      nativeAudio: false,
      cameraFixed: true,
    },
    change: '480p',
    expected: { resolution: '480p' },
  },
  {
    mode: 'audio',
    parameters: {
      voice: 'nova',
      audioFormat: 'opus',
      speed: 1.5,
      instructions: 'Speak softly.',
    },
    change: 'WAV',
    expected: { audioFormat: 'wav' },
  },
] as const)(
  'captures edited $mode controls without a billing key or any reference assets',
  async (studio) => {
    const user = userEvent.setup()
    useAuthStore
      .getState()
      .auth.setUser({ id: 11, username: 'editor', role: 100 })
    const write = vi
      .spyOn(api, 'post')
      .mockImplementation(async (_url, item) => ({
        data: { success: true, data: item },
      }))
    const gateway = vi.spyOn(globalThis, 'fetch')
    const model = `site-${studio.mode}`
    await renderPlayground(
      model,
      {
        id: 'source',
        title: 'Source',
        model,
        prompt: 'Editable',
        mode: studio.mode,
        parameters: studio.parameters,
      } as CreationPreset,
      [model],
      undefined,
      { hasKeys: false }
    )
    const composer = await screen.findByDisplayValue('Editable')
    await user.type(composer, ' workspace prompt')
    const setting = await screen.findByRole('button', { name: studio.change })
    expect(composer).toHaveFocus()
    await user.click(setting)
    if (studio.mode !== 'audio') {
      await user.click(screen.getByRole('button', { name: '添加参考素材' }))
      await user.type(
        screen.getByPlaceholderText('粘贴图片 / 视频链接后回车'),
        'https://private.example.test/reference.png{Enter}'
      )
    }
    expect(screen.getByRole('button', { name: /^Generate/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Save as preset' }))
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Save as preset' })
    )
    expect(dialog.getByLabelText('Prompt')).toHaveValue(
      'Editable workspace prompt'
    )
    const published = dialog.getByRole('checkbox', { name: 'Published' })
    expect(published).not.toBeChecked()
    await user.type(dialog.getByLabelText('Name'), 'Reusable setup')
    await user.click(published)
    await user.click(dialog.getByRole('button', { name: 'Publish preset' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(write.mock.calls).toEqual([
      [
        '/api/option/creation-presets',
        {
          id: expect.stringMatching(/^preset-/),
          mode: studio.mode,
          model,
          title: 'Reusable setup',
          category: '',
          description: '',
          prompt: 'Editable workspace prompt',
          featured: false,
          published: true,
          parameters: { ...studio.parameters, ...studio.expected },
        },
      ],
    ])
    expect(gateway).not.toHaveBeenCalled()
  }
)

it('opens the requested catalog model and uses the owner-approved key only on explicit generation', async () => {
  const user = userEvent.setup()
  const reveal = vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: { key: 'fixture-generation-value' } },
  })
  const gateway = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ data: [] })))
  vi.stubGlobal('fetch', gateway)
  await renderPlayground('selected-catalog-entry')
  expect(
    await screen.findByRole('combobox', { name: 'Select model' })
  ).toBeDisabled()
  expect(reveal).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: /Generate/ })).toBeDisabled()
  expect(screen.queryByRole('combobox', { name: 'Group' })).toBeNull()
  expect(screen.queryByText(/^~\$/)).toBeNull()
  await user.type(screen.getByRole('textbox'), 'My opt-in test prompt.')
  expect(screen.getByRole('button', { name: /Generate/ })).toBeDisabled()
  await user.click(screen.getByRole('combobox', { name: 'API Key' }))
  expect(await screen.findByRole('option', { name: 'VIP key' })).toBeVisible()
  await user.click(screen.getByRole('option', { name: 'Test key' }))
  await user.click(screen.getByRole('button', { name: /Generate/ }))
  await waitFor(() =>
    expect(gateway).toHaveBeenCalledWith(
      '/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-fixture-generation-value',
        }),
        body: expect.stringContaining('selected-catalog-entry'),
      })
    )
  )
  expect(reveal).toHaveBeenCalledWith('/api/token/42/key')
})

it('does not submit a generation when the owner key lookup is rejected', async () => {
  const user = userEvent.setup()
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: false, message: 'Fixture key unavailable' },
  })
  const gateway = vi.fn()
  vi.stubGlobal('fetch', gateway)
  await renderPlayground('selected-catalog-entry')
  await user.type(await screen.findByRole('textbox'), 'An explicit request.')
  await chooseWorkspaceOption(user, 'API Key', 'Test key')
  await user.click(await screen.findByRole('button', { name: /Generate/ }))
  expect(
    (await screen.findAllByText(/Fixture key unavailable/))[0]
  ).toBeVisible()
  expect(gateway).not.toHaveBeenCalled()
})

it('drops the old key’s model and media controls, preserves the draft, and never substitutes another available model', async () => {
  const user = userEvent.setup()
  const post = vi.spyOn(api, 'post')
  await renderPlayground(
    'restricted-image',
    undefined,
    ['restricted-image'],
    undefined,
    { group: 'research', inheritsGroup: true }
  )
  const keys = screen.getByRole('combobox', { name: 'API Key' })
  expect(screen.queryByRole('status', { name: 'Billing group' })).toBeNull()
  const model = screen.getByRole('combobox', { name: 'Select model' })
  await chooseWorkspaceOption(user, 'API Key', 'Test key')
  await waitFor(() => expect(model).toHaveValue('restricted-image'))
  await user.type(screen.getByRole('textbox'), 'My unsent image description')
  await user.click(screen.getByRole('button', { name: '4 张' }))
  expect(screen.queryByRole('status', { name: 'Billing group' })).toBeNull()
  expect(keys).toHaveTextContent('Test key')
  expect(keys).toHaveTextContent('research')
  await chooseWorkspaceOption(user, 'API Key', 'VIP key')
  expect(screen.queryByRole('status', { name: 'Billing group' })).toBeNull()
  expect(keys).toHaveTextContent('VIP key')
  expect(keys).toHaveTextContent('vip')
  await screen.findByText(
    'Requested model is unavailable in this group: restricted-image'
  )
  expect(keys).toHaveFocus()
  expect(screen.getByRole('combobox', { name: 'Select model' })).toBe(model)
  expect(model).toHaveValue('')
  await user.click(model)
  expect(screen.queryByRole('option', { name: 'restricted-image' })).toBeNull()
  expect(
    await screen.findByRole('option', { name: 'first-catalog-entry' })
  ).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('button', { name: '4 张' })).toBeNull()
  expect(screen.getByRole('button', { name: /^Generate/ })).toBeDisabled()
  await chooseWorkspaceOption(user, 'API Key', 'Test key')
  expect(await screen.findByRole('button', { name: '1 张' })).toHaveClass(
    'is-active'
  )
  expect(screen.getByRole('textbox')).toHaveValue('My unsent image description')
  expect(post).not.toHaveBeenCalled()
})

it('never silently replaces a requested model not granted to the selected group', async () => {
  await renderPlayground('denied-media', undefined, ['first-catalog-entry'])
  await chooseWorkspaceOption(userEvent.setup(), 'API Key', 'Test key')
  expect(
    await screen.findByText(
      'Requested model is unavailable in this group: denied-media'
    )
  ).toBeVisible()
  expect(screen.getByRole('button', { name: /^Generate/ })).toBeDisabled()
})

it('offers chat models confirmed by the key even when their public catalog entry is missing', async () => {
  const user = userEvent.setup()
  await renderPlayground(
    'listed-chat',
    undefined,
    ['listed-chat', 'unlisted-chat'],
    undefined,
    undefined,
    'chat'
  )
  const model = screen.getByRole('combobox', { name: 'Select model' })
  expect(model).toBeDisabled()
  await chooseWorkspaceOption(user, 'API Key', 'Test key')
  await waitFor(() => expect(model).toBeEnabled())
  await user.click(model)
  expect(
    screen.queryByRole('option', { name: 'first-catalog-entry' })
  ).toBeNull()
  await user.click(await screen.findByRole('option', { name: 'unlisted-chat' }))
  expect(model).toHaveValue('unlisted-chat')
})

it('lets an administrator choose a model to author a preset without granting generation access', async () => {
  const user = userEvent.setup()
  useAuthStore
    .getState()
    .auth.setUser({ id: 11, username: 'editor', role: 100 })
  const write = vi.spyOn(api, 'post')
  await renderPlayground(
    'catalog-image',
    undefined,
    ['first-catalog-entry', 'catalog-image'],
    undefined,
    { hasKeys: false, editPreset: true }
  )
  await chooseWorkspaceOption(user, 'Preset model', 'first-catalog-entry')
  await chooseWorkspaceOption(user, 'Preset model', 'catalog-image')
  expect(api.get).toHaveBeenCalledWith('/api/user/models', {
    params: {
      group: '',
      include_chat_controls: true,
      billing_key_id: undefined,
    },
  })
  expect(screen.getByRole('button', { name: 'Save as preset' })).toBeEnabled()
  expect(screen.getByRole('button', { name: /^Generate/ })).toBeDisabled()
  expect(screen.queryByRole('status', { name: 'Billing group' })).toBeNull()
  const create = screen.getByRole<HTMLAnchorElement>('link', {
    name: 'Create an API key',
  })
  const destination = new URL(create.href)
  expect(
    JSON.parse(destination.searchParams.get('playground') ?? 'null')
  ).toEqual({
    mode: 'image',
    model: 'catalog-image',
    editPreset: true,
  })
  expect(write).not.toHaveBeenCalled()
})

it('keeps the media key picker and selected model when key verification does not confirm the requested model', async () => {
  const user = userEvent.setup()
  const send = vi.spyOn(api, 'post')
  await renderPlayground(
    'protected-image',
    undefined,
    ['protected-image', 'first-catalog-entry'],
    undefined,
    { models: ['first-catalog-entry'] }
  )
  await chooseWorkspaceOption(user, 'API Key', 'Test key')
  expect(
    await screen.findByText(
      /Requested model is unavailable in this group: protected-image/
    )
  ).toBeVisible()
  expect(screen.getByRole('combobox', { name: 'API Key' })).toBeEnabled()
  await user.click(screen.getByRole('combobox', { name: 'API Key' }))
  expect(
    await screen.findByRole('option', { name: 'Alternative key' })
  ).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.getByRole('button', { name: /^Generate/ })).toBeDisabled()
  expect(send).not.toHaveBeenCalled()
})

it('embeds the confirmed billing group inside the API key selector across all four modes without a standalone group row', async () => {
  const user = userEvent.setup()
  await renderPlayground(
    'scope-fixture',
    undefined,
    ['scope-fixture'],
    undefined,
    {
      group: 'research',
      inheritsGroup: true,
    }
  )
  await chooseWorkspaceOption(user, 'API Key', 'Test key')
  const modes = within(screen.getByRole('group', { name: 'Mode' }))
  for (const mode of [
    'Text Chat',
    'Video Generation',
    'Image Generation',
    'Audio Synthesis',
  ]) {
    await user.click(modes.getByRole('button', { name: mode }))
    const billing = screen.getByRole('region', { name: 'Billing' })
    expect(screen.queryByRole('status', { name: 'Billing group' })).toBeNull()
    const keyTrigger = within(billing).getByRole('combobox', {
      name: 'API Key',
    })
    await waitFor(() => expect(keyTrigger).toHaveTextContent('research'))
    expect(keyTrigger).toHaveTextContent('Test key')
    expect(
      within(billing).getByRole('combobox', { name: 'Select model' })
    ).toBeVisible()
  }
})

it.each([null, 7])(
  'blocks explicit chat billing on absent or mismatched key confirmation (%s) without changing the draft or billing identity',
  async (echo) => {
    const user = userEvent.setup()
    const send = vi.spyOn(api, 'post')
    await renderPlayground(
      'requested',
      {
        id: 'test',
        mode: 'chat',
        title: 'Test',
        prompt: 'Keep this',
        model: 'requested',
      },
      ['requested', 'different'],
      undefined,
      { echo }
    )
    await chooseWorkspaceOption(user, 'API Key', 'Test key')
    const chatShell = screen
      .getByRole('region', { name: 'Billing' })
      .closest('.pg-chat-shell') as HTMLElement
    expect(
      await within(chatShell).findByText('Failed to load models')
    ).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Ask anything' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'API Key' })).toHaveTextContent(
      'Test key'
    )
    expect(screen.queryByRole('status', { name: 'Billing group' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Send/ })).toBeNull()
    await user.click(screen.getByRole('combobox', { name: 'API Key' }))
    expect(
      screen.queryByRole('option', { name: 'Expired at epoch' })
    ).toBeNull()
    await user.click(screen.getByRole('option', { name: 'Clear selection' }))
    expect(
      await screen.findByText(
        'Select an API key to load available models and start chatting.'
      )
    ).toBeVisible()
    expect(send).not.toHaveBeenCalled()
  }
)

it.each([true, false])(
  'charges the explicitly selected chat key and never falls back to the account (stream=%s)',
  async (stream) => {
    const user = userEvent.setup()
    useAuthStore.getState().auth.setUser({
      id: 37,
      username: 'billing-fixture',
      role: 1,
      group: 'default',
    })
    saveConfig({ stream })
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { key: 'billing-fixture-only' } },
    })
    const gateway = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'ok' } }] })
        )
      )
    vi.stubGlobal('fetch', gateway)
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const header = vi.spyOn(XMLHttpRequest.prototype, 'setRequestHeader')
    const send = vi
      .spyOn(XMLHttpRequest.prototype, 'send')
      .mockImplementation(() => undefined)
    await renderPlayground(
      'site-text',
      {
        id: 'billing',
        title: 'Billing test',
        mode: 'chat',
        model: 'site-text',
        prompt: 'Draft only',
      },
      ['site-text'],
      undefined,
      {
        group: 'auto',
        alias: 'public-match-name',
        controls: {
          'site-text': {
            fields: [],
            efforts: ['low', 'high'],
            default_effort: 'low',
          },
        },
      }
    )
    expect(
      screen.queryByRole('combobox', { name: 'Thinking level' })
    ).toBeNull()
    await chooseWorkspaceOption(user, 'API Key', 'Test key')
    expect(post).not.toHaveBeenCalled()
    await chooseWorkspaceOption(user, 'Thinking level', 'High')
    await user.click(screen.getByRole('button', { name: 'Request preview' }))
    const preview = JSON.parse(
      screen.getByText(/"site-text"/, { selector: 'code' }).textContent ??
        'null'
    )
    expect(preview).not.toHaveProperty('group')
    expect(screen.queryByRole('status', { name: 'Billing group' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'API Key' })).toHaveTextContent(
      'auto'
    )
    expect(preview).toEqual({
      model: 'site-text',
      messages: [{ role: 'user', content: 'Draft only' }],
      stream,
      reasoning_effort: 'high',
    })
    await user.click(screen.getByRole('button', { name: /^Send/ }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/token/42/key'))
    if (stream) {
      await waitFor(() => expect(send).toHaveBeenCalled())
      expect(
        open.mock.calls.some((call) => call[1] === '/v1/chat/completions')
      ).toBe(true)
      expect(header).toHaveBeenCalledWith(
        'Authorization',
        'Bearer sk-billing-fixture-only'
      )
      expect(JSON.parse(String(send.mock.calls[0][0]))).toEqual(preview)
    } else {
      await waitFor(() =>
        expect(gateway).toHaveBeenCalledWith(
          '/v1/chat/completions',
          expect.objectContaining({
            body: JSON.stringify(preview),
            headers: expect.objectContaining({
              Authorization: 'Bearer sk-billing-fixture-only',
            }),
          })
        )
      )
    }
    expect(post).toHaveBeenCalledTimes(1)
  }
)

it('prefills a published chat prompt as an editable draft, selects its exact model, and does not send it', async () => {
  const user = userEvent.setup()
  const post = vi.spyOn(api, 'post')
  const preset: CreationPreset = {
    id: 'editor',
    title: 'Summary',
    mode: 'chat',
    model: 'site-text',
    prompt: 'Keep this wording.',
    parameters: { temperature: 0.4, max_tokens: 30 },
  }
  await renderPlayground(preset.model, preset, ['other', preset.model])
  expect(
    await screen.findByText(
      'Select an API key to load available models and start chatting.'
    )
  ).toBeVisible()
  expect(screen.queryByRole('textbox', { name: 'Ask anything' })).toBeNull()
  await user.click(screen.getByRole('button', { name: /Test key/ }))
  expect(await screen.findByDisplayValue(preset.prompt)).toBeVisible()
  await waitFor(() =>
    expect(screen.getByDisplayValue(preset.prompt)).toBeEnabled()
  )
  expect(screen.getByRole('combobox', { name: 'Select model' })).toHaveValue(
    preset.model
  )
  expect(post).not.toHaveBeenCalled()
})

it.each([true, false])(
  'posts the exact JSON preview, including the edited draft and explicit overrides (stream=%s)',
  async (stream) => {
    const user = userEvent.setup()
    useAuthStore
      .getState()
      .auth.setUser({ id: 38, username: 'local-fixture', role: 1 })
    useAuthStore.setState((state) => ({
      auth: {
        ...state.auth,
        accessToken: 'fixture-only',
        accessExpiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
    }))
    saveConfig({ stream })
    const network = vi
      .spyOn(XMLHttpRequest.prototype, 'send')
      .mockImplementation(() => undefined)
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { key: 'fixture-explicit-key' } },
    })
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Fixture answer' } }],
        })
      )
    )
    vi.stubGlobal('fetch', transport)
    const preset: CreationPreset = {
      id: 'editor',
      title: 'Edit',
      mode: 'chat',
      model: 'site-text',
      prompt: 'Draft',
      parameters: { reasoning_effort: 'low', seed: 0 },
    }
    await renderPlayground(preset.model, preset, [preset.model], {
      'site-text': {
        fields: ['max_tokens'],
        efforts: ['low', 'medium'],
        default_effort: 'medium',
      },
    })
    await chooseWorkspaceOption(user, 'API Key', 'Test key')
    const input = await screen.findByRole('textbox', { name: 'Ask anything' })
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, ' updated')
    await user.click(screen.getByRole('button', { name: 'Parameters' }))
    const maxTokens = screen.getByRole('spinbutton', { name: 'Max Tokens' })
    expect(maxTokens).toBeDisabled()
    expect(
      screen.queryByRole('combobox', { name: 'Conversation history to send' })
    ).toBeNull()
    expect(
      screen.getByRole('spinbutton', { name: 'Temperature' })
    ).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: 'Seed' })).toHaveValue(0)
    expect(screen.getByRole('switch', { name: 'Enable Seed' })).toBeChecked()
    expect(
      screen.getByRole('combobox', { name: 'Thinking level' }).closest('form')
    ).not.toBeNull()
    await chooseWorkspaceOption(user, 'Thinking level', 'Medium')
    await user.click(screen.getByRole('switch', { name: 'Enable Max Tokens' }))
    await user.clear(maxTokens)
    await user.type(maxTokens, '64')
    await user.click(screen.getByRole('button', { name: 'Request preview' }))
    const preview = JSON.parse(
      screen.getByText(/"reasoning_effort"/, { selector: 'code' })
        .textContent ?? 'null'
    )
    expect(preview).toEqual({
      model: 'site-text',
      stream,
      messages: [{ role: 'user', content: 'Draft updated' }],
      reasoning_effort: 'medium',
      seed: 0,
      max_tokens: 64,
    })
    await user.click(screen.getByRole('button', { name: /^Send/ }))
    if (stream) {
      await waitFor(() =>
        expect(network).toHaveBeenCalledWith(JSON.stringify(preview))
      )
    } else {
      await waitFor(() =>
        expect(transport).toHaveBeenCalledWith(
          '/v1/chat/completions',
          expect.objectContaining({ body: JSON.stringify(preview) })
        )
      )
    }
    expect(post).toHaveBeenCalledWith('/api/token/42/key')
  }
)

it('opens a fresh text chat with six opt-in overrides and preserves the draft and choices when the panel reopens', async () => {
  const user = userEvent.setup()
  const post = vi.spyOn(api, 'post').mockResolvedValue({})
  await renderPlayground(
    'site-text',
    undefined,
    ['site-text'],
    undefined,
    undefined,
    'chat'
  )
  expect(
    await screen.findByRole('button', { name: 'Parameters', expanded: false })
  ).toBeEnabled()
  await chooseWorkspaceOption(user, 'API Key', 'Test key')
  const composer = await screen.findByRole('textbox', { name: 'Ask anything' })
  await user.type(composer, 'Keep this draft')
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^Send/ })).toBeEnabled()
  )
  const toggle = screen.getByRole('button', { name: 'Parameters' })
  toggle.focus()
  await user.keyboard('{Enter}')
  const panel = within(
    screen.getByRole('complementary', { name: 'Parameters' })
  )
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(panel.getAllByRole('switch')).toHaveLength(6)
  for (const name of [
    'Temperature',
    'Top P',
    'Frequency Penalty',
    'Presence Penalty',
    'Max Tokens',
    'Seed',
  ]) {
    const control = panel.getByRole('switch', { name: `Enable ${name}` })
    expect(control).not.toBeChecked()
    expect(control).toBeEnabled()
    expect(panel.getByRole('spinbutton', { name })).toBeDisabled()
  }
  await user.click(panel.getByRole('switch', { name: 'Enable Seed' }))
  const seed = panel.getByRole('spinbutton', { name: 'Seed' })
  await user.clear(seed)
  await user.type(seed, '17')
  await user.click(panel.getByRole('button', { name: 'Close' }))
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('complementary', { name: 'Parameters' })).toBeNull()
  await user.click(toggle)
  const reopened = within(
    screen.getByRole('complementary', { name: 'Parameters' })
  )
  expect(reopened.getByRole('switch', { name: 'Enable Seed' })).toBeChecked()
  expect(reopened.getByRole('spinbutton', { name: 'Seed' })).toHaveValue(17)
  expect(composer).toHaveValue('Keep this draft')
  expect(post).not.toHaveBeenCalled()
})

it('shows the parameters toggle and panel only in text mode, without generating a request', async () => {
  const send = vi.spyOn(api, 'post')
  const user = userEvent.setup()
  await renderPlayground()

  expect(
    await screen.findByRole('button', {
      name: 'Video Generation',
      pressed: true,
    })
  ).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Parameters' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Text Chat' }))
  await user.click(await screen.findByRole('button', { name: 'Parameters' }))
  expect(
    screen.getByRole('complementary', { name: 'Parameters' })
  ).toBeVisible()
  for (const mode of [
    'Image Generation',
    'Video Generation',
    'Audio Synthesis',
  ]) {
    await user.click(screen.getByRole('button', { name: mode }))
    expect(
      screen.getByRole('button', { name: mode, pressed: true })
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Parameters' })).toBeNull()
    expect(
      screen.queryByRole('complementary', { name: 'Parameters' })
    ).toBeNull()
  }
  expect(send).not.toHaveBeenCalled()
})

it('guides a keyless user to create their own key and hides the composer', async () => {
  const user = userEvent.setup()
  const post = vi.spyOn(api, 'post')
  const fetch = vi.spyOn(globalThis, 'fetch')
  await renderPlayground()
  for (const [label, mode] of [
    ['Video Generation', 'video'],
    ['Image Generation', 'image'],
    ['Audio Synthesis', 'audio'],
    ['Text Chat', 'chat'],
  ]) {
    await user.click(await screen.findByRole('button', { name: label }))
    const billing = within(screen.getByRole('region', { name: 'Billing' }))
    const create = await billing.findByRole('link', {
      name: 'Create an API key',
    })
    const destination = new URL((create as HTMLAnchorElement).href)
    expect(destination.pathname).toBe('/keys')
    expect(destination.searchParams.get('action')).toBe('create')
    expect(
      JSON.parse(destination.searchParams.get('playground') ?? 'null')
    ).toEqual({ mode })
    const model = billing.getByRole('combobox', { name: 'Select model' })
    expect(model).toBeDisabled()
    expect(model).toHaveAttribute('placeholder', 'Select an API key first')
  }
  expect(screen.queryByRole('textbox', { name: 'Ask anything' })).toBeNull()
  expect(
    screen.getByText(
      'No usable API key yet. Create your first API key to start chatting.'
    )
  ).toBeVisible()
  expect(
    screen.getAllByRole('link', { name: 'Create an API key' })
  ).toHaveLength(2)
  expect(post).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it.each([false, true])(
  'preserves the intended model or preset through key creation (preset %s)',
  async (fromPreset) => {
    const model = 'catalog-image'
    const preset: CreationPreset | undefined = fromPreset
      ? {
          id: 'site-photo',
          title: 'Site photo',
          mode: 'image',
          model,
          prompt: 'Portrait',
        }
      : undefined
    await renderPlayground(model, preset, [model], undefined, {
      hasKeys: false,
    })
    const billing = within(screen.getByRole('region', { name: 'Billing' }))
    const create = await billing.findByRole('link', {
      name: 'Create an API key',
    })
    const destination = new URL((create as HTMLAnchorElement).href)
    expect(
      JSON.parse(destination.searchParams.get('playground') ?? 'null')
    ).toEqual(
      fromPreset
        ? { preset: 'site-photo', group: 'default' }
        : { mode: 'image', model }
    )
    expect(
      billing.getByRole('combobox', { name: 'Select model' })
    ).toBeDisabled()
    expect(
      billing.getByRole('combobox', { name: 'Select model' })
    ).toHaveAttribute('placeholder', model)
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  }
)

it('reopens the signed-in user’s conversation instead of covering it with the video workspace', async () => {
  useAuthStore
    .getState()
    .auth.setUser({ id: 37, username: 'returning-user', role: 1 })
  saveMessages([
    {
      key: 'saved-message',
      from: 'user',
      versions: [
        { id: 'saved-version', content: 'Continue this conversation' },
      ],
    },
  ])
  await renderPlayground()

  expect(await screen.findByText('Continue this conversation')).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Text Chat', pressed: true })
  ).toBeVisible()
})

it('syncs the composer and topbar model selectors, displays Details after Model, and places current group pricing left of Send', async () => {
  const user = userEvent.setup()
  await renderPlayground(
    'alpha-chat',
    undefined,
    ['alpha-chat', 'beta-chat'],
    undefined,
    { priced: true },
    'chat'
  )

  const billing = screen.getByRole('region', { name: 'Billing' })
  const keyTrigger = within(billing).getByRole('combobox', { name: 'API Key' })
  await waitFor(() => expect(keyTrigger).toBeEnabled())
  await user.click(keyTrigger)
  const testKeyOption = await screen.findByRole('option', { name: 'Test key' })
  expect(testKeyOption).toHaveTextContent('default')
  const vipOption = screen.getByRole('option', { name: 'VIP key' })
  expect(vipOption).toHaveTextContent('vip')
  await user.click(testKeyOption)

  const topbarModel = within(billing).getByRole('combobox', {
    name: 'Select model',
  })
  await waitFor(() => expect(topbarModel).toHaveValue('alpha-chat'))

  const leftGroup = billing.querySelector('.pg-chat-bar-left')
  const rightGroup = billing.querySelector('.pg-chat-bar-right')
  const details = within(leftGroup as HTMLElement).getByRole('button', {
    name: 'Details',
  })
  expect(
    topbarModel.compareDocumentPosition(details) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expect(
    within(rightGroup as HTMLElement).queryByRole('button', { name: 'Details' })
  ).toBeNull()

  const form = await screen.findByRole('form', { name: 'Text Chat' })
  const priceReadout = await within(form).findByLabelText('Reference price')
  const sendButton = within(form).getByRole('button', { name: 'Send' })
  expect(priceReadout).toHaveTextContent(
    /Input [¥￥]28 · Output [¥￥]56 \/ 1M token/
  )
  expect(
    priceReadout.compareDocumentPosition(sendButton) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()

  const composerModel = within(form).getByRole('combobox', {
    name: 'Switch model',
  })
  expect(composerModel).toHaveValue('alpha-chat')
  await user.click(composerModel)
  await user.click(await screen.findByRole('option', { name: 'beta-chat' }))
  await waitFor(() => expect(topbarModel).toHaveValue('beta-chat'))
  expect(screen.getByRole('combobox', { name: 'Switch model' })).toHaveValue(
    'beta-chat'
  )

  await user.click(topbarModel)
  await user.click(await screen.findByRole('option', { name: 'alpha-chat' }))
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Switch model' })).toHaveValue(
      'alpha-chat'
    )
  )
})

it('toggles real web_search_options in preview and live requests only when declared, resetting on model or key change', async () => {
  const user = userEvent.setup()
  useAuthStore.getState().auth.setUser({
    id: 37,
    username: 'billing-fixture',
    role: 1,
    group: 'default',
  })
  saveConfig({ stream: false })
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: { key: 'fixture-web-key' } },
  })
  const gateway = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'Searched' } }] })
      )
    )
  vi.stubGlobal('fetch', gateway)

  await renderPlayground(
    'search-chat',
    undefined,
    ['search-chat', 'plain-chat'],
    {
      'search-chat': { web_search: true, fields: [] },
      'plain-chat': { web_search: false, fields: [] },
    },
    undefined,
    'chat'
  )

  await chooseWorkspaceOption(user, 'API Key', 'Test key')
  const input = await screen.findByRole('textbox', { name: 'Ask anything' })
  const searchBtn = screen.getByRole('button', { name: 'Online search' })
  expect(searchBtn).toBeEnabled()
  expect(searchBtn).toHaveAttribute('aria-pressed', 'false')

  await user.click(searchBtn)
  expect(searchBtn).toHaveAttribute('aria-pressed', 'true')
  await user.type(input, 'Latest news')

  await user.click(screen.getByRole('button', { name: 'Request preview' }))
  const preview = JSON.parse(
    screen.getByText(/"search-chat"/, { selector: 'code' }).textContent ??
      'null'
  )
  expect(preview).toEqual({
    model: 'search-chat',
    messages: [{ role: 'user', content: 'Latest news' }],
    stream: false,
    web_search_options: { search_context_size: 'medium' },
  })

  await user.click(screen.getByRole('button', { name: /^Send/ }))
  await waitFor(() =>
    expect(gateway).toHaveBeenCalledWith(
      '/v1/chat/completions',
      expect.objectContaining({
        body: JSON.stringify(preview),
      })
    )
  )
  expect(post).toHaveBeenCalledWith('/api/token/42/key')

  await chooseWorkspaceOption(user, 'Switch model', 'plain-chat')
  const disabledSearch = await screen.findByRole('button', {
    name: 'Online search',
  })
  expect(disabledSearch).toBeDisabled()
  expect(disabledSearch).toHaveAttribute('aria-pressed', 'false')
  const updatedPreview = JSON.parse(
    screen.getByText(/"plain-chat"/, { selector: 'code' }).textContent ?? 'null'
  )
  expect(updatedPreview).not.toHaveProperty('web_search_options')

  await chooseWorkspaceOption(user, 'Switch model', 'search-chat')
  const resetSearch = await screen.findByRole('button', {
    name: 'Online search',
  })
  expect(resetSearch).toBeEnabled()
  expect(resetSearch).toHaveAttribute('aria-pressed', 'false')
})

it('hides the chat composer for an unsupported model and lets the user switch to an allowed model without silent substitution', async () => {
  const user = userEvent.setup()
  const post = vi.spyOn(api, 'post')
  await renderPlayground(
    'restricted-chat',
    undefined,
    ['allowed-chat'],
    undefined,
    undefined,
    'chat'
  )

  expect(screen.queryByRole('textbox', { name: 'Ask anything' })).toBeNull()
  await chooseWorkspaceOption(user, 'API Key', 'Test key')
  expect(
    await screen.findByText(
      'Selected key (Test key) does not support model restricted-chat.'
    )
  ).toBeVisible()
  expect(screen.queryByRole('textbox', { name: 'Ask anything' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Switch API key' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Create an API key' })).toBeVisible()

  await user.click(
    screen.getByRole('button', { name: 'Switch to allowed-chat' })
  )
  expect(
    await screen.findByRole('textbox', { name: 'Ask anything' })
  ).toBeVisible()
  expect(screen.getByRole('combobox', { name: 'Select model' })).toHaveValue(
    'allowed-chat'
  )
  expect(post).not.toHaveBeenCalled()
})
