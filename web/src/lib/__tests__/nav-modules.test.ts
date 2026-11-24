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
import { afterEach, describe, expect, it } from 'vitest'

import {
  parseHeaderNavModules as parseAdminNavigation,
  serializeHeaderNavModules,
} from '@/features/system-settings/maintenance/config'
import {
  creationDestination,
  isSidebarModuleEnabled,
  parseHeaderNavModules,
} from '@/lib/nav-modules'
import { STATUS_STORAGE_KEY } from '@/lib/status-query'

function setStatus(payload: Record<string, unknown> | null) {
  if (payload === null) {
    window.localStorage.removeItem(STATUS_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(payload))
}

describe('creation navigation destinations', () => {
  it('round-trips independent links between the administrator and the published menu', () => {
    const previous = parseAdminNavigation(
      JSON.stringify({
        console: false,
        pricing: { enabled: true, requireAuth: true },
      })
    )
    const saved = serializeHeaderNavModules({
      ...previous,
      creation: true,
      canvasUrl: '/create/canvas?preview=1',
      workbenchUrl: 'https://studio.example.test/editor',
    })
    const published = parseHeaderNavModules(saved)
    expect(published).toMatchObject({
      console: false,
      creation: true,
      canvasUrl: '/create/canvas?preview=1',
      workbenchUrl: 'https://studio.example.test/editor',
      pricing: { enabled: true, requireAuth: true },
    })
    const reopened = parseAdminNavigation(saved)
    expect(reopened.canvasUrl).toBe(published.canvasUrl)
    const cleared = parseHeaderNavModules(
      serializeHeaderNavModules({ ...reopened, canvasUrl: undefined })
    )
    expect(cleared.canvasUrl).toBeUndefined()
    expect(cleared.workbenchUrl).toBe(reopened.workbenchUrl)
  })

  it.each([
    null,
    '',
    'http://studio.example.test',
    '//studio.example.test',
    '/\\studio.example.test',
    'https:studio.example.test',
    'https://guest@studio.example.test',
    '/studio\u0001/new',
  ])('keeps an invalid or absent destination inactive: %s', (raw) => {
    expect(creationDestination(raw)).toBeUndefined()
  })
})

describe('isSidebarModuleEnabled', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('fails open when no status snapshot is cached yet', () => {
    expect(isSidebarModuleEnabled('chat', 'playground')).toBe(true)
  })

  it('fails open on blank or unparsable configuration', () => {
    setStatus({ SidebarModulesAdmin: '' })
    expect(isSidebarModuleEnabled('chat', 'playground')).toBe(true)

    setStatus({ SidebarModulesAdmin: '{not-json' })
    expect(isSidebarModuleEnabled('chat', 'playground')).toBe(true)
  })

  it('keeps Playground reachable when only the enclosing section is disabled', () => {
    // Production configuration observed on magirouter.com: the legacy `chat`
    // section is switched off, but `playground` itself was never disabled.
    setStatus({
      SidebarModulesAdmin: JSON.stringify({
        chat: { enabled: false, playground: true, chat: true },
      }),
    })

    expect(isSidebarModuleEnabled('chat', 'playground')).toBe(false)
    expect(
      isSidebarModuleEnabled('chat', 'playground', { ignoreSectionFlag: true })
    ).toBe(true)
  })

  it('still honours an explicit per-module opt-out', () => {
    setStatus({
      SidebarModulesAdmin: JSON.stringify({
        chat: { enabled: true, playground: false },
      }),
    })

    expect(
      isSidebarModuleEnabled('chat', 'playground', { ignoreSectionFlag: true })
    ).toBe(false)
  })

  it.each(['false', 0, '0'])(
    'recognizes the legacy Playground opt-out %s independently of its chat section',
    (off) => {
      setStatus({
        SidebarModulesAdmin: JSON.stringify({
          chat: { enabled: true, playground: off },
        }),
      })
      expect(
        isSidebarModuleEnabled('chat', 'playground', {
          ignoreSectionFlag: true,
        })
      ).toBe(false)
    }
  )

  it('treats a missing section as enabled', () => {
    setStatus({ SidebarModulesAdmin: JSON.stringify({ console: {} }) })
    expect(isSidebarModuleEnabled('chat', 'playground')).toBe(true)
  })
})
