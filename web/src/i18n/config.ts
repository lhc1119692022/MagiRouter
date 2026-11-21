/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import { convertDetectedLanguage } from './languages'
import en from './locales/en.json'
import zhCN from './locales/zh.json'

/**
 * Only the two primary locales ship in the initial bundle.
 *
 * Every other locale is a ~560–830 KB JSON document; bundling all seven
 * eagerly added megabytes to the first paint for users who will never switch
 * language. They are now fetched on demand, both for a detected browser
 * language and for an explicit switch in the language menu.
 */
const LAZY_LOCALES: Record<string, () => Promise<{ default: object }>> = {
  fr: () => import('./locales/fr.json'),
  ja: () => import('./locales/ja.json'),
  ru: () => import('./locales/ru.json'),
  vi: () => import('./locales/vi.json'),
  zhTW: () => import('./locales/zh-TW.json'),
}

export const resources = {
  en,
  zhCN,
} as const

const inflight = new Map<string, Promise<void>>()

async function ensureLocale(lng: string) {
  const base = lng.split('-')[0]
  const code = LAZY_LOCALES[lng] ? lng : base
  const loader = LAZY_LOCALES[code]
  if (!loader || i18n.hasResourceBundle(code, 'translation')) return

  const existing = inflight.get(code)
  if (existing) return existing

  const task = loader()
    .then((module) => {
      i18n.addResourceBundle(
        code,
        'translation',
        module.default,
        true,
        true
      )
      // The detected language may still be sitting on the fallback while the
      // bundle downloads; re-apply it so the UI switches over in place.
      if (i18n.language === code) {
        void i18n.changeLanguage(code)
      }
    })
    .catch(() => {
      // A failed locale chunk keeps the English fallback; never block boot.
    })
    .finally(() => {
      inflight.delete(code)
    })

  inflight.set(code, task)
  return task
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'zhCN', 'fr', 'ru', 'ja', 'vi', 'zhTW'],
    load: 'currentOnly',
    nsSeparator: false, // Allow literal colons in keys (e.g., URLs, labels)
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      // Browsers report `zh-CN`/`zh-TW`/`zh`; map them onto our `zhCN`/`zhTW`
      // codes (non-Chinese codes pass through for normal supportedLngs matching).
      convertDetectedLanguage,
    },
  })

i18n.on('languageChanged', (lng) => {
  void ensureLocale(lng)
})
void ensureLocale(i18n.language)

export default i18n
