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
import i18next from 'i18next'
import type { Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { Switch } from '@/components/ui/switch'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import {
  formatNumber,
  formatQuota,
  parseQuotaFromDollars,
  quotaUnitsToDollars,
} from '@/lib/format'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { FormDirtyIndicator } from '../components/form-dirty-indicator'
import { FormNavigationGuard } from '../components/form-navigation-guard'
import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
  SettingsFormGrid,
  SettingsFormGridItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useSettingsForm } from '../hooks/use-settings-form'
import { useUpdateOption } from '../hooks/use-update-option'

const QUOTA_AMOUNT_KEYS = new Set([
  'QuotaForNewUser',
  'QuotaForInviter',
  'QuotaForInvitee',
])

const quotaAmountSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce
    .number({ error: () => i18next.t('Please enter a valid number') })
    .refine((value) => Number.isFinite(value), {
      error: () => i18next.t('Please enter a valid number'),
    })
    .min(0, {
      error: () => i18next.t('Must be greater than or equal to 0'),
    })
    .refine(
      (value) =>
        getCurrencyDisplay().meta.kind !== 'tokens' || Number.isInteger(value),
      {
        error: () => i18next.t('Enter a non-negative integer'),
      }
    )
    .refine((value) => value === 0 || parseQuotaFromDollars(value) > 0, {
      error: () => i18next.t('Amount is smaller than 1 quota unit'),
    })
    .refine(
      (value) => {
        const rawQuota = parseQuotaFromDollars(value)
        return Number.isFinite(rawQuota) && rawQuota <= Number.MAX_SAFE_INTEGER
      },
      {
        error: () =>
          i18next.t('Quota value exceeds valid range, maximum is {{max}}', {
            max: formatQuota(Number.MAX_SAFE_INTEGER),
          }),
      }
    )
)

const quotaSchema = z.object({
  QuotaForNewUser: quotaAmountSchema,
  QuotaForInviter: quotaAmountSchema,
  QuotaForInvitee: quotaAmountSchema,
  TopUpLink: z.string(),
  quota_setting: z.object({
    enable_free_model_pre_consume: z.boolean(),
    trust_quota_usd: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.coerce
        .number({ error: () => i18next.t('Please enter a valid number') })
        .min(0, {
          error: () => i18next.t('Must be greater than or equal to 0'),
        })
    ),
    pre_consume_multiplier: z.coerce
      .number({ error: () => i18next.t('Please enter a valid number') })
      .positive({ error: () => i18next.t('Must be greater than 0') }),
  }),
})

type QuotaFormValues = z.infer<typeof quotaSchema>

function formatQuotaAmountInput(rawQuota: number): number {
  const { meta } = getCurrencyDisplay()
  if (meta.kind === 'tokens') {
    return Number.isFinite(rawQuota) && rawQuota > 0 ? Math.round(rawQuota) : 0
  }
  const displayAmount = quotaUnitsToDollars(rawQuota)
  if (!Number.isFinite(displayAmount) || displayAmount <= 0) return 0
  return Number(displayAmount.toFixed(6))
}

function parseQuotaAmountPreview(value: unknown): number {
  if (value === '' || value === null || value === undefined) return 0
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0
  return parseQuotaFromDollars(numericValue)
}

type QuotaSettingsSectionProps = {
  defaultValues: QuotaFormValues
  complianceConfirmed?: boolean
}

