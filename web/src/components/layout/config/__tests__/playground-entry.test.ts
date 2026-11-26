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

it('places Profit Analysis and Media Traffic inside the admin management sidebar group only for administrators', () => {
  for (const nonAdminRole of [0, 1]) {
    const adminGroup = buildConsoleNavigation(language.t, nonAdminRole).find(
      (group) => group.id === 'admin'
    )
    expect(adminGroup).toBeUndefined()
  }

  for (const adminRole of [10, 100]) {
    const adminGroup = buildConsoleNavigation(language.t, adminRole).find(
      (group) => group.id === 'admin'
    )
    expect(adminGroup).toBeDefined()
    const urls = adminGroup?.items.map((item) => item.url) ?? []
    expect(urls).toContain('/profit-analytics')
    expect(urls).toContain('/media-traffic')
  }
})
