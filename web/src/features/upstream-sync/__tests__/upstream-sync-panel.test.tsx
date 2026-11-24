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
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UpstreamSyncPanel } from '../upstream-sync-panel'
import type { useUpstreamSync } from '../use-upstream-sync'

let syncState: ReturnType<typeof useUpstreamSync>

vi.mock('../use-upstream-sync', () => ({
  useUpstreamSync: () => syncState,
}))

function commit(sha: string, message: string) {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    message,
    authorName: 'maintainer',
    authoredAt: '2026-11-20T10:00:00Z',
  }
}

function state(
  overrides: Partial<ReturnType<typeof useUpstreamSync>>
): ReturnType<typeof useUpstreamSync> {
  return {
    enabled: true,
    meta: {
      version: 'v1.0.0-rc.51',
      commit: 'abcdef1234',
      upstreamBase: '1234567890',
    },
    commits: [],
    latest: null,
    gap: { count: 0, matched: true },
    state: 'up-to-date',
    error: null,
    loading: false,
    refreshing: false,
    checkedAt: null,
    refresh: vi.fn(),
    ...overrides,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('UpstreamSyncPanel', () => {
  it('lists the upstream commits that a deployed build is missing', () => {
    const commits = [
      commit('aaaaaaa1111', 'feat: one'),
      commit('bbbbbbb2222', 'fix: two'),
      commit('ccccccc3333', 'docs: three'),
    ]
    syncState = state({
      commits,
      latest: commit('ddddddd4444', 'chore: upstream head'),
      gap: { count: 3, matched: false },
      state: 'behind',
    })

    render(<UpstreamSyncPanel />)

    expect(
      screen.getByText('More than 3 upstream commits not merged yet')
    ).toBeInTheDocument()
    expect(screen.getByText('feat: one')).toBeInTheDocument()
    expect(screen.getByText('fix: two')).toBeInTheDocument()
    expect(screen.getByText('docs: three')).toBeInTheDocument()
    expect(screen.getByText('chore: upstream head')).toBeInTheDocument()
    expect(screen.getAllByText('abcdef1').length).toBeGreaterThan(0)
  })

  it('confirms a build that already contains upstream head', () => {
    syncState = state({})

    render(<UpstreamSyncPanel />)

    expect(screen.getByText('Up to date with upstream')).toBeInTheDocument()
    expect(
      screen.queryByText(/upstream commits not merged yet/)
    ).not.toBeInTheDocument()
  })

  it('explains that an unstamped build cannot be compared', () => {
    syncState = state({
      meta: { version: 'v1.0.0-rc.51', commit: null, upstreamBase: null },
      gap: { count: 0, matched: false },
      state: 'unknown',
    })

    render(<UpstreamSyncPanel />)

    expect(screen.getByText('not stamped')).toBeInTheDocument()
    expect(screen.getByText('not recorded')).toBeInTheDocument()
    expect(
      screen.getByText(
        'This build does not record an upstream base, so the gap cannot be measured.'
      )
    ).toBeInTheDocument()
  })

  it('renders nothing for non-admin viewers', () => {
    syncState = state({ enabled: false })

    const { container } = render(<UpstreamSyncPanel />)

    expect(container).toBeEmptyDOMElement()
  })
})
