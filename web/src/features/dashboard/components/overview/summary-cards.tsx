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
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getUserQuotaDates } from '@/features/dashboard/api'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatQuota } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { LineSparkline } from '../ui/stat-card'
import { BalanceCard } from './balance-card'
import { RouteLinesPanel } from './route-lines-panel'
import type { OverviewReport } from './use-overview-report'

export function SummaryCards(props: {
  keyCount?: number
  report: OverviewReport
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const user = useAuthStore((state) => state.auth.user)
  const report = props.report
  const recentWindow = useMemo(() => {
    const end = Math.floor(Date.now() / 1000)
    return {
      start_timestamp: end - 86400,
      end_timestamp: end,
      default_time: 'hour',
    }
  }, [])
  const recent = useQuery({
    queryKey: [
      'dashboard',
      'overview',
      'balance-usage',
      user?.id,
      recentWindow,
    ],
    queryFn: async () =>
      requireServerSuccess(await getUserQuotaDates(recentWindow)).data,
    enabled: !!user?.id,
    staleTime: 60_000,
  })
  const recentUsage = recent.data?.reduce(
    (total, item) => total + (Number(item.quota) || 0),
    0
  )
  const summary = useMemo(() => {
    const spent = report.buckets.map((bucket) => bucket.quota)
    const requests = report.buckets.map((bucket) => bucket.count)
    const periodSpend = spent.reduce((total, value) => total + value, 0)
    const periodRequests = requests.reduce((total, value) => total + value, 0)
    let cumulative = (user?.used_quota ?? 0) - periodSpend
    const history = spent.map((value) => {
      cumulative += value
      return Math.max(0, cumulative)
    })
    return { periodSpend, periodRequests, history, spent, requests }
  }, [report.buckets, user?.used_quota])
  const cards = [
    {
      key: 'spend',
      label: t(report.spendLabel),
      tag: report.periodBadge,
      value: report.query.isSuccess ? formatQuota(summary.periodSpend) : '—',
      sub: t('Total consumed quota'),
      series: summary.spent,
      tone: 'accent-1',
    },
    {
      key: 'lifetime',
      label: t('Lifetime spending'),
      tag: 'TOTAL',
      value: user?.used_quota == null ? '—' : formatQuota(user.used_quota),
      sub: t('Total consumed'),
      series: user?.used_quota == null ? [] : summary.history,
      tone: 'accent-2',
    },
    {
      key: 'requests',
      label: t(report.requestsLabel),
      tag: 'REQ',
      value: report.query.isSuccess
        ? formatNumber(summary.periodRequests, locale)
        : '—',
      sub: `${t('Total requests made')}: ${user?.request_count == null ? '—' : formatNumber(user.request_count, locale)}`,
      series: summary.requests,
      tone: 'accent-3',
    },
  ] as const
  return (
    <div className='dash-hero-grid'>
      <section className='dash-kpi-grid' aria-label={t('Usage at a glance')}>
        <h2 className='sr-only'>{t('Usage at a glance')}</h2>
        {cards.map((card) => (
          <div key={card.key} className='dash-kpi-card' data-kpi={card.key}>
            <div>
              <div className='dash-kpi-top'>
                <span className='dash-kpi-label'>{card.label}</span>
                <span className='dash-kpi-delta'>{card.tag}</span>
              </div>
              <div className='dash-kpi-val tabular-nums'>{card.value}</div>
              <div className='dash-kpi-sub'>{card.sub}</div>
            </div>
            {report.query.isSuccess && card.series.length > 0 && (
              <div className='dash-spark-wrap'>
                <LineSparkline
                  values={card.series}
                  tone={card.tone}
                  className='h-full rounded-none'
                />
              </div>
            )}
          </div>
        ))}
        <Link to='/keys' className='dash-kpi-card is-clickable'>
          <div>
            <div className='dash-kpi-top'>
              <span className='dash-kpi-label'>{t('API Keys')}</span>
              <span className='dash-kpi-delta' aria-hidden='true'>
                KEYS
              </span>
            </div>
            <div className='dash-kpi-val tabular-nums'>
              {props.keyCount == null
                ? '—'
                : formatNumber(props.keyCount, locale)}
            </div>
            <div className='dash-kpi-sub'>{t('View all')} →</div>
          </div>
        </Link>
      </section>
      <div className='dash-hero-right'>
        <BalanceCard
          balance={user?.quota}
          usage={recentUsage}
          loading={recent.isPending}
        />
        <RouteLinesPanel />
      </div>
    </div>
  )
}
