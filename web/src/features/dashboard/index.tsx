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
import { getRouteApi } from '@tanstack/react-router'
import { Eye, EyeOff } from 'lucide-react'
import { useState, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { FadeIn } from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { DashboardSectionNavigation } from './components/dashboard-section-navigation'
import { ModelsFilter } from './components/models/models-filter-dialog'
import { OverviewDashboard } from './components/overview/overview-dashboard'
import {
  buildDefaultDashboardFilters,
  getDefaultDays,
  getSavedChartPreferences,
  getSavedGranularity,
} from './lib'
import {
  type DashboardSectionId,
  DASHBOARD_DEFAULT_SECTION,
} from './section-registry'
import type { DashboardFilters, UserChartsFilters } from './types'

const route = getRouteApi('/_authenticated/dashboard/$section')

const LazyModelAnalytics = lazy(
  () => import('./components/models/model-analytics')
)

const LazyUserCharts = lazy(() =>
  import('./components/users/user-charts').then((m) => ({
    default: m.UserCharts,
  }))
)

const LazyFlowCharts = lazy(() =>
  import('./components/flow/flow-charts').then((m) => ({
    default: m.FlowCharts,
  }))
)

function ModelChartsFallback() {
  return (
    <div className='overflow-hidden rounded-lg border'>
      <div className='flex items-center justify-between border-b px-4 py-3 sm:px-5'>
        <Skeleton className='h-5 w-32' />
        <Skeleton className='h-8 w-72' />
      </div>
      <div className='h-96 p-2'>
        <Skeleton className='h-full w-full' />
      </div>
    </div>
  )
}

const SECTION_META: Record<DashboardSectionId, { titleKey: string }> = {
  overview: {
    titleKey: 'Overview',
  },
  models: {
    titleKey: 'Model Call Analytics',
  },
  flow: {
    titleKey: 'Flow',
  },
  users: {
    titleKey: 'User Analytics',
  },
}

export function Dashboard() {
  const { t } = useTranslation()
  const params = route.useParams()
  const userRole = useAuthStore((state) => state.auth.user?.role)
  const activeSection = (params.section ??
    DASHBOARD_DEFAULT_SECTION) as DashboardSectionId

  const isAdmin = Boolean(userRole && userRole >= ROLE.ADMIN)
  if (activeSection === 'overview') return <OverviewDashboard />
  if (activeSection === 'models' || (!isAdmin && activeSection === 'users')) {
    return (
      <SectionPageLayout scrollWithDocument>
        <SectionPageLayout.Title>{t('Console')}</SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <DashboardSectionNavigation current='models' />
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <Suspense fallback={<ModelChartsFallback />}>
            <LazyModelAnalytics />
          </Suspense>
        </SectionPageLayout.Content>
      </SectionPageLayout>
    )
  }
  return <DetailedDashboard section={activeSection} />
}

function DetailedDashboard({ section }: { section: DashboardSectionId }) {
  const { t } = useTranslation()
  const [chartPreferences] = useState(getSavedChartPreferences)
  const [modelFilters, setModelFilters] = useState<DashboardFilters>(() =>
    buildDefaultDashboardFilters(chartPreferences)
  )
  const [userChartsFilters, setUserChartsFilters] = useState<UserChartsFilters>(
    () => {
      const granularity = getSavedGranularity()
      return {
        timeGranularity: granularity,
        selectedRange: getDefaultDays(granularity),
        topUserLimit: 10,
      }
    }
  )
  const [flowSensitiveVisible, setFlowSensitiveVisible] = useState(true)

  const flowActions =
    section === 'flow' ? (
      <>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='ghost'
                size='icon'
                onClick={() => setFlowSensitiveVisible((prev) => !prev)}
                aria-label={
                  flowSensitiveVisible
                    ? t('Hide sensitive data')
                    : t('Show sensitive data')
                }
                className='text-muted-foreground hover:text-foreground size-8'
              />
            }
          >
            {flowSensitiveVisible ? <Eye /> : <EyeOff />}
          </TooltipTrigger>
          <TooltipContent>
            {flowSensitiveVisible
              ? t('Hide sensitive data')
              : t('Show sensitive data')}
          </TooltipContent>
        </Tooltip>
        <ModelsFilter
          preferences={chartPreferences}
          currentFilters={modelFilters}
          onFilterChange={setModelFilters}
          onReset={() =>
            setModelFilters(buildDefaultDashboardFilters(chartPreferences))
          }
          titleKey='Flow Filters'
          descriptionKey='Filter the traffic flow view by time range and user.'
        />
      </>
    ) : null

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t(SECTION_META[section].titleKey)}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <DashboardSectionNavigation current={section} />
        {flowActions != null && (
          <div className='flex flex-wrap items-center gap-1.5 sm:gap-2'>
            {flowActions}
          </div>
        )}
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='space-y-3 sm:space-y-4'>
          {section === 'users' && (
            <FadeIn>
              <Suspense fallback={<ModelChartsFallback />}>
                <LazyUserCharts
                  filters={userChartsFilters}
                  onFiltersChange={setUserChartsFilters}
                />
              </Suspense>
            </FadeIn>
          )}
          {section === 'flow' && (
            <FadeIn>
              <Suspense fallback={<ModelChartsFallback />}>
                <LazyFlowCharts
                  filters={modelFilters}
                  sensitiveVisible={flowSensitiveVisible}
                />
              </Suspense>
            </FadeIn>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
