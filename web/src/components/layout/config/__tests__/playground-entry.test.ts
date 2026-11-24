import i18next from 'i18next'
import { beforeAll, expect, it } from 'vitest'

import { buildConsoleNavigation } from '../console-navigation'

const language = i18next.createInstance()

beforeAll(async () => {
  await language.init({ lng: 'en', resources: { en: { translation: {} } } })
})

it('does not offer the authenticated workspace card to visitors', () => {
  expect(
    buildConsoleNavigation(language.t, 0)
      .flatMap((group) => group.items)
      .some((item) => item.url === '/playground')
  ).toBe(false)
})

it.each([1, 10, 100])(
  'labels the actual creative workspace separately from chat for role %i',
  (role) => {
    const items = buildConsoleNavigation(language.t, role).flatMap(
      (group) => group.items
    )
    const workspace = items.filter((item) => item.url === '/playground')

    expect(workspace.map((item) => item.title)).toEqual(['Canvas / Playground'])
    expect(items.find((item) => item.type === 'chat-presets')?.title).toBe(
      'Chat'
    )
  }
)
