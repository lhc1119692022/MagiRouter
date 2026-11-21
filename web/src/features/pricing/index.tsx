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
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowDownAZ,
  ArrowUpDown,
  BookOpen,
  Boxes,
  Check,
  ChevronDown,
  Compass,
  FlaskConical,
  Home,
  KeyRound,
  LayoutGrid,
  List,
  LogIn,
  Radio,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { BrandFooter } from '@/features/magirouter-home/components/brand-footer'
import { getLobeIcon } from '@/lib/lobe-icon'
import { useAuthStore } from '@/stores/auth-store'

import {
  LoadingSkeleton,
  PricingTable,
  ModelDetailsDrawer,
} from './components'
import {
  ZmModelCardGrid,
  inferModelTaskCapabilities,
  type TaskCapabilityFilter,
} from './components/zm-model-card-grid'
import {
  EXCLUDED_GROUPS,
  FILTER_ALL,
  QUOTA_TYPES,
  SORT_OPTIONS,
  VIEW_MODES,
  getSortLabels,
  type SortOption,
} from './constants'
import { useFilters } from './hooks/use-filters'
import { usePricingData } from './hooks/use-pricing-data'

const TASK_FILTER_OPTIONS: {
  id: Exclude<TaskCapabilityFilter, 'all'>
  label: string
}[] = [
  { id: 'text', label: '语言模型' },
  { id: 'image', label: '图片生成' },
  { id: 'video', label: '视频生成' },
  { id: 'audio', label: '音频生成' },
]

