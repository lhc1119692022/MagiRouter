import type { GroupChannelHealthStatus, GroupChannelStatusItem } from '../types'

function compareGroupChannelStatusDefault(
  left: GroupChannelStatusItem,
  right: GroupChannelStatusItem
): number {
  if (left.group === 'default' && right.group !== 'default') return -1
  if (right.group === 'default' && left.group !== 'default') return 1
  if (left.request_count !== right.request_count) {
    return right.request_count - left.request_count
  }
  if (left.group < right.group) return -1
  if (left.group > right.group) return 1
  return 0
}

export function sortGroupChannelStatusDefault(
  items: readonly GroupChannelStatusItem[]
): GroupChannelStatusItem[] {
  return [...items].sort(compareGroupChannelStatusDefault)
}

export function applyGroupChannelStatusOrder(
  items: readonly GroupChannelStatusItem[],
  customOrder: readonly string[]
): GroupChannelStatusItem[] {
  const orderIndex = new Map<string, number>()
  for (let index = 0; index < customOrder.length; index++) {
    const name = customOrder[index]
    if (!orderIndex.has(name)) {
      orderIndex.set(name, index)
    }
  }
  return [...items].sort((left, right) => {
    const leftIndex = orderIndex.get(left.group)
    const rightIndex = orderIndex.get(right.group)
    if (leftIndex !== undefined && rightIndex !== undefined) {
      return leftIndex - rightIndex
    }
    if (leftIndex !== undefined) return -1
    if (rightIndex !== undefined) return 1
    return compareGroupChannelStatusDefault(left, right)
  })
}

export function moveOrderItem(
  items: readonly string[],
  fromIndex: number,
  toIndex: number
): string[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return [...items]
  }
  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export function areStringListsEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false
  }
  return true
}

export function getGroupStatusBadgeMeta(status: GroupChannelHealthStatus): {
  label: string
  tone: string
  color: string
} {
  switch (status) {
    case 'operational':
      return { label: 'Operational', tone: 'healthy', color: '#10b981' }
    case 'degraded':
      return { label: 'Degraded', tone: 'warning', color: '#f59e0b' }
    case 'outage':
      return { label: 'Outage', tone: 'error', color: '#ef4444' }
    default:
      return { label: 'Awaiting data', tone: 'unknown', color: '#9ca3af' }
  }
}
