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
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useAnnouncements } from '@/features/dashboard/hooks/use-status-data'
import { getPreviewText } from '@/features/dashboard/lib'
import type { AnnouncementItem } from '@/features/dashboard/types'
import { useStatus } from '@/hooks/use-status'
import { parseHeaderNavModules } from '@/lib/nav-modules'
import {
  NOTICE_CATEGORY_LABELS,
  publishedNotices,
} from '@/lib/published-notices'

import { AnnouncementDetailModal } from './announcement-detail-dialog'

import '@/styles/dashboard-editorial.css'

export function AnnouncementsPanel() {
  const { t } = useTranslation()
  const heading = useId()
  const { status } = useStatus()
  const { items, loading, enabled, failed } = useAnnouncements()
  const timelineEnabled = parseHeaderNavModules(status?.HeaderNavModules).about
  const list = useMemo(() => publishedNotices(items), [items])
  const [expanded, setExpanded] = useState(false)
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<AnnouncementItem | null>(null)
  if (!enabled && !loading && !failed) return null
  const visible = !timelineEnabled && expanded ? list : list.slice(0, 4)
  let message = t('No announcements at this time')
  if (loading) message = t('Loading...')
  if (failed) message = t('Could not load this source')
  return (
    <section className='dash-panel dash-editorial' aria-labelledby={heading}>
      <div className='dash-panel-head'>
        <h2 id={heading} className='dash-panel-title'>
          {t('Recent notices')}
        </h2>
        {timelineEnabled && (
          <Link
            to='/about'
            hash='timeline-feed-section'
            className='dash-panel-link'
          >
            {t('See all notices')} <span aria-hidden='true'>→</span>
          </Link>
        )}
        {!timelineEnabled && list.length > 4 && (
          <Button
            variant='ghost'
            size='xs'
            className='dash-panel-link'
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? t('Collapse') : t('See all notices')}
          </Button>
        )}
      </div>
      {!list.length && (
        <p
          className='dash-editorial-message'
          role={failed ? 'alert' : 'status'}
        >
          {message}
        </p>
      )}
      <div className='dash-notices-list'>
        {visible.map((item) => (
          <Button
            key={item.id}
            className='dash-notice-row'
            variant='ghost'
            onClick={() => setSelectedAnnouncement(item.record)}
          >
            <span className='dash-notice-top'>
              <span className='dash-editorial-kind'>
                {item.kindLabel || t(NOTICE_CATEGORY_LABELS[item.category])}
              </span>
              {item.date && (
                <time
                  dateTime={item.date}
                  className='dash-notice-date tabular-nums'
                >
                  {item.dateLabel}
                </time>
              )}
            </span>
            <span className='dash-notice-title'>
              {typeof item.record.title === 'string' && item.record.title.trim()
                ? item.title
                : getPreviewText(item.title, 120)}
            </span>
          </Button>
        ))}
      </div>
      <AnnouncementDetailModal
        open={Boolean(selectedAnnouncement)}
        onOpenChange={(open) => {
          if (!open) setSelectedAnnouncement(null)
        }}
        announcement={selectedAnnouncement}
      />
    </section>
  )
}
