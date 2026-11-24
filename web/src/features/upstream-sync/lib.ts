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

/** Upstream project this fork tracks. */
export const UPSTREAM_REPO = 'QuantumNous/new-api'

export const UPSTREAM_BRANCH = 'main'

export function getUpstreamCompareUrl(base: string | null): string {
  const range = base ? `${base}...${UPSTREAM_BRANCH}` : UPSTREAM_BRANCH
  return `https://github.com/${UPSTREAM_REPO}/compare/${range}`
}

export type BuildMeta = {
  /** Release portion of the version string, e.g. `v1.0.0-rc.51`. */
  version: string
  /** Commit the running build was produced from. */
  commit: string | null
  /** Upstream commit the build was last merged with. */
  upstreamBase: string | null
}

export type UpstreamCommit = {
  sha: string
  shortSha: string
  message: string
  authorName: string
  authoredAt: string
}

const HASH = '[0-9a-f]{7,40}'

function readToken(metadata: string, name: string): string | null {
  const match = metadata.match(
    new RegExp(`(?:^|\\.)${name}\\.(${HASH})(?:\\.|$)`)
  )
  return match ? match[1].toLowerCase() : null
}

/**
 * Splits a version string of the form
 * `v1.0.0-rc.51+sha.<commit>.up.<upstream commit>` into build facts.
 *
 * Returns `null` when no version is reported, so callers can distinguish
 * "server did not say" from "server said nothing useful".
 */
export function parseBuildMeta(
  raw: string | null | undefined
): BuildMeta | null {
  const value = raw?.trim()
  if (!value) return null

  const plus = value.indexOf('+')
  if (plus === -1) {
    return { version: value, commit: null, upstreamBase: null }
  }

  const version = value.slice(0, plus)
  const metadata = value.slice(plus + 1).toLowerCase()
  return {
    version: version || value,
    commit: readToken(metadata, 'sha'),
    upstreamBase: readToken(metadata, 'up'),
  }
}

function sameHash(a: string, b: string): boolean {
  const left = a.toLowerCase()
  const right = b.toLowerCase()
  return left === right || left.startsWith(right) || right.startsWith(left)
}

export type CommitGap = {
  /** Number of upstream commits newer than the recorded base. */
  count: number
  /** Whether the recorded base was found in the fetched window. */
  matched: boolean
}

/**
 * GitHub returns commits newest first. Walk until the recorded upstream base
 * shows up; everything before it is a commit we have not merged yet.
 */
export function countCommitsSince(
  commits: UpstreamCommit[],
  base: string | null | undefined
): CommitGap {
  if (!base || commits.length === 0) return { count: 0, matched: false }

  const index = commits.findIndex((item) => sameHash(item.sha, base))
  if (index === -1) return { count: commits.length, matched: false }
  return { count: index, matched: true }
}

export type SyncState = 'up-to-date' | 'behind' | 'unknown'

export function describeSyncState(input: {
  count: number
  matched: boolean
  base: string | null | undefined
}): SyncState {
  if (!input.base || !input.matched) return 'unknown'
  return input.count === 0 ? 'up-to-date' : 'behind'
}
