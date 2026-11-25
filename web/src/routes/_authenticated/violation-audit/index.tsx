import { createFileRoute, redirect } from '@tanstack/react-router'

import { ViolationAudit } from '@/features/violation-audit'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/violation-audit/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if ((auth.user?.role ?? 0) < ROLE.ADMIN) throw redirect({ to: '/403' })
  },
  component: ViolationAudit,
})
