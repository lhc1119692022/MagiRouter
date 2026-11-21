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
import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'

import type { TopNavLink } from '../types'
import { PublicHeader, type PublicHeaderProps } from './public-header'

function resolveBodyPageKey(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'home'
  if (pathname.startsWith('/pricing')) return 'models'
  if (pathname.startsWith('/docs')) return 'docs'
  if (pathname.startsWith('/about') || pathname.startsWith('/rankings')) {
    return 'about'
  }
  if (pathname.startsWith('/playground')) return 'create'
  if (
    pathname.startsWith('/user-agreement') ||
    pathname.startsWith('/privacy-policy')
  ) {
    return 'legal'
  }
  return 'subpage'
}

type PublicLayoutProps = {
  children: React.ReactNode
  showMainContainer?: boolean
  navContent?: React.ReactNode
  headerProps?: Omit<PublicHeaderProps, 'navContent'>
  navLinks?: TopNavLink[]
  showThemeSwitch?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  logo?: React.ReactNode
  siteName?: string
  onToggleSidebar?: () => void
  sidebarCollapsed?: boolean
}

export function PublicLayout(props: PublicLayoutProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  useEffect(() => {
    const pageKey = resolveBodyPageKey(pathname)
    document.body.dataset.currentPage = pageKey
    return () => {
      if (document.body.dataset.currentPage === pageKey) {
        delete document.body.dataset.currentPage
      }
    }
  }, [pathname])

  return (
    <div className='magi-public bg-background text-foreground relative min-h-svh overflow-x-clip'>
      <PublicHeader
        navContent={props.navContent}
        navLinks={props.navLinks}
        showThemeSwitch={props.showThemeSwitch}
        showAuthButtons={props.showAuthButtons}
        showNotifications={props.showNotifications}
        logo={props.logo}
        siteName={props.siteName}
        onToggleSidebar={props.onToggleSidebar}
        sidebarCollapsed={props.sidebarCollapsed}
        {...props.headerProps}
      />

      {props.showMainContainer !== false ? (
        <main className='el-container py-8'>
          {props.children}
        </main>
      ) : (
        props.children
      )}
    </div>
  )
}
