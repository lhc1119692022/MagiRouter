import { useId, useMemo } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { usePricingData } from '@/features/pricing/hooks'
import {
  officialPrice,
  officialPriceSource,
} from '@/features/pricing/lib/official-price'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const encoder = new TextEncoder()
const maxBytes = 256 * 1024
const maxModels = 1000
const invalidName = 'Use a unique, exact model name without wildcards.'
const invalidSource = 'Enter an HTTPS source URL without credentials.'
const invalidAmount =
  'Enter at least one nonnegative USD price in the selected unit.'

const exactModel = z
  .string()
  .refine(
    (name) =>
      name.length > 0 &&
      name === name.trim() &&
      [...name].length <= 256 &&
      !/[*?\p{Cc}]/u.test(name)
  )

type PriceDraft = {
  name: string
  source: string
  unit: 'token' | 'request'
  input: string
  output: string
  request: string
}

function readOfficialPrices(value: string): PriceDraft[] | null {
  if (!value || encoder.encode(value).length > maxBytes) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    const entries = Object.entries(parsed)
    if (entries.length > maxModels) return null
    return entries.map(([name, raw]) => {
      const price = officialPrice.parse(raw)
      return {
        name: exactModel.parse(name),
        source: price.source_url,
        unit: price.usd_per_request === undefined ? 'token' : 'request',
        input: price.input_usd_per_million?.toString() ?? '',
        output: price.output_usd_per_million?.toString() ?? '',
        request: price.usd_per_request?.toString() ?? '',
      }
    })
  } catch {
    return null
  }
}

function usdAmount(text: string) {
  if (text === '') return undefined
  return /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)
    ? Number(text)
    : Number.NaN
}

function encodeOfficialPrices(rows: PriceDraft[]) {
  const prices = new Map<string, z.infer<typeof officialPrice>>()
  const errors = rows.map((row) => {
    if (!exactModel.safeParse(row.name).success || prices.has(row.name)) {
      return invalidName
    }
    if (!officialPriceSource.safeParse(row.source).success) return invalidSource
    const price = officialPrice.safeParse({
      source_url: row.source,
      ...(row.unit === 'request'
        ? { usd_per_request: usdAmount(row.request) }
        : {
            input_usd_per_million: usdAmount(row.input),
            output_usd_per_million: usdAmount(row.output),
          }),
    })
    if (!price.success) return invalidAmount
    prices.set(row.name, price.data)
    return ''
  })
  const value = JSON.stringify(Object.fromEntries(prices))
  return {
    errors,
    value:
      !errors.some(Boolean) &&
      rows.length <= maxModels &&
      encoder.encode(value).length <= maxBytes
        ? value
        : undefined,
  }
}

export function OfficialModelPricesSection({ value }: { value: string }) {
  const { t } = useTranslation()
  const isRoot = useAuthStore(
    (state) => state.auth.user?.role === ROLE.SUPER_ADMIN
  )
  const rows = useMemo(() => readOfficialPrices(value), [value])
  if (!isRoot) return null
  return (
    <SettingsSection title={t('Official reference prices')}>
      {rows ? (
        <OfficialPriceEditor key={value} initialRows={rows} />
      ) : (
        <p role='alert'>
          {value
            ? t('Invalid official reference prices.')
            : t(
                'This server does not support publishing official reference prices.'
              )}
        </p>
      )}
    </SettingsSection>
  )
}

