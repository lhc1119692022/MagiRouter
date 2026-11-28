import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MultiSelect, type Option } from '@/components/multi-select'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getPrefillGroups } from '../api'
import { ENDPOINT_TEMPLATES } from '../constants'
import {
  prefillGroupsQueryKeys,
  summarizeSelectedModelEndpoints,
  validateBatchEndpointsInput,
  type EndpointsActionMode,
} from '../lib'
import type { Model } from '../types'
import { ModelEndpointsEditor } from './model-endpoints-editor'
import {
  parseEndpointKeys,
  serializeEndpointItems,
} from './prefill-group-shared'

const PRESET_EMPTY = '__none__'

interface BatchEndpointsSectionProps {
  models: Model[]
  mode: EndpointsActionMode
  onModeChange: (mode: EndpointsActionMode) => void
  endpointsValue: string
  onEndpointsValueChange: (value: string) => void
  removeKeys: string[]
  onRemoveKeysChange: (keys: string[]) => void
  allowUnchanged?: boolean
  disabled?: boolean
  open?: boolean
}

export function BatchEndpointsSection({
  models,
  mode,
  onModeChange,
  endpointsValue,
  onEndpointsValueChange,
  removeKeys,
  onRemoveKeysChange,
  allowUnchanged = false,
  disabled = false,
  open = true,
}: BatchEndpointsSectionProps) {
  const { t } = useTranslation()
  const [selectedPreset, setSelectedPreset] = useState<string>(PRESET_EMPTY)

  const needsEditor = mode === 'append' || mode === 'replace'
  const endpointGroupsQuery = useQuery({
    queryKey: prefillGroupsQueryKeys.list('endpoint'),
    queryFn: async () =>
      requireServerSuccess(await getPrefillGroups('endpoint')),
    enabled: open && needsEditor,
  })

  const endpointGroups = useMemo(
    () =>
      (endpointGroupsQuery.data?.data ?? []).filter(
        (group) =>
          group.type === 'endpoint' &&
          serializeEndpointItems(group.items).trim()
      ),
    [endpointGroupsQuery.data?.data]
  )

  const summary = useMemo(
    () => summarizeSelectedModelEndpoints(models),
    [models]
  )

  const validation = useMemo(
    () => validateBatchEndpointsInput(mode, endpointsValue, removeKeys),
    [mode, endpointsValue, removeKeys]
  )

  const modeOptions = useMemo(() => {
    const options: Array<{ value: EndpointsActionMode; label: string }> = []
    if (allowUnchanged) {
      options.push({ value: 'unchanged', label: t('Keep unchanged') })
    }
    options.push(
      { value: 'append', label: t('Append / merge endpoints') },
      { value: 'replace', label: t('Replace endpoints') },
      { value: 'remove', label: t('Remove endpoints') },
      { value: 'clear', label: t('Clear custom endpoints') }
    )
    return options
  }, [allowUnchanged, t])

  const presetPayloadMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const group of endpointGroups) {
      map.set(`group:${group.id}`, serializeEndpointItems(group.items))
    }
    for (const model of summary.modelsWithEndpoints) {
      const key =
        model.id > 0 ? `model:${model.id}` : `model:${model.model_name}`
      if (model.endpoints) {
        map.set(key, model.endpoints)
      }
    }
    return map
  }, [endpointGroups, summary.modelsWithEndpoints])

  const presetOptions = useMemo(() => {
    const items: Array<{ value: string; label: string }> = [
      {
        value: PRESET_EMPTY,
        label: t('Choose a prefill group or selected model...'),
      },
    ]
    for (const group of endpointGroups) {
      const keyCount = parseEndpointKeys(group.items).length
      items.push({
        value: `group:${group.id}`,
        label: t('Prefill group: {{name}} ({{count}})', {
          name: group.name,
          count: keyCount,
        }),
      })
    }
    for (const model of summary.modelsWithEndpoints) {
      const key =
        model.id > 0 ? `model:${model.id}` : `model:${model.model_name}`
      items.push({
        value: key,
        label: t('Copy from model: {{name}}', { name: model.model_name }),
      })
    }
    return items
  }, [endpointGroups, summary.modelsWithEndpoints, t])

  const removeOptions = useMemo<Option[]>(() => {
    const seen = new Set<string>()
    const options: Option[] = []
    for (const item of summary.endpointCounts) {
      seen.add(item.key)
      const template = ENDPOINT_TEMPLATES[item.key]
      const countText = t('{{count}} selected model(s)', { count: item.count })
      options.push({
        value: item.key,
        label: item.key,
        hint: template ? `${countText} · ${template.path}` : countText,
      })
    }
    for (const [key, config] of Object.entries(ENDPOINT_TEMPLATES)) {
      if (seen.has(key)) continue
      options.push({
        value: key,
        label: key,
        hint: `${config.method} ${config.path}`,
      })
    }
    return options
  }, [summary.endpointCounts, t])

  const modeDescription = useMemo(() => {
    switch (mode) {
      case 'append':
        return t(
          'Adds these endpoints to each selected model and updates matching endpoint types while keeping other configured endpoints.'
        )
      case 'replace':
        return t(
          'Overwrites custom endpoints on all selected models with the configuration below.'
        )
      case 'remove':
        return t(
          'Removes the selected endpoint types from each model while keeping all other configured endpoints.'
        )
      case 'clear':
        return t(
          'Clears custom endpoint configurations on all selected models so they fall back to channel defaults.'
        )
      default:
        return undefined
    }
  }, [mode, t])

  const handlePresetChange = (value: string | null) => {
    const nextValue = value ?? PRESET_EMPTY
    setSelectedPreset(nextValue)
    if (nextValue === PRESET_EMPTY) return
    const nextEndpoints = presetPayloadMap.get(nextValue)
    if (nextEndpoints) {
      onEndpointsValueChange(nextEndpoints)
    }
  }

  const handleEndpointsChange = (nextValue: string) => {
    if (selectedPreset !== PRESET_EMPTY) {
      setSelectedPreset(PRESET_EMPTY)
    }
    onEndpointsValueChange(nextValue)
  }

  return (
    <div className='space-y-3'>
      <Field>
        <FieldLabel>{t('Endpoints')}</FieldLabel>
        <Select
          value={mode}
          onValueChange={(value) =>
            onModeChange(
              (value as EndpointsActionMode) ??
                (allowUnchanged ? 'unchanged' : 'append')
            )
          }
          items={modeOptions}
          disabled={disabled}
        >
          <SelectTrigger aria-label={t('Endpoints')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modeOptions.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {modeDescription && (
          <FieldDescription>{modeDescription}</FieldDescription>
        )}
      </Field>

      {mode !== 'unchanged' && summary.configuredModelCount > 0 && (
        <div className='bg-muted/40 flex flex-wrap items-center gap-1.5 rounded-md border px-3 py-2 text-xs'>
          <span className='text-muted-foreground'>
            {t(
              '{{configured}} of {{total}} selected models currently have custom endpoints:',
              {
                configured: summary.configuredModelCount,
                total: models.length,
              }
            )}
          </span>
          {summary.endpointCounts.slice(0, 6).map((item) => (
            <StatusBadge
              key={item.key}
              label={`${item.key} (${item.count})`}
              variant='neutral'
              size='sm'
              copyable={false}
            />
          ))}
          {summary.endpointCounts.length > 6 && (
            <span className='text-muted-foreground'>
              +{summary.endpointCounts.length - 6}
            </span>
          )}
        </div>
      )}

      {needsEditor && presetOptions.length > 1 && (
        <Field>
          <FieldLabel>{t('Load endpoint preset')}</FieldLabel>
          <Select
            value={selectedPreset}
            onValueChange={handlePresetChange}
            items={presetOptions}
            disabled={disabled}
          >
            <SelectTrigger aria-label={t('Load endpoint preset')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {presetOptions.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {needsEditor && (
        <div className='space-y-2'>
          <ModelEndpointsEditor
            value={endpointsValue}
            onChange={handleEndpointsChange}
            disabled={disabled}
            ariaLabel={t('Endpoint Configuration')}
          />
          {!validation.valid &&
            validation.reason === 'invalid' &&
            validation.messageKey && (
              <p role='alert' className='text-destructive text-xs'>
                {t(validation.messageKey)}
              </p>
            )}
        </div>
      )}

      {mode === 'remove' && (
        <Field>
          <FieldLabel>{t('Endpoints to remove')}</FieldLabel>
          <MultiSelect
            options={removeOptions}
            selected={removeKeys}
            onChange={onRemoveKeysChange}
            allowCreate
            placeholder={t('Select or type endpoint types to remove...')}
            emptyText={t('No matching endpoints')}
            disabled={disabled}
          />
          <FieldDescription>
            {t('Models that do not contain these endpoints remain unchanged.')}
          </FieldDescription>
        </Field>
      )}

      {mode === 'clear' && (
        <Alert>
          <AlertDescription className='text-xs'>
            {summary.configuredModelCount > 0
              ? t(
                  'Custom endpoints will be cleared for {{count}} selected models ({{configured}} currently have custom endpoints).',
                  {
                    count: models.length,
                    configured: summary.configuredModelCount,
                  }
                )
              : t(
                  'None of the {{count}} selected models currently have custom endpoints configured.',
                  { count: models.length }
                )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
