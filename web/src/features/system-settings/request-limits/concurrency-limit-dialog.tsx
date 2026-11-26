import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import type { ComboboxInputOption } from '@/components/ui/combobox-input'
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
import { getGroups } from '@/features/users/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import { safeNumberFieldProps } from '../utils/numeric-field'

type TranslateFn = (key: string, options?: Record<string, unknown>) => string

export const MAX_CONCURRENCY_LIMIT = 100000

const CONCURRENCY_LIMIT_FORM_ID = 'concurrency-limit-form'

export type ConcurrencyLimitEntryData = {
  groupName: string
  maxConcurrency: number
}

const DEFAULT_DIALOG_VALUES: ConcurrencyLimitEntryData = {
  groupName: '',
  maxConcurrency: 0,
}

function createConcurrencyLimitDialogSchema(translate: TranslateFn) {
  return z.object({
    groupName: z
      .string()
      .trim()
      .min(1, {
        error: () => translate('Group name is required'),
      }),
    maxConcurrency: z
      .number({
        error: () => translate('Please enter a valid number'),
      })
      .int({
        error: () => translate('Must be an integer'),
      })
      .min(0, {
        error: () =>
          translate('Must be between {{min}} and {{max}}', {
            min: 0,
            max: MAX_CONCURRENCY_LIMIT,
          }),
      })
      .max(MAX_CONCURRENCY_LIMIT, {
        error: () =>
          translate('Must be between {{min}} and {{max}}', {
            min: 0,
            max: MAX_CONCURRENCY_LIMIT,
          }),
      }),
  })
}

type ConcurrencyLimitDialogFormValues = z.infer<
  ReturnType<typeof createConcurrencyLimitDialogSchema>
>

type ConcurrencyLimitDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: ConcurrencyLimitEntryData) => void
  editData?: ConcurrencyLimitEntryData | null
  existingGroups?: string[]
}

export function ConcurrencyLimitDialog(props: ConcurrencyLimitDialogProps) {
  const { t } = useTranslation()
  const isEditMode = Boolean(props.editData)

  const dialogSchema = useMemo(() => createConcurrencyLimitDialogSchema(t), [t])

  const {
    data: groupsData,
    isLoading: isLoadingGroups,
    isError: isGroupsError,
  } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => requireServerSuccess(await getGroups()),
    enabled: props.open && !isEditMode,
    staleTime: 60_000,
  })

  const configuredGroupSet = useMemo(
    () => new Set((props.existingGroups ?? []).map((name) => name.trim())),
    [props.existingGroups]
  )

  const groupOptions = useMemo<ComboboxInputOption[]>(() => {
    const seen = new Set<string>()
    const groupNames: string[] = []
    for (const rawName of groupsData?.data ?? []) {
      const name = rawName.trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      groupNames.push(name)
    }
    const editGroupName = props.editData?.groupName.trim() ?? ''
    if (isEditMode && editGroupName && !seen.has(editGroupName)) {
      groupNames.unshift(editGroupName)
    }
    return groupNames.map((name) => {
      const isAlreadyConfigured = !isEditMode && configuredGroupSet.has(name)
      return {
        value: name,
        label: name,
        disabled: isAlreadyConfigured,
        description: isAlreadyConfigured ? t('Configured') : undefined,
      }
    })
  }, [
    configuredGroupSet,
    groupsData?.data,
    isEditMode,
    props.editData?.groupName,
    t,
  ])

  const form = useForm<ConcurrencyLimitDialogFormValues>({
    resolver: zodResolver(dialogSchema),
    defaultValues: DEFAULT_DIALOG_VALUES,
  })

  useEffect(() => {
    if (!props.open) {
      return
    }
    if (props.editData) {
      form.reset({
        groupName: props.editData.groupName,
        maxConcurrency: props.editData.maxConcurrency,
      })
    } else {
      form.reset(DEFAULT_DIALOG_VALUES)
    }
  }, [props.editData, props.open, form])

  const handleSubmit = (values: ConcurrencyLimitDialogFormValues): void => {
    props.onSave({
      groupName: values.groupName.trim(),
      maxConcurrency: values.maxConcurrency,
    })
    form.reset(DEFAULT_DIALOG_VALUES)
    props.onOpenChange(false)
  }

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.stopPropagation()
    void form.handleSubmit(handleSubmit)(event)
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        isEditMode
          ? t('Edit group concurrency limit')
          : t('Add group concurrency limit')
      }
      description={t(
        'Configure simultaneous request limit for a specific group.'
      )}
      contentClassName='sm:max-w-[500px]'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type='submit' form={CONCURRENCY_LIMIT_FORM_ID}>
            {isEditMode ? t('Update') : t('Add')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={CONCURRENCY_LIMIT_FORM_ID}
          noValidate
          onSubmit={handleFormSubmit}
          className='space-y-4'
        >
          <FormField
            control={form.control}
            name='groupName'
            render={(fieldProps) => (
              <FormItem>
                <FormLabel>{t('Group Name')}</FormLabel>
                <FormControl>
                  <Combobox
                    options={groupOptions}
                    value={fieldProps.field.value}
                    onValueChange={(value) =>
                      fieldProps.field.onChange(value ?? '')
                    }
                    onBlur={fieldProps.field.onBlur}
                    name={fieldProps.field.name}
                    ref={fieldProps.field.ref}
                    disabled={isEditMode || isLoadingGroups}
                    className='w-full'
                    placeholder={
                      isLoadingGroups ? t('Loading...') : t('Select a group')
                    }
                    searchPlaceholder={t('Select a group')}
                    emptyText={
                      isGroupsError
                        ? t('Failed to load groups')
                        : t('No results found')
                    }
                  />
                </FormControl>
                <FormDescription>
                  {isEditMode
                    ? t('Group name cannot be changed when editing.')
                    : t('Select an existing user or billing group.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='maxConcurrency'
            render={(fieldProps) => (
              <FormItem>
                <FormLabel>{t('Max concurrency')}</FormLabel>
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
                    'Maximum simultaneous in-flight requests for this group. 0 = unlimited.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
