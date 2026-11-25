import type { ReactNode } from 'react'

interface HighlightRange {
  start: number
  end: number
}

function findHighlightRanges(text: string, quotes: string[]): HighlightRange[] {
  const raw: HighlightRange[] = []
  for (const quote of quotes) {
    const trimmed = quote.trim()
    if (!trimmed) continue
    let offset = 0
    while (offset < text.length) {
      const idx = text.indexOf(trimmed, offset)
      if (idx === -1) break
      raw.push({ start: idx, end: idx + trimmed.length })
      offset = idx + trimmed.length
    }
  }
  if (raw.length === 0) return []
  raw.sort((a, b) => a.start - b.start || b.end - a.end)
  const merged: HighlightRange[] = [raw[0]]
  for (let index = 1; index < raw.length; index++) {
    const current = raw[index]
    const last = merged.at(-1)
    if (!last) continue
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push({ ...current })
    }
  }
  return merged
}

export function HighlightedExcerpt(props: {
  text: string
  quotes: string[]
}): ReactNode {
  const { text, quotes } = props
  if (!text) return null
  const ranges = findHighlightRanges(text, quotes)
  if (ranges.length === 0) return text
  const nodes: ReactNode[] = []
  let cursor = 0
  ranges.forEach((range) => {
    if (range.start > cursor) {
      nodes.push(text.slice(cursor, range.start))
    }
    nodes.push(
      <mark
        key={`${range.start}-${range.end}`}
        className='rounded bg-amber-200/80 px-0.5 text-amber-950 dark:bg-amber-500/30 dark:text-amber-100'
      >
        {text.slice(range.start, range.end)}
      </mark>
    )
    cursor = range.end
  })
  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }
  return nodes
}
