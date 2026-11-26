import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useStatus } from '@/hooks/use-status'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  getGroupChannelStatus,
  getUptimeStatus,
  updateGroupChannelStatusOrder,
} from '../api'
import { applyGroupChannelStatusOrder } from '../lib/channel-status-order'
import type { GroupChannelStatusResponse } from '../types'

function isGroupChannelStatusResponse(
  value: unknown
): value is GroupChannelStatusResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray((value as GroupChannelStatusResponse).groups)
  )
}

export function usePublicMonitoring() {
  const publication = useStatus()
  const enabled =
    !!publication.status && publication.status.uptime_kuma_enabled !== false
  const query = useQuery({
    queryKey: ['uptime-status'],
    queryFn: async () => requireServerSuccess(await getUptimeStatus()).data,
    enabled,
    staleTime: 30_000,
  })
  return { enabled, publication, query }
}

export function useUpdateGroupChannelStatusOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (groups: string[]) => {
      const payload = requireServerSuccess(
        await updateGroupChannelStatusOrder(groups)
      )
      return payload.data?.groups ?? groups
    },
    onSuccess: (savedGroups) => {
      queryClient.setQueriesData<GroupChannelStatusResponse | null>(
        { queryKey: ['group-channel-status'] },
        (prev) => {
          if (!prev) return prev
          return {
            ...prev,
            groups: applyGroupChannelStatusOrder(prev.groups, savedGroups),
            custom_order: savedGroups.length > 0 ? savedGroups : undefined,
          }
        }
      )
      void queryClient.invalidateQueries({
        queryKey: ['group-channel-status'],
      })
    },
    meta: { errorToast: false },
  })
}

export function useGroupChannelStatus(hours = 24) {
  const publication = useStatus()
  const enabled =
    !!publication.status && publication.status.uptime_kuma_enabled !== false
  const query = useQuery({
    queryKey: ['group-channel-status', hours],
    queryFn: async () => {
      const payload = requireServerSuccess(await getGroupChannelStatus(hours))
      return isGroupChannelStatusResponse(payload.data) ? payload.data : null
    },
    enabled,
    staleTime: 30_000,
  })
  return { enabled, publication, query }
}
