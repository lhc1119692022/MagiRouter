import { expect, test } from 'vitest'

import {
  parsePricingBannerConfig,
  resolveShowcaseMediaKind,
  serializePricingBannerConfig,
} from '../lib/banner-config'

test('parses valid slides, drops unsafe URLs, and infers image vs video media', () => {
  const parsed = parsePricingBannerConfig([
    {
      title: '  特惠横幅  ',
      subtitle: '低倍率直连',
      cta_label: '立即体验',
      cta_href: '/playground',
      media_url: 'https://cdn.example.test/loop.mp4',
    },
    {
      title: '不安全链接会被剔除',
      cta_href: 'javascript:alert(1)',
      media_url: '//evil.example/a.png',
    },
    {
      title: '   ',
    },
  ])

  expect(parsed).toHaveLength(2)
  expect(parsed[0]).toEqual({
    title: '特惠横幅',
    subtitle: '低倍率直连',
    cta_label: '立即体验',
    cta_href: '/playground',
    media_url: 'https://cdn.example.test/loop.mp4',
    media_type: undefined,
    poster_url: undefined,
  })
  expect(resolveShowcaseMediaKind(parsed[0].media_url)).toBe('video')
  expect(parsed[1].cta_href).toBeUndefined()
  expect(parsed[1].media_url).toBeUndefined()

  expect(JSON.parse(serializePricingBannerConfig(parsed))).toEqual([
    {
      title: '特惠横幅',
      subtitle: '低倍率直连',
      cta_label: '立即体验',
      cta_href: '/playground',
      media_url: 'https://cdn.example.test/loop.mp4',
    },
    {
      title: '不安全链接会被剔除',
    },
  ])
})
