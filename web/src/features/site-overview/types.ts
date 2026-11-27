export type SiteOverviewRange = '24h' | '7d' | '30d' | '90d'

export interface SiteOverviewCurrencyMeta {
  quota_per_unit: number
  display_type: string
  symbol: string
  usd_exchange_rate: number
  usd_to_currency_rate: number
  topup_price: number
}

export interface SiteOverviewMeta {
  range: SiteOverviewRange
  bucket_unit: 'hour' | 'day'
  start_time: number
  end_time: number
  prev_start_time: number
  prev_end_time: number
  generated_at: number
  exclude_admin_users: boolean
  excluded_admin_count: number
  currency: SiteOverviewCurrencyMeta
}

export interface SiteOverviewUsageSummary {
  total_requests: number
  prev_requests: number
  requests_change_pct?: number | null
  total_quota: number
  billed_usd: number
  billed_local: number
  prev_quota: number
  quota_change_pct?: number | null
  total_tokens: number
  prev_tokens: number
  tokens_change_pct?: number | null
  cache_read_tokens: number
  cache_creation_tokens: number
  cache_hit_rate: number
  avg_rpm: number
  avg_tpm: number
}

export interface SiteOverviewPerfSummary {
  total_requests: number
  success_requests: number
  failed_requests: number
  success_rate: number
  prev_success_rate?: number | null
  success_rate_delta?: number | null
  avg_latency_ms: number
  prev_avg_latency_ms?: number | null
  latency_change_pct?: number | null
  avg_ttft_ms: number
  prev_avg_ttft_ms?: number | null
  ttft_change_pct?: number | null
  avg_tps: number
  prev_avg_tps?: number | null
  tps_insufficient?: boolean
  cache_hit_rate?: number | null
  has_data: boolean
}

export interface SiteOverviewUsersSummary {
  total_users: number
  enabled_users: number
  disabled_users: number
  new_users: number
  prev_new_users: number
  new_users_change_pct?: number | null
  today_new_users: number
  deleted_users: number
  net_user_change: number
  active_users: number
  prev_active_users: number
  active_users_change_pct?: number | null
  dau: number
  wau: number
  mau: number
  login_active_users: number
  paying_users: number
  active_rate: number
  total_remaining_quota: number
  total_remaining_usd: number
  total_remaining_local: number
}

export interface SiteOverviewChannelAlert {
  id: number
  name: string
  type: number
  group: string
  status: number
  response_time: number
  test_time: number
  priority: number
}

export interface SiteOverviewChannelsSummary {
  total: number
  enabled: number
  manually_disabled: number
  auto_disabled: number
  unknown: number
  disabled_channels: SiteOverviewChannelAlert[]
}

export interface SiteOverviewTrendPoint {
  ts: number
  label: string
  requests: number
  quota: number
  billed_usd: number
  billed_local: number
  tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
  active_users: number
  new_users: number
  deleted_users: number
  cumulative_users: number
  perf_requests: number
  success_rate: number
  avg_latency_ms: number
  avg_ttft_ms: number
  avg_tps: number
}

export interface SiteOverviewModelItem {
  model_name: string
  requests: number
  quota: number
  billed_usd: number
  billed_local: number
  tokens: number
  share_pct: number
  success_rate?: number | null
  avg_latency_ms?: number | null
  avg_ttft_ms?: number | null
  avg_tps?: number | null
  tps_insufficient?: boolean
}

export interface SiteOverviewPerfModel {
  model_name: string
  model_kind: string
  request_count: number
  success_count: number
  success_rate: number
  avg_latency_ms: number
  avg_ttft_ms: number
  avg_tps: number
  tps_insufficient?: boolean
  cache_hit_rate?: number | null
}

export interface SiteOverviewGroupItem {
  group: string
  requests: number
  quota: number
  billed_usd: number
  billed_local: number
  tokens: number
  active_users: number
  success_rate?: number | null
  avg_latency_ms?: number | null
  avg_ttft_ms?: number | null
  avg_tps?: number | null
  tps_insufficient?: boolean
}

export interface SiteOverviewUserItem {
  user_id: number
  username: string
  display_name?: string
  group: string
  status: number
  requests: number
  quota: number
  billed_usd: number
  billed_local: number
  tokens: number
  remaining_quota: number
  remaining_local: number
  last_login_at: number
  created_at: number
}

export interface SiteOverviewRuntimeSnapshot {
  alloc_bytes: number
  sys_bytes: number
  num_gc: number
  num_goroutine: number
  disk_cache_enabled: boolean
  disk_cache_size_bytes: number
  disk_cache_files: number
  cpu_usage: number
  memory_usage: number
  disk_usage: number
  monitor_sampled: boolean
}

export interface SiteOverviewResponse {
  meta: SiteOverviewMeta
  usage: SiteOverviewUsageSummary
  performance: SiteOverviewPerfSummary
  users: SiteOverviewUsersSummary
  channels: SiteOverviewChannelsSummary
  trend: SiteOverviewTrendPoint[]
  top_models: SiteOverviewModelItem[]
  perf_alerts: SiteOverviewPerfModel[]
  groups: SiteOverviewGroupItem[]
  top_users: SiteOverviewUserItem[]
  runtime?: SiteOverviewRuntimeSnapshot | null
}
