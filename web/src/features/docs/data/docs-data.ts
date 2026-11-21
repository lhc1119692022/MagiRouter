import type { PricingModel } from '@/features/pricing/types'

export type DocsGroupName =
  | '快速开始'
  | '接口协议'
  | 'API 概览'
  | '任务环节'
  | '资源'

export type DocsModality = 'text' | 'image' | 'video' | 'audio'

export interface DocsEndpoint {
  method: 'POST' | 'GET' | 'DELETE'
  path: string
}

export interface DocsTable {
  headers: string[]
  rows: string[][]
}

export interface DocsSection {
  id: string
  title: string
  paragraphs: string[]
  table?: DocsTable
}

export interface DocsSnippets {
  curl: string
  python: string
  node: string
  json: string
}

export interface DocsArticle {
  id: string
  group: DocsGroupName
  cap?: DocsModality
  familyName?: string
  title: string
  summary: string
  urlLabel: string
  urlValue: string
  endpoints: DocsEndpoint[]
  sections: DocsSection[]
  snippets: DocsSnippets
  responseTitle: string
  responseJson: string
}

export interface DocsModelFamily {
  name: string
  cap: DocsModality
  vendor: string
  models: string[]
}

export const DOCS_GROUP_ORDER: DocsGroupName[] = [
  '快速开始',
  '接口协议',
  'API 概览',
  '任务环节',
  '资源',
]

export const DOCS_MODALITY_ORDER: DocsModality[] = [
  'text',
  'image',
  'video',
  'audio',
]

export const DOCS_MODALITY_TITLES: Record<DocsModality, string> = {
  text: '文本推理 API',
  image: '图像生成 API',
  video: '视频生成 API',
  audio: '语音音频 API',
}

/**
 * Grouping rules for the live model catalog.
 *
 * The docs center must never invent models: every family and every model
 * listed in the sidebar comes from `/api/pricing`. These rules only decide
 * how a live model is labelled and which modality section it belongs to.
 * Order matters — more specific prefixes are evaluated first.
 */
const DOCS_FAMILY_RULES: Array<{
  test: RegExp
  name: string
  vendor: string
  cap?: DocsModality
}> = [
  {
    test: /^(gpt-image|dall-e)/i,
    name: 'GPT Image 系列',
    vendor: 'OpenAI',
    cap: 'image',
  },
  { test: /^(sora)/i, name: 'Sora 系列', vendor: 'OpenAI', cap: 'video' },
  {
    test: /^(gpt|chatgpt|o[1-9])/i,
    name: 'GPT 系列',
    vendor: 'OpenAI',
    cap: 'text',
  },
  { test: /^claude/i, name: 'Claude 系列', vendor: 'Anthropic', cap: 'text' },
  {
    test: /^gemini.*(image|banana)|^nano-banana/i,
    name: 'Nano Banana 系列',
    vendor: 'Google',
    cap: 'image',
  },
  { test: /^gemini/i, name: 'Gemini 系列', vendor: 'Google', cap: 'text' },
  {
    test: /^deepseek/i,
    name: 'DeepSeek 系列',
    vendor: 'DeepSeek',
    cap: 'text',
  },
  { test: /^(kimi|moonshot)/i, name: 'Kimi 系列', vendor: 'Moonshot', cap: 'text' },
  { test: /^(qwen|qwq)/i, name: 'Qwen 系列', vendor: 'Alibaba', cap: 'text' },
  { test: /^grok/i, name: 'Grok 系列', vendor: 'xAI', cap: 'text' },
  { test: /^(glm|chatglm)/i, name: 'GLM 系列', vendor: 'Zhipu', cap: 'text' },
  {
    test: /^seedream/i,
    name: 'Seedream 系列',
    vendor: 'ByteDance',
    cap: 'image',
  },
  {
    test: /^seedance/i,
    name: 'Seedance 系列',
    vendor: 'ByteDance',
    cap: 'video',
  },
  { test: /^kling/i, name: 'Kling 系列', vendor: 'Kuaishou', cap: 'video' },
  { test: /^veo/i, name: 'Veo 系列', vendor: 'Google', cap: 'video' },
  {
    test: /^(minimax|hailuo)/i,
    name: 'MiniMax 系列',
    vendor: 'MiniMax',
    cap: 'video',
  },
  {
    test: /^flux/i,
    name: 'FLUX 系列',
    vendor: 'Black Forest Labs',
    cap: 'image',
  },
  {
    test: /(tts|whisper|audio|speech)/i,
    name: 'OpenAI Audio 系列',
    vendor: 'OpenAI',
    cap: 'audio',
  },
]

export function inferDocsModality(model: {
  model_name: string
  tags?: string
  supported_endpoint_types?: string[]
}): DocsModality {
  const lower = `${model.model_name} ${model.tags ?? ''}`.toLowerCase()
  if (
    lower.includes('video') ||
    lower.includes('seedance') ||
    lower.includes('kling') ||
    lower.includes('veo') ||
    lower.includes('sora') ||
    lower.includes('hailuo')
  ) {
    return 'video'
  }
  if (
    lower.includes('image') ||
    lower.includes('flux') ||
    lower.includes('seedream') ||
    lower.includes('banana') ||
    lower.includes('midjourney') ||
    lower.includes('dall')
  ) {
    return 'image'
  }
  if (
    lower.includes('tts') ||
    lower.includes('whisper') ||
    lower.includes('audio') ||
    lower.includes('speech')
  ) {
    return 'audio'
  }
  const endpoints = (model.supported_endpoint_types ?? []).join(' ').toLowerCase()
  if (endpoints.includes('image')) return 'image'
  if (endpoints.includes('video')) return 'video'
  if (endpoints.includes('audio') || endpoints.includes('speech')) {
    return 'audio'
  }
  return 'text'
}

/**
 * Build the docs sidebar model tree from the live catalog.
 *
 * Models that are not in the catalog never appear, and catalog models that
 * were added after this file was written still appear under their vendor.
 */
export function buildDocsModelFamilies(
  models: PricingModel[]
): DocsModelFamily[] {
  const families = new Map<string, DocsModelFamily>()
  const order: string[] = []

  for (const model of models) {
    const rule = DOCS_FAMILY_RULES.find((entry) => entry.test.test(model.model_name))
    const name = rule?.name ?? `${model.vendor_name || '其他'} 系列`
    const vendor = rule?.vendor ?? model.vendor_name ?? 'MagiRouter'
    const cap = rule?.cap ?? inferDocsModality(model)
    const key = `${cap}:${name}`

    if (!families.has(key)) {
      families.set(key, { name, cap, vendor, models: [] })
      order.push(key)
    }
    families.get(key)?.models.push(model.model_name)
  }

  for (const family of families.values()) {
    family.models.sort((left, right) =>
      right.localeCompare(left, 'en', { numeric: true })
    )
  }

  return order
    .map((key) => families.get(key))
    .filter((family): family is DocsModelFamily => Boolean(family))
    .sort(
      (left, right) =>
        DOCS_MODALITY_ORDER.indexOf(left.cap) -
        DOCS_MODALITY_ORDER.indexOf(right.cap)
    )
}

