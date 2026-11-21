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
import { useQuery } from '@tanstack/react-query'

import { useStatus } from '@/hooks/use-status'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  fetchUpstreamCommits,
  readCachedSnapshot,
  type UpstreamFetchErrorCode,
  UpstreamFetchError,
} from './api'
import {
  countCommitsSince,
  describeSyncState,
  parseBuildMeta,
  type SyncState,
} from './lib'

export const UPSTREAM_SYNC_INTERVAL = 30 * 60 * 1000
export const UPSTREAM_SYNC_QUERY_KEY = ['upstream-sync'] as const

type UpstreamQueryData = {
  commits: Awaited<ReturnType<typeof fetchUpstreamCommits>>
  error: UpstreamFetchErrorCode | null
}

function cachedData(): UpstreamQueryData | undefined {
  const cached = readCachedSnapshot()
  return cached ? { commits: cached.commits, error: null } : undefined
}

export function useUpstreamSync() {
  const user = useAuthStore((state) => state.auth.user)
  const isAdmin = (user?.role ?? 0) >= ROLE.ADMIN
  const { status } = useStatus()
  const meta = parseBuildMeta(status?.version)
  const initial = cachedData()

  const query = useQuery({
    queryKey: UPSTREAM_SYNC_QUERY_KEY,
    enabled: isAdmin,
    retry: false,
    staleTime: UPSTREAM_SYNC_INTERVAL,
    gcTime: 24 * UPSTREAM_SYNC_INTERVAL,
    refetchOnWindowFocus: false,
    initialData: initial,
    initialDataUpdatedAt: () =>
      initial ? readCachedSnapshot()?.fetchedAt : undefined,
    queryFn: async ({ signal }): Promise<UpstreamQueryData> => {
      try {
        return { commits: await fetchUpstreamCommits(signal), error: null }
      } catch (error) {
        if (signal.aborted) throw error
        return {
          commits: [],
          error:
            error instanceof UpstreamFetchError ? error.code : 'network',
        }
      }
    },
  })

  const commits = query.data?.commits ?? []
  const gap = countCommitsSince(commits, meta?.upstreamBase)
  const state: SyncState = query.data?.error
    ? 'unknown'
    : describeSyncState({ ...gap, base: meta?.upstreamBase })

  return {
    enabled: isAdmin,
    meta,
    commits,
    latest: commits[0] ?? null,
    gap,
    state,
    error: query.data?.error ?? null,
    loading: query.isLoading,
    refreshing: query.isFetching && !query.isLoading,
    checkedAt: query.dataUpdatedAt || null,
    refresh: () => {
      if (isAdmin) void query.refetch({ cancelRefetch: false })
    },
  }
}
