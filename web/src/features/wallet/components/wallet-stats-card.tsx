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
import { Link } from '@tanstack/react-router'
import { ArrowRight, CircleDollarSign } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { formatQuota } from '@/lib/format'

import type { UserWalletData } from '../types'

interface WalletStatsCardProps {
  user: UserWalletData | null
  loading?: boolean
}

export function WalletStatsCard(props: WalletStatsCardProps) {
  const { t } = useTranslation()
  if (props.loading) {
    return (
      <div className='billing-balance-hero'>
        <div className='billing-balance-main'>
          <Skeleton className='h-4 w-32' />
          <Skeleton className='h-11 w-44' />
          <Skeleton className='h-4 w-72' />
        </div>
        <div className='billing-rate-side'>
          <Skeleton className='h-8 w-44 rounded-full' />
          <Skeleton className='h-4 w-56' />
        </div>
      </div>
    )
  }

  return (
    <div className='billing-balance-hero'>
      <div className='billing-balance-main'>
        <span className='billing-balance-kicker'>
          {t('Current Available Balance')}
        </span>
        <div className='billing-balance-big tabular-nums'>
          {formatQuota(props.user?.quota ?? 0)}
        </div>
        <div className='billing-balance-sub'>
          <span>{t('Never expires · Failed calls free')}</span>
          <span aria-hidden='true'>·</span>
          <span className='tabular-nums'>
            {t('Used {{amount}}', {
              amount: formatQuota(props.user?.used_quota ?? 0),
            })}
          </span>
          <span aria-hidden='true'>·</span>
          <span className='tabular-nums'>
            {t('{{count}} requests', {
              count: (props.user?.request_count ?? 0).toLocaleString(),
            })}
          </span>
          <span aria-hidden='true'>·</span>
          <Link
            to='/docs'
            search={{ doc: 'billing-model' }}
            className='billing-balance-link'
          >
            <span>{t('Billing rules')}</span>
            <ArrowRight className='size-3' />
          </Link>
        </div>
      </div>

      <div className='billing-rate-side'>
        <span className='billing-rate-badge'>
          <CircleDollarSign className='size-3.5 shrink-0' />
          <span>{t('1:1 USD Exchange Billing')}</span>
        </span>
        <span className='billing-invoice-tip'>
          {t('Invoicing is not yet supported during early launch.')}
        </span>
      </div>
    </div>
  )
}
