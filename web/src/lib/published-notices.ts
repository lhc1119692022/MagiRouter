import { formatDateTimeStr } from '@/lib/format'

export const MAX_NOTICE_IMAGES = 4
export const MAX_NOTICE_IMAGE_URL_LENGTH = 2048
export const MAX_NOTICE_IMAGE_DATA_URL_LENGTH = 750 * 1024

export const NOTICE_CATEGORIES = [
  'announcement',
  'model',
  'group',
  'price',
] as const
export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number]
export const NOTICE_CATEGORY_LABELS: Record<NoticeCategory, string> = {
  announcement: 'Site notices',
  model: 'Model changes',
  group: 'Group changes',
  price: 'Price changes',
}

export type NoticeTone =
  | 'announcement'
  | 'model'
  | 'group'
  | 'price'
  | 'success'
  | 'warning'
  | 'error'
  | 'ongoing'

interface NoticeFields {
  id?: unknown
  category?: unknown
  kindLabel?: unknown
  type?: unknown
  title?: unknown
  content?: unknown
  images?: unknown
  extra?: unknown
  source?: unknown
  publishDate?: unknown
}

const LEGACY_AUTO_SYNC_EXTRA = new Set([
  '后台管理自动同步',
  'Auto-synced from admin',
])

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function noticeExtra(record?: NoticeFields | null): string {
  if (!record) return ''
  const extra = readText(record.extra)
  if (
    extra &&
    readText(record.source) === 'auto_model_sync' &&
    LEGACY_AUTO_SYNC_EXTRA.has(extra)
  ) {
    return ''
  }
  return extra
}

export function isValidNoticeImageSource(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }
  if (
    /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(
      trimmed
    )
  ) {
    return trimmed.length <= MAX_NOTICE_IMAGE_DATA_URL_LENGTH
  }
  if (trimmed.length > MAX_NOTICE_IMAGE_URL_LENGTH || /\s/.test(trimmed)) {
    return false
  }
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//')
  }
  try {
    const parsed = new URL(trimmed)
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.hostname.length > 0 &&
      !parsed.username &&
      !parsed.password
    )
  } catch {
    return false
  }
}

export function extractNoticeImages(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const images: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!isValidNoticeImageSource(trimmed)) continue
    images.push(trimmed)
    if (images.length >= MAX_NOTICE_IMAGES) break
  }
  return images
}

export function parseNoticeImagesOption(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return extractNoticeImages(raw)
  }
  if (typeof raw !== 'string') {
    return []
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return []
  }
  try {
    return extractNoticeImages(JSON.parse(trimmed))
  } catch {
    return []
  }
}

export function noticeCategory(record: NoticeFields): NoticeCategory {
  const category = record.category ?? record.type
  if (
    category === 'announcement' ||
    category === 'model' ||
    category === 'group' ||
    category === 'price'
  ) {
    return category
  }
  const text = [record.title, record.content, record.extra]
    .map(readText)
    .join(' ')
  if (/price|pricing|billing|价格|降价|费率|计费/i.test(text)) return 'price'
  if (/group|分组|倍率|渠道/i.test(text)) return 'group'
  if (/model|模型|上架|下架|gpt|claude|gemini|seedance/i.test(text)) {
    return 'model'
  }
  return 'announcement'
}

export function noticeTone(
  record: NoticeFields,
  category: NoticeCategory = noticeCategory(record)
): NoticeTone {
  const type = readText(record.type).toLowerCase()
  if (
    type === 'success' ||
    type === 'warning' ||
    type === 'error' ||
    type === 'ongoing'
  ) {
    return type
  }
  const hint = [record.kindLabel, record.title].map(readText).join(' ')
  if (/下线|下架|停用|暂停|offline|deprecat|remov/i.test(hint)) {
    return 'warning'
  }
  if (/上线|上架|新增|发布|launch|online/i.test(hint)) {
    return 'success'
  }
  return category
}

export function publishedNotices<T extends NoticeFields>(records: T[]) {
  return records
    .flatMap((record, index) => {
      if (!record || typeof record !== 'object') return []
      const label = readText(record.title)
      const content = readText(record.content)
      const extra = noticeExtra(record)
      const images = extractNoticeImages(record.images)
      const [firstLine, ...remaining] = content.split(/\r?\n/)
      const title = label || firstLine || extra
      if (!title) return []
      const description = [label ? content : remaining.join('\n'), extra]
        .filter((part) => part && part !== title)
        .join('\n')
      const date = readText(record.publishDate)
      const timestamp = Date.parse(date)
      const localDate =
        Number.isFinite(timestamp) && date.includes('T')
          ? formatDateTimeStr(new Date(timestamp))
          : date
      const category = noticeCategory(record)
      return [
        {
          id: `${record.id ?? index}-${date}-${index}`,
          title,
          description,
          images,
          category,
          tone: noticeTone(record, category),
          kindLabel: readText(record.kindLabel),
          date,
          dateLabel: localDate.slice(0, 10),
          timeLabel: localDate.slice(11, 16),
          timestamp: Number.isFinite(timestamp) ? timestamp : -Infinity,
          record,
        },
      ]
    })
    .sort((first, second) => second.timestamp - first.timestamp)
}
