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
  DEFAULT_CATALOG_SORT,
  FILTER_ALL,
  PRICE_MODES,
  QUOTA_TYPES,
  ENDPOINT_TYPES,
  DEFAULT_TOKEN_UNIT,
  VIEW_MODES,
  type ViewMode,
} from '../constants'
import {
  filterAndSortModels,
  filterByVendor,
  getCatalogFacets,
  type CatalogFacetsOptions,
} from '../lib/filters'
import type { PriceMode, PricingModel, TokenUnit } from '../types'

type FilterState = {
  search?: string
  sort?: string
  quotaType?: string
  endpointType?: string
  tokenUnit?: TokenUnit
  view?: ViewMode
  rechargePrice?: boolean
  priceMode?: PriceMode
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
  catalogReady: boolean,
  facetOptions?: CatalogFacetsOptions
) {
  const search = useSearch({ from: '/pricing/' })
  const navigate = useNavigate({ from: '/pricing/' })
  const groupRatio = facetOptions?.groupRatio
  const vendors = facetOptions?.vendors
  const filterOrder = facetOptions?.filterOrder
  const [filterState, setFilterState] = useState<FilterState>(() => ({
    search: search.search,
    sort: search.sort,
    quotaType: search.quotaType,
    endpointType: search.endpointType,
    tokenUnit: search.tokenUnit,
    view: search.view,
    rechargePrice: search.rechargePrice,
    priceMode: search.priceMode,
  }))

  const searchInput = filterState.search || ''
  const debouncedSearchInput = useDebounce(searchInput, 200)
  const sortBy = filterState.sort || DEFAULT_CATALOG_SORT
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
    () =>
      getCatalogFacets(vendorModels, usableGroups, {
        groupRatio,
        vendors,
        filterOrder,
      }).groups,
    [vendorModels, usableGroups, groupRatio, vendors, filterOrder]
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
  const tokenUnit: TokenUnit = DEFAULT_TOKEN_UNIT
  const viewMode = normalizeViewMode(filterState.view)
  const priceMode: PriceMode =
    filterState.priceMode === PRICE_MODES.OFFICIAL
      ? PRICE_MODES.OFFICIAL
      : PRICE_MODES.YOURS
  const showRechargePrice = priceMode === PRICE_MODES.YOURS

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
      updateFilters({ sort: v === DEFAULT_CATALOG_SORT ? undefined : v }),
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
    (v: boolean) =>
      updateFilters({
        priceMode: v ? undefined : PRICE_MODES.OFFICIAL,
        rechargePrice: undefined,
      }),
    [updateFilters]
  )
  const setPriceMode = useCallback(
    (mode: PriceMode) =>
      updateFilters({
        priceMode: mode === PRICE_MODES.YOURS ? undefined : mode,
        rechargePrice: undefined,
      }),
    [updateFilters]
  )

  const filteredModels = useMemo(() => {
    if (!models || models.length === 0) return []

    return filterAndSortModels(models, {
      search: debouncedSearchInput,
      vendor: selectedVendors,
      group: groupFilter,
      quotaType: quotaTypeFilter,
      endpointType: endpointTypeFilter,
      tag: FILTER_ALL,
      sortBy,
      priceMode,
    })
  }, [
    models,
    debouncedSearchInput,
    selectedVendors,
    groupFilter,
    quotaTypeFilter,
    endpointTypeFilter,
    sortBy,
    priceMode,
  ])

  const hasActiveFilters = useMemo(
    () =>
      selectedVendors.length > 0 ||
      groupFilter !== FILTER_ALL ||
      quotaTypeFilter !== QUOTA_TYPES.ALL ||
      endpointTypeFilter !== ENDPOINT_TYPES.ALL,
    [selectedVendors.length, groupFilter, quotaTypeFilter, endpointTypeFilter]
  )

  const activeFilterCount = useMemo(
    () =>
      selectedVendors.length +
      (groupFilter !== FILTER_ALL ? 1 : 0) +
      (quotaTypeFilter !== QUOTA_TYPES.ALL ? 1 : 0) +
      (endpointTypeFilter !== ENDPOINT_TYPES.ALL ? 1 : 0),
    [selectedVendors.length, groupFilter, quotaTypeFilter, endpointTypeFilter]
  )

  const clearFilters = useCallback(() => {
    updateFilters({
      quotaType: undefined,
      endpointType: undefined,
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
    tokenUnit,
    viewMode,
    showRechargePrice,
    priceMode,
    setSearchInput,
    setSortBy,
    toggleVendor,
    setGroupFilter,
    setQuotaTypeFilter,
    setEndpointTypeFilter,
    setTokenUnit,
    setViewMode,
    setShowRechargePrice,
    setPriceMode,
    filteredModels,
    hasActiveFilters,
    activeFilterCount,
    clearFilters,
    clearSearch,
  }
}
