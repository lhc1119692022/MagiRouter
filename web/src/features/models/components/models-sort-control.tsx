import { ArrowDown, ArrowUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { ModelSortBy } from '../types'

const DEFAULT_MODEL_SORT_DESC: Record<ModelSortBy, boolean> = {
  default: true,
  issues: true,
  model_name: false,
  vendor: false,
  channels: true,
  updated_time: true,
  created_time: true,
}

export function ModelsSortControl(props: {
  field: ModelSortBy
  desc: boolean
  onChange: (field: ModelSortBy, desc: boolean) => void
}) {
  const { t } = useTranslation()
  const options: Array<{ value: ModelSortBy; label: string }> = [
    { value: 'default', label: t('Default order') },
    { value: 'issues', label: t('Needs review first') },
    { value: 'model_name', label: t('Model Name') },
    { value: 'vendor', label: t('Vendor') },
    { value: 'channels', label: t('Channels') },
    { value: 'updated_time', label: t('Updated Time') },
    { value: 'created_time', label: t('Created') },
  ]

  return (
    <ButtonGroup aria-label={t('Sort models by')} className='shrink-0'>
      <Select
        value={props.field}
        onValueChange={(value) => {
          if (!value) return
          const nextField = value as ModelSortBy
          const nextDesc =
            nextField === props.field
              ? props.desc
              : DEFAULT_MODEL_SORT_DESC[nextField]
          props.onChange(nextField, nextDesc)
        }}
        items={options}
      >
        <SelectTrigger
          aria-label={t('Sort models by')}
          className='bg-background h-8 min-w-28'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type='button'
        size='icon-sm'
        variant='outline'
        disabled={props.field === 'default'}
        aria-label={props.desc ? t('Descending') : t('Ascending')}
        title={props.desc ? t('Descending') : t('Ascending')}
        onClick={() => props.onChange(props.field, !props.desc)}
      >
        {props.desc ? (
          <ArrowDown aria-hidden='true' className='size-4' />
        ) : (
          <ArrowUp aria-hidden='true' className='size-4' />
        )}
      </Button>
    </ButtonGroup>
  )
}
