import { createInstance, type ResourceLanguage } from 'i18next'
import { expect, it } from 'vitest'

const bundles = import.meta.glob<ResourceLanguage>('/src/i18n/locales/*.json', {
  import: 'default',
})

it.each([
  ['en', 'View all'],
  ['fr', 'Tout voir'],
  ['ja', 'すべて表示'],
  ['ru', 'Посмотреть все'],
  ['vi', 'Xem tất cả'],
  ['zh', '查看全部'],
  ['zh-TW', '檢視全部'],
])(
  'translates the overview key-manager link in %s without fallback',
  async (locale, label) => {
    const resource = await bundles[`/src/i18n/locales/${locale}.json`]()
    const i18n = createInstance()
    await i18n.init({
      lng: locale,
      fallbackLng: false,
      resources: { [locale]: resource },
    })
    expect(i18n.exists('View all')).toBe(true)
    expect(i18n.t('View all')).toBe(label)
  }
)
