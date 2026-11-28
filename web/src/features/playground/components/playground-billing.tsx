import { Link, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useId, type ReactNode, type Ref } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PricingModel } from '@/features/pricing/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import type { useBillingKeys } from '../hooks/use-billing-keys'
import type { PlaygroundSearch } from '../lib/workspace-search'
import type { ModelOption } from '../types'

const CLEAR_KEY_VALUE = '__clear__'
const CREATE_KEY_VALUE = '__create__'

export function PlaygroundBilling(props: {
  layout: 'chat' | 'media'
  selection: number | null
  onSelect: (id: number | null) => void
  keys: ReturnType<typeof useBillingKeys>
  disabled: boolean
  group: string
  models: ModelOption[]
  model?: PricingModel
  modelId: string
  editingPreset: boolean
  pendingModel?: string
  returnSearch: PlaygroundSearch
  onSelectModel: (model: string) => void
  loadingModels: boolean
  modelsError: unknown
  retryModels: () => void
  onDetails: () => void
  keyTriggerRef?: Ref<HTMLButtonElement>
  keyPickerOpen?: boolean
  onKeyPickerOpenChange?: (open: boolean) => void
  onCreateKey?: () => void
  actions?: ReactNode
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const keyField = useId()
  const modelField = useId()
  const userGroup = useAuthStore((state) => state.auth.user?.group || '')
  const keyOptions = props.keys.eligible.map((key) => ({
    value: String(key.id),
    name: key.name || `#${key.id}`,
    group:
      key.id === props.selection && props.group
        ? props.group
        : key.group || userGroup,
  }))
  const selectedKeyOption =
    props.selection !== null
      ? keyOptions.find((option) => option.value === String(props.selection))
      : undefined
  const missing = props.selection !== null && !selectedKeyOption
  const noKeys =
    props.keys.eligible.length === 0 && !props.keys.loading && !props.keys.error
  let modelPlaceholder = t('Select model')
  if (!props.editingPreset && (props.selection === null || missing)) {
    modelPlaceholder = t('Select an API key first')
  } else if (props.loadingModels) {
    modelPlaceholder = t('Loading')
  } else if (props.group && !props.models.length) {
    modelPlaceholder = t('No models available')
  }

  const renderKeyOption = (option: { name: string; group: string }) => (
    <span className='pg-key-option'>
      <span className='pg-key-option-name'>{option.name}</span>
      {option.group && (
        <span className='pg-key-option-group'>{option.group}</span>
      )}
    </span>
  )

  const keyPlaceholder = missing
    ? t('Selected key is unavailable')
    : t('Select an API key')

  const handleCreateKey = () => {
    props.onKeyPickerOpenChange?.(false)
    if (props.onCreateKey) {
      props.onCreateKey()
      return
    }
    void navigate({
      to: '/keys',
      search: { action: 'create', playground: props.returnSearch },
    })
  }

  const renderKeyPicker = (isChat: boolean) =>
    noKeys ? (
      <Link
        to='/keys'
        search={{ action: 'create', playground: props.returnSearch }}
        className={cn(
          'el-btn el-btn-xs pg-billing-create',
          isChat
            ? 'el-btn-white pg-topbar-btn'
            : 'el-btn-primary pg-media-create-link'
        )}
      >
        <Plus className='size-3.5 shrink-0' aria-hidden='true' />
        <span>{t('Create an API key')}</span>
      </Link>
    ) : (
      <Select
        value={
          missing || props.selection === null ? null : String(props.selection)
        }
        open={props.keyPickerOpen}
        onOpenChange={(nextOpen) => props.onKeyPickerOpenChange?.(nextOpen)}
        disabled={props.disabled || !props.keys.eligible.length}
        onValueChange={(value) => {
          if (value === CREATE_KEY_VALUE) {
            handleCreateKey()
            return
          }
          if (!value || value === CLEAR_KEY_VALUE) {
            props.onSelect(null)
            return
          }
          props.onSelect(Number(value))
        }}
      >
        <SelectTrigger
          ref={props.keyTriggerRef}
          id={keyField}
          aria-label={t('API Key')}
          className={
            isChat
              ? 'pg-topbar-select rounded-full border-0 bg-[var(--bg-elevated)] py-0 data-[size=default]:h-[30px] dark:bg-[#1c1917] dark:hover:bg-[#24201d]'
              : 'pg-media-select rounded-full border-0 bg-[var(--bg-elevated)] py-0 data-[size=default]:h-8 dark:bg-[#1c1917] dark:hover:bg-[#24201d]'
          }
        >
          <SelectValue>
            {selectedKeyOption
              ? renderKeyOption(selectedKeyOption)
              : keyPlaceholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align='start'
          alignItemWithTrigger={false}
          className='pg-key-select-content'
        >
          {keyOptions.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              aria-label={option.name}
            >
              {renderKeyOption(option)}
            </SelectItem>
          ))}
          <SelectSeparator className='pg-key-option-separator' />
          {props.selection !== null && (
            <SelectItem value={CLEAR_KEY_VALUE} className='pg-key-option-clear'>
              {t('Clear selection')}
            </SelectItem>
          )}
          <SelectItem
            value={CREATE_KEY_VALUE}
            aria-label={t('Create an API key')}
            className='pg-key-option-create'
          >
            <span className='pg-key-option-create-inner'>
              <Plus className='size-3.5 shrink-0' aria-hidden='true' />
              <span>{t('Create an API key')}</span>
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    )

  const renderModelPicker = (isChat: boolean) => (
    <Combobox
      id={modelField}
      className={isChat ? 'pg-topbar-combobox' : 'pg-media-combobox'}
      aria-label={props.editingPreset ? t('Preset model') : t('Select model')}
      value={props.modelId || null}
      options={props.models}
      placeholder={props.pendingModel || modelPlaceholder}
      disabled={props.disabled || !props.models.length || props.loadingModels}
      onValueChange={(value) => {
        if (value) props.onSelectModel(value)
      }}
    />
  )

  if (props.layout === 'chat') {
    return (
      <section className='pg-billing pg-billing-chat' aria-label={t('Billing')}>
        <div className='pg-chat-bar-left'>
          <div className='pg-chat-field-inline'>
            <span className='pg-chat-field-label'>{t('API Key')}</span>
            {renderKeyPicker(true)}
          </div>
          <div className='pg-chat-field-inline'>
            <label htmlFor={modelField} className='pg-chat-field-label'>
              {props.editingPreset ? t('Preset model') : t('Model')}
            </label>
            {renderModelPicker(true)}
          </div>
          {props.model && (
            <Button
              type='button'
              variant='outline'
              size='xs'
              className='pg-topbar-btn'
              aria-haspopup='dialog'
              onClick={props.onDetails}
            >
              {t('Details')}
            </Button>
          )}
        </div>
        {props.actions && (
          <div className='pg-chat-bar-right'>{props.actions}</div>
        )}
        {props.editingPreset && !!props.modelsError && (
          <Button
            type='button'
            variant='ghost'
            size='xs'
            className='pg-topbar-btn'
            onClick={props.retryModels}
          >
            {t('Failed to load models')} · {t('Retry')}
          </Button>
        )}
      </section>
    )
  }

  return (
    <section className='pg-billing pg-billing-media' aria-label={t('Billing')}>
      <div className='pg-api-bar'>
        <div className='pg-api-row'>
          <span className='pg-api-row-label'>{t('API Key')}</span>
          <div className='pg-api-row-control'>{renderKeyPicker(false)}</div>
        </div>
        <div className='pg-api-row'>
          <label htmlFor={modelField} className='pg-api-row-label'>
            {props.editingPreset ? t('Preset model') : t('Model')}
          </label>
          <div className='pg-api-row-control'>
            {renderModelPicker(false)}
            {props.model && (
              <Button
                type='button'
                variant='outline'
                size='xs'
                className='pg-media-detail-btn'
                aria-haspopup='dialog'
                onClick={props.onDetails}
              >
                {t('Details')}
              </Button>
            )}
          </div>
        </div>
      </div>
      {props.keys.loading && (
        <span role='status' className='pg-billing-status'>
          {t('Loading')}
        </span>
      )}
      {props.keys.error && (
        <Button
          type='button'
          variant='ghost'
          size='xs'
          onClick={() => void props.keys.retry()}
        >
          {t('Failed to load API keys')} · {t('Retry')}
        </Button>
      )}
      {!!props.modelsError && (
        <Button
          type='button'
          variant='ghost'
          size='xs'
          onClick={props.retryModels}
        >
          {t('Failed to load models')} · {t('Retry')}
        </Button>
      )}
      {missing && (
        <p role='status' className='pg-billing-status'>
          {t('Selected key is unavailable')}
        </p>
      )}
    </section>
  )
}

export function PlaygroundKeyGuide(props: { hasKeys: boolean }) {
  const { t } = useTranslation()
  return (
    <p
      className={cn(
        'pg-media-key-guide',
        !props.hasKeys && 'pg-media-key-guide-empty'
      )}
      role='status'
    >
      {props.hasKeys
        ? t('Select an API key')
        : t(
            'Create an API key above to see its group, available models, and pricing.'
          )}
    </p>
  )
}
