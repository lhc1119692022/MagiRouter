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
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { Link, getRouteApi, useNavigate } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import type { NavGroup } from '@/components/layout/types'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CacheStatsDialog } from '@/features/system-settings/general/channel-affinity/cache-stats-dialog'
import { useSidebarConfig } from '@/hooks/use-sidebar-config'
import { getSelf } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { ExportLogsDialog } from './components/dialogs/export-logs-dialog'
import { UserInfoDialog } from './components/dialogs/user-info-dialog'
import {
  type LogsViewScope,
  UsageLogsProvider,
  useLogsViewScope,
  useUsageLogsContext,
} from './components/usage-logs-provider'
import { UsageLogsTable } from './components/usage-logs-table'

import './logs-editorial.css'
import {
  isUsageLogsSectionId,
  USAGE_LOGS_DEFAULT_SECTION,
  type UsageLogsSectionId,
} from './section-registry'

const route = getRouteApi('/_authenticated/usage-logs/$section')
const TASK_LOG_SECTIONS = ['drawing', 'task'] as const

const SECTION_META: Record<UsageLogsSectionId, { titleKey: string }> = {
  common: {
    titleKey: 'LLM Logs',
  },
  drawing: {
    titleKey: 'Drawing Logs',
  },
  task: {
    titleKey: 'Task Logs',
  },
}

function UsageLogsContent() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = route.useParams()
  const activeCategory: UsageLogsSectionId =
    params.section && isUsageLogsSectionId(params.section)
      ? params.section
      : USAGE_LOGS_DEFAULT_SECTION
  const isTaskSection = activeCategory !== 'common'
  const isLogsRefreshing =
    useIsFetching({ queryKey: ['logs', activeCategory] }) > 0
  const isStatsRefreshing =
    useIsFetching({ queryKey: ['usage-logs-stats'] }) > 0
  const isRefreshing = isTaskSection
    ? isLogsRefreshing
    : isLogsRefreshing || isStatsRefreshing
  const {
    selectedUserId,
    userInfoDialogOpen,
    setUserInfoDialogOpen,
    affinityTarget,
    affinityDialogOpen,
    setAffinityDialogOpen,
  } = useUsageLogsContext()
  const { canManageScope, isAdminView, viewScope, setViewScope } =
    useLogsViewScope()
  const tabNavGroups = useMemo<NavGroup[]>(
    () => [
      {
        title: 'Task Logs',
        items: TASK_LOG_SECTIONS.map((section) => ({
          title: SECTION_META[section].titleKey,
          url: `/usage-logs/${section}`,
        })),
      },
    ],
    []
  )
  const filteredTabGroups = useSidebarConfig(tabNavGroups)
  const visibleSections = useMemo(
    () =>
      (filteredTabGroups[0]?.items ?? [])
        .map((item) => {
          if (!('url' in item) || typeof item.url !== 'string') return null
          return item.url.split('/').pop() ?? null
        })
        .filter((section): section is UsageLogsSectionId =>
          Boolean(section && isUsageLogsSectionId(section))
        ),
    [filteredTabGroups]
  )

  const handleSectionChange = useCallback(
    (section: string) => {
      void navigate({
        to: '/usage-logs/$section',
        params: { section: section as UsageLogsSectionId },
      })
    },
    [navigate]
  )

  const handleViewScopeChange = useCallback(
    (scope: string) => {
      if (scope === 'all' || scope === 'self') {
        setViewScope(scope as LogsViewScope)
      }
    },
    [setViewScope]
  )

  const handleRefreshTaskLogs = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['logs', activeCategory] })
  }, [queryClient, activeCategory])

  const handleRefreshCommonLogs = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['logs', 'common'] })
    void queryClient.invalidateQueries({ queryKey: ['usage-logs-stats'] })
    if (!isAdminView) {
      void getSelf()
        .then((res) => {
          if (res?.success && res.data) {
            useAuthStore.getState().auth.setUser(res.data)
          }
        })
        .catch(() => undefined)
    }
  }, [isAdminView, queryClient])

  const pageMeta =
    activeCategory === 'common' ? SECTION_META.common : SECTION_META.task
  let subtitleText = t(
    'Image, video, and audio async tasks · track progress, artifacts, and cost'
  )
  if (activeCategory === 'common') {
    subtitleText = t(
      'Per-request token usage, latency, billing mode and cost details'
    )
  } else if (activeCategory === 'drawing') {
    subtitleText = t(
      'Midjourney async drawing tasks · track progress, prompts, and images'
    )
  }
  const showTaskSwitcher =
    activeCategory !== 'common' && visibleSections.length > 1

  return (
    <>
      <SectionPageLayout wideContent>
        <SectionPageLayout.Title>
          {t(pageMeta.titleKey)}
        </SectionPageLayout.Title>
        <SectionPageLayout.Subtitle>{subtitleText}</SectionPageLayout.Subtitle>
        <SectionPageLayout.Actions>
          {canManageScope && (
            <Tabs value={viewScope} onValueChange={handleViewScopeChange}>
              <TabsList className='logs-editorial-subtabs'>
                <TabsTrigger value='all'>{t('All')}</TabsTrigger>
                <TabsTrigger value='self'>{t('Only Mine')}</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {isTaskSection ? (
            <>
              <button
                type='button'
                className='el-btn el-btn-sm el-btn-white'
                onClick={handleRefreshTaskLogs}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={cn('size-3.5', isRefreshing && 'animate-spin')}
                  aria-hidden='true'
                />
                {t('Refresh Progress')}
              </button>
              <Link
                to='/playground'
                className='el-btn el-btn-sm el-btn-primary'
              >
                {t('Go to Playground')} →
              </Link>
            </>
          ) : (
            <>
              <button
                type='button'
                className='el-btn el-btn-sm el-btn-white'
                onClick={handleRefreshCommonLogs}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={cn('size-3.5', isRefreshing && 'animate-spin')}
                  aria-hidden='true'
                />
                {t('Refresh')}
              </button>
              <ExportLogsDialog
                triggerClassName='el-btn el-btn-sm el-btn-white'
                triggerLabel={t('Export logs')}
              />
            </>
          )}
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='logs-editorial-page'>
            {showTaskSwitcher && (
              <div className='logs-section-switcher-row'>
                <Tabs
                  value={activeCategory}
                  onValueChange={handleSectionChange}
                >
                  <TabsList className='logs-editorial-subtabs max-w-full flex-wrap justify-start'>
                    {visibleSections.map((section) => (
                      <TabsTrigger key={section} value={section}>
                        {t(SECTION_META[section].titleKey)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            )}
            <div className='min-w-0'>
              <UsageLogsTable logCategory={activeCategory} />
            </div>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <UserInfoDialog
        userId={selectedUserId}
        open={userInfoDialogOpen}
        onOpenChange={setUserInfoDialogOpen}
      />

      <CacheStatsDialog
        open={affinityDialogOpen}
        onOpenChange={setAffinityDialogOpen}
        target={
          affinityTarget
            ? {
                rule_name: affinityTarget.rule_name || '',
                using_group:
                  affinityTarget.using_group ||
                  affinityTarget.selected_group ||
                  '',
                key_hint: affinityTarget.key_hint || '',
                key_fp: affinityTarget.key_fp || '',
              }
            : null
        }
      />
    </>
  )
}

export function UsageLogs() {
  return (
    <UsageLogsProvider>
      <UsageLogsContent />
    </UsageLogsProvider>
  )
}
