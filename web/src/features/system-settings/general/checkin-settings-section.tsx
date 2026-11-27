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
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
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

export type GroupUpgradeMatchMode = 'all' | 'any'

export interface TopUpGroupUpgradeRule {
  threshold_amount?: number
  usage_threshold_quota?: number
  match_mode?: GroupUpgradeMatchMode
  target_group: string
}

type UpgradeRuleDraft = {
  id: string
  thresholdAmount: string
  usageAmount: string
  matchMode: GroupUpgradeMatchMode
  targetGroup: string
}

const MAX_TOPUP_UPGRADE_THRESHOLD = 1_000_000_000

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

function normalizeUpgradeRules(
  rules: TopUpGroupUpgradeRule[]
): TopUpGroupUpgradeRule[] {
  const result: TopUpGroupUpgradeRule[] = []
  let allTopUpOnly = true
  let allUsageOnly = true

  for (const item of rules) {
    const targetGroup =
      typeof item.target_group === 'string' ? item.target_group.trim() : ''
    if (!targetGroup) continue

    const rawTopUp = Number(item.threshold_amount ?? 0)
    const topUp =
      Number.isFinite(rawTopUp) && rawTopUp > 0
        ? Number(rawTopUp.toFixed(2))
        : 0

    const rawUsage = Number(item.usage_threshold_quota ?? 0)
    const usageQuota =
      Number.isFinite(rawUsage) && rawUsage > 0 ? Math.round(rawUsage) : 0

    if (topUp <= 0 && usageQuota <= 0) continue

    const normalized: TopUpGroupUpgradeRule = {
      target_group: targetGroup,
    }
    if (topUp > 0) {
      normalized.threshold_amount = topUp
    }
    if (usageQuota > 0) {
      normalized.usage_threshold_quota = usageQuota
    }
    if (topUp > 0 && usageQuota > 0) {
      normalized.match_mode = item.match_mode === 'any' ? 'any' : 'all'
      allTopUpOnly = false
      allUsageOnly = false
    } else if (topUp > 0) {
      allUsageOnly = false
    } else {
      allTopUpOnly = false
    }
    result.push(normalized)
  }

  if (allTopUpOnly) {
    return result.sort(
      (a, b) => (a.threshold_amount ?? 0) - (b.threshold_amount ?? 0)
    )
  }
  if (allUsageOnly) {
    return result.sort(
      (a, b) => (a.usage_threshold_quota ?? 0) - (b.usage_threshold_quota ?? 0)
    )
  }
  return result
}

function parseUpgradeRules(raw: string | undefined): TopUpGroupUpgradeRule[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const rawRules: TopUpGroupUpgradeRule[] = parsed
      .filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object')
      )
      .map((entry) => ({
        threshold_amount: Number(entry.threshold_amount ?? 0),
        usage_threshold_quota: Number(entry.usage_threshold_quota ?? 0),
        match_mode: entry.match_mode === 'any' ? 'any' : 'all',
        target_group:
          typeof entry.target_group === 'string' ? entry.target_group : '',
      }))
    return normalizeUpgradeRules(rawRules)
  } catch {
    return []
  }
}

