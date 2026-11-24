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
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getUserQuotaDates } from '@/features/dashboard/api'
import { formatQuota } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { computeTimeRange } from '@/lib/time'

import { aggregateModelShare, shareBarWidth } from '../../lib/model-share'

const TOP_MODEL_COUNT = 5

export function TopModelsPanel() {
  const { t } = useTranslation()
  // Same window as the trend panel's default so the two panels agree.
  const window = useMemo(() => computeTimeRange(7), [])

  const query = useQuery({
    queryKey: [
      'dashboard',
      'overview',
      'top-models',
      window.start_timestamp,
      window.end_timestamp,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getUserQuotaDates({
          start_timestamp: window.start_timestamp,
          end_timestamp: window.end_timestamp,
          default_time: 'day',
        })
      ),
    staleTime: 60 * 1000,
  })

  const shares = useMemo(
    () => aggregateModelShare(query.data?.data ?? [], TOP_MODEL_COUNT),
    [query.data?.data]
  )

  return (
    <div className='dash-panel'>
      <div className='dash-panel-head'>
        <h2 className='dash-panel-title'>{t('Top Models')}</h2>
        <span className='dash-panel-link'>{t('7 Days')}</span>
      </div>

      {shares.length === 0 ? (
        <p className='text-muted-foreground py-6 text-center text-xs'>
          {t('No data available')}
        </p>
      ) : (
        <div className='dash-top-models'>
          {shares.map((item) => (
            <div className='dash-model-share-row' key={item.model}>
              <span className='dash-model-share-btn' title={item.model}>
                {item.model}
              </span>
              <span className='dash-share-track'>
                <span
                  className='dash-share-fill'
                  style={{ width: shareBarWidth(item.share) }}
                />
              </span>
              <span className='dash-share-val tabular-nums'>
                {formatQuota(item.quota)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
