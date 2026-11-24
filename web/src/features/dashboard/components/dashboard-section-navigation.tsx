import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import type { DashboardSectionId } from '../section-registry'

import './dashboard-section-navigation.css'

export function DashboardSectionNavigation({
  current,
}: {
  current: DashboardSectionId
}) {
  const { t } = useTranslation()
  const role = useAuthStore((state) => state.auth.user?.role ?? ROLE.GUEST)
  const sections: { id: DashboardSectionId; label: string }[] = [
    { id: 'overview', label: t('Overview') },
    { id: 'models', label: t('Model Call Analytics') },
  ]
  if (current === 'flow' || current === 'users') {
    sections.push({ id: 'flow', label: t('Flow') })
    if (role >= ROLE.ADMIN) {
      sections.push({ id: 'users', label: t('User Analytics') })
    }
  }
  return (
    <nav
      className='console-subtabs dashboard-view-tabs'
      aria-label={t('Console')}
    >
      {sections.map(({ id, label }) => (
        <Link
          key={id}
          to='/dashboard/$section'
          params={{ section: id }}
          aria-current={current === id ? 'page' : undefined}
          className={
            current === id
              ? 'console-subtab-btn is-active'
              : 'console-subtab-btn'
          }
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
