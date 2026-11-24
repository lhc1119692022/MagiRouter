import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { getLobeIcon } from '@/lib/lobe-icon'

import type { BillingComparisonData } from '../lib/catalog-quote'

interface RoutesSectionProps {
  comparison: BillingComparisonData
  loading: boolean
  failed: boolean
}

type PriceViewMode = 'yours' | 'official'

function formatDiscountTag(ratio: number): string {
  if (ratio === 0) return '免费'
  if (ratio > 0 && ratio < 1) {
    const zhe = Math.round(ratio * 100) / 10
    return `${Number.isInteger(zhe) ? zhe.toFixed(0) : zhe}折`
  }
  return `${ratio}×`
}

function formatRatioText(ratio: number): string {
  return `倍率 ${ratio}×`
}

export function RoutesSection(props: RoutesSectionProps) {
  const { t, i18n } = useTranslation()
  const { groups, rowsByGroup } = props.comparison
  const [selectedGroupName, setSelectedGroupName] = useState<string>('')
  const [priceView, setPriceView] = useState<PriceViewMode>('yours')

  const activeGroup = useMemo(() => {
    if (groups.length === 0) return undefined
    return groups.find((group) => group.name === selectedGroupName) ?? groups[0]
  }, [groups, selectedGroupName])

  const rows = useMemo(() => {
    if (!activeGroup) return []
    return rowsByGroup[activeGroup.name] ?? []
  }, [activeGroup, rowsByGroup])

  const hasCacheColumn = useMemo(
    () =>
      rows.some(
        (row) => row.yourCacheUsd !== null || row.officialCacheUsd !== null
      ),
    [rows]
  )

  const hasAnyPublisherOfficial = useMemo(
    () => rows.some((row) => row.usesPublisherOfficialPrice),
    [rows]
  )

  const bestSavingsPercent = useMemo(() => {
    let best = 0
    for (const row of rows) {
      if (row.savingsPercent !== null && row.savingsPercent > best) {
        best = row.savingsPercent
      }
    }
    return best
  }, [rows])

  const usd = useMemo(
    () =>
      new Intl.NumberFormat(
        toIntlLocale(i18n.resolvedLanguage || i18n.language),
        {
          style: 'currency',
          currency: 'USD',
          currencyDisplay: 'narrowSymbol',
          minimumFractionDigits: 0,
          maximumSignificantDigits: 8,
        }
      ),
    [i18n.language, i18n.resolvedLanguage]
  )

  let emptyMessage = t(
    'No current token price is available for an eligible model and group.'
  )
  if (props.loading) emptyMessage = t('Loading')
  if (props.failed) emptyMessage = t('Failed to load models')

  const isYourPrice = priceView === 'yours'

  return (
    <section id='home-billing' className='el-section-md'>
      <div className='el-container'>
        <div className='section-head'>
          <div>
            <div className='section-heading-row'>
              <h2 className='el-h2'>透明可预测的平台计费体系</h2>
              <span className='section-title-badge'>计费案例</span>
            </div>
            <p className='el-body-sm' style={{ marginTop: 8, maxWidth: 640 }}>
              以下仅选取代表性模型作为计费案例，点击切换「你的价格」与「官方价格」实时对比折扣差。
            </p>
          </div>
          <Link to='/pricing' className='el-btn el-btn-lg el-btn-white'>
            查看完整价格列表 →
          </Link>
        </div>

        {activeGroup && rows.length > 0 ? (
          <section
            className={`billing-compare-shell${isYourPrice ? ' is-yours' : ' is-official'}`}
            aria-label={t('Current catalog input price')}
          >
            <div className='billing-compare-toolbar'>
              <div className='billing-compare-summary'>
                {isYourPrice ? (
                  <>
                    <span
                      className='billing-mode-dot is-savings'
                      aria-hidden='true'
                    />
                    <span className='billing-summary-text'>
                      当前分组 <strong>{activeGroup.name}</strong>
                      <span className='billing-summary-sep'>·</span>
                      <span className='tabular-nums'>
                        {formatRatioText(activeGroup.ratio)}
                      </span>
                      {bestSavingsPercent > 0 && (
                        <>
                          <span className='billing-summary-sep'>·</span>
                          <span className='billing-summary-highlight tabular-nums'>
                            最高立省 {bestSavingsPercent}%
                          </span>
                        </>
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className='billing-mode-dot is-official'
                      aria-hidden='true'
                    />
                    <span className='billing-summary-text'>
                      {hasAnyPublisherOfficial
                        ? '官方标准参考价（未应用平台分组折扣），切回「你的价格」查看折后实付'
                        : '1× 基准标准价（未应用分组线路折扣），切回「你的价格」查看分组折后价'}
                    </span>
                  </>
                )}
              </div>

              <div
                className='billing-price-toggle'
                role='group'
                aria-label='价格对比切换'
              >
                <button
                  type='button'
                  className={`billing-toggle-btn${isYourPrice ? ' is-active' : ''}`}
                  aria-pressed={isYourPrice}
                  onClick={() => setPriceView('yours')}
                >
                  <span>你的价格</span>
                  {bestSavingsPercent > 0 && (
                    <span className='billing-toggle-chip tabular-nums'>
                      省{bestSavingsPercent}%
                    </span>
                  )}
                </button>
                <button
                  type='button'
                  className={`billing-toggle-btn${!isYourPrice ? ' is-active' : ''}`}
                  aria-pressed={!isYourPrice}
                  onClick={() => setPriceView('official')}
                >
                  <span>官方价格</span>
                </button>
              </div>
            </div>

            {groups.length > 1 && (
              <div
                className='billing-group-strip'
                role='group'
                aria-label='分组线路选择'
              >
                {groups.map((group) => {
                  const selected = group.name === activeGroup.name
                  const hasDiscount = group.ratio < 1
                  return (
                    <button
                      key={group.name}
                      type='button'
                      className={`billing-group-pill${selected ? ' is-selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => {
                        setSelectedGroupName(group.name)
                        setPriceView('yours')
                      }}
                    >
                      <div className='billing-group-pill-top'>
                        <span className='billing-group-name'>{group.name}</span>
                        <span
                          className={`billing-group-tag tabular-nums${hasDiscount ? ' is-discount' : ''}`}
                        >
                          {formatDiscountTag(group.ratio)}
                        </span>
                      </div>
                      <div className='billing-group-meta tabular-nums'>
                        {formatRatioText(group.ratio)}
                        {group.desc ? ` · ${group.desc}` : ''}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <div className='billing-table-wrap'>
              <table className='billing-compare-table'>
                <thead>
                  <tr>
                    <th scope='col'>模型 ID</th>
                    <th scope='col'>输入价格</th>
                    <th scope='col'>输出价格</th>
                    {hasCacheColumn && <th scope='col'>缓存读取</th>}
                    <th scope='col' className='text-right'>
                      节省幅度
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const displayInput = isYourPrice
                      ? row.yourInputUsd
                      : row.officialInputUsd
                    const displayOutput = isYourPrice
                      ? row.yourOutputUsd
                      : row.officialOutputUsd
                    const displayCache = isYourPrice
                      ? row.yourCacheUsd
                      : row.officialCacheUsd
                    const showInputStrike =
                      isYourPrice && row.officialInputUsd > row.yourInputUsd
                    const showOutputStrike =
                      isYourPrice && row.officialOutputUsd > row.yourOutputUsd

                    let savingsBadge = (
                      <span className='billing-savings-badge is-official'>
                        官方价格
                      </span>
                    )
                    if (isYourPrice && row.savingsPercent !== null) {
                      savingsBadge = (
                        <span className='billing-savings-badge is-discount'>
                          省 {row.savingsPercent}%
                        </span>
                      )
                    } else if (isYourPrice) {
                      savingsBadge = (
                        <span className='billing-savings-badge'>
                          {formatDiscountTag(activeGroup.ratio)}
                        </span>
                      )
                    }

                    return (
                      <tr key={row.modelName}>
                        <td>
                          <Link
                            to='/pricing/$modelId'
                            params={{ modelId: row.modelName }}
                            className='billing-model-cell'
                          >
                            <span className='billing-model-icon'>
                              {row.iconKey
                                ? getLobeIcon(row.iconKey, 18)
                                : null}
                            </span>
                            <span className='billing-model-name'>
                              {row.modelName}
                            </span>
                          </Link>
                        </td>
                        <td className='tabular-nums'>
                          <div className='billing-price-cell'>
                            <span
                              className={`billing-price-main${isYourPrice ? ' is-yours' : ''}`}
                            >
                              {usd.format(displayInput)}
                              <small> / 1M</small>
                            </span>
                            {showInputStrike && (
                              <del className='billing-price-strike'>
                                {usd.format(row.officialInputUsd)}
                              </del>
                            )}
                          </div>
                        </td>
                        <td className='tabular-nums'>
                          <div className='billing-price-cell'>
                            <span
                              className={`billing-price-main${isYourPrice ? ' is-yours' : ''}`}
                            >
                              {usd.format(displayOutput)}
                              <small> / 1M</small>
                            </span>
                            {showOutputStrike && (
                              <del className='billing-price-strike'>
                                {usd.format(row.officialOutputUsd)}
                              </del>
                            )}
                          </div>
                        </td>
                        {hasCacheColumn && (
                          <td className='tabular-nums'>
                            {displayCache !== null ? (
                              <span className='billing-price-sub'>
                                {usd.format(displayCache)}
                                <small> / 1M</small>
                              </span>
                            ) : (
                              <span className='billing-price-empty'>—</span>
                            )}
                          </td>
                        )}
                        <td className='text-right tabular-nums'>
                          {savingsBadge}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className='billing-compare-footer'>
              <span className='billing-footer-note tabular-nums'>
                计费案例展示：当前仅节选 {rows.length} 个代表性模型（
                {activeGroup.name} 分组共支持 {activeGroup.modelCount} 个模型）
              </span>
              <Link to='/pricing' className='billing-footer-link'>
                查看全部模型报价 →
              </Link>
            </div>
          </section>
        ) : (
          <div className='billing-empty-shell'>
            <p role='status' className='billing-empty-status'>
              {emptyMessage}
            </p>
            <Link to='/pricing' className='el-btn el-btn-md el-btn-white'>
              前往模型广场查看 →
            </Link>
          </div>
        )}

        <div className='billing-trust-strip' aria-label='计费保障'>
          <div className='billing-trust-item'>
            <span className='billing-trust-dot' aria-hidden='true' />
            <span>余额永久有效 · 零月租</span>
          </div>
          <div className='billing-trust-item'>
            <span className='billing-trust-dot' aria-hidden='true' />
            <span>上游异常或超时 · $0 扣费</span>
          </div>
          <div className='billing-trust-item'>
            <span className='billing-trust-dot' aria-hidden='true' />
            <span>多线路池容灾 · 自动兜底</span>
          </div>
          <div className='billing-trust-item'>
            <span className='billing-trust-dot' aria-hidden='true' />
            <span>倍率与缓存明细 · 逐笔可查</span>
          </div>
        </div>
      </div>
    </section>
  )
}
