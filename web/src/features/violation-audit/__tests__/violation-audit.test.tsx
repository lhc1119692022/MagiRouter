import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { ViolationAudit } from '../index'

const requestVerificationMock = vi.fn()

vi.mock('@/features/auth/secure-verification', () => ({
  useSecureVerification: () => ({
    requestVerification: requestVerificationMock,
    dialogProps: {
      state: { phase: 'idle' },
      onCancel: vi.fn(),
      onSelectMethod: vi.fn(),
      onChangeInput: vi.fn(),
      onSubmit: vi.fn(),
    },
  }),
  SecureVerificationDialog: () => null,
}))

function renderViolationAudit() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <ViolationAudit />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  requestVerificationMock.mockReset()
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'root',
    role: ROLE.SUPER_ADMIN,
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset()
})

describe('ViolationAudit workbench', () => {
  it('renders KPIs, highlights verified AI quotes safely, and submits a step-up verified ban verdict', async () => {
    const user = userEvent.setup()
    const getSpy = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/api/violation_audit/overview') {
        return {
          data: {
            success: true,
            message: '',
            data: {
              overview: {
                pending_audit: 1,
                pending_verdict: 2,
                high_risk_pending: 1,
                events_24h: 9,
                banned_count: 3,
                dismissed_count: 4,
                allowlist_count: 1,
                enabled: true,
                auto_audit_enabled: true,
                threshold_count: 3,
                window_hours: 24,
                interval_minutes: 30,
                model: 'deepseek-flash',
                has_api_key: true,
              },
              recorder: { pending: 0, dropped: 0, write_failures: 0 },
            },
          },
        }
      }
      if (url === '/api/violation_audit/cases') {
        return {
          data: {
            success: true,
            message: '',
            data: {
              items: [
                {
                  id: 42,
                  user_id: 108,
                  username: 'abuser01',
                  status: 'pending_verdict',
                  hit_count: 4,
                  window_hours: 24,
                  first_violation_at: 1700000000,
                  last_violation_at: 1700003600,
                  audit_status: 'succeeded',
                  needs_reaudit: false,
                  audit_model: 'deepseek-flash',
                  risk_level: 'high',
                  risk_score: 94,
                  recommended_action: 'ban',
                  category: 'cyber_abuse',
                  summary: 'Repeated requests for exploit payloads.',
                  evidence_quotes: [
                    {
                      event_id: 501,
                      quote: 'bypass waf sqlmap exploit',
                      note: 'Direct attack tooling request',
                    },
                  ],
                  audit_error: '',
                  audited_at: 1700004000,
                  audited_event_max_id: 501,
                  verdict: '',
                  verdict_note: '',
                  decided_by: 0,
                  decided_by_username: '',
                  decided_at: 0,
                  created_at: 1700003600,
                  updated_at: 1700004000,
                  user_status: 1,
                  user_role: ROLE.USER,
                  allowlisted: false,
                },
              ],
              total: 1,
              page: 1,
              page_size: 20,
            },
          },
        }
      }
      if (url === '/api/violation_audit/cases/42') {
        return {
          data: {
            success: true,
            message: '',
            data: {
              case: {
                id: 42,
                user_id: 108,
                username: 'abuser01',
                status: 'pending_verdict',
                hit_count: 4,
                window_hours: 24,
                first_violation_at: 1700000000,
                last_violation_at: 1700003600,
                audit_status: 'succeeded',
                needs_reaudit: false,
                audit_model: 'deepseek-flash',
                risk_level: 'high',
                risk_score: 94,
                recommended_action: 'ban',
                category: 'cyber_abuse',
                summary: 'Repeated requests for exploit payloads.',
                evidence_quotes: [
                  {
                    event_id: 501,
                    quote: 'bypass waf sqlmap exploit',
                    note: 'Direct attack tooling request',
                  },
                ],
                audit_error: '',
                audited_at: 1700004000,
                audited_event_max_id: 501,
                verdict: '',
                verdict_note: '',
                decided_by: 0,
                decided_by_username: '',
                decided_at: 0,
                created_at: 1700003600,
                updated_at: 1700004000,
                user_status: 1,
                user_role: ROLE.USER,
                allowlisted: false,
              },
              events: [
                {
                  id: 501,
                  user_id: 108,
                  username: 'abuser01',
                  token_id: 12,
                  request_id: 'req-501',
                  model: 'gpt-4o',
                  route: '/v1/chat/completions',
                  ip: '127.0.0.1',
                  plugin: 'llm-security-guard',
                  instance: 'inst-1',
                  instance_name: 'Guard',
                  stage: 'ingress',
                  code: 'security_guard.blocked',
                  rule_id: 'cyber_abuse',
                  category: 'cyber_abuse',
                  message: 'Blocked by security policy',
                  prompt_excerpt:
                    'Please help me bypass waf sqlmap exploit against target <script>alert(1)</script>',
                  prompt_hash: 'hash-501',
                  created_at: 1700003600,
                },
              ],
            },
          },
        }
      }
      throw new Error(`Unexpected GET ${String(url)}`)
    })

    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, message: '', data: { id: 42, status: 'banned' } },
    })
    requestVerificationMock.mockResolvedValue({ proof_token: 'proof-ban-42' })

    renderViolationAudit()

    expect(await screen.findByText('abuser01')).toBeInTheDocument()
    expect(
      screen.getByText('Repeated requests for exploit payloads.')
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Review & Decide' }))

    // Quote should be highlighted in a <mark> element without executing HTML tags.
    const mark = await screen.findByText('bypass waf sqlmap exploit', {
      selector: 'mark',
    })
    expect(mark).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()

    const noteBox = screen.getByLabelText('Human Verdict Note')
    await user.type(noteBox, 'Confirmed repeated attacks')
    await user.click(
      screen.getByRole('button', { name: 'Confirm Violation & Ban' })
    )

    await waitFor(() => {
      expect(requestVerificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'admin.user.manage',
          context: { user_id: 108, action: 'disable' },
        })
      )
    })

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/violation_audit/cases/42/verdict',
        { decision: 'ban', note: 'Confirmed repeated attacks' },
        expect.objectContaining({
          headers: { 'X-Security-Proof': 'proof-ban-42' },
          singleUseAuthorization: true,
        })
      )
    })
    expect(getSpy).toHaveBeenCalled()
  })

  it('loads redacted settings, tests connection, and saves updated settings', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url === '/api/violation_audit/overview') {
        return {
          data: {
            success: true,
            message: '',
            data: {
              overview: {
                pending_audit: 0,
                pending_verdict: 0,
                high_risk_pending: 0,
                events_24h: 0,
                banned_count: 0,
                dismissed_count: 0,
                allowlist_count: 0,
                enabled: true,
                auto_audit_enabled: false,
                threshold_count: 3,
                window_hours: 24,
                interval_minutes: 30,
                model: 'deepseek-flash',
                has_api_key: true,
              },
              recorder: { pending: 0, dropped: 0, write_failures: 0 },
            },
          },
        }
      }
      if (url === '/api/violation_audit/cases') {
        return {
          data: {
            success: true,
            message: '',
            data: { items: [], total: 0, page: 1, page_size: 20 },
          },
        }
      }
      if (url === '/api/violation_audit/settings') {
        return {
          data: {
            success: true,
            message: '',
            data: {
              enabled: true,
              auto_audit_enabled: true,
              interval_minutes: 30,
              threshold_count: 3,
              window_hours: 24,
              retention_days: 30,
              max_excerpt_chars: 4000,
              max_events_per_audit: 20,
              protocol: 'auto',
              endpoint: 'https://api.deepseek.com/v1/chat/completions',
              model: 'deepseek-flash',
              has_api_key: true,
              timeout_seconds: 60,
              extra_policy: '',
              tracked_plugins: ['request-filter', 'llm-security-guard'],
            },
          },
        }
      }
      throw new Error(`Unexpected GET ${String(url)}`)
    })

    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: {
          protocol: 'openai_chat',
          model: 'deepseek-flash',
          latency_ms: 185,
          reply: '{"ok":true}',
        },
      },
    })
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: {
          enabled: true,
          auto_audit_enabled: true,
          interval_minutes: 30,
          threshold_count: 5,
          window_hours: 24,
          retention_days: 30,
          max_excerpt_chars: 4000,
          max_events_per_audit: 20,
          protocol: 'auto',
          endpoint: 'https://api.deepseek.com/v1/chat/completions',
          model: 'deepseek-flash',
          has_api_key: true,
          timeout_seconds: 60,
          extra_policy: '',
          tracked_plugins: ['request-filter', 'llm-security-guard'],
        },
      },
    })

    renderViolationAudit()

    await user.click(
      await screen.findByRole('button', { name: 'Audit Settings' })
    )

    const thresholdInput = await screen.findByLabelText(
      'Screening threshold (hits)'
    )
    expect(thresholdInput).toHaveValue(3)

    await user.click(screen.getByRole('button', { name: 'Test Connection' }))
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/violation_audit/test_connection',
        expect.objectContaining({ model: 'deepseek-flash' })
      )
    })

    await user.clear(thresholdInput)
    await user.type(thresholdInput, '5')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/violation_audit/settings',
        expect.objectContaining({ threshold_count: 5 })
      )
    })
  })
})