export function QuotaSettingsSection({
  defaultValues,
  complianceConfirmed = true,
}: QuotaSettingsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  useSystemConfigStore((state) => state.config.currency)
  const { meta: currencyMeta } = getCurrencyDisplay()
  const currencyLabel = getCurrencyLabel()
  const isTokensMode = currencyMeta.kind === 'tokens'

  const formDefaultValues: QuotaFormValues = {
    ...defaultValues,
    QuotaForNewUser: formatQuotaAmountInput(defaultValues.QuotaForNewUser),
    QuotaForInviter: formatQuotaAmountInput(defaultValues.QuotaForInviter),
    QuotaForInvitee: formatQuotaAmountInput(defaultValues.QuotaForInvitee),
  }

  const { form, handleSubmit, isDirty, isSubmitting } =
    useSettingsForm<QuotaFormValues>({
      resolver: zodResolver(quotaSchema) as Resolver<
        QuotaFormValues,
        unknown,
        QuotaFormValues
      >,
      defaultValues: formDefaultValues,
      onSubmit: async (_data, changedFields) => {
        for (const [key, value] of Object.entries(changedFields)) {
          const nextValue = QUOTA_AMOUNT_KEYS.has(key)
            ? parseQuotaFromDollars(Number(value))
            : (value as string | number | boolean)
          await updateOption.mutateAsync({
            key,
            value: nextValue,
          })
        }
      },
    })

  return (
    <SettingsSection title={t('Quota Settings')}>
      <FormNavigationGuard when={isDirty} />

      {!complianceConfirmed ? (
        <Alert variant='destructive'>
          <AlertDescription>
            {t(
              'Non-zero invitation rewards require compliance confirmation in Payment Gateway settings.'
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <Form {...form}>
        <SettingsForm onSubmit={handleSubmit}>
          <SettingsPageFormActions
            onSave={handleSubmit}
            isSaving={updateOption.isPending || isSubmitting}
          />
          <FormDirtyIndicator isDirty={isDirty} />
          <SettingsFormGrid>
            <FormField
              control={form.control}
              name='QuotaForNewUser'
              render={({ field }) => {
                const previewQuota = parseQuotaAmountPreview(field.value)
                return (
                  <FormItem>
                    <FormLabel>
                      {t('New User Quota ({{unit}})', { unit: currencyLabel })}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        step={isTokensMode ? 1 : 'any'}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        name={field.name}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Initial quota given to new users ({{formattedQuota}}, {{raw}} raw quota)',
                        {
                          formattedQuota: formatQuota(previewQuota),
                          raw: formatNumber(previewQuota),
                        }
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )
              }}
            />

            <FormField
              control={form.control}
              name='quota_setting.trust_quota_usd'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('Wallet pre-consume bypass threshold (USD)')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      step='any'
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      name={field.name}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Skip pre-consumption when the wallet balance and limited API key balance both exceed this amount. Set to 0 to always pre-consume. Subscriptions and asynchronous tasks always reserve quota.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='quota_setting.pre_consume_multiplier'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Input pre-consume multiplier')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      step='any'
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      name={field.name}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Reserve the estimated input cost multiplied by this value, without estimating output tokens. Defaults to 1; positive decimals such as 0.5 and 1.5 are supported. Final charges use actual usage. Per-request and task prices are unaffected.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='QuotaForInviter'
              render={({ field }) => {
                const previewQuota = parseQuotaAmountPreview(field.value)
                return (
                  <FormItem>
                    <FormLabel>
                      {t('Inviter Reward ({{unit}})', { unit: currencyLabel })}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        step={isTokensMode ? 1 : 'any'}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        name={field.name}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Quota given to users who invite others ({{formattedQuota}}, {{raw}} raw quota)',
                        {
                          formattedQuota: formatQuota(previewQuota),
                          raw: formatNumber(previewQuota),
                        }
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )
              }}
            />

            <FormField
              control={form.control}
              name='QuotaForInvitee'
              render={({ field }) => {
                const previewQuota = parseQuotaAmountPreview(field.value)
                return (
                  <FormItem>
                    <FormLabel>
                      {t('Invitee Reward ({{unit}})', { unit: currencyLabel })}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        step={isTokensMode ? 1 : 'any'}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        name={field.name}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Quota given to invited users ({{formattedQuota}}, {{raw}} raw quota)',
                        {
                          formattedQuota: formatQuota(previewQuota),
                          raw: formatNumber(previewQuota),
                        }
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )
              }}
            />

            <SettingsFormGridItem span='full'>
              <FormField
                control={form.control}
                name='quota_setting.enable_free_model_pre_consume'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Pre-Consume for Free Models')}</FormLabel>
                      <FormDescription>
                        {t(
                          'When enabled, zero-cost models also pre-consume quota before final settlement.'
                        )}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={updateOption.isPending}
                      />
                    </FormControl>
                  </SettingsSwitchItem>
                )}
              />
            </SettingsFormGridItem>

            <FormField
              control={form.control}
              name='TopUpLink'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Top-Up Link')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('https://example.com/topup')}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('External link for users to purchase quota')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SettingsFormGrid>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
