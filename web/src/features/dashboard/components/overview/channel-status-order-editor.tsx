import {
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  GripVertical,
  RotateCcw,
} from 'lucide-react'
import { type KeyboardEvent, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getGroupStatusBadgeMeta } from '@/features/dashboard/lib/channel-status-order'
import type { GroupChannelStatusItem } from '@/features/dashboard/types'

interface ChannelStatusOrderEditorProps {
  groups: GroupChannelStatusItem[]
  draftOrder: string[]
  isManual: boolean
  isDirty: boolean
  saving: boolean
  onMove: (fromIndex: number, toIndex: number) => void
  onResetDefault: () => void
  onCancel: () => void
  onSave: () => void
}

export function ChannelStatusOrderEditor(props: ChannelStatusOrderEditorProps) {
  const { t } = useTranslation()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const orderedItems = useMemo(() => {
    const byName = new Map<string, GroupChannelStatusItem>()
    for (const item of props.groups) {
      byName.set(item.group, item)
    }
    const seen = new Set<string>()
    const result: GroupChannelStatusItem[] = []
    for (const groupName of props.draftOrder) {
      const found = byName.get(groupName)
      if (found && !seen.has(groupName)) {
        seen.add(groupName)
        result.push(found)
      }
    }
    for (const item of props.groups) {
      if (!seen.has(item.group)) {
        seen.add(item.group)
        result.push(item)
      }
    }
    return result
  }, [props.draftOrder, props.groups])

  const handleGripKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (props.saving) return
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      if (index > 0) {
        event.preventDefault()
        props.onMove(index, index - 1)
      }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      if (index < orderedItems.length - 1) {
        event.preventDefault()
        props.onMove(index, index + 1)
      }
      return
    }
    if (event.key === 'Home' && index > 0) {
      event.preventDefault()
      props.onMove(index, 0)
      return
    }
    if (event.key === 'End' && index < orderedItems.length - 1) {
      event.preventDefault()
      props.onMove(index, orderedItems.length - 1)
    }
  }

  return (
    <div className='ch-reorder-section'>
      <div className='ch-reorder-bar'>
        <div className='ch-reorder-bar-info'>
          <Badge variant={props.isManual ? 'default' : 'secondary'}>
            {props.isManual ? t('Manual order') : t('Default order')}
          </Badge>
          <p className='ch-reorder-hint'>
            {t('Drag cards or use the arrows to reorder all group cards.')}
          </p>
        </div>
        <div className='ch-reorder-bar-actions'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={!props.isManual || props.saving}
            onClick={props.onResetDefault}
          >
            <RotateCcw className='mr-1.5 size-3.5' aria-hidden='true' />
            {t('Reset to default')}
          </Button>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            disabled={props.saving}
            onClick={props.onCancel}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            size='sm'
            disabled={!props.isDirty || props.saving}
            onClick={props.onSave}
          >
            {props.saving ? t('Saving...') : t('Save')}
          </Button>
        </div>
      </div>

      <ol
        className='channel-groups-grid ch-reorder-grid'
        aria-label={t('Channel status card order')}
      >
        {orderedItems.map((item, index) => {
          const meta = getGroupStatusBadgeMeta(item.status)
          const ratioLabel = item.is_auto
            ? t('Auto')
            : `${Number(item.ratio.toFixed(2))}x`
          const isDragging = dragIndex === index
          const isDropTarget =
            dropIndex === index && dragIndex !== null && dragIndex !== index
          let cardClassName = 'group-monitor-card ch-reorder-card'
          if (isDragging) cardClassName += ' is-dragging'
          if (isDropTarget) cardClassName += ' is-drop-target'
          return (
            <li
              key={item.group}
              className={cardClassName}
              draggable={!props.saving}
              onDragStart={(event) => {
                setDragIndex(index)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', item.group)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                if (dropIndex !== index) setDropIndex(index)
              }}
              onDragLeave={(event) => {
                if (
                  dropIndex === index &&
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null
                  )
                ) {
                  setDropIndex(null)
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragIndex !== null && dragIndex !== index) {
                  props.onMove(dragIndex, index)
                }
                setDragIndex(null)
                setDropIndex(null)
              }}
              onDragEnd={() => {
                setDragIndex(null)
                setDropIndex(null)
              }}
            >
              <div className='ch-reorder-card-main'>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='ch-reorder-grip size-7 shrink-0 cursor-grab active:cursor-grabbing'
                  disabled={props.saving}
                  aria-label={t('Drag {{group}} to reorder', {
                    group: item.group,
                  })}
                  title={t('Drag {{group}} to reorder', {
                    group: item.group,
                  })}
                  onKeyDown={(event) => handleGripKeyDown(event, index)}
                >
                  <GripVertical className='size-4' aria-hidden='true' />
                </Button>
                <span className='ch-reorder-rank tabular-nums'>
                  {index + 1}
                </span>
                <div className='gm-head-left min-w-0 flex-1'>
                  <div className='gm-title-row'>
                    <span className='gm-group-name truncate'>{item.group}</span>
                    <span className='dash-gs-ratio'>{ratioLabel}</span>
                    <span className='dash-gs-ratio'>
                      {t('{{count}} models', { count: item.enabled_models })}
                    </span>
                  </div>
                  {item.description && (
                    <p className='gm-group-desc truncate'>{item.description}</p>
                  )}
                </div>
              </div>
              <div className='ch-reorder-card-actions'>
                <span className='channel-status-pill' data-tone={meta.tone}>
                  <span aria-hidden='true' className='dash-gs-dot' />
                  <span>{t(meta.label)}</span>
                </span>
                <div className='ch-reorder-move-btns'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='size-7'
                    disabled={index === 0 || props.saving}
                    aria-label={t('Move {{name}} to top', {
                      name: item.group,
                    })}
                    title={t('Move to top')}
                    onClick={() => props.onMove(index, 0)}
                  >
                    <ArrowUpToLine className='size-3.5' aria-hidden='true' />
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='size-7'
                    disabled={index === 0 || props.saving}
                    aria-label={t('Move {{name}} up', { name: item.group })}
                    title={t('Move up')}
                    onClick={() => props.onMove(index, index - 1)}
                  >
                    <ArrowUp className='size-3.5' aria-hidden='true' />
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='size-7'
                    disabled={index === orderedItems.length - 1 || props.saving}
                    aria-label={t('Move {{name}} down', { name: item.group })}
                    title={t('Move down')}
                    onClick={() => props.onMove(index, index + 1)}
                  >
                    <ArrowDown className='size-3.5' aria-hidden='true' />
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
