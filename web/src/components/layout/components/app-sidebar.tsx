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
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { Sidebar, SidebarContent, SidebarRail } from '@/components/ui/sidebar'
import { useLayout } from '@/context/layout-provider'
import { useSidebarView } from '@/hooks/use-sidebar-view'
import { MOTION_TRANSITION, MOTION_VARIANTS } from '@/lib/motion'

import { NavGroup } from './nav-group'
import { SidebarPlaygroundCard } from './sidebar-playground-card'
import { SidebarViewHeader } from './sidebar-view-header'

/**
 * Application sidebar.
 *
 * Adopts the Vercel / Cloudflare "drill-in" pattern: the URL drives
 * which sidebar *view* is rendered. Clicking a top-level entry like
 * `System Settings` swaps the sidebar to a contextual workspace —
 * with a `← Back to Dashboard` affordance — instead of stacking the
 * sub-navigation inside the root tree.
 *
 * Architecture:
 *   - View resolution + filtering: {@link useSidebarView}
 *   - View registry: `layout/lib/sidebar-view-registry.ts`
 *   - Per-view header: {@link SidebarViewHeader}
 *
 * Adding a new nested view only requires registering a {@link SidebarView}
 * in the registry; this component requires no changes.
 */
export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const { key, view, navGroups } = useSidebarView()
  const shouldReduce = useReducedMotion()
  const playground = !view
    ? navGroups
        .find((group) => group.id === 'workspace-footer')
        ?.items.find(
          (item) => item.url === '/playground' && !item.hidden && !item.disabled
        )
    : undefined

  return (
    <Sidebar
      id='console-navigation'
      collapsible={collapsible}
      variant={variant}
    >
      {view && <SidebarViewHeader view={view} />}

      <SidebarContent>
        <AnimatePresence mode='wait' initial={false}>
          <motion.div
            key={key}
            initial={
              shouldReduce ? false : MOTION_VARIANTS.sidebarSlide.initial
            }
            animate={MOTION_VARIANTS.sidebarSlide.animate}
            exit={shouldReduce ? undefined : MOTION_VARIANTS.sidebarSlide.exit}
            transition={MOTION_TRANSITION.fast}
            className='console-sidebar-groups flex flex-col'
          >
            {navGroups
              .filter((group) => group.id !== 'workspace-footer')
              .map((group) =>
                group.id === 'more' ? (
                  <details className='console-sidebar-more' key={group.id}>
                    <summary title={group.title}>{group.title}</summary>
                    <NavGroup {...group} title='' />
                  </details>
                ) : (
                  <NavGroup key={group.id || group.title} {...group} />
                )
              )}
          </motion.div>
        </AnimatePresence>
      </SidebarContent>

      {playground && (
        <div className='sidebar-footer'>
          <SidebarPlaygroundCard title={playground.title} />
        </div>
      )}

      <SidebarRail />
    </Sidebar>
  )
}
