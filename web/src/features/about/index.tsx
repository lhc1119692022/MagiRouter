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
import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { RichContent } from '@/components/rich-content'
import { Skeleton } from '@/components/ui/skeleton'
import { BrandFooter } from '@/features/magirouter-home/components/brand-footer'
import { useNotifications } from '@/hooks/use-notifications'
import { isHttpUrl, isLikelyHtml } from '@/lib/content-format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getAboutContent } from './api'

type TimelineCategory = 'all' | 'announcement' | 'model' | 'group' | 'price'

interface TimelineFeedItem {
  id: string
  category: Exclude<TimelineCategory, 'all'>
  badge: string
  date: string
  title: string
  content: string
}

const FALLBACK_TIMELINE_ITEMS: TimelineFeedItem[] = [
  {
    id: 'platform-four-protocol',
    category: 'announcement',
    badge: '站点通知',
    date: '2026-11-19',
    title: '四大官方原生协议全面贯通与全新内置文档上线',
    content:
      '上线三栏结构化开发文档（/docs），原生支持 OpenAI Responses、Chat Completions、Anthropic Messages 与 Gemini 接口，四个官方域名共享余额与密钥。',
  },
  {
    id: 'platform-multimodal',
    category: 'model',
    badge: '模型变动',
    date: '2026-11-18',
    title: '多模态 Playground 接入视频、图像与语音模型',
    content:
      '在 Playground 中可一站式体验文本推理、文生视频、图像生成与语音合成，并实时导出可复用的 cURL / JSON 请求体。',
  },
  {
    id: 'platform-billing',
    category: 'price',
    badge: '价格变动',
    date: '2026-11-15',
    title: '全站 1:1 汇率透明结算与上游失败免扣保障',
    content:
      '按真实用量与路由分组倍率实时扣费，上游超时或异常失败请求自动免扣，每笔调用均可在控制台日志中逐条对账。',
  },
]

const DEFAULT_NOTICE_TEXT = `欢迎使用 MagiRouter。以下公告内容支持在后台按纯文本随时更新：

官方接入域名：
- 主站直连：https://magirouter.com/v1（默认主力入口，全协议兼容）
- 国内优化：https://cn.magirouter.com/v1（本地客户端与桌面工具低延迟直连）
- 全球加速：https://cf.magirouter.com/v1（海外服务器与云端 Agent 边缘接入）
- 美国备用：https://us.magirouter.com/v1（高并发容灾与美西节点直连）

计费与协议说明：
- 计费公式为「模型官方定价 × 分组倍率」，全站 1:1 汇率透明折算，上游失败自动免扣。
- OpenAI 系列建议优先使用 Responses (/v1/responses)，Claude 系列使用 Anthropic Messages (/v1/messages)，Gemini 使用原生协议。`

const FILTER_TABS: { id: TimelineCategory; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'announcement', label: '站点通知' },
  { id: 'model', label: '模型变动' },
  { id: 'group', label: '分组变动' },
  { id: 'price', label: '价格变动' },
]

function inferFeedCategory(
  rawType: string,
  text: string
): { category: Exclude<TimelineCategory, 'all'>; badge: string } {
  const merged = `${rawType} ${text}`.toLowerCase()
  if (/(price|价格|降价|费率|计费|billing)/.test(merged)) {
    return { category: 'price', badge: '价格变动' }
  }
  if (/(group|分组|倍率|route|渠道)/.test(merged)) {
    return { category: 'group', badge: '分组变动' }
  }
  if (/(model|模型|上线|上架|下架|gpt|claude|gemini|seedance)/.test(merged)) {
    return { category: 'model', badge: '模型变动' }
  }
  return { category: 'announcement', badge: '站点通知' }
}

