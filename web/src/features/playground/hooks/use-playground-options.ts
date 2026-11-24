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
import { skipToken, useQuery } from '@tanstack/react-query'

import { useAuthStore } from '@/stores/auth-store'

import { getPlaygroundKeyScope, getUserGroups, getUserModels } from '../api'

type UsePlaygroundOptionsParams = {
  selectedKey?: { id: number; group?: string | null }
  authoringGroup?: string
}

export function usePlaygroundOptions(props: UsePlaygroundOptionsParams) {
  const user = useAuthStore((state) => state.auth.user?.id)
  const selected = props.selectedKey
  const authoringGroup = props.authoringGroup
  const keyModels = useQuery({
    queryKey: ['playground-key-models', user, selected?.id, selected?.group],
    queryFn: selected
      ? ({ signal }) =>
          getPlaygroundKeyScope(
            selected.id,
            selected.group || undefined,
            signal
          )
      : skipToken,
    enabled: !!user && !!selected,
    staleTime: 0,
    refetchOnMount: 'always',
    meta: { errorToast: false },
    retry: false,
  })
  const authoring = useQuery({
    queryKey: ['playground-authoring-models', user, authoringGroup],
    queryFn:
      authoringGroup === undefined
        ? skipToken
        : () => getUserModels(authoringGroup, undefined, true),
    enabled: !!user && authoringGroup !== undefined,
    retry: false,
  })
  const scope =
    selected &&
    keyModels.isSuccess &&
    keyModels.isFetchedAfterMount &&
    !keyModels.isPaused &&
    keyModels.data.keyId === selected.id
      ? keyModels.data
      : undefined
  const groups = useQuery({
    queryKey: ['playground-groups', user],
    queryFn: getUserGroups,
    enabled: !!scope,
  })
  return {
    scope,
    groups: groups.data ?? [],
    authorModels:
      authoringGroup !== undefined && authoring.isSuccess
        ? authoring.data
        : undefined,
    isLoadingModels:
      authoringGroup !== undefined
        ? authoring.isLoading
        : !!selected && !scope && keyModels.isFetching,
    modelsError:
      authoringGroup !== undefined ? authoring.error : keyModels.error,
    retryModels:
      authoringGroup !== undefined ? authoring.refetch : keyModels.refetch,
  }
}
