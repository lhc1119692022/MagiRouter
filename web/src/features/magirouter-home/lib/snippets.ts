export type SnippetLanguage = 'curl' | 'python' | 'node'
export type ProtocolId = 'responses' | 'chat' | 'anthropic' | 'gemini'

export const SNIPPET_LANGUAGES: { value: SnippetLanguage; label: string }[] = [
  { value: 'curl', label: 'cURL' },
  { value: 'python', label: 'Python' },
  { value: 'node', label: 'Node.js' },
]

export const PROTOCOL_OPTIONS: {
  value: ProtocolId
  label: string
  endpoint: string
}[] = [
  {
    value: 'responses',
    label: 'OpenAI Responses',
    endpoint: 'POST /v1/responses',
  },
  {
    value: 'anthropic',
    label: 'Anthropic Messages',
    endpoint: 'POST /v1/messages',
  },
  {
    value: 'gemini',
    label: 'Gemini',
    endpoint: 'POST /v1beta/models:generateContent',
  },
  {
    value: 'chat',
    label: 'OpenAI Chat Completions',
    endpoint: 'POST /v1/chat/completions',
  },
]

export type SampleModels = {
  openai?: string
  anthropic?: string
  gemini?: string
}

export function buildSnippet(
  language: SnippetLanguage,
  baseUrl: string,
  model: string | SampleModels,
  protocol: ProtocolId = 'responses'
): string {
  const root = baseUrl.replace(/\/+$/, '')
  const openaiModel =
    typeof model === 'string'
      ? model || 'gpt-6.2-sol'
      : model.openai || 'gpt-6.2-sol'
  const anthropicModel =
    typeof model === 'object' && model.anthropic
      ? model.anthropic
      : 'claude-opus-5.5'
  const geminiModel =
    typeof model === 'object' && model.gemini
      ? model.gemini
      : 'gemini-4-hydrogen'

  if (protocol === 'anthropic') {
    if (language === 'python') {
      return [
        'import os, anthropic',
        '',
        'client = anthropic.Anthropic(',
        `    base_url="${root}",`,
        '    api_key=os.environ["MAGIROUTER_API_KEY"],',
        ')',
        'msg = client.messages.create(',
        `    model="${anthropicModel}",`,
        '    max_tokens=1024,',
        '    messages=[{"role": "user", "content": "Hello"}],',
        ')',
        'print(msg.content[0].text)',
      ].join('\n')
    }
    if (language === 'node') {
      return [
        "import Anthropic from '@anthropic-ai/sdk'",
        '',
        'const client = new Anthropic({',
        `  baseURL: '${root}',`,
        '  apiKey: process.env.MAGIROUTER_API_KEY,',
        '})',
        'const msg = await client.messages.create({',
        `  model: '${anthropicModel}',`,
        '  max_tokens: 1024,',
        "  messages: [{ role: 'user', content: 'Hello' }],",
        '})',
        'console.log(msg.content)',
      ].join('\n')
    }
    return [
      `curl ${root}/v1/messages \\`,
      '  -H "x-api-key: $MAGIROUTER_API_KEY" \\',
      '  -H "anthropic-version: 2023-06-01" \\',
      '  -H "Content-Type: application/json" \\',
      "  -d '{",
      `    "model": "${anthropicModel}",`,
      '    "max_tokens": 1024,',
      '    "messages": [{"role": "user", "content": "Hello"}]',
      "  }'",
    ].join('\n')
  }

  if (protocol === 'gemini') {
    if (language === 'python') {
      return [
        'import os',
        'from google import genai',
        '',
        'client = genai.Client(',
        '    api_key=os.environ["MAGIROUTER_API_KEY"],',
        `    http_options={"base_url": "${root}"},`,
        ')',
        'res = client.models.generate_content(',
        `    model="${geminiModel}",`,
        '    contents="Hello",',
        ')',
        'print(res.text)',
      ].join('\n')
    }
    if (language === 'node') {
      return [
        `const res = await fetch('${root}/v1beta/models/${geminiModel}:generateContent', {`,
        "  method: 'POST',",
        '  headers: {',
        "    'x-goog-api-key': process.env.MAGIROUTER_API_KEY!,",
        "    'Content-Type': 'application/json',",
        '  },',
        "  body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] }),",
        '})',
        'console.log(await res.json())',
      ].join('\n')
    }
    return [
      `curl "${root}/v1beta/models/${geminiModel}:generateContent" \\`,
      '  -H "x-goog-api-key: $MAGIROUTER_API_KEY" \\',
      '  -H "Content-Type: application/json" \\',
      "  -d '{",
      '    "contents": [{"parts": [{"text": "Hello"}]}]',
      "  }'",
    ].join('\n')
  }

  if (protocol === 'responses') {
    if (language === 'python') {
      return [
        'import os',
        'from openai import OpenAI',
        '',
        'client = OpenAI(',
        `    base_url="${root}/v1",`,
        '    api_key=os.environ["MAGIROUTER_API_KEY"],',
        ')',
        '',
        'reply = client.responses.create(',
        `    model="${openaiModel}",`,
        '    input="Hello",',
        ')',
        'print(reply.output_text)',
      ].join('\n')
    }
    if (language === 'node') {
      return [
        "import OpenAI from 'openai'",
        '',
        'const client = new OpenAI({',
        `  baseURL: '${root}/v1',`,
        '  apiKey: process.env.MAGIROUTER_API_KEY,',
        '})',
        '',
        'const reply = await client.responses.create({',
        `  model: '${openaiModel}',`,
        "  input: 'Hello',",
        '})',
        'console.log(reply.output_text)',
      ].join('\n')
    }
    return [
      `curl ${root}/v1/responses \\`,
      '  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\',
      '  -H "Content-Type: application/json" \\',
      "  -d '{",
      `    "model": "${openaiModel}",`,
      '    "input": "Hello"',
      "  }'",
    ].join('\n')
  }

  if (language === 'python') {
    return [
      'import os',
      'from openai import OpenAI',
      '',
      'client = OpenAI(',
      `    base_url="${root}/v1",`,
      '    api_key=os.environ["MAGIROUTER_API_KEY"],',
      ')',
      '',
      'reply = client.chat.completions.create(',
      `    model="${openaiModel}",`,
      '    messages=[{"role": "user", "content": "Hello"}],',
      ')',
      'print(reply.choices[0].message.content)',
    ].join('\n')
  }
  if (language === 'node') {
    return [
      "import OpenAI from 'openai'",
      '',
      'const client = new OpenAI({',
      `  baseURL: '${root}/v1',`,
      '  apiKey: process.env.MAGIROUTER_API_KEY,',
      '})',
      '',
      'const reply = await client.chat.completions.create({',
      `  model: '${openaiModel}',`,
      "  messages: [{ role: 'user', content: 'Hello' }],",
      '})',
      'console.log(reply.choices[0].message.content)',
    ].join('\n')
  }
  return [
    `curl ${root}/v1/chat/completions \\`,
    '  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    "  -d '{",
    `    "model": "${openaiModel}",`,
    '    "messages": [{"role": "user", "content": "Hello"}]',
    "  }'",
  ].join('\n')
}

export type ToolConfigItem = {
  eyebrow: string
  title: string
  url: string
  desc: string
  protoNote: string
  code: string
}

export function buildToolConfigs(
  baseUrl: string,
  sampleModels: SampleModels,
  defaultGroup: string
): Record<'magpie' | 'cc-switch', ToolConfigItem> {
  const root = baseUrl.replace(/\/+$/, '')
  const openaiModel = sampleModels.openai || 'gpt-6.2-sol'
  const anthropicModel = sampleModels.anthropic || 'claude-opus-5.5'
  const geminiModel = sampleModels.gemini || 'gemini-4-hydrogen'

  return {
    'cc-switch': {
      eyebrow: 'CC SWITCH · 一键配置切换器',
      title: 'CC Switch 接入 MagiRouter',
      url: 'https://ccswitch.io',
      desc: '在 CC Switch 中按客户端协议分别添加供应商：Codex 使用 OpenAI Responses（/v1/responses），Claude Code 使用 Anthropic Messages（/v1/messages），Gemini CLI 使用 Gemini（/v1beta）。',
      protoNote: 'CC Switch 推荐供应商配置（按协议优先级）',
      code: JSON.stringify(
        {
          provider: 'MagiRouter',
          codex: {
            protocol: 'openai-responses',
            base_url: `${root}/v1`,
            api_key: 'sk-magi-你的密钥',
            model: openaiModel,
          },
          claude: {
            protocol: 'anthropic-messages',
            base_url: root,
            api_key: 'sk-magi-你的密钥',
            model: anthropicModel,
          },
          gemini: {
            protocol: 'gemini',
            base_url: root,
            api_key: 'sk-magi-你的密钥',
            model: geminiModel,
          },
        },
        null,
        2
      ),
    },
    magpie: {
      eyebrow: 'MAGPIE · 桌面网关与桥接工具',
      title: 'Magpie 接入 MagiRouter',
      url: 'https://usemagpie.ai',
      desc: '在 Magpie 桌面端或网关配置中添加 MagiRouter 上游路由，优先走 OpenAI Responses 端点，并按模型自动分流至 Anthropic Messages 或 Gemini 协议。',
      protoNote: 'Magpie 上游路由配置（OpenAI Responses）',
      code: JSON.stringify(
        {
          upstream: 'magirouter',
          priority: [
            'openai-responses',
            'anthropic-messages',
            'gemini',
            'openai-chat-completions',
          ],
          endpoints: {
            openai_responses: `${root}/v1/responses`,
            anthropic_messages: `${root}/v1/messages`,
            gemini: `${root}/v1beta`,
          },
          api_key: 'sk-magi-你的密钥',
          ...(defaultGroup ? { default_group: defaultGroup } : {}),
        },
        null,
        2
      ),
    },
  }
}

export function resolveBaseUrl(serverAddress: unknown): string {
  const configured =
    typeof serverAddress === 'string' ? serverAddress.trim() : ''
  const origin = configured || window.location.origin
  return origin.replace(/\/+$/, '').replace(/\/v1$/i, '')
}
