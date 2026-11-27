import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import type { SiteOverviewRange, SiteOverviewResponse } from './types'

interface ApiEnvelope<T> {
  success: boolean
  message: string
  data: T
}

export async function getSiteOverview(params: {
  range: SiteOverviewRange
  exclude_admins?: boolean
}): Promise<SiteOverviewResponse> {
  const res = await api.get<ApiEnvelope<SiteOverviewResponse>>(
    '/api/data/site-overview',
    { params }
  )
  return requireServerSuccess(res.data).data
}
