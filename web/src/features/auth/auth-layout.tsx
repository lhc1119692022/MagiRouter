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
import { Link, useLocation } from '@tanstack/react-router'
import { ChevronLeft, Lock, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { MagiRouterWordmark } from '@/components/layout/components/magirouter-wordmark'
import { useTheme } from '@/context/theme-provider'
import { OFFICIAL_DOMAINS } from '@/features/docs/data/docs-data'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const { resolvedTheme, setTheme } = useTheme()
  const [copiedHost, setCopiedHost] = useState<string | null>(null)

  const isSignUpPage = location.pathname.includes('sign-up')

  useEffect(() => {
    document.body.dataset.currentPage = 'auth'
    return () => {
      if (document.body.dataset.currentPage === 'auth') {
        delete document.body.dataset.currentPage
      }
    }
  }, [])

  const handleCopyHost = async (hostUrl: string) => {
    try {
      await navigator.clipboard.writeText(hostUrl)
      setCopiedHost(hostUrl)
      window.setTimeout(() => {
        setCopiedHost((current) => (current === hostUrl ? null : current))
      }, 1600)
    } catch {
      // ignore clipboard errors
    }
  }

  const handleToggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <section className='auth-shell' aria-label={t('Account Authentication')}>
      <svg
        className='auth-backdrop'
        viewBox='0 0 1440 900'
        preserveAspectRatio='xMidYMid slice'
        aria-hidden='true'
      >
        <circle
          cx='720'
          cy='440'
          r='280'
          fill='none'
          stroke='currentColor'
          strokeWidth='1'
        />
        <circle
          cx='720'
          cy='440'
          r='420'
          fill='none'
          stroke='currentColor'
          strokeWidth='1'
        />
        <circle
          cx='720'
          cy='440'
          r='580'
          fill='none'
          stroke='currentColor'
          strokeWidth='1'
        />
        <line
          x1='0'
          y1='440'
          x2='1440'
          y2='440'
          stroke='currentColor'
          strokeWidth='0.75'
          strokeDasharray='4 8'
        />
        <line
          x1='720'
          y1='0'
          x2='720'
          y2='900'
          stroke='currentColor'
          strokeWidth='0.75'
          strokeDasharray='4 8'
        />
      </svg>

      <header className='auth-topbar'>
        <div className='auth-topbar-left'>
          <Link to='/' className='brand-lockup' aria-label='MagiRouter 首页'>
            <MagiRouterWordmark />
          </Link>
          <span className='auth-topbar-sep' aria-hidden='true' />
          <Link to='/' className='auth-back-btn'>
            <ChevronLeft className='size-3.5' />
            <span>返回首页</span>
          </Link>
        </div>

        <div className='auth-topbar-right'>
          <span className='auth-topbar-hint'>
            {isSignUpPage ? '已有账户？' : '还没有账户？'}
          </span>
          <Link
            to={isSignUpPage ? '/sign-in' : '/sign-up'}
            className='el-btn el-btn-sm el-btn-white'
          >
            {isSignUpPage ? t('Sign in') : t('Sign up')}
          </Link>
          <LanguageSwitcher />
          <button
            type='button'
            className='theme-toggle-btn'
            aria-label={
              resolvedTheme === 'dark' ? '切换浅色主题' : '切换暗色主题'
            }
            aria-pressed={resolvedTheme === 'dark'}
            title={resolvedTheme === 'dark' ? '切换浅色主题' : '切换暗色主题'}
            onClick={handleToggleTheme}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className='size-4' />
            ) : (
              <Moon className='size-4' />
            )}
          </button>
        </div>
      </header>

      <main className='auth-stage'>
        <div className='auth-split-shell'>
          <aside
            className='auth-domains-banner'
            role='note'
            aria-label='官方可用访问域名'
          >
            <div className='auth-domains-head'>
              <span className='auth-domains-title'>
                <Lock className='size-3.5 shrink-0' />
                <span>官方访问域名</span>
              </span>
              <span className='auth-domains-hint'>
                任一入口均可登录，建议收藏备用
              </span>
            </div>
            <div className='auth-domains-grid'>
              {OFFICIAL_DOMAINS.map((domain, domainIndex) => (
                <div key={domain.host} className='auth-domain-chip'>
                  <div className='auth-domain-top'>
                    <span
                      className={
                        domainIndex === 0
                          ? 'auth-domain-tag is-primary'
                          : 'auth-domain-tag'
                      }
                    >
                      {domain.label}
                    </span>
                    <span className='auth-domain-url'>{domain.host}</span>
                  </div>
                  <button
                    type='button'
                    className='auth-domain-copy'
                    onClick={() => void handleCopyHost(domain.host)}
                  >
                    {copiedHost === domain.host ? '已复制' : '复制'}
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <div className='auth-card'>{children}</div>
        </div>
      </main>
    </section>
  )
}
