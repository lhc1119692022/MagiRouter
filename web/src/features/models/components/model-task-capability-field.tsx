import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import {
  CATEGORY_LABEL_KEYS,
  MODEL_CAPABILITY_CATEGORIES,
  type ModelCapabilityCategory,
} from '@/lib/model-task-capabilities'

export function ModelTaskCapabilityField(props: {
  value?: ModelCapabilityCategory[]
  onChange: (categories: ModelCapabilityCategory[] | undefined) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <FieldSet className='gap-2' aria-describedby={`${id}-hint`}>
      <FieldLegend variant='label'>{t('Model capability labels')}</FieldLegend>
      <div className='flex flex-wrap gap-2'>
        {MODEL_CAPABILITY_CATEGORIES.map((category) => (
          <Label
            key={category}
            htmlFor={`${id}-${category}`}
            className='bg-background has-[[data-checked]]:bg-muted cursor-pointer gap-2 rounded-full border px-3 py-2'
          >
            <Checkbox
              id={`${id}-${category}`}
              checked={props.value?.includes(category) ?? false}
              onCheckedChange={(checked) =>
                props.onChange(
                  MODEL_CAPABILITY_CATEGORIES.filter((item) =>
                    item === category ? checked : props.value?.includes(item)
                  )
                )
              }
            />
            {t(CATEGORY_LABEL_KEYS[category])}
          </Label>
        ))}
      </div>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
        <FieldDescription id={`${id}-hint`}>
          {props.value === undefined
            ? t('Automatic: labels follow model metadata until you select one.')
            : t('Manual: only selected labels appear in the catalog.')}
        </FieldDescription>
        <Button
          type='button'
          size='sm'
          variant='ghost'
          disabled={props.value === undefined}
          onClick={() => props.onChange(undefined)}
        >
          {t('Restore automatic labels')}
        </Button>
      </div>
    </FieldSet>
  )
}
