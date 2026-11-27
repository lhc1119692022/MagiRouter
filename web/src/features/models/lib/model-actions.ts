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
import type { QueryClient } from '@tanstack/react-query'
import i18next from 'i18next'
import { toast } from 'sonner'

import { handleServerError } from '@/lib/handle-server-error'

import { batchUpdateModels, updateModelStatus } from '../api'
import type { Model } from '../types'
import { invalidateVendorData } from '../vendor-api'

// ============================================================================
// Model Status Actions
// ============================================================================

/**
 * Enable a model
 */
export async function handleEnableModel(
  id: number,
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  try {
    const response = await updateModelStatus(id, 1)
    if (response.success) {
      toast.success(i18next.t('Model shown in model square'))
      if (queryClient) await invalidateVendorData(queryClient)
      onSuccess?.()
    } else {
      handleServerError(
        response,
        i18next.t('Failed to show model in model square')
      )
    }
  } catch (error: unknown) {
    handleServerError(error, i18next.t('Failed to show model in model square'))
  }
}

/**
 * Disable a model
 */
export async function handleDisableModel(
  id: number,
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  try {
    const response = await updateModelStatus(id, 0)
    if (response.success) {
      toast.success(i18next.t('Model hidden from model square'))
      if (queryClient) await invalidateVendorData(queryClient)
      onSuccess?.()
    } else {
      handleServerError(
        response,
        i18next.t('Failed to hide model from model square')
      )
    }
  } catch (error: unknown) {
    handleServerError(
      error,
      i18next.t('Failed to hide model from model square')
    )
  }
}

/**
 * Toggle model status
 */
export async function handleToggleModelStatus(
  id: number,
  currentStatus: number,
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  if (currentStatus === 1) {
    await handleDisableModel(id, queryClient, onSuccess)
  } else {
    await handleEnableModel(id, queryClient, onSuccess)
  }
}

// ============================================================================
// Batch Status Actions
// ============================================================================

/**
 * Batch enable models
 */
export async function handleBatchEnableModels(
  ids: number[],
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  if (ids.length === 0) {
    toast.error(i18next.t('Please select at least one model'))
    return
  }

  try {
    const enablePromises = ids.map((id) => updateModelStatus(id, 1))
    const results = await Promise.all(enablePromises)

    let successCount = 0
    let failedCount = 0

    results.forEach((res) => {
      if (res.success) {
        successCount++
      } else {
        failedCount++
      }
    })

    if (successCount > 0) {
      toast.success(
        i18next.t('Shown {{count}} models in model square', {
          count: successCount,
        })
      )
      if (queryClient) await invalidateVendorData(queryClient)
      onSuccess?.()
    }

    if (failedCount > 0) {
      toast.error(
        i18next.t('Failed to enable {{count}} model(s)', { count: failedCount })
      )
    }
  } catch (error: unknown) {
    handleServerError(error, i18next.t('Batch enable failed'))
  }
}

/**
 * Batch disable models
 */
export async function handleBatchDisableModels(
  ids: number[],
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  if (ids.length === 0) {
    toast.error(i18next.t('Please select at least one model'))
    return
  }

  try {
    const disablePromises = ids.map((id) => updateModelStatus(id, 0))
    const results = await Promise.all(disablePromises)

    let successCount = 0
    let failedCount = 0

    results.forEach((res) => {
      if (res.success) {
        successCount++
      } else {
        failedCount++
      }
    })

    if (successCount > 0) {
      toast.success(
        i18next.t('Hidden {{count}} models from model square', {
          count: successCount,
        })
      )
      if (queryClient) await invalidateVendorData(queryClient)
      onSuccess?.()
    }

    if (failedCount > 0) {
      toast.error(
        i18next.t('Failed to disable {{count}} model(s)', {
          count: failedCount,
        })
      )
    }
  } catch (error: unknown) {
    handleServerError(error, i18next.t('Batch disable failed'))
  }
}

export async function handleBatchSetModelVisibility(
  models: Model[],
  status: 0 | 1,
  queryClient?: QueryClient,
  onSuccess?: () => void
): Promise<void> {
  const modelIds = models
    .filter((model) => model.id > 0)
    .map((model) => model.id)
  const channelModels = models
    .filter((model) => model.id <= 0)
    .map((model) => model.model_name)

  if (modelIds.length === 0 && channelModels.length === 0) {
    toast.error(i18next.t('Please select at least one model'))
    return
  }

  try {
    const response = await batchUpdateModels({
      model_ids: modelIds,
      channel_models: channelModels,
      status,
    })
    if (response.success) {
      const total =
        (response.data?.updated_count ?? 0) +
        (response.data?.created_count ?? 0)
      toast.success(
        status === 1
          ? i18next.t('Shown {{count}} models in model square', {
              count: total || models.length,
            })
          : i18next.t('Hidden {{count}} models from model square', {
              count: total || models.length,
            })
      )
      if (queryClient) await invalidateVendorData(queryClient)
      onSuccess?.()
    } else {
      handleServerError(
        response,
        status === 1
          ? i18next.t('Batch enable failed')
          : i18next.t('Batch disable failed')
      )
    }
  } catch (error: unknown) {
    handleServerError(
      error,
      status === 1
        ? i18next.t('Batch enable failed')
        : i18next.t('Batch disable failed')
    )
  }
}
