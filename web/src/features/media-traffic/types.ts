import type { MediaTrafficOverrideItem } from '@/features/system-settings/media-relay/types'

export type { MediaTrafficOverrideItem }

export interface MediaTrafficPublicConfig {
  enabled: boolean
  is_ready: boolean
  provider: string
  region: string
  bucket: string
  retention_days: number
  max_file_size_mb: number
  default_daily_traffic_mb: number
  group_daily_bonus_mb: Record<string, number>
  active_global_temp_bonus_mb: number
  temp_global_expires_at: number
  temp_global_note: string
  traffic_date: string
  reset_at: number
}

export interface MediaTrafficAnalyticsSummary {
  days: number
  start_date: string
  end_date: string
  today_used_bytes: number
  yesterday_used_bytes: number
  today_upload_count: number
  today_active_users: number
  range_used_bytes: number
  range_upload_count: number
  range_active_users: number
  avg_daily_bytes: number
  peak_daily_bytes: number
  peak_date: string
  active_objects_count: number
  active_objects_bytes: number
  ready_objects_count: number
  pending_objects_count: number
  aborted_objects_count: number
  active_overrides_count: number
  near_limit_users_count: number
}

export interface MediaDailyTrendPoint {
  date: string
  used_bytes: number
  upload_count: number
  active_users: number
}

export interface MediaContentTypeStat {
  category: 'image' | 'video' | 'audio' | 'document' | 'other' | string
  count: number
  total_bytes: number
  share_percent: number
}

export interface MediaUserTrafficRankItem {
  user_id: number
  username: string
  display_name: string
  group: string
  today_used_bytes: number
  today_upload_count: number
  effective_daily_bytes: number
  today_usage_percent: number
  range_used_bytes: number
  range_upload_count: number
  active_override_bytes: number
  override_expires_at: number
  override_note: string
}

export interface MediaTrafficAnalyticsReport {
  config: MediaTrafficPublicConfig
  summary: MediaTrafficAnalyticsSummary
  daily_trend: MediaDailyTrendPoint[]
  content_types: MediaContentTypeStat[]
  top_users: MediaUserTrafficRankItem[]
}

export interface MediaRelayObjectAdminItem {
  id: number
  user_id: number
  username: string
  display_name: string
  group: string
  object_key: string
  file_name: string
  content_type: string
  category: string
  size_bytes: number
  status: 'ready' | 'pending' | 'aborted' | string
  traffic_date: string
  created_at: number
  expires_at: number
  expired: boolean
}

export interface MediaRelayObjectListData {
  items: MediaRelayObjectAdminItem[]
  total: number
  page: number
  page_size: number
}

export interface MediaTrafficOverridesReadData {
  items: MediaTrafficOverrideItem[]
  traffic_date: string
  reset_at: number
}
