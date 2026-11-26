import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import type { ProfitAnalyticsReport, ProfitAnalyticsSetting } from './types'

interface ApiEnvelope<T> {
  success: boolean
  message: string
  data: T
}

export async function getProfitAnalytics(params: {
  days?: number
  start_timestamp?: number
  end_timestamp?: number
  order_limit?: number
  exclude_admins?: boolean
}) {
  const res = await api.get<ApiEnvelope<ProfitAnalyticsReport>>(
    '/api/data/profit',
    { params }
  )
  return requireServerSuccess(res.data).data
}

export async function getProfitAnalyticsSettings() {
  const res = await api.get<ApiEnvelope<ProfitAnalyticsSetting>>(
    '/api/option/profit_analytics'
  )
  return requireServerSuccess(res.data).data
}

export async function updateProfitAnalyticsSettings(
  payload: ProfitAnalyticsSetting
) {
  const res = await api.put<ApiEnvelope<ProfitAnalyticsSetting>>(
    '/api/option/profit_analytics',
    payload
  )
  return requireServerSuccess(res.data).data
}
