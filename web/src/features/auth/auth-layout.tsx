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
import { ChevronLeft, Inbox, Lock, Mail, Moon, Sun } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { MagiRouterWordmark } from '@/components/layout/components/magirouter-wordmark'
import { useTheme } from '@/context/theme-provider'
import { useApiInfo } from '@/features/dashboard/hooks/use-status-data'
import { isPublishableApiUrl } from '@/features/dashboard/lib/api-info'
import { resolveBaseUrl } from '@/features/magirouter-home/lib/snippets'
import { useStatus } from '@/hooks/use-status'

type OfficialDomainEntry = {
  label: string
  host: string
  scene?: string
}

function normalizeAccessHost(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '')
  try {
    const parsed = new URL(trimmed)
    const cleanPath = parsed.pathname.replace(/\/+$/, '')
    if (!cleanPath || cleanPath === '/' || cleanPath.toLowerCase() === '/v1') {
      return parsed.origin
    }
    return `${parsed.origin}${cleanPath.replace(/\/v1$/i, '')}`
  } catch {
    return trimmed.replace(/\/v1$/i, '')
  }
}

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const { resolvedTheme, setTheme } = useTheme()
  const { status } = useStatus()
  const apiInfo = useApiInfo()
  const [copiedHost, setCopiedHost] = useState<string | null>(null)

  const isSignUpPage = location.pathname.includes('sign-up')
  const showAuthDomains = Boolean(
    status?.auth_domains_enabled ?? status?.data?.auth_domains_enabled
  )

  const officialDomains = useMemo<OfficialDomainEntry[]>(() => {
    const statusDomains = status?.auth_domains ?? status?.data?.auth_domains
    const source =
      Array.isArray(statusDomains) && statusDomains.length > 0
        ? statusDomains
        : apiInfo.items
    const seen = new Set<string>()
    const entries: OfficialDomainEntry[] = []

    for (const item of source) {
      const rawUrl = typeof item?.url === 'string' ? item.url.trim() : ''
      if (!rawUrl || !isPublishableApiUrl(rawUrl)) continue
      const host = normalizeAccessHost(rawUrl)
      if (!host || seen.has(host)) continue
      seen.add(host)
      entries.push({
        label:
          (typeof item.route === 'string' && item.route.trim()) ||
          (entries.length === 0 ? t('Primary route') : t('Backup route')),
        host,
        scene:
          typeof item.description === 'string'
            ? item.description.trim()
            : undefined,
      })
    }

    if (entries.length > 0) {
      return entries
    }

    const fallbackHost = resolveBaseUrl(
      status?.server_address ?? status?.data?.server_address
    )
    return fallbackHost
      ? [
          {
            label: t('Primary route'),
            host: fallbackHost,
          },
        ]
      : []
  }, [
    apiInfo.items,
    status?.auth_domains,
    status?.data?.auth_domains,
    status?.data?.server_address,
    status?.server_address,
    t,
  ])

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
        <div
          className={`auth-split-shell${showAuthDomains ? '' : ' is-editorial'}`}
        >
          {showAuthDomains ? (
            <aside
              className='auth-domains-banner'
              role='note'
              aria-label={t('Official access domains')}
            >
              <div className='auth-domains-head'>
                <span className='auth-domains-title'>
                  <Lock className='size-3.5 shrink-0' />
                  <span>{t('Official access domains')}</span>
                </span>
                <span className='auth-domains-hint'>
                  {t('Sign in from any official entry and bookmark for backup')}
                </span>
              </div>
              <div className='auth-domains-grid'>
                {officialDomains.map((domain, domainIndex) => (
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
                      {copiedHost === domain.host ? t('Copied') : t('Copy')}
                    </button>
                  </div>
                ))}
              </div>
            </aside>
          ) : (
            <aside
              className='auth-editorial-panel'
              role='note'
              aria-label={t('Platform highlights and sign-up guide')}
            >
              <div className='auth-editorial-head'>
                <span className='auth-editorial-eyebrow'>MAGIROUTER</span>
                <h2 className='auth-editorial-title'>
                  {t('One API Key.')}
                  <br />
                  {t('Every Frontier AI.')}
                </h2>
              </div>

              <ul className='auth-editorial-points'>
                <li className='auth-editorial-point'>
                  <span className='auth-editorial-index'>01</span>
                  <span className='auth-editorial-point-text'>
                    {t('Multi-modal · OpenAI / Claude / Gemini native')}
                  </span>
                </li>
                <li className='auth-editorial-point'>
                  <span className='auth-editorial-index'>02</span>
                  <span className='auth-editorial-point-text'>
                    {t('1:1 transparent billing · Zero charge on failures')}
                  </span>
                </li>
                <li className='auth-editorial-point'>
                  <span className='auth-editorial-index'>03</span>
                  <span className='auth-editorial-point-text'>
                    {t('Smart multi-node routing · Auto failover')}
                  </span>
                </li>
              </ul>

              <div className='auth-editorial-notices'>
                <div className='auth-editorial-note'>
                  <Mail className='size-4' />
                  <span>
                    {t(
                      'Registration currently supports QQ Mail (@qq.com) only'
                    )}
                  </span>
                </div>
                <div className='auth-editorial-note is-warn'>
                  <Inbox className='size-4' />
                  <span>
                    {t(
                      'Missing verification code? Check your Spam / Trash folder'
                    )}
                  </span>
                </div>
              </div>
            </aside>
          )}

          <div className='auth-card'>{children}</div>
        </div>
      </main>
    </section>
  )
}
