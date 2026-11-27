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
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Calendar, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, type SubmitErrorHandler } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DateTimePicker } from '@/components/datetime-picker'
import { MultiSelect } from '@/components/multi-select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { RelatedPolicyLink } from '@/features/system-settings/request-policies/related-policy-link'
import { useStatus } from '@/hooks/use-status'
import { getUserModels, getUserGroups } from '@/lib/api'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import { handleServerError } from '@/lib/handle-server-error'
import {
  requireServerSuccess,
  translateServerText,
} from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import {
  createApiKey,
  updateApiKey,
  getApiKey,
  getTokenAutoGroups,
} from '../api'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants'

import '../keys-editorial.css'
import {
  getApiKeyFormSchema,
  type ApiKeyFormValues,
  getApiKeyFormDefaultValues,
  transformFormDataToPayload,
  transformApiKeyToFormDefaults,
} from '../lib'
import type { ApiKey } from '../types'
import {
  ApiKeyGroupCombobox,
  type ApiKeyGroupOption,
} from './api-key-group-combobox'
import { useApiKeys } from './api-keys-provider'
import { AutoGroupOrderEditor } from './auto-group-order-editor'

type ApiKeyMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean, createdId?: number) => void
  closeLabel?: string
  singleCreate?: boolean
  currentRow?: ApiKey
}

type ExpirePreset = 'never' | 'month' | 'day' | 'hour' | 'custom'

const QUOTA_PRESET_AMOUNTS = [10, 50, 100, 500] as const

