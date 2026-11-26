import { createFileRoute, redirect } from '@tanstack/react-router'

import { UpstreamBalance } from '@/features/upstream-balance'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/upstream-balance/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if ((auth.user?.role ?? 0) < ROLE.ADMIN) throw redirect({ to: '/403' })
  },
  component: UpstreamBalance,
})
