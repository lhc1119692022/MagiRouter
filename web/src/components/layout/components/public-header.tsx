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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
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
import { ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { defaultTopNavLinks } from '../config/top-nav.config'
import type { TopNavLink } from '../types'
import { AnnouncementBanner } from './announcement-banner'
import { CreationNavigation } from './creation-navigation'
import { HeaderAccountMenu } from './header-account-menu'
import { HeaderNavLink } from './header-nav-link'
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
  onOpenCommands?: () => void
  sidebarCollapsed?: boolean
  showBanner?: boolean
}

function stripText(raw: string): string {
  return raw
    .replaceAll(/<[^>]+>/g, ' ')
    .replaceAll(/[#*_`>[\]()]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function announcementTitle(item: {
  title?: unknown
  content?: unknown
}): string {
  if (typeof item.title === 'string' && item.title) return item.title
  if (typeof item.content === 'string') {
    return stripText(item.content).slice(0, 60)
  }
  return ''
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
    onOpenCommands,
    sidebarCollapsed = false,
    showBanner = true,
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
  const links =
    status?.HeaderNavModules !== undefined || dynamicLinks.length > 0
      ? dynamicLinks
      : navLinks
  const pricingLink = links.find((link) => link.href === '/pricing')
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const notifyMenuRef = useRef<HTMLDivElement>(null)
  const mobileTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!accountMenuOpen) return
    const phone = window.matchMedia('(max-width: 480px)')
    const closeOnPhone = () => {
      if (phone.matches) setAccountMenuOpen(false)
    }
    closeOnPhone()
    phone.addEventListener('change', closeOnPhone)
    return () => phone.removeEventListener('change', closeOnPhone)
  }, [accountMenuOpen])

  const closeAllMenus = useCallback(() => {
    setAccountMenuOpen(false)
    notifications.closePopover()
  }, [notifications])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.defaultPrevented &&
        !event.shiftKey &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k'
      ) {
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
    return t('No announcements at this time')
  }, [notifications.announcements, notifications.notice, t])

  const formattedBalance = formatQuotaWithCurrency(user?.quota)

  const handleDismissBanner = () => {
    setBannerDismissed(true)
    try {
      window.sessionStorage.setItem(BANNER_DISMISS_KEY, '1')
    } catch {
      // Ignore storage errors
    }
  }

  const handleToggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  const isRouteActive = (prefix: string) => {
    if (prefix === '/') return isHome
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
  }
  const creationActive =
    isRouteActive('/create') || isRouteActive('/playground')

  return (
    <>
      {showBanner && !bannerDismissed && (
        <AnnouncementBanner
          message={bannerMessage}
          showAction={isAuthenticated}
          onAction={() => {
            closeAllMenus()
            void navigate({ to: '/about' })
          }}
          onDismiss={handleDismissBanner}
        />
      )}

      <header className={cn('site-header', className)} id='site-header'>
        <div className='el-container'>
          <nav className='site-nav' aria-label={t('Navigation')}>
            <div className='nav-left'>
              {onToggleSidebar && (
                <button
                  type='button'
                  className='sidebar-collapse-btn'
                  aria-label={
                    sidebarCollapsed
                      ? t('Expand sidebar')
                      : t('Collapse sidebar')
                  }
                  aria-expanded={!sidebarCollapsed}
                  aria-controls='console-navigation'
                  title={
                    sidebarCollapsed
                      ? t('Expand sidebar')
                      : t('Collapse sidebar')
                  }
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
                aria-label={`${customSiteName || systemName || 'MagiRouter'} ${t('Home')}`}
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
                <span className='header-search-text'>
                  {t('Search models...')}
                </span>
                <kbd className='header-search-kbd'>⌘K</kbd>
              </button>
            </div>

            {navContent ? (
              <div className='nav-center'>{navContent}</div>
            ) : (
              <div
                className='nav-center'
                role='navigation'
                aria-label={t('Navigation links')}
              >
                {links.map((link) =>
                  link.href === '/create' ? (
                    <CreationNavigation
                      key={link.href}
                      link={link}
                      pricingLink={pricingLink}
                      active={creationActive}
                    />
                  ) : (
                    <HeaderNavLink
                      key={link.href}
                      link={link}
                      className={cn(
                        'nav-link-item',
                        isRouteActive(link.href) && 'is-active'
                      )}
                    />
                  )
                )}
              </div>
            )}

            <div className='nav-right'>
              <LanguageSwitcher />
              {showThemeSwitch && (
                <button
                  type='button'
                  className='theme-toggle-btn'
                  aria-label={t('Toggle theme')}
                  aria-pressed={resolvedTheme === 'dark'}
                  title={t('Toggle theme')}
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
                    {t('Sign in')}
                  </Link>
                  <Link
                    to='/sign-up'
                    className='el-btn el-btn-md el-btn-primary'
                  >
                    {t('Sign up')}
                  </Link>
                </>
              )}

              {isAuthenticated && showNotifications && (
                <div className='nav-popover-anchor' ref={notifyMenuRef}>
                  <button
                    type='button'
                    className='nav-icon-btn'
                    aria-label={t('Notifications')}
                    aria-haspopup='true'
                    aria-expanded={notifications.popoverOpen}
                    title={t('Notifications')}
                    onClick={() => {
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
                      aria-label={t('Notifications')}
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
                            {t('Announcements')}
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
                            {t('Notifications')}
                            <span className='nav-notify-count tabular-nums'>
                              {notifications.announcements.length}
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className='nav-notify-body'>
                        {notifications.activeTab === 'notice' && (
                          <div className='nav-announce-text'>
                            {notifications.notice ||
                              t('No announcements at this time')}
                          </div>
                        )}
                        {notifications.activeTab !== 'notice' &&
                          notifications.announcements.length > 0 && (
                            <div className='space-y-2'>
                              {notifications.announcements
                                .slice(0, 6)
                                .map((item, index) => {
                                  const title =
                                    announcementTitle(item) ||
                                    t('System updates')
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
                          )}
                        {notifications.activeTab !== 'notice' &&
                          notifications.announcements.length === 0 && (
                            <div className='nav-announce-text'>
                              {t(
                                'No notifications are available to you right now'
                              )}
                            </div>
                          )}
                      </div>

                      <div className='nav-notify-foot'>
                        <span className='console-head-meta'>
                          {notifications.unreadCount > 0
                            ? t('{{count}} unread', {
                                count: notifications.unreadCount,
                              })
                            : t('All read')}
                        </span>
                        <button
                          type='button'
                          className='dash-panel-link'
                          onClick={() => {
                            notifications.closePopover()
                            void navigate({ to: '/about' })
                          }}
                        >
                          {t('Timeline')} →
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
                  title={t('Wallet')}
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
                  <span className='nav-balance-tag'>{t('Recharge')}</span>
                </button>
              )}

              {isAuthenticated && showAuthButtons && (
                <HeaderAccountMenu
                  open={accountMenuOpen}
                  onOpenChange={(open) => {
                    if (open) notifications.closePopover()
                    setAccountMenuOpen(open)
                  }}
                  initials={initials}
                  displayName={displayName}
                  secondaryText={secondaryText}
                  formattedBalance={formattedBalance}
                  showSiteOverview={(user?.role ?? 0) >= ROLE.ADMIN}
                  showSystemSettings={user?.role === ROLE.SUPER_ADMIN}
                  onSignOut={() => setSignOutOpen(true)}
                />
              )}

              <button
                type='button'
                className='nav-icon-btn nav-menu-btn'
                aria-label={t('Open menu')}
                ref={mobileTriggerRef}
                aria-haspopup='dialog'
                aria-expanded={mobileMenuOpen}
                title={t('Navigation')}
                onClick={() => {
                  closeAllMenus()
                  setMobileMenuOpen(true)
                }}
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
                  aria-hidden='true'
                >
                  <path d='M4 7h16M4 12h16M4 17h16' />
                </svg>
              </button>

              <MobileDrawer
                returnFocusRef={mobileTriggerRef}
                onOpenCommands={onOpenCommands}
                isOpen={mobileMenuOpen}
                onClose={() => setMobileMenuOpen(false)}
                homeUrl='/'
                displayLogo={
                  <MagiRouterWordmark
                    height={20}
                    customLogo={customLogo}
                    customSiteName={customSiteName}
                  />
                }
                displaySiteName={customSiteName || systemName}
                loading={loading}
                logoLoaded
                mobileLinksList={links}
                creationActive={creationActive}
                showAuthButtons={showAuthButtons}
                user={user}
              />
            </div>
          </nav>
        </div>
      </header>

      <QuickModelSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </>
  )
}
