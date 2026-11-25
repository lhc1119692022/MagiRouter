import type { ViolationCaseStatus, ViolationRiskLevel } from '../types'

export function riskBadgeVariant(
  level: ViolationRiskLevel
): 'destructive' | 'default' | 'secondary' | 'outline' {
  switch (level) {
    case 'high':
      return 'destructive'
    case 'medium':
      return 'default'
    case 'low':
    case 'none':
      return 'secondary'
    default:
      return 'outline'
  }
}

export function caseStatusBadgeVariant(
  status: ViolationCaseStatus
): 'destructive' | 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'banned':
      return 'destructive'
    case 'pending_verdict':
      return 'default'
    case 'pending_audit':
      return 'outline'
    case 'dismissed':
    case 'allowlisted':
      return 'secondary'
  }
}
