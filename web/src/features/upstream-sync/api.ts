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
import { UPSTREAM_BRANCH, UPSTREAM_REPO, type UpstreamCommit } from './lib'

export type UpstreamFetchErrorCode =
  | 'network'
  | 'rate-limit'
  | 'timeout'
  | 'payload'

export class UpstreamFetchError extends Error {
  constructor(public readonly code: UpstreamFetchErrorCode) {
    super(code)
    this.name = 'UpstreamFetchError'
  }
}

export type UpstreamSnapshot = {
  commits: UpstreamCommit[]
  fetchedAt: number
}

const CACHE_KEY = 'magirouter.upstream-sync.v1'
const CACHE_TTL = 30 * 60 * 1000
const REQUEST_TIMEOUT = 12_000

export function readCachedSnapshot(): UpstreamSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UpstreamSnapshot
    if (!Array.isArray(parsed.commits) || typeof parsed.fetchedAt !== 'number') {
      return null
    }
    return Date.now() - parsed.fetchedAt > CACHE_TTL ? null : parsed
  } catch {
    return null
  }
}

function writeCachedSnapshot(snapshot: UpstreamSnapshot) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot))
  } catch {
    // Private mode / quota: caching is a nicety, never a requirement.
  }
}

type RawCommit = {
  sha?: unknown
  commit?: {
    message?: unknown
    author?: { name?: unknown; date?: unknown }
  }
}

function toUpstreamCommit(raw: RawCommit): UpstreamCommit | null {
  if (typeof raw?.sha !== 'string' || raw.sha.length < 7) return null
  const message =
    typeof raw.commit?.message === 'string'
      ? raw.commit.message.split('\n')[0].trim()
      : ''
  return {
    sha: raw.sha,
    shortSha: raw.sha.slice(0, 7),
    message: message || raw.sha.slice(0, 7),
    authorName:
      typeof raw.commit?.author?.name === 'string'
        ? raw.commit.author.name
        : '',
    authoredAt:
      typeof raw.commit?.author?.date === 'string' ? raw.commit.author.date : '',
  }
}

export async function fetchUpstreamCommits(
  signal: AbortSignal
): Promise<UpstreamCommit[]> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) controller.abort()
  const timeout = setTimeout(cancel, REQUEST_TIMEOUT)

  try {
    const response = await fetch(
      `https://api.github.com/repos/${UPSTREAM_REPO}/commits?sha=${UPSTREAM_BRANCH}&per_page=100`,
      {
        credentials: 'omit',
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      }
    )
    if (response.status === 403 || response.status === 429) {
      throw new UpstreamFetchError('rate-limit')
    }
    if (!response.ok) throw new UpstreamFetchError('network')

    const payload: unknown = await response.json()
    if (!Array.isArray(payload)) throw new UpstreamFetchError('payload')
    const commits = payload
      .map((item) => toUpstreamCommit(item as RawCommit))
      .filter((item): item is UpstreamCommit => item !== null)
    if (commits.length === 0) throw new UpstreamFetchError('payload')

    const snapshot = { commits, fetchedAt: Date.now() }
    writeCachedSnapshot(snapshot)
    return commits
  } catch (error) {
    if (signal.aborted) throw error
    if (controller.signal.aborted) throw new UpstreamFetchError('timeout')
    if (error instanceof UpstreamFetchError) throw error
    throw new UpstreamFetchError('network')
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', cancel)
  }
}
