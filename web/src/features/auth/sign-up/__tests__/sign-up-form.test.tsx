import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, expect, test, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import zhCN from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'

import { SignUpForm } from '../components/sign-up-form'

vi.mock('@/features/auth/hooks/use-auth-redirect', () => ({
  useAuthRedirect: () => ({
    redirectToLogin: vi.fn(),
    handleLoginResult: vi.fn(),
  }),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('shows QQ-only email placeholder in Chinese and numeric code hints when email verification is enabled', async () => {
  const testI18n = createInstance()
  await testI18n.use(initReactI18next).init({
    lng: 'zhCN',
    fallbackLng: 'en',
    resources: {
      en,
      zhCN,
    },
    interpolation: {
      escapeValue: false,
    },
  })

  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        email_verification: true,
        turnstile_check: false,
      },
    },
  })

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={testI18n}>
        <SignUpForm />
      </I18nextProvider>
    </QueryClientProvider>
  )

  const emailInput = await screen.findByPlaceholderText('仅支持QQ邮箱')
  expect(emailInput).toHaveAttribute('type', 'email')

  const codeInput = await screen.findByPlaceholderText('验证码')
  expect(codeInput).toHaveAttribute('inputmode', 'numeric')
  expect(codeInput).toHaveAttribute('autocomplete', 'one-time-code')
})
