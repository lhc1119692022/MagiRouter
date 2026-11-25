import { useQuery } from '@tanstack/react-query'

import type { ApiInfoItem } from '@/features/dashboard/types'
import type { PricingModel } from '@/features/pricing/types'
import { api } from '@/lib/api'

export const DOCS_CONFIG_OPTION_KEY = 'console_setting.docs_config'
export const DOCS_CONFIG_QUERY_KEY = ['docs-config'] as const

export const DOCS_STATIC_GROUPS = [
  '快速开始',
  '接口协议',
  '任务环节',
  '资源',
] as const

export type DocsStaticGroupName = (typeof DOCS_STATIC_GROUPS)[number]
export type DocsConfigModality = 'text' | 'image' | 'video' | 'audio'
export type DocsConfigMethod = 'POST' | 'GET' | 'DELETE'

export interface DocsExampleModels {
  openai?: string
  anthropic?: string
  gemini?: string
  image?: string
  video?: string
  audio?: string
}

export interface ResolvedDocsExampleModels {
  openai: string
  anthropic: string
  gemini: string
  image: string
  video: string
  audio: string
}

export interface DocsEndpointConfig {
  method: DocsConfigMethod
  path: string
}

export interface DocsSnippetsOverride {
  curl?: string
  python?: string
  node?: string
  json?: string
}

export interface DocsArticleOverride {
  id: string
  group?: DocsStaticGroupName
  title?: string
  summary?: string
  hidden?: boolean
  order?: number
  url_label?: string
  url_value?: string
  endpoints?: DocsEndpointConfig[]
  markdown?: string
  snippets?: DocsSnippetsOverride
  response_title?: string
  response_json?: string
}

export interface DocsModelOverride {
  model_id: string
  family_name?: string
  cap?: DocsConfigModality
  hidden?: boolean
  summary?: string
  endpoint_path?: string
  endpoints?: DocsEndpointConfig[]
  markdown?: string
  snippets?: DocsSnippetsOverride
  response_title?: string
  response_json?: string
}

export interface DocsConfig {
  example_models?: DocsExampleModels
  articles?: DocsArticleOverride[]
  model_overrides?: DocsModelOverride[]
}

export interface DocsEntryEndpoint {
  label: string
  url: string
  scene: string
}

export interface DocsMarkdownSection {
  id: string
  title: string
  body: string
}

const VALID_GROUPS = new Set<string>(DOCS_STATIC_GROUPS)
const VALID_MODALITIES = new Set<string>(['text', 'image', 'video', 'audio'])
const VALID_METHODS = new Set<string>(['POST', 'GET', 'DELETE'])
const ARTICLE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function isSafeDocsUrlValue(value: string): boolean {
  const lower = value.toLowerCase()
  return (
    !lower.startsWith('javascript:') &&
    !lower.startsWith('data:') &&
    !lower.startsWith('vbscript:')
  )
}

function parseEndpoints(value: unknown): DocsEndpointConfig[] | undefined {
  if (!Array.isArray(value)) return undefined
  const clean: DocsEndpointConfig[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const method =
      typeof record.method === 'string'
        ? record.method.trim().toUpperCase()
        : ''
    const path = typeof record.path === 'string' ? record.path.trim() : ''
    if (!VALID_METHODS.has(method) || !path.startsWith('/')) continue
    clean.push({ method: method as DocsConfigMethod, path })
    if (clean.length >= 12) break
  }
  return clean.length > 0 ? clean : undefined
}

function parseSnippets(value: unknown): DocsSnippetsOverride | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const snippets: DocsSnippetsOverride = {}
  const curl = asTrimmedString(record.curl)
  const python = asTrimmedString(record.python)
  const node = asTrimmedString(record.node)
  const json = asTrimmedString(record.json)
  if (curl) snippets.curl = curl
  if (python) snippets.python = python
  if (node) snippets.node = node
  if (json) snippets.json = json
  return Object.keys(snippets).length > 0 ? snippets : undefined
}