export function Pricing() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { auth } = useAuthStore()
  const isAuthenticated = Boolean(auth.user)
  const isAdmin = Boolean(auth.user && auth.user.role >= 10)

  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null
  )
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [extraFiltersOpen, setExtraFiltersOpen] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [taskFilter, setTaskFilter] = useState<TaskCapabilityFilter>('all')
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
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const {
    searchInput,
    sortBy,
    vendorFilter,
    groupFilter,
    quotaTypeFilter,
    tagFilter,
    tokenUnit,
    viewMode,
    showRechargePrice,
    setSearchInput,
    setSortBy,
    setVendorFilter,
    setGroupFilter,
    setQuotaTypeFilter,
    setTagFilter,
    setTokenUnit,
    setViewMode,
    setShowRechargePrice,
    filteredModels,
    hasActiveFilters,
    availableTags,
    clearFilters,
    clearSearch,
  } = useFilters(models || [])

  const displayedModels = useMemo(() => {
    if (taskFilter === 'all') return filteredModels
    return filteredModels.filter((model) =>
      inferModelTaskCapabilities(model).includes(taskFilter)
    )
  }, [filteredModels, taskFilter])

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

  const availableGroups = useMemo(
    () =>
      Object.keys(usableGroup || {}).filter(
        (groupName) => !EXCLUDED_GROUPS.includes(groupName)
      ),
    [usableGroup]
  )

  const extraActiveCount = useMemo(
    () =>
      (groupFilter !== FILTER_ALL ? 1 : 0) +
      (quotaTypeFilter !== QUOTA_TYPES.ALL ? 1 : 0) +
      (tagFilter !== FILTER_ALL ? 1 : 0),
    [groupFilter, quotaTypeFilter, tagFilter]
  )

  const anyFilterActive =
    hasActiveFilters || taskFilter !== 'all' || Boolean(searchInput.trim())

  const handleClearAll = useCallback(() => {
    clearFilters()
    clearSearch()
    setTaskFilter('all')
  }, [clearFilters, clearSearch])

  const sortLabels = useMemo(() => getSortLabels(t), [t])

  const bannerSlides = useMemo(() => {
    const flagshipModel = models?.[0]?.model_name || 'gpt-6.2-sol'
    const secondaryModel =
      models?.find((item) =>
        inferModelTaskCapabilities(item).includes('video')
      )?.model_name ||
      models?.[1]?.model_name ||
      flagshipModel
    const lowestRatioEntry = Object.entries(groupRatio || {})
      .filter(
        ([groupName, ratio]) =>
          !EXCLUDED_GROUPS.includes(groupName) && ratio > 0
      )
      .sort((first, second) => first[1] - second[1])[0]
    const cheapestLabel = lowestRatioEntry
      ? `${lowestRatioEntry[0]} 分组低至 ×${lowestRatioEntry[1]} 倍率`
      : '全站 1:1 汇率透明计费，失败请求自动免扣'

    return [
      {
        title: `${flagshipModel} 等 ${models?.length || 0} 个模型稳定在线`,
        subtitle: `一个 API 密钥统一调用 OpenAI Responses、Anthropic Messages 与 Gemini 原生协议，${cheapestLabel}。`,
        ctaLabel: '立即体验',
        onAction: () => {
          if (models?.[0]) {
            setSelectedModelName(models[0].model_name)
          } else {
            void navigate({ to: '/playground' })
          }
        },
      },
      {
        title: `多模态创作现已接入 · ${secondaryModel}`,
        subtitle:
          '在 Playground 中一站式调试文本推理、图像生成、视频制作与语音合成，实时生成可复用的 cURL 与 JSON 请求。',
        ctaLabel: '打开 Playground',
        onAction: () => {
          void navigate({ to: '/playground' })
        },
      },
      {
        title: '官方定价 × 分组倍率 · 失败免扣费',
        subtitle:
          '公开展示每个模型的输入输出单价、24 小时可用率与可用分组；上游报错或超时未交付不扣减账户额度。',
        ctaLabel: '查看文档说明',
        onAction: () => {
          void navigate({ to: '/docs' })
        },
      },
    ]
  }, [groupRatio, models, navigate])

  const activeSlide = bannerSlides[bannerSlide] || bannerSlides[0]

  const sortedVendors = useMemo(() => {
    if (!vendors || vendors.length === 0) return []
    return [...vendors]
  }, [vendors])

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
      <div className='el-table-wrap p-2'>
        <PricingTable
          models={displayedModels}
          priceRate={priceRate}
          usdExchangeRate={usdExchangeRate}
          tokenUnit={tokenUnit}
          showRechargePrice={showRechargePrice}
          selectedGroup={groupFilter}
          onModelClick={handleModelClick}
        />
      </div>
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
            <aside className='console-sidebar' aria-label='控制台侧边栏'>
              <div className='console-sidebar-scroll'>
                <div className='sidebar-section'>
                  <div className='sidebar-nav-list'>
                    <Link
                      to={isAuthenticated ? '/dashboard' : '/'}
                      className='sidebar-nav-item'
                      title={isAuthenticated ? '控制台' : '平台首页'}
                    >
                      <Home className='size-4 shrink-0' />
                      <span className='sidebar-nav-label'>
                        {isAuthenticated ? '控制台' : '平台首页'}
                      </span>
                    </Link>
                    <Link
                      to='/pricing'
                      className='sidebar-nav-item is-active'
                      title='模型广场'
                    >
                      <LayoutGrid className='size-4 shrink-0' />
                      <span className='sidebar-nav-label'>模型广场</span>
                    </Link>
                  </div>
                </div>

                <div className='sidebar-section'>
                  <div className='sidebar-group-title'>配置</div>
                  <div className='sidebar-nav-list'>
                    <Link
                      to={isAuthenticated ? '/keys' : '/sign-in'}
                      className='sidebar-nav-item'
                      title='API 密钥'
                    >
                      <KeyRound className='size-4 shrink-0' />
                      <span className='sidebar-nav-label'>API 密钥</span>
                    </Link>
                    {isAdmin && (
                      <Link
                        to='/channels'
                        className='sidebar-nav-item'
                        title='渠道状态'
                      >
                        <Radio className='size-4 shrink-0' />
                        <span className='sidebar-nav-label'>渠道状态</span>
                      </Link>
                    )}
                  </div>
                </div>

                <div className='sidebar-section'>
                  <div className='sidebar-group-title'>账号与文档</div>
                  <div className='sidebar-nav-list'>
                    {isAuthenticated && (
                      <>
                        <Link
                          to='/usage-logs'
                          className='sidebar-nav-item'
                          title='调用日志'
                        >
                          <ScrollText className='size-4 shrink-0' />
                          <span className='sidebar-nav-label'>调用日志</span>
                        </Link>
                        <Link
                          to='/wallet'
                          className='sidebar-nav-item'
                          title='钱包与充值'
                        >
                          <Wallet className='size-4 shrink-0' />
                          <span className='sidebar-nav-label'>钱包与充值</span>
                        </Link>
                        <Link
                          to='/security'
                          className='sidebar-nav-item'
                          title='账户安全'
                        >
                          <ShieldCheck className='size-4 shrink-0' />
                          <span className='sidebar-nav-label'>安全</span>
                        </Link>
                      </>
                    )}
                    <Link
                      to='/about'
                      className='sidebar-nav-item'
                      title='时间线与公告'
                    >
                      <Compass className='size-4 shrink-0' />
                      <span className='sidebar-nav-label'>时间线</span>
                    </Link>
                    <Link
                      to='/docs'
                      className='sidebar-nav-item'
                      title='开发文档'
                    >
                      <BookOpen className='size-4 shrink-0' />
                      <span className='sidebar-nav-label'>开发文档</span>
                    </Link>
                  </div>
                </div>

                {isAdmin && (
                  <div className='sidebar-section'>
                    <div className='sidebar-group-title'>管理</div>
                    <div className='sidebar-nav-list'>
                      <Link
                        to='/channels'
                        className='sidebar-nav-item'
                        title='渠道管理'
                      >
                        <Radio className='size-4 shrink-0' />
                        <span className='sidebar-nav-label'>渠道管理</span>
                      </Link>
                      <Link
                        to='/users'
                        className='sidebar-nav-item'
                        title='用户与账务'
                      >
                        <Users className='size-4 shrink-0' />
                        <span className='sidebar-nav-label'>用户与账务</span>
                      </Link>
                      <Link
                        to='/models'
                        className='sidebar-nav-item'
                        title='模型管理'
                      >
                        <Boxes className='size-4 shrink-0' />
                        <span className='sidebar-nav-label'>模型管理</span>
                      </Link>
                      <Link
                        to='/system-settings'
                        className='sidebar-nav-item'
                        title='系统设置'
                      >
                        <Settings className='size-4 shrink-0' />
                        <span className='sidebar-nav-label'>系统设置</span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              <div className='sidebar-footer'>
                {isAuthenticated ? (
                  <button
                    type='button'
                    className='sidebar-playground-card'
                    title='画布 / Playground'
                    onClick={() => void navigate({ to: '/playground' })}
                  >
                    <span className='sidebar-playground-icon' aria-hidden='true'>
                      <FlaskConical className='size-4' />
                    </span>
                    <span className='sidebar-playground-text'>
                      <span className='sidebar-playground-title'>
                        画布 / Playground
                      </span>
                      <span className='sidebar-playground-sub'>
                        在线调试与多模态创作
                      </span>
                    </span>
                    <span className='sidebar-playground-arrow' aria-hidden='true'>
                      ↗
                    </span>
                  </button>
                ) : (
                  <button
                    type='button'
                    className='sidebar-login-btn'
                    title='登录 / 注册'
                    onClick={() => void navigate({ to: '/sign-in' })}
                  >
                    <LogIn className='size-4 shrink-0' />
                    <span className='sidebar-cta-label'>登录 / 注册</span>
                  </button>
                )}
              </div>
            </aside>
          </div>

          <div className='models-main'>
            <div className='models-main-inner'>
              <div className='compact-banner'>
                <div>
                  <h2 className='compact-banner-title'>{activeSlide.title}</h2>
                  <p className='compact-banner-sub'>{activeSlide.subtitle}</p>
                </div>
                <button
                  type='button'
                  className='el-btn el-btn-md'
                  style={{
                    background: '#FFFFFF',
                    color: '#000000',
                    flexShrink: 0,
                  }}
                  onClick={activeSlide.onAction}
                >
                  {activeSlide.ctaLabel}
                </button>
                <div
                  className='compact-banner-dots'
                  role='tablist'
                  aria-label='横幅轮播'
                >
                  {bannerSlides.map((slide, slideIndex) => (
                    <button
                      key={slide.title}
                      type='button'
                      className={
                        slideIndex === bannerSlide
                          ? 'banner-dot is-active'
                          : 'banner-dot'
                      }
                      aria-label={`第 ${slideIndex + 1} 条`}
                      onClick={() => setBannerSlide(slideIndex)}
                    />
                  ))}
                </div>
              </div>

              <div className='catalog-top-bar'>
                <div className='catalog-title-group'>
                  <h1 className='catalog-h1'>全部模型</h1>
                  <span className='catalog-count tabular-nums'>
                    {displayedModels.length} 个在线模型
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
                      onClick={() => setSortMenuOpen((previous) => !previous)}
                    >
                      <ArrowUpDown className='size-3.5 opacity-75' />
                      <span>
                        {sortLabels[sortBy as SortOption] || sortLabels.name}
                      </span>
                      <ChevronDown className='size-3 opacity-60' />
                    </button>
                    {sortMenuOpen && (
                      <div
                        className='sort-dropdown-menu'
                        role='menu'
                        aria-label='模型排序选项'
                      >
                        {(Object.values(SORT_OPTIONS) as SortOption[]).map(
                          (option) => {
                            const active = sortBy === option
                            return (
                              <button
                                key={option}
                                type='button'
                                className={
                                  active
                                    ? 'sort-option-btn is-active'
                                    : 'sort-option-btn'
                                }
                                role='menuitem'
                                onClick={() => {
                                  setSortBy(option)
                                  setSortMenuOpen(false)
                                }}
                              >
                                <ArrowDownAZ className='size-3.5 opacity-70' />
                                <span>{sortLabels[option]}</span>
                                <Check className='sort-option-check size-3.5' />
                              </button>
                            )
                          }
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type='button'
                    className='sort-trigger-btn tabular-nums'
                    title='切换每百万 / 每千 Token 计价单位'
                    onClick={() =>
                      setTokenUnit(tokenUnit === 'M' ? 'K' : 'M')
                    }
                  >
                    <span>{tokenUnit === 'M' ? '/1M' : '/1K'}</span>
                  </button>

                  <button
                    type='button'
                    className={
                      showRechargePrice
                        ? 'filter-pill is-active'
                        : 'sort-trigger-btn'
                    }
                    title='按充值折算价展示'
                    onClick={() => setShowRechargePrice(!showRechargePrice)}
                  >
                    <span>充值价</span>
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

              <div className='filter-rows'>
                <div className='filter-header-row'>
                  <div className='filter-line'>
                    <span className='filter-group-label'>模型厂商</span>
                    <div className='filter-pills-wrap'>
                      {sortedVendors.map((vendor) => {
                        const active = vendorFilter === vendor.name
                        const vendorLogo = vendor.icon
                          ? getLobeIcon(vendor.icon, 14)
                          : null
                        return (
                          <button
                            key={vendor.id ?? vendor.name}
                            type='button'
                            className={
                              active ? 'filter-pill is-active' : 'filter-pill'
                            }
                            onClick={() =>
                              setVendorFilter(active ? FILTER_ALL : vendor.name)
                            }
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
                  <div className='filter-top-actions'>
                    {anyFilterActive && (
                      <button
                        type='button'
                        className='filter-clear-link'
                        onClick={handleClearAll}
                      >
                        重置
                      </button>
                    )}
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
                      <SlidersHorizontal className='size-3.5' />
                      <span>筛选</span>
                      {extraActiveCount > 0 && (
                        <span className='filter-badge-count'>
                          {extraActiveCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                <div className='filter-line'>
                  <span className='filter-group-label'>任务能力</span>
                  <div className='filter-pills-wrap'>
                    {TASK_FILTER_OPTIONS.map((option) => {
                      const active = taskFilter === option.id
                      return (
                        <button
                          key={option.id}
                          type='button'
                          className={
                            active ? 'filter-pill is-active' : 'filter-pill'
                          }
                          onClick={() =>
                            setTaskFilter(active ? 'all' : option.id)
                          }
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {extraFiltersOpen && (
                  <div className='extra-filter-rows'>
                    {availableGroups.length > 0 && (
                      <div className='filter-line'>
                        <span className='filter-group-label'>倍率分组</span>
                        <div className='filter-pills-wrap'>
                          {availableGroups.map((groupName) => {
                            const active = groupFilter === groupName
                            const ratioValue = groupRatio?.[groupName]
                            return (
                              <button
                                key={groupName}
                                type='button'
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

                    <div className='filter-line'>
                      <span className='filter-group-label'>定价类型</span>
                      <div className='filter-pills-wrap'>
                        {(
                          [
                            { id: QUOTA_TYPES.TOKEN, label: '按 Token' },
                            { id: QUOTA_TYPES.REQUEST, label: '按次计费' },
                            { id: QUOTA_TYPES.TASK, label: '按任务 / 阶梯' },
                          ] as const
                        ).map((item) => {
                          const active = quotaTypeFilter === item.id
                          return (
                            <button
                              key={item.id}
                              type='button'
                              className={
                                active ? 'filter-pill is-active' : 'filter-pill'
                              }
                              onClick={() =>
                                setQuotaTypeFilter(
                                  active ? QUOTA_TYPES.ALL : item.id
                                )
                              }
                            >
                              {item.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {availableTags.length > 0 && (
                      <div className='filter-line'>
                        <span className='filter-group-label'>模型标签</span>
                        <div className='filter-pills-wrap'>
                          {availableTags.slice(0, 14).map((tag) => {
                            const active = tagFilter === tag
                            return (
                              <button
                                key={tag}
                                type='button'
                                className={
                                  active
                                    ? 'filter-pill is-active'
                                    : 'filter-pill'
                                }
                                onClick={() =>
                                  setTagFilter(active ? FILTER_ALL : tag)
                                }
                              >
                                {tag}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

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
