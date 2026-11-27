import { expect, it } from 'vitest'

import simplifiedChinese from '../locales/zh.json'

it('returns the translated settings label when switching between supported locales', async () => {
  const { default: i18n } = await import('../config')
  await i18n.changeLanguage('en')
  try {
    await i18n.changeLanguage('zhCN')
    expect(i18n.t('Settings')).toBe(simplifiedChinese.translation.Settings)
  } finally {
    await i18n.changeLanguage('en')
  }
})
