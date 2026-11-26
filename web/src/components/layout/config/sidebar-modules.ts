export type SidebarModuleRef = readonly [section: string, module: string]

const routes: Record<string, SidebarModuleRef> = {
  '/playground': ['chat', 'playground'],
  '/dashboard': ['console', 'detail'],
  '/dashboard/overview': ['console', 'detail'],
  '/dashboard/models': ['console', 'boards'],
  '/dashboard/users': ['console', 'detail'],
  '/pricing': ['console', 'model_square'],
  '/keys': ['console', 'token'],
  '/channel-status': ['console', 'channel_status'],
  '/usage-logs': ['console', 'log'],
  '/usage-logs/common': ['console', 'log'],
  '/usage-logs/audit': ['console', 'audit'],
  '/usage-logs/drawing': ['console', 'midjourney'],
  '/usage-logs/task': ['console', 'task'],
  '/wallet': ['personal', 'topup'],
  '/profile': ['personal', 'personal'],
  '/security': ['personal', 'security'],
  '/about': ['personal', 'support'],
  '/docs': ['personal', 'docs'],
  '/channels': ['admin', 'channel'],
  '/upstream-balance': ['admin', 'upstream_balance'],
  '/models': ['admin', 'models'],
  '/models/metadata': ['admin', 'models'],
  '/models/deployments': ['admin', 'deployments'],
  '/users': ['admin', 'user'],
  '/redemption-codes': ['admin', 'redemption'],
  '/subscriptions': ['admin', 'subscription'],
  '/system-info': ['admin', 'system_info'],
  '/task-plugins': ['admin', 'task_plugins'],
  '/request-processing': ['admin', 'request_processing'],
  '/violation-audit': ['admin', 'violation_audit'],
  '/profit-analytics': ['admin', 'profit_analytics'],
  '/media-traffic': ['admin', 'media_traffic'],
  '/system-settings': ['admin', 'setting'],
  '/system-settings/site': ['admin', 'setting'],
}

export const CHAT_PRESETS_MODULE: SidebarModuleRef = ['chat', 'chat']

export function sidebarModuleForRoute(
  url: string | undefined
): SidebarModuleRef | undefined {
  return url ? routes[url] : undefined
}