export const OFFICIAL_DOMAINS = [
  {
    label: '主站直连',
    host: 'https://magirouter.com',
    scene: '默认主力入口，全协议兼容',
  },
  {
    label: '国内优化',
    host: 'https://cn.magirouter.com',
    scene: '国内网络与桌面客户端低延迟直连',
  },
  {
    label: '全球加速',
    host: 'https://cf.magirouter.com',
    scene: '海外服务器与云端 Agent 边缘接入',
  },
  {
    label: '美国备用',
    host: 'https://us.magirouter.com',
    scene: '高并发容灾与美西节点直连',
  },
] as const

export function buildStaticDocs(baseUrl: string): DocsArticle[] {
  const root = baseUrl.replace(/\/+$/, '')
  const v1 = `${root}/v1`

  return [
    {
      id: 'quickstart',
      group: '快速开始',
      title: '快速开始',
      summary:
        '了解四条官方接入域名、鉴权请求头与四大原生协议，5 分钟完成首条生产级 API 调用。',
      urlLabel: 'Base URL',
      urlValue: v1,
      endpoints: [
        { method: 'POST', path: '/v1/responses' },
        { method: 'POST', path: '/v1/chat/completions' },
        { method: 'POST', path: '/v1/messages' },
        { method: 'POST', path: '/v1beta/models/{model}:generateContent' },
      ],
      sections: [
        {
          id: 'qs-endpoint',
          title: '1. 官方入口域名与鉴权头',
          paragraphs: [
            '四条官方域名共用同一套账户、密钥、余额与计费体系。在任意 SDK、CLI 或 Agent 工具中将 Base URL 替换为以下入口并填入控制台签发的 sk-... 密钥即可直接调用。',
          ],
          table: {
            headers: ['入口 / 鉴权方式', '地址或请求头格式', '适用场景'],
            rows: [
              ['主站直连', 'https://magirouter.com/v1', '默认主力入口，全协议兼容'],
              ['国内优化', 'https://cn.magirouter.com/v1', '国内网络与桌面客户端低延迟直连'],
              ['全球加速', 'https://cf.magirouter.com/v1', '海外服务器与云端 Agent 边缘接入'],
              ['美国备用', 'https://us.magirouter.com/v1', '高并发容灾与美西节点直连'],
              [
                '鉴权请求头',
                'Authorization: Bearer sk-... / x-api-key / x-goog-api-key',
                'OpenAI、Anthropic 与 Gemini 原生客户端均免改代码支持',
              ],
            ],
          },
        },
        {
          id: 'qs-protocol',
          title: '2. 按任务选择协议端点',
          paragraphs: [
            '新项目推荐优先使用 OpenAI Responses (/v1/responses) 或 Chat Completions (/v1/chat/completions)；Claude Code 与 Anthropic SDK 直接指向 /v1/messages；Gemini 多模态工作流可直连 /v1beta 原生路径。',
          ],
        },
        {
          id: 'qs-errors',
          title: '3. 高可用重试与失败免扣',
          paragraphs: [
            '当上游返回 429 限流或 502/503 抖动时，网关会自动在同路由分组内故障转移到健康渠道。最终未能成功返回的请求不会扣减账户余额。',
          ],
        },
      ],
      snippets: {
        curl: `curl ${v1}/chat/completions \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "gpt-5.6",\n    "messages": [{"role": "user", "content": "用一句话介绍 MagiRouter"}]\n  }'`,
        python: `import os\nfrom openai import OpenAI\n\nclient = OpenAI(\n    base_url="${v1}",\n    api_key=os.environ["MAGIROUTER_API_KEY"],\n)\n\nres = client.chat.completions.create(\n    model="gpt-5.6",\n    messages=[{"role": "user", "content": "用一句话介绍 MagiRouter"}],\n)\nprint(res.choices[0].message.content)`,
        node: `import OpenAI from 'openai'\n\nconst client = new OpenAI({\n  baseURL: '${v1}',\n  apiKey: process.env.MAGIROUTER_API_KEY,\n})\n\nconst res = await client.chat.completions.create({\n  model: 'gpt-5.6',\n  messages: [{ role: 'user', content: '用一句话介绍 MagiRouter' }],\n})\nconsole.log(res.choices[0].message.content)`,
        json: `{\n  "model": "gpt-5.6",\n  "messages": [\n    { "role": "user", "content": "用一句话介绍 MagiRouter" }\n  ],\n  "stream": false\n}`,
      },
      responseTitle: 'Response · 200 OK',
      responseJson: `{\n  "id": "chatcmpl-mr01",\n  "object": "chat.completion",\n  "model": "gpt-5.6",\n  "choices": [\n    {\n      "index": 0,\n      "message": {\n        "role": "assistant",\n        "content": "MagiRouter 是统一多协议 AI 模型网关，一个密钥即可按需调度全球主流模型。"\n      },\n      "finish_reason": "stop"\n    }\n  ],\n  "usage": { "prompt_tokens": 18, "completion_tokens": 26, "total_tokens": 44 }\n}`,
    },
    {
      id: 'overview',
      group: '快速开始',
      title: '基础概览',
      summary:
        '一页读懂 MagiRouter 的四大模态能力、同步/异步调用范式、路由分组与 1:1 透明计费体系。',
      urlLabel: 'API Root',
      urlValue: root,
      endpoints: [
        { method: 'GET', path: '/v1/models' },
        { method: 'POST', path: '/v1/chat/completions' },
        { method: 'POST', path: '/v1/images/generations' },
        { method: 'POST', path: '/v1/videos' },
      ],
      sections: [
        {
          id: 'mt-matrix',
          title: '1. 四大核心能力与计费模式',
          paragraphs: [
            '平台原生聚合文本推理、图像生成、视频生成与语音音频四大模态，所有费用按真实用量与路由分组倍率透明结算，可在模型广场实时查询每个模型的最新单价。',
          ],
          table: {
            headers: ['模态分类', '典型端点', '主流计费方式', '返回形式'],
            rows: [
              ['文本推理', '/v1/responses · /v1/chat/completions · /v1/messages', '按百万输入/输出 Token', '同步 JSON / SSE 流式'],
              ['图像生成', '/v1/images/generations · /v1/images/edits', '按张或分辨率分档', '同步返回 URL / Base64'],
              ['视频生成', '/v1/videos · 任务端点', '按次或按秒计费', '异步任务提交 + 状态轮询'],
              ['语音音频', '/v1/audio/speech · /v1/audio/transcriptions', '按字符 / 分钟计费', '音频流或转写文本'],
            ],
          },
        },
        {
          id: 'mt-diff',
          title: '2. 同步流式与异步任务差异',
          paragraphs: [
            '文本与语音合成适合开启 stream: true 获得最低首字延迟（TTFT）；视频及批量离线任务建议采用异步任务提交并通过任务日志或轮询端点获取最终产物 URL。',
          ],
        },
      ],
      snippets: {
        curl: `curl ${v1}/models \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY"`,
        python: `import os\nfrom openai import OpenAI\n\nclient = OpenAI(base_url="${v1}", api_key=os.environ["MAGIROUTER_API_KEY"])\nmodels = client.models.list()\nprint([m.id for m in models.data[:10]])`,
        node: `import OpenAI from 'openai'\n\nconst client = new OpenAI({ baseURL: '${v1}', apiKey: process.env.MAGIROUTER_API_KEY })\nconst list = await client.models.list()\nconsole.log(list.data.slice(0, 10).map((m) => m.id))`,
        json: `{\n  "endpoint": "/v1/models",\n  "method": "GET"\n}`,
      },
      responseTitle: 'Response · Model List',
      responseJson: `{\n  "object": "list",\n  "data": [\n    { "id": "gpt-5.6", "object": "model", "owned_by": "openai" },\n    { "id": "claude-sonnet-4-6", "object": "model", "owned_by": "anthropic" },\n    { "id": "gemini-2.5-pro", "object": "model", "owned_by": "google" }\n  ]\n}`,
    },
    {
      id: 'proto-responses',
      group: '接口协议',
      title: 'OpenAI Responses API',
      summary:
        '新一代统一推理与工具调用接口，原生支持深度思考、结构化输出与多轮状态续接。',
      urlLabel: 'Endpoint',
      urlValue: `${v1}/responses`,
      endpoints: [{ method: 'POST', path: '/v1/responses' }],
      sections: [
        {
          id: 'pr-fields',
          title: '1. 核心请求字段',
          paragraphs: [
            'OpenAI 官方 SDK（v4.80+ / Python v1.66+）已内置 client.responses.create()，将 base_url 指向 MagiRouter 即可无缝切换。',
          ],
          table: {
            headers: ['字段', '类型', '说明'],
            rows: [
              ['model', 'string', '目标模型名称，例如 gpt-5.6 或 o4-mini'],
              ['input', 'string | array', '用户输入文本或多模态消息数组'],
              ['reasoning', 'object', '推理深度控制，如 { "effort": "medium" }'],
              ['stream', 'boolean', '是否开启 SSE 流式事件输出'],
            ],
          },
        },
      ],
      snippets: {
        curl: `curl ${v1}/responses \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "gpt-5.6",\n    "input": "设计一个高可用 API 网关的重试策略",\n    "reasoning": { "effort": "medium" }\n  }'`,
        python: `import os\nfrom openai import OpenAI\n\nclient = OpenAI(base_url="${v1}", api_key=os.environ["MAGIROUTER_API_KEY"])\nresp = client.responses.create(\n    model="gpt-5.6",\n    input="设计一个高可用 API 网关的重试策略",\n    reasoning={"effort": "medium"},\n)\nprint(resp.output_text)`,
        node: `import OpenAI from 'openai'\n\nconst client = new OpenAI({ baseURL: '${v1}', apiKey: process.env.MAGIROUTER_API_KEY })\nconst resp = await client.responses.create({\n  model: 'gpt-5.6',\n  input: '设计一个高可用 API 网关的重试策略',\n  reasoning: { effort: 'medium' },\n})\nconsole.log(resp.output_text)`,
        json: `{\n  "model": "gpt-5.6",\n  "input": "设计一个高可用 API 网关的重试策略",\n  "reasoning": { "effort": "medium" }\n}`,
      },
      responseTitle: 'Response · /v1/responses',
      responseJson: `{\n  "id": "resp_01magirouter",\n  "status": "completed",\n  "model": "gpt-5.6",\n  "output_text": "建议采用指数退避 + 熔断隔离 + 幂等键组合策略。",\n  "usage": { "input_tokens": 22, "output_tokens": 118 }\n}`,
    },
    {
      id: 'proto-chat',
      group: '接口协议',
      title: 'OpenAI Chat Completions',
      summary:
        '生态最广泛的通用对话协议，一个端点即可调用 OpenAI、Claude、Gemini、DeepSeek 等全部文本与视觉模型。',
      urlLabel: 'Endpoint',
      urlValue: `${v1}/chat/completions`,
      endpoints: [{ method: 'POST', path: '/v1/chat/completions' }],
      sections: [
        {
          id: 'pc-compat',
          title: '1. 跨模型统一调用',
          paragraphs: [
            '所有支持对话的厂商模型均可通过 /v1/chat/completions 调用，无需修改业务代码，仅需替换 model 字段即可横向切换模型或做 A/B 评测。',
          ],
        },
      ],
      snippets: {
        curl: `curl ${v1}/chat/completions \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "claude-sonnet-4-6",\n    "stream": true,\n    "messages": [\n      {"role": "system", "content": "你是资深架构师"},\n      {"role": "user", "content": "给出 3 条数据库分表建议"}\n    ]\n  }'`,
        python: `import os\nfrom openai import OpenAI\n\nclient = OpenAI(base_url="${v1}", api_key=os.environ["MAGIROUTER_API_KEY"])\nstream = client.chat.completions.create(\n    model="claude-sonnet-4-6",\n    stream=True,\n    messages=[{"role": "user", "content": "给出 3 条数据库分表建议"}],\n)\nfor chunk in stream:\n    print(chunk.choices[0].delta.content or "", end="")`,
        node: `import OpenAI from 'openai'\n\nconst client = new OpenAI({ baseURL: '${v1}', apiKey: process.env.MAGIROUTER_API_KEY })\nconst res = await client.chat.completions.create({\n  model: 'claude-sonnet-4-6',\n  messages: [{ role: 'user', content: '给出 3 条数据库分表建议' }],\n})\nconsole.log(res.choices[0].message.content)`,
        json: `{\n  "model": "claude-sonnet-4-6",\n  "stream": true,\n  "messages": [{ "role": "user", "content": "给出 3 条数据库分表建议" }]\n}`,
      },
      responseTitle: 'Response · /v1/chat/completions',
      responseJson: `{\n  "id": "chatcmpl-01",\n  "model": "claude-sonnet-4-6",\n  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "1. 按业务主键范围或哈希拆分..." }, "finish_reason": "stop" }]\n}`,
    },
    {
      id: 'proto-anthropic',
      group: '接口协议',
      title: 'Anthropic Messages API',
      summary:
        '原生兼容 Anthropic SDK 与 Claude Code，完整透传 Prompt Caching、Extended Thinking 与工具调用。',
      urlLabel: 'Endpoint',
      urlValue: `${v1}/messages`,
      endpoints: [{ method: 'POST', path: '/v1/messages' }],
      sections: [
        {
          id: 'pa-cache',
          title: '1. 原生请求头与缓存控制',
          paragraphs: [
            '支持标准 x-api-key 与 anthropic-version 请求头。设置 ANTHROPIC_BASE_URL 为本站根地址（不带 /v1 后缀）后，Claude Code 与 Anthropic 官方 SDK 均可原生使用 Prompt Cache 命中计费优惠。',
          ],
        },
      ],
      snippets: {
        curl: `curl ${v1}/messages \\\n  -H "x-api-key: $MAGIROUTER_API_KEY" \\\n  -H "anthropic-version: 2023-06-01" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "claude-sonnet-4-6",\n    "max_tokens": 1024,\n    "messages": [{"role": "user", "content": "解释一下 Prompt Caching 的收益"}]\n  }'`,
        python: `import os\nimport anthropic\n\nclient = anthropic.Anthropic(\n    base_url="${root}",\n    api_key=os.environ["MAGIROUTER_API_KEY"],\n)\nmsg = client.messages.create(\n    model="claude-sonnet-4-6",\n    max_tokens=1024,\n    messages=[{"role": "user", "content": "解释一下 Prompt Caching 的收益"}],\n)\nprint(msg.content[0].text)`,
        node: `import Anthropic from '@anthropic-ai/sdk'\n\nconst client = new Anthropic({\n  baseURL: '${root}',\n  apiKey: process.env.MAGIROUTER_API_KEY,\n})\nconst msg = await client.messages.create({\n  model: 'claude-sonnet-4-6',\n  max_tokens: 1024,\n  messages: [{ role: 'user', content: '解释一下 Prompt Caching 的收益' }],\n})\nconsole.log(msg.content)`,
        json: `{\n  "model": "claude-sonnet-4-6",\n  "max_tokens": 1024,\n  "messages": [{ "role": "user", "content": "解释一下 Prompt Caching 的收益" }]\n}`,
      },
      responseTitle: 'Response · /v1/messages',
      responseJson: `{\n  "id": "msg_01magirouter",\n  "type": "message",\n  "role": "assistant",\n  "model": "claude-sonnet-4-6",\n  "content": [{ "type": "text", "text": "Prompt Caching 可显著降低长上下文重复输入的延迟与成本。" }]\n}`,
    },
    {
      id: 'proto-gemini',
      group: '接口协议',
      title: 'Gemini 原生 API',
      summary:
        '兼容 Google GenAI SDK 与 /v1beta 原生路径，支持多模态图片/音频/视频理解、联网搜索与思考预算配置。',
      urlLabel: 'Endpoint',
      urlValue: `${root}/v1beta/models/gemini-2.5-pro:generateContent`,
      endpoints: [
        { method: 'POST', path: '/v1beta/models/{model}:generateContent' },
        { method: 'POST', path: '/v1beta/models/{model}:streamGenerateContent' },
      ],
      sections: [
        {
          id: 'pg-native',
          title: '1. 原生鉴权与多模态输入',
          paragraphs: [
            '可通过 x-goog-api-key 请求头或查询参数 key 传递 MagiRouter API 密钥，原生支持 inlineData、fileData 以及 Google Search Grounding。',
          ],
        },
      ],
      snippets: {
        curl: `curl "${root}/v1beta/models/gemini-2.5-pro:generateContent" \\\n  -H "x-goog-api-key: $MAGIROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "contents": [{ "parts": [{ "text": "总结多模态模型选型要点" }] }]\n  }'`,
        python: `import os\nfrom google import genai\n\nclient = genai.Client(\n    api_key=os.environ["MAGIROUTER_API_KEY"],\n    http_options={"base_url": "${root}"},\n)\nres = client.models.generate_content(\n    model="gemini-2.5-pro",\n    contents="总结多模态模型选型要点",\n)\nprint(res.text)`,
        node: `const res = await fetch('${root}/v1beta/models/gemini-2.5-pro:generateContent', {\n  method: 'POST',\n  headers: {\n    'x-goog-api-key': process.env.MAGIROUTER_API_KEY!,\n    'Content-Type': 'application/json',\n  },\n  body: JSON.stringify({\n    contents: [{ parts: [{ text: '总结多模态模型选型要点' }] }],\n  }),\n})\nconsole.log(await res.json())`,
        json: `{\n  "contents": [\n    { "parts": [{ "text": "总结多模态模型选型要点" }] }\n  ]\n}`,
      },
      responseTitle: 'Response · Gemini Native',
      responseJson: `{\n  "candidates": [\n    {\n      "content": { "role": "model", "parts": [{ "text": "可从上下文长度、视觉精度、延迟与单价四个维度综合权衡。" }] }\n    }\n  ]\n}`,
    },
    {
      id: 'response-stream',
      group: '任务环节',
      title: '同步与流式 (SSE)',
      summary:
        '实时逐段接收生成内容，支持标准 Server-Sent Events 透传与完整 Token 用量回传。',
      urlLabel: 'Header',
      urlValue: 'Accept: text/event-stream',
      endpoints: [
        { method: 'POST', path: '/v1/responses' },
        { method: 'POST', path: '/v1/chat/completions' },
      ],
      sections: [
        {
          id: 'rs-sse',
          title: '1. 流式事件透传与用量汇总',
          paragraphs: [
            '将请求参数 stream 设为 true 后，网关会第一时间将上游生成的增量 chunk 透传给客户端。建议同时设置 stream_options.include_usage = true 以便在尾包拿到精确 Token 统计。',
          ],
        },
        {
          id: 'rs-telemetry',
          title: '2. 首字延迟与吞吐监控',
          paragraphs: [
            '每一次流式调用都会在控制台「使用日志」中自动记录首字时间（TTFT）、总耗时、渠道分组与本次扣费明细。',
          ],
        },
      ],
      snippets: {
        curl: `curl -N ${v1}/chat/completions \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"gpt-5.6","stream":true,"stream_options":{"include_usage":true},"messages":[{"role":"user","content":"Hello"}]}'`,
        python: `stream = client.chat.completions.create(\n    model="gpt-5.6",\n    stream=True,\n    stream_options={"include_usage": True},\n    messages=[{"role": "user", "content": "Hello"}],\n)`,
        node: `const stream = await client.chat.completions.create({\n  model: 'gpt-5.6',\n  stream: true,\n  stream_options: { include_usage: true },\n  messages: [{ role: 'user', content: 'Hello' }],\n})`,
        json: `{\n  "model": "gpt-5.6",\n  "stream": true,\n  "stream_options": { "include_usage": true }\n}`,
      },
      responseTitle: 'SSE Stream Chunk',
      responseJson: `{\n  "id": "chatcmpl-stream",\n  "choices": [{ "delta": { "content": "你好！" }, "finish_reason": null }],\n  "usage": { "prompt_tokens": 9, "completion_tokens": 4, "total_tokens": 13 }\n}`,
    },
    {
      id: 'response-async',
      group: '任务环节',
      title: '异步任务机制',
      summary:
        '适用于视频生成、高分辨率多图任务等长耗时推理，提交即返回任务 ID 并自动跟踪全生命周期。',
      urlLabel: 'Async Flow',
      urlValue: `${v1}/videos`,
      endpoints: [
        { method: 'POST', path: '/v1/videos' },
        { method: 'GET', path: '/v1/videos/{task_id}' },
      ],
      sections: [
        {
          id: 'ra-lifecycle',
          title: '1. 四阶段任务状态机',
          paragraphs: [
            '所有异步任务均按 SUBMITTED → IN_PROGRESS → SUCCESS / FAILURE 流转，并在控制台「任务日志」页面实时可视化追踪。',
          ],
          table: {
            headers: ['状态', '含义', '建议动作'],
            rows: [
              ['SUBMITTED', '已受理排队中', '等待 3–5 秒后开始轮询'],
              ['IN_PROGRESS', '模型正在渲染生成', '按退避间隔继续查询状态'],
              ['SUCCESS', '产物已就绪', '尽快下载并转存至自有对象存储'],
              ['FAILURE', '上游执行异常', '查看错误原因，已预扣费用自动全额退还'],
            ],
          },
        },
        {
          id: 'ra-refund',
          title: '2. 失败自动退款保障',
          paragraphs: [
            '若异步任务最终进入 FAILURE 状态，系统会自动回退预扣额度，确保失败调用零成本。',
          ],
        },
      ],
      snippets: {
        curl: `curl ${v1}/videos \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"seedance-1-5-pro","prompt":"晨雾中的高山茶园航拍，缓慢推近","seconds":"5"}'`,
        python: `import requests\n\nres = requests.post(\n    "${v1}/videos",\n    headers={"Authorization": f"Bearer {api_key}"},\n    json={"model": "seedance-1-5-pro", "prompt": "晨雾中的高山茶园航拍，缓慢推近", "seconds": "5"},\n)\nprint(res.json())`,
        node: `const res = await fetch('${v1}/videos', {\n  method: 'POST',\n  headers: { Authorization: \`Bearer \${process.env.MAGIROUTER_API_KEY}\`, 'Content-Type': 'application/json' },\n  body: JSON.stringify({ model: 'seedance-1-5-pro', prompt: '晨雾中的高山茶园航拍，缓慢推近', seconds: '5' }),\n})\nconsole.log(await res.json())`,
        json: `{\n  "model": "seedance-1-5-pro",\n  "prompt": "晨雾中的高山茶园航拍，缓慢推近",\n  "seconds": "5"\n}`,
      },
      responseTitle: 'Response · Task Accepted',
      responseJson: `{\n  "id": "video_01mr9x8k",\n  "status": "queued",\n  "model": "seedance-1-5-pro"\n}`,
    },
    {
      id: 'response-polling',
      group: '任务环节',
      title: '状态轮询机制',
      summary:
        '通过任务 ID 幂等查询异步任务进度与最终下载链接，避免高频无效请求。',
      urlLabel: 'Polling Endpoint',
      urlValue: `${v1}/videos/{task_id}`,
      endpoints: [{ method: 'GET', path: '/v1/videos/{task_id}' }],
      sections: [
        {
          id: 'rp-interval',
          title: '1. 推荐轮询频率与退避间隔',
          paragraphs: [
            '推荐提交后等待 3 秒首次查询，之后每 5 秒轮询一次，超过 60 秒后逐步退避至 10 秒一次，直到状态变为 completed 或 failed。',
          ],
        },
        {
          id: 'rp-idempotency',
          title: '2. 查询幂等性与零计费',
          paragraphs: [
            '状态轮询接口本身完全免费且幂等，不触发二次生成也不会产生额外扣费。',
          ],
        },
      ],
      snippets: {
        curl: `curl ${v1}/videos/video_01mr9x8k \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY"`,
        python: `res = requests.get("${v1}/videos/video_01mr9x8k", headers={"Authorization": f"Bearer {api_key}"})\nprint(res.json())`,
        node: `const res = await fetch('${v1}/videos/video_01mr9x8k', {\n  headers: { Authorization: \`Bearer \${process.env.MAGIROUTER_API_KEY}\` },\n})\nconsole.log(await res.json())`,
        json: `{ "task_id": "video_01mr9x8k" }`,
      },
      responseTitle: 'Response · Task Completed',
      responseJson: `{\n  "id": "video_01mr9x8k",\n  "status": "completed",\n  "progress": 100,\n  "url": "https://cdn.magirouter.com/tasks/video_01mr9x8k.mp4"\n}`,
    },
    {
      id: 'task-media-ops',
      group: '任务环节',
      title: '生成、编辑与下载',
      summary:
        '覆盖文生图、多参考图编辑、蒙版局部重绘与视频成片拉取的标准工作流。',
      urlLabel: 'Media Endpoints',
      urlValue: `${v1}/images/generations`,
      endpoints: [
        { method: 'POST', path: '/v1/images/generations' },
        { method: 'POST', path: '/v1/images/edits' },
        { method: 'GET', path: '/v1/videos/{task_id}/content' },
      ],
      sections: [
        {
          id: 'tmo-lifecycle',
          title: '1. 生成、编辑与产物下载分工',
          paragraphs: [
            '文生图统一调用 /v1/images/generations；带参考图或蒙版重绘使用 multipart/form-data 请求 /v1/images/edits；异步视频完成后请及时拉取文件并持久化保存。',
          ],
        },
      ],
      snippets: {
        curl: `curl ${v1}/images/generations \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"gpt-image-1","prompt":"极简陶瓷香薰瓶产品摄影，自然窗光","size":"1024x1024"}'`,
        python: `img = client.images.generate(\n    model="gpt-image-1",\n    prompt="极简陶瓷香薰瓶产品摄影，自然窗光",\n    size="1024x1024",\n)\nprint(img.data[0].url)`,
        node: `const img = await client.images.generate({\n  model: 'gpt-image-1',\n  prompt: '极简陶瓷香薰瓶产品摄影，自然窗光',\n  size: '1024x1024',\n})\nconsole.log(img.data[0].url)`,
        json: `{\n  "model": "gpt-image-1",\n  "prompt": "极简陶瓷香薰瓶产品摄影，自然窗光",\n  "size": "1024x1024"\n}`,
      },
      responseTitle: 'Response · Image Output',
      responseJson: `{\n  "created": 1794816200,\n  "data": [{ "url": "https://cdn.magirouter.com/media/img_01j9ceramic.png" }]\n}`,
    },
    {
      id: 'task-model-discovery',
      group: '任务环节',
      title: '模型发现 (/v1/models)',
      summary:
        '按当前 API 密钥绑定的路由分组与白名单动态返回所有可调用模型列表。',
      urlLabel: 'Endpoint',
      urlValue: `${v1}/models`,
      endpoints: [{ method: 'GET', path: '/v1/models' }],
      sections: [
        {
          id: 'tmd-filter',
          title: '1. 按密钥权限动态发现模型',
          paragraphs: [
            '桌面客户端（如 Cherry Studio、ChatBox、Cursor）配置好 Base URL 和 API Key 后，点击「拉取模型」即会调用 /v1/models，仅返回该密钥所属分组及模型白名单允许访问的模型。',
          ],
        },
      ],
      snippets: {
        curl: `curl ${v1}/models -H "Authorization: Bearer $MAGIROUTER_API_KEY"`,
        python: `for m in client.models.list().data:\n    print(m.id)`,
        node: `const res = await client.models.list()\nconsole.log(res.data.map((m) => m.id))`,
        json: `{ "method": "GET", "path": "/v1/models" }`,
      },
      responseTitle: 'Response · /v1/models',
      responseJson: `{\n  "object": "list",\n  "data": [{ "id": "gpt-5.6", "object": "model", "owned_by": "openai" }]\n}`,
    },
    {
      id: 'task-batch',
      group: '任务环节',
      title: '批量任务 (Batch)',
      summary:
        '适合离线数据清洗、批量翻译、批量评测等大吞吐异步作业，上传 JSONL 即可队列执行。',
      urlLabel: 'Batch Endpoint',
      urlValue: `${v1}/batches`,
      endpoints: [
        { method: 'POST', path: '/v1/files' },
        { method: 'POST', path: '/v1/batches' },
        { method: 'GET', path: '/v1/batches/{batch_id}' },
      ],
      sections: [
        {
          id: 'tb-flow',
          title: '1. 离线批处理四步流程',
          paragraphs: [
            '先通过 /v1/files 上传 purpose="batch" 的 JSONL 任务文件，再用返回的 file_id 创建批处理任务，完成后按 output_file_id 下载全部结果。',
          ],
        },
      ],
      snippets: {
        curl: `curl ${v1}/batches \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"input_file_id":"file-abc123","endpoint":"/v1/chat/completions","completion_window":"24h"}'`,
        python: `batch = client.batches.create(\n    input_file_id="file-abc123",\n    endpoint="/v1/chat/completions",\n    completion_window="24h",\n)`,
        node: `const batch = await client.batches.create({\n  input_file_id: 'file-abc123',\n  endpoint: '/v1/chat/completions',\n  completion_window: '24h',\n})`,
        json: `{\n  "input_file_id": "file-abc123",\n  "endpoint": "/v1/chat/completions",\n  "completion_window": "24h"\n}`,
      },
      responseTitle: 'Response · Batch Created',
      responseJson: `{\n  "id": "batch_01mr",\n  "status": "validating",\n  "endpoint": "/v1/chat/completions"\n}`,
    },
    {
      id: 'response-storage',
      group: '任务环节',
      title: '存储桶与媒体转存',
      summary:
        '了解图片、视频、音频产物的临时存储有效期及生产环境对象存储转存最佳实践。',
      urlLabel: 'Best Practice',
      urlValue: 'OSS / S3 / R2 转存建议',
      endpoints: [{ method: 'GET', path: '/v1/files/{file_id}/content' }],
      sections: [
        {
          id: 'st-retention',
          title: '1. 媒体产物有效期与转存建议',
          paragraphs: [
            '上游厂商返回的图片或视频临时链接通常具有时效性（数小时至数天不等）。生产业务请在任务完成后立即将产物下载并转存到自有 OSS / S3 / R2 存储桶。',
          ],
        },
        {
          id: 'st-reference',
          title: '2. 多模态参考素材传入方式',
          paragraphs: [
            '传入参考图片或视频时优先使用公网可直连的 HTTPS URL，避免超大 Base64 体积拖慢首包传输。',
          ],
        },
      ],
      snippets: {
        curl: `curl -L "https://cdn.magirouter.com/media/img_01j9ceramic.png" -o output.png`,
        python: `data = requests.get(media_url, timeout=30).content\nopen("output.png", "wb").write(data)`,
        node: `const buf = Buffer.from(await (await fetch(mediaUrl)).arrayBuffer())\nawait fs.writeFile('output.png', buf)`,
        json: `{ "recommended_storage": ["Aliyun OSS", "Cloudflare R2", "AWS S3"] }`,
      },
      responseTitle: 'Storage Checklist',
      responseJson: `{\n  "auto_persist_to_own_bucket": true,\n  "prefer_https_url_input": true\n}`,
    },
    {
      id: 'routing-groups',
      group: '资源',
      title: '路由分组倍率',
      summary:
        '每个路由分组对应独立的渠道池与计费倍率，可在创建 API 密钥时按业务场景灵活绑定。',
      urlLabel: 'Console Path',
      urlValue: '/keys',
      endpoints: [{ method: 'GET', path: '/api/pricing' }],
      sections: [
        {
          id: 'rg-table',
          title: '1. 路由分组与倍率机制',
          paragraphs: [
            '最终调用单价 = 模型基础单价 × 路由分组倍率。你可以为高并发线上流量选择稳定高速分组，为批量离线脚本选择高性价比分组。',
          ],
        },
        {
          id: 'rg-select',
          title: '2. 如何为项目选择并切换分组',
          paragraphs: [
            '进入控制台「API 密钥」新建或编辑密钥时，在「分组」下拉框选择目标分组即可即时生效，无需改动任何业务代码。',
          ],
        },
      ],
      snippets: {
        curl: `curl ${root}/api/pricing`,
        python: `# 在控制台为不同环境分别签发绑定不同分组的 API Key\n# 线上服务: MAGIROUTER_API_KEY (高可用分组)\n# 离线批处理: MAGIROUTER_BATCH_KEY (经济分组)`,
        node: `// 不同路由分组通过对应 API Key 自动路由，无需额外请求头`,
        json: `{ "formula": "actual_cost = base_model_price * group_ratio" }`,
      },
      responseTitle: 'Pricing Formula',
      responseJson: `{\n  "exchange_rate": "1:1 USD",\n  "failed_request_charge": 0\n}`,
    },
    {
      id: 'clients',
      group: '资源',
      title: '客户端配置',
      summary:
        '快速配置 Claude Code、Codex CLI、Cursor、Cherry Studio 与 ChatBox 连接 MagiRouter。',
      urlLabel: 'Base URL',
      urlValue: v1,
      endpoints: [
        { method: 'POST', path: '/v1/responses' },
        { method: 'POST', path: '/v1/messages' },
      ],
      sections: [
        {
          id: 'cl-cli',
          title: '1. Claude Code 与 Codex CLI 环境变量',
          paragraphs: [
            'Claude Code 请设置 ANTHROPIC_BASE_URL（不带 /v1）与 ANTHROPIC_AUTH_TOKEN；Codex CLI 与 OpenAI 生态工具请设置 OPENAI_BASE_URL（带 /v1）与 OPENAI_API_KEY。',
          ],
        },
        {
          id: 'cl-ide',
          title: '2. Cursor / Cherry Studio / ChatBox',
          paragraphs: [
            '在模型供应商中选择 OpenAI Compatible 或自定义接口，填入 Base URL（国内网络推荐 https://cn.magirouter.com/v1）与 API 密钥，刷新模型列表即可开始对话。',
          ],
        },
      ],
      snippets: {
        curl: `# Claude Code\nexport ANTHROPIC_BASE_URL="${root}"\nexport ANTHROPIC_AUTH_TOKEN="$MAGIROUTER_API_KEY"\n\n# Codex CLI / OpenAI SDK\nexport OPENAI_BASE_URL="${v1}"\nexport OPENAI_API_KEY="$MAGIROUTER_API_KEY"`,
        python: `# OpenAI Python SDK\nimport os\nfrom openai import OpenAI\nclient = OpenAI(base_url="${v1}", api_key=os.environ["MAGIROUTER_API_KEY"])`,
        node: `// OpenAI Node SDK\nimport OpenAI from 'openai'\nconst client = new OpenAI({ baseURL: '${v1}', apiKey: process.env.MAGIROUTER_API_KEY })`,
        json: `{\n  "openai_base_url": "${v1}",\n  "anthropic_base_url": "${root}"\n}`,
      },
      responseTitle: 'Verified Clients',
      responseJson: `{\n  "clients": ["Claude Code", "Codex CLI", "Cursor", "Cherry Studio", "ChatBox", "Dify"]\n}`,
    },
    {
      id: 'billing-model',
      group: '资源',
      title: '计费规则',
      summary:
        '全站采用 1:1 汇率透明计费、按真实用量扣费、上游失败自动免扣，每笔消费均可在日志逐条对账。',
      urlLabel: 'Wallet Path',
      urlValue: '/wallet',
      endpoints: [{ method: 'GET', path: '/api/log/self' }],
      sections: [
        {
          id: 'bm-sub',
          title: '1. 1:1 汇率充值与余额说明',
          paragraphs: [
            '按量充值永久有效、无强制月费；支持在线支付、兑换码充值与套餐订阅。每次请求按实际消耗 Token 或次数实时结算。',
          ],
        },
        {
          id: 'bm-refund',
          title: '2. 失败免扣与流水对账',
          paragraphs: [
            '因上游超时或通道异常导致的失败请求自动免扣。进入控制台「使用日志」可查看每一次请求的输入/输出 Token、缓存命中折扣、路由倍率与精准金额。',
          ],
        },
      ],
      snippets: {
        curl: `# 在控制台「钱包」与「使用日志」实时核对每笔调用明细`,
        python: `# 每次成功响应均携带标准 usage 字段，可直接对照控制台日志`,
        node: `// 每次成功响应均携带标准 usage 字段，可直接对照控制台日志`,
        json: `{ "billing_mode": "pay-as-you-go", "failed_request_cost": "$0.0000" }`,
      },
      responseTitle: 'Billing Summary',
      responseJson: `{\n  "currency": "USD",\n  "exchange_mode": "1:1",\n  "failed_call_deduction": 0\n}`,
    },
    {
      id: 'api-keys-guide',
      group: '资源',
      title: 'API 密钥管理',
      summary:
        '为不同应用与环境创建独立密钥，配置额度上限、过期时间、IP 白名单与可用模型范围。',
      urlLabel: 'Keys Path',
      urlValue: '/keys',
      endpoints: [{ method: 'GET', path: '/api/token/' }],
      sections: [
        {
          id: 'ak-scope',
          title: '1. 最小权限隔离策略',
          paragraphs: [
            '推荐按项目或环境拆分 API 密钥，并为测试密钥设置独立额度上限与可用模型白名单，避免单一密钥泄露影响整个账户余额。',
          ],
        },
        {
          id: 'ak-boundary',
          title: '2. 推理密钥与系统访问令牌边界',
          paragraphs: [
            'sk-... API 密钥仅用于模型推理调用；如需脚本自动化管理账户或查询统计，请在「安全与访问」页面单独创建系统访问令牌（Access Token），切勿混用。',
          ],
        },
      ],
      snippets: {
        curl: `curl ${v1}/models -H "Authorization: Bearer sk-your-project-key"`,
        python: `# 建议通过环境变量注入密钥，切勿提交到 Git 仓库\napi_key = os.environ["MAGIROUTER_API_KEY"]`,
        node: `// 建议通过环境变量注入密钥，切勿提交到 Git 仓库\nconst apiKey = process.env.MAGIROUTER_API_KEY`,
        json: `{ "key_prefix": "sk-", "supports_quota_cap": true, "supports_model_allowlist": true }`,
      },
      responseTitle: 'Key Policy',
      responseJson: `{\n  "scoped_models": true,\n  "ip_allowlist": true,\n  "expiration_support": true\n}`,
    },
    {
      id: 'security-auth',
      group: '资源',
      title: '账户安全',
      summary:
        '通过强密码策略、两步验证 (2FA)、Passkey 通行密钥与完整审计日志保护账户资产。',
      urlLabel: 'Security Path',
      urlValue: '/security',
      endpoints: [{ method: 'GET', path: '/api/user/self' }],
      sections: [
        {
          id: 'sa-mfa',
          title: '1. 两步验证 (2FA) 与 Passkey',
          paragraphs: [
            '在控制台「安全与访问」页面可绑定 TOTP 两步验证（兼容 1Password / Google Authenticator）并注册 Passkey 通行密钥，提升登录与敏感操作安全性。',
          ],
        },
        {
          id: 'sa-audit',
          title: '2. 审计日志追溯',
          paragraphs: [
            '密钥创建、额度修改、安全设置变更等关键操作均可在「审计日志」中完整追溯时间、来源 IP 与执行记录。',
          ],
        },
      ],
      snippets: {
        curl: `# 管理操作请在控制台「安全与访问」页面完成，并启用 2FA 保护`,
        python: `# 切勿在前端浏览器或公开客户端中硬编码 API Key`,
        node: `// 切勿在前端浏览器或公开客户端中硬编码 API Key`,
        json: `{ "totp_2fa": true, "passkey": true, "audit_logs": true }`,
      },
      responseTitle: 'Security Features',
      responseJson: `{\n  "totp_enabled": true,\n  "passkey_supported": true,\n  "audit_trail": true\n}`,
    },
    {
      id: 'error-codes',
      group: '资源',
      title: 'HTTP 状态码参考',
      summary: '快速定位 401、403、429、500、502 等常见错误状态码及排查方案。',
      urlLabel: 'Diagnostics',
      urlValue: 'HTTP Status Reference',
      endpoints: [{ method: 'GET', path: '/api/status' }],
      sections: [
        {
          id: 'ec-table',
          title: '常见状态码排查指引',
          paragraphs: [
            '网关保留标准 OpenAI / Anthropic 错误体结构，并附带请求 ID 便于工单定位。',
          ],
          table: {
            headers: ['状态码', '常见原因', '建议处理方式'],
            rows: [
              ['401 Unauthorized', 'API 密钥无效、已禁用或缺失请求头', '检查 Authorization / x-api-key 是否正确'],
              ['403 Forbidden', '当前密钥无权调用该模型或受 IP 白名单限制', '在「API 密钥」页检查分组与模型白名单'],
              ['429 Too Many Requests', '触发并发限流或账户余额不足', '启用指数退避重试或在「钱包」页检查余额'],
              ['502 / 503', '上游渠道临时抖动', '网关会自动切换健康渠道，失败调用免扣费'],
            ],
          },
        },
      ],
      snippets: {
        curl: `curl -i ${v1}/models -H "Authorization: Bearer $MAGIROUTER_API_KEY"`,
        python: `# 捕获 429/5xx 并使用指数退避重试\n# OpenAI SDK 默认自带 max_retries=2`,
        node: `// OpenAI Node SDK 默认自带 maxRetries: 2`,
        json: `{\n  "error": {\n    "message": "Invalid API key provided",\n    "type": "invalid_request_error",\n    "code": "invalid_api_key"\n  }\n}`,
      },
      responseTitle: 'Error Body Format',
      responseJson: `{\n  "error": {\n    "message": "Rate limit reached for requests",\n    "type": "rate_limit_error",\n    "code": "rate_limit_exceeded"\n  }\n}`,
    },
  ]
}

