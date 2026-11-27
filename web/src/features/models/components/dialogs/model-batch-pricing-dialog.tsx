import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  useModelPricing,
  useSaveModelPricing,
} from '@/features/model-pricing/api'
import { modelPricingDisplay } from '@/features/model-pricing/pricing'
import { ModelPriceCell } from '@/features/pricing/components/model-price-cell'
import { handleServerError } from '@/lib/handle-server-error'

import type { Model } from '../../types'

export function ModelBatchPricingDialog(props: {
  models: Model[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const exactModels = useMemo(
    () => props.models.filter((item) => item.name_rule === 0),
    [props.models]
  )
  const exactNames = useMemo(
    () => exactModels.map((item) => item.model_name),
    [exactModels]
  )
  const pricingQuery = useModelPricing([], props.open)
  const savePricing = useSaveModelPricing()
  const [sourceModel, setSourceModel] = useState('')

  const allEntries = useMemo(
    () => pricingQuery.data?.entries ?? [],
    [pricingQuery.data?.entries]
  )
  const entryByName = useMemo(
    () => new Map(allEntries.map((entry) => [entry.model_name, entry])),
    [allEntries]
  )
  const configuredOptions = useMemo(
    () =>
      allEntries
        .filter((entry) => Object.keys(entry.configured).length > 0)
        .map((entry) => ({
          value: entry.model_name,
          label: entry.model_name,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [allEntries]
  )

  const sourceEntry = sourceModel ? entryByName.get(sourceModel) : undefined
  const targetNames = useMemo(
    () => exactNames.filter((name) => name !== sourceModel),
    [exactNames, sourceModel]
  )

  const handleApply = async () => {
    if (!sourceEntry || targetNames.length === 0 || !pricingQuery.data) return
    try {
      const emptyVersion = pricingQuery.data.empty_version
      const changes = targetNames.map((name) => {
        const existing = entryByName.get(name)
        return {
          model_name: name,
          expected_version: existing?.version ?? emptyVersion,
          pricing: { ...sourceEntry.configured },
        }
      })
      await savePricing.mutateAsync(changes)
      toast.success(
        t('Copied pricing from {{source}} to {{count}} models', {
          source: sourceModel,
          count: targetNames.length,
        })
      )
      props.onOpenChange(false)
      props.onSuccess()
    } catch (error) {
      handleServerError(error, t('Failed to copy model pricing'))
    }
  }

  let body = (
    <div className='space-y-4'>
      {props.models.length > exactNames.length && (
        <Alert>
          <AlertDescription className='text-xs'>
            {t(
              'Pattern matching rules are skipped; pricing applies only to {{count}} exact-match models.',
              { count: exactNames.length }
            )}
          </AlertDescription>
        </Alert>
      )}

      <Field>
        <FieldLabel>{t('Source model')}</FieldLabel>
        <Combobox
          aria-label={t('Source model')}
          options={configuredOptions}
          value={sourceModel}
          onValueChange={(value) => setSourceModel(value ?? '')}
          placeholder={t('Select a configured model to copy pricing from')}
        />
        <FieldDescription>
          {t('{{count}} selected targets available for bulk copy.', {
            count: targetNames.length,
          })}
        </FieldDescription>
      </Field>

      {sourceEntry && (
        <div className='bg-muted/30 space-y-1.5 rounded-lg border p-3'>
          <div className='text-muted-foreground text-xs font-medium'>
            {t('Pricing preview')}
          </div>
          <ModelPriceCell
            model={modelPricingDisplay(sourceEntry)}
            options={{ tokenUnit: 'M' }}
            showExpression={false}
          />
        </div>
      )}
    </div>
  )
  if (pricingQuery.isLoading) {
    body = <LoadingState />
  } else if (pricingQuery.isError) {
    body = (
      <ErrorState
        description={pricingQuery.error.message}
        onRetry={() => void pricingQuery.refetch()}
      />
    )
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!savePricing.isPending) props.onOpenChange(open)
      }}
      title={t('Batch copy pricing')}
      description={t(
        'Copy a configured pricing rule to {{count}} selected exact-match models.',
        { count: exactNames.length }
      )}
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            disabled={savePricing.isPending}
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            disabled={
              !sourceEntry ||
              targetNames.length === 0 ||
              savePricing.isPending
            }
            onClick={() => void handleApply()}
          >
            {savePricing.isPending ? t('Saving...') : t('Apply pricing')}
          </Button>
        </>
      }
    >
      {body}
    </Dialog>
  )
}
