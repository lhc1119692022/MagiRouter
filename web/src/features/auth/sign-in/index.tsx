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
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { SitePopupHost } from '@/components/site-popup-host'
import { useStatus } from '@/hooks/use-status'
import { useAuthStore } from '@/stores/auth-store'

import { AuthLayout } from '../auth-layout'
import { TermsFooter } from '../components/terms-footer'
import {
  isStandaloneAppRedirect,
  sanitizeAuthRedirect,
} from '../lib/auth-redirect'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { t } = useTranslation()
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })
  const { status } = useStatus()
  const navigate = useNavigate()
  const userId = useAuthStore((state) => state.auth.user?.id)

  // 后台会话复核完成后补一次跳转（进入页面时可能还没有内存会话）。
  useEffect(() => {
    if (!userId) return
    const target =
      sanitizeAuthRedirect(redirect, window.location.origin) ?? '/dashboard'
    if (isStandaloneAppRedirect(target)) {
      window.location.replace(target)
      return
    }
    void navigate({ href: target, replace: true })
  }, [navigate, redirect, userId])

  return (
    <AuthLayout>
      <div className='w-full space-y-8'>
        <div className='space-y-2'>
          <h2 className='text-center text-2xl font-semibold tracking-tight sm:text-left'>
            {t('Sign in')}
          </h2>
          {!status?.self_use_mode_enabled &&
            status?.register_enabled !== false && (
              <p className='text-muted-foreground text-left text-sm sm:text-base'>
                {t("Don't have an account?")}{' '}
                <Link
                  to='/sign-up'
                  className='hover:text-primary font-medium underline underline-offset-4'
                >
                  {t('Sign up')}
                </Link>
                .
              </p>
            )}
        </div>

        <UserAuthForm redirectTo={redirect} />

        <TermsFooter
          variant='sign-in'
          status={status}
          className='text-center'
        />
      </div>
      <SitePopupHost trigger='sign_in' />
    </AuthLayout>
  )
}
