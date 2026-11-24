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
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { playgroundCreatedKeySchema } from '@/features/playground/lib/workspace-search'
import { useAuthStore } from '@/stores/auth-store'

import { ApiKeysDeleteDialog } from './api-keys-delete-dialog'
import { ApiKeysMutateDrawer } from './api-keys-mutate-drawer'
import { useApiKeys } from './api-keys-provider'
import { CCSwitchDialog } from './dialogs/cc-switch-dialog'

const route = getRouteApi('/_authenticated/keys/')

export function ApiKeysDialogs() {
  const { t } = useTranslation()
  const { open, setOpen, currentRow, resolvedKey } = useApiKeys()
  const { action, playground } = route.useSearch()
  const createRequested = action === 'create'
  const navigate = route.useNavigate()
  const owner = useAuthStore((state) => state.auth.user?.id)

  return (
    <>
      <ApiKeysMutateDrawer
        open={createRequested || open === 'create' || open === 'update'}
        singleCreate={createRequested && !!playground}
        closeLabel={
          createRequested && playground ? t('Back to Playground') : undefined
        }
        onOpenChange={(isOpen, createdId) => {
          if (isOpen) return
          setOpen(null)
          if (createRequested && playground) {
            const created = playgroundCreatedKeySchema.safeParse({
              id: createdId,
              owner,
            })
            const accepted =
              created.success &&
              created.data.owner === useAuthStore.getState().auth.user?.id
            void navigate({
              to: '/playground',
              search: playground,
              replace: true,
              state: (current) => {
                const next = { ...current }
                delete next.playgroundCreatedKey
                if (accepted) next.playgroundCreatedKey = created.data
                return next
              },
            })
            return
          }
          if (createRequested) {
            void navigate({
              search: (search) => ({ ...search, action: undefined }),
              replace: true,
              resetScroll: false,
            })
          }
        }}
        currentRow={open === 'update' ? currentRow || undefined : undefined}
      />
      <ApiKeysDeleteDialog />
      <CCSwitchDialog
        open={open === 'cc-switch'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        tokenKey={resolvedKey}
      />
    </>
  )
}
