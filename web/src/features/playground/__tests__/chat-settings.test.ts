import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { creationPresetList } from '@/features/creation/presets'
import { useAuthStore } from '@/stores/auth-store'

import { DEFAULT_CONFIG, STORAGE_KEYS } from '../constants'
import { usePlaygroundState } from '../hooks/use-playground-state'
import { resolveChatControls } from '../lib/parameters/playground-parameters'
import { loadConfig, saveParameterEnabled } from '../lib/storage/storage'
import {
  buildChatCompletionPayload,
  getChatParameterOverrides,
} from '../lib/streaming/payload-builder'
import type { ChatControls, Message, ParameterEnabled } from '../types'

afterEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.reset()
})

it('keeps documented support and reasoning effort separate from explicit numeric overrides', () => {
  const config = {
    ...DEFAULT_CONFIG,
    model: 'public-alias',
    temperature: 0,
    seed: 21,
    historyTurns: 1 as const,
    parameterEnabled: {
      ...DEFAULT_CONFIG.parameterEnabled,
      temperature: true,
      seed: true,
    },
  }
  const profile: ChatControls = {
    fields: ['max_tokens'],
    sampling: 'none_only',
    default_effort: 'none',
    efforts: ['none', 'high'],
  }
  const automatic = resolveChatControls(config, profile)
  expect(automatic.config.historyTurns).toBe(0)
  expect(automatic.parameterInfo.map(({ name }) => name)).toEqual([
    'temperature',
    'top_p',
    'max_tokens',
    'reasoning_effort',
  ])
  const reasoning = resolveChatControls(
    { ...config, reasoning_effort: 'high' },
    profile
  )
  expect(reasoning.parameterInfo.map(({ name }) => name)).toEqual([
    'max_tokens',
    'reasoning_effort',
  ])
  expect(getChatParameterOverrides(reasoning.config)).toEqual({
    reasoning_effort: 'high',
    temperature: 0,
    seed: 21,
  })
  const unknown = resolveChatControls({ ...config, reasoning_effort: 'high' })
  expect(unknown.parameterInfo).toEqual([])
  expect(unknown.efforts).toEqual([])
  expect(getChatParameterOverrides(unknown.config)).toEqual({
    temperature: 0,
    seed: 21,
  })
})

it.each([
  ['temperature', 0],
  ['top_p', 0.375],
  ['frequency_penalty', -0.25],
  ['presence_penalty', 0],
  ['max_tokens', 1234],
  ['seed', 0],
] satisfies [keyof ParameterEnabled, number][])(
  'includes %s only while its own override is enabled, even without a capability profile',
  (key, value) => {
    const { result } = renderHook(() => usePlaygroundState())
    const overrides = () =>
      getChatParameterOverrides(
        resolveChatControls(result.current.config).config
      )
    act(() => result.current.updateConfig(key, value))
    expect(overrides()).toEqual({})
    act(() => result.current.updateParameterEnabled(key, true))
    expect(overrides()).toEqual({ [key]: value })
    expect(
      buildChatCompletionPayload([], result.current.config)
    ).toHaveProperty(key, value)
    act(() => result.current.updateParameterEnabled(key, false))
    expect(overrides()).toEqual({})
    expect(
      buildChatCompletionPayload([], result.current.config)
    ).not.toHaveProperty(key)
  }
)

it('omits invalid and fractional integer overrides instead of sending null or misleading defaults', () => {
  const invalid = {
    ...DEFAULT_CONFIG,
    temperature: Number.NaN,
    top_p: Number.POSITIVE_INFINITY,
    max_tokens: 1.5,
    presence_penalty: -2.1,
    frequency_penalty: 2.1,
    seed: 1.5,
    parameterEnabled: {
      temperature: true,
      top_p: true,
      max_tokens: true,
      frequency_penalty: true,
      presence_penalty: true,
      seed: true,
    },
  }
  expect(getChatParameterOverrides(invalid)).toEqual({})
  expect(getChatParameterOverrides({ ...invalid, seed: null })).toEqual({})
})

it('starts a normal workspace with fresh numeric values, ignoring both legacy switch formats', () => {
  useAuthStore.getState().auth.setUser({ id: 41, username: 'reader', role: 1 })
  localStorage.setItem(
    `${STORAGE_KEYS.CONFIG}:41`,
    JSON.stringify({
      version: 1,
      data: {
        ...DEFAULT_CONFIG,
        model: 'site-alias',
        temperature: 0.3,
        seed: 99,
        stream: false,
        parameterEnabled: {
          temperature: true,
          top_p: true,
          max_tokens: true,
          frequency_penalty: true,
          presence_penalty: true,
          seed: true,
        },
      },
    })
  )
  saveParameterEnabled({ temperature: true, frequency_penalty: true })
  const { result } = renderHook(() => usePlaygroundState())
  const body = () => buildChatCompletionPayload([], result.current.config)
  expect(body()).toEqual({
    model: 'site-alias',
    group: 'default',
    messages: [],
    stream: false,
  })
  act(() => result.current.updateParameterEnabled('temperature', true))
  act(() => result.current.updateParameterEnabled('seed', true))
  expect(body()).toMatchObject({ temperature: 0.7, seed: 0 })
  expect(loadConfig()).not.toHaveProperty('parameterEnabled')
  act(() => result.current.updateConfig('group', 'other-group'))
  expect(getChatParameterOverrides(result.current.config)).toEqual({})
})

