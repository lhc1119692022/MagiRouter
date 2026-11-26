import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import type {
  MediaRelayObjectListData,
  MediaTrafficAnalyticsReport,
  MediaTrafficOverridesReadData,
} from './types'

interface ApiEnvelope<T> {
  success: boolean
  message: string
  data: T
}

export async function getAdminMediaTrafficAnalytics(params: {
  days?: number
  keyword?: string
}) {
  const res = await api.get<ApiEnvelope<MediaTrafficAnalyticsReport>>(
    '/api/data/media_traffic',
    { params }
  )
  return requireServerSuccess(res.data).data
}

export async function listAdminMediaTrafficObjects(params: {
  p?: number
  page_size?: number
  status?: string
  category?: string
  keyword?: string
}) {
  const res = await api.get<ApiEnvelope<MediaRelayObjectListData>>(
    '/api/data/media_traffic/objects',
    { params }
  )
  return requireServerSuccess(res.data).data
}

export async function listAdminMediaTrafficOverrides(keyword?: string) {
  const res = await api.get<ApiEnvelope<MediaTrafficOverridesReadData>>(
    '/api/data/media_traffic/overrides',
    {
      params: keyword?.trim() ? { keyword: keyword.trim() } : undefined,
    }
  )
  return requireServerSuccess(res.data).data
}