function getModelEndpointPath(
  cap: DocsModalityKey,
  modelId: string,
  vendor: string
): string {
  if (cap === 'image') return '/v1/images/generations'
  if (cap === 'video') return '/v1/videos'
  if (cap === 'audio') {
    return modelId.includes('whisper')
      ? '/v1/audio/transcriptions'
      : '/v1/audio/speech'
  }
  return vendor === 'Anthropic' ? '/v1/messages' : '/v1/chat/completions'
}

function buildModelCurlSnippet(
  cap: DocsModalityKey,
  v1: string,
  modelId: string
): string {
  if (cap === 'image') {
    return `curl ${v1}/images/generations \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "${modelId}",\n    "prompt": "极简黑白摄影风格，柔光静物构图",\n    "size": "1024x1024"\n  }'`
  }
  if (cap === 'video') {
    return `curl ${v1}/videos \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "${modelId}",\n    "prompt": "清晨咖啡馆窗边，蒸汽缓缓升起，慢推镜头",\n    "seconds": "5"\n  }'`
  }
  if (cap === 'audio') {
    if (modelId.includes('whisper')) {
      return `curl ${v1}/audio/transcriptions \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\\n  -F "model=${modelId}" \\\n  -F "file=@sample.mp3"`
    }
    return `curl ${v1}/audio/speech \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "${modelId}",\n    "voice": "marin",\n    "input": "欢迎使用 MagiRouter 统一模型网关。"\n  }' --output speech.mp3`
  }
  return `curl ${v1}/chat/completions \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "${modelId}",\n    "messages": [{"role": "user", "content": "请简要分析这段架构设计的优缺点"}]\n  }'`
}