export function parseDocsConfig(raw: unknown): DocsConfig {
  let source: unknown = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed || trimmed === '{}') return {}
    try {
      source = JSON.parse(trimmed)
    } catch {
      return {}
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {}
  }
  const record = source as Record<string, unknown>
  const config: DocsConfig = {}

  if (
    record.example_models &&
    typeof record.example_models === 'object' &&
    !Array.isArray(record.example_models)
  ) {
    const rawModels = record.example_models as Record<string, unknown>
    const exampleModels: DocsExampleModels = {}
    for (const key of [
      'openai',
      'anthropic',
      'gemini',
      'image',
      'video',
      'audio',
    ] as const) {
      const modelName = asTrimmedString(rawModels[key])
      if (modelName) exampleModels[key] = modelName
    }
    if (Object.keys(exampleModels).length > 0) {
      config.example_models = exampleModels
    }
  }

  if (Array.isArray(record.articles)) {
    const articles: DocsArticleOverride[] = []
    const seen = new Set<string>()
    for (const entry of record.articles) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const item = entry as Record<string, unknown>
      const id = asTrimmedString(item.id)
      if (!id || !ARTICLE_ID_PATTERN.test(id) || seen.has(id)) continue
      seen.add(id)
      const group = asTrimmedString(item.group)
      const urlValue = asTrimmedString(item.url_value)
      const parsed: DocsArticleOverride = { id }
      if (group && VALID_GROUPS.has(group)) {
        parsed.group = group as DocsStaticGroupName
      }
      const title = asTrimmedString(item.title)
      if (title) parsed.title = title
      const summary = asTrimmedString(item.summary)
      if (summary) parsed.summary = summary
      if (item.hidden === true) parsed.hidden = true
      if (typeof item.order === 'number' && Number.isInteger(item.order)) {
        parsed.order = item.order
      }
      const urlLabel = asTrimmedString(item.url_label)
      if (urlLabel) parsed.url_label = urlLabel
      if (urlValue && isSafeDocsUrlValue(urlValue)) {
        parsed.url_value = urlValue
      }
      const endpoints = parseEndpoints(item.endpoints)
      if (endpoints) parsed.endpoints = endpoints
      const markdown = asTrimmedString(item.markdown)
      if (markdown) parsed.markdown = markdown
      const snippets = parseSnippets(item.snippets)
      if (snippets) parsed.snippets = snippets
      const responseTitle = asTrimmedString(item.response_title)
      if (responseTitle) parsed.response_title = responseTitle
      const responseJson = asTrimmedString(item.response_json)
      if (responseJson) parsed.response_json = responseJson
      articles.push(parsed)
    }
    if (articles.length > 0) config.articles = articles
  }

  if (Array.isArray(record.model_overrides)) {
    const overrides: DocsModelOverride[] = []
    const seen = new Set<string>()
    for (const entry of record.model_overrides) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const item = entry as Record<string, unknown>
      const modelId = asTrimmedString(item.model_id)
      if (!modelId || seen.has(modelId)) continue
      seen.add(modelId)
      const parsed: DocsModelOverride = { model_id: modelId }
      const familyName = asTrimmedString(item.family_name)
      if (familyName) parsed.family_name = familyName
      const cap = asTrimmedString(item.cap)
      if (cap && VALID_MODALITIES.has(cap)) {
        parsed.cap = cap as DocsConfigModality
      }
      if (item.hidden === true) parsed.hidden = true
      const summary = asTrimmedString(item.summary)
      if (summary) parsed.summary = summary
      const endpointPath = asTrimmedString(item.endpoint_path)
      if (endpointPath && endpointPath.startsWith('/')) {
        parsed.endpoint_path = endpointPath
      }
      const endpoints = parseEndpoints(item.endpoints)
      if (endpoints) parsed.endpoints = endpoints
      const markdown = asTrimmedString(item.markdown)
      if (markdown) parsed.markdown = markdown
      const snippets = parseSnippets(item.snippets)
      if (snippets) parsed.snippets = snippets
      const responseTitle = asTrimmedString(item.response_title)
      if (responseTitle) parsed.response_title = responseTitle
      const responseJson = asTrimmedString(item.response_json)
      if (responseJson) parsed.response_json = responseJson
      overrides.push(parsed)
    }
    if (overrides.length > 0) config.model_overrides = overrides
  }

  return config
}

export function serializeDocsConfig(config: DocsConfig): string {
  const normalized = parseDocsConfig(config)
  if (
    !normalized.example_models &&
    !normalized.articles &&
    !normalized.model_overrides
  ) {
    return '{}'
  }
  return JSON.stringify(normalized)
}

export function isValidDocsArticleId(value: string): boolean {
  return ARTICLE_ID_PATTERN.test(value.trim())
}

export function inferCatalogModality(model: {
  model_name: string
  tags?: string
  supported_endpoint_types?: string[]
}): DocsConfigModality {
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
  const endpoints = (model.supported_endpoint_types ?? [])
    .join(' ')
    .toLowerCase()
  if (endpoints.includes('image')) return 'image'
  if (endpoints.includes('video')) return 'video'
  if (endpoints.includes('audio') || endpoints.includes('speech')) {
    return 'audio'
  }
  return 'text'
}

