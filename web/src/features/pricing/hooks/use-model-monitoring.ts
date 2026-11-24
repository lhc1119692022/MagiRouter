import { useQuery } from '@tanstack/react-query'

import { getPerfMetrics } from '@/features/performance-metrics/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

export function useModelMonitoring(modelName: string) {
  const viewer = useAuthStore((state) => state.auth.user)
  return useQuery({
    queryKey: ['perf-metrics', modelName, viewer?.id, viewer?.group],
    queryFn: async () => {
      const result = requireServerSuccess(await getPerfMetrics(modelName, 24))
      return result.data?.model_name === modelName ? result.data : null
    },
    staleTime: 60_000,
  })
}
