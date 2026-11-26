import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import type {
  UpstreamBalanceOverview,
  UpstreamBalanceRefreshResponse,
  UpstreamBalanceSetting,
} from './types'

interface ApiEnvelope<T> {
  success: boolean
  message: string
  data: T
}

export async function getUpstreamBalanceOverview(): Promise<UpstreamBalanceOverview> {
  const res = await api.get<ApiEnvelope<UpstreamBalanceOverview>>(
    '/api/upstream_balance'
  )
  return requireServerSuccess(res.data).data
}

export async function refreshUpstreamBalances(params?: {
  site_key?: string
  channel_id?: number
  send_alerts?: boolean
}): Promise<UpstreamBalanceRefreshResponse> {
  const res = await api.post<ApiEnvelope<UpstreamBalanceRefreshResponse>>(
    '/api/upstream_balance/refresh',
    params ?? {}
  )
  return requireServerSuccess(res.data).data
}

export async function updateUpstreamBalanceSettings(
  payload: UpstreamBalanceSetting
): Promise<UpstreamBalanceOverview> {
  const res = await api.put<ApiEnvelope<UpstreamBalanceOverview>>(
    '/api/option/upstream_balance',
    payload
  )
  return requireServerSuccess(res.data).data
}

export async function testUpstreamBalanceAlertEmail(params?: {
  notify_emails?: string
}): Promise<void> {
  const res = await api.post<ApiEnvelope<null>>(
    '/api/option/upstream_balance/test_email',
    params ?? {}
  )
  requireServerSuccess(res.data)
}
