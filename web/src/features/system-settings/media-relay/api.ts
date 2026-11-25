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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import type {
  AdminUserMediaTrafficData,
  MediaRelayConfig,
  MediaRelayConfigUpdatePayload,
  MediaRelayConnectivityResult,
  MediaTrafficOverridesListData,
  MediaTrafficQuotaSummary,
  UserSearchOption,
} from './types'

interface ApiEnvelope<T> {
  success: boolean
  message: string
  data: T
}

export async function getMediaRelayConfig() {
  const res = await api.get<ApiEnvelope<MediaRelayConfig>>(
    '/api/option/media_relay'
  )
  return requireServerSuccess(res.data).data
}

export async function updateMediaRelayConfig(
  payload: MediaRelayConfigUpdatePayload
) {
  const res = await api.put<ApiEnvelope<MediaRelayConfig>>(
    '/api/option/media_relay',
    payload
  )
  return requireServerSuccess(res.data).data
}

export async function testMediaRelayConfig(
  payload: MediaRelayConfigUpdatePayload
) {
  const res = await api.post<ApiEnvelope<MediaRelayConnectivityResult>>(
    '/api/option/media_relay/test',
    payload
  )
  return requireServerSuccess(res.data).data
}

export async function listMediaTrafficOverrides(keyword = '') {
  const res = await api.get<ApiEnvelope<MediaTrafficOverridesListData>>(
    '/api/option/media_relay/overrides',
    {
      params: keyword.trim() ? { keyword: keyword.trim() } : undefined,
    }
  )
  return requireServerSuccess(res.data).data
}

export async function getAdminUserMediaTraffic(userId: number) {
  const res = await api.get<ApiEnvelope<AdminUserMediaTrafficData>>(
    `/api/option/media_relay/users/${userId}`
  )
  return requireServerSuccess(res.data).data
}

export async function upsertMediaTrafficOverride(
  userId: number,
  payload: { extra_daily_mb: number; expires_at: number; note: string }
) {
  const res = await api.put<ApiEnvelope<{ quota?: MediaTrafficQuotaSummary }>>(
    `/api/option/media_relay/overrides/${userId}`,
    payload
  )
  return requireServerSuccess(res.data).data
}

export async function deleteMediaTrafficOverride(userId: number) {
  const res = await api.delete<ApiEnvelope<null>>(
    `/api/option/media_relay/overrides/${userId}`
  )
  return requireServerSuccess(res.data)
}

export async function resetUserMediaDailyTraffic(userId: number) {
  const res = await api.post<ApiEnvelope<MediaTrafficQuotaSummary>>(
    `/api/option/media_relay/usage/${userId}/reset`
  )
  return requireServerSuccess(res.data).data
}

export async function searchUsersForMediaRelay(keyword: string) {
  const res = await api.get<
    ApiEnvelope<{ items?: UserSearchOption[] } | UserSearchOption[]>
  >('/api/user/search', {
    params: { keyword: keyword.trim(), p: 1, page_size: 10 },
  })
  const data = requireServerSuccess(res.data).data
  if (Array.isArray(data)) return data
  return Array.isArray(data?.items) ? data.items : []
}
