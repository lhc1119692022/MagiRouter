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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LayoutDashboard } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'
import {
  parseSidebarModulesAdmin,
  parseSidebarModulesUser,
  type SidebarModulesAdminConfig,
} from '@/features/system-settings/maintenance/config'
import { SidebarModuleControls } from '@/features/system-settings/maintenance/sidebar-module-controls'
import { useStatus } from '@/hooks/use-status'
import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'

function Preferences({ user }: { user: AuthUser }) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const client = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<SidebarModulesAdminConfig | null>(null)
  const preferences = useQuery({
    queryKey: ['sidebar-preferences', user.id],
    queryFn: async () => {
      const response = requireServerSuccess(
        (await api.get('/api/user/self')).data
      )
      if (!response?.success || !response.data) {
        throw new Error('Failed to load')
      }
      return parseSidebarModulesUser(response.data.sidebar_modules) ?? {}
    },
    retry: false,
  })
  if (!status) return null
  if (preferences.isError) {
    return (
      <ErrorState
        title={t('Failed to load')}
        onRetry={() => void preferences.refetch()}
      />
    )
  }
  if (!preferences.data) return <LoadingState />
  const config = draft ?? preferences.data
  const site = parseSidebarModulesAdmin(
    status.SidebarModulesAdmin as string | null | undefined
  )
  const save = async () => {
    setSaving(true)
    try {
      const serialized = JSON.stringify(config)
      const response = requireServerSuccess(
        (await api.put('/api/user/self', { sidebar_modules: serialized })).data
      )
      if (response?.success !== true) throw new Error('Save failed')
      const auth = useAuthStore.getState().auth
      if (auth.user?.id === user.id) {
        client.setQueryData(['sidebar-preferences', user.id], config)
        setDraft(null)
        auth.setUser({ ...auth.user, sidebar_modules: serialized })
      }
      toast.success(t('Saved successfully'))
    } catch (error) {
      handleServerError(error, t('Save failed, please retry'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
      <CardHeader className='border-b p-3 !pb-3 sm:p-5 sm:!pb-5'>
        <div className='flex items-center gap-3'>
          <IconBadge tone='info' size='title'>
            <LayoutDashboard />
          </IconBadge>
          <div className='min-w-0'>
            <CardTitle className='text-lg tracking-tight sm:text-xl'>
              {t('Sidebar Personal Settings')}
            </CardTitle>
            <CardDescription className='text-xs sm:text-sm'>
              {t('Customize sidebar display content')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-4 p-3 sm:p-5'>
        <SidebarModuleControls
          role={user.role}
          site={site}
          value={config}
          disabled={saving}
          onChange={(section, module, checked) =>
            setDraft({
              ...config,
              [section]: { ...config[section], [module]: checked },
            })
          }
          onReset={(refs) => {
            const next = { ...config }
            for (const [section, module] of refs) {
              next[section] = {
                ...next[section],
                enabled: true,
                [module]: true,
              }
            }
            setDraft(next)
          }}
        />
        <div className='flex justify-end border-t pt-4'>
          <Button onClick={save} disabled={saving}>
            {saving ? t('Saving...') : t('Save Changes')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function SidebarModulesCard() {
  const user = useAuthStore((state) => state.auth.user)
  if (!user || user.permissions?.sidebar_settings === false) return null
  return <Preferences key={user.id} user={user} />
}
