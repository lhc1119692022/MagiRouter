import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { getLobeIcon } from '@/lib/lobe-icon'

import {
  DEFAULT_REFERENCE_USD_CNY_RATE,
  REFERENCE_USD_CNY_PRESETS,
  computeEffectiveDiscount,
  type BillingComparisonData,
} from '../lib/catalog-quote'

interface RoutesSectionProps {
  comparison: BillingComparisonData
  loading: boolean
  failed: boolean
  priceRate?: number
  defaultReferenceUsdRate?: number
}

type PriceViewMode = 'yours' | 'official'

function formatRatioText(ratio: number): string {
  return `倍率 ${ratio}×`
}

function formatRateValue(value: number): string {
  return String(Number(value.toFixed(4)))
}

function resolveGroupsPerPage(viewportWidth: number): number {
  if (viewportWidth >= 1160) return 5
  if (viewportWidth >= 760) return 4
  return 2
}

export function RoutesSection(props: RoutesSectionProps) {
  const { t, i18n } = useTranslation()
  const { groups, rowsByGroup } = props.comparison
  const priceRate =
    typeof props.priceRate === 'number' &&
    Number.isFinite(props.priceRate) &&
    props.priceRate > 0
      ? props.priceRate
      : 1
  const initialReferenceRate =
    typeof props.defaultReferenceUsdRate === 'number' &&
    Number.isFinite(props.defaultReferenceUsdRate) &&
    props.defaultReferenceUsdRate > 0
      ? props.defaultReferenceUsdRate
      : DEFAULT_REFERENCE_USD_CNY_RATE
  const [selectedGroupName, setSelectedGroupName] = useState<string>('')
  const [priceView, setPriceView] = useState<PriceViewMode>('yours')
  const [referenceUsdRate, setReferenceUsdRate] =
    useState<number>(initialReferenceRate)
  const [rateInput, setRateInput] = useState<string>(
    formatRateValue(initialReferenceRate)
  )
  const groupStripRef = useRef<HTMLDivElement | null>(null)
  const [groupsPerPage, setGroupsPerPage] = useState<number>(() =>
    typeof window === 'undefined' ? 5 : resolveGroupsPerPage(window.innerWidth)
  )
  const [groupPage, setGroupPage] = useState<number>(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => {
      setGroupsPerPage(resolveGroupsPerPage(window.innerWidth))
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

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

  const activeGroupDiscount = useMemo(() => {
    if (!activeGroup) return null
    return computeEffectiveDiscount({
      yourUsd: activeGroup.ratio,
      officialUsd: 1,
      priceRate,
      referenceUsdRate,
    })
  }, [activeGroup, priceRate, referenceUsdRate])

  const rowDiscounts = useMemo(
    () =>
      rows.map((row) =>
        computeEffectiveDiscount({
          yourUsd: row.yourInputUsd,
          officialUsd: row.officialInputUsd,
          priceRate,
          referenceUsdRate,
        })
      ),
    [priceRate, referenceUsdRate, rows]
  )

  const bestRowDiscount = useMemo(() => {
    let bestIndex = -1
    let bestPct = 0
    for (const [index, discount] of rowDiscounts.entries()) {
      if (
        discount.savingsPercent !== null &&
        discount.savingsPercent > bestPct
      ) {
        bestPct = discount.savingsPercent
        bestIndex = index
      }
    }
    if (bestIndex >= 0) return rowDiscounts[bestIndex]
    return activeGroupDiscount
  }, [activeGroupDiscount, rowDiscounts])

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

  const cny = useMemo(
    () =>
      new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency: 'CNY',
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 0,
        maximumSignificantDigits: 6,
      }),
    []
  )

  const applyReferenceRate = (nextRate: number) => {
    if (!Number.isFinite(nextRate) || nextRate <= 0) return
    const clamped = Math.min(Math.max(nextRate, 0.1), 100)
    setReferenceUsdRate(clamped)
    setRateInput(formatRateValue(clamped))
  }

  let emptyMessage = t(
    'No current token price is available for an eligible model and group.'
  )
  if (props.loading) emptyMessage = t('Loading')
  if (props.failed) emptyMessage = t('Failed to load models')

  const isYourPrice = priceView === 'yours'
  const rateText = formatRateValue(referenceUsdRate)
  const priceRateText = formatRateValue(priceRate)
  const bestSavingsLabel = bestRowDiscount?.savingsLabel ?? null
  const totalGroupPages = Math.max(1, Math.ceil(groups.length / groupsPerPage))
  const safeGroupPage =
    ((groupPage % totalGroupPages) + totalGroupPages) % totalGroupPages
  const visibleGroups = useMemo(
    () =>
      groups.slice(
        safeGroupPage * groupsPerPage,
        safeGroupPage * groupsPerPage + groupsPerPage
      ),
    [groups, groupsPerPage, safeGroupPage]
  )
  const hasMultipleGroupPages = totalGroupPages > 1
  const groupGridColumns = Math.min(groupsPerPage, Math.max(1, groups.length))

  const cycleGroupPage = (direction: -1 | 1) => {
    if (!hasMultipleGroupPages) return
    setGroupPage(
      (prev) => (prev + direction + totalGroupPages) % totalGroupPages
    )
  }

  const handleGroupStripKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const strip = groupStripRef.current
    if (!strip) return
    const buttons = [
      ...strip.querySelectorAll<HTMLButtonElement>('.billing-group-pill'),
    ]
    const currentIndex = buttons.indexOf(
      document.activeElement as HTMLButtonElement
    )
    if (currentIndex < 0) return
    event.preventDefault()
    if (event.key === 'ArrowRight' && currentIndex === buttons.length - 1) {
      if (hasMultipleGroupPages) cycleGroupPage(1)
      return
    }
    if (event.key === 'ArrowLeft' && currentIndex === 0) {
      if (hasMultipleGroupPages) cycleGroupPage(-1)
      return
    }
    const nextIndex =
      event.key === 'ArrowRight' ? currentIndex + 1 : currentIndex - 1
    buttons[nextIndex]?.focus()
  }

  return (
    <section id='home-billing' className='el-section-md'>
      <div className='el-container'>
        <div className='section-head'>
          <div>
            <div className='section-heading-row'>
              <h2 className='el-h2'>透明可预测的平台计费体系</h2>
              <span className='section-title-badge'>计费案例</span>
            </div>
            <p className='el-body-sm' style={{ marginTop: 8, maxWidth: 700 }}>
              本站按人民币充值（
              <strong className='tabular-nums'>
                充 ¥{priceRateText} = $1 站内额度
              </strong>
              ），下方按假设汇率实时演示与官方直连的价格差。
            </p>
          </div>
          <Link to='/pricing' className='el-btn el-btn-lg el-btn-white'>
            查看完整价格列表 →
          </Link>
        </div>

        {activeGroup && activeGroupDiscount && rows.length > 0 ? (
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
                      <strong>{activeGroup.name}</strong>
                      <span className='billing-summary-sep'>·</span>
                      <span className='tabular-nums'>
                        {formatRatioText(activeGroup.ratio)}
                      </span>
                      <span className='billing-summary-sep'>·</span>
                      <span className='billing-summary-rule tabular-nums'>
                        充 ¥{priceRateText} = $1 站内额度
                      </span>
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
                        ? `官方真实美元参考价（假如 1 USD ≈ ¥${rateText}）`
                        : `1× 基准美元参考价（假如 1 USD ≈ ¥${rateText}）`}
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
                  {bestSavingsLabel && (
                    <span className='billing-toggle-chip tabular-nums'>
                      省{bestSavingsLabel}
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

            <div
              className='billing-conversion-panel'
              aria-label='汇率与优惠换算明细'
            >
              <div className='billing-calc-bar'>
                <div className='billing-calc-example'>
                  <div className='billing-calc-example-row'>
                    <span className='billing-example-tag'>汇率试算示例</span>
                    <span className='billing-calc-copy'>假如官方美元按</span>
                    <label className='billing-rate-inline tabular-nums'>
                      <span>$1 ≈ ¥</span>
                      <input
                        type='number'
                        step='0.1'
                        min='0.1'
                        max='100'
                        aria-label='参考美元汇率'
                        className='billing-rate-input tabular-nums'
                        value={rateInput}
                        onChange={(event) => {
                          const raw = event.target.value
                          setRateInput(raw)
                          const parsed = Number.parseFloat(raw)
                          if (Number.isFinite(parsed) && parsed > 0) {
                            setReferenceUsdRate(
                              Math.min(Math.max(parsed, 0.1), 100)
                            )
                          }
                        }}
                        onBlur={() =>
                          setRateInput(formatRateValue(referenceUsdRate))
                        }
                      />
                    </label>
                    <span className='billing-calc-copy'>估算</span>
                    <div
                      className='billing-rate-presets'
                      role='group'
                      aria-label='常用美元汇率'
                    >
                      {REFERENCE_USD_CNY_PRESETS.map((preset) => {
                        const active =
                          Math.abs(referenceUsdRate - preset) < 0.0001
                        return (
                          <button
                            key={preset}
                            type='button'
                            aria-pressed={active}
                            className={`billing-rate-chip tabular-nums${active ? ' is-active' : ''}`}
                            onClick={() => applyReferenceRate(preset)}
                          >
                            {preset}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <p className='billing-conversion-sub'>
                    仅作官方直连价格换算演示，本站仍按{' '}
                    <strong className='tabular-nums'>
                      充 ¥{priceRateText} = $1 站内额度
                    </strong>{' '}
                    计费
                  </p>
                </div>

                <div className='billing-calc-result tabular-nums'>
                  <div className='billing-calc-result-top'>
                    <strong className='billing-conversion-zhe'>
                      {activeGroupDiscount.zheLabel}
                    </strong>
                    {activeGroupDiscount.savingsLabel ? (
                      <span className='billing-conversion-save'>
                        综合立省 {activeGroupDiscount.savingsLabel}
                      </span>
                    ) : (
                      <span className='billing-conversion-save is-neutral'>
                        按实付汇率结算
                      </span>
                    )}
                  </div>
                  <span className='billing-calc-equation'>
                    官方 $1（约 {cny.format(referenceUsdRate)}）→ 本站实付{' '}
                    <strong>{cny.format(activeGroupDiscount.yourCny)}</strong>
                  </span>
                </div>
              </div>
            </div>

            {groups.length > 1 && (
              <div className='billing-group-bar'>
                {hasMultipleGroupPages && (
                  <button
                    type='button'
                    className='billing-group-nav-btn'
                    aria-label='上一页分组'
                    onClick={() => cycleGroupPage(-1)}
                  >
                    <HugeiconsIcon
                      icon={ArrowLeft01Icon}
                      size={16}
                      strokeWidth={2}
                      aria-hidden='true'
                    />
                  </button>
                )}

                <div
                  ref={groupStripRef}
                  className='billing-group-strip'
                  style={
                    {
                      '--billing-group-cols': String(groupGridColumns),
                    } as CSSProperties
                  }
                  role='group'
                  aria-label='分组线路选择'
                  onKeyDown={handleGroupStripKeyDown}
                >
                  {visibleGroups.map((group) => {
                    const selected = group.name === activeGroup.name
                    const groupDiscount = computeEffectiveDiscount({
                      yourUsd: group.ratio,
                      officialUsd: 1,
                      priceRate,
                      referenceUsdRate,
                    })
                    const metaText = `${formatRatioText(group.ratio)}${
                      groupDiscount.savingsLabel
                        ? ` · 省 ${groupDiscount.savingsLabel}`
                        : ''
                    }${group.desc ? ` · ${group.desc}` : ''}`
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
                          <span
                            className='billing-group-name'
                            title={group.name}
                          >
                            {group.name}
                          </span>
                          <span
                            className={`billing-group-tag tabular-nums${groupDiscount.isDiscounted ? ' is-discount' : ''}`}
                          >
                            {groupDiscount.zheLabel}
                          </span>
                        </div>
                        <div
                          className='billing-group-meta tabular-nums'
                          title={metaText}
                        >
                          {metaText}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {hasMultipleGroupPages && (
                  <div className='billing-group-nav-end'>
                    <span
                      className='billing-group-page-indicator tabular-nums'
                      aria-live='polite'
                    >
                      {safeGroupPage + 1}/{totalGroupPages}
                    </span>
                    <button
                      type='button'
                      className='billing-group-nav-btn'
                      aria-label='下一页分组'
                      onClick={() => cycleGroupPage(1)}
                    >
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        size={16}
                        strokeWidth={2}
                        aria-hidden='true'
                      />
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className='billing-table-wrap'>
              <table className='billing-compare-table'>
                <thead>
                  <tr>
                    <th scope='col'>模型 ID</th>
                    <th scope='col'>
                      {isYourPrice
                        ? '输入实付（人民币 / 站内额度）'
                        : '官方输入价'}
                    </th>
                    <th scope='col'>
                      {isYourPrice
                        ? '输出实付（人民币 / 站内额度）'
                        : '官方输出价'}
                    </th>
                    {hasCacheColumn && (
                      <th scope='col'>
                        {isYourPrice ? '缓存读取' : '官方缓存读取'}
                      </th>
                    )}
                    <th scope='col' className='billing-savings-col text-right'>
                      {isYourPrice
                        ? `实际优惠（汇率 ${rateText}）`
                        : '对比状态'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => {
                    const rowDiscount = rowDiscounts[rowIndex]
                    const yourInputCny = row.yourInputUsd * priceRate
                    const yourOutputCny = row.yourOutputUsd * priceRate
                    const yourCacheCny =
                      row.yourCacheUsd !== null
                        ? row.yourCacheUsd * priceRate
                        : null
                    const officialInputCny =
                      row.officialInputUsd * referenceUsdRate
                    const officialOutputCny =
                      row.officialOutputUsd * referenceUsdRate
                    const officialCacheCny =
                      row.officialCacheUsd !== null
                        ? row.officialCacheUsd * referenceUsdRate
                        : null
                    const showInputStrike =
                      isYourPrice && officialInputCny > yourInputCny
                    const showOutputStrike =
                      isYourPrice && officialOutputCny > yourOutputCny
                    let cacheSubline: string | null = null
                    if (isYourPrice && row.yourCacheUsd !== null) {
                      cacheSubline = `扣 ${usd.format(row.yourCacheUsd)} 额度`
                    } else if (officialCacheCny !== null) {
                      cacheSubline = `≈ ${cny.format(officialCacheCny)}`
                    }

                    let savingsBadge = (
                      <span className='billing-savings-badge is-official'>
                        官方价格
                      </span>
                    )
                    if (isYourPrice && rowDiscount?.savingsLabel) {
                      savingsBadge = (
                        <span className='billing-savings-badge is-discount'>
                          <span className='billing-savings-zhe'>
                            {rowDiscount.zheLabel}
                          </span>{' '}
                          <span
                            className='billing-savings-sep'
                            aria-hidden='true'
                          >
                            ·
                          </span>{' '}
                          <span className='billing-savings-pct'>
                            省 {rowDiscount.savingsLabel}
                          </span>
                        </span>
                      )
                    } else if (isYourPrice) {
                      savingsBadge = (
                        <span className='billing-savings-badge'>
                          {rowDiscount?.zheLabel ??
                            formatRatioText(activeGroup.ratio)}
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
                              {isYourPrice
                                ? cny.format(yourInputCny)
                                : usd.format(row.officialInputUsd)}
                              <small> / 1M</small>
                            </span>
                            <span className='billing-price-subline'>
                              {isYourPrice ? (
                                <>
                                  <span>
                                    扣 {usd.format(row.yourInputUsd)} 额度
                                  </span>
                                  {showInputStrike && (
                                    <del className='billing-price-strike'>
                                      官方 {usd.format(row.officialInputUsd)}（≈{' '}
                                      {cny.format(officialInputCny)}）
                                    </del>
                                  )}
                                </>
                              ) : (
                                <span>
                                  ≈ {cny.format(officialInputCny)} / 1M
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className='tabular-nums'>
                          <div className='billing-price-cell'>
                            <span
                              className={`billing-price-main${isYourPrice ? ' is-yours' : ''}`}
                            >
                              {isYourPrice
                                ? cny.format(yourOutputCny)
                                : usd.format(row.officialOutputUsd)}
                              <small> / 1M</small>
                            </span>
                            <span className='billing-price-subline'>
                              {isYourPrice ? (
                                <>
                                  <span>
                                    扣 {usd.format(row.yourOutputUsd)} 额度
                                  </span>
                                  {showOutputStrike && (
                                    <del className='billing-price-strike'>
                                      官方 {usd.format(row.officialOutputUsd)}
                                      （≈ {cny.format(officialOutputCny)}）
                                    </del>
                                  )}
                                </>
                              ) : (
                                <span>
                                  ≈ {cny.format(officialOutputCny)} / 1M
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        {hasCacheColumn && (
                          <td className='tabular-nums'>
                            {(isYourPrice
                              ? yourCacheCny
                              : row.officialCacheUsd) !== null ? (
                              <div className='billing-price-cell'>
                                <span className='billing-price-sub'>
                                  {isYourPrice && yourCacheCny !== null
                                    ? cny.format(yourCacheCny)
                                    : usd.format(row.officialCacheUsd ?? 0)}
                                  <small> / 1M</small>
                                </span>
                                <span className='billing-price-subline'>
                                  {cacheSubline}
                                </span>
                              </div>
                            ) : (
                              <span className='billing-price-empty'>—</span>
                            )}
                          </td>
                        )}
                        <td className='billing-savings-col text-right tabular-nums'>
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
