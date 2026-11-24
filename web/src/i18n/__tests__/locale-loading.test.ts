import { expect, it } from 'vitest'

import traditionalChinese from '../locales/zh-TW.json'

it('returns the translated settings label when switching to a lazy locale', async () => {
  const { default: i18n } = await import('../config')
  await i18n.changeLanguage('en')
  try {
    await i18n.changeLanguage('zhTW')
    expect(i18n.t('Settings')).toBe(traditionalChinese.translation.Settings)
  } finally {
    await i18n.changeLanguage('en')
  }
})
