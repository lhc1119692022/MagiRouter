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
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ArrowUpZA,
  Check,
  ChevronDown,
  LayoutGrid,
  List,
  LogIn,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { BrandFooter } from '@/features/magirouter-home/components/brand-footer'
import { useStatus } from '@/hooks/use-status'
import { getLobeIcon } from '@/lib/lobe-icon'
import {
  getModelCategories,
  type ModelCapabilityCategory,
} from '@/lib/model-task-capabilities'
import { useAuthStore } from '@/stores/auth-store'

import { LoadingSkeleton, ModelDetailsDrawer } from './components'
import { CatalogNavigation } from './components/catalog-navigation'
import { TaskCapabilityFilters } from './components/task-capability-filters'
import { ZmModelCardGrid } from './components/zm-model-card-grid'
import { ZmModelTable } from './components/zm-model-table'
import {
  CATALOG_SORT_OPTIONS,
  DEFAULT_CATALOG_SORT,
  FILTER_ALL,
  PRICE_MODES,
  QUOTA_TYPES,
  VIEW_MODES,
  getQuotaTypeLabels,
  type CatalogSortIconKind,
} from './constants'
import { useFilters } from './hooks/use-filters'
import { usePricingData } from './hooks/use-pricing-data'
import {
  parsePricingBannerConfig,
  resolveShowcaseMediaKind,
  type PricingBannerSlideConfig,
} from './lib/banner-config'
import {
  getCatalogFacets,
  expandTaskFilters,
  getModelPlaygroundModes,
} from './lib/filters'

function renderCatalogSortIcon(icon: CatalogSortIconKind, className: string) {
  switch (icon) {
    case 'desc':
      return <ArrowDownWideNarrow className={className} />
    case 'asc':
      return <ArrowUpNarrowWide className={className} />
    case 'name-asc':
      return <ArrowDownAZ className={className} />
    case 'name-desc':
      return <ArrowUpZA className={className} />
  }
}

