import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { useAuthStore } from '@/stores/auth-store'

import {
  playgroundCreatedKeySchema,
  type PlaygroundCreatedKey,
} from '../lib/workspace-search'
import { useBillingKeys } from './use-billing-keys'

export function usePlaygroundKeySelection() {
  const router = useRouter()
  const owner = useAuthStore((state) => state.auth.user?.id)
  const keys = useBillingKeys()
  const [selection, setSelection] = useState<PlaygroundCreatedKey | null>(null)
  const pending = useRef<PlaygroundCreatedKey | undefined>(undefined)

  useEffect(() => {
    const handoff = router.state.location.state.playgroundCreatedKey
    if (handoff === undefined) return
    pending.current = playgroundCreatedKeySchema.safeParse(handoff).data
    void router.navigate({
      to: '/playground',
      search: true,
      hash: true,
      replace: true,
      resetScroll: false,
      state: (current) => {
        const remaining = { ...current }
        delete remaining.playgroundCreatedKey
        return remaining
      },
    })
  }, [router])

  useEffect(() => {
    const created = pending.current
    if (!created) return
    if (created.owner !== owner || keys.error) {
      pending.current = undefined
      return
    }
    if (keys.loading) return
    pending.current = undefined
    if (keys.eligible.some((key) => key.id === created.id)) {
      setSelection(created)
    }
  }, [owner, keys.eligible, keys.error, keys.loading])

  const select = (id: number | null) => {
    pending.current = undefined
    setSelection(
      id && owner && keys.eligible.some((key) => key.id === id)
        ? { owner, id }
        : null
    )
  }
  return {
    keys,
    id: selection && selection.owner === owner ? selection.id : null,
    select,
  }
}