function buildUpgradeRuleConditionKey(rule: TopUpGroupUpgradeRule): string {
  const topUp = rule.threshold_amount ?? 0
  const usage = rule.usage_threshold_quota ?? 0
  const mode = topUp > 0 && usage > 0 ? (rule.match_mode ?? 'all') : ''
  return `${topUp.toFixed(2)}|${usage}|${mode}`
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
      id: `rule-${index}-${rule.threshold_amount ?? 0}-${rule.usage_threshold_quota ?? 0}-${rule.target_group}`,
      thresholdAmount:
        rule.threshold_amount && rule.threshold_amount > 0
          ? String(rule.threshold_amount)
          : '',
      usageAmount:
        rule.usage_threshold_quota && rule.usage_threshold_quota > 0
          ? String(formatInitialQuotaInput(rule.usage_threshold_quota))
          : '',
      matchMode: rule.match_mode === 'any' ? 'any' : 'all',
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
      const rawTopUp = draft.thresholdAmount.trim()
      const rawUsage = draft.usageAmount.trim()
      const topUp = rawTopUp === '' ? 0 : Number(rawTopUp)
      const usageDisplay = rawUsage === '' ? 0 : Number(rawUsage)
      const target = draft.targetGroup.trim()
      if (
        !Number.isFinite(topUp) ||
        topUp < 0 ||
        topUp > MAX_TOPUP_UPGRADE_THRESHOLD ||
        !Number.isFinite(usageDisplay) ||
        usageDisplay < 0 ||
        !target
      ) {
        return null
      }
      const roundedTopUp = topUp > 0 ? Number(topUp.toFixed(2)) : 0
      const usageQuota =
        usageDisplay > 0 ? parseQuotaFromDollars(usageDisplay) : 0
      if (
        usageQuota > Number.MAX_SAFE_INTEGER ||
        (roundedTopUp <= 0 && usageQuota <= 0)
      ) {
        return null
      }
      const nextRule: TopUpGroupUpgradeRule = {
        target_group: target,
      }
      if (roundedTopUp > 0) {
        nextRule.threshold_amount = roundedTopUp
      }
      if (usageQuota > 0) {
        nextRule.usage_threshold_quota = usageQuota
      }
      if (roundedTopUp > 0 && usageQuota > 0) {
        nextRule.match_mode = draft.matchMode === 'any' ? 'any' : 'all'
      }
      list.push(nextRule)
    }
    return normalizeUpgradeRules(list)
  }, [upgradeRuleDrafts])

  const isMixedTierOrder = useMemo(() => {
    let hasTopUp = false
    let hasUsage = false
    for (const draft of upgradeRuleDrafts) {
      if (Number(draft.thresholdAmount.trim() || 0) > 0) hasTopUp = true
      if (Number(draft.usageAmount.trim() || 0) > 0) hasUsage = true
    }
    return hasTopUp && hasUsage
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
        usageAmount: '',
        matchMode: 'all',
        targetGroup: defaultTarget,
      },
    ])
  }

  const handleMoveUpgradeRule = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= upgradeRuleDrafts.length) return
    setRulesError('')
    setUpgradeRuleDrafts((prev) => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(nextIndex, 0, moved)
      return next
    })
  }

  async function onSubmit(values: Values) {
    setRulesError('')
    const rawParsedRules: TopUpGroupUpgradeRule[] = []
    const seenConditions = new Set<string>()

    for (const draft of upgradeRuleDrafts) {
      const rawTopUp = draft.thresholdAmount.trim()
      const rawUsage = draft.usageAmount.trim()
      const topUp = rawTopUp === '' ? 0 : Number(rawTopUp)
      const usageDisplay = rawUsage === '' ? 0 : Number(rawUsage)
      const target = draft.targetGroup.trim()

      if (
        !Number.isFinite(topUp) ||
        topUp < 0 ||
        topUp > MAX_TOPUP_UPGRADE_THRESHOLD
      ) {
        setRulesError(
          t('Top-up group upgrade threshold must be greater than 0')
        )
        return
      }
      if (!Number.isFinite(usageDisplay) || usageDisplay < 0) {
        setRulesError(t('Usage group upgrade threshold is invalid'))
        return
      }
      const roundedTopUp = topUp > 0 ? Number(topUp.toFixed(2)) : 0
      const usageQuota =
        usageDisplay > 0 ? parseQuotaFromDollars(usageDisplay) : 0
      if (usageQuota > Number.MAX_SAFE_INTEGER) {
        setRulesError(t('Usage group upgrade threshold is invalid'))
        return
      }
      if (roundedTopUp <= 0 && usageQuota <= 0) {
        setRulesError(
          t(
            'Each upgrade rule must set a top-up or usage threshold greater than 0.'
          )
        )
        return
      }
      if (!target) {
        setRulesError(t('Each upgrade rule must select a target user group.'))
        return
      }
      const nextRule: TopUpGroupUpgradeRule = {
        target_group: target,
      }
      if (roundedTopUp > 0) {
        nextRule.threshold_amount = roundedTopUp
      }
      if (usageQuota > 0) {
        nextRule.usage_threshold_quota = usageQuota
      }
      if (roundedTopUp > 0 && usageQuota > 0) {
        nextRule.match_mode = draft.matchMode === 'any' ? 'any' : 'all'
      }
      const key = buildUpgradeRuleConditionKey(nextRule)
      if (seenConditions.has(key)) {
        setRulesError(t('Upgrade rule conditions must be unique across rules.'))
        return
      }
      seenConditions.add(key)
      rawParsedRules.push(nextRule)
    }
    const parsedRules = normalizeUpgradeRules(rawParsedRules)

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
                      {t(
                        'Auto-upgrade user group by cumulative top-up or usage'
                      )}
                    </FormLabel>
                    <FormDescription>
                      {t(
                        'Automatically upgrade a user to a target group when their cumulative completed top-up and/or cumulative usage reaches the threshold. Use top-up to filter non-paying users and usage to identify high-value active users.'
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
                  <div className='space-y-0.5'>
                    <p className='text-muted-foreground text-xs'>
                      {t(
                        'Users in default or lower configured tier groups are automatically upgraded to the highest matched tier. Manually assigned special groups are never downgraded.'
                      )}
                    </p>
                    {isMixedTierOrder && upgradeRuleDrafts.length > 1 && (
                      <p className='text-muted-foreground text-[11px]'>
                        {t(
                          'Mixed top-up and usage rules apply in top-to-bottom tier order (lowest to highest).'
                        )}
                      </p>
                    )}
                  </div>
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
                      'No upgrade rules configured yet. Add a cumulative top-up or usage threshold and target group.'
                    )}
                  </p>
                ) : (
                  <div className='space-y-2'>
                    {upgradeRuleDrafts.map((rule, index) => {
                      const parsedTopUp = Number(
                        rule.thresholdAmount.trim() || 0
                      )
                      const parsedUsageDisplay = Number(
                        rule.usageAmount.trim() || 0
                      )
                      const hasTopUp =
                        Number.isFinite(parsedTopUp) && parsedTopUp > 0
                      const hasUsage =
                        Number.isFinite(parsedUsageDisplay) &&
                        parsedUsageDisplay > 0
                      const previewUsageQuota = hasUsage
                        ? parseQuotaFromDollars(parsedUsageDisplay)
                        : 0
                      const bothConfigured = hasTopUp && hasUsage
                      let conditionBadgeLabel = ''
                      if (bothConfigured) {
                        conditionBadgeLabel =
                          rule.matchMode === 'any'
                            ? t('Top-up or usage')
                            : t('Top-up and usage')
                      } else if (hasUsage) {
                        conditionBadgeLabel = t('Usage only')
                      } else if (hasTopUp) {
                        conditionBadgeLabel = t('Top-up only')
                      }

                      return (
                        <div
                          key={rule.id}
                          className='bg-background space-y-3 rounded-lg border p-3'
                        >
                          <div className='flex flex-wrap items-center justify-between gap-2'>
                            <div className='flex flex-wrap items-center gap-1.5'>
                              <Badge
                                variant='secondary'
                                className='text-[11px]'
                              >
                                {t('Tier {{index}}', { index: index + 1 })}
                              </Badge>
                              {conditionBadgeLabel && (
                                <Badge
                                  variant='outline'
                                  className='text-[11px]'
                                >
                                  {conditionBadgeLabel}
                                </Badge>
                              )}
                            </div>

                            <div className='flex items-center gap-1'>
                              {isMixedTierOrder &&
                                upgradeRuleDrafts.length > 1 && (
                                  <>
                                    <Button
                                      type='button'
                                      size='icon'
                                      variant='ghost'
                                      className='h-7 w-7'
                                      disabled={index === 0}
                                      aria-label={t('Move tier up')}
                                      onClick={() =>
                                        handleMoveUpgradeRule(index, -1)
                                      }
                                    >
                                      <ArrowUp className='h-3.5 w-3.5' />
                                    </Button>
                                    <Button
                                      type='button'
                                      size='icon'
                                      variant='ghost'
                                      className='h-7 w-7'
                                      disabled={
                                        index === upgradeRuleDrafts.length - 1
                                      }
                                      aria-label={t('Move tier down')}
                                      onClick={() =>
                                        handleMoveUpgradeRule(index, 1)
                                      }
                                    >
                                      <ArrowDown className='h-3.5 w-3.5' />
                                    </Button>
                                  </>
                                )}
                              <Button
                                type='button'
                                size='icon'
                                variant='ghost'
                                className='text-destructive h-7 w-7'
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
                          </div>

                          <div className='grid gap-2.5 sm:grid-cols-3'>
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
                                min={0}
                                step='any'
                                placeholder={t('Optional, e.g. 50')}
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
                                htmlFor={`upgrade-usage-${rule.id}`}
                                className='text-muted-foreground text-[11px] font-medium'
                              >
                                {t('Cumulative usage ≥ ({{unit}})', {
                                  unit: currencyLabel,
                                })}
                              </label>
                              <Input
                                id={`upgrade-usage-${rule.id}`}
                                type='number'
                                min={0}
                                step={isTokensMode ? 1 : 'any'}
                                placeholder={
                                  isTokensMode
                                    ? t('Optional, e.g. 5000000')
                                    : t('Optional, e.g. 50')
                                }
                                value={rule.usageAmount}
                                onChange={(event) => {
                                  setRulesError('')
                                  const value = event.target.value
                                  setUpgradeRuleDrafts((prev) =>
                                    prev.map((item, idx) =>
                                      idx === index
                                        ? { ...item, usageAmount: value }
                                        : item
                                    )
                                  )
                                }}
                              />
                              {previewUsageQuota > 0 && (
                                <p className='text-muted-foreground text-[11px]'>
                                  {t('≈ {{formatted}} ({{raw}} raw quota)', {
                                    formatted: formatQuotaWithCurrency(
                                      previewUsageQuota,
                                      { digitsLarge: 2, digitsSmall: 4 }
                                    ),
                                    raw: formatNumber(previewUsageQuota),
                                  })}
                                </p>
                              )}
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
                          </div>

                          {bothConfigured && (
                            <div className='flex flex-wrap items-center gap-2 border-t pt-2.5'>
                              <label
                                htmlFor={`upgrade-match-mode-${rule.id}`}
                                className='text-muted-foreground text-[11px] font-medium'
                              >
                                {t('Condition logic')}
                              </label>
                              <NativeSelect
                                id={`upgrade-match-mode-${rule.id}`}
                                className='w-auto min-w-52'
                                value={rule.matchMode}
                                onChange={(event) => {
                                  setRulesError('')
                                  const value: GroupUpgradeMatchMode =
                                    event.target.value === 'any' ? 'any' : 'all'
                                  setUpgradeRuleDrafts((prev) =>
                                    prev.map((item, idx) =>
                                      idx === index
                                        ? { ...item, matchMode: value }
                                        : item
                                    )
                                  )
                                }}
                              >
                                <NativeSelectOption value='all'>
                                  {t('Match both top-up and usage (AND)')}
                                </NativeSelectOption>
                                <NativeSelectOption value='any'>
                                  {t('Match either top-up or usage (OR)')}
                                </NativeSelectOption>
                              </NativeSelect>
                            </div>
                          )}
                        </div>
                      )
                    })}
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
