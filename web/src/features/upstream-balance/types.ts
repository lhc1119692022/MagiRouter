export type UpstreamProviderType = 'auto' | 'new_api' | 'sub2api' | 'ignore'
export type UpstreamChannelProviderOverride =
  | ''
  | 'new_api'
  | 'sub2api'
  | 'ignore'

export type UpstreamBalanceStatus =
  | 'ok'
  | 'low'
  | 'error'
  | 'unconfigured'
  | 'ignored'
  | 'unlimited'
  | 'follows_site'

export type UpstreamAlertReason = 'amount' | 'percent'

export interface UpstreamBalanceWindow {
  period: 'daily' | 'weekly' | 'monthly' | string
  limit_usd: number
  used_usd?: number
  remaining_usd?: number
  limit_cny: number
  used_cny?: number
  remaining_cny?: number
  remaining_percent?: number
}

export interface UpstreamBalanceSiteConfig {
  name: string
  provider_type: UpstreamProviderType
  cny_rate?: number | null
  reference_total_cny?: number | null
  alert_enabled?: boolean | null
  min_balance_cny?: number | null
  min_percent?: number | null
  access_token?: string
  clear_access_token?: boolean
  has_access_token?: boolean
  user_id?: string
  note?: string
}

export interface UpstreamBalanceChannelConfig {
  provider_override?: UpstreamChannelProviderOverride
  alert_enabled?: boolean | null
  min_balance_cny?: number | null
  min_percent?: number | null
  reference_total_cny?: number | null
  note?: string
}

export interface UpstreamBalanceSetting {
  enabled: boolean
  check_interval_minutes: number
  alert_cooldown_minutes: number
  notify_emails: string
  default_min_balance_cny: number | null
  default_min_percent: number | null
  sites: Record<string, UpstreamBalanceSiteConfig>
  channels: Record<string, UpstreamBalanceChannelConfig>
}

export interface UpstreamBalanceSiteSnapshot {
  site_key: string
  provider_type: string
  status: UpstreamBalanceStatus
  error?: string
  balance_source?: string
  balance_usd?: number
  used_usd?: number
  total_usd?: number
  balance_cny?: number
  total_cny?: number
  remaining_percent?: number
  percent_source?: string
  currency_rate: number
  unlimited?: boolean
  checked_at?: number
  alert_active?: boolean
  alert_reasons?: UpstreamAlertReason[]
  last_alert_at?: number
  last_alert_error?: string
}

export interface UpstreamBalanceChannelSnapshot {
  channel_id: number
  site_key: string
  provider_type: string
  status: UpstreamBalanceStatus
  error?: string
  has_independent_limit: boolean
  follows_site_balance: boolean
  unlimited?: boolean
  balance_usd?: number
  used_usd?: number
  total_usd?: number
  balance_cny?: number
  total_cny?: number
  effective_balance_usd?: number
  effective_balance_cny?: number
  remaining_percent?: number
  percent_source?: string
  expires_at?: number
  windows?: UpstreamBalanceWindow[]
  checked_at?: number
  alert_active?: boolean
  alert_reasons?: UpstreamAlertReason[]
  last_alert_at?: number
  last_alert_error?: string
}

export interface UpstreamBalanceChannelView {
  channel_id: number
  channel_name: string
  channel_type: number
  channel_type_name: string
  channel_status: number
  group: string
  tag: string
  base_url: string
  is_multi_key: boolean
  key_count: number
  effective_provider: string
  config: UpstreamBalanceChannelConfig
  effective_alert_enabled: boolean
  effective_min_balance_cny?: number
  effective_min_percent?: number
  snapshot: UpstreamBalanceChannelSnapshot
}

export interface UpstreamBalanceSiteView {
  site_key: string
  display_name: string
  effective_provider: string
  inferred_provider: string
  effective_cny_rate: number
  custom_cny_rate: boolean
  config: UpstreamBalanceSiteConfig
  effective_alert_enabled: boolean
  effective_min_balance_cny?: number
  effective_min_percent?: number
  enabled_channel_count: number
  limited_channel_count: number
  low_channel_count: number
  snapshot: UpstreamBalanceSiteSnapshot
  channels: UpstreamBalanceChannelView[]
}

export interface UpstreamBalanceMeta {
  default_usd_exchange_rate: number
  email_configured: boolean
  server_address: string
  last_checked_at: number
  skipped_channels_count: number
}

export interface UpstreamBalanceSummary {
  total_sites: number
  monitored_sites: number
  low_sites: number
  error_sites: number
  unconfigured_sites: number
  ignored_sites: number
  total_channels: number
  limited_channels: number
  low_channels: number
  total_balance_cny: number
  total_balance_usd: number
}

export interface UpstreamBalanceOverview {
  settings: UpstreamBalanceSetting
  meta: UpstreamBalanceMeta
  summary: UpstreamBalanceSummary
  sites: UpstreamBalanceSiteView[]
}

export interface UpstreamBalanceRefreshSummary {
  refreshed_sites: number
  refreshed_channels: number
  alerts_triggered: number
  alert_email_sent: boolean
  alert_email_error?: string
  triggered_items?: string[]
}

export interface UpstreamBalanceRefreshResponse {
  summary: UpstreamBalanceRefreshSummary
  overview: UpstreamBalanceOverview
}
