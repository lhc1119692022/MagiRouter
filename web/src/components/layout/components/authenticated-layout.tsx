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

import { CommandMenu } from '@/components/command-menu'
import { AnimatedOutlet } from '@/components/page-transition'
import { SitePopupHost } from '@/components/site-popup-host'
import { SkipToMain } from '@/components/skip-to-main'
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from '@/components/ui/sidebar'
import { LayoutProvider, useLayout } from '@/context/layout-provider'
import { SearchProvider, useSearch } from '@/context/search-provider'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import '@/styles/console-document.css'

import { AppSidebar } from './app-sidebar'
import { PublicHeader } from './public-header'
import { PublicLayout } from './public-layout'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

function ConsoleHeader() {
  const { toggleSidebar, state, isMobile, openMobile } = useSidebar()
  const { setOpen } = useSearch()
  const { collapsible } = useLayout()

  useEffect(() => {
    document.body.dataset.currentPage = 'console'
    return () => {
      if (document.body.dataset.currentPage === 'console') {
        delete document.body.dataset.currentPage
      }
    }
  }, [])

  return (
    <PublicHeader
      onToggleSidebar={
        isMobile || collapsible !== 'none' ? toggleSidebar : undefined
      }
      sidebarCollapsed={isMobile ? !openMobile : state === 'collapsed'}
      onOpenCommands={() => setOpen(true)}
    />
  )
}

export function AuthenticatedLayout(props: AuthenticatedLayoutProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const defaultOpen = getCookie('sidebar_state') !== 'false'
  const signedIn = useAuthStore((s) => !!s.auth.user)
  // Unmount pages on sign-out, otherwise their queries refetch and toast "Session expired!" / "invalid access token"
  if (!signedIn) return null

  if (pathname === '/create' || pathname.startsWith('/create/')) {
    return (
      <PublicLayout showMainContainer={false}>
        {props.children ?? <AnimatedOutlet />}
      </PublicLayout>
    )
  }

  return (
    <LayoutProvider>
      <SearchProvider>
        <SidebarProvider
          defaultOpen={defaultOpen}
          className='console-shell flex-col'
        >
          <SkipToMain />
          <ConsoleHeader />
          <div className='console-workspace-shell flex min-h-0 w-full min-w-0 flex-1'>
            <AppSidebar />
            <SidebarInset
              className={cn(
                '@container/content',
                'h-[calc(100svh-var(--app-header-height,0px))]',
                'min-h-0 overflow-hidden',
                'peer-data-[variant=inset]:h-[calc(100svh-var(--app-header-height,0px)-(var(--spacing)*4))]'
              )}
            >
              {props.children ?? <AnimatedOutlet />}
            </SidebarInset>
          </div>
          <CommandMenu />
          <SitePopupHost
            trigger='console'
            suppressed={pathname === '/system-settings/content/popups'}
          />
        </SidebarProvider>
      </SearchProvider>
    </LayoutProvider>
  )
}