it('sends only explicitly published overrides and never carries them to a different model or preset', () => {
  const scene = {
    id: 'editor',
    mode: 'chat',
    model: 'alias',
    title: 'Edit',
    prompt: 'Edit my draft.',
  }
  const [configured, plain] = creationPresetList.parse([
    {
      ...scene,
      parameters: { reasoning_effort: 'low', frequency_penalty: 0, seed: 0 },
    },
    { ...scene, id: 'plain' },
  ])
  const workbench = renderHook(() => usePlaygroundState(configured))
  const body = () =>
    buildChatCompletionPayload([], workbench.result.current.config)
  expect(body()).toEqual({
    model: 'alias',
    group: 'default',
    messages: [],
    stream: true,
    reasoning_effort: 'low',
    frequency_penalty: 0,
    seed: 0,
  })
  act(() => workbench.result.current.updateConfig('model', 'gpt-looking-alias'))
  expect(body()).toEqual({
    model: 'gpt-looking-alias',
    group: 'default',
    messages: [],
    stream: true,
  })
  workbench.unmount()
  const { result } = renderHook(() => usePlaygroundState(plain))
  expect(buildChatCompletionPayload([], result.current.config)).toEqual({
    model: 'alias',
    group: 'default',
    messages: [],
    stream: true,
  })
  expect(
    creationPresetList.safeParse([
      { ...scene, parameters: { reasoning_effort: 'made-up' } },
    ]).success
  ).toBe(false)
})

it('starts a new conversation with all numeric overrides reset but keeps the same model and reasoning effort', () => {
  const parameters = {
    reasoning_effort: 'high',
    temperature: 0.25,
    top_p: 0.75,
    frequency_penalty: 1,
    presence_penalty: -1,
    max_tokens: 256,
    seed: 42,
  } as const
  const { result } = renderHook(() =>
    usePlaygroundState(
      {
        id: 'custom-chat',
        mode: 'chat',
        title: 'Configured chat',
        model: 'chat-alias',
        prompt: 'Review a draft',
        parameters,
      },
      'team'
    )
  )
  act(() => {
    result.current.updateConfig('stream', false)
    result.current.updateMessages([
      {
        key: 'question',
        from: 'user',
        versions: [{ id: 'first', content: 'Previous question' }],
      },
    ])
  })
  expect(getChatParameterOverrides(result.current.config)).toEqual(parameters)

  act(() => result.current.clearMessages())
  expect(result.current.messages).toEqual([])
  expect(result.current.config).toEqual({
    ...DEFAULT_CONFIG,
    model: 'chat-alias',
    group: 'team',
    stream: false,
    reasoning_effort: 'high',
  })
  expect(getChatParameterOverrides(result.current.config)).toEqual({
    reasoning_effort: 'high',
  })
})

it.each([true, false])(
  'previews the same retained turns, system messages and typed draft as sending (stream=%s)',
  (stream) => {
    const message = (from: Message['from'], text: string): Message => ({
      key: text,
      from,
      versions: [{ id: text, content: text }],
    })
    const history = [
      message('system', 'System instruction'),
      message('user', 'First turn'),
      message('assistant', 'First answer'),
    ]
    const config = {
      ...DEFAULT_CONFIG,
      stream,
      model: 'alias',
      historyTurns: 1 as const,
    }
    const preview = buildChatCompletionPayload(
      history,
      config,
      '  Next question'
    )
    const posted = buildChatCompletionPayload(
      [
        ...history,
        message('user', '  Next question'),
        message('assistant', ''),
      ],
      config
    )
    expect(preview).toEqual(posted)
    expect(preview).toEqual({
      model: 'alias',
      group: 'default',
      stream,
      messages: [
        { role: 'system', content: 'System instruction' },
        { role: 'user', content: '  Next question' },
      ],
    })
    expect(history).toHaveLength(3)
  }
)

it('emits web_search_options only when declared and enabled, excludes it from presets/storage, and resets on model change', () => {
  const { result } = renderHook(() => usePlaygroundState())
  act(() => result.current.updateConfig('model', 'search-model'))
  act(() => result.current.updateConfig('web_search', true))

  const unsupported = resolveChatControls(result.current.config, {
    web_search: false,
  })
  expect(unsupported.webSearchSupported).toBe(false)
  expect(unsupported.config.web_search).toBe(false)
  expect(buildChatCompletionPayload([], unsupported.config)).not.toHaveProperty(
    'web_search_options'
  )

  const supported = resolveChatControls(result.current.config, {
    web_search: true,
  })
  expect(supported.webSearchSupported).toBe(true)
  expect(supported.config.web_search).toBe(true)
  expect(supported.parameterInfo).toContainEqual({
    name: 'web_search_options',
    type: 'object',
    descriptionKey: 'Web search',
  })
  expect(buildChatCompletionPayload([], supported.config)).toMatchObject({
    web_search_options: { search_context_size: 'medium' },
  })
  expect(getChatParameterOverrides(supported.config)).not.toHaveProperty(
    'web_search_options'
  )
  expect(loadConfig()).not.toHaveProperty('web_search')

  act(() => result.current.updateConfig('model', 'other-model'))
  expect(result.current.config.web_search).toBe(false)
})
