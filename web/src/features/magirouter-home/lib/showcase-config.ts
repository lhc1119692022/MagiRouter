export type CapabilityKey = 'text' | 'image' | 'video' | 'audio'
export type ShowcaseMediaType = 'auto' | 'image' | 'video'
export type ShowcasePlaygroundMode = 'chat' | 'image' | 'video' | 'audio'

export interface HomeShowcaseItem {
  eyebrow?: string
  title?: string
  description?: string
  media_url?: string
  media_type?: ShowcaseMediaType
  poster_url?: string
  models?: string[]
  explore_label?: string
}

export type HomeShowcaseConfig = Partial<
  Record<CapabilityKey, HomeShowcaseItem>
>

export const HOME_SHOWCASE_OPTION_KEY = 'console_setting.home_showcase'
export const SHOWCASE_CAPABILITY_KEYS: readonly CapabilityKey[] = [
  'text',
  'image',
  'video',
  'audio',
] as const

export interface ShowcaseTabDefaults {
  key: CapabilityKey
  playgroundMode: ShowcasePlaygroundMode
  eyebrow: string
  title: string
  description: string
  preferredModels: string[]
}

export const DEFAULT_SHOWCASE_TABS: Record<CapabilityKey, ShowcaseTabDefaults> =
  {
    text: {
      key: 'text',
      playgroundMode: 'chat',
      eyebrow: 'LANGUAGE MODELS · OPENAI RESPONSES',
      title: '同一把密钥，直连全球旗舰对话与推理模型',
      description:
        '原生支持 OpenAI Responses、Anthropic Messages 与 Gemini 协议，兼顾代码生成、深度推理与智能体工作流。',
      preferredModels: [
        'gpt-6.2-sol',
        'claude-opus-5.5',
        'gemini-4-hydrogen',
        'deepseek-v4.1-flash',
      ],
    },
    image: {
      key: 'image',
      playgroundMode: 'image',
      eyebrow: 'IMAGE GENERATION & EDITING',
      title: '商业级文生图、图生图与精细局部重绘',
      description:
        '聚合全球顶尖图像模型，精准掌控光影质感、排版文字与参考图一致性，一键进入 Playground 实测出图效果。',
      preferredModels: [
        'gpt-image-2.5',
        'nano-banana-2',
        'seedream-5.5',
        'flux-3-klein',
      ],
    },
    video: {
      key: 'video',
      playgroundMode: 'video',
      eyebrow: 'CINEMATIC VIDEO GENERATION',
      title: '电影级文生视频、首尾帧控制与音画同步',
      description:
        '统一异步任务接口接入主流视频大模型，支持高清镜头运动、多图参考驱动与异常自动退费。',
      preferredModels: ['seedance-2.5', 'kling-4.0', 'veo-3.1', 'minimax-h3'],
    },
    audio: {
      key: 'audio',
      playgroundMode: 'audio',
      eyebrow: 'SPEECH SYNTHESIS & TRANSCRIPTION',
      title: '超拟真语音合成、多语种转写与低延迟音频流',
      description:
        '覆盖 TTS 语音合成、高精度 STT 识别与音频配音生成，适配实时语音助手与内容创作工作流。',
      preferredModels: ['gpt-audio-1.5', 'whisper-1'],
    },
  }

const VIDEO_EXTENSION_PATTERN = /\.(mp4|webm|mov|m4v|ogv)(?:[?#].*)?$/i

export function isSafeShowcaseMediaUrl(raw?: string): boolean {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return true
  if (
    trimmed.length > 2048 ||
    trimmed.includes('\\') ||
    /[\s\p{Cc}]/u.test(trimmed)
  ) {
    return false
  }
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//')
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.username || parsed.password || !parsed.hostname) return false
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function resolveShowcaseMediaKind(
  mediaUrl?: string,
  mediaType?: ShowcaseMediaType
): 'image' | 'video' | null {
  const trimmed = (mediaUrl ?? '').trim()
  if (!trimmed || !isSafeShowcaseMediaUrl(trimmed)) return null
  if (mediaType === 'video') return 'video'
  if (mediaType === 'image') return 'image'
  return VIDEO_EXTENSION_PATTERN.test(trimmed) ? 'video' : 'image'
}

function normalizeMediaType(value: unknown): ShowcaseMediaType | undefined {
  if (value === 'auto' || value === 'image' || value === 'video') {
    return value
  }
  return undefined
}

function normalizeString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return [...trimmed].slice(0, maxLen).join('')
}

function normalizeModels(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const cleaned: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed || cleaned.includes(trimmed)) continue
    cleaned.push(trimmed)
    if (cleaned.length >= 8) break
  }
  return cleaned.length > 0 ? cleaned : undefined
}

export function parseHomeShowcaseConfig(raw: unknown): HomeShowcaseConfig {
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
  const parsed: HomeShowcaseConfig = {}
  for (const key of SHOWCASE_CAPABILITY_KEYS) {
    const entry = record[key]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const fields = entry as Record<string, unknown>
    const mediaUrl = normalizeString(fields.media_url, 2048)
    const posterUrl = normalizeString(fields.poster_url, 2048)
    const item: HomeShowcaseItem = {
      eyebrow: normalizeString(fields.eyebrow, 80),
      title: normalizeString(fields.title, 120),
      description: normalizeString(fields.description, 400),
      media_url:
        mediaUrl && isSafeShowcaseMediaUrl(mediaUrl) ? mediaUrl : undefined,
      media_type: normalizeMediaType(fields.media_type),
      poster_url:
        posterUrl && isSafeShowcaseMediaUrl(posterUrl) ? posterUrl : undefined,
      models: normalizeModels(fields.models),
      explore_label: normalizeString(fields.explore_label, 40),
    }
    if (Object.values(item).some((val) => val !== undefined)) {
      parsed[key] = item
    }
  }
  return parsed
}

export function serializeHomeShowcaseConfig(
  config: HomeShowcaseConfig
): string {
  const cleaned: HomeShowcaseConfig = {}
  for (const key of SHOWCASE_CAPABILITY_KEYS) {
    const item = config[key]
    if (!item) continue
    const next: HomeShowcaseItem = {}
    if (item.eyebrow?.trim()) next.eyebrow = item.eyebrow.trim()
    if (item.title?.trim()) next.title = item.title.trim()
    if (item.description?.trim()) next.description = item.description.trim()
    if (item.media_url?.trim()) next.media_url = item.media_url.trim()
    if (item.media_type && item.media_type !== 'auto') {
      next.media_type = item.media_type
    }
    if (item.poster_url?.trim()) next.poster_url = item.poster_url.trim()
    const models = (item.models ?? [])
      .map((name) => name.trim())
      .filter((name, idx, arr) => Boolean(name) && arr.indexOf(name) === idx)
      .slice(0, 8)
    if (models.length > 0) next.models = models
    if (item.explore_label?.trim()) {
      next.explore_label = item.explore_label.trim()
    }
    if (Object.keys(next).length > 0) {
      cleaned[key] = next
    }
  }
  return JSON.stringify(cleaned)
}
