import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import {
  CAC_AI_COMPLIANCE_LABEL,
  CAC_AI_COMPLIANCE_URL,
  DEFAULT_PRIVACY_POLICY_MARKDOWN,
  DEFAULT_USER_AGREEMENT_MARKDOWN,
} from '@/lib/platform-legal-templates'
import { SITE_POPUP_PRESETS } from '@/lib/site-popups'
import { useAuthStore } from '@/stores/auth-store'

import { SitePopupHost } from '../site-popup-host'

function renderHost(
  trigger: 'sign_up' | 'console' | 'sign_in' | 'home',
  popups: object[],
  options?: { suppressed?: boolean }
) {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        site_popups: popups,
      },
    },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <SitePopupHost trigger={trigger} suppressed={options?.suppressed} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  useAuthStore.setState((state) => ({
    auth: { ...state.auth, user: null },
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('shows sign-up popup once per session and re-shows when version changes', async () => {
  const user = userEvent.setup()
  const popupV1 = {
    id: 'sign-up-qq',
    enabled: true,
    trigger: 'sign_up',
    title: '新站启航 · 注册提示',
    content: '目前仅支持 **QQ 邮箱** 注册。',
    tone: 'info',
    confirm_text: '我知道了',
    frequency: 'session',
    version: 1,
  }

  const first = renderHost('sign_up', [popupV1])
  expect(await screen.findByText('新站启航 · 注册提示')).toBeVisible()
  expect(document.body).toHaveTextContent('QQ 邮箱')

  await user.click(screen.getByRole('button', { name: '我知道了' }))
  await waitFor(() =>
    expect(screen.queryByText('新站启航 · 注册提示')).not.toBeInTheDocument()
  )
  first.unmount()

  const second = renderHost('sign_up', [popupV1])
  await waitFor(() =>
    expect(screen.queryByText('新站启航 · 注册提示')).not.toBeInTheDocument()
  )
  second.unmount()

  renderHost('sign_up', [{ ...popupV1, version: 2 }])
  expect(await screen.findByText('新站启航 · 注册提示')).toBeVisible()
})

test('requires checkbox agreement on mandatory console disclaimer and scopes acknowledgment per user', async () => {
  const user = userEvent.setup()
  const disclaimer = {
    id: 'console-disclaimer',
    enabled: true,
    trigger: 'console',
    title: '控制台免责声明',
    content: '请合规使用 API 服务。',
    tone: 'warning',
    confirm_text: '同意并进入',
    frequency: 'once',
    require_confirm: true,
    checkbox_label: '我已阅读并同意免责声明',
    version: 1,
  }

  useAuthStore.setState((state) => ({
    auth: {
      ...state.auth,
      user: { id: 101, username: 'alice' } as never,
    },
  }))

  const first = renderHost('console', [disclaimer])
  expect(await screen.findByText('控制台免责声明')).toBeVisible()

  const confirmBtn = screen.getByRole('button', { name: '同意并进入' })
  expect(confirmBtn).toBeDisabled()
  expect(
    screen.queryByRole('button', { name: 'Close' })
  ).not.toBeInTheDocument()

  await user.click(
    screen.getByRole('checkbox', { name: '我已阅读并同意免责声明' })
  )
  expect(confirmBtn).toBeEnabled()
  await user.click(confirmBtn)

  await waitFor(() =>
    expect(screen.queryByText('控制台免责声明')).not.toBeInTheDocument()
  )
  first.unmount()

  const repeatSameUser = renderHost('console', [disclaimer])
  await waitFor(() =>
    expect(screen.queryByText('控制台免责声明')).not.toBeInTheDocument()
  )
  repeatSameUser.unmount()

  useAuthStore.setState((state) => ({
    auth: {
      ...state.auth,
      user: { id: 202, username: 'bob' } as never,
    },
  }))
  renderHost('console', [disclaimer])
  expect(await screen.findByText('控制台免责声明')).toBeVisible()
})

test('does not display popups when suppressed', async () => {
  renderHost(
    'console',
    [
      {
        id: 'console-always',
        enabled: true,
        trigger: 'console',
        title: 'Should stay hidden',
        content: 'Hidden while editing popups.',
        frequency: 'always',
        version: 1,
      },
    ],
    { suppressed: true }
  )
  await waitFor(() =>
    expect(screen.queryByText('Should stay hidden')).not.toBeInTheDocument()
  )
})

test('renders clickable CAC compliance link and full agreement links inside console disclaimer preset', async () => {
  renderHost('console', [SITE_POPUP_PRESETS.console_disclaimer])

  expect(await screen.findByText('控制台使用须知与免责声明')).toBeVisible()

  const cacLink = screen.getByRole('link', { name: CAC_AI_COMPLIANCE_LABEL })
  expect(cacLink).toHaveAttribute('href', CAC_AI_COMPLIANCE_URL)
  expect(cacLink).toHaveAttribute('target', '_blank')
  expect(cacLink).toHaveAttribute('rel', 'noopener noreferrer')

  const agreementLink = screen.getByRole('link', {
    name: '《平台技术服务协议与合规使用声明》',
  })
  expect(agreementLink).toHaveAttribute('href', '/user-agreement')
})

test('provides comprehensive default user agreement and privacy policy templates', () => {
  expect(DEFAULT_USER_AGREEMENT_MARKDOWN).toContain(CAC_AI_COMPLIANCE_LABEL)
  expect(DEFAULT_USER_AGREEMENT_MARKDOWN).toContain(CAC_AI_COMPLIANCE_URL)
  expect(DEFAULT_USER_AGREEMENT_MARKDOWN).toContain(
    '人工智能生成合成内容标识办法'
  )
  expect(DEFAULT_USER_AGREEMENT_MARKDOWN).toContain('暂不支持开具')
  expect(DEFAULT_USER_AGREEMENT_MARKDOWN).toContain('阶梯式违规处罚机制')
  expect(DEFAULT_USER_AGREEMENT_MARKDOWN).toContain(
    '未成年人禁入与误购核实处理'
  )

  expect(DEFAULT_PRIVACY_POLICY_MARKDOWN).toContain('对话内容默认零留存')
  expect(DEFAULT_PRIVACY_POLICY_MARKDOWN).toContain('个人信息保护法')
  expect(DEFAULT_PRIVACY_POLICY_MARKDOWN).toContain('跨境数据传输')
  expect(DEFAULT_PRIVACY_POLICY_MARKDOWN).toContain(
    '您的个人信息权利与行使方式'
  )
  expect(DEFAULT_PRIVACY_POLICY_MARKDOWN).toContain('安全事件应急响应')
})
