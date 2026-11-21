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
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { SignOutDialog } from '@/components/sign-out-dialog'
import { useTheme } from '@/context/theme-provider'
import { useNotifications } from '@/hooks/use-notifications'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { useUserDisplay } from '@/hooks/use-user-display'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { defaultTopNavLinks } from '../config/top-nav.config'
import type { TopNavLink } from '../types'
import { MagiRouterWordmark } from './magirouter-wordmark'
import { MobileDrawer } from './mobile-drawer'
import { QuickModelSearchDialog } from './quick-model-search-dialog'

const BANNER_DISMISS_KEY = 'magirouter:banner:dismissed:v1'

export interface PublicHeaderProps {
  navContent?: ReactNode
  navLinks?: TopNavLink[]
  showThemeSwitch?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  logo?: ReactNode
  siteName?: string
  className?: string
  onToggleSidebar?: () => void
  sidebarCollapsed?: boolean
}

function stripText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function PublicHeader(props: PublicHeaderProps) {
  const {
    navContent,
    navLinks = defaultTopNavLinks,
    showThemeSwitch = true,
    showAuthButtons = true,
    showNotifications = true,
    logo: customLogo,
    siteName: customSiteName,
    className,
    onToggleSidebar,
    sidebarCollapsed = false,
  } = props

  const { t } = useTranslation()
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()
  const { auth } = useAuthStore()
  const { status } = useStatus()
  const { systemName, loading } = useSystemConfig()
  const dynamicLinks = useTopNavLinks()
  const notifications = useNotifications()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  const user = auth.user
  const isAuthenticated = Boolean(user)
  const { displayName, secondaryText, initials } = useUserDisplay(user)
  const links = dynamicLinks.length > 0 ? dynamicLinks : navLinks
  const isHome = pathname === '/' || pathname === ''

  const [bannerDismissed, setBannerDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.sessionStorage.getItem(BANNER_DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [searchOpen, setSearchOpen] = useState(false)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const createMenuRef = useRef<HTMLDivElement>(null)
  const notifyMenuRef = useRef<HTMLDivElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)

  const closeAllMenus = useCallback(() => {
    setCreateMenuOpen(false)
    setAccountMenuOpen(false)
    notifications.closePopover()
  }, [notifications])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        closeAllMenus()
        setSearchOpen((prev) => !prev)
      } else if (event.key === 'Escape') {
        closeAllMenus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeAllMenus])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (createMenuRef.current && !createMenuRef.current.contains(target)) {
        setCreateMenuOpen(false)
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false)
      }
      if (
        notifications.popoverOpen &&
        notifyMenuRef.current &&
        !notifyMenuRef.current.contains(target)
      ) {
        notifications.closePopover()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [notifications])

  const rawDocsLink =
    typeof status?.docs_link === 'string' ? status.docs_link.trim() : ''
  const isDefaultUpstreamDocs =
    rawDocsLink === 'https://docs.newapi.pro' ||
    rawDocsLink === 'https://docs.newapi.pro/'
  const externalDocsHref =
    rawDocsLink &&
    rawDocsLink !== '/docs' &&
    !isDefaultUpstreamDocs &&
    /^https?:\/\//i.test(rawDocsLink)
      ? rawDocsLink
      : ''

  const bannerMessage = useMemo(() => {
    const firstAnnouncement = notifications.announcements[0]
    if (firstAnnouncement) {
      const title =
        typeof firstAnnouncement.title === 'string'
          ? stripText(firstAnnouncement.title)
          : ''
      const content =
        typeof firstAnnouncement.content === 'string'
          ? stripText(firstAnnouncement.content)
          : ''
      const combined = title || content
      if (combined) return combined.slice(0, 96)
    }
    if (notifications.notice) {
      const firstLine = stripText(notifications.notice.split(/\r?\n/)[0] || '')
      if (firstLine) return firstLine.slice(0, 96)
    }
    return '主站 magirouter.com 稳定运行 · 1:1 汇率透明计费 · 上游报错自动免扣'
  }, [notifications.announcements, notifications.notice])

  const formattedBalance = useMemo(() => {
    if (!user) return '$0.00'
    return formatQuotaWithCurrency(user.quota)
  }, [user])

  const handleDismissBanner = () => {
    setBannerDismissed(true)
    try {
      window.sessionStorage.setItem(BANNER_DISMISS_KEY, '1')
    } catch {
      // Ignore storage errors
    }
  }

  const handleGoProtected = (targetPath: string) => {
    closeAllMenus()
    if (isAuthenticated) {
      void navigate({ to: targetPath })
      return
    }
    void navigate({
      to: '/sign-in',
      search: { redirect: targetPath },
    })
  }

  const handleToggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  const isRouteActive = (prefix: string) => {
    if (prefix === '/') return isHome
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
  }

  return (
    <>
      {!bannerDismissed && (
        <div
          id='announcement-bar'
          className='el-banner'
          role='region'
          aria-label={t('System Announcement')}
        >
          <svg
            className='el-banner-ear-left'
            viewBox='0 0 20 22'
            aria-hidden='true'
          >
            <path
              d='M20 2C8.95431 2 0 10.9543 0 22V0H20V2Z'
              fill='currentColor'
            />
          </svg>
          <svg
            className='el-banner-ear-right'
            viewBox='0 0 20 22'
            aria-hidden='true'
          >
            <path
              d='M0 2C11.0457 2 20 10.9543 20 22V0H0V2Z'
              fill='currentColor'
            />
          </svg>

          <div className='el-banner-inner'>
            <span className='el-banner-tag'>
              <svg
                width='13'
                height='13'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.9'
                strokeLinecap='round'
                strokeLinejoin='round'
                aria-hidden='true'
              >
                <path d='M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' />
                <path d='M10.3 21a1.94 1.94 0 0 0 3.4 0' />
              </svg>
              <span>站点通知</span>
            </span>
            <span className='el-banner-sep' />
            <span className='el-banner-text'>{bannerMessage}</span>
            {isAuthenticated && (
              <button
                type='button'
                className='el-banner-cta'
                onClick={() => {
                  closeAllMenus()
                  void navigate({ to: '/about' })
                }}
              >
                查看通知 →
              </button>
            )}
          </div>

          <button
            type='button'
            className='el-banner-close'
            onClick={handleDismissBanner}
            aria-label={t('Close')}
          >
            <svg
              width='16'
              height='16'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='1.75'
              strokeLinecap='round'
            >
              <path d='M18 6 6 18M6 6l12 12' />
            </svg>
          </button>
        </div>
      )}

      <header className={cn('site-header', className)} id='site-header'>
        <div className='el-container'>
          <nav className='site-nav' aria-label='主导航'>
            <div className='nav-left'>
              {onToggleSidebar && (
                <button
                  type='button'
                  className='sidebar-collapse-btn'
                  aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
                  aria-expanded={!sidebarCollapsed}
                  title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
                  onClick={onToggleSidebar}
                >
                  <svg
                    width='16'
                    height='16'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='1.8'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                  >
                    <rect x='3' y='3' width='18' height='18' rx='3' />
                    <line x1='9' y1='3' x2='9' y2='21' />
                  </svg>
                </button>
              )}

              <Link
                to='/'
                className='brand-lockup'
                aria-label={`${customSiteName || systemName || 'MagiRouter'} 首页`}
              >
                <MagiRouterWordmark
                  height={22}
                  customLogo={customLogo}
                  customSiteName={customSiteName}
                />
              </Link>

              <button
                type='button'
                className='header-search-btn'
                aria-label={t('Search models...')}
                onClick={() => {
                  closeAllMenus()
                  setSearchOpen(true)
                }}
              >
                <svg
                  width='15'
                  height='15'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='2'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  aria-hidden='true'
                >
                  <circle cx='11' cy='11' r='8' />
                  <path d='m21 21-4.3-4.3' />
                </svg>
                <span className='header-search-text'>搜索模型…</span>
                <kbd className='header-search-kbd'>⌘K</kbd>
              </button>
            </div>

            {navContent ? (
              <div className='nav-center'>{navContent}</div>
            ) : (
              <div className='nav-center' role='navigation' aria-label='站点页面'>
                {!isHome && (
                  <Link
                    to='/'
                    className={cn('nav-link-item', isHome && 'is-active')}
                  >
                    首页
                  </Link>
                )}

                <button
                  type='button'
                  className={cn(
                    'nav-link-item',
                    isRouteActive('/dashboard') && 'is-active'
                  )}
                  onClick={() => handleGoProtected('/dashboard')}
                >
                  控制台
                </button>

                <Link
                  to='/pricing'
                  className={cn(
                    'nav-link-item',
                    isRouteActive('/pricing') && 'is-active'
                  )}
                >
                  模型广场
                </Link>

                <div className='nav-dropdown-wrap' ref={createMenuRef}>
                  <button
                    type='button'
                    className={cn(
                      'nav-link-item',
                      (createMenuOpen || isRouteActive('/playground')) &&
                        'is-active'
                    )}
                    aria-expanded={createMenuOpen}
                    onClick={() => {
                      setAccountMenuOpen(false)
                      notifications.closePopover()
                      setCreateMenuOpen((prev) => !prev)
                    }}
                  >
                    <span>AI创作</span>
                    <svg
                      width='12'
                      height='12'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='2'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      aria-hidden='true'
                    >
                      <path d='m6 9 6 6 6-6' />
                    </svg>
                  </button>

                  {createMenuOpen && (
                    <div className='nav-dropdown-panel'>
                      <button
                        type='button'
                        className='dropdown-item'
                        onClick={() => handleGoProtected('/playground')}
                      >
                        <span className='dropdown-icon'>
                          <svg
                            width='15'
                            height='15'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='1.8'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                          >
                            <path d='m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z' />
                          </svg>
                        </span>
                        <span>
                          <div className='dropdown-title'>AI创作中心</div>
                          <div className='dropdown-desc'>
                            实时文本对话、图片生成、视频与语音调试台
                          </div>
                        </span>
                      </button>

                      <button
                        type='button'
                        className='dropdown-item is-disabled-item'
                        aria-disabled='true'
                      >
                        <span className='dropdown-icon'>
                          <svg
                            width='15'
                            height='15'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='1.8'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                          >
                            <rect x='3' y='3' width='7' height='7' rx='1.5' />
                            <rect x='14' y='14' width='7' height='7' rx='1.5' />
                            <path d='M10 6.5h4.5A2.5 2.5 0 0 1 17 9v5' />
                          </svg>
                        </span>
                        <span>
                          <div className='dropdown-title-row'>
                            <span className='dropdown-title'>画布</span>
                            <span className='dropdown-soon-badge'>搭建中</span>
                          </div>
                          <div className='dropdown-desc'>
                            节点式多模态视觉编排画布
                          </div>
                        </span>
                      </button>

                      <button
                        type='button'
                        className='dropdown-item is-disabled-item'
                        aria-disabled='true'
                      >
                        <span className='dropdown-icon'>
                          <svg
                            width='15'
                            height='15'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='1.8'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                          >
                            <rect x='3' y='4' width='18' height='16' rx='2.5' />
                            <path d='M3 10h18' />
                            <path d='M9 10v10' />
                          </svg>
                        </span>
                        <span>
                          <div className='dropdown-title-row'>
                            <span className='dropdown-title'>工作台</span>
                            <span className='dropdown-soon-badge'>搭建中</span>
                          </div>
                          <div className='dropdown-desc'>
                            项目级多镜头分镜与资产管理
                          </div>
                        </span>
                      </button>

                      <button
                        type='button'
                        className='dropdown-item'
                        onClick={() => {
                          setCreateMenuOpen(false)
                          void navigate({ to: '/pricing' })
                        }}
                      >
                        <span className='dropdown-icon'>
                          <svg
                            width='15'
                            height='15'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='1.8'
                          >
                            <rect x='3' y='3' width='7' height='7' rx='1' />
                            <rect x='14' y='3' width='7' height='7' rx='1' />
                            <rect x='14' y='14' width='7' height='7' rx='1' />
                            <rect x='3' y='14' width='7' height='7' rx='1' />
                          </svg>
                        </span>
                        <span>
                          <div className='dropdown-title'>全部创作模型</div>
                          <div className='dropdown-desc'>
                            查看全部语言、图片、视频与音频模型定价
                          </div>
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {externalDocsHref ? (
                  <a
                    href={externalDocsHref}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='nav-link-item'
                  >
                    文档
                  </a>
                ) : (
                  <Link
                    to='/docs'
                    className={cn(
                      'nav-link-item',
                      isRouteActive('/docs') && 'is-active'
                    )}
                  >
                    文档
                  </Link>
                )}

                <Link
                  to='/rankings'
                  className={cn(
                    'nav-link-item',
                    isRouteActive('/rankings') && 'is-active'
                  )}
                >
                  排行榜
                </Link>

                {isAuthenticated && (
                  <Link
                    to='/about'
                    className={cn(
                      'nav-link-item',
                      isRouteActive('/about') && 'is-active'
                    )}
                  >
                    时间线
                  </Link>
                )}
              </div>
            )}

            <div className='nav-right'>
              <div className='hidden sm:inline-flex'>
                <LanguageSwitcher />
              </div>

              {showThemeSwitch && (
                <button
                  type='button'
                  className='theme-toggle-btn'
                  aria-label={
                    resolvedTheme === 'dark' ? '切换浅色主题' : '切换暗色主题'
                  }
                  aria-pressed={resolvedTheme === 'dark'}
                  title={
                    resolvedTheme === 'dark' ? '切换浅色主题' : '切换暗色主题'
                  }
                  onClick={handleToggleTheme}
                >
                  {resolvedTheme === 'dark' ? (
                    <svg
                      width='15'
                      height='15'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='1.8'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      aria-hidden='true'
                    >
                      <path d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' />
                    </svg>
                  ) : (
                    <svg
                      width='15'
                      height='15'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='1.8'
                      strokeLinecap='round'
                      aria-hidden='true'
                    >
                      <circle cx='12' cy='12' r='4' />
                      <path d='M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41' />
                    </svg>
                  )}
                </button>
              )}

              {showAuthButtons && !isAuthenticated && (
                <>
                  <Link to='/sign-in' className='el-btn el-btn-md el-btn-white'>
                    登录
                  </Link>
                  <Link
                    to='/sign-up'
                    className='el-btn el-btn-md el-btn-primary'
                  >
                    注册
                  </Link>
                </>
              )}

              {isAuthenticated && showNotifications && (
                <div className='nav-popover-anchor' ref={notifyMenuRef}>
                  <button
                    type='button'
                    className='nav-icon-btn'
                    aria-label='站点公告与通知'
                    aria-haspopup='true'
                    aria-expanded={notifications.popoverOpen}
                    title='公告与通知'
                    onClick={() => {
                      setCreateMenuOpen(false)
                      setAccountMenuOpen(false)
                      notifications.setPopoverOpen(!notifications.popoverOpen)
                    }}
                  >
                    <svg
                      width='15'
                      height='15'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='1.8'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      aria-hidden='true'
                    >
                      <path d='M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' />
                      <path d='M10.3 21a1.94 1.94 0 0 0 3.4 0' />
                    </svg>
                    {notifications.unreadCount > 0 && (
                      <span className='nav-unread-dot' aria-hidden='true' />
                    )}
                  </button>

                  {notifications.popoverOpen && (
                    <div
                      className='nav-popover-panel nav-notify-popover'
                      role='dialog'
                      aria-label='站点公告与通知'
                    >
                      <div className='nav-notify-head'>
                        <div className='nav-notify-tabs' role='tablist'>
                          <button
                            type='button'
                            className={cn(
                              'nav-notify-tab',
                              notifications.activeTab === 'notice' &&
                                'is-active'
                            )}
                            role='tab'
                            aria-selected={notifications.activeTab === 'notice'}
                            onClick={() => notifications.setActiveTab('notice')}
                          >
                            公告
                          </button>
                          <button
                            type='button'
                            className={cn(
                              'nav-notify-tab',
                              notifications.activeTab === 'announcements' &&
                                'is-active'
                            )}
                            role='tab'
                            aria-selected={
                              notifications.activeTab === 'announcements'
                            }
                            onClick={() =>
                              notifications.setActiveTab('announcements')
                            }
                          >
                            通知
                            <span className='nav-notify-count tabular-nums'>
                              {notifications.announcements.length}
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className='nav-notify-body'>
                        {notifications.activeTab === 'notice' ? (
                          <div className='nav-announce-text'>
                            {notifications.notice || '暂无站点公告。'}
                          </div>
                        ) : notifications.announcements.length > 0 ? (
                          <div className='space-y-2'>
                            {notifications.announcements
                              .slice(0, 6)
                              .map((item, index) => {
                                const title =
                                  typeof item.title === 'string' && item.title
                                    ? item.title
                                    : typeof item.content === 'string'
                                      ? stripText(item.content).slice(0, 60)
                                      : '系统更新'
                                const dateStr =
                                  typeof item.publishDate === 'string'
                                    ? item.publishDate
                                    : ''
                                return (
                                  <div
                                    key={String(item.id ?? index)}
                                    className='nav-notice-item'
                                  >
                                    {dateStr && (
                                      <div className='nav-notice-meta tabular-nums'>
                                        {dateStr}
                                      </div>
                                    )}
                                    <div className='nav-notice-title'>
                                      {title}
                                    </div>
                                  </div>
                                )
                              })}
                          </div>
                        ) : (
                          <div className='nav-announce-text'>暂无系统通知。</div>
                        )}
                      </div>

                      <div className='nav-notify-foot'>
                        <span className='console-head-meta'>
                          {notifications.unreadCount > 0
                            ? `${notifications.unreadCount} 条未读`
                            : '全部已读'}
                        </span>
                        <button
                          type='button'
                          className='dash-panel-link'
                          onClick={() => {
                            notifications.closePopover()
                            void navigate({ to: '/about' })
                          }}
                        >
                          前往时间线 →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isAuthenticated && (
                <button
                  type='button'
                  className='nav-balance-pill'
                  title='当前账户余额 · 点击前往充值'
                  onClick={() => {
                    closeAllMenus()
                    void navigate({ to: '/wallet' })
                  }}
                >
                  <svg
                    width='14'
                    height='14'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='1.8'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    aria-hidden='true'
                  >
                    <rect x='2' y='5' width='20' height='14' rx='2.5' />
                    <path d='M16 12h2.5' />
                  </svg>
                  <span className='nav-balance-val tabular-nums'>
                    {formattedBalance}
                  </span>
                  <span className='nav-balance-tag'>充值</span>
                </button>
              )}

              {isAuthenticated && showAuthButtons && (
                <div className='nav-popover-anchor' ref={accountMenuRef}>
                  <button
                    type='button'
                    className='nav-user-pill'
                    aria-haspopup='menu'
                    aria-expanded={accountMenuOpen}
                    title='个人账户菜单'
                    onClick={() => {
                      setCreateMenuOpen(false)
                      notifications.closePopover()
                      setAccountMenuOpen((prev) => !prev)
                    }}
                  >
                    <span className='nav-user-avatar'>{initials}</span>
                    <span className='hidden sm:inline'>{displayName}</span>
                    <svg
                      className='nav-user-chevron'
                      width='13'
                      height='13'
                      viewBox='0 0 24 24'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='2'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      aria-hidden='true'
                    >
                      <path d='m6 9 6 6 6-6' />
                    </svg>
                  </button>

                  {accountMenuOpen && (
                    <div
                      className='nav-popover-panel nav-account-menu'
                      role='menu'
                      aria-label='个人账户菜单'
                    >
                      <div className='nav-account-header'>
                        <div className='nav-account-name'>{displayName}</div>
                        {secondaryText && (
                          <div className='nav-account-email'>
                            {secondaryText}
                          </div>
                        )}
                        <div className='nav-account-bal'>
                          <span>可用余额</span>
                          <strong className='tabular-nums'>
                            {formattedBalance}
                          </strong>
                        </div>
                      </div>

                      <button
                        type='button'
                        className='nav-menu-item'
                        role='menuitem'
                        onClick={() => {
                          setAccountMenuOpen(false)
                          void navigate({ to: '/dashboard' })
                        }}
                      >
                        <span className='nav-menu-item-left'>
                          <svg
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='1.8'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                          >
                            <path d='M22 12h-4l-3 9L9 3l-3 9H2' />
                          </svg>
                          <span>控制台</span>
                        </span>
                      </button>

                      <button
                        type='button'
                        className='nav-menu-item'
                        role='menuitem'
                        onClick={() => {
                          setAccountMenuOpen(false)
                          void navigate({ to: '/wallet' })
                        }}
                      >
                        <span className='nav-menu-item-left'>
                          <svg
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='1.8'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                          >
                            <rect x='2' y='5' width='20' height='14' rx='2' />
                            <path d='M2 10h20' />
                          </svg>
                          <span>充值余额</span>
                        </span>
                        <span className='el-select-opt-meta tabular-nums'>
                          {formattedBalance}
                        </span>
                      </button>

                      <button
                        type='button'
                        className='nav-menu-item'
                        role='menuitem'
                        onClick={() => {
                          setAccountMenuOpen(false)
                          void navigate({ to: '/security' })
                        }}
                      >
                        <span className='nav-menu-item-left'>
                          <svg
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='1.8'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                          >
                            <path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
                          </svg>
                          <span>账户安全</span>
                        </span>
                      </button>

                      <div className='nav-menu-sep' role='separator' />

                      <button
                        type='button'
                        className='nav-menu-item is-danger'
                        role='menuitem'
                        onClick={() => {
                          setAccountMenuOpen(false)
                          setSignOutOpen(true)
                        }}
                      >
                        <span className='nav-menu-item-left'>
                          <svg
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='1.8'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                          >
                            <path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' />
                            <polyline points='16 17 21 12 16 7' />
                            <line x1='21' y1='12' x2='9' y2='12' />
                          </svg>
                          <span>退出登录</span>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className='lg:hidden'>
                <MobileDrawer
                  open={mobileMenuOpen}
                  onOpenChange={setMobileMenuOpen}
                  navLinks={links}
                  logoContent={
                    <MagiRouterWordmark
                      height={20}
                      customLogo={customLogo}
                      customSiteName={customSiteName}
                    />
                  }
                  systemName={customSiteName || systemName}
                  loading={loading}
                  isAuthenticated={isAuthenticated}
                  user={user}
                  showAuthButtons={showAuthButtons}
                  onProtectedNavClick={(link) => handleGoProtected(link.href)}
                />
              </div>
            </div>
          </nav>
        </div>
      </header>

      <QuickModelSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
      />

      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </>
  )
}
