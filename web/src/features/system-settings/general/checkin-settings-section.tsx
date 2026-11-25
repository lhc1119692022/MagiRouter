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
import i18next from 'i18next'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import {
  formatQuotaWithCurrency,
  getCurrencyDisplay,
  getCurrencyLabel,
} from '@/lib/currency'
import {
  formatNumber,
  parseQuotaFromDollars,
  quotaUnitsToDollars,
} from '@/lib/format'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

export interface TopUpGroupUpgradeRule {
  threshold_amount: number
  target_group: string
}

type UpgradeRuleDraft = {
  id: string
  thresholdAmount: string
  targetGroup: string
}

function parseAllowedGroups(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const result: string[] = []
    const seen = new Set<string>()
    for (const item of parsed) {
      if (typeof item !== 'string') continue
      const trimmed = item.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      result.push(trimmed)
    }
    return result
  } catch {
    return []
  }
}

function parseUpgradeRules(raw: string | undefined): TopUpGroupUpgradeRule[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const result: TopUpGroupUpgradeRule[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const entry = item as Record<string, unknown>
      const threshold = Number(entry.threshold_amount)
      const targetGroup =
        typeof entry.target_group === 'string' ? entry.target_group.trim() : ''
      if (!Number.isFinite(threshold) || threshold <= 0 || !targetGroup) {
        continue
      }
      result.push({
        threshold_amount: Number(threshold.toFixed(2)),
        target_group: targetGroup,
      })
    }
    return result.sort((a, b) => a.threshold_amount - b.threshold_amount)
  } catch {
    return []
  }
}

function formatInitialQuotaInput(rawQuota: number): number {
  const { meta } = getCurrencyDisplay()
  if (meta.kind === 'tokens') {
    return Math.max(0, Math.round(rawQuota))
  }
  const displayAmount = quotaUnitsToDollars(rawQuota)
  if (!Number.isFinite(displayAmount) || displayAmount <= 0) return 0
  const precision = displayAmount < 0.001 ? 6 : 4
  return Number(displayAmount.toFixed(precision))
}

const schema = z
  .object({
    enabled: z.boolean(),
    minAmount: z.coerce.number().min(0),
    maxAmount: z.coerce.number().min(0),
    topUpUpgradeEnabled: z.boolean(),
  })
  .refine((values) => values.maxAmount >= values.minAmount, {
    message: i18next.t(
      'Maximum check-in reward must be greater than or equal to minimum'
    ),
    path: ['maxAmount'],
  })

type Values = z.infer<typeof schema>

