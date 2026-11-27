import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import type { PerfModelSummary } from '@/features/performance-metrics/types'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { FILTER_ALL } from '../constants'
import {
  monitoringWindowLabel,
  observedRequestSamples,
  type MonitoringWindow,
} from '../lib/monitored-requests'

export function normalizeCatalogMonitoringGroup(
  selectedGroup?: string
): string | undefined {
  const trimmed = selectedGroup?.trim()
  if (!trimmed || trimmed === FILTER_ALL || trimmed === 'auto') {
    return undefined
  }
  return trimmed
}

export function useCatalogPerfMetrics(
  enabled: boolean,
  selectedGroup?: string
) {
  const viewer = useAuthStore((state) => state.auth.user)
  const scopedGroup = normalizeCatalogMonitoringGroup(selectedGroup)
  const perfQuery = useQuery({
    queryKey: [
      'catalog-monitored-requests',
      24,
      viewer?.id,
      viewer?.group,
      scopedGroup ?? 'best',
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getPerfMetricsSummary(24, undefined, scopedGroup)
      ),
    enabled,
    staleTime: 60 * 1000,
    retry: false,
  })

  const perfMap = useMemo(() => {
    const result = perfQuery.data?.data
    const map = new Map<string, PerfModelSummary>()
    for (const model of result?.models ?? []) {
      map.set(model.model_name, {
        ...model,
        recent_success_series: observedRequestSamples(
          model.recent_success_series,
          result
        ),
      })
    }
    return map
  }, [perfQuery.data])

  const monitoringWindow = useMemo<MonitoringWindow | undefined>(() => {
    const result = perfQuery.data?.data
    if (!result) return undefined
    return {
      window_start: result.window_start,
      window_end: result.window_end,
    }
  }, [perfQuery.data])

  const windowLabel = monitoringWindowLabel(perfQuery.data?.data)

  return {
    perfMap,
    monitoringWindow,
    windowLabel,
    monitoringStatus: perfQuery.status,
    scopedGroup,
  }
}