function MagiRouterTimeline() {
  const notifications = useNotifications()
  const [activeFilter, setActiveFilter] = useState<TimelineCategory>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const feedItems = useMemo<TimelineFeedItem[]>(() => {
    if (notifications.announcements.length > 0) {
      return notifications.announcements.map((item, itemIndex) => {
        let title = '站点通知'
        if (typeof item.title === 'string' && item.title.trim()) {
          title = item.title.trim()
        } else if (typeof item.content === 'string') {
          title = item.content.trim().slice(0, 48)
        }
        const content =
          typeof item.content === 'string' ? item.content.trim() : ''
        const publishDate =
          typeof item.publishDate === 'string' && item.publishDate.trim()
            ? item.publishDate.trim()
            : ''
        const rawType = typeof item.type === 'string' ? item.type : ''
        const inferred = inferFeedCategory(rawType, `${title} ${content}`)
        return {
          id: `notice-${itemIndex}-${publishDate}-${title.slice(0, 20)}`,
          category: inferred.category,
          badge: inferred.badge,
          date: publishDate,
          title,
          content,
        }
      })
    }
    return FALLBACK_TIMELINE_ITEMS
  }, [notifications.announcements])

  const filteredFeed = useMemo(() => {
    const lowered = searchQuery.trim().toLowerCase()
    return feedItems.filter((item) => {
      if (activeFilter !== 'all' && item.category !== activeFilter) {
        return false
      }
      if (!lowered) return true
      return (
        item.title.toLowerCase().includes(lowered) ||
        item.content.toLowerCase().includes(lowered) ||
        item.badge.toLowerCase().includes(lowered)
      )
    })
  }, [activeFilter, feedItems, searchQuery])

  const scrollToSection = (sectionId: string) => {
    const target = document.querySelector<HTMLElement>(`#${sectionId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const renderNoticeBody = () => {
    if (notifications.loading) {
      return (
        <div className='timeline-notice-plain space-y-2.5'>
          <Skeleton className='h-5 w-1/3' />
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-4/5' />
        </div>
      )
    }
    if (notifications.notice) {
      return (
        <div className='timeline-notice-plain'>
          <RichContent
            mode='markdown'
            content={notifications.notice}
            className='prose-neutral dark:prose-invert max-w-none text-sm'
          />
        </div>
      )
    }
    return (
      <div className='timeline-notice-plain whitespace-pre-line'>
        {DEFAULT_NOTICE_TEXT}
      </div>
    )
  }

  return (
    <>
      <section data-page='about' className='el-section-md'>
        <div className='el-container'>
          <div className='timeline-wrap'>
            <div className='timeline-page-head'>
              <div>
                <h1 className='timeline-h1'>时间线</h1>
                <p className='el-body-sm' style={{ marginTop: '8px' }}>
                  查看站长公告、站点变动通知与全站模型调用排行。
                </p>
              </div>
              <div
                className='timeline-jump-pills'
                role='navigation'
                aria-label='时间线板块跳转'
              >
                <button
                  type='button'
                  className='timeline-jump-btn'
                  onClick={() => scrollToSection('timeline-notice-section')}
                >
                  公告
                </button>
                <button
                  type='button'
                  className='timeline-jump-btn'
                  onClick={() => scrollToSection('timeline-feed-section')}
                >
                  通知
                </button>
                <Link
                  to='/rankings'
                  className='timeline-jump-btn'
                  data-no-scroll='true'
                >
                  模型排行榜 →
                </Link>
              </div>
            </div>

            <div className='timeline-section' id='timeline-notice-section'>
              <div className='section-head' style={{ marginBottom: 0 }}>
                <h2 className='el-h2'>公告</h2>
                <span className='timeline-section-meta tabular-nums'>
                  实时同步站点公告
                </span>
              </div>

              {renderNoticeBody()}
            </div>

            <div className='timeline-section' id='timeline-feed-section'>
              <div className='section-head' style={{ marginBottom: 0 }}>
                <div>
                  <h2 className='el-h2'>站点变动通知</h2>
                  <p className='el-body-sm' style={{ marginTop: '6px' }}>
                    记录站长主动通知以及模型上架、下架、分组调整与价格变动。
                  </p>
                </div>
                <span className='timeline-section-meta tabular-nums'>
                  共 {filteredFeed.length} 条记录
                </span>
              </div>

              <div className='timeline-feed-card'>
                <div className='timeline-feed-toolbar'>
                  <div
                    className='timeline-filter-bar'
                    role='tablist'
                    aria-label='通知类型筛选'
                  >
                    {FILTER_TABS.map((tab) => {
                      const active = activeFilter === tab.id
                      return (
                        <button
                          key={tab.id}
                          type='button'
                          className={
                            active
                              ? 'timeline-filter-pill is-active'
                              : 'timeline-filter-pill'
                          }
                          role='tab'
                          aria-selected={active}
                          onClick={() => setActiveFilter(tab.id)}
                        >
                          {tab.label}
                        </button>
                      )
                    })}
                  </div>
                  <div className='timeline-search-wrap'>
                    <span className='timeline-search-icon' aria-hidden='true'>
                      <Search className='size-3.5' />
                    </span>
                    <input
                      type='text'
                      className='timeline-search-input'
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder='搜索模型、分组或关键词…'
                      aria-label='搜索变动通知'
                    />
                    {searchQuery && (
                      <button
                        type='button'
                        className='timeline-search-clear'
                        aria-label='清空搜索'
                        onClick={() => setSearchQuery('')}
                      >
                        <X className='size-3' />
                      </button>
                    )}
                  </div>
                </div>

                <div className='timeline-feed'>
                  {filteredFeed.length === 0 ? (
                    <div className='el-body-sm py-8 text-center'>
                      没有找到匹配的变动通知。
                    </div>
                  ) : (
                    filteredFeed.map((item) => (
                      <article key={item.id} className='timeline-item'>
                        <div className='timeline-item-meta'>
                          <span className='el-pill'>{item.badge}</span>
                          {item.date && (
                            <span className='timeline-item-date tabular-nums'>
                              {item.date}
                            </span>
                          )}
                        </div>
                        <h3 className='timeline-item-title'>{item.title}</h3>
                        {item.content && (
                          <p className='timeline-item-desc'>{item.content}</p>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>
      <BrandFooter />
    </>
  )
}

export function About() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['about-content'],
    queryFn: async () => requireServerSuccess(await getAboutContent()),
  })

  const rawContent = data?.data?.trim() ?? ''
  const hasContent = rawContent.length > 0
  const isUrl = hasContent && isHttpUrl(rawContent)
  const contentIsHtml = hasContent && isLikelyHtml(rawContent)

  if (isLoading) {
    return (
      <PublicLayout>
        <div className='mx-auto flex max-w-4xl flex-col gap-4 py-12'>
          <Skeleton className='h-8 w-[45%]' />
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-[90%]' />
          <Skeleton className='h-4 w-[80%]' />
        </div>
      </PublicLayout>
    )
  }

  if (!hasContent) {
    return (
      <PublicLayout showMainContainer={false}>
        <MagiRouterTimeline />
      </PublicLayout>
    )
  }

  if (isUrl) {
    return (
      <PublicLayout showMainContainer={false}>
        <iframe
          src={rawContent}
          className='h-[calc(100vh-3.5rem)] w-full border-0'
          title={t('About')}
          sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts'
        />
      </PublicLayout>
    )
  }

  if (contentIsHtml) {
    return (
      <PublicLayout showMainContainer={false}>
        <RichContent
          mode='html'
          htmlVariant='isolated'
          content={rawContent}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <div className='mx-auto max-w-6xl px-4 py-8'>
        <RichContent
          mode='markdown'
          content={rawContent}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      </div>
    </PublicLayout>
  )
}
