import type { AxiosRequestConfig } from 'axios'

import type { ApiResponse } from '@/features/profile/types'
import { api } from '@/lib/api'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

import type {
  PaginatedResult,
  ViolationAccountCase,
  ViolationAllowlistEntry,
  ViolationAuditBatchSummary,
  ViolationAuditSettings,
  ViolationCaseDetail,
  ViolationConnectionTestResult,
  ViolationEvent,
  ViolationOverviewResponse,
  ViolationVerdictDecision,
} from './types'

function securityProofConfig(proofToken?: string): AxiosRequestConfig {
  if (!proofToken) return {}
  return {
    headers: { 'X-Security-Proof': proofToken },
    singleUseAuthorization: true,
  }
}

function unwrapResponse<T>(envelope: ApiResponse<T>): T {
  const checked = requireServerSuccess(envelope)
  if (checked.data === undefined) {
    throw createServerError(checked)
  }
  return checked.data
}

export async function getViolationOverview(): Promise<ViolationOverviewResponse> {
  const res = await api.get<ApiResponse<ViolationOverviewResponse>>(
    '/api/violation_audit/overview'
  )
  return unwrapResponse(res.data)
}

export async function listViolationCases(params: {
  status?: string
  risk_level?: string
  keyword?: string
  p?: number
  page_size?: number
}): Promise<PaginatedResult<ViolationAccountCase>> {
  const res = await api.get<ApiResponse<PaginatedResult<ViolationAccountCase>>>(
    '/api/violation_audit/cases',
    { params }
  )
  return unwrapResponse(res.data)
}

export async function getViolationCaseDetail(
  caseId: number
): Promise<ViolationCaseDetail> {
  const res = await api.get<ApiResponse<ViolationCaseDetail>>(
    `/api/violation_audit/cases/${caseId}`
  )
  return unwrapResponse(res.data)
}

export async function runViolationCaseAudit(
  caseId: number
): Promise<ViolationAccountCase> {
  const res = await api.post<ApiResponse<ViolationAccountCase>>(
    `/api/violation_audit/cases/${caseId}/audit`
  )
  return unwrapResponse(res.data)
}

export async function submitViolationCaseVerdict(
  caseId: number,
  payload: { decision: ViolationVerdictDecision; note: string },
  proofToken?: string
): Promise<ViolationAccountCase> {
  const res = await api.post<ApiResponse<ViolationAccountCase>>(
    `/api/violation_audit/cases/${caseId}/verdict`,
    payload,
    securityProofConfig(proofToken)
  )
  return unwrapResponse(res.data)
}

export async function listViolationEvents(params: {
  username?: string
  plugin?: string
  category?: string
  keyword?: string
  p?: number
  page_size?: number
}): Promise<PaginatedResult<ViolationEvent>> {
  const res = await api.get<ApiResponse<PaginatedResult<ViolationEvent>>>(
    '/api/violation_audit/events',
    { params }
  )
  return unwrapResponse(res.data)
}

export async function deleteViolationEvent(eventId: number): Promise<void> {
  const res = await api.delete<ApiResponse>(
    `/api/violation_audit/events/${eventId}`
  )
  requireServerSuccess(res.data)
}

export async function listViolationAllowlist(params: {
  keyword?: string
  p?: number
  page_size?: number
}): Promise<PaginatedResult<ViolationAllowlistEntry>> {
  const res = await api.get<
    ApiResponse<PaginatedResult<ViolationAllowlistEntry>>
  >('/api/violation_audit/allowlist', { params })
  return unwrapResponse(res.data)
}

export async function addViolationAllowlist(payload: {
  user_id: number
  reason: string
}): Promise<ViolationAllowlistEntry> {
  const res = await api.post<ApiResponse<ViolationAllowlistEntry>>(
    '/api/violation_audit/allowlist',
    payload
  )
  return unwrapResponse(res.data)
}

export async function removeViolationAllowlist(userId: number): Promise<void> {
  const res = await api.delete<ApiResponse>(
    `/api/violation_audit/allowlist/${userId}`
  )
  requireServerSuccess(res.data)
}

export async function getViolationAuditSettings(): Promise<ViolationAuditSettings> {
  const res = await api.get<ApiResponse<ViolationAuditSettings>>(
    '/api/violation_audit/settings'
  )
  return unwrapResponse(res.data)
}

export async function updateViolationAuditSettings(
  payload: ViolationAuditSettings
): Promise<ViolationAuditSettings> {
  const res = await api.put<ApiResponse<ViolationAuditSettings>>(
    '/api/violation_audit/settings',
    payload
  )
  return unwrapResponse(res.data)
}

export async function runViolationAuditNow(): Promise<ViolationAuditBatchSummary> {
  const res = await api.post<ApiResponse<ViolationAuditBatchSummary>>(
    '/api/violation_audit/run'
  )
  return unwrapResponse(res.data)
}

export async function testViolationAuditConnection(
  payload: ViolationAuditSettings
): Promise<ViolationConnectionTestResult> {
  const res = await api.post<ApiResponse<ViolationConnectionTestResult>>(
    '/api/violation_audit/test_connection',
    payload
  )
  return unwrapResponse(res.data)
}
