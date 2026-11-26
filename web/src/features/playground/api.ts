/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { resolveApiKeyValue } from '@/features/keys/api'
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import { API_ENDPOINTS } from './constants'
import {
  buildProtocolRequestBody,
  getProtocolEndpointPath,
  getProtocolRequestHeaders,
} from './lib/streaming/protocol'
import type {
  ChatCompletionRequest,
  ModelOption,
  GroupOption,
  ResolvedChatApiProtocol,
} from './types'

/**
 * Send chat completion request (non-streaming)
 */
export async function sendChatCompletion(
  payload: ChatCompletionRequest,
  signal?: AbortSignal,
  keyId?: number | null,
  protocol: ResolvedChatApiProtocol = 'openai_chat'
): Promise<unknown> {
  if (keyId == null || !Number.isSafeInteger(keyId) || keyId <= 0) {
    throw new Error('Select an API key')
  }
  const key = await resolveApiKeyValue(keyId)
  const endpointPath = getProtocolEndpointPath(protocol, payload.model, false)
  const wireBody = buildProtocolRequestBody(protocol, {
    ...payload,
    stream: false,
  })
  const response = await fetch(endpointPath, {
    method: 'POST',
    redirect: 'error',
    credentials: 'omit',
    signal,
    headers: getProtocolRequestHeaders(protocol, key),
    body: JSON.stringify(wireBody),
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result?.error?.message || `HTTP ${response.status}`)
  }
  return result
}

/**
 * Get user available models
 */
export async function getUserModels(
  group: string,
  billingKeyId?: number | null,
  includeChatControls = !!group
): Promise<ModelOption[]> {
  const res = await api.get(API_ENDPOINTS.USER_MODELS, {
    params: {
      group,
      include_chat_controls: includeChatControls || undefined,
      billing_key_id: billingKeyId ?? undefined,
    },
  })
  const { data } = res
  requireServerSuccess(data)

  if (
    billingKeyId != null &&
    (data.billing_key_id !== billingKeyId || data.group !== group)
  ) {
    throw new Error('Selected key is unavailable')
  }

  if (!data.success || !Array.isArray(data.data)) {
    return []
  }

  return data.data.map((model: string) => ({
    label: model,
    value: model,
    chatControls: data.chat_controls?.[model],
    modelLimitNames: data.model_limit_names?.[model],
  }))
}

export async function getPlaygroundKeyScope(
  keyId: number,
  expectedGroup?: string,
  signal?: AbortSignal
) {
  const response = await api.get(API_ENDPOINTS.USER_MODELS, {
    // Each key selection needs its own cancellable permissions request.
    disableDuplicate: true,
    signal,
    params: { billing_key_id: keyId, include_chat_controls: true },
  })
  const data = requireServerSuccess(response.data)
  if (
    data.billing_key_id !== keyId ||
    typeof data.group !== 'string' ||
    !data.group.trim() ||
    (expectedGroup && expectedGroup !== data.group) ||
    !Array.isArray(data.data) ||
    !data.data.every((name: unknown) => typeof name === 'string' && name.trim())
  ) {
    throw new Error('Selected key is unavailable')
  }
  const models: ModelOption[] = data.data.map((value: string) => ({
    value,
    label: value,
    chatControls: data.chat_controls?.[value],
  }))
  return { keyId, group: data.group as string, models }
}

/**
 * Get user groups
 */
export async function getUserGroups(): Promise<GroupOption[]> {
  const res = await api.get(API_ENDPOINTS.USER_GROUPS)
  const { data } = res
  requireServerSuccess(data)

  if (!data.success || !data.data) {
    return []
  }

  const groupData = data.data as Record<
    string,
    { desc: string; ratio: number | string }
  >

  // label is for button display (name only); desc is for dropdown content
  return Object.entries(groupData).map(([group, info]) => ({
    label: group,
    value: group,
    ratio: info.ratio,
    desc: info.desc,
  }))
}
