import type { UptimeMonitor } from '../types'

export function monitorHealth(monitors: UptimeMonitor[]): {
  label: string
  tone: string
} {
  if (!monitors.length) return { label: 'Awaiting data', tone: 'unknown' }
  if (monitors.every((item) => item.status === 0)) {
    return { label: 'Outage', tone: 'error' }
  }
  if (monitors.every((item) => item.status === 3)) {
    return { label: 'Maintenance', tone: 'warning' }
  }
  if (monitors.some((item) => item.status === 0 || item.status === 3)) {
    return { label: 'Degraded', tone: 'warning' }
  }
  if (monitors.some((item) => item.status !== 1)) {
    return { label: 'Awaiting data', tone: 'unknown' }
  }
  return { label: 'Operational', tone: 'healthy' }
}

export function measuredAvailability(
  monitor: UptimeMonitor
): number | undefined {
  if (
    monitor.uptimeKnown === false ||
    !Number.isFinite(monitor.uptime) ||
    monitor.uptime < 0 ||
    monitor.uptime > 1
  ) {
    return undefined
  }
  if (monitor.uptimeKnown === undefined && monitor.uptime === 0) {
    return undefined
  }
  return monitor.uptime
}
