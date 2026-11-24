import { z } from 'zod'

const encoder = new TextEncoder()

export const officialPriceSource = z.string().refine((source) => {
  if (
    !source.startsWith('https://') ||
    /[\s\\\p{Cc}]/u.test(source) ||
    /%(?![\da-f]{2})/i.test(source) ||
    encoder.encode(source).length > 2048
  ) {
    return false
  }
  const authority = source.slice(8).split(/[/?#]/u, 1)[0]
  if (!authority || authority.includes('@')) return false
  try {
    return !!new URL(source).hostname
  } catch {
    return false
  }
})

const amount = z.number().finite().nonnegative().optional()
export const officialPrice = z
  .object({
    source_url: officialPriceSource,
    input_usd_per_million: amount,
    output_usd_per_million: amount,
    usd_per_request: amount,
  })
  .strict()
  .refine(
    (price) =>
      (price.input_usd_per_million !== undefined ||
        price.output_usd_per_million !== undefined) !==
      (price.usd_per_request !== undefined)
  )