export function ApiKeysMutateDrawer({
  open,
  onOpenChange,
  closeLabel,
  singleCreate,
  currentRow,
}: ApiKeyMutateDrawerProps) {
  const { t } = useTranslation()
  const isUpdate = !!currentRow
  const currentRowId = currentRow?.id
  const { triggerRefresh } = useApiKeys()
  const { status, loading: statusLoading } = useStatus()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [expirePreset, setExpirePreset] = useState<ExpirePreset>('never')
  const [initializedTarget, setInitializedTarget] = useState<string | null>(
    null
  )
  const defaultUseAutoGroup = status?.default_use_auto_group === true

  // Fetch models
  const { data: modelsData } = useQuery({
    queryKey: ['user-models'],
    queryFn: async () => requireServerSuccess(await getUserModels()),
    enabled: open,
    staleTime: 0,
  })

  // Fetch groups
  const {
    data: groupsData,
    isFetched: groupsFetched,
    isFetching: groupsFetching,
  } = useQuery({
    queryKey: ['user-groups'],
    queryFn: async () => requireServerSuccess(await getUserGroups()),
    enabled: open,
    staleTime: 0,
  })

  const {
    data: apiKeyData,
    isFetched: apiKeyFetched,
    isFetching: apiKeyFetching,
  } = useQuery({
    queryKey: ['api-key', currentRowId],
    queryFn: async () =>
      requireServerSuccess(await getApiKey(currentRowId ?? 0)),
    enabled: open && isUpdate && currentRowId !== undefined,
    staleTime: 0,
  })

  const {
    data: autoGroupsData,
    isFetched: autoGroupsFetched,
    isFetching: autoGroupsFetching,
  } = useQuery({
    queryKey: ['token-auto-groups'],
    queryFn: async () => requireServerSuccess(await getTokenAutoGroups()),
    enabled: open,
    staleTime: 0,
  })

  const models = modelsData?.data || []
  const requireExplicitGroup = groupsData?.require_explicit_group === true
  const accountUserGroup = groupsData?.user_group || ''
  const currentKeyGroup = isUpdate
    ? (apiKeyData?.data?.group ?? currentRow?.group ?? '')
    : ''
  const groups = useMemo<ApiKeyGroupOption[]>(
    () =>
      Object.entries(groupsData?.data || {})
        .filter(
          ([key, info]) =>
            info.has_models !== false || (isUpdate && key === currentKeyGroup)
        )
        .map(([key, info]) => ({
          value: key,
          label: key,
          desc: info.desc ? translateServerText(t, info.desc) : key,
          ratio: info.ratio,
        })),
    [groupsData, isUpdate, currentKeyGroup, t]
  )
  const backendHasAuto = groups.some((g) => g.value === 'auto')
  const availableAutoGroupNames = useMemo(
    () => groups.filter((group) => group.value !== 'auto').map((g) => g.value),
    [groups]
  )
  const globalAutoGroups = useMemo(() => {
    const available = new Set(availableAutoGroupNames)
    return (autoGroupsData?.data?.groups || []).filter((group) =>
      available.has(group)
    )
  }, [autoGroupsData, availableAutoGroupNames])
  const globalAutoGroupOptions = useMemo(() => {
    const groupsByValue = new Map(groups.map((group) => [group.value, group]))
    return globalAutoGroups.flatMap((group) => {
      const option = groupsByValue.get(group)
      return option ? [option] : []
    })
  }, [globalAutoGroups, groups])
  const maxAutoGroups =
    Number.isInteger(autoGroupsData?.data?.max_count) &&
    Number(autoGroupsData?.data?.max_count) > 0
      ? Number(autoGroupsData?.data?.max_count)
      : 5
  const schema = useMemo(
    () => getApiKeyFormSchema(t, maxAutoGroups, requireExplicitGroup),
    [t, maxAutoGroups, requireExplicitGroup]
  )

  const form = useForm<ApiKeyFormValues>({
    resolver: zodResolver(schema),
    defaultValues: getApiKeyFormDefaultValues(defaultUseAutoGroup),
  })

  // Load existing data when updating
  useEffect(() => {
    if (!open) {
      form.reset(
        getApiKeyFormDefaultValues(defaultUseAutoGroup && backendHasAuto)
      )
      setInitializedTarget(null)
      setExpirePreset('never')
      setAdvancedOpen(false)
      return
    }
    if (
      !groupsFetched ||
      groupsFetching ||
      !autoGroupsFetched ||
      autoGroupsFetching
    ) {
      return
    }
    if (isUpdate && (!apiKeyFetched || apiKeyFetching)) return
    if (!isUpdate && statusLoading) return

    const target = isUpdate && currentRow ? `update:${currentRow.id}` : 'create'
    if (initializedTarget === target) return
    if (isUpdate && currentRow) {
      if (apiKeyData?.success && apiKeyData.data) {
        const defaults = transformApiKeyToFormDefaults(
          apiKeyData.data,
          availableAutoGroupNames,
          maxAutoGroups
        )
        form.reset(defaults)
        setExpirePreset(defaults.expired_time ? 'custom' : 'never')
        setAdvancedOpen(
          defaults.model_limits.length > 0 || Boolean(defaults.allow_ips?.trim())
        )
        setInitializedTarget(target)
      }
    } else {
      form.reset(
        getApiKeyFormDefaultValues(defaultUseAutoGroup && backendHasAuto)
      )
      setExpirePreset('never')
      setAdvancedOpen(false)
      setInitializedTarget(target)
    }
  }, [
    open,
    isUpdate,
    currentRow,
    form,
    defaultUseAutoGroup,
    statusLoading,
    backendHasAuto,
    groupsFetched,
    groupsFetching,
    autoGroupsFetched,
    autoGroupsFetching,
    apiKeyData,
    apiKeyFetched,
    apiKeyFetching,
    availableAutoGroupNames,
    maxAutoGroups,
    initializedTarget,
  ])

  const formTarget =
    isUpdate && currentRow ? `update:${currentRow.id}` : 'create'
  const isFormInitialized = initializedTarget === formTarget
  const selectedGroup = form.watch('group')

  // Correct group after groups load: if the form value is not in available groups, fall back
  useEffect(() => {
    if (!groupsFetched || groupsFetching) return
    if (groups.length === 0 && !requireExplicitGroup) return
    const currentGroup = selectedGroup
    if (currentGroup && !groups.some((g) => g.value === currentGroup)) {
      let fallback = ''
      if (!requireExplicitGroup) {
        fallback =
          groups.find((g) => g.value === 'default')?.value ??
          groups[0]?.value ??
          ''
      }
      form.setValue('group', fallback)
      if (currentGroup === 'auto') {
        form.setValue('auto_groups', [])
        form.setValue('auto_groups_mode', 'inherit')
        form.setValue('cross_group_retry', false)
      }
    }
  }, [
    groups,
    groupsFetched,
    groupsFetching,
    form,
    selectedGroup,
    requireExplicitGroup,
  ])

  const onSubmit = async (data: ApiKeyFormValues) => {
    setIsSubmitting(true)
    try {
      const basePayload = transformFormDataToPayload(data)

      if (isUpdate && currentRow) {
        const result = await updateApiKey({
          ...basePayload,
          id: currentRow.id,
        })
        if (result.success) {
          toast.success(t(SUCCESS_MESSAGES.API_KEY_UPDATED))
          onOpenChange(false)
          triggerRefresh()
        } else {
          handleServerError(result, t(ERROR_MESSAGES.UPDATE_FAILED))
        }
      } else {
        // Create mode - handle batch creation
        const count = singleCreate ? 1 : data.tokenCount || 1
        let successCount = 0
        let createdId: number | undefined

        for (let i = 0; i < count; i++) {
          const result = await createApiKey({
            ...basePayload,
            name:
              i === 0 && data.name
                ? data.name
                : `${data.name || 'default'}-${Math.random().toString(36).slice(2, 8)}`,
          })
          if (result.success) {
            successCount++
            if (singleCreate) createdId = result.data?.id
          } else {
            handleServerError(result, t(ERROR_MESSAGES.CREATE_FAILED))
            break
          }
        }

        if (successCount > 0) {
          toast.success(
            t('Successfully created {{count}} API Key(s)', {
              count: successCount,
            })
          )
          onOpenChange(false, createdId)
          triggerRefresh()
        }
      }
    } catch (error) {
      handleServerError(error, t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsSubmitting(false)
    }
  }

  const onInvalid: SubmitErrorHandler<ApiKeyFormValues> = () => {
    toast.error(t('Please fix the highlighted fields before saving'))
  }

  const handleSetExpiry = (
    months: number,
    days: number,
    hours: number,
    preset: ExpirePreset
  ) => {
    setExpirePreset(preset)
    if (months === 0 && days === 0 && hours === 0) {
      form.setValue('expired_time', null)
      return
    }

    const now = new Date()
    now.setMonth(now.getMonth() + months)
    now.setDate(now.getDate() + days)
    now.setHours(now.getHours() + hours)

    form.setValue('expired_time', now)
  }

  const { meta: currencyMeta } = getCurrencyDisplay()
  const currencyLabel = getCurrencyLabel()
  const tokensOnly = currencyMeta.kind === 'tokens'
  const quotaLabel = t('Quota ({{currency}})', { currency: currencyLabel })
  const quotaPlaceholder = tokensOnly
    ? t('Enter quota in tokens')
    : t('Enter quota in {{currency}}', { currency: currencyLabel })
  const autoGroupsMode = form.watch('auto_groups_mode')
  const unlimitedQuota = form.watch('unlimited_quota')
  const noBillingGroupsAvailable = requireExplicitGroup && groups.length === 0
  const groupPlaceholder = requireExplicitGroup
    ? t('Select a billing group (required)')
    : t('Select a group')

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!isSubmitting) onOpenChange(next)
      }}
    >
      <SheetContent className='kdrawer-panel'>
        <SheetHeader className='kdrawer-head'>
          <SheetTitle className='kdrawer-title'>
            {isUpdate ? t('Update API Key') : t('Create API Key')}
          </SheetTitle>
          <SheetDescription className='kdrawer-sub'>
            {isUpdate
              ? t('Update the API key by providing necessary info.')
              : t('Add a new API key by providing necessary info.')}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='api-key-form'
            onSubmit={form.handleSubmit(onSubmit, onInvalid)}
            aria-busy={!isFormInitialized}
            inert={!isFormInitialized || isSubmitting ? true : undefined}
            className='kdrawer-form'
          >
            <div className='kform-section'>
              <div className='kform-section-title'>
                {t('Basic Information')}
              </div>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='kform-label'>{t('Name')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className='kform-input'
                        placeholder={t('Enter a name')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='group'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel
                      className='kform-label'
                      required={requireExplicitGroup}
                    >
                      {t('Group')}
                    </FormLabel>
                    <FormControl>
                      <ApiKeyGroupCombobox
                        options={groups}
                        value={field.value}
                        onValueChange={(group) => {
                          field.onChange(group)
                          if (group === 'auto') {
                            form.setValue('cross_group_retry', true, {
                              shouldDirty: true,
                            })
                            return
                          }
                          form.setValue('cross_group_retry', false, {
                            shouldDirty: true,
                          })
                        }}
                        placeholder={groupPlaceholder}
                      />
                    </FormControl>
                    {requireExplicitGroup && (
                      <FormDescription
                        className={
                          noBillingGroupsAvailable
                            ? 'text-destructive text-xs'
                            : 'kform-hint'
                        }
                      >
                        {noBillingGroupsAvailable
                          ? t(
                              'No billing groups are available for your account yet. Contact an administrator to configure billing groups.'
                            )
                          : t(
                              'Your account group ({{group}}) is for user management only. Select a billing group for this API key.',
                              { group: accountUserGroup || 'default' }
                            )}
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedGroup === 'auto' && (
                <FormField
                  control={form.control}
                  name='auto_groups'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className='kform-label'>
                        {t('Auto group order')}
                      </FormLabel>
                      <FormDescription className='kform-hint'>
                        {t(
                          'Choose and order the groups this API key will try.'
                        )}
                      </FormDescription>
                      <FormControl>
                        <AutoGroupOrderEditor
                          value={field.value}
                          mode={autoGroupsMode}
                          options={groups}
                          globalOptions={globalAutoGroupOptions}
                          maxCount={maxAutoGroups}
                          onChange={(value) => {
                            form.setValue('auto_groups_mode', value.mode, {
                              shouldDirty: true,
                              shouldValidate: false,
                            })
                            form.setValue(
                              'auto_groups',
                              value.groups.slice(0, maxAutoGroups),
                              {
                                shouldDirty: true,
                                shouldValidate: true,
                              }
                            )
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {selectedGroup === 'auto' && (
                <FormField
                  control={form.control}
                  name='cross_group_retry'
                  render={({ field }) => (
                    <FormItem className='kform-switch-row'>
                      <div className='kform-switch-text'>
                        <FormLabel className='kform-switch-title'>
                          {t('Cross-group retry')}
                        </FormLabel>
                        <FormDescription className='kform-switch-desc line-clamp-2 sm:line-clamp-none'>
                          {t(
                            'When enabled, if channels in the current group fail, it will try channels in the next group in order.'
                          )}
                          <RelatedPolicyLink section='routing' />
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='expired_time'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='kform-label'>
                      {t('Expiration Time')}
                    </FormLabel>
                    <div className='kform-expire-stack'>
                      <FormControl>
                        <DateTimePicker
                          value={field.value ?? undefined}
                          onChange={(date) => {
                            setExpirePreset(date ? 'custom' : 'never')
                            field.onChange(date ?? null)
                          }}
                          placeholder={t('Never expires')}
                          className='kform-expire-picker min-w-0 [&_input[type=time]]:w-24 sm:[&_input[type=time]]:w-32'
                        />
                      </FormControl>
                      <div className='kform-expire-quick-row'>
                        <button
                          type='button'
                          className={cn(
                            'kform-expire-main-btn',
                            !field.value && 'is-active'
                          )}
                          onClick={() => handleSetExpiry(0, 0, 0, 'never')}
                        >
                          <Calendar className='size-3.5' aria-hidden='true' />
                          {t('Never')}
                        </button>
                        <button
                          type='button'
                          className={cn(
                            'kform-expire-quick-btn',
                            Boolean(field.value) &&
                              expirePreset === 'month' &&
                              'is-active'
                          )}
                          onClick={() => handleSetExpiry(1, 0, 0, 'month')}
                        >
                          {t('1 Month')}
                        </button>
                        <button
                          type='button'
                          className={cn(
                            'kform-expire-quick-btn',
                            Boolean(field.value) &&
                              expirePreset === 'day' &&
                              'is-active'
                          )}
                          onClick={() => handleSetExpiry(0, 1, 0, 'day')}
                        >
                          {t('1 Day')}
                        </button>
                        <button
                          type='button'
                          className={cn(
                            'kform-expire-quick-btn',
                            Boolean(field.value) &&
                              expirePreset === 'hour' &&
                              'is-active'
                          )}
                          onClick={() => handleSetExpiry(0, 0, 1, 'hour')}
                        >
                          {t('1 Hour')}
                        </button>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isUpdate && !singleCreate && (
                <FormField
                  control={form.control}
                  name='tokenCount'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className='kform-label'>
                        {t('Quantity')}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          min='1'
                          className='kform-input tabular-nums'
                          placeholder={t('Number of keys to create')}
                          onChange={(e) =>
                            field.onChange(
                              Number.parseInt(e.target.value, 10) || 1
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription className='kform-hint'>
                        {t(
                          'Create multiple API keys at once (random suffix will be added to names)'
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className='kform-section'>
              <div className='kform-section-title'>{t('Quota Settings')}</div>
              <FormField
                control={form.control}
                name='unlimited_quota'
                render={({ field }) => (
                  <FormItem className='kform-switch-row'>
                    <div className='kform-switch-text'>
                      <FormLabel className='kform-switch-title'>
                        {t('Unlimited Quota')}
                      </FormLabel>
                      <FormDescription className='kform-switch-desc'>
                        {t('Enable unlimited quota for this API key')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              {!unlimitedQuota && (
                <FormField
                  control={form.control}
                  name='remain_quota_dollars'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className='kform-label'>
                        {quotaLabel}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          step={tokensOnly ? 1 : 0.01}
                          className='kform-input tabular-nums'
                          placeholder={quotaPlaceholder}
                          onChange={(e) =>
                            field.onChange(
                              Number.parseFloat(e.target.value) || 0
                            )
                          }
                        />
                      </FormControl>
                      {!tokensOnly && (
                        <div className='kform-presets'>
                          {QUOTA_PRESET_AMOUNTS.map((preset) => (
                            <button
                              key={preset}
                              type='button'
                              className={cn(
                                'kform-preset-btn tabular-nums',
                                field.value === preset && 'is-active'
                              )}
                              onClick={() => field.onChange(preset)}
                            >
                              {`${currencyMeta.symbol}${preset}`}
                            </button>
                          ))}
                        </div>
                      )}
                      <FormDescription className='kform-hint'>
                        {tokensOnly
                          ? t('Enter the quota amount in tokens')
                          : t('Enter the quota amount in {{currency}}', {
                              currency: currencyLabel,
                            })}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <div className='kform-section'>
                <CollapsibleTrigger
                  render={
                    <button type='button' className='kform-collapse-trigger' />
                  }
                >
                  <span className='min-w-0'>
                    <span>{t('Advanced Settings')}</span>
                    <span className='kform-hint ml-2 font-normal'>
                      {t('Set API key access restrictions')}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      'kform-collapse-chevron size-4',
                      advancedOpen && 'rotate-180'
                    )}
                    aria-hidden='true'
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className='kform-advanced-body'>
                    <FormField
                      control={form.control}
                      name='model_limits'
                      render={({ field }) => (
                        <FormItem>
                          <div className='kform-label-row'>
                            <FormLabel className='kform-label'>
                              {t('Model Limits')}
                            </FormLabel>
                            <span className='kform-hint tabular-nums'>
                              {field.value.length > 0
                                ? t('{{count}} models', {
                                    count: field.value.length,
                                  })
                                : t('Unlimited')}
                            </span>
                          </div>
                          <div className='kform-model-select-wrap'>
                            <FormControl>
                              <MultiSelect
                                options={models.map((m) => ({
                                  label: m,
                                  value: m,
                                }))}
                                selected={field.value}
                                onChange={field.onChange}
                                placeholder={t(
                                  'Select models (empty for allow all)'
                                )}
                              />
                            </FormControl>
                          </div>
                          <FormDescription className='kform-hint'>
                            {t('Limit which models can be used with this key')}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='allow_ips'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className='kform-label'>
                            {t('IP Whitelist (supports CIDR)')}
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              className='kform-textarea resize-y'
                              placeholder={t(
                                'One IP per line (empty for no restriction)'
                              )}
                              rows={3}
                            />
                          </FormControl>
                          <FormDescription className='kform-hint'>
                            {t(
                              'Do not over-trust this feature. IP may be spoofed. Please use with nginx, CDN and other gateways.'
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='allow_user_quota_query'
                      render={({ field }) => (
                        <FormItem className='kform-switch-row'>
                          <div className='kform-switch-text'>
                            <FormLabel className='kform-switch-title'>
                              {t('Allow querying user quota')}
                            </FormLabel>
                            <FormDescription className='kform-switch-desc'>
                              {t(
                                "When enabled, this API key can be used to check your account's remaining and used quota."
                              )}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          </form>
        </Form>
        <SheetFooter className='kdrawer-footer'>
          <SheetClose
            disabled={isSubmitting}
            render={
              <button type='button' className='el-btn el-btn-md el-btn-white' />
            }
          >
            {closeLabel ?? t('Close')}
          </SheetClose>
          <button
            type='button'
            className='el-btn el-btn-md el-btn-primary'
            onClick={form.handleSubmit(onSubmit, onInvalid)}
            disabled={!isFormInitialized || isSubmitting}
          >
            {isSubmitting ? t('Saving...') : t('Save changes')}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
