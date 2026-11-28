import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { handleServerError } from '@/lib/handle-server-error'
import type { ModelCapabilityCategory } from '@/lib/model-task-capabilities'
import { requireServerSuccess } from '@/lib/server-error-message'

import { batchUpdateModels, getVendors } from '../../api'
import {
  normalizeEndpointKeyList,
  validateBatchEndpointsInput,
  vendorsQueryKeys,
  type EndpointsActionMode,
} from '../../lib'
import type { BatchUpdateModelsRequest, Model } from '../../types'
import { invalidateVendorData } from '../../vendor-api'
import { BatchEndpointsSection } from '../batch-endpoints-section'
import { ModelTaskCapabilityField } from '../model-task-capability-field'

const UNCHANGED = '__unchanged__'

type TagsActionMode = 'unchanged' | 'append' | 'replace' | 'clear'
type CapabilityActionMode = 'unchanged' | 'set' | 'auto'

export function ModelBatchManageDialog(props: {
  models: Model[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [vendorValue, setVendorValue] = useState<string>(UNCHANGED)
  const [statusValue, setStatusValue] = useState<string>(UNCHANGED)
  const [syncValue, setSyncValue] = useState<string>(UNCHANGED)
  const [tagsMode, setTagsMode] = useState<TagsActionMode>('unchanged')
  const [tagsInput, setTagsInput] = useState('')
  const [capabilityMode, setCapabilityMode] =
    useState<CapabilityActionMode>('unchanged')
  const [capabilityLabels, setCapabilityLabels] = useState<
    ModelCapabilityCategory[]
  >([])
  const [endpointsMode, setEndpointsMode] =
    useState<EndpointsActionMode>('unchanged')
  const [endpointsValue, setEndpointsValue] = useState('')
  const [removeEndpointKeys, setRemoveEndpointKeys] = useState<string[]>([])

  const vendorsQuery = useQuery({
    queryKey: vendorsQueryKeys.list(),
    queryFn: async () =>
      requireServerSuccess(await getVendors({ page_size: 1000 })),
    enabled: props.open,
  })
  const vendors = useMemo(
    () => vendorsQuery.data?.data?.items ?? [],
    [vendorsQuery.data?.data?.items]
  )

  const modelIds = useMemo(
    () => props.models.filter((item) => item.id > 0).map((item) => item.id),
    [props.models]
  )
  const channelModels = useMemo(
    () =>
      props.models
        .filter((item) => item.id <= 0)
        .map((item) => item.model_name),
    [props.models]
  )

  const endpointsValidation = useMemo(
    () =>
      validateBatchEndpointsInput(
        endpointsMode,
        endpointsValue,
        removeEndpointKeys
      ),
    [endpointsMode, endpointsValue, removeEndpointKeys]
  )
  const hasFieldChange =
    vendorValue !== UNCHANGED ||
    statusValue !== UNCHANGED ||
    syncValue !== UNCHANGED ||
    tagsMode !== 'unchanged' ||
    capabilityMode !== 'unchanged' ||
    endpointsMode !== 'unchanged'
  const canSubmit =
    (hasFieldChange || channelModels.length > 0) && endpointsValidation.valid

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: BatchUpdateModelsRequest = {
        model_ids: modelIds,
        channel_models: channelModels,
      }
      if (vendorValue !== UNCHANGED) {
        payload.vendor_id = Number(vendorValue)
      }
      if (statusValue !== UNCHANGED) {
        payload.status = Number(statusValue)
      }
      if (syncValue !== UNCHANGED) {
        payload.sync_official = Number(syncValue)
      }
      if (tagsMode !== 'unchanged') {
        payload.tags_mode = tagsMode
        if (tagsMode !== 'clear') {
          payload.tags = tagsInput.trim()
        }
      }
      if (capabilityMode === 'set') {
        payload.capability_labels_mode = 'set'
        payload.capability_labels = capabilityLabels
      } else if (capabilityMode === 'auto') {
        payload.capability_labels_mode = 'auto'
      }
      if (endpointsMode !== 'unchanged') {
        payload.endpoints_mode = endpointsMode
        if (endpointsMode === 'append' || endpointsMode === 'replace') {
          payload.endpoints = endpointsValue.trim()
        } else if (endpointsMode === 'remove') {
          payload.endpoint_keys = normalizeEndpointKeyList(removeEndpointKeys)
        }
      }
      return requireServerSuccess(await batchUpdateModels(payload))
    },
    onSuccess: async (res) => {
      const updated = res.data?.updated_count ?? 0
      const created = res.data?.created_count ?? 0
      if (created > 0 && updated > 0) {
        toast.success(
          t('Updated {{updated}} models and created metadata for {{created}}', {
            updated,
            created,
          })
        )
      } else if (created > 0) {
        toast.success(
          t('Created metadata for {{count}} models', { count: created })
        )
      } else {
        toast.success(t('Updated {{count}} models', { count: updated }))
      }
      await invalidateVendorData(queryClient)
      props.onOpenChange(false)
      props.onSuccess()
    },
    onError: (error) => {
      handleServerError(error, t('Failed to batch update models'))
    },
  })

  const vendorOptions = [
    { value: UNCHANGED, label: t('Keep unchanged') },
    { value: '0', label: t('Clear vendor') },
    ...vendors.map((vendor) => ({
      value: String(vendor.id),
      label: vendor.name,
    })),
  ]
  const statusOptions = [
    { value: UNCHANGED, label: t('Keep unchanged') },
    { value: '1', label: t('Allowed') },
    { value: '0', label: t('Not listed') },
  ]
  const syncOptions = [
    { value: UNCHANGED, label: t('Keep unchanged') },
    { value: '1', label: t('Allow updates') },
    { value: '0', label: t('Keep local') },
  ]
  const tagsModeOptions: Array<{ value: TagsActionMode; label: string }> = [
    { value: 'unchanged', label: t('Keep unchanged') },
    { value: 'append', label: t('Append tags') },
    { value: 'replace', label: t('Replace tags') },
    { value: 'clear', label: t('Clear custom tags') },
  ]
  const capabilityModeOptions: Array<{
    value: CapabilityActionMode
    label: string
  }> = [
    { value: 'unchanged', label: t('Keep unchanged') },
    { value: 'set', label: t('Set capability labels') },
    { value: 'auto', label: t('Restore automatic labels') },
  ]

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!mutation.isPending) props.onOpenChange(open)
      }}
      title={t('Batch manage models')}
      description={t(
        'Apply settings to {{count}} selected models at once. Fields left unchanged keep each model’s existing value.',
        { count: props.models.length }
      )}
      contentClassName='sm:max-w-3xl'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            disabled={mutation.isPending}
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t('Saving...') : t('Apply to selected')}
          </Button>
        </>
      }
    >
      <div className='space-y-4'>
        {channelModels.length > 0 && (
          <Alert>
            <AlertDescription className='text-xs'>
              {t(
                '{{count}} selected channel models do not have metadata yet and will be initialized automatically.',
                { count: channelModels.length }
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className='grid gap-4 sm:grid-cols-3'>
          <Field>
            <FieldLabel>{t('Vendor')}</FieldLabel>
            <Select
              value={vendorValue}
              onValueChange={(value) => setVendorValue(value ?? UNCHANGED)}
              items={vendorOptions}
            >
              <SelectTrigger aria-label={t('Vendor')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vendorOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>{t('Display policy')}</FieldLabel>
            <Select
              value={statusValue}
              onValueChange={(value) => setStatusValue(value ?? UNCHANGED)}
              items={statusOptions}
            >
              <SelectTrigger aria-label={t('Display policy')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>{t('Sync policy')}</FieldLabel>
            <Select
              value={syncValue}
              onValueChange={(value) => setSyncValue(value ?? UNCHANGED)}
              items={syncOptions}
            >
              <SelectTrigger aria-label={t('Sync policy')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {syncOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className='grid gap-4 sm:grid-cols-2'>
          <Field>
            <FieldLabel>{t('Tags')}</FieldLabel>
            <Select
              value={tagsMode}
              onValueChange={(value) =>
                setTagsMode((value as TagsActionMode) ?? 'unchanged')
              }
              items={tagsModeOptions}
            >
              <SelectTrigger aria-label={t('Tags')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tagsModeOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {(tagsMode === 'append' || tagsMode === 'replace') && (
            <Field>
              <FieldLabel>{t('Tag values')}</FieldLabel>
              <Input
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder={t('Comma-separated tags, e.g. fast, vision')}
              />
              <FieldDescription>
                {t('Capability labels are managed separately below.')}
              </FieldDescription>
            </Field>
          )}
        </div>

        <div className='space-y-3 rounded-lg border p-3'>
          <Field>
            <FieldLabel>{t('Capability labels')}</FieldLabel>
            <Select
              value={capabilityMode}
              onValueChange={(value) =>
                setCapabilityMode(
                  (value as CapabilityActionMode) ?? 'unchanged'
                )
              }
              items={capabilityModeOptions}
            >
              <SelectTrigger aria-label={t('Capability labels')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {capabilityModeOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {capabilityMode === 'set' && (
            <ModelTaskCapabilityField
              value={capabilityLabels}
              onChange={(next) => {
                if (next === undefined) {
                  setCapabilityMode('auto')
                  setCapabilityLabels([])
                } else {
                  setCapabilityLabels(next)
                }
              }}
            />
          )}
        </div>

        <div className='space-y-3 rounded-lg border p-3'>
          <BatchEndpointsSection
            models={props.models}
            mode={endpointsMode}
            onModeChange={setEndpointsMode}
            endpointsValue={endpointsValue}
            onEndpointsValueChange={setEndpointsValue}
            removeKeys={removeEndpointKeys}
            onRemoveKeysChange={setRemoveEndpointKeys}
            allowUnchanged
            disabled={mutation.isPending}
            open={props.open}
          />
        </div>
      </div>
    </Dialog>
  )
}