function buildModelPythonSnippet(
  cap: DocsModalityKey,
  v1: string,
  modelId: string
): string {
  if (cap === 'image') {
    return `import os\nfrom openai import OpenAI\n\nclient = OpenAI(base_url="${v1}", api_key=os.environ["MAGIROUTER_API_KEY"])\nres = client.images.generate(model="${modelId}", prompt="极简黑白摄影风格，柔光静物构图", size="1024x1024")\nprint(res.data[0].url)`
  }
  if (cap === 'video') {
    return `import os, requests\n\nres = requests.post(\n    "${v1}/videos",\n    headers={"Authorization": f"Bearer {os.environ['MAGIROUTER_API_KEY']}"},\n    json={"model": "${modelId}", "prompt": "清晨咖啡馆窗边，蒸汽缓缓升起，慢推镜头", "seconds": "5"},\n)\nprint(res.json())`
  }
  if (cap === 'audio') {
    return `import os\nfrom openai import OpenAI\n\nclient = OpenAI(base_url="${v1}", api_key=os.environ["MAGIROUTER_API_KEY"])\n# 请按需调用 client.audio.speech.create 或 client.audio.transcriptions.create\nprint("Model ready:", "${modelId}")`
  }
  return `import os\nfrom openai import OpenAI\n\nclient = OpenAI(base_url="${v1}", api_key=os.environ["MAGIROUTER_API_KEY"])\nres = client.chat.completions.create(\n    model="${modelId}",\n    messages=[{"role": "user", "content": "请简要分析这段架构设计的优缺点"}],\n)\nprint(res.choices[0].message.content)`
}

