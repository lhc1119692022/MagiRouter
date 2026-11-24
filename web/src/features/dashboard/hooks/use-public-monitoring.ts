import { useQuery } from '@tanstack/react-query'

import { useStatus } from '@/hooks/use-status'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getUptimeStatus } from '../api'

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
