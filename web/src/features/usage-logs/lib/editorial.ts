export type LogsStatusTone = 'success' | 'running' | 'warn' | 'err' | 'muted'

export function parseTaskProgressPercent(raw?: string | null): number | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^(\d+(?:\.\d+)?)%?$/)
  if (!match) return null
  const parsed = Number.parseFloat(match[1])
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

export function mapTaskStatusToTone(status?: string): LogsStatusTone {
  switch ((status ?? '').toUpperCase()) {
    case 'SUCCESS':
      return 'success'
    case 'IN_PROGRESS':
      return 'running'
    case 'QUEUED':
    case 'SUBMITTED':
    case 'MODAL':
      return 'warn'
    case 'FAILURE':
      return 'err'
    default:
      return 'muted'
  }
}
