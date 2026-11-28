import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AnnouncementImages } from '@/components/announcement-images'
import { ErrorState } from '@/components/error-state'
import { RichContent } from '@/components/rich-content'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import {
  NOTICE_CATEGORY_LABELS,
  publishedNotices,
  type NoticeCategory,
} from '@/lib/published-notices'

const PAGE_SIZE = 5
type Filter = NoticeCategory | 'all'

export function TimelineFeed(props: {
  announcements: Record<string, unknown>[]
  loading: boolean
  failed: boolean
}) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const entries = useMemo(
    () => publishedNotices(props.announcements),
    [props.announcements]
  )
  const labels: Record<Filter, string> = {
    all: t('All'),
    announcement: t(NOTICE_CATEGORY_LABELS.announcement),
    model: t(NOTICE_CATEGORY_LABELS.model),
    group: t(NOTICE_CATEGORY_LABELS.group),
    price: t(NOTICE_CATEGORY_LABELS.price),
  }
  const query = search.trim().toLowerCase()
  const matching = entries.filter(
    (entry) =>
      (filter === 'all' || entry.category === filter) &&
      (!query ||
        [
          entry.title,
          entry.description,
          entry.kindLabel,
          labels[entry.category],
          entry.date,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query))
  )
  const pages = Math.ceil(matching.length / PAGE_SIZE)
  const currentPage = Math.min(page, Math.max(1, pages))
  const visibleEntries = matching.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )
  const loading = props.loading && !entries.length
  const unavailable = props.failed && !entries.length

  return (
    <section
      id='timeline-feed-section'
      className='timeline-section'
      aria-labelledby='timeline-feed-heading'
    >
      <div className='section-head'>
        <div>
          <h2 id='timeline-feed-heading' className='el-h2'>
            {t('Site updates')}
          </h2>
          <p className='el-body-sm mt-1.5'>
            {t('Published notices and changes to models, groups and pricing.')}
          </p>
        </div>
        {!loading && !unavailable && (
          <span
            className='timeline-section-meta tabular-nums'
            aria-live='polite'
          >
            {t('Total {{count}} records', { count: matching.length })}
          </span>
        )}
      </div>
      <div className='timeline-feed-card'>
        <div className='timeline-feed-toolbar'>
          <div
            className='timeline-filter-bar'
            role='group'
            aria-label={t('Filter updates by type')}
          >
            {(Object.keys(labels) as Filter[]).map((key) => (
              <Button
                type='button'
                variant='ghost'
                key={key}
                className={`timeline-filter-pill${key === filter ? ' is-active' : ''}`}
                aria-pressed={key === filter}
                onClick={() => {
                  setFilter(key)
                  setPage(1)
                }}
              >
                {labels[key]}
              </Button>
            ))}
          </div>
          <div className='timeline-search-wrap'>
            <span className='timeline-search-icon' aria-hidden='true'>
              <Search className='size-3.5' />
            </span>
            <Input
              type='search'
              className='timeline-search-input'
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder={t('Search models, groups or keywords')}
              aria-label={t('Search models, groups or keywords')}
            />
            {search && (
              <Button
                type='button'
                variant='ghost'
                size='icon-xs'
                className='timeline-search-clear'
                aria-label={t('Clear search')}
                onClick={() => {
                  setSearch('')
                  setPage(1)
                }}
              >
                <X aria-hidden='true' />
              </Button>
            )}
          </div>
        </div>
        <div className='timeline-feed' aria-busy={loading}>
          {loading && (
            <Skeleton className='my-5 h-16 w-full' aria-label={t('Loading')} />
          )}
          {unavailable && (
            <ErrorState
              className='min-h-0'
              title={t('Could not load this source')}
            />
          )}
          {!loading && !unavailable && !visibleEntries.length && (
            <Empty className='timeline-empty'>
              <EmptyTitle>
                {entries.length
                  ? t('No matching results')
                  : t('No announcements at this time')}
              </EmptyTitle>
              {(filter !== 'all' || query) && (
                <EmptyContent>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={() => {
                      setFilter('all')
                      setSearch('')
                      setPage(1)
                    }}
                  >
                    {t('Clear filters')}
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          )}
          {visibleEntries.map((entry) => (
            <article
              key={entry.id}
              className='timeline-entry'
              aria-label={entry.title}
              data-kind={entry.category}
              data-tone={entry.tone}
            >
              <div className='timeline-entry-date tabular-nums'>
                {entry.date && (
                  <time dateTime={entry.date}>
                    {entry.dateLabel}
                    {entry.timeLabel && (
                      <span className='timeline-entry-time'>
                        {entry.timeLabel}
                      </span>
                    )}
                  </time>
                )}
                <Badge variant='secondary' className='timeline-kind-tag'>
                  {entry.kindLabel || labels[entry.category]}
                </Badge>
              </div>
              <div className='timeline-entry-rail' aria-hidden='true'>
                <span className='timeline-dot' />
              </div>
              <div className='timeline-entry-body'>
                <h3 className='timeline-entry-title'>{entry.title}</h3>
                {entry.description && (
                  <RichContent
                    breaks
                    content={entry.description}
                    className='timeline-entry-desc'
                  />
                )}
                {entry.images.length > 0 && (
                  <AnnouncementImages images={entry.images} className='mt-3' />
                )}
              </div>
            </article>
          ))}
        </div>
        {pages > 1 && (
          <Pagination
            className='timeline-pagination'
            aria-label={t('Site updates')}
          >
            <Button
              variant='ghost'
              size='sm'
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              {t('Previous page')}
            </Button>
            {Array.from({ length: pages }, (_, index) => index + 1).map(
              (number) => (
                <Button
                  variant='ghost'
                  size='sm'
                  key={number}
                  className={`timeline-page-btn${number === currentPage ? ' is-active' : ''}`}
                  aria-current={number === currentPage ? 'page' : undefined}
                  onClick={() => setPage(number)}
                >
                  {number}
                </Button>
              )
            )}
            <Button
              variant='ghost'
              size='sm'
              disabled={currentPage === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              {t('Next page')}
            </Button>
          </Pagination>
        )}
      </div>
    </section>
  )
}
