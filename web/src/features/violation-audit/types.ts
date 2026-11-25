export type ViolationCaseStatus =
  | 'pending_audit'
  | 'pending_verdict'
  | 'banned'
  | 'dismissed'
  | 'allowlisted'

export type ViolationAuditStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'

export type ViolationRiskLevel = 'high' | 'medium' | 'low' | 'none' | 'unknown'

export type ViolationVerdictDecision = 'ban' | 'dismiss' | 'allowlist'

export type ViolationAuditProtocol =
  | 'auto'
  | 'openai_chat'
  | 'openai_responses'
  | 'anthropic'
  | 'gemini'

export interface ViolationEvidenceQuote {
  event_id: number
  quote: string
  note?: string
}

export interface ViolationEvent {
  id: number
  user_id: number
  username: string
  token_id: number
  request_id: string
  model: string
  route: string
  ip: string
  plugin: string
  instance: string
  instance_name: string
  stage: string
  code: string
  rule_id: string
  category: string
  message: string
  prompt_excerpt: string
  prompt_hash: string
  created_at: number
}

export interface ViolationAccountCase {
  id: number
  user_id: number
  username: string
  status: ViolationCaseStatus
  hit_count: number
  window_hours: number
  first_violation_at: number
  last_violation_at: number
  audit_status: ViolationAuditStatus
  needs_reaudit: boolean
  audit_model: string
  risk_level: ViolationRiskLevel
  risk_score: number
  recommended_action: string
  category: string
  summary: string
  evidence_quotes: ViolationEvidenceQuote[]
  audit_error: string
  audited_at: number
  audited_event_max_id: number
  verdict: string
  verdict_note: string
  decided_by: number
  decided_by_username: string
  decided_at: number
  created_at: number
  updated_at: number
  user_status: number
  user_role: number
  allowlisted: boolean
}

export interface ViolationAllowlistEntry {
  id: number
  user_id: number
  username: string
  reason: string
  created_by: number
  created_by_username: string
  created_at: number
}

export interface ViolationAuditSettings {
  enabled: boolean
  auto_audit_enabled: boolean
  interval_minutes: number
  threshold_count: number
  window_hours: number
  retention_days: number
  max_excerpt_chars: number
  max_events_per_audit: number
  protocol: ViolationAuditProtocol
  endpoint: string
  model: string
  api_key?: string
  has_api_key: boolean
  clear_api_key?: boolean
  timeout_seconds: number
  extra_policy: string
  tracked_plugins: string[]
}

export interface ViolationAuditOverview {
  pending_audit: number
  pending_verdict: number
  high_risk_pending: number
  events_24h: number
  banned_count: number
  dismissed_count: number
  allowlist_count: number
  enabled: boolean
  auto_audit_enabled: boolean
  threshold_count: number
  window_hours: number
  interval_minutes: number
  model: string
  has_api_key: boolean
}

export interface ViolationRecorderStats {
  pending: number
  dropped: number
  write_failures: number
}

export interface ViolationOverviewResponse {
  overview: ViolationAuditOverview
  recorder: ViolationRecorderStats
}

export interface ViolationCaseDetail {
  case: ViolationAccountCase
  events: ViolationEvent[]
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface ViolationAuditBatchSummary {
  pruned_events: number
  screened_accounts: number
  audited_count: number
  succeeded_count: number
  failed_count: number
}

export interface ViolationConnectionTestResult {
  protocol: string
  model: string
  latency_ms: number
  reply: string
}
