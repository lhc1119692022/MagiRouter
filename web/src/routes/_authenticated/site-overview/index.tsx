import { createFileRoute, redirect } from '@tanstack/react-router'

import { SiteOverview } from '@/features/site-overview'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/site-overview/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if ((auth.user?.role ?? 0) < ROLE.ADMIN) throw redirect({ to: '/403' })
  },
  component: SiteOverview,
})
