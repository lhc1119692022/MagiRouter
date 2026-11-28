import { ENDPOINT_HTTP_METHODS } from '../constants'
import type { BatchEndpointsMode, Model } from '../types'
import { formatEndpointsDisplay } from './model-utils'

export type EndpointsActionMode = 'unchanged' | BatchEndpointsMode

export type BatchEndpointsValidationResult =
  | { valid: true }
  | { valid: false; reason: 'empty' | 'invalid'; messageKey?: string }

export interface SelectedModelEndpointsSummary {
  configuredModelCount: number
  endpointCounts: Array<{ key: string; count: number }>
  modelsWithEndpoints: Model[]
}

const VALID_HTTP_METHODS = new Set<string>(ENDPOINT_HTTP_METHODS)

export function normalizeEndpointKeyList(keys: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of keys) {
    const key = raw.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(key)
  }
  return result
}

export function validateBatchEndpointsInput(
  mode: EndpointsActionMode,
  endpointsValue: string,
  removeKeys: string[]
): BatchEndpointsValidationResult {
  if (mode === 'unchanged' || mode === 'clear') {
    return { valid: true }
  }

  if (mode === 'remove') {
    if (normalizeEndpointKeyList(removeKeys).length === 0) {
      return { valid: false, reason: 'empty' }
    }
    return { valid: true }
  }

  const trimmed = endpointsValue.trim()
  if (!trimmed) {
    return { valid: false, reason: 'empty' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return {
      valid: false,
      reason: 'invalid',
      messageKey: 'Endpoints must be valid JSON',
    }
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return { valid: false, reason: 'empty' }
    }
    for (const item of parsed) {
      if (typeof item !== 'string' || !item.trim()) {
        return {
          valid: false,
          reason: 'invalid',
          messageKey: 'Endpoint types must be non-empty strings',
        }
      }
    }
    return { valid: true }
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      valid: false,
      reason: 'invalid',
      messageKey: 'Endpoints must be a JSON object or array',
    }
  }

  const entries = Object.entries(parsed)
  if (entries.length === 0) {
    return { valid: false, reason: 'empty' }
  }

  for (const [key, details] of entries) {
    if (!key.trim()) {
      return {
        valid: false,
        reason: 'invalid',
        messageKey: 'Endpoint type is required',
      }
    }
    if (typeof details === 'string') {
      if (!details.startsWith('/')) {
        return {
          valid: false,
          reason: 'invalid',
          messageKey: 'Endpoint paths must start with /',
        }
      }
      continue
    }
    if (!details || typeof details !== 'object' || Array.isArray(details)) {
      return {
        valid: false,
        reason: 'invalid',
        messageKey: 'Endpoint configuration must be a path or object',
      }
    }
    const record = details as Record<string, unknown>
    if (typeof record.path !== 'string' || !record.path.startsWith('/')) {
      return {
        valid: false,
        reason: 'invalid',
        messageKey: 'Endpoint paths must start with /',
      }
    }
    if (record.method !== undefined) {
      if (
        typeof record.method !== 'string' ||
        !VALID_HTTP_METHODS.has(record.method)
      ) {
        return {
          valid: false,
          reason: 'invalid',
          messageKey: 'Invalid endpoint HTTP method',
        }
      }
    }
  }

  return { valid: true }
}

export function summarizeSelectedModelEndpoints(
  models: Model[]
): SelectedModelEndpointsSummary {
  const counts = new Map<string, number>()
  const modelsWithEndpoints: Model[] = []
  let configuredModelCount = 0

  for (const model of models) {
    const keys = normalizeEndpointKeyList(
      formatEndpointsDisplay(model.endpoints)
    )
    if (keys.length === 0) continue
    configuredModelCount += 1
    modelsWithEndpoints.push(model)
    for (const key of keys) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  const endpointCounts = [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count
      return left.key.localeCompare(right.key)
    })

  return {
    configuredModelCount,
    endpointCounts,
    modelsWithEndpoints,
  }
}