function OfficialPriceEditor({ initialRows }: { initialRows: PriceDraft[] }) {
  const { t } = useTranslation()
  const catalogId = useId()
  const catalog = usePricingData()
  const save = useUpdateOption()
  const form = useForm<{ prices: PriceDraft[] }>({
    defaultValues: { prices: initialRows },
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'prices',
  })
  const rows = useWatch({ control: form.control, name: 'prices' })
  const encoded = useMemo(() => encodeOfficialPrices(rows), [rows])
  const modelNames = useMemo(
    () => [...new Set(catalog.models.map((model) => model.model_name))],
    [catalog.models]
  )
  const canSave = !!encoded.value && form.formState.isDirty && !save.isPending
  const publish = form.handleSubmit((changes) => {
    const { value } = encodeOfficialPrices(changes.prices)
    if (!canSave || !value) return
    save.mutate(
      { key: 'console_setting.official_model_prices', value },
      { onSuccess: () => form.reset(changes) }
    )
  })
  return (
    <>
      <SettingsPageFormActions
        isSaving={save.isPending}
        isSaveDisabled={!canSave}
        onSave={() => void publish()}
      />
      <div className='text-muted-foreground grid gap-1 text-sm'>
        <p>
          {t(
            'These published USD prices are for comparison only. They never change what users are charged.'
          )}
        </p>
        <p>
          {t(
            'Leave an unknown price blank. Enter 0 only if the provider publishes a free price.'
          )}
        </p>
      </div>
      <datalist id={catalogId}>
        {modelNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <fieldset disabled={save.isPending} className='grid min-w-0 gap-4'>
        {fields.map((field, index) => {
          const prefix = `prices.${index}` as const
          const token = rows[index]?.unit !== 'request'
          const error = encoded.errors[index]
          const dimensions = token
            ? ([
                ['input', t('Input USD per million tokens')],
                ['output', t('Output USD per million tokens')],
              ] as const)
            : ([['request', t('USD per request')]] as const)
          return (
            <fieldset
              key={field.id}
              className='grid min-w-0 gap-3 rounded-md border p-3 sm:grid-cols-2'
            >
              <Field>
                <FieldLabel htmlFor={`${field.id}-model`}>
                  {t('Exact model name')}
                </FieldLabel>
                <Input
                  id={`${field.id}-model`}
                  list={catalogId}
                  aria-invalid={error === invalidName}
                  {...form.register(`${prefix}.name`)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${field.id}-source`}>
                  {t('Official pricing URL (HTTPS)')}
                </FieldLabel>
                <Input
                  id={`${field.id}-source`}
                  type='url'
                  autoComplete='off'
                  aria-invalid={error === invalidSource}
                  {...form.register(`${prefix}.source`)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${field.id}-unit`}>
                  {t('Price unit')}
                </FieldLabel>
                <NativeSelect
                  id={`${field.id}-unit`}
                  {...form.register(`${prefix}.unit`)}
                >
                  <NativeSelectOption value='token'>
                    {t('Per million tokens')}
                  </NativeSelectOption>
                  <NativeSelectOption value='request'>
                    {t('Per request')}
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
              {dimensions.map(([dimension, label]) => (
                <Field key={dimension}>
                  <FieldLabel htmlFor={`${field.id}-${dimension}`}>
                    {label}
                  </FieldLabel>
                  <Input
                    id={`${field.id}-${dimension}`}
                    inputMode='decimal'
                    aria-invalid={error === invalidAmount}
                    {...form.register(`${prefix}.${dimension}`)}
                  />
                </Field>
              ))}
              {error && (
                <p
                  role='alert'
                  className='text-destructive text-sm sm:col-span-2'
                >
                  {t(error)}
                </p>
              )}
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='w-fit'
                onClick={() => remove(index)}
              >
                {t('Delete')}
              </Button>
            </fieldset>
          )
        })}
        <Button
          type='button'
          variant='outline'
          className='w-fit'
          disabled={fields.length >= maxModels}
          onClick={() =>
            append({
              name: '',
              source: '',
              unit: 'token',
              input: '',
              output: '',
              request: '',
            })
          }
        >
          {t('Add model')}
        </Button>
      </fieldset>
      {!encoded.value && !encoded.errors.some(Boolean) && (
        <p role='alert'>{t('Invalid official reference prices.')}</p>
      )}
      {save.isError && <p role='alert'>{t('Failed to update setting')}</p>}
    </>
  )
}
