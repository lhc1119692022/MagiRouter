import { Link } from '@tanstack/react-router'

import { ChatPresetsItem } from '@/components/layout/components/chat-presets-item'
import { SidebarPlaygroundCard } from '@/components/layout/components/sidebar-playground-card'
import type { NavItem } from '@/components/layout/types'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useSidebarConfig } from '@/hooks/use-sidebar-config'
import { useSidebarData } from '@/hooks/use-sidebar-data'

function CatalogNavItem({ item }: { item: NavItem }) {
  if (item.type === 'chat-presets') {
    return (
      <SidebarProvider className='contents min-h-0' keyboardShortcut={false}>
        <ul>
          <ChatPresetsItem item={item} />
        </ul>
      </SidebarProvider>
    )
  }
  const active = item.sidebarKey === 'models'
  const label = (
    <>
      {item.icon && <item.icon className='size-4 shrink-0' />}
      <span className='sidebar-nav-label'>{item.title}</span>
      {(item.hint || item.badge) && (
        <span className='sidebar-item-badge'>{item.hint || item.badge}</span>
      )}
    </>
  )
  if (item.disabled) {
    return (
      <button
        type='button'
        hidden={item.hidden}
        disabled
        aria-disabled='true'
        className='sidebar-nav-item'
        data-sidebar-key={item.sidebarKey}
        title={item.title}
      >
        {label}
      </button>
    )
  }
  if (!item.url) return null
  return (
    <Link
      to={item.url}
      hash={item.hash}
      className={active ? 'sidebar-nav-item is-active' : 'sidebar-nav-item'}
      aria-current={active ? 'page' : undefined}
      data-sidebar-key={item.sidebarKey}
      title={item.title}
    >
      {label}
    </Link>
  )
}

export function CatalogNavigation() {
  const groups = useSidebarConfig(useSidebarData().navGroups)
  const playground = groups
    .find((group) => group.id === 'workspace-footer')
    ?.items.find(
      (item) => item.url === '/playground' && !item.hidden && !item.disabled
    )
  return (
    <>
      <div className='console-sidebar-scroll'>
        {groups
          .filter((group) => group.id !== 'workspace-footer')
          .map((group) => {
            const links = (
              <div className='sidebar-nav-list'>
                {group.items.map((item) => (
                  <CatalogNavItem
                    key={item.sidebarKey ?? item.url ?? item.title}
                    item={item}
                  />
                ))}
              </div>
            )
            if (group.id === 'more') {
              return (
                <details className='sidebar-section' key={group.id}>
                  <summary className='sidebar-group-title cursor-pointer'>
                    {group.title}
                  </summary>
                  {links}
                </details>
              )
            }
            return (
              <div className='sidebar-section' key={group.id}>
                {group.title && (
                  <div className='sidebar-group-title'>{group.title}</div>
                )}
                {links}
              </div>
            )
          })}
      </div>
      {playground && (
        <div className='sidebar-footer'>
          <SidebarPlaygroundCard title={playground.title} />
        </div>
      )}
    </>
  )
}
