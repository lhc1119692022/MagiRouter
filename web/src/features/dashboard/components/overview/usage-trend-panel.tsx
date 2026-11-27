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
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import '@/styles/overview-report.css'

import { OverviewDistributionPanels } from './overview-distributions'
import { OverviewTrendChart, type OverviewMetric } from './overview-trend-chart'
import {
  overviewPeriods,
  type OverviewRange,
  type OverviewReport,
} from './use-overview-report'

const periodIds: OverviewRange[] = ['today', '7d', '30d', 'all']
const metrics = [
  { id: 'quota', label: 'Spend' },
  { id: 'count', label: 'Requests' },
  { id: 'token', label: 'Tokens' },
] as const

export function UsageTrendPanel(props: {
  report: OverviewReport
  notices?: ReactNode
  showDistributions?: boolean
}) {
  const { t, i18n } = useTranslation()
  const periodId = useId()
  const [metric, setMetric] = useState<OverviewMetric>('quota')
  const report = props.report
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })
  const periodText = `${dates.format(report.start * 1000)} – ${dates.format(report.end * 1000)}`
  return (
    <>
      <div className='dash-period-bar overview-report-period'>
        <div className='dash-period-left'>
          <span className='dash-period-title' id={periodId}>
            {t('Reporting period')}
          </span>
          <div
            className='console-subtabs'
            role='group'
            aria-labelledby={periodId}
          >
            {periodIds.map((id) => (
              <Button
                key={id}
                variant='ghost'
                aria-pressed={report.range === id}
                className={cn(
                  'console-subtab-btn',
                  report.range === id && 'is-active'
                )}
                onClick={() => report.setRange(id)}
              >
                {t(overviewPeriods[id].label)}
              </Button>
            ))}
          </div>
          <span className='console-head-meta tabular-nums' title={periodText}>
            {t(report.meta)}
            {report.range === 'all' && ` · ${periodText}`}
          </span>
        </div>
        <Link
          to='/dashboard/$section'
          params={{ section: 'models' }}
          className='dash-panel-link'
        >
          {t('View detailed analytics')} <span aria-hidden='true'>→</span>
        </Link>
      </div>
      <div className='overview-trends overview-report-mid'>
        <section
          className='dash-panel overview-report-trend'
          aria-label={t(report.title)}
        >
          <div className='dash-panel-head'>
            <h2 className='dash-panel-title'>{t(report.title)}</h2>
            <div
              className='dash-metric-pills'
              role='group'
              aria-label={t('Usage')}
            >
              {metrics.map((item) => (
                <Button
                  key={item.id}
                  variant='ghost'
                  className={cn(
                    'dash-metric-pill',
                    metric === item.id && 'is-active'
                  )}
                  aria-pressed={metric === item.id}
                  onClick={() => setMetric(item.id)}
                >
                  {t(item.label)}
                </Button>
              ))}
            </div>
          </div>
          {report.query.isPending && (
            <LoadingState size='sm' className='overview-report-state' />
          )}
          {report.query.isError && (
            <div role='alert'>
              <ErrorState
                title={t('Failed to load')}
                className='overview-report-state'
                onRetry={() => void report.query.refetch()}
              />
            </div>
          )}
          {report.query.isSuccess &&
            (report.rows.length ? (
              <OverviewTrendChart
                key={report.range}
                buckets={report.buckets}
                models={report.models}
                range={report.range}
                metric={metric}
              />
            ) : (
              <p className='overview-report-state'>{t('No data available')}</p>
            ))}
        </section>
        {props.notices}
      </div>
      {props.showDistributions !== false && report.query.isSuccess && (
        <OverviewDistributionPanels rows={report.rows} />
      )}
    </>
  )
}
