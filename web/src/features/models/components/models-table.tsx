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
import { getRouteApi } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import {
  useCanEditModelPricing,
  useModelPricing,
} from '@/features/model-pricing/api'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import {
  CATEGORY_LABEL_KEYS,
  MODEL_CAPABILITY_CATEGORIES,
} from '@/lib/model-task-capabilities'
import {
  getServerMessage,
  requireServerSuccess,
} from '@/lib/server-error-message'

import { getModels, searchModels, getVendors } from '../api'
import { DEFAULT_PAGE_SIZE } from '../constants'
import { modelsQueryKeys, vendorsQueryKeys } from '../lib'
import { evaluateModelHealth } from '../lib/model-health'
import type { ModelSortBy, ModelSortOrder, ModelSquareState } from '../types'
import { DataTableBulkActions } from './data-table-bulk-actions'
import { useModelsColumns } from './models-columns'
import { useModels } from './models-provider'
import { ModelsSortControl } from './models-sort-control'

const route = getRouteApi('/_authenticated/models/$section')

const EMPTY_MODELS: Model[] = []

export function ModelsTable() {
  const { t } = useTranslation()
  const { selectedVendor } = useModels()
  const canPrice = useCanEditModelPricing()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [sortBy, setSortBy] = useState<ModelSortBy>('default')
  const [sortDesc, setSortDesc] = useState(true)

  // URL state management
  const {
    globalFilter,
    onGlobalFilterChange,
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search: route.useSearch(),
    navigate: route.useNavigate(),
    pagination: {
      defaultPage: 1,
      defaultPageSize: isMobile ? 10 : DEFAULT_PAGE_SIZE,
    },
    globalFilter: { enabled: true, key: 'filter' },
    columnFilters: [
      { columnId: 'status', searchKey: 'status', type: 'array' },
      { columnId: 'square_state', searchKey: 'square_state', type: 'array' },
      {
        columnId: 'capability_labels',
        searchKey: 'capability_labels',
        type: 'array',
      },
      { columnId: 'vendor_id', searchKey: 'vendor', type: 'array' },
      { columnId: 'sync_official', searchKey: 'sync', type: 'array' },
    ],
  })

  // Extract filters from column filters
  const statusFilter =
    (columnFilters.find((f) => f.id === 'status')?.value as string[]) || []
  const squareState = (
    columnFilters.find((f) => f.id === 'square_state')?.value as
      | ModelSquareState[]
      | undefined
  )?.[0]
  const capabilityFilter =
    (columnFilters.find((f) => f.id === 'capability_labels')
      ?.value as string[]) || []
  const vendorFilter =
    (columnFilters.find((f) => f.id === 'vendor_id')?.value as string[]) || []
  const syncFilter =
    (columnFilters.find((f) => f.id === 'sync_official')?.value as string[]) ||
    []

  // Fetch vendors for filter
  const { data: vendorsData } = useQuery({
    queryKey: vendorsQueryKeys.list(),
    queryFn: async () =>
      requireServerSuccess(await getVendors({ page_size: 1000 })),
  })

  const vendors = useMemo(
    () => vendorsData?.data?.items || [],
    [vendorsData?.data?.items]
  )

  const vendorOptions = useMemo(() => {
    return vendors.map((v) => ({
      label: v.name,
      value: String(v.id),
    }))
  }, [vendors])

  // Apply selected vendor from context or filter
  const activeVendorFilter =
    selectedVendor ||
    (vendorFilter.length > 0 && !vendorFilter.includes('all')
      ? vendorFilter[0]
      : undefined)

  const statusFilterValue =
    statusFilter.length > 0 && !statusFilter.includes('all')
      ? statusFilter[0]
      : undefined
  const capabilityFilterValue =
    MODEL_CAPABILITY_CATEGORIES.filter((category) =>
      capabilityFilter.includes(category)
    ).join(',') || undefined
  const syncFilterValue =
    syncFilter.length > 0 && !syncFilter.includes('all')
      ? syncFilter[0]
      : undefined

  // Use search API whenever any filter is active so status/sync are applied server-side
  const shouldSearch = Boolean(
    globalFilter?.trim() ||
    activeVendorFilter ||
    statusFilterValue ||
    squareState ||
    capabilityFilterValue ||
    syncFilterValue
  )
  const sortParams =
    sortBy === 'default'
      ? {}
      : {
          sort_by: sortBy,
          sort_order: (sortDesc ? 'desc' : 'asc') as ModelSortOrder,
        }

  // Fetch models data
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: modelsQueryKeys.list({
      include_channel_models: true,
      keyword: globalFilter,
      vendor: activeVendorFilter,
      status: statusFilterValue,
      square_state: squareState,
      capability_labels: capabilityFilterValue,
      sync_official: syncFilterValue,
      ...sortParams,
      p: pagination.pageIndex + 1,
      page_size: pagination.pageSize,
    }),
    queryFn: async () => {
      if (shouldSearch) {
        return requireServerSuccess(
          await searchModels({
            include_channel_models: true,
            keyword: globalFilter,
            vendor: activeVendorFilter,
            status: statusFilterValue,
            square_state: squareState,
            capability_labels: capabilityFilterValue,
            sync_official: syncFilterValue,
            ...sortParams,
            p: pagination.pageIndex + 1,
            page_size: pagination.pageSize,
          })
        )
      }
      return requireServerSuccess(
        await getModels({
          include_channel_models: true,
          ...sortParams,
          p: pagination.pageIndex + 1,
          page_size: pagination.pageSize,
        })
      )
    },
  })

  const models = data?.data?.items ?? EMPTY_MODELS
  const totalCount = data?.data?.total || 0
  const vendorCounts = data?.data?.vendor_counts

  // Columns configuration
  const pricingQuery = useModelPricing(
    models
      .filter((item) => item.name_rule === 0)
      .map((item) => item.model_name),
    models.length > 0
  )
  let pricingState: 'loading' | 'error' | undefined
  if (pricingQuery.isError) pricingState = 'error'
  else if (pricingQuery.isLoading) pricingState = 'loading'
  const columns = useModelsColumns(vendors, pricingQuery.data, pricingState)

  const reviewSummary = useMemo(() => {
    const priceMap = new Map(
      (pricingQuery.data?.entries ?? []).map((entry) => [
        entry.model_name,
        entry,
      ])
    )
    const pricingLoaded = !pricingState && Boolean(pricingQuery.data)
    const warningRowIds: string[] = []
    let missingMetadataCount = 0
    let pricingReviewCount = 0
    let missingVendorCount = 0
    for (const item of models) {
      const report = evaluateModelHealth(item, priceMap.get(item.model_name), {
        canPrice,
        pricingLoaded,
      })
      if (report.warningCount > 0) {
        warningRowIds.push(
          item.id > 0 ? `metadata:${item.id}` : `channel:${item.model_name}`
        )
      }
      for (const issue of report.issues) {
        if (issue.code === 'missing_metadata') missingMetadataCount += 1
        else if (
          issue.code === 'missing_pricing' ||
          issue.code === 'default_pricing_unconfirmed' ||
          issue.code === 'legacy_pricing_conflict'
        ) {
          pricingReviewCount += 1
        } else if (issue.code === 'missing_vendor') missingVendorCount += 1
      }
    }
    return {
      warningRowIds,
      missingMetadataCount,
      pricingReviewCount,
      missingVendorCount,
    }
  }, [models, pricingQuery.data, pricingState, canPrice])

  const handleSortChange = (nextField: ModelSortBy, nextDesc: boolean) => {
    setSortBy(nextField)
    setSortDesc(nextDesc)
    if (pagination.pageIndex > 0) {
      onPaginationChange({ ...pagination, pageIndex: 0 })
    }
  }

  // React Table instance
  const { table } = useDataTable({
    data: models,
    getRowId: (model) =>
      model.id > 0 ? `metadata:${model.id}` : `channel:${model.model_name}`,
    columns,
    totalCount,
    initialColumnVisibility: {
      description: false,
      id: false,
      vendor_id: false,
      name_rule: false,
      endpoints: false,
      created_time: false,
      updated_time: false,
      status: false,
    },
    columnFilters,
    pagination,
    globalFilter,
    enableRowSelection: true,
    onColumnFiltersChange,
    onPaginationChange,
    onGlobalFilterChange,
    manualPagination: true,
    manualFiltering: true,
    ensurePageInRange,
  })

  // Prepare filter options
  const vendorFilterOptions = [
    {
      label: `${t('All Vendors')}${vendorCounts?.all ? ` (${vendorCounts.all})` : ''}`,
      value: 'all',
    },
    ...vendorOptions.map((option) => ({
      label: `${option.label}${vendorCounts?.[option.value] ? ` (${vendorCounts[option.value]})` : ''}`,
      value: option.value,
    })),
  ]

  if (isError || data?.success === false) {
    return (
      <ErrorState
        description={error?.message ?? getServerMessage(data)}
        onRetry={() => void refetch()}
      />
    )
  }

  return (
    <DataTablePage
      showMobileBulkActions
      mobileProps={{ enableRowSelection: true }}
      table={table}
      columns={columns}
      isLoading={isLoading}
      isFetching={isFetching}
      beforeTable={
        reviewSummary.warningRowIds.length > 0 ? (
          <div
            role='status'
            className='border-warning/30 bg-warning/5 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs'
          >
            <div className='flex min-w-0 items-center gap-2'>
              <AlertTriangle
                className='text-warning size-4 shrink-0'
                aria-hidden='true'
              />
              <span className='text-foreground'>
                {t(
                  '{{count}} models on this page have incomplete or unconfirmed settings.',
                  { count: reviewSummary.warningRowIds.length }
                )}
                {(reviewSummary.missingMetadataCount > 0 ||
                  reviewSummary.pricingReviewCount > 0 ||
                  reviewSummary.missingVendorCount > 0) && (
                  <span className='text-muted-foreground ml-1.5'>
                    {[
                      reviewSummary.missingMetadataCount > 0
                        ? t('Missing metadata: {{count}}', {
                            count: reviewSummary.missingMetadataCount,
                          })
                        : null,
                      reviewSummary.pricingReviewCount > 0
                        ? t('Pricing to confirm: {{count}}', {
                            count: reviewSummary.pricingReviewCount,
                          })
                        : null,
                      reviewSummary.missingVendorCount > 0
                        ? t('No vendor: {{count}}', {
                            count: reviewSummary.missingVendorCount,
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </span>
            </div>
            <div className='flex shrink-0 flex-wrap items-center gap-1.5'>
              {sortBy !== 'issues' && (
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  className='h-7 text-xs'
                  onClick={() => handleSortChange('issues', true)}
                >
                  {t('Needs review first')}
                </Button>
              )}
              <Button
                type='button'
                size='sm'
                variant='secondary'
                className='h-7 text-xs'
                onClick={() => {
                  const selection: Record<string, boolean> = {}
                  for (const rowId of reviewSummary.warningRowIds) {
                    selection[rowId] = true
                  }
                  table.setRowSelection(selection)
                }}
              >
                {t('Select models to confirm')}
              </Button>
            </div>
          </div>
        ) : null
      }
      emptyTitle={t('No Models Found')}
      emptyDescription={
        shouldSearch
          ? t('Try adjusting your search')
          : t('No models available. Create your first model to get started.')
      }
      skeletonKeyPrefix='model-skeleton'
      applyHeaderSize
      pinnedColumns={[
        { columnId: 'model_name', side: 'left' },
        { columnId: 'actions', side: 'right' },
      ]}
      toolbarProps={{
        searchPlaceholder: t('Filter by model name...'),
        searchDebounceMs: 500,
        preActions: (
          <ModelsSortControl
            field={sortBy}
            desc={sortDesc}
            onChange={handleSortChange}
          />
        ),
        filters: [
          {
            columnId: 'status',
            title: t('Display policy'),
            options: [
              { label: t('Allowed'), value: 'enabled' },
              { label: t('Not listed'), value: 'disabled' },
            ],
            singleSelect: true,
          },
          {
            columnId: 'square_state',
            title: t('Model square visibility'),
            options: [
              { label: t('Displayed'), value: 'visible' },
              { label: t('Unavailable'), value: 'unavailable' },
              { label: t('Listing hidden'), value: 'hidden' },
              { label: t('Partly shown'), value: 'partial' },
            ],
            singleSelect: true,
          },
          {
            columnId: 'vendor_id',
            title: t('Vendor'),
            options: vendorFilterOptions,
            singleSelect: true,
          },
          {
            columnId: 'capability_labels',
            title: t('Capability labels'),
            options: MODEL_CAPABILITY_CATEGORIES.map((category) => ({
              label: t(CATEGORY_LABEL_KEYS[category]),
              value: category,
            })),
          },
          {
            columnId: 'sync_official',
            title: t('Sync policy'),
            options: [
              { label: t('Allow updates'), value: 'yes' },
              { label: t('Keep local'), value: 'no' },
            ],
            singleSelect: true,
          },
        ],
      }}
      bulkActions={<DataTableBulkActions table={table} />}
    />
  )
}