export function Pricing() {
  const { t } = useTranslation()
  const navigate = useNavigate({ from: '/pricing/' })
  const { auth } = useAuthStore()
  const { status } = useStatus()
  const isAuthenticated = Boolean(auth.user)

  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null
  )
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [extraFiltersOpen, setExtraFiltersOpen] = useState(true)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const taskFilter = useSearch({
    from: '/pricing/',
    select: (search) => search.task,
  })
  const taskFilters = useMemo(
    () => (!taskFilter ? [] : [taskFilter].flat()),
    [taskFilter]
  )
  const selectedTasks = useMemo(
    () => expandTaskFilters(taskFilters),
    [taskFilters]
  )
  const setTaskFilter = useCallback(
    (tasks: ModelCapabilityCategory[]) => {
      void navigate({
        to: '/pricing',
        search: (previous) => ({
          ...previous,
          task: tasks.length > 1 ? tasks : tasks[0],
        }),
        resetScroll: false,
      })
    },
    [navigate]
  )
  const [bannerSlide, setBannerSlide] = useState(0)
  const sortDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sortMenuOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sortDropdownRef.current &&
        !sortDropdownRef.current.contains(event.target as Node)
      ) {
        setSortMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [sortMenuOpen])

  const {
    models,
    vendors,
    groupRatio,
    usableGroup,
    endpointMap,
    autoGroups,
    catalogReady,
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const {
    searchInput,
    sortBy,
    selectedVendors,
    availableGroups,
    groupFilter,
    quotaTypeFilter,
    tokenUnit,
    viewMode,
    showRechargePrice,
    priceMode,
    setSearchInput,
    setSortBy,
    toggleVendor,
    setGroupFilter,
    setQuotaTypeFilter,
    setViewMode,
    setPriceMode,
    filteredModels,
    hasActiveFilters,
    clearFilters,
    clearSearch,
  } = useFilters(models, usableGroup, catalogReady, { groupRatio, vendors })

  const displayedModels = useMemo(() => {
    if (!selectedTasks.length) return filteredModels
    return filteredModels.filter((model) =>
      getModelCategories(model).some((category) =>
        selectedTasks.includes(category)
      )
    )
  }, [filteredModels, selectedTasks])

  const handleModelClick = useCallback((modelName: string) => {
    setSelectedModelName(modelName)
  }, [])

  const selectedModel = useMemo(
    () =>
      selectedModelName
        ? (models || []).find(
            (model) => model.model_name === selectedModelName
          ) || null
        : null,
    [models, selectedModelName]
  )

  const facets = useMemo(
    () => getCatalogFacets(models, usableGroup, { groupRatio, vendors }),
    [models, usableGroup, groupRatio, vendors]
  )
  const hasExtraOptions =
    availableGroups.length > 0 || facets.quotaTypes.length > 0

  const extraActiveCount = useMemo(
    () =>
      (groupFilter !== FILTER_ALL ? 1 : 0) +
      (quotaTypeFilter !== QUOTA_TYPES.ALL ? 1 : 0),
    [groupFilter, quotaTypeFilter]
  )

  const anyFilterActive =
    hasActiveFilters || taskFilters.length > 0 || Boolean(searchInput.trim())

  const handleClearAll = useCallback(() => {
    clearFilters()
    clearSearch()
    void navigate({
      to: '/pricing',
      search: (previous) => ({
        ...previous,
        search: undefined,
        task: undefined,
        vendor: undefined,
        group: undefined,
        quotaType: undefined,
        endpointType: undefined,
        tag: undefined,
      }),
      resetScroll: false,
    })
  }, [clearFilters, clearSearch, navigate])

  const activeSortOption = useMemo(
    () =>
      CATALOG_SORT_OPTIONS.find((option) => option.value === sortBy) ??
      CATALOG_SORT_OPTIONS.find(
        (option) => option.value === DEFAULT_CATALOG_SORT
      ) ??
      CATALOG_SORT_OPTIONS[0],
    [sortBy]
  )

  const configuredBannerSlides = useMemo(
    () =>
      parsePricingBannerConfig(
        status?.pricing_banner ?? status?.data?.pricing_banner
      ),
    [status?.data?.pricing_banner, status?.pricing_banner]
  )

  const bannerSlides = useMemo(() => {
    if (configuredBannerSlides.length > 0) {
      return configuredBannerSlides.map((slide: PricingBannerSlideConfig) => ({
        id: `${slide.title}::${slide.media_url ?? ''}::${slide.cta_href ?? ''}`,
        title: slide.title,
        subtitle: slide.subtitle ?? '',
        ctaLabel: slide.cta_label ?? '',
        mediaUrl: slide.media_url,
        mediaType: slide.media_type,
        posterUrl: slide.poster_url,
        onAction: () => {
          const href = slide.cta_href
          if (!href) return
          if (/^https?:\/\//i.test(href)) {
            window.open(href, '_blank', 'noopener,noreferrer')
            return
          }
          void navigate({ to: href as '/' })
        },
      }))
    }

    const flagshipModel = models?.[0]?.model_name
    const videoModel = models?.find((item) =>
      getModelPlaygroundModes(item).includes('video')
    )?.model_name
    const lowestRatioEntry = Object.entries(groupRatio || {})
      .filter(
        ([groupName, ratio]) => facets.groups.includes(groupName) && ratio > 0
      )
      .sort((first, second) => first[1] - second[1])[0]
    const cheapestLabel = lowestRatioEntry
      ? `${lowestRatioEntry[0]} 分组低至 ×${lowestRatioEntry[1]} 倍率`
      : t('Browse model pricing')

    return [
      {
        id: 'default-pricing',
        title: flagshipModel
          ? `${flagshipModel} · ${t('Model Pricing')}`
          : t('No models available'),
        subtitle: `一个 API 密钥统一调用 OpenAI Responses、Anthropic Messages 与 Gemini 原生协议，${cheapestLabel}。`,
        ctaLabel: '立即体验',
        mediaUrl: undefined,
        mediaType: undefined,
        posterUrl: undefined,
        onAction: () => {
          if (models?.[0]) {
            setSelectedModelName(models[0].model_name)
          } else {
            void navigate({ to: '/playground' })
          }
        },
      },
      {
        id: 'default-playground',
        title: videoModel
          ? `${t('Video Generation')} · ${videoModel}`
          : t('Playground'),
        subtitle:
          '在 Playground 中一站式调试文本推理、图像生成、视频制作与语音合成，实时生成可复用的 cURL 与 JSON 请求。',
        ctaLabel: '打开 Playground',
        mediaUrl: undefined,
        mediaType: undefined,
        posterUrl: undefined,
        onAction: () => {
          void navigate({
            to: '/playground',
            search: videoModel
              ? { mode: 'video', model: videoModel }
              : undefined,
          })
        },
      },
      {
        id: 'default-docs',
        title: '官方定价 × 分组倍率 · 失败免扣费',
        subtitle: t('Browse model pricing'),
        ctaLabel: '查看文档说明',
        mediaUrl: undefined,
        mediaType: undefined,
        posterUrl: undefined,
        onAction: () => {
          void navigate({ to: '/docs' })
        },
      },
    ]
  }, [configuredBannerSlides, facets.groups, groupRatio, models, navigate, t])

  const activeSlideIndex = bannerSlide < bannerSlides.length ? bannerSlide : 0
  const activeSlide = bannerSlides[activeSlideIndex] || bannerSlides[0]
  const activeBannerMediaKind = resolveShowcaseMediaKind(
    activeSlide?.mediaUrl,
    activeSlide?.mediaType
  )

  const sortedVendors = useMemo(() => {
    const visibleIds = new Set(models.map((model) => model.vendor_id))
    return vendors.filter((vendor) => visibleIds.has(vendor.id))
  }, [models, vendors])

  const renderPricingContent = () => {
    if (viewMode === VIEW_MODES.CARD) {
      return (
        <ZmModelCardGrid
          models={displayedModels}
          onModelClick={handleModelClick}
          priceRate={priceRate}
          usdExchangeRate={usdExchangeRate}
          tokenUnit={tokenUnit}
          showRechargePrice={showRechargePrice}
          priceMode={priceMode}
          selectedGroup={groupFilter}
          onResetFilters={handleClearAll}
        />
      )
    }

    if (displayedModels.length === 0) {
      return (
        <div className='sr-empty-state'>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 500,
              color: 'var(--ink-strong)',
            }}
          >
            没有找到匹配的模型
          </div>
          <p className='el-body-sm' style={{ marginTop: '6px' }}>
            可以尝试清除搜索关键字，或重置厂商、能力、分组与定价筛选。
          </p>
          <button
            type='button'
            className='el-btn el-btn-sm el-btn-primary'
            style={{ marginTop: '14px' }}
            onClick={handleClearAll}
          >
            重置筛选条件
          </button>
        </div>
      )
    }

    return (
      <ZmModelTable
        models={displayedModels}
        priceRate={priceRate}
        usdExchangeRate={usdExchangeRate}
        tokenUnit={tokenUnit}
        showRechargePrice={showRechargePrice}
        priceMode={priceMode}
        selectedGroup={groupFilter}
        onModelClick={handleModelClick}
      />
    )
  }

  if (isLoading) {
    return (
      <PublicLayout
        showMainContainer={false}
        onToggleSidebar={() => setSidebarCollapsed((previous) => !previous)}
        sidebarCollapsed={sidebarCollapsed}
      >
        <div className='mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6'>
          <LoadingSkeleton viewMode={viewMode} />
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout
      showMainContainer={false}
      onToggleSidebar={() => setSidebarCollapsed((previous) => !previous)}
      sidebarCollapsed={sidebarCollapsed}
    >
      <section data-page='models' className='models-view-wrap'>
        <div
          className={
            sidebarCollapsed
              ? 'models-workspace is-sidebar-collapsed'
              : 'models-workspace'
          }
        >
          <div className='console-sidebar-rail'>
            <aside className='console-sidebar' aria-label={t('Console')}>
              <CatalogNavigation />

              {!isAuthenticated && (
                <div className='sidebar-footer'>
                  <button
                    type='button'
                    className='sidebar-login-btn'
                    title={t('Log in / Register')}
                    onClick={() => void navigate({ to: '/sign-in' })}
                  >
                    <LogIn className='size-4 shrink-0' />
                    <span className='sidebar-cta-label'>
                      {t('Log in / Register')}
                    </span>
                  </button>
                </div>
              )}
            </aside>
          </div>

          <div className='models-main'>
            <div className='models-main-inner'>
              <div className='compact-banner'>
                {activeBannerMediaKind && activeSlide.mediaUrl && (
                  <div
                    className='compact-banner-media-layer'
                    aria-hidden='true'
                  >
                    {activeBannerMediaKind === 'video' ? (
                      <video
                        key={activeSlide.mediaUrl}
                        className='compact-banner-media-bg'
                        src={activeSlide.mediaUrl}
                        poster={activeSlide.posterUrl}
                        autoPlay
                        muted
                        loop
                        playsInline
                      />
                    ) : (
                      <img
                        key={activeSlide.mediaUrl}
                        className='compact-banner-media-bg'
                        src={activeSlide.mediaUrl}
                        alt=''
                      />
                    )}
                    <div className='compact-banner-scrim' />
                  </div>
                )}
                <div className='compact-banner-copy'>
                  <h2 className='compact-banner-title'>{activeSlide.title}</h2>
                  {activeSlide.subtitle && (
                    <p className='compact-banner-sub'>{activeSlide.subtitle}</p>
                  )}
                </div>
                {activeSlide.ctaLabel && (
                  <button
                    type='button'
                    className='el-btn el-btn-md compact-banner-cta'
                    style={{
                      background: '#FFFFFF',
                      color: '#000000',
                      flexShrink: 0,
                    }}
                    onClick={activeSlide.onAction}
                  >
                    {activeSlide.ctaLabel}
                  </button>
                )}
                {bannerSlides.length > 1 && (
                  <div
                    className='compact-banner-dots'
                    role='tablist'
                    aria-label='横幅轮播'
                  >
                    {bannerSlides.map((slide, slideIndex) => (
                      <button
                        key={slide.id}
                        type='button'
                        className={
                          slideIndex === activeSlideIndex
                            ? 'banner-dot is-active'
                            : 'banner-dot'
                        }
                        aria-label={`第 ${slideIndex + 1} 条`}
                        onClick={() => setBannerSlide(slideIndex)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className='catalog-top-bar'>
                <div className='catalog-title-group'>
                  <h1 className='catalog-h1'>全部模型</h1>
                  <span className='catalog-count tabular-nums'>
                    {displayedModels.length} {t('models')}
                  </span>
                </div>

                <div className='catalog-controls-right'>
                  <div className='catalog-search-wrap'>
                    <span className='catalog-search-icon' aria-hidden='true'>
                      <Search className='size-3.5' />
                    </span>
                    <input
                      type='search'
                      className='el-search-input'
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder='搜索模型，如 gpt-6.2、claude…'
                      aria-label='按名称筛选模型'
                    />
                  </div>

                  <div className='sort-dropdown-wrap' ref={sortDropdownRef}>
                    <button
                      type='button'
                      className='sort-trigger-btn'
                      aria-haspopup='menu'
                      aria-expanded={sortMenuOpen}
                      aria-label='排序方式'
                      title={t(activeSortOption.tooltipKey)}
                      onClick={() => setSortMenuOpen((previous) => !previous)}
                    >
                      {renderCatalogSortIcon(
                        activeSortOption.icon,
                        'size-3.5 shrink-0 opacity-75'
                      )}
                      <span>{t(activeSortOption.labelKey)}</span>
                      <ChevronDown className='size-3 shrink-0 opacity-60' />
                    </button>
                    {sortMenuOpen && (
                      <div
                        className='sort-dropdown-menu'
                        role='menu'
                        aria-label='模型排序选项'
                      >
                        {CATALOG_SORT_OPTIONS.map((option) => {
                          const active = sortBy === option.value
                          const tooltip = t(option.tooltipKey)
                          return (
                            <button
                              key={option.value}
                              type='button'
                              className={
                                active
                                  ? 'sort-option-btn is-active'
                                  : 'sort-option-btn'
                              }
                              role='menuitem'
                              title={tooltip}
                              aria-label={tooltip}
                              onClick={() => {
                                setSortBy(option.value)
                                setSortMenuOpen(false)
                              }}
                            >
                              {renderCatalogSortIcon(
                                option.icon,
                                'size-3.5 shrink-0 opacity-70'
                              )}
                              <span>{t(option.labelKey)}</span>
                              <Check className='sort-option-check size-3.5' />
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {hasExtraOptions && (
                    <button
                      type='button'
                      className={
                        extraFiltersOpen || extraActiveCount > 0
                          ? 'filter-expand-btn is-open'
                          : 'filter-expand-btn'
                      }
                      aria-expanded={extraFiltersOpen}
                      onClick={() =>
                        setExtraFiltersOpen((previous) => !previous)
                      }
                    >
                      <SlidersHorizontal className='size-3.5 shrink-0' />
                      <span>{t('Filters')}</span>
                      {extraActiveCount > 0 && (
                        <span className='filter-badge-count'>
                          {extraActiveCount}
                        </span>
                      )}
                    </button>
                  )}

                  <button
                    type='button'
                    className={
                      priceMode === PRICE_MODES.OFFICIAL
                        ? 'sort-trigger-btn is-active'
                        : 'sort-trigger-btn'
                    }
                    aria-pressed={priceMode === PRICE_MODES.OFFICIAL}
                    title={
                      priceMode === PRICE_MODES.OFFICIAL
                        ? t('Click to switch to your price')
                        : t('Click to switch to official price')
                    }
                    onClick={() =>
                      setPriceMode(
                        priceMode === PRICE_MODES.OFFICIAL
                          ? PRICE_MODES.YOURS
                          : PRICE_MODES.OFFICIAL
                      )
                    }
                  >
                    <span>
                      {priceMode === PRICE_MODES.OFFICIAL
                        ? t('Official price')
                        : t('Your price')}
                    </span>
                  </button>

                  <div
                    className='view-icon-switch'
                    role='group'
                    aria-label='展示模式切换'
                  >
                    <button
                      type='button'
                      className={
                        viewMode === VIEW_MODES.CARD
                          ? 'view-icon-btn is-active'
                          : 'view-icon-btn'
                      }
                      aria-label='卡片视图'
                      aria-pressed={viewMode === VIEW_MODES.CARD}
                      title='卡片视图'
                      onClick={() => setViewMode(VIEW_MODES.CARD)}
                    >
                      <LayoutGrid className='size-4' />
                    </button>
                    <button
                      type='button'
                      className={
                        viewMode === VIEW_MODES.TABLE
                          ? 'view-icon-btn is-active'
                          : 'view-icon-btn'
                      }
                      aria-label='价格表视图'
                      aria-pressed={viewMode === VIEW_MODES.TABLE}
                      title='价格表视图'
                      onClick={() => setViewMode(VIEW_MODES.TABLE)}
                    >
                      <List className='size-4' />
                    </button>
                  </div>
                </div>
              </div>

              {(models.length > 0 || anyFilterActive) && (
                <div className='filter-rows'>
                  <div className='filter-header-row'>
                    {sortedVendors.length > 0 && (
                      <div
                        className='filter-line'
                        role='group'
                        aria-label={t('Model manufacturers')}
                      >
                        <span className='filter-group-label'>
                          {t('Model manufacturers')}
                        </span>
                        <div className='filter-pills-wrap'>
                          {sortedVendors.map((vendor) => {
                            const active = selectedVendors.includes(vendor.name)
                            const vendorLogo = vendor.icon
                              ? getLobeIcon(vendor.icon, 14)
                              : null
                            return (
                              <button
                                key={vendor.id ?? vendor.name}
                                type='button'
                                aria-pressed={active}
                                className={
                                  active
                                    ? 'filter-pill is-active'
                                    : 'filter-pill'
                                }
                                onClick={() => toggleVendor(vendor.name)}
                              >
                                {vendorLogo && (
                                  <span className='filter-vendor-logo'>
                                    {vendorLogo}
                                  </span>
                                )}
                                <span>{vendor.name}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {anyFilterActive && (
                      <div className='filter-top-actions'>
                        <button
                          type='button'
                          className='filter-clear-link'
                          onClick={handleClearAll}
                        >
                          {t('Reset')}
                        </button>
                      </div>
                    )}
                  </div>

                  <TaskCapabilityFilters
                    available={facets.categories}
                    selected={selectedTasks}
                    onChange={setTaskFilter}
                  />

                  {hasExtraOptions && extraFiltersOpen && (
                    <div className='extra-filter-rows'>
                      {availableGroups.length > 0 && (
                        <div
                          className='filter-line'
                          role='group'
                          aria-label={t('Multiplier groups')}
                        >
                          <span className='filter-group-label'>
                            {t('Multiplier groups')}
                          </span>
                          <div className='filter-pills-wrap'>
                            {availableGroups.map((groupName) => {
                              const active = groupFilter === groupName
                              const ratioValue = groupRatio?.[groupName]
                              return (
                                <button
                                  key={groupName}
                                  type='button'
                                  aria-pressed={active}
                                  className={
                                    active
                                      ? 'filter-pill is-active'
                                      : 'filter-pill'
                                  }
                                  onClick={() =>
                                    setGroupFilter(
                                      active ? FILTER_ALL : groupName
                                    )
                                  }
                                >
                                  {groupName}
                                  {typeof ratioValue === 'number'
                                    ? ` ×${ratioValue}`
                                    : ''}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {facets.quotaTypes.length > 0 && (
                        <div className='filter-line'>
                          <span className='filter-group-label'>
                            {t('Pricing Type')}
                          </span>
                          <div className='filter-pills-wrap'>
                            {facets.quotaTypes.map((quota) => {
                              const active = quotaTypeFilter === quota
                              return (
                                <button
                                  key={quota}
                                  type='button'
                                  aria-pressed={active}
                                  className={
                                    active
                                      ? 'filter-pill is-active'
                                      : 'filter-pill'
                                  }
                                  onClick={() =>
                                    setQuotaTypeFilter(
                                      active ? QUOTA_TYPES.ALL : quota
                                    )
                                  }
                                >
                                  {getQuotaTypeLabels(t)[quota]}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {renderPricingContent()}
            </div>

            <div className='models-footer-slot'>
              <BrandFooter />
            </div>
          </div>
        </div>

        {selectedModel && (
          <ModelDetailsDrawer
            open={Boolean(selectedModel)}
            onOpenChange={(open) => {
              if (!open) setSelectedModelName(null)
            }}
            model={selectedModel}
            groupRatio={groupRatio || {}}
            usableGroup={usableGroup || {}}
            endpointMap={
              (endpointMap as Record<
                string,
                { path?: string; method?: string }
              >) || {}
            }
            autoGroups={autoGroups || []}
            priceRate={priceRate ?? 1}
            usdExchangeRate={usdExchangeRate ?? 1}
            tokenUnit={tokenUnit}
            showRechargePrice={showRechargePrice}
          />
        )}
      </section>
    </PublicLayout>
  )
}
