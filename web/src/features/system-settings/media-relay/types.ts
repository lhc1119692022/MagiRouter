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
export type MediaRelayProvider = 'aliyun-oss' | 's3'

export interface MediaRelayConfig {
  enabled: boolean
  is_ready: boolean
  provider: MediaRelayProvider
  endpoint: string
  region: string
  bucket: string
  public_base_url: string
  key_prefix: string
  access_key_id: string
  access_key_secret_configured: boolean
  force_path_style: boolean
  presign_ttl_seconds: number
  retention_days: number
  max_file_size_mb: number
  default_daily_traffic_mb: number
  group_daily_bonus_mb: Record<string, number>
  temp_global_bonus_mb: number
  temp_global_expires_at: number
  temp_global_note: string
  active_global_temp_bonus_mb: number
  traffic_date: string
  reset_at: number
}

export interface MediaRelayConfigUpdatePayload {
  enabled: boolean
  provider: MediaRelayProvider
  endpoint: string
  region: string
  bucket: string
  public_base_url: string
  key_prefix: string
  access_key_id: string
  access_key_secret: string
  clear_access_key_secret?: boolean
  force_path_style: boolean
  presign_ttl_seconds: number
  retention_days: number
  max_file_size_mb: number
  default_daily_traffic_mb: number
  group_daily_bonus_mb: Record<string, number>
  temp_global_bonus_mb: number
  temp_global_expires_at: number
  temp_global_note: string
}

export interface MediaRelayConnectivityResult {
  reachable: boolean
  status_code: number
  provider: MediaRelayProvider
  region: string
  endpoint: string
  public_base: string
  latency_ms: number
  diagnostic: string
}

export interface MediaTrafficOverrideItem {
  user_id: number
  username: string
  display_name: string
  group: string
  extra_daily_bytes: number
  extra_daily_mb: number
  expires_at: number
  active: boolean
  note: string
  updated_by: number
  updated_at: number
  today_used_bytes: number
  effective_daily_bytes: number
}

export interface MediaTrafficOverridesListData {
  items: MediaTrafficOverrideItem[]
  traffic_date: string
  reset_at: number
}

export interface MediaTrafficQuotaSummary {
  enabled: boolean
  provider: MediaRelayProvider
  region: string
  traffic_date: string
  reset_at: number
  retention_days: number
  max_file_size_bytes: number
  used_bytes: number
  upload_count: number
  base_daily_bytes: number
  group_name: string
  group_bonus_bytes: number
  global_temp_bonus_bytes: number
  global_temp_expires_at: number
  global_temp_note: string
  user_bonus_bytes: number
  user_bonus_expires_at: number
  user_bonus_note: string
  effective_daily_bytes: number
  remaining_bytes: number
}

export interface AdminUserMediaTrafficData {
  user: {
    id: number
    username: string
    display_name: string
    group: string
  }
  quota: MediaTrafficQuotaSummary
}

export interface UserSearchOption {
  id: number
  username: string
  display_name?: string
  group?: string
}
