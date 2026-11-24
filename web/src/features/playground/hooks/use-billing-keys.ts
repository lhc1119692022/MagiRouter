import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { getApiKeys } from '@/features/keys/api'
import { API_KEY_STATUS } from '@/features/keys/constants'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

async function getBillingKeySummaries(signal: AbortSignal) {
  const keys = []
  for (let page = 1; ; page++) {
    const { data } = requireServerSuccess(
      await getApiKeys({ p: page, size: 100 }, signal)
    )
    if (!data || !Array.isArray(data.items)) {
      throw new Error('Failed to load API keys')
    }
    for (const key of data.items) {
      keys.push({
        id: key.id,
        name: key.name,
        group: key.group,
        status: key.status,
        expires: key.expired_time,
        hasQuota: key.unlimited_quota || key.remain_quota > 0,
      })
    }
    if (!data.items.length || !data.total || keys.length >= data.total) break
  }
  return keys
}

export function useBillingKeys() {
  const user = useAuthStore((state) => state.auth.user?.id)
  const [, updateClock] = useState(0)
  const query = useQuery({
    queryKey: ['playground-billing-keys', user],
    enabled: !!user,
    queryFn: ({ signal }) => getBillingKeySummaries(signal),
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  })
  const confirmed = !!user && query.isSuccess && query.isFetchedAfterMount
  const eligible = (confirmed ? query.data : []).filter(
    (key) =>
      Number.isSafeInteger(key.id) &&
      key.id > 0 &&
      key.status === API_KEY_STATUS.ENABLED &&
      key.hasQuota &&
      (key.expires === -1 || key.expires > Date.now() / 1000)
  )
  const nextExpiry = Math.min(
    ...eligible
      .filter((key) => key.expires > 0)
      .map((key) => key.expires * 1000)
  )
  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return
    const timer = window.setTimeout(
      () => updateClock((tick) => tick + 1),
      Math.max(0, Math.min(nextExpiry - Date.now(), 2147483647))
    )
    return () => window.clearTimeout(timer)
  }, [nextExpiry])
  return {
    eligible,
    loading: !!user && !query.isError && !confirmed,
    error: query.isError,
    retry: query.refetch,
  }
}
