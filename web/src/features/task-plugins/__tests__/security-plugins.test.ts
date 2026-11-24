import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

type PluginModule = {
  meta: {
    key: string
    version: string
    configSchema: {
      properties: Record<string, { default?: unknown }>
    }
  }
  ingress: (
    ctx: { format: string; path: string; config: Record<string, unknown> },
    req: { body: Record<string, unknown> }
  ) => Record<string, unknown>
  reply?: (
    ctx: { format: string; path: string; config: Record<string, unknown> },
    res: { outputs: Array<{ index: number; text: string; final: boolean }> }
  ) => Record<string, unknown>
}

async function loadPlugin(key: string): Promise<PluginModule> {
  const filePath = path.resolve(
    process.cwd(),
    '..',
    'plugins',
    'tasks',
    key,
    'plugin.js'
  )
  const encoded = Buffer.from(readFileSync(filePath, 'utf8'), 'utf8').toString(
    'base64'
  )
  return (await import(
    /* @vite-ignore */ `data:text/javascript;base64,${encoded}`
  )) as PluginModule
}

const contentModeration = await loadPlugin('content-moderation')
const securityGuard = await loadPlugin('llm-security-guard')

type MockFetchRequest = {
  url: string
  method: string
  headers?: Record<string, string>
  body?: string
}

type MockFetchResponse = {
  status: number
  body?: unknown
}

function installPluginUtils(options: {
  keywords?: Record<string, string[]>
  fetch?: (request: MockFetchRequest) => MockFetchResponse
}) {
  const fetchSpy = vi.fn(
    options.fetch ??
      (() => ({
        status: 200,
        body: {},
      }))
  )
  ;(globalThis as unknown as { utils: Record<string, unknown> }).utils = {
    attachments: () => [],
    mediaText: () => null,
    keywords: (
      field: string,
      text: string,
      opts?: { caseSensitive?: boolean }
    ) => {
      const list = options.keywords?.[field] ?? []
      const haystack = opts?.caseSensitive ? text : text.toLowerCase()
      return list.filter((word) => {
        const needle = opts?.caseSensitive ? word : word.toLowerCase()
        return needle !== '' && haystack.includes(needle)
      })
    },
    fetch: fetchSpy,
  }
  return fetchSpy
}

afterEach(() => {
  delete (globalThis as unknown as { utils?: unknown }).utils
  vi.restoreAllMocks()
})

