import { AudioLines, Film, Image, Boxes, Mic, Type } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Toggle } from '@/components/ui/toggle'
import {
  CATEGORY_LABEL_KEYS,
  type ModelCapabilityCategory,
} from '@/lib/model-task-capabilities'

const ICONS = {
  transcription: Mic,
  image: Image,
  video: Film,
  text: Type,
  audio: AudioLines,
  other: Boxes,
}

export function TaskCapabilityFilters(props: {
  available: readonly ModelCapabilityCategory[]
  selected: readonly ModelCapabilityCategory[]
  onChange: (tasks: ModelCapabilityCategory[]) => void
}) {
  const { t } = useTranslation()
  if (!props.available.length) return null
  return (
    <div
      className='filter-line'
      role='group'
      aria-label={t('Task capabilities')}
    >
      <span className='filter-group-label' aria-hidden='true'>
        {t('Task capabilities')}
      </span>
      <div className='filter-pills-wrap'>
        {props.available.map((task) => {
          const Icon = ICONS[task]
          const active = props.selected.includes(task)
          return (
            <Toggle
              key={task}
              pressed={active}
              className='filter-pill'
              onPressedChange={() =>
                props.onChange(
                  props.available.filter((other) =>
                    other === task ? !active : props.selected.includes(other)
                  )
                )
              }
            >
              <Icon className='size-4' aria-hidden='true' />
              {t(CATEGORY_LABEL_KEYS[task])}
            </Toggle>
          )
        })}
      </div>
    </div>
  )
}
