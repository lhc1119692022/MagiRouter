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

import { isSidebarModuleEnabled } from '@/lib/nav-modules'
import { STATUS_STORAGE_KEY } from '@/lib/status-query'

function setStatus(payload: Record<string, unknown> | null) {
  if (payload === null) {
    window.localStorage.removeItem(STATUS_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(payload))
}

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

  it('treats a missing section as enabled', () => {
    setStatus({ SidebarModulesAdmin: JSON.stringify({ console: {} }) })
    expect(isSidebarModuleEnabled('chat', 'playground')).toBe(true)
  })
})