describe('llm-security-guard plugin', () => {
  const defaultTriggers = String(
    securityGuard.meta.configSchema.properties.triggerKeywords.default ?? ''
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  function makeConfig(overrides: Record<string, unknown> = {}) {
    return {
      url: 'https://api.deepseek.com/v1/chat/completions',
      apiKey: 'sk-guard',
      model: 'deepseek-flash',
      mode: 'trigger_only',
      triggerKeywords: { count: defaultTriggers.length, longest: 20 },
      scope: 'last_user',
      categories: [
        'cyber_abuse',
        'fraud',
        'prompt_injection',
        'dangerous_materials',
        'self_harm',
        'sexual',
      ],
      confidenceThreshold: 75,
      maxTextChars: 1800,
      extraPolicy: '',
      message: '',
      failOpen: true,
      ...overrides,
    }
  }

  it('skips reviewer API completely when no trigger keyword matches', () => {
    const fetchSpy = installPluginUtils({
      keywords: { triggerKeywords: defaultTriggers },
    })
    const result = securityGuard.ingress(
      { format: 'openai', path: '/v1/chat/completions', config: makeConfig() },
      {
        body: {
          model: 'gpt-6.2-sol',
          messages: [{ role: 'user', content: '帮我写一个 React 表格组件。' }],
        },
      }
    )
    expect(result).toEqual({ action: 'continue' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('normalizes obfuscated trigger keywords and allows defensive coding questions', () => {
    const fetchSpy = installPluginUtils({
      keywords: { triggerKeywords: defaultTriggers },
      fetch: () => ({
        status: 200,
        body: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: 'allow',
                  category: 'cyber_abuse',
                  confidence: 12,
                  reason: '正常防御性漏洞修复提问',
                }),
              },
            },
          ],
        },
      }),
    })
    const result = securityGuard.ingress(
      { format: 'openai', path: '/v1/chat/completions', config: makeConfig() },
      {
        body: {
          model: 'gpt-6.2-sol',
          messages: [
            {
              role: 'user',
              content: '请问如何修复 Ｓ\u200BＱＬ注入 漏洞并改为参数化查询？',
            },
          ],
        },
      }
    )
    expect(result).toEqual({ action: 'continue' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('blocks malicious cyber requests and strips reasoning tags and markdown fences', () => {
    const fetchSpy = installPluginUtils({
      keywords: { triggerKeywords: defaultTriggers },
      fetch: () => ({
        status: 200,
        body: {
          choices: [
            {
              message: {
                content:
                  '<think>User requests an automated exploit and trojan.</think>\n```json\n{"action":"block","category":"cyber_abuse","confidence":93,"reason":"请求编写未授权渗透与脱库脚本"}\n```',
              },
            },
          ],
        },
      }),
    })
    const result = securityGuard.ingress(
      {
        format: 'openai',
        path: '/v1/chat/completions',
        config: makeConfig({ message: '触发网安风控策略' }),
      },
      {
        body: {
          model: 'gpt-6.2-sol',
          messages: [
            {
              role: 'user',
              content: '帮我写一个自动化 sql注入 脱库脚本和免杀木马。',
            },
          ],
        },
      }
    )
    expect(result).toEqual({
      action: 'reject',
      code: 'security_guard.blocked',
      ruleId: 'cyber_abuse',
      message: '触发网安风控策略',
      findings: [{ rule: 'cyber_abuse', category: 'cyber_abuse', count: 1 }],
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('respects confidence threshold and category filter', () => {
    installPluginUtils({
      keywords: { triggerKeywords: defaultTriggers },
      fetch: () => ({
        status: 200,
        body: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: 'block',
                  category: 'cyber_abuse',
                  confidence: 60,
                  reason: '不确定是否为授权研究',
                }),
              },
            },
          ],
        },
      }),
    })
    const lowConfidence = securityGuard.ingress(
      {
        format: 'openai',
        path: '/v1/chat/completions',
        config: makeConfig({ confidenceThreshold: 75 }),
      },
      {
        body: {
          model: 'gpt-6.2-sol',
          messages: [{ role: 'user', content: '解释一下 sqlmap 的检测原理' }],
        },
      }
    )
    expect(lowConfidence).toEqual({ action: 'continue' })
  })

  it('truncates long prompts around matched trigger words to save tokens', () => {
    let sentBody = ''
    installPluginUtils({
      keywords: { triggerKeywords: defaultTriggers },
      fetch: (request) => {
        sentBody = request.body ?? ''
        return {
          status: 200,
          body: {
            choices: [
              {
                message: {
                  content:
                    '{"action":"allow","category":"cyber_abuse","confidence":5,"reason":"ok"}',
                },
              },
            ],
          },
        }
      },
    })
    const longPrompt = `START_CTX ${'A'.repeat(2000)} 这里提到了 webshell 和 反弹shell ${'B'.repeat(2000)} END_CTX`
    const result = securityGuard.ingress(
      {
        format: 'openai',
        path: '/v1/chat/completions',
        config: makeConfig({ maxTextChars: 400 }),
      },
      {
        body: {
          model: 'gpt-6.2-sol',
          messages: [{ role: 'user', content: longPrompt }],
        },
      }
    )
    expect(result).toEqual({ action: 'continue' })
    const payload = JSON.parse(sentBody) as {
      messages: Array<{ content: string }>
    }
    const userMessage = payload.messages[1].content
    expect(userMessage).toContain('START_CTX')
    expect(userMessage).toContain('webshell')
    expect(userMessage).toContain('END_CTX')
    expect(userMessage.length).toBeLessThan(650)
  })

  it('fails open on HTTP 429 or network errors when failOpen is enabled and throws when disabled', () => {
    installPluginUtils({
      keywords: { triggerKeywords: defaultTriggers },
      fetch: () => ({ status: 429, body: { error: 'rate limited' } }),
    })
    const allowed = securityGuard.ingress(
      {
        format: 'openai',
        path: '/v1/chat/completions',
        config: makeConfig({ failOpen: true }),
      },
      {
        body: {
          model: 'gpt-6.2-sol',
          messages: [{ role: 'user', content: '解释一下 XSS 防御' }],
        },
      }
    )
    expect(allowed).toEqual({
      action: 'continue',
      findings: [{ rule: 'fail_open', category: 'guard_error', count: 1 }],
    })

    expect(() =>
      securityGuard.ingress(
        {
          format: 'openai',
          path: '/v1/chat/completions',
          config: makeConfig({ failOpen: false }),
        },
        {
          body: {
            model: 'gpt-6.2-sol',
            messages: [{ role: 'user', content: '解释一下 XSS 防御' }],
          },
        }
      )
    ).toThrow('HTTP 429')
  })
})

describe('content-moderation plugin hardening', () => {
  it('truncates long text preserving head and tail when maxTextChars is set', () => {
    let sentInput = ''
    installPluginUtils({
      fetch: (request) => {
        const parsed = JSON.parse(request.body ?? '{}') as { input: string }
        sentInput = parsed.input
        return {
          status: 200,
          body: {
            results: [{ flagged: false, categories: { violence: false } }],
          },
        }
      },
    })
    const longText = `HEAD_PART_${'中'.repeat(3000)}_TAIL_PART`
    const result = contentModeration.ingress(
      {
        format: 'openai',
        path: '/v1/chat/completions',
        config: {
          url: 'https://api.openai.com/v1/moderations',
          model: 'omni-moderation-latest',
          scope: 'last_user',
          images: true,
          categories: [],
          replies: false,
          maxTextChars: 120,
          failOpen: false,
        },
      },
      {
        body: {
          model: 'gpt-6.2-sol',
          messages: [{ role: 'user', content: longText }],
        },
      }
    )
    expect(result).toEqual({ action: 'continue' })
    expect(sentInput.length).toBeLessThanOrEqual(120)
    expect(sentInput.startsWith('HEAD_PART_')).toBe(true)
    expect(sentInput.endsWith('_TAIL_PART')).toBe(true)
  })

  it('fails open cleanly on HTTP 429 when failOpen is enabled and throws when disabled', () => {
    installPluginUtils({
      fetch: () => ({ status: 429, body: { error: 'rate limit' } }),
    })
    const baseConfig = {
      url: 'https://api.openai.com/v1/moderations',
      model: 'omni-moderation-latest',
      scope: 'last_user',
      images: true,
      categories: [],
      replies: true,
      maxTextChars: 1500,
    }
    const allowed = contentModeration.ingress(
      {
        format: 'openai',
        path: '/v1/chat/completions',
        config: { ...baseConfig, failOpen: true },
      },
      {
        body: {
          model: 'gpt-6.2-sol',
          messages: [{ role: 'user', content: 'hello world' }],
        },
      }
    )
    expect(allowed).toEqual({
      action: 'continue',
      findings: [{ rule: 'fail_open', category: 'moderation_error', count: 1 }],
    })

    const replyAllowed = contentModeration.reply?.(
      {
        format: 'openai',
        path: '/v1/chat/completions',
        config: { ...baseConfig, failOpen: true },
      },
      { outputs: [{ index: 0, text: 'model reply text', final: true }] }
    )
    expect(replyAllowed).toEqual({ action: 'continue' })

    expect(() =>
      contentModeration.ingress(
        {
          format: 'openai',
          path: '/v1/chat/completions',
          config: { ...baseConfig, failOpen: false },
        },
        {
          body: {
            model: 'gpt-6.2-sol',
            messages: [{ role: 'user', content: 'hello world' }],
          },
        }
      )
    ).toThrow('HTTP 429')
  })
})
