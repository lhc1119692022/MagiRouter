export interface QuickCostMetrics {
  costRatio: number
  costRatioPercent: number
  grossMarginPercent: number
  spread: number
}

export function roundDecimal(value: number, precision = 6): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** precision
  const rounded = Math.round(value * factor) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}

export function formatEditableDecimal(
  value: number | null | undefined,
  precision = 6
): string {
  if (value == null || !Number.isFinite(value)) return ''
  const rounded = roundDecimal(value, precision)
  if (rounded === 0) return '0'
  return rounded.toFixed(precision).replace(/\.?0+$/, '')
}

export function formatSignedDecimal(value: number, precision = 6): string {
  const rounded = roundDecimal(value, precision)
  const absText = formatEditableDecimal(Math.abs(rounded), precision)
  if (rounded > 0) return `+${absText}`
  if (rounded < 0) return `-${absText}`
  return '0'
}

export function computeQuickCostMetrics(
  upstreamText: string,
  platformText: string
): QuickCostMetrics | null {
  const upstreamTrimmed = upstreamText.trim()
  const platformTrimmed = platformText.trim()
  if (!upstreamTrimmed || !platformTrimmed) return null

  const upstream = Number(upstreamTrimmed)
  const platform = Number(platformTrimmed)
  if (
    !Number.isFinite(upstream) ||
    !Number.isFinite(platform) ||
    upstream < 0 ||
    platform <= 0
  ) {
    return null
  }

  const costRatio = roundDecimal(upstream / platform, 6)
  const costRatioPercent = roundDecimal(costRatio * 100, 2)
  const grossMarginPercent = roundDecimal(
    ((platform - upstream) / platform) * 100,
    2
  )
  const spread = roundDecimal(platform - upstream, 6)

  return {
    costRatio,
    costRatioPercent,
    grossMarginPercent,
    spread,
  }
}
