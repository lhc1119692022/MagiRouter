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
import { useMemo, useCallback, useEffect, useState } from 'react'

import { useDebounce } from '@/hooks/use-debounce'

import {
  FILTER_ALL,
  SORT_OPTIONS,
  QUOTA_TYPES,
  ENDPOINT_TYPES,
  DEFAULT_TOKEN_UNIT,
  VIEW_MODES,
  type ViewMode,
} from '../constants'
import {
  filterAndSortModels,
  filterByVendor,
  extractAllTags,
  getCatalogFacets,
} from '../lib/filters'
import type { PricingModel, TokenUnit } from '../types'

type FilterState = {
  search?: string
  sort?: string
  quotaType?: string
  endpointType?: string
  tag?: string
  tokenUnit?: TokenUnit
  view?: ViewMode
  rechargePrice?: boolean
}

function normalizeViewMode(value: unknown): ViewMode {
  if (value === VIEW_MODES.TABLE) {
    return VIEW_MODES.TABLE
  }
  return VIEW_MODES.CARD
}

export function useFilters(
  models: PricingModel[],
  usableGroups: Record<string, unknown>,
  catalogReady: boolean
) {
  const search = useSearch({ from: '/pricing/' })
  const navigate = useNavigate({ from: '/pricing/' })
  const [filterState, setFilterState] = useState<FilterState>(() => ({
    search: search.search,
    sort: search.sort,
    quotaType: search.quotaType,
    endpointType: search.endpointType,
    tag: search.tag,
    tokenUnit: search.tokenUnit,
    view: search.view,
    rechargePrice: search.rechargePrice,
  }))

  const searchInput = filterState.search || ''
  const debouncedSearchInput = useDebounce(searchInput, 200)
  const sortBy = filterState.sort || SORT_OPTIONS.NAME
  const selectedVendors = useMemo(
    () => [
      ...new Set(
        [search.vendor ?? []]
          .flat()
          .filter((vendor) => vendor && vendor !== FILTER_ALL)
      ),
    ],
    [search.vendor]
  )
  const vendorModels = useMemo(
    () => filterByVendor(models, selectedVendors),
    [models, selectedVendors]
  )
  const availableGroups = useMemo(
    () => getCatalogFacets(vendorModels, usableGroups).groups,
    [vendorModels, usableGroups]
  )
  const groupFilter =
    search.group && availableGroups.includes(search.group)
      ? search.group
      : FILTER_ALL
  useEffect(() => {
    if (!catalogReady || !search.group || search.group === groupFilter) return
    void navigate({
      search: (previous) =>
        previous.group === search.group
          ? { ...previous, group: undefined }
          : previous,
      replace: true,
      resetScroll: false,
    })
  }, [catalogReady, groupFilter, navigate, search.group])
  const quotaTypeFilter = filterState.quotaType || QUOTA_TYPES.ALL
  const endpointTypeFilter = filterState.endpointType || ENDPOINT_TYPES.ALL
  const tagFilter = filterState.tag || FILTER_ALL
  const tokenUnit: TokenUnit =
    filterState.tokenUnit === 'K' ? 'K' : DEFAULT_TOKEN_UNIT
  const viewMode = normalizeViewMode(filterState.view)
  const showRechargePrice = filterState.rechargePrice === true

  const updateFilters = useCallback((updates: Record<string, unknown>) => {
    setFilterState((prev) => {
      const next: Record<string, unknown> = { ...prev, ...updates }
      for (const key of Object.keys(next)) {
        if (next[key] === undefined || next[key] === null) {
          delete next[key]
        }
      }
      return next as FilterState
    })
  }, [])

  const setSearchInput = useCallback(
    (v: string) => updateFilters({ search: v || undefined }),
    [updateFilters]
  )
  const setSortBy = useCallback(
    (v: string) =>
      updateFilters({ sort: v === SORT_OPTIONS.NAME ? undefined : v }),
    [updateFilters]
  )
  const toggleVendor = useCallback(
    (name: string) => {
      const next = selectedVendors.includes(name)
        ? selectedVendors.filter((vendor) => vendor !== name)
        : [...selectedVendors, name]
      const nextGroups = getCatalogFacets(
        filterByVendor(models, next),
        usableGroups
      ).groups
      void navigate({
        search: (previous) => ({
          ...previous,
          vendor: next.length > 1 ? next : next[0],
          group:
            previous.group && nextGroups.includes(previous.group)
              ? previous.group
              : undefined,
        }),
        resetScroll: false,
      })
    },
    [models, navigate, selectedVendors, usableGroups]
  )
  const setGroupFilter = useCallback(
    (group: string) => {
      void navigate({
        search: (previous) => ({
          ...previous,
          group: availableGroups.includes(group) ? group : undefined,
        }),
        resetScroll: false,
      })
    },
    [availableGroups, navigate]
  )
  const setQuotaTypeFilter = useCallback(
    (v: string) =>
      updateFilters({ quotaType: v === QUOTA_TYPES.ALL ? undefined : v }),
    [updateFilters]
  )
  const setEndpointTypeFilter = useCallback(
    (v: string) =>
      updateFilters({
        endpointType: v === ENDPOINT_TYPES.ALL ? undefined : v,
      }),
    [updateFilters]
  )
  const setTagFilter = useCallback(
    (v: string) => updateFilters({ tag: v === FILTER_ALL ? undefined : v }),
    [updateFilters]
  )
  const setTokenUnit = useCallback(
    (v: TokenUnit) =>
      updateFilters({ tokenUnit: v === DEFAULT_TOKEN_UNIT ? undefined : v }),
    [updateFilters]
  )
  const setViewMode = useCallback(
    (v: ViewMode) =>
      updateFilters({ view: v === VIEW_MODES.CARD ? undefined : v }),
    [updateFilters]
  )
  const setShowRechargePrice = useCallback(
    (v: boolean) => updateFilters({ rechargePrice: v || undefined }),
    [updateFilters]
  )

  const availableTags = useMemo(() => {
    if (!models || models.length === 0) return []
    return extractAllTags(models)
  }, [models])

  const filteredModels = useMemo(() => {
    if (!models || models.length === 0) return []

    return filterAndSortModels(models, {
      search: debouncedSearchInput,
      vendor: selectedVendors,
      group: groupFilter,
      quotaType: quotaTypeFilter,
      endpointType: endpointTypeFilter,
      tag: tagFilter,
      sortBy,
    })
  }, [
    models,
    debouncedSearchInput,
    selectedVendors,
    groupFilter,
    quotaTypeFilter,
    endpointTypeFilter,
    tagFilter,
    sortBy,
  ])

  const hasActiveFilters = useMemo(
    () =>
      selectedVendors.length > 0 ||
      groupFilter !== FILTER_ALL ||
      quotaTypeFilter !== QUOTA_TYPES.ALL ||
      endpointTypeFilter !== ENDPOINT_TYPES.ALL ||
      tagFilter !== FILTER_ALL,
    [
      selectedVendors.length,
      groupFilter,
      quotaTypeFilter,
      endpointTypeFilter,
      tagFilter,
    ]
  )

  const activeFilterCount = useMemo(
    () =>
      selectedVendors.length +
      (groupFilter !== FILTER_ALL ? 1 : 0) +
      (quotaTypeFilter !== QUOTA_TYPES.ALL ? 1 : 0) +
      (endpointTypeFilter !== ENDPOINT_TYPES.ALL ? 1 : 0) +
      (tagFilter !== FILTER_ALL ? 1 : 0),
    [
      selectedVendors.length,
      groupFilter,
      quotaTypeFilter,
      endpointTypeFilter,
      tagFilter,
    ]
  )

  const clearFilters = useCallback(() => {
    updateFilters({
      quotaType: undefined,
      endpointType: undefined,
      tag: undefined,
    })
  }, [updateFilters])

  const clearSearch = useCallback(() => {
    updateFilters({ search: undefined })
  }, [updateFilters])

  return {
    searchInput,
    sortBy,
    selectedVendors,
    availableGroups,
    groupFilter,
    quotaTypeFilter,
    endpointTypeFilter,
    tagFilter,
    tokenUnit,
    viewMode,
    showRechargePrice,
    setSearchInput,
    setSortBy,
    toggleVendor,
    setGroupFilter,
    setQuotaTypeFilter,
    setEndpointTypeFilter,
    setTagFilter,
    setTokenUnit,
    setViewMode,
    setShowRechargePrice,
    filteredModels,
    hasActiveFilters,
    activeFilterCount,
    availableTags,
    clearFilters,
    clearSearch,
  }
}
