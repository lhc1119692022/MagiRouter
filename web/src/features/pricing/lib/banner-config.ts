import {
  isSafeShowcaseMediaUrl,
  resolveShowcaseMediaKind,
  type ShowcaseMediaType,
} from '@/features/magirouter-home/lib/showcase-config'

export const PRICING_BANNER_OPTION_KEY = 'console_setting.pricing_banner'
export const MAX_PRICING_BANNER_SLIDES = 8

export interface PricingBannerSlideConfig {
  title: string
  subtitle?: string
  cta_label?: string
  cta_href?: string
  media_url?: string
  media_type?: ShowcaseMediaType
  poster_url?: string
}

function normalizeText(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return [...trimmed].slice(0, maxLen).join('')
}

function normalizeMediaType(value: unknown): ShowcaseMediaType | undefined {
  if (value === 'auto' || value === 'image' || value === 'video') {
    return value
  }
  return undefined
}

export function parsePricingBannerConfig(
  raw: unknown
): PricingBannerSlideConfig[] {
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
  const slides: PricingBannerSlideConfig[] = []
  for (const entry of source) {
    if (slides.length >= MAX_PRICING_BANNER_SLIDES) break
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const fields = entry as Record<string, unknown>
    const title = normalizeText(fields.title, 120)
    if (!title) continue
    const ctaHref = normalizeText(fields.cta_href, 2048)
    const mediaUrl = normalizeText(fields.media_url, 2048)
    const posterUrl = normalizeText(fields.poster_url, 2048)
    slides.push({
      title,
      subtitle: normalizeText(fields.subtitle, 300),
      cta_label: normalizeText(fields.cta_label, 40),
      cta_href:
        ctaHref && isSafeShowcaseMediaUrl(ctaHref) ? ctaHref : undefined,
      media_url:
        mediaUrl && isSafeShowcaseMediaUrl(mediaUrl) ? mediaUrl : undefined,
      media_type: normalizeMediaType(fields.media_type),
      poster_url:
        posterUrl && isSafeShowcaseMediaUrl(posterUrl) ? posterUrl : undefined,
    })
  }
  return slides
}

export function serializePricingBannerConfig(
  slides: PricingBannerSlideConfig[]
): string {
  const cleaned = slides
    .slice(0, MAX_PRICING_BANNER_SLIDES)
    .map((slide) => {
      const next: PricingBannerSlideConfig = {
        title: slide.title.trim(),
      }
      if (slide.subtitle?.trim()) next.subtitle = slide.subtitle.trim()
      if (slide.cta_label?.trim()) next.cta_label = slide.cta_label.trim()
      if (slide.cta_href?.trim()) next.cta_href = slide.cta_href.trim()
      if (slide.media_url?.trim()) next.media_url = slide.media_url.trim()
      if (slide.media_type && slide.media_type !== 'auto') {
        next.media_type = slide.media_type
      }
      if (slide.poster_url?.trim()) next.poster_url = slide.poster_url.trim()
      return next
    })
    .filter((slide) => Boolean(slide.title))
  return JSON.stringify(cleaned)
}

export { isSafeShowcaseMediaUrl, resolveShowcaseMediaKind }