function buildModelJsonSnippet(cap: DocsModalityKey, modelId: string): string {
  if (cap === 'image') {
    return `{\n  "model": "${modelId}",\n  "prompt": "极简黑白摄影风格，柔光静物构图",\n  "size": "1024x1024"\n}`
  }
  if (cap === 'video') {
    return `{\n  "model": "${modelId}",\n  "prompt": "清晨咖啡馆窗边，蒸汽缓缓升起",\n  "seconds": "5"\n}`
  }
  if (cap === 'audio') {
    return `{\n  "model": "${modelId}",\n  "voice": "marin",\n  "input": "欢迎使用 MagiRouter 统一模型网关。"\n}`
  }
  return `{\n  "model": "${modelId}",\n  "messages": [{ "role": "user", "content": "请简要分析这段架构设计的优缺点" }]\n}`
}

export function buildModelDocArticle(
  modelId: string,
  baseUrl: string,
  family: DocsModelFamily,
  liveModel?: PricingModel
): DocsArticle {
  const root = baseUrl.replace(/\/+$/, '')
  const v1 = `${root}/v1`
  const cap = family.cap

  const endpointPath = getModelEndpointPath(cap, modelId, family.vendor)

  const groupsText =
    liveModel?.enable_groups && liveModel.enable_groups.length > 0
      ? liveModel.enable_groups.join(' / ')
      : 'default'

  const curlSnippet = buildModelCurlSnippet(cap, v1, modelId)
  const pythonSnippet = buildModelPythonSnippet(cap, v1, modelId)

  const nodeSnippet =
    cap === 'video'
      ? `const res = await fetch('${v1}/videos', {\n  method: 'POST',\n  headers: { Authorization: \`Bearer \${process.env.MAGIROUTER_API_KEY}\`, 'Content-Type': 'application/json' },\n  body: JSON.stringify({ model: '${modelId}', prompt: '清晨咖啡馆窗边，蒸汽缓缓升起', seconds: '5' }),\n})\nconsole.log(await res.json())`
      : `import OpenAI from 'openai'\n\nconst client = new OpenAI({ baseURL: '${v1}', apiKey: process.env.MAGIROUTER_API_KEY })\n// 将 model 设为 '${modelId}' 即可调用\nconsole.log('${modelId}')`

  const jsonSnippet = buildModelJsonSnippet(cap, modelId)

  return {
    id: `model:${modelId}`,
    group: 'API 概览',
    cap,
    familyName: family.name,
    title: modelId,
    summary:
      liveModel?.description ||
      `${modelId} 属于 ${family.name}（${DOCS_MODALITY_TITLES[cap]}），由 ${liveModel?.vendor_name || family.vendor} 提供，可直接通过 MagiRouter 统一密钥调用。`,
    urlLabel: 'API Endpoint',
    urlValue: `${root}${endpointPath}`,
    endpoints:
      cap === 'video'
        ? [
            { method: 'POST', path: '/v1/videos' },
            { method: 'GET', path: '/v1/videos/{task_id}' },
          ]
        : [{ method: 'POST', path: endpointPath }],
    sections: [
      {
        id: 'model-overview',
        title: '1. 模型规格与路由信息',
        paragraphs: [
          `${modelId} 已接入 MagiRouter 统一网关，最终费用将按所选 API 密钥对应的路由分组倍率实时折算，你可以在模型广场查看最新阶梯单价。`,
        ],
        table: {
          headers: ['项目', '规格值', '说明'],
          rows: [
            ['模型标识 (model)', modelId, 'API 请求中直接传入该模型 ID'],
            ['所属系列与厂商', `${liveModel?.vendor_name || family.vendor} · ${family.name}`, DOCS_MODALITY_TITLES[cap]],
            ['推荐端点', endpointPath, '兼容对应官方 SDK 与 HTTP 直调'],
            ['可用路由分组', groupsText, '可在 API 密钥配置中切换分组'],
          ],
        },
      },
      {
        id: 'model-routing',
        title: '2. 调试与上线建议',
        paragraphs: [
          '建议先在 AI 创作 → Playground 中直观验证提示词与参数，再直接复制生成的请求代码接入线上服务；国内网络环境可将域名切换为 https://cn.magirouter.com。',
        ],
      },
    ],
    snippets: {
      curl: curlSnippet,
      python: pythonSnippet,
      node: nodeSnippet,
      json: jsonSnippet,
    },
    responseTitle: cap === 'video' ? 'Response · Async Accepted' : 'Response · 200 OK',
    responseJson:
      cap === 'video'
        ? `{\n  "id": "video_01mr",\n  "model": "${modelId}",\n  "status": "queued"\n}`
        : `{\n  "id": "mr_01ok",\n  "model": "${modelId}",\n  "status": "ok"\n}`,
  }
}

export function buildDocMarkdown(article: DocsArticle): string {
  const lines: string[] = [
    `# ${article.title}`,
    '',
    article.summary,
    '',
    `- **${article.urlLabel}**: \`${article.urlValue}\``,
    '',
  ]
  for (const section of article.sections) {
    lines.push(`## ${section.title}`, '')
    for (const paragraph of section.paragraphs) {
      lines.push(paragraph, '')
    }
    if (section.table) {
      lines.push(`| ${section.table.headers.join(' | ')} |`)
      lines.push(`| ${section.table.headers.map(() => '---').join(' | ')} |`)
      for (const row of section.table.rows) {
        lines.push(`| ${row.join(' | ')} |`)
      }
      lines.push('')
    }
  }
  lines.push('## cURL 示例', '', '```bash', article.snippets.curl, '```', '')
  return lines.join('\n')
}
