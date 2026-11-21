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
import { describe, expect, it } from 'vitest'

import {
  countCommitsSince,
  describeSyncState,
  parseBuildMeta,
  type UpstreamCommit,
} from '../lib'

function commit(sha: string, message = `commit ${sha}`): UpstreamCommit {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    message,
    authorName: 'tester',
    authoredAt: '2026-11-20T10:00:00Z',
  }
}

describe('parseBuildMeta', () => {
  it('reads commit and upstream base from the version metadata', () => {
    expect(
      parseBuildMeta('v1.0.0-rc.51+sha.abc1234.up.def5678')
    ).toEqual({
      version: 'v1.0.0-rc.51',
      commit: 'abc1234',
      upstreamBase: 'def5678',
    })
  })

  it('accepts full length hashes and normalises case', () => {
    const meta = parseBuildMeta(
      'v1.0.0-rc.51+sha.ABCDEF1234567890ABCDEF1234567890ABCDEF12.up.1234567'
    )
    expect(meta?.commit).toBe('abcdef1234567890abcdef1234567890abcdef12')
    expect(meta?.upstreamBase).toBe('1234567')
  })

  it('keeps a version without build metadata usable', () => {
    expect(parseBuildMeta('v1.0.0-rc.51')).toEqual({
      version: 'v1.0.0-rc.51',
      commit: null,
      upstreamBase: null,
    })
  })

  it('returns null for blank or missing versions', () => {
    expect(parseBuildMeta('')).toBeNull()
    expect(parseBuildMeta('   ')).toBeNull()
    expect(parseBuildMeta(null)).toBeNull()
    expect(parseBuildMeta(undefined)).toBeNull()
  })

  it('ignores malformed metadata instead of throwing', () => {
    expect(parseBuildMeta('v1.0.0-rc.51+sha.')).toEqual({
      version: 'v1.0.0-rc.51',
      commit: null,
      upstreamBase: null,
    })
    expect(parseBuildMeta('v1.0.0-rc.51+sha.zzzzzzz')).toEqual({
      version: 'v1.0.0-rc.51',
      commit: null,
      upstreamBase: null,
    })
  })
})

describe('countCommitsSince', () => {
  it('counts the commits above the recorded upstream base', () => {
    const commits = [commit('aaaaaaa'), commit('bbbbbbb'), commit('ccccccc')]
    expect(countCommitsSince(commits, 'ccccccc')).toEqual({
      count: 2,
      matched: true,
    })
  })

  it('treats the head of the list as up to date', () => {
    const commits = [commit('aaaaaaa'), commit('bbbbbbb')]
    expect(countCommitsSince(commits, 'aaaaaaa')).toEqual({
      count: 0,
      matched: true,
    })
  })

  it('matches a long base against a short commit hash', () => {
    const commits = [commit('aaaaaaa1111'), commit('bbbbbbb2222')]
    expect(countCommitsSince(commits, 'bbbbbbb2222ffffff')).toEqual({
      count: 1,
      matched: true,
    })
  })

  it('reports an unmatched base so the caller can show a floor', () => {
    const commits = [commit('aaaaaaa'), commit('bbbbbbb')]
    expect(countCommitsSince(commits, 'ffffff0')).toEqual({
      count: 2,
      matched: false,
    })
  })

  it('cannot count without a base or without commits', () => {
    expect(countCommitsSince([commit('aaaaaaa')], null)).toEqual({
      count: 0,
      matched: false,
    })
    expect(countCommitsSince([], 'aaaaaaa')).toEqual({
      count: 0,
      matched: false,
    })
  })
})

describe('describeSyncState', () => {
  it('marks a deployed commit that is already current', () => {
    expect(
      describeSyncState({ count: 0, matched: true, base: 'aaaaaaa' })
    ).toBe('up-to-date')
  })

  it('marks a deployed commit with newer upstream commits as behind', () => {
    expect(
      describeSyncState({ count: 4, matched: true, base: 'aaaaaaa' })
    ).toBe('behind')
  })

  it('marks an unknown base as unknown', () => {
    expect(describeSyncState({ count: 0, matched: false, base: null })).toBe(
      'unknown'
    )
    expect(
      describeSyncState({ count: 100, matched: false, base: 'aaaaaaa' })
    ).toBe('unknown')
  })
})