export function resolveDocsExampleModels(
  models: PricingModel[],
  configured?: DocsExampleModels
): ResolvedDocsExampleModels {
  const textModels = models.filter(
    (model) => inferCatalogModality(model) === 'text'
  )
  const imageModels = models.filter(
    (model) => inferCatalogModality(model) === 'image'
  )
  const videoModels = models.filter(
    (model) => inferCatalogModality(model) === 'video'
  )
  const audioModels = models.filter(
    (model) => inferCatalogModality(model) === 'audio'
  )

  const pickLatest = (list: PricingModel[]): string | undefined =>
    [...list]
      .map((item) => item.model_name)
      .sort((left, right) =>
        right.localeCompare(left, 'en', { numeric: true })
      )[0]

  const autoOpenAI =
    pickLatest(
      textModels.filter((item) =>
        /^(gpt|chatgpt|o[1-9])/i.test(item.model_name)
      )
    ) ??
    pickLatest(textModels) ??
    'gpt-5'

  const autoAnthropic =
    pickLatest(
      textModels.filter(
        (item) =>
          /^claude/i.test(item.model_name) ||
          (item.supported_endpoint_types ?? []).some((endpoint) =>
            endpoint.toLowerCase().includes('anthropic')
          )
      )
    ) ??
    autoOpenAI ??
    'claude-sonnet-4-6'

  const autoGemini =
    pickLatest(
      textModels.filter(
        (item) =>
          /^gemini/i.test(item.model_name) ||
          (item.supported_endpoint_types ?? []).some((endpoint) =>
            endpoint.toLowerCase().includes('gemini')
          )
      )
    ) ?? 'gemini-2.5-pro'

  const autoImage = pickLatest(imageModels) ?? 'gpt-image-1'
  const autoVideo = pickLatest(videoModels) ?? 'sora-2'
  const autoAudio = pickLatest(audioModels) ?? 'gpt-4o-mini-tts'

  return {
    openai: configured?.openai?.trim() || autoOpenAI,
    anthropic: configured?.anthropic?.trim() || autoAnthropic,
    gemini: configured?.gemini?.trim() || autoGemini,
    image: configured?.image?.trim() || autoImage,
    video: configured?.video?.trim() || autoVideo,
    audio: configured?.audio?.trim() || autoAudio,
  }
}

export function applyDocsPlaceholders(
  text: string,
  vars: { baseUrl: string; v1Url: string; model?: string }
): string {
  let output = text
    .replaceAll('{{BASE_URL}}', vars.baseUrl)
    .replaceAll('{{V1_URL}}', vars.v1Url)
  if (vars.model) {
    output = output.replaceAll('{{MODEL}}', vars.model)
  }
  return output
}

export function normalizeDocsApiEntries(
  apiInfoItems: ApiInfoItem[],
  baseUrl: string
): DocsEntryEndpoint[] {
  const root = baseUrl.replace(/\/+$/, '')
  const entries: DocsEntryEndpoint[] = []
  const seen = new Set<string>()

  for (const item of apiInfoItems) {
    const rawUrl = item.url?.trim()
    if (!rawUrl) continue
    let displayUrl = rawUrl.replace(/\/+$/, '')
    try {
      const parsed = new URL(rawUrl)
      if (!parsed.pathname || parsed.pathname === '/') {
        displayUrl = `${parsed.origin}/v1`
      }
    } catch {
      /* keep trimmed URL */
    }
    if (seen.has(displayUrl)) continue
    seen.add(displayUrl)
    entries.push({
      label: item.route?.trim() || 'API 入口',
      url: displayUrl,
      scene:
        item.description?.trim() || '兼容 OpenAI、Anthropic 与 Gemini 协议',
    })
  }

  if (entries.length > 0) return entries
  return [
    {
      label: '主站入口',
      url: `${root}/v1`,
      scene: '默认主力入口，全协议兼容',
    },
  ]
}

export function parseMarkdownSections(markdown: string): {
  intro: string
  sections: DocsMarkdownSection[]
} {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n')
  const introLines: string[] = []
  const sections: DocsMarkdownSection[] = []
  let activeSection: { id: string; title: string; lines: string[] } | null =
    null
  let inFence = false
  let fenceMarker = ''

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!inFence) {
        inFence = true
        fenceMarker = marker
      } else if (marker === fenceMarker) {
        inFence = false
        fenceMarker = ''
      }
    }

    if (!inFence) {
      const headingMatch = line.match(/^##\s+(.+?)\s*#*\s*$/)
      if (headingMatch) {
        if (activeSection) {
          sections.push({
            id: activeSection.id,
            title: activeSection.title,
            body: activeSection.lines.join('\n').trim(),
          })
        }
        activeSection = {
          id: `md-${sections.length}`,
          title: headingMatch[1].trim(),
          lines: [],
        }
        continue
      }
    }

    if (activeSection) {
      activeSection.lines.push(line)
    } else {
      introLines.push(line)
    }
  }

  if (activeSection) {
    sections.push({
      id: activeSection.id,
      title: activeSection.title,
      body: activeSection.lines.join('\n').trim(),
    })
  }

  return {
    intro: introLines.join('\n').trim(),
    sections,
  }
}

export function renderSectionsToMarkdown(
  sections: Array<{
    title: string
    paragraphs: string[]
    table?: { headers: string[]; rows: string[][] }
  }>
): string {
  const lines: string[] = []
  for (const section of sections) {
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
  return lines.join('\n').trim()
}

export function useDocsConfig() {
  return useQuery<DocsConfig>({
    queryKey: DOCS_CONFIG_QUERY_KEY,
    queryFn: async () => {
      try {
        const response = await api.get<{
          success?: boolean
          data?: unknown
        }>('/api/docs_config')
        if (response.data?.success) {
          return parseDocsConfig(response.data.data)
        }
      } catch {
        /* fall back to built-in defaults */
      }
      return {}
    },
    staleTime: 60_000,
  })
}
