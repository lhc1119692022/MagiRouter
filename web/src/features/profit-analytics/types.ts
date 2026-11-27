export type ProfitChannelPricingMode = 'percent' | 'ratio' | 'unit_price'
export type ProfitChannelCostSource = 'override' | 'channel' | 'default'

export interface ProfitCurrencyMeta {
  quota_per_unit: number
  display_type: string
  symbol: string
  usd_exchange_rate: number
  usd_to_currency_rate: number
  topup_price: number
}

export interface ProfitPricingReference {
  default_group_ratio: number
  group_ratios: Record<string, number>
}

export interface ProfitChannelCostConfig {
  cost_ratio?: number
  monthly_fixed_cost: number
  note: string
  pricing_mode?: ProfitChannelPricingMode | ''
  upstream_value?: number
  platform_value?: number
}

export interface ProfitFixedCostItem {
  id: string
  name: string
  category: 'server' | 'media' | 'account_pool' | 'other'
  monthly_cost: number
  enabled: boolean
  note: string
}

export interface ProfitAnalyticsSetting {
  exclude_admin_users: boolean
  default_cost_ratio: number
  payment_fee_rate: number
  payment_fee_rates: Record<string, number>
  channel_costs: Record<string, ProfitChannelCostConfig>
  extra_fixed_costs: ProfitFixedCostItem[]
}

export interface ProfitSummary {
  range_days: number
  start_time: number
  end_time: number
  exclude_admin_users: boolean
  excluded_admin_count: number
  cash_revenue: number
  wallet_topup_money: number
  wallet_topup_orders: number
  subscription_direct_money: number
  subscription_direct_orders: number
  subscription_balance_money: number
  subscription_balance_orders: number
  payment_fee_cost: number
  net_cash_inflow: number
  billed_quota: number
  billed_usd: number
  billed_local: number
  total_requests: number
  total_tokens: number
  paying_users: number
  active_users: number
  upstream_variable_cost: number
  channel_fixed_cost: number
  platform_fixed_cost: number
  total_estimated_cost: number
  cash_net_profit: number
  cash_net_margin: number
  billed_gross_profit: number
  billed_gross_margin: number
  billed_net_profit: number
  billed_net_margin: number
}

export interface ProfitLiabilitySnapshot {
  user_remaining_quota: number
  user_remaining_usd: number
  user_remaining_local: number
  subscription_remaining_quota: number
  subscription_remaining_usd: number
  subscription_remaining_local: number
  redeemed_quota: number
  redeemed_usd: number
  redeemed_local: number
  redeemed_count: number
  checkin_quota: number
  checkin_usd: number
  checkin_local: number
  checkin_count: number
}

export interface ProfitDailyTrendPoint {
  date: string
  cash_revenue: number
  wallet_topup_money: number
  subscription_direct_money: number
  payment_fee: number
  billed_usd: number
  billed_local: number
  upstream_cost: number
  fixed_cost: number
  total_cost: number
  cash_net_profit: number
  billed_gross_profit: number
  billed_net_profit: number
  requests: number
  tokens: number
  orders: number
}

export interface ProfitChannelBreakdown {
  channel_id: number
  channel_name: string
  channel_type: number
  group: string
  tag: string
  status: number
  channel_deleted?: boolean
  balance: number
  requests: number
  tokens: number
  billed_quota: number
  billed_usd: number
  billed_local: number
  cost_ratio: number
  custom_cost_ratio: boolean
  cost_source?: ProfitChannelCostSource
  pricing_mode?: ProfitChannelPricingMode | ''
  upstream_value?: number
  platform_value?: number
  channel_upstream_ratio?: number
  channel_upstream_group?: string
  suggested_group_ratio: number
  suggested_unit_price?: number
  suggested_unit_price_model?: string
  variable_cost: number
  monthly_fixed_cost: number
  amortized_fixed_cost: number
  gross_profit: number
  net_profit: number
  margin_rate: number
  note: string
}

export interface ProfitModelBreakdown {
  model_name: string
  requests: number
  tokens: number
  billed_quota: number
  billed_usd: number
  billed_local: number
  estimated_cost: number
  gross_profit: number
  margin_rate: number
}

export interface ProfitGroupBreakdown {
  group: string
  requests: number
  active_users: number
  tokens: number
  billed_quota: number
  billed_usd: number
  billed_local: number
  estimated_cost: number
  gross_profit: number
  margin_rate: number
}

export interface ProfitPaymentMethodBreakdown {
  payment_method: string
  order_count: number
  gross_money: number
  fee_rate: number
  estimated_fee: number
  net_money: number
  is_internal: boolean
}

export interface ProfitRecentOrderItem {
  order_type: 'topup' | 'subscription' | 'subscription_balance'
  trade_no: string
  user_id: number
  username: string
  display_name: string
  user_deleted?: boolean
  payment_method: string
  payment_provider: string
  money: number
  amount: number
  plan_title?: string
  completed_at: number
  is_internal: boolean
}

export interface ProfitDeletedUserOrphanSummary {
  user_count: number
  topup_orders: number
  completed_topup_orders: number
  completed_topup_money: number
  subscription_orders: number
  completed_subscription_orders: number
  completed_subscription_money: number
  quota_data_records: number
  quota_data_requests: number
  billed_quota: number
  billed_usd: number
  billed_local: number
  user_subscriptions: number
  used_redemptions: number
  checkins: number
  total_records: number
}

export interface ProfitDeletedUserOrphanUserItem {
  user_id: number
  username: string
  display_name: string
  soft_deleted: boolean
  topup_orders: number
  completed_topup_orders: number
  completed_topup_money: number
  subscription_orders: number
  completed_subscription_orders: number
  completed_subscription_money: number
  quota_data_records: number
  quota_data_requests: number
  billed_quota: number
  billed_local: number
  user_subscriptions: number
  used_redemptions: number
  checkins: number
  total_records: number
  latest_activity_at: number
}

export interface ProfitDeletedUserRecordsPreview {
  currency: ProfitCurrencyMeta
  summary: ProfitDeletedUserOrphanSummary
  users: ProfitDeletedUserOrphanUserItem[]
}

export interface ProfitDeletedUserCleanupRequest {
  user_id?: number
  include_topups?: boolean
  include_subscription_orders?: boolean
  include_quota_data?: boolean
  include_user_subscriptions?: boolean
  include_used_redemptions?: boolean
  include_checkins?: boolean
}

export interface ProfitDeletedUserCleanupResult {
  target_user_id: number
  topups_deleted: number
  subscription_orders_deleted: number
  quota_data_deleted: number
  user_subscriptions_deleted: number
  used_redemptions_deleted: number
  checkins_deleted: number
  total_deleted: number
}

export interface ProfitAnalyticsReport {
  currency: ProfitCurrencyMeta
  pricing_ref?: ProfitPricingReference
  cost_settings: ProfitAnalyticsSetting
  summary: ProfitSummary
  liability: ProfitLiabilitySnapshot
  orphaned_deleted_users?: ProfitDeletedUserOrphanSummary
  daily_trend: ProfitDailyTrendPoint[]
  channels: ProfitChannelBreakdown[]
  models: ProfitModelBreakdown[]
  groups: ProfitGroupBreakdown[]
  payment_methods: ProfitPaymentMethodBreakdown[]
  recent_orders: ProfitRecentOrderItem[]
}
