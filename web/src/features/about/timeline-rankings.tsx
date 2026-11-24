import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { GrowthText } from '@/features/rankings/components/growth-text'
import { useRankings } from '@/features/rankings/hooks/use-rankings'
import { formatShare, formatTokens } from '@/features/rankings/lib/format'
import type { RankingPeriod } from '@/features/rankings/types'

export function TimelineRankings() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<RankingPeriod>('week')
  const query = useRankings(period)
  const snapshot = query.data?.data
  const periods = {
    today: t('Today'),
    week: t('This week'),
    month: t('This month'),
    year: t('Year'),
  }

  return (
    <>
      <div className='timeline-rank-toolbar'>
        <div
          role='group'
          aria-label={t('Period')}
          className='timeline-filter-bar'
        >
          {(Object.keys(periods) as RankingPeriod[]).map((id) => (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              key={id}
              className={`timeline-filter-pill${period === id ? ' is-active' : ''}`}
              aria-pressed={period === id}
              onClick={() => setPeriod(id)}
            >
              {periods[id]}
            </Button>
          ))}
        </div>
        <Link to='/rankings' search={{ period }} className='timeline-jump-btn'>
          {t('View full rankings')} →
        </Link>
      </div>
      {query.isLoading && (
        <Skeleton className='mt-5 h-24 w-full' aria-label={t('Loading')} />
      )}
      {query.isError && !snapshot && (
        <ErrorState
          className='min-h-0'
          title={t('Unable to load rankings data')}
          onRetry={() => void query.refetch()}
        />
      )}
      {snapshot && (
        <div className='timeline-rank-grid'>
          <div className='el-table-wrap timeline-rank-table'>
            <table className='el-table'>
              <caption className='sr-only'>{t('LLM Leaderboard')}</caption>
              <thead>
                <tr>
                  <th scope='col'>#</th>
                  <th scope='col'>{t('Model')}</th>
                  <th scope='col'>{t('Vendor')}</th>
                  <th scope='col'>{t('Tokens')}</th>
                  <th scope='col'>{t('Change')}</th>
                </tr>
              </thead>
              <tbody>
                {(snapshot.models ?? []).slice(0, 10).map((row) => (
                  <tr key={row.model_name}>
                    <td className='tabular-nums'>{row.rank}</td>
                    <th scope='row'>{row.model_name}</th>
                    <td>{row.vendor}</td>
                    <td className='tabular-nums'>
                      {formatTokens(row.total_tokens)}
                    </td>
                    <td>
                      <GrowthText value={row.growth_pct} />
                    </td>
                  </tr>
                ))}
                {!snapshot.models?.length && (
                  <tr>
                    <td colSpan={5} className='timeline-rank-empty'>
                      {t('No data available')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className='timeline-rank-share'>
            <h3 className='el-h3'>{t('Market Share')}</h3>
            {(snapshot.vendors ?? []).slice(0, 10).map((vendor) => (
              <div className='timeline-share-row' key={vendor.vendor}>
                <span>{vendor.vendor}</span>
                <span className='tabular-nums'>
                  {formatShare(vendor.share)}
                </span>
                <progress
                  aria-label={vendor.vendor}
                  max={1}
                  value={Math.max(0, Math.min(1, vendor.share))}
                />
              </div>
            ))}
            {!snapshot.vendors?.length && (
              <p className='timeline-rank-empty'>{t('No data available')}</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
