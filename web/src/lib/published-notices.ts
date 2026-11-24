import { formatDateTimeStr } from '@/lib/format'

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

interface NoticeFields {
  id?: unknown
  category?: unknown
  kindLabel?: unknown
  type?: unknown
  title?: unknown
  content?: unknown
  extra?: unknown
  publishDate?: unknown
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
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

export function publishedNotices<T extends NoticeFields>(records: T[]) {
  return records
    .flatMap((record, index) => {
      if (!record || typeof record !== 'object') return []
      const label = readText(record.title)
      const content = readText(record.content)
      const extra = readText(record.extra)
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
      return [
        {
          id: `${record.id ?? index}-${date}-${index}`,
          title,
          description,
          category: noticeCategory(record),
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
