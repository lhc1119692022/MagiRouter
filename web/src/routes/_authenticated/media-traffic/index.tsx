import { createFileRoute, redirect } from '@tanstack/react-router'

import { MediaTraffic } from '@/features/media-traffic'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/media-traffic/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if ((auth.user?.role ?? 0) < ROLE.ADMIN) throw redirect({ to: '/403' })
  },
  component: MediaTraffic,
})
