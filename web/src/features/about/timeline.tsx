import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AnnouncementImages } from '@/components/announcement-images'
import { ErrorState } from '@/components/error-state'
import { RichContent } from '@/components/rich-content'
import { Skeleton } from '@/components/ui/skeleton'
import { BrandFooter } from '@/features/magirouter-home/components/brand-footer'
import { useNotifications } from '@/hooks/use-notifications'
import { useStatus } from '@/hooks/use-status'
import { getModuleAccessFromStatus } from '@/lib/nav-modules'
import { useAuthStore } from '@/stores/auth-store'

import { TimelineFeed } from './timeline-feed'
import { TimelineRankings } from './timeline-rankings'

export function MagiRouterTimeline() {
  const { t } = useTranslation()
  const notifications = useNotifications('timeline')
  const noticeImages = notifications.noticeImages ?? []
  const { status } = useStatus()
  const authenticated = useAuthStore((state) => Boolean(state.auth.user))
  const rankings =
    status &&
    getModuleAccessFromStatus(status as Record<string, unknown>, 'rankings')
  let noticeBody = <p>{t('No announcements at this time')}</p>
  if (notifications.notice || noticeImages.length > 0) {
    noticeBody = (
      <div className='space-y-3'>
        {notifications.notice && (
          <RichContent
            mode='markdown'
            breaks
            content={notifications.notice}
            className='prose-neutral dark:prose-invert max-w-none text-sm'
          />
        )}
        {noticeImages.length > 0 && (
          <AnnouncementImages images={noticeImages} />
        )}
      </div>
    )
  } else if (notifications.noticeFailed) {
    noticeBody = (
      <ErrorState
        className='min-h-0'
        title={t('Could not load this source')}
        onRetry={() => void notifications.refetchNotice()}
      />
    )
  } else if (notifications.loading) {
    noticeBody = <Skeleton className='h-5 w-2/3' aria-label={t('Loading')} />
  }

  return (
    <>
      <section
        data-page='about'
        className='el-section-md'
        aria-label={t('Timeline')}
      >
        <div className='el-container'>
          <div className='timeline-wrap'>
            <header className='timeline-page-head'>
              <div>
                <h1 className='timeline-h1'>{t('Timeline')}</h1>
                <p className='el-body-sm mt-2'>
                  {rankings?.enabled
                    ? t('Platform notices, changes and model rankings.')
                    : t(
                        'Published notices and changes to models, groups and pricing.'
                      )}
                </p>
              </div>
              <nav
                className='timeline-jump-pills'
                aria-label={t('Timeline sections')}
              >
                <a
                  className='timeline-jump-btn'
                  href='#timeline-notice-section'
                >
                  {t('Announcements')}
                </a>
                <a className='timeline-jump-btn' href='#timeline-feed-section'>
                  {t('Notifications')}
                </a>
                {rankings?.enabled && (
                  <a
                    href='#about-rankings-section'
                    className='timeline-jump-btn'
                  >
                    {t('Rankings')} →
                  </a>
                )}
              </nav>
            </header>
            <section
              className='timeline-section'
              id='timeline-notice-section'
              aria-labelledby='timeline-notice-heading'
            >
              <h2 id='timeline-notice-heading' className='el-h2'>
                {t('System Notice')}
              </h2>
              <div className='timeline-notice-plain'>{noticeBody}</div>
            </section>
            <TimelineFeed
              announcements={notifications.announcements}
              loading={notifications.loading}
              failed={notifications.announcementsFailed}
            />
            {rankings?.enabled && (
              <section
                id='about-rankings-section'
                className='timeline-section'
                aria-labelledby='timeline-ranking-heading'
              >
                <div className='section-head'>
                  <div>
                    <h2 id='timeline-ranking-heading' className='el-h2'>
                      {t('Rankings')}
                    </h2>
                    <p className='el-body-sm mt-1.5'>
                      {t(
                        'Explore live model call volumes, vendor market share, and trending models.'
                      )}
                    </p>
                  </div>
                </div>
                {rankings.requireAuth && !authenticated ? (
                  <Link
                    to='/sign-in'
                    search={{ redirect: '/about#about-rankings-section' }}
                    className='el-btn el-btn-sm el-btn-white mt-4'
                  >
                    {t('Sign in')}
                  </Link>
                ) : (
                  <TimelineRankings />
                )}
              </section>
            )}
          </div>
        </div>
      </section>
      <BrandFooter />
    </>
  )
}
