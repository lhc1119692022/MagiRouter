import { isHttpUrl } from '@/lib/content-format'

export function getDocumentationLink(value: unknown): {
  href: string
  external?: boolean
  search?: { doc: string }
  hash?: string
} {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (/^\/docs\/?(?:[?#]|$)/.test(raw)) {
    const url = new URL(raw, 'https://docs.invalid')
    const doc = url.searchParams.get('doc')
    return {
      href: '/docs',
      ...(doc && { search: { doc } }),
      ...(url.hash && { hash: url.hash.slice(1) }),
    }
  }
  if (isHttpUrl(raw) && !/^https:\/\/docs\.newapi\.pro\/?$/i.test(raw)) {
    const url = new URL(raw)
    if (!url.username && !url.password) return { href: raw, external: true }
  }
  return { href: '/docs' }
}