export function CheckinSettingsSection({
  defaultValues,
}: {
  defaultValues: {
    enabled: boolean
    minQuota: number
    maxQuota: number
    allowedGroups?: string
    topUpUpgradeEnabled?: boolean
    topUpUpgradeRules?: string
  }
}) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const { meta: currencyMeta } = getCurrencyDisplay()
  const currencyLabel = getCurrencyLabel()
  const isTokensMode = currencyMeta.kind === 'tokens'

  const initialAllowedGroups = useMemo(
    () => parseAllowedGroups(defaultValues.allowedGroups),
    [defaultValues.allowedGroups]
  )
  const initialUpgradeRules = useMemo(
    () => parseUpgradeRules(defaultValues.topUpUpgradeRules),
    [defaultValues.topUpUpgradeRules]
  )

  const [selectedGroups, setSelectedGroups] =
    useState<string[]>(initialAllowedGroups)
  const [upgradeRuleDrafts, setUpgradeRuleDrafts] = useState<
    UpgradeRuleDraft[]
  >(() =>
    initialUpgradeRules.map((rule, index) => ({
      id: `rule-${index}-${rule.threshold_amount}-${rule.target_group}`,
      thresholdAmount: String(rule.threshold_amount),
      targetGroup: rule.target_group,
    }))
  )
  const [rulesError, setRulesError] = useState('')

  const { data: availableGroups = [] } = useQuery({
    queryKey: ['admin-groups-all'],
    queryFn: async () => {
      const res = await api.get<{ success?: boolean; data?: string[] }>(
        '/api/group'
      )
      return Array.isArray(res.data?.data) ? res.data.data : []
    },
    staleTime: 60_000,
  })

  const allGroupOptions = useMemo(() => {
    const seen = new Set<string>()
    const merged: string[] = []
    for (const group of [
      ...availableGroups,
      ...selectedGroups,
      ...upgradeRuleDrafts.map((rule) => rule.targetGroup),
    ]) {
      const trimmed = group.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      merged.push(trimmed)
    }
    return merged
  }, [availableGroups, selectedGroups, upgradeRuleDrafts])

  const initialMinAmount = useMemo(
    () => formatInitialQuotaInput(defaultValues.minQuota),
    [defaultValues.minQuota]
  )
  const initialMaxAmount = useMemo(
    () => formatInitialQuotaInput(defaultValues.maxQuota),
    [defaultValues.maxQuota]
  )

  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: {
      enabled: defaultValues.enabled,
      minAmount: initialMinAmount,
      maxAmount: initialMaxAmount,
      topUpUpgradeEnabled: Boolean(defaultValues.topUpUpgradeEnabled),
    },
  })

  const { isDirty: formDirty, isSubmitting } = form.formState
  const enabled = form.watch('enabled')
  const minAmountWatch = form.watch('minAmount')
  const maxAmountWatch = form.watch('maxAmount')
  const topUpUpgradeEnabled = form.watch('topUpUpgradeEnabled')

  const serializedSelectedGroups = useMemo(
    () => JSON.stringify(selectedGroups),
    [selectedGroups]
  )
  const serializedInitialGroups = useMemo(
    () => JSON.stringify(initialAllowedGroups),
    [initialAllowedGroups]
  )
  const serializedInitialRules = useMemo(
    () => JSON.stringify(initialUpgradeRules),
    [initialUpgradeRules]
  )
  const normalizedDraftRules = useMemo(() => {
    const list: TopUpGroupUpgradeRule[] = []
    for (const draft of upgradeRuleDrafts) {
      const threshold = Number(draft.thresholdAmount)
      const target = draft.targetGroup.trim()
      if (!Number.isFinite(threshold) || threshold <= 0 || !target) {
        return null
      }
      list.push({
        threshold_amount: Number(threshold.toFixed(2)),
        target_group: target,
      })
    }
    return list.sort((a, b) => a.threshold_amount - b.threshold_amount)
  }, [upgradeRuleDrafts])

  const groupsDirty = serializedSelectedGroups !== serializedInitialGroups
  const rulesDirty =
    normalizedDraftRules === null
      ? true
      : JSON.stringify(normalizedDraftRules) !== serializedInitialRules
  const isDirty = formDirty || groupsDirty || rulesDirty

  const previewMinQuota = parseQuotaFromDollars(Number(minAmountWatch) || 0)
  const previewMaxQuota = parseQuotaFromDollars(Number(maxAmountWatch) || 0)

  const toggleAllowedGroup = (group: string, checked: boolean) => {
    setSelectedGroups((prev) => {
      if (checked) {
        return prev.includes(group) ? prev : [...prev, group]
      }
      return prev.filter((item) => item !== group)
    })
  }

  const handleAddUpgradeRule = () => {
    setRulesError('')
    const defaultTarget =
      allGroupOptions.find((group) => group !== 'default') ??
      allGroupOptions[0] ??
      ''
    setUpgradeRuleDrafts((prev) => [
      ...prev,
      {
        id: `rule-${Date.now()}-${prev.length}`,
        thresholdAmount: '',
        targetGroup: defaultTarget,
      },
    ])
  }

  async function onSubmit(values: Values) {
    setRulesError('')
    const parsedRules: TopUpGroupUpgradeRule[] = []
    const seenThresholds = new Set<string>()

    for (const draft of upgradeRuleDrafts) {
      const threshold = Number(draft.thresholdAmount)
      const target = draft.targetGroup.trim()
      if (!Number.isFinite(threshold) || threshold <= 0) {
        setRulesError(
          t('Each upgrade rule must have a top-up threshold greater than 0.')
        )
        return
      }
      if (!target) {
        setRulesError(t('Each upgrade rule must select a target user group.'))
        return
      }
      const rounded = Number(threshold.toFixed(2))
      const key = rounded.toFixed(2)
      if (seenThresholds.has(key)) {
        setRulesError(
          t('Cumulative top-up thresholds must be unique across rules.')
        )
        return
      }
      seenThresholds.add(key)
      parsedRules.push({
        threshold_amount: rounded,
        target_group: target,
      })
    }
    parsedRules.sort((a, b) => a.threshold_amount - b.threshold_amount)

    const nextMinQuota = parseQuotaFromDollars(values.minAmount)
    const nextMaxQuota = parseQuotaFromDollars(values.maxAmount)
    const updates: Array<{ key: string; value: string }> = []

    if (values.enabled !== defaultValues.enabled) {
      updates.push({
        key: 'checkin_setting.enabled',
        value: String(values.enabled),
      })
    }

    if (nextMinQuota !== defaultValues.minQuota) {
      updates.push({
        key: 'checkin_setting.min_quota',
        value: String(nextMinQuota),
      })
    }

    if (nextMaxQuota !== defaultValues.maxQuota) {
      updates.push({
        key: 'checkin_setting.max_quota',
        value: String(nextMaxQuota),
      })
    }

    if (groupsDirty) {
      updates.push({
        key: 'checkin_setting.allowed_groups',
        value: serializedSelectedGroups,
      })
    }

    if (
      values.topUpUpgradeEnabled !== Boolean(defaultValues.topUpUpgradeEnabled)
    ) {
      updates.push({
        key: 'checkin_setting.topup_upgrade_enabled',
        value: String(values.topUpUpgradeEnabled),
      })
    }

    const nextRulesSerialized = JSON.stringify(parsedRules)
    if (nextRulesSerialized !== serializedInitialRules) {
      updates.push({
        key: 'checkin_setting.topup_upgrade_rules',
        value: nextRulesSerialized,
      })
    }

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }

    form.reset(values)
  }

  return (
    <SettingsSection title={t('Check-in Settings')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending || isSubmitting}
            isSaveDisabled={!isDirty}
            saveLabel='Save check-in settings'
          />
          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable check-in feature')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Allow users to check in daily for random quota rewards'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={updateOption.isPending || isSubmitting}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          {enabled && (
            <div className='space-y-6'>
              <div className='grid gap-6 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='minAmount'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('Minimum check-in reward ({{unit}})', {
                          unit: currencyLabel,
                        })}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={0}
                          step={isTokensMode ? 1 : 'any'}
                          placeholder={isTokensMode ? '1000' : '0.01'}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'Supports decimal amounts. Equivalent to {{formatted}} ({{raw}} raw quota).',
                          {
                            formatted: formatQuotaWithCurrency(
                              previewMinQuota,
                              { digitsLarge: 2, digitsSmall: 4 }
                            ),
                            raw: formatNumber(previewMinQuota),
                          }
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='maxAmount'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('Maximum check-in reward ({{unit}})', {
                          unit: currencyLabel,
                        })}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={0}
                          step={isTokensMode ? 1 : 'any'}
                          placeholder={isTokensMode ? '10000' : '0.05'}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'Supports decimal amounts. Equivalent to {{formatted}} ({{raw}} raw quota).',
                          {
                            formatted: formatQuotaWithCurrency(
                              previewMaxQuota,
                              { digitsLarge: 2, digitsSmall: 4 }
                            ),
                            raw: formatNumber(previewMaxQuota),
                          }
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className='bg-muted/20 space-y-3 rounded-xl border p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div>
                    <div className='text-sm font-medium'>
                      {t('Allowed User Groups for Check-in')}
                    </div>
                    <p className='text-muted-foreground mt-0.5 text-xs'>
                      {t(
                        'Restrict check-in to specific user groups. Leave empty to allow all user groups.'
                      )}
                    </p>
                  </div>
                  {selectedGroups.length > 0 && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => setSelectedGroups([])}
                    >
                      {t('Allow all groups')}
                    </Button>
                  )}
                </div>

                {allGroupOptions.length === 0 ? (
                  <p className='text-muted-foreground text-xs'>
                    {t('No user groups available.')}
                  </p>
                ) : (
                  <div className='flex flex-wrap gap-2'>
                    {allGroupOptions.map((group) => {
                      const checked = selectedGroups.includes(group)
                      return (
                        <label
                          key={group}
                          className='bg-background hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium select-none'
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) =>
                              toggleAllowedGroup(group, Boolean(next))
                            }
                          />
                          <span>{group}</span>
                        </label>
                      )
                    })}
                  </div>
                )}

                <div className='flex flex-wrap items-center gap-1.5 text-xs'>
                  <span className='text-muted-foreground'>
                    {t('Current scope:')}
                  </span>
                  {selectedGroups.length === 0 ? (
                    <Badge variant='secondary'>{t('All user groups')}</Badge>
                  ) : (
                    selectedGroups.map((group) => (
                      <Badge key={group} variant='outline'>
                        {group}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          <div className='space-y-4 border-t pt-6'>
            <FormField
              control={form.control}
              name='topUpUpgradeEnabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>
                      {t('Auto-upgrade user group by cumulative top-up')}
                    </FormLabel>
                    <FormDescription>
                      {t(
                        'Automatically upgrade a user to a target group when their cumulative completed top-up reaches the threshold. Pair with allowed check-in groups to unlock check-in rewards after recharging.'
                      )}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={updateOption.isPending || isSubmitting}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />

            {topUpUpgradeEnabled && (
              <div className='bg-muted/20 space-y-3 rounded-xl border p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <p className='text-muted-foreground text-xs'>
                    {t(
                      'Users in default or lower configured tier groups are automatically upgraded to the highest matched tier. Manually assigned special groups are never downgraded.'
                    )}
                  </p>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={handleAddUpgradeRule}
                  >
                    <Plus className='mr-1 h-3.5 w-3.5' />
                    {t('Add upgrade rule')}
                  </Button>
                </div>

                {upgradeRuleDrafts.length === 0 ? (
                  <p className='text-muted-foreground rounded-lg border border-dashed py-4 text-center text-xs'>
                    {t(
                      'No upgrade rules configured yet. Add a cumulative top-up threshold and target group.'
                    )}
                  </p>
                ) : (
                  <div className='space-y-2'>
                    {upgradeRuleDrafts.map((rule, index) => (
                      <div
                        key={rule.id}
                        className='bg-background grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center'
                      >
                        <div className='space-y-1'>
                          <label
                            htmlFor={`upgrade-threshold-${rule.id}`}
                            className='text-muted-foreground text-[11px] font-medium'
                          >
                            {t('Cumulative top-up ≥')}
                          </label>
                          <Input
                            id={`upgrade-threshold-${rule.id}`}
                            type='number'
                            min={0.01}
                            step='any'
                            placeholder='50'
                            value={rule.thresholdAmount}
                            onChange={(event) => {
                              setRulesError('')
                              const value = event.target.value
                              setUpgradeRuleDrafts((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? { ...item, thresholdAmount: value }
                                    : item
                                )
                              )
                            }}
                          />
                        </div>

                        <div className='space-y-1'>
                          <label
                            htmlFor={`upgrade-group-${rule.id}`}
                            className='text-muted-foreground text-[11px] font-medium'
                          >
                            {t('Upgrade to user group')}
                          </label>
                          <NativeSelect
                            id={`upgrade-group-${rule.id}`}
                            value={rule.targetGroup}
                            onChange={(event) => {
                              setRulesError('')
                              const value = event.target.value
                              setUpgradeRuleDrafts((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? { ...item, targetGroup: value }
                                    : item
                                )
                              )
                            }}
                          >
                            <NativeSelectOption value=''>
                              {t('Select user group')}
                            </NativeSelectOption>
                            {allGroupOptions.map((group) => (
                              <NativeSelectOption key={group} value={group}>
                                {group}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </div>

                        <Button
                          type='button'
                          size='icon'
                          variant='ghost'
                          className='text-destructive self-end'
                          aria-label={t('Remove upgrade rule')}
                          onClick={() => {
                            setRulesError('')
                            setUpgradeRuleDrafts((prev) =>
                              prev.filter((_, idx) => idx !== index)
                            )
                          }}
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {rulesError && (
                  <p className='text-destructive text-xs font-medium'>
                    {rulesError}
                  </p>
                )}
              </div>
            )}
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
