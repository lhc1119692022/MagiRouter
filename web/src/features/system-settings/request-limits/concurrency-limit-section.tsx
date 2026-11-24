import { zodResolver } from '@hookform/resolvers/zod'
import { Code2, Palette } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { JsonCodeEditor } from '@/components/json-code-editor'
import { Button } from '@/components/ui/button'
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

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'
import { MAX_CONCURRENCY_LIMIT } from './concurrency-limit-dialog'
import { ConcurrencyLimitVisualEditor } from './concurrency-limit-visual-editor'

type TranslateFn = (key: string, options?: Record<string, unknown>) => string

const MAX_WAIT_TIMEOUT_SECONDS = 300
const MAX_WAIT_EXTRA = 1000
const MIN_SLOT_TTL_SECONDS = 30
const MAX_SLOT_TTL_SECONDS = 7200

function isValidGroupConcurrencyJson(value: string | undefined): boolean {
  if (!value || value.trim() === '') {
    return true
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return false
    }
    for (const [groupName, limit] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (groupName.trim() === '') {
        return false
      }
      if (
        typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 0 ||
        limit > MAX_CONCURRENCY_LIMIT
      ) {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

function createIntegerRangeSchema(
  min: number,
  max: number,
  translate: TranslateFn
): z.ZodNumber {
  return z
    .number({
      error: () => translate('Please enter a valid number'),
    })
    .int({
      error: () => translate('Must be an integer'),
    })
    .min(min, {
      error: () =>
        translate('Must be between {{min}} and {{max}}', { min, max }),
    })
    .max(max, {
      error: () =>
        translate('Must be between {{min}} and {{max}}', { min, max }),
    })
}

function createConcurrencyLimitSchema(translate: TranslateFn) {
  return z.object({
    UserConcurrencyLimitEnabled: z.boolean(),
    UserConcurrencyLimitDefault: createIntegerRangeSchema(
      0,
      MAX_CONCURRENCY_LIMIT,
      translate
    ),
    UserConcurrencyLimitWaitTimeoutSeconds: createIntegerRangeSchema(
      0,
      MAX_WAIT_TIMEOUT_SECONDS,
      translate
    ),
    UserConcurrencyLimitMaxWaitExtra: createIntegerRangeSchema(
      0,
      MAX_WAIT_EXTRA,
      translate
    ),
    UserConcurrencyLimitSlotTTLSeconds: createIntegerRangeSchema(
      MIN_SLOT_TTL_SECONDS,
      MAX_SLOT_TTL_SECONDS,
      translate
    ),
    UserConcurrencyLimitGroup: z.string().refine(isValidGroupConcurrencyJson, {
      error: () =>
        translate('Invalid JSON format or values out of allowed range'),
    }),
  })
}

export type ConcurrencyLimitFormValues = z.infer<
  ReturnType<typeof createConcurrencyLimitSchema>
>

type ConcurrencyLimitSectionProps = {
  defaultValues: ConcurrencyLimitFormValues
}

export function ConcurrencyLimitSection(props: ConcurrencyLimitSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [useVisualEditor, setUseVisualEditor] = useState(true)

  const concurrencyLimitSchema = useMemo(
    () => createConcurrencyLimitSchema(t),
    [t]
  )

  const formDefaults = useMemo<ConcurrencyLimitFormValues>(
    () => ({
      UserConcurrencyLimitEnabled:
        props.defaultValues.UserConcurrencyLimitEnabled,
      UserConcurrencyLimitDefault:
        props.defaultValues.UserConcurrencyLimitDefault,
      UserConcurrencyLimitGroup: props.defaultValues.UserConcurrencyLimitGroup,
      UserConcurrencyLimitWaitTimeoutSeconds:
        props.defaultValues.UserConcurrencyLimitWaitTimeoutSeconds,
      UserConcurrencyLimitMaxWaitExtra:
        props.defaultValues.UserConcurrencyLimitMaxWaitExtra,
      UserConcurrencyLimitSlotTTLSeconds:
        props.defaultValues.UserConcurrencyLimitSlotTTLSeconds,
    }),
    [
      props.defaultValues.UserConcurrencyLimitEnabled,
      props.defaultValues.UserConcurrencyLimitDefault,
      props.defaultValues.UserConcurrencyLimitGroup,
      props.defaultValues.UserConcurrencyLimitWaitTimeoutSeconds,
      props.defaultValues.UserConcurrencyLimitMaxWaitExtra,
      props.defaultValues.UserConcurrencyLimitSlotTTLSeconds,
    ]
  )

  const form = useForm<ConcurrencyLimitFormValues>({
    resolver: zodResolver(concurrencyLimitSchema),
    mode: 'onChange',
    defaultValues: formDefaults,
  })

  useEffect(() => {
    form.reset(formDefaults)
  }, [formDefaults, form])

  const onSubmit = async (
    values: ConcurrencyLimitFormValues
  ): Promise<void> => {
    const entries: Array<
      [keyof ConcurrencyLimitFormValues, string | boolean | number]
    > = [
      ['UserConcurrencyLimitEnabled', values.UserConcurrencyLimitEnabled],
      ['UserConcurrencyLimitDefault', values.UserConcurrencyLimitDefault],
      [
        'UserConcurrencyLimitWaitTimeoutSeconds',
        values.UserConcurrencyLimitWaitTimeoutSeconds,
      ],
      [
        'UserConcurrencyLimitMaxWaitExtra',
        values.UserConcurrencyLimitMaxWaitExtra,
      ],
      [
        'UserConcurrencyLimitSlotTTLSeconds',
        values.UserConcurrencyLimitSlotTTLSeconds,
      ],
      ['UserConcurrencyLimitGroup', values.UserConcurrencyLimitGroup],
    ]

    for (const [key, value] of entries) {
      if (value === props.defaultValues[key]) {
        continue
      }
      await updateOption.mutateAsync({ key, value })
    }
  }

  return (
    <SettingsSection title={t('Concurrency Limits')}>
      <Form {...form}>
        <SettingsForm noValidate onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save concurrency limits'
          />

          <FormField
            control={form.control}
            name='UserConcurrencyLimitEnabled'
            render={(fieldProps) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable user concurrency limits')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Limit simultaneous in-flight model requests per user. When disabled, no concurrency limits are enforced.'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={fieldProps.field.value}
                    onCheckedChange={fieldProps.field.onChange}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          <div className='grid gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='UserConcurrencyLimitDefault'
              render={(fieldProps) => (
                <FormItem>
                  <FormLabel>{t('Default max concurrent requests')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      max={MAX_CONCURRENCY_LIMIT}
                      step={1}
                      {...safeNumberFieldProps(fieldProps.field)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Default simultaneous request limit per user; 0 = unlimited unless overridden by group or user.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='UserConcurrencyLimitWaitTimeoutSeconds'
              render={(fieldProps) => (
                <FormItem>
                  <FormLabel>{t('Queue wait timeout')}</FormLabel>
                  <div className='flex items-center gap-2'>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        max={MAX_WAIT_TIMEOUT_SECONDS}
                        step={1}
                        {...safeNumberFieldProps(fieldProps.field)}
                      />
                    </FormControl>
                    <span className='text-muted-foreground shrink-0 text-sm'>
                      {t('seconds')}
                    </span>
                  </div>
                  <FormDescription>
                    {t(
                      'Time to wait for a free concurrency slot before returning 429; 0 = reject immediately.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='UserConcurrencyLimitMaxWaitExtra'
              render={(fieldProps) => (
                <FormItem>
                  <FormLabel>{t('Extra wait queue capacity')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      max={MAX_WAIT_EXTRA}
                      step={1}
                      {...safeNumberFieldProps(fieldProps.field)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Additional queued requests allowed beyond the user concurrency limit when waiting is enabled.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='UserConcurrencyLimitSlotTTLSeconds'
              render={(fieldProps) => (
                <FormItem>
                  <FormLabel>{t('Slot lease TTL')}</FormLabel>
                  <div className='flex items-center gap-2'>
                    <FormControl>
                      <Input
                        type='number'
                        min={MIN_SLOT_TTL_SECONDS}
                        max={MAX_SLOT_TTL_SECONDS}
                        step={1}
                        {...safeNumberFieldProps(fieldProps.field)}
                      />
                    </FormControl>
                    <span className='text-muted-foreground shrink-0 text-sm'>
                      {t('seconds')}
                    </span>
                  </div>
                  <FormDescription>
                    {t(
                      'Safety lease expiration for in-flight slots to recover from unexpected crashes (30–7200 seconds).'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name='UserConcurrencyLimitGroup'
            render={(fieldProps) => (
              <FormItem data-settings-form-span='full'>
                <div className='flex items-center justify-between'>
                  <FormLabel>{t('Group concurrency limits')}</FormLabel>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => setUseVisualEditor((current) => !current)}
                  >
                    {useVisualEditor ? (
                      <>
                        <Code2 className='mr-2 h-4 w-4' aria-hidden='true' />
                        {t('JSON Mode')}
                      </>
                    ) : (
                      <>
                        <Palette className='mr-2 h-4 w-4' aria-hidden='true' />
                        {t('Visual Mode')}
                      </>
                    )}
                  </Button>
                </div>
                <FormControl>
                  {useVisualEditor ? (
                    <ConcurrencyLimitVisualEditor
                      value={fieldProps.field.value}
                      onChange={fieldProps.field.onChange}
                    />
                  ) : (
                    <JsonCodeEditor
                      value={fieldProps.field.value}
                      onChange={fieldProps.field.onChange}
                      name={fieldProps.field.name}
                      onBlur={fieldProps.field.onBlur}
                      textareaRef={fieldProps.field.ref}
                      placeholder={`{\n  "default": 5,\n  "vip": 20\n}`}
                    />
                  )}
                </FormControl>
                <FormDescription>
                  {useVisualEditor
                    ? t(
                        'Priority: Per-user override > Token group > User group > Default.'
                      )
                    : t(
                        'Optional JSON mapping group names to integer limits (0–100000). Priority: Per-user override > Token group > User group > Default.'
                      )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
