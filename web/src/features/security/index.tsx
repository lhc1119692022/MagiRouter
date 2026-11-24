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
import { Link2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { IdentitySettingsLayout } from '@/components/layout/components/identity-settings-layout'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import { useProfile } from '@/features/profile/hooks/use-profile'

import { AccessTokensCard } from './components/access-tokens-card'
import { AccountActionCard } from './components/account-action-card'
import { AccountBindings } from './components/account-bindings'
import { LoginSessionsCard } from './components/login-sessions-card'
import { PasskeyCard } from './components/passkey-card'
import { PrivacyCard } from './components/privacy-card'
import { TwoFACard } from './components/two-fa-card'

export function Security() {
  const { t } = useTranslation()
  const { profile, loading, refreshProfile, fetchProfile } = useProfile()

  let content: ReactNode
  if (loading) {
    content = (
      <div role='status' aria-label={t('Loading...')} className='space-y-4'>
        <Skeleton className='h-28 w-full' />
        <Skeleton className='h-52 w-full' />
        <Skeleton className='h-52 w-full' />
      </div>
    )
  } else if (!profile) {
    content = (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('Failed to load profile')}</EmptyTitle>
          <EmptyDescription>
            {t('Refresh the list and try again.')}
          </EmptyDescription>
        </EmptyHeader>
        <Button
          type='button'
          variant='outline'
          onClick={() => void fetchProfile()}
        >
          {t('Retry')}
        </Button>
      </Empty>
    )
  } else {
    content = (
      <div className='identity-grid'>
        <div className='identity-column'>
          <section
            aria-labelledby='security-authentication'
            className='identity-stack'
          >
            <h2 id='security-authentication' className='identity-section-title'>
              {t('Login & Authentication')}
            </h2>
            <AccountActionCard
              action='password'
              username={profile.username}
              hasPassword={profile.has_password}
              onUpdate={refreshProfile}
            />
            <TitledCard
              title={t('Account Bindings')}
              icon={<Link2 className='size-4' />}
              disableHoverEffect
            >
              <AccountBindings profile={profile} onUpdate={refreshProfile} />
            </TitledCard>
          </section>
          <section aria-labelledby='security-access' className='identity-stack'>
            <h2 id='security-access' className='identity-section-title'>
              {t('Sessions & Access')}
            </h2>
            <LoginSessionsCard />
            <AccessTokensCard />
          </section>
          <section
            aria-labelledby='security-account'
            className='identity-stack'
          >
            <h2 id='security-account' className='identity-section-title'>
              {t('Account Actions')}
            </h2>
            <AccountActionCard action='delete' username={profile.username} />
          </section>
        </div>
        <aside
          aria-labelledby='security-verification'
          className='identity-column'
        >
          <div className='identity-stack'>
            <h2 id='security-verification' className='identity-section-title'>
              {t('Security verification')}
            </h2>
            <PasskeyCard loading={loading} />
            <TwoFACard loading={loading} />
          </div>
          <section
            aria-labelledby='security-privacy'
            className='identity-stack'
          >
            <h2 id='security-privacy' className='identity-section-title'>
              {t('Privacy')}
            </h2>
            <PrivacyCard profile={profile} onUpdate={refreshProfile} />
          </section>
        </aside>
      </div>
    )
  }

  return (
    <IdentitySettingsLayout surface='security' title={t('Security')}>
      {content}
    </IdentitySettingsLayout>
  )
}
