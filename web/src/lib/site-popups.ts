export const SITE_POPUPS_OPTION_KEY = 'console_setting.site_popups'

export const SITE_POPUP_TRIGGERS = [
  'sign_up',
  'console',
  'sign_in',
  'home',
] as const

export const SITE_POPUP_FREQUENCIES = [
  'once',
  'daily',
  'session',
  'always',
] as const

export const SITE_POPUP_TONES = ['info', 'warning', 'notice'] as const

export type SitePopupTrigger = (typeof SITE_POPUP_TRIGGERS)[number]
export type SitePopupFrequency = (typeof SITE_POPUP_FREQUENCIES)[number]
export type SitePopupTone = (typeof SITE_POPUP_TONES)[number]

export interface SitePopupItem {
  id: string
  enabled: boolean
  trigger: SitePopupTrigger
  title: string
  content: string
  tone: SitePopupTone
  confirm_text?: string
  frequency: SitePopupFrequency
  require_confirm?: boolean
  checkbox_label?: string
  version: number
}

const POPUP_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/
const VALID_TRIGGERS = new Set<string>(SITE_POPUP_TRIGGERS)
const VALID_FREQUENCIES = new Set<string>(SITE_POPUP_FREQUENCIES)
const VALID_TONES = new Set<string>(SITE_POPUP_TONES)
const DAILY_MS = 24 * 60 * 60 * 1000

export const SITE_POPUP_PRESETS: Record<
  'sign_up_qq' | 'console_disclaimer',
  SitePopupItem
> = {
  sign_up_qq: {
    id: 'sign-up-qq-only',
    enabled: true,
    trigger: 'sign_up',
    title: '新站启航 · 注册提示',
    content:
      '欢迎体验本站！目前新站启航阶段仅支持 **QQ 邮箱（`@qq.com`）** 注册账号，后续将逐步开放更多邮箱服务商。请使用有效 QQ 邮箱完成验证。',
    tone: 'info',
    confirm_text: '我知道了',
    frequency: 'session',
    require_confirm: false,
    version: 1,
  },
  console_disclaimer: {
    id: 'console-disclaimer',
    enabled: true,
    trigger: 'console',
    title: '控制台使用须知与免责声明',
    content:
      '1. 本平台仅提供合规的 AI 模型接口中转与路由调度服务，请严格遵守所在地区法律法规与上游模型厂商的使用规范。\n2. 请妥善保管您的 API 密钥，切勿泄露或用于任何违法违规用途；因密钥泄露或违规调用产生的费用及法律责任由账户持有人自行承担。\n3. 上游模型服务可能存在限流、波动或临时维护，请做好业务侧重试与容灾处理。',
    tone: 'warning',
    confirm_text: '同意并进入控制台',
    frequency: 'once',
    require_confirm: true,
    checkbox_label: '我已阅读并同意上述使用须知与免责声明',
    version: 1,
  },
}

export function isValidSitePopupId(value: string): boolean {
  return POPUP_ID_PATTERN.test(value.trim())
}

export function parseSitePopups(raw: unknown): SitePopupItem[] {
  let source: unknown = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed || trimmed === '[]') return []
    try {
      source = JSON.parse(trimmed)
    } catch {
      return []
    }
  }
  if (!Array.isArray(source)) return []
  const result: SitePopupItem[] = []
  const seen = new Set<string>()
  for (const entry of source) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const item = entry as Record<string, unknown>
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    const trigger = typeof item.trigger === 'string' ? item.trigger.trim() : ''
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    const content = typeof item.content === 'string' ? item.content.trim() : ''
    if (
      !POPUP_ID_PATTERN.test(id) ||
      seen.has(id) ||
      !VALID_TRIGGERS.has(trigger) ||
      !title ||
      !content
    ) {
      continue
    }
    seen.add(id)
    const rawTone = typeof item.tone === 'string' ? item.tone.trim() : ''
    const tone: SitePopupTone = VALID_TONES.has(rawTone)
      ? (rawTone as SitePopupTone)
      : 'info'
    const rawFreq =
      typeof item.frequency === 'string' ? item.frequency.trim() : ''
    const frequency: SitePopupFrequency = VALID_FREQUENCIES.has(rawFreq)
      ? (rawFreq as SitePopupFrequency)
      : 'once'
    const confirmText =
      typeof item.confirm_text === 'string' ? item.confirm_text.trim() : ''
    const checkboxLabel =
      typeof item.checkbox_label === 'string' ? item.checkbox_label.trim() : ''
    const version =
      typeof item.version === 'number' &&
      Number.isInteger(item.version) &&
      item.version > 0
        ? item.version
        : 1
    result.push({
      id,
      enabled: item.enabled === true,
      trigger: trigger as SitePopupTrigger,
      title,
      content,
      tone,
      ...(confirmText ? { confirm_text: confirmText } : {}),
      frequency,
      ...(item.require_confirm === true ? { require_confirm: true } : {}),
      ...(checkboxLabel ? { checkbox_label: checkboxLabel } : {}),
      version,
    })
    if (result.length >= 12) break
  }
  return result
}

export function serializeSitePopups(items: SitePopupItem[]): string {
  const normalized = parseSitePopups(items)
  return normalized.length === 0 ? '[]' : JSON.stringify(normalized)
}

export function getSitePopupFingerprint(popup: SitePopupItem): string {
  const input = `${popup.version}|${popup.title}|${popup.content}|${popup.checkbox_label ?? ''}`
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `v${popup.version}-${(hash >>> 0).toString(16)}`
}

function buildStorageKey(
  prefix: string,
  scope: string,
  popupId: string
): string {
  return `${prefix}:${scope}:${popupId}`
}

export function shouldShowSitePopup(
  popup: SitePopupItem,
  scope: string,
  now = Date.now()
): boolean {
  if (!popup.enabled) return false
  if (popup.frequency === 'always') return true

  const fingerprint = getSitePopupFingerprint(popup)
  try {
    if (popup.frequency === 'session') {
      const stored = window.sessionStorage.getItem(
        buildStorageKey('mr_site_popup_session', scope, popup.id)
      )
      return stored !== fingerprint
    }
    const raw = window.localStorage.getItem(
      buildStorageKey('mr_site_popup', scope, popup.id)
    )
    if (!raw) return true
    const parsed = JSON.parse(raw) as { fp?: string; at?: number }
    if (parsed.fp !== fingerprint) return true
    if (popup.frequency === 'daily') {
      return typeof parsed.at !== 'number' || now - parsed.at >= DAILY_MS
    }
    return false
  } catch {
    return true
  }
}

export function markSitePopupAcknowledged(
  popup: SitePopupItem,
  scope: string,
  now = Date.now()
): void {
  if (popup.frequency === 'always') return
  const fingerprint = getSitePopupFingerprint(popup)
  try {
    if (popup.frequency === 'session') {
      window.sessionStorage.setItem(
        buildStorageKey('mr_site_popup_session', scope, popup.id),
        fingerprint
      )
      return
    }
    window.localStorage.setItem(
      buildStorageKey('mr_site_popup', scope, popup.id),
      JSON.stringify({ fp: fingerprint, at: now })
    )
  } catch {
    /* ignore storage failures */
  }
}
