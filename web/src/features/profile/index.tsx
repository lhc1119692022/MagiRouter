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
import { useTranslation } from 'react-i18next'

import { IdentitySettingsLayout } from '@/components/layout/components/identity-settings-layout'
import {
  CardStaggerContainer,
  CardStaggerItem,
} from '@/components/page-transition'
import { useStatus } from '@/hooks/use-status'
import { useAuthStore } from '@/stores/auth-store'

import { CheckinCalendarCard } from './components/checkin-calendar-card'
import { LanguagePreferencesCard } from './components/language-preferences-card'
import { ProfileHeader } from './components/profile-header'
import { ProfileSettingsCard } from './components/profile-settings-card'
import { SidebarModulesCard } from './components/sidebar-modules-card'
import { useProfile } from './hooks'

export function Profile() {
  const { t } = useTranslation()
  const { profile, loading, refreshProfile } = useProfile()
  const { status } = useStatus()
  const authUser = useAuthStore((s) => s.auth.user)
  const permissions = authUser?.permissions

  const globalCheckinEnabled = status?.checkin_enabled === true
  const allowedCheckinGroups = Array.isArray(status?.checkin_allowed_groups)
    ? status.checkin_allowed_groups
    : []
  const currentUserGroup =
    profile?.group?.trim() || authUser?.group?.trim() || 'default'
  const checkinEnabled =
    globalCheckinEnabled &&
    (allowedCheckinGroups.length === 0 ||
      allowedCheckinGroups.includes(currentUserGroup))
  const turnstileEnabled = !!(
    status?.turnstile_check && status?.turnstile_site_key
  )
  const turnstileSiteKey = status?.turnstile_site_key || ''
  const canConfigureSidebar = permissions?.sidebar_settings !== false
  // Older cached status payloads lack these fields; the site default is on.
  const quotaRemindEnabled = status?.quota_remind_enabled !== false
  const quotaRemindThreshold = status?.quota_remind_threshold ?? 0
  const preferences = (
    <>
      <ProfileSettingsCard
        profile={profile}
        loading={loading}
        onProfileUpdate={refreshProfile}
        quotaRemindEnabled={quotaRemindEnabled}
        quotaRemindThreshold={quotaRemindThreshold}
      />
      <LanguagePreferencesCard
        profile={profile}
        onProfileUpdate={refreshProfile}
      />
    </>
  )

  return (
    <IdentitySettingsLayout
      surface='account'
      title={t('Account', { context: 'sidebar' })}
    >
      <CardStaggerContainer className='identity-stack'>
        <CardStaggerItem className='identity-stack'>
          <ProfileHeader profile={profile} loading={loading} />
        </CardStaggerItem>
        <CardStaggerItem className='identity-grid identity-stack'>
          {checkinEnabled || canConfigureSidebar ? (
            <>
              <div className='identity-stack'>{preferences}</div>
              <div className='identity-stack'>
                {checkinEnabled && (
                  <CheckinCalendarCard
                    checkinEnabled={checkinEnabled}
                    turnstileEnabled={turnstileEnabled}
                    turnstileSiteKey={turnstileSiteKey}
                  />
                )}
                {canConfigureSidebar && <SidebarModulesCard />}
              </div>
            </>
          ) : (
            preferences
          )}
        </CardStaggerItem>
      </CardStaggerContainer>
    </IdentitySettingsLayout>
  )
}
