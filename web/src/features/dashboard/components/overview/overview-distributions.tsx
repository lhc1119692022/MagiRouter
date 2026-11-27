import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import type { QuotaDataItem } from '@/features/dashboard/types'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber, formatQuota } from '@/lib/format'
import { getLobeIcon } from '@/lib/lobe-icon'

import { summarizeOverviewModels } from './use-overview-report'

const circumference = 2 * Math.PI * 56

type Spending = { name: string; quota: number; count: number; tokens: number }

function spendingRows(rows: QuotaDataItem[]) {
  const summaries = summarizeOverviewModels(rows)
  const total = summaries.reduce((sum, item) => sum + item.quota, 0)
  let offset = 0
  const models = summaries.map((item) => {
    const share = total > 0 ? item.quota / total : 0
    const result = {
      name: item.name,
      quota: item.quota,
      count: item.count,
      tokens: item.token,
      share,
      color: item.color,
      offset,
    }
    offset += share * circumference
    return result
  })
  return { total, models }
}

export function OverviewDistributionPanels(props: { rows: QuotaDataItem[] }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const navigate = useNavigate()
  const catalog = usePricingData(props.rows.length > 0)
  const [focus, setFocus] = useState<string | null>(null)
  const spending = useMemo(() => spendingRows(props.rows), [props.rows])
  const metadata = useMemo(
    () => new Map(catalog.models.map((model) => [model.model_name, model])),
    [catalog.models]
  )
  const vendors = useMemo(() => {
    const totals = new Map<number, Spending & { id: number; icon?: string }>()
    for (const model of spending.models) {
      const entry = metadata.get(model.name)
      const id = entry?.vendor_name ? (entry.vendor_id ?? 0) : 0
      const vendor = totals.get(id) ?? {
        id,
        name: entry?.vendor_name ?? '',
        icon: entry?.vendor_icon,
        quota: 0,
        count: 0,
        tokens: 0,
      }
      vendor.quota += model.quota
      vendor.count += model.count
      vendor.tokens += model.tokens
      totals.set(id, vendor)
    }
    return [...totals.values()].sort(
      (left, right) =>
        right.quota - left.quota || left.name.localeCompare(right.name)
    )
  }, [metadata, spending.models])
  const selected = spending.models.find((item) => item.name === focus)
  const percent = (share: number) =>
    `${formatNumber(Math.round(share * 100), locale)}%`
  const knownVendorCount = vendors.filter((vendor) => vendor.id !== 0).length
  const vendorReady = !catalog.isLoading && !catalog.error
  const empty = (
    <p className='overview-report-state'>{t('No data available')}</p>
  )

  return (
    <div className='dash-split-row overview-report-distributions'>
      <section className='dash-panel' aria-label={t('Model spending share')}>
        <div className='dash-panel-head'>
          <h2 className='dash-panel-title'>{t('Model spending share')}</h2>
          <span className='console-head-meta tabular-nums'>
            {t('Total')} {formatQuota(spending.total)}
          </span>
        </div>
        {!spending.models.length ? (
          empty
        ) : (
          <div className='dash-pie-layout'>
            <div className='dash-pie-wrap'>
              <svg
                className='dash-pie-svg'
                viewBox='0 0 152 152'
                role='img'
                aria-label={t('Model spending share')}
              >
                <circle
                  cx='76'
                  cy='76'
                  r='56'
                  fill='none'
                  stroke='var(--bg-cream)'
                  strokeWidth='20'
                />
                {spending.models
                  .filter((item) => item.share > 0)
                  .map((item) => {
                    const length = circumference * item.share
                    const gap = length < 2.2 || item.share === 1 ? 0 : 2.2
                    const known = metadata.has(item.name)
                    return (
                      <circle
                        key={item.name}
                        className='dash-pie-seg'
                        data-linked={known}
                        cx='76'
                        cy='76'
                        r='56'
                        fill='none'
                        stroke={item.color}
                        strokeWidth={focus === item.name ? 23 : 20}
                        opacity={selected && focus !== item.name ? 0.45 : 1}
                        strokeDasharray={`${length - gap} ${circumference}`}
                        strokeDashoffset={-item.offset}
                        transform='rotate(-90 76 76)'
                        onPointerEnter={() => setFocus(item.name)}
                        onPointerLeave={() => setFocus(null)}
                        onClick={
                          known
                            ? () =>
                                void navigate({
                                  to: '/pricing/$modelId',
                                  params: { modelId: item.name },
                                })
                            : undefined
                        }
                      >
                        <title>
                          {item.name || t('Unknown')} ·{' '}
                          {formatQuota(item.quota)} · {percent(item.share)}
                        </title>
                      </circle>
                    )
                  })}
              </svg>
              <div className='dash-pie-center' aria-hidden='true'>
                <span className='dash-pie-center-val tabular-nums'>
                  {selected
                    ? percent(selected.share)
                    : formatQuota(spending.total)}
                </span>
                <span className='dash-pie-center-sub'>
                  {selected
                    ? selected.name || t('Unknown')
                    : t('{{count}} models', { count: spending.models.length })}
                </span>
              </div>
            </div>
            <div className='dash-pie-legend'>
              {spending.models.map((item) => {
                const name = item.name || t('Unknown')
                const contents = (
                  <>
                    <span className='dash-pie-item-left'>
                      <span
                        className='dash-pie-swatch'
                        aria-hidden='true'
                        style={{ backgroundColor: item.color }}
                      />
                      <span className='dash-pie-name'>{name}</span>
                    </span>
                    <span className='dash-pie-stat tabular-nums'>
                      {formatQuota(item.quota)} · {percent(item.share)}
                    </span>
                  </>
                )
                const interaction = {
                  title: name,
                  className: 'dash-pie-item',
                  onPointerEnter: () => setFocus(item.name),
                  onPointerLeave: () => setFocus(null),
                  onFocus: () => setFocus(item.name),
                  onBlur: () => setFocus(null),
                }
                return metadata.has(item.name) ? (
                  <Link
                    key={item.name}
                    to='/pricing/$modelId'
                    params={{ modelId: item.name }}
                    {...interaction}
                  >
                    {contents}
                  </Link>
                ) : (
                  <div key={item.name} {...interaction}>
                    {contents}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
      <section
        className='dash-panel'
        aria-label={t('Vendor spending breakdown')}
      >
        <div className='dash-panel-head'>
          <h2 className='dash-panel-title'>{t('Vendor spending breakdown')}</h2>
          {vendorReady && (
            <span className='console-head-meta tabular-nums'>
              {t('{{count}} vendors', { count: knownVendorCount })}
            </span>
          )}
        </div>
        {catalog.isLoading && (
          <LoadingState size='sm' className='overview-report-state' />
        )}
        {catalog.error && (
          <div role='alert'>
            <ErrorState
              title={t('Failed to load model metadata')}
              className='overview-report-state'
              onRetry={() => void catalog.refetch()}
            />
          </div>
        )}
        {vendorReady && !vendors.length && empty}
        {vendorReady && vendors.length > 0 && (
          <ul className='dash-vendor-list'>
            {vendors.map((vendor) => {
              const share =
                spending.total > 0 ? vendor.quota / spending.total : 0
              const name = vendor.name || t('Unassigned vendor')
              return (
                <li key={vendor.id} className='dash-vendor-row'>
                  <div className='dash-vendor-top'>
                    <span className='dash-vendor-id'>
                      <span className='dash-vendor-logo' aria-hidden='true'>
                        {vendor.icon
                          ? getLobeIcon(vendor.icon, 15)
                          : name.slice(0, 1)}
                      </span>
                      <span className='dash-vendor-name' title={name}>
                        {name}
                      </span>
                    </span>
                    <span className='dash-vendor-nums tabular-nums'>
                      <strong>{formatQuota(vendor.quota)}</strong> ·{' '}
                      {percent(share)}
                    </span>
                  </div>
                  <div className='dash-share-track' aria-hidden='true'>
                    <div
                      className='dash-share-fill'
                      style={{
                        width: `${Math.max(0, Math.min(100, share * 100))}%`,
                      }}
                    />
                  </div>
                  <div className='dash-vendor-sub tabular-nums'>
                    <span>
                      {t('{{value}} requests', {
                        value: formatNumber(vendor.count, locale),
                      })}
                    </span>
                    <span>
                      {formatCompactNumber(vendor.tokens, locale)} {t('Tokens')}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
