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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface PanelWrapperProps {
  title: ReactNode
  description?: ReactNode
  loading?: boolean
  empty?: boolean
  emptyMessage?: string
  height?: string
  className?: string
  contentClassName?: string
  headerActions?: ReactNode
  children?: ReactNode
}

function PanelHeader(props: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className='dash-panel-head px-4 pt-4 sm:px-5 sm:pt-5'>
      <div className='flex min-w-0 flex-col gap-1'>
        <h3 className='dash-panel-title'>{props.title}</h3>
        {props.description != null && (
          <p className='text-muted-foreground text-xs'>{props.description}</p>
        )}
      </div>
      {props.actions != null ? (
        <div className='flex shrink-0 items-center gap-2'>{props.actions}</div>
      ) : null}
    </div>
  )
}

export function PanelWrapper(props: PanelWrapperProps) {
  const { t } = useTranslation()
  const resolvedEmptyMessage = props.emptyMessage ?? t('No data available')
  const height = props.height ?? 'h-64'
  const frameClassName = cn('dash-surface overflow-hidden', props.className)

  if (props.loading) {
    return (
      <div className={frameClassName}>
        <PanelHeader title={props.title} description={props.description} />
        <div
          className={cn('px-4 pb-4 sm:px-5 sm:pb-5', props.contentClassName)}
        >
          <Skeleton className={`w-full ${height}`} />
        </div>
      </div>
    )
  }

  if (props.empty) {
    return (
      <div className={frameClassName}>
        <PanelHeader title={props.title} description={props.description} />
        <div
          className={cn(
            'text-muted-foreground flex items-center justify-center px-4 text-sm',
            height,
            props.contentClassName
          )}
        >
          {resolvedEmptyMessage}
        </div>
      </div>
    )
  }

  return (
    <div className={frameClassName}>
      <PanelHeader
        title={props.title}
        description={props.description}
        actions={props.headerActions}
      />
      <div className={cn('px-4 pb-4 sm:px-5 sm:pb-5', props.contentClassName)}>
        {props.children}
      </div>
    </div>
  )
}
