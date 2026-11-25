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
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { toIntlLocale } from '@/i18n/languages'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import {
  formatDateStr,
  formatDateTimeStr,
  formatNumber,
  formatQuota,
} from '@/lib/format'
import { getRoleLabel } from '@/lib/roles'

import { getDisplayName } from '../lib'
import type { UserProfile } from '../types'

// ============================================================================
// Profile Header Component
// ============================================================================

interface ProfileHeaderProps {
  profile: UserProfile | null
  loading: boolean
}

function getConcurrencyStat(
  profile: UserProfile,
  t: TFunction,
  locale?: string
): { label: string; value: string; description: string; valueTitle?: string } {
  const label = t('Concurrency Limit')
  const summary = profile.concurrency_limit

  if (summary) {
    if (!summary.enabled || summary.source === 'disabled') {
      return {
        label,
        value: t('Unlimited'),
        description: t('Concurrency limit disabled'),
      }
    }

    if (summary.source === 'user') {
      return {
        label,
        value: formatNumber(summary.effective_limit, locale),
        description: t('Custom user limit'),
      }
    }

    const value =
      summary.effective_limit > 0
        ? formatNumber(summary.effective_limit, locale)
        : t('Unlimited')

    if (summary.source === 'group') {
      return {
        label,
        value,
        description: t('Group policy ({{group}})', { group: profile.group }),
      }
    }

    return {
      label,
      value,
      description: t('Default concurrency policy'),
    }
  }

  const maxConcurrency = profile.max_concurrency ?? 0
  if (maxConcurrency > 0) {
    return {
      label,
      value: formatNumber(maxConcurrency, locale),
      description: t('Custom user limit'),
    }
  }

  return {
    label,
    value: t('Unlimited'),
    description: t('Simultaneous requests'),
  }
}

function getRegistrationStat(
  profile: UserProfile,
  t: TFunction
): { label: string; value: string; description: string; valueTitle?: string } {
  const timestamp = profile.created_at || profile.created_time || 0
  const createdDate = timestamp > 0 ? new Date(timestamp * 1000) : null
  return {
    label: t('Registration Date'),
    value: createdDate ? formatDateStr(createdDate) : '—',
    valueTitle: createdDate ? formatDateTimeStr(createdDate) : undefined,
    description: t('Account created'),
  }
}

export function ProfileHeader({ profile, loading }: ProfileHeaderProps) {
  const { t, i18n } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  if (loading) {
    return (
      <Card data-card-hover='false' className='identity-hero' aria-busy='true'>
        <div className='identity-hero-body'>
          <div className='identity-hero-person'>
            <Skeleton className='size-[64px] shrink-0 rounded-full' />
            <div className='space-y-2'>
              <Skeleton className='h-6 w-36' />
              <Skeleton className='h-4 w-24' />
            </div>
          </div>
          <div className='identity-metrics'>
            {['balance', 'usage', 'requests', 'concurrency'].map((stat) => (
              <Skeleton key={stat} className='h-14 w-28' />
            ))}
          </div>
        </div>
      </Card>
    )
  }

  if (!profile) return null

  const displayName = getDisplayName(profile)
  const avatarName = profile.username || displayName
  const avatarFallback = getUserAvatarFallback(avatarName)
  const avatarFallbackStyle = getUserAvatarStyle(avatarName)
  const roleLabel = getRoleLabel(profile.role)
  const stats = [
    {
      label: t('Current Balance'),
      value: formatQuota(profile.quota),
      description: t('Remaining quota'),
      valueTitle: undefined as string | undefined,
    },
    {
      label: t('Total Usage'),
      value: formatQuota(profile.used_quota),
      description: t('Total consumed quota'),
      valueTitle: undefined as string | undefined,
    },
    getConcurrencyStat(profile, t, locale),
    getRegistrationStat(profile, t),
  ]

  return (
    <Card data-card-hover='false' className='identity-hero'>
      <div className='identity-hero-body'>
        <div className='identity-hero-person'>
          <Avatar className='size-[64px] shrink-0 rounded-full'>
            <AvatarFallback
              className='rounded-full text-2xl font-semibold text-white'
              style={avatarFallbackStyle}
            >
              {avatarFallback}
            </AvatarFallback>
          </Avatar>

          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-2.5'>
              <h2 className='identity-name'>{displayName}</h2>
              <StatusBadge
                label={roleLabel}
                variant='neutral'
                copyable={false}
              />
              <Button
                type='button'
                variant='outline'
                size='xs'
                aria-label={`${t('Copy')}: ${t('User ID')} ${profile.id}`}
                onClick={() => void copyToClipboard(String(profile.id))}
              >
                {`${t('User ID')} ${profile.id}`}
              </Button>
            </div>

            <div className='identity-meta'>
              <span>@{profile.username}</span>
              {profile.email && <span>{profile.email}</span>}
              {profile.group && <span>{profile.group}</span>}
            </div>
          </div>
        </div>
        <dl className='identity-metrics'>
          {stats.map(({ label, value, description, valueTitle }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <strong title={valueTitle}>{value}</strong>
                <small>{description}</small>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  )
}
