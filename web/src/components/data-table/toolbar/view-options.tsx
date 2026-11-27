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
import type { Table } from '@tanstack/react-table'
import { Columns3, RotateCcw } from 'lucide-react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type DataTableViewOptionsProps<TData> = {
  table: Table<TData>
  label?: string
  showIcon?: boolean
  showCountBadge?: boolean
  triggerClassName?: string
}

export function DataTableViewOptions<TData>({
  table,
  label,
  showIcon = false,
  showCountBadge = false,
  triggerClassName,
}: DataTableViewOptionsProps<TData>) {
  const { t } = useTranslation()
  const buttonLabel = label ?? t('View')
  const hideableColumns = table
    .getAllColumns()
    .filter(
      (column) =>
        column.getCanHide() &&
        (typeof column.columnDef.header === 'string' ||
          Boolean(column.columnDef.meta?.label))
    )
  const visibleCount = hideableColumns.filter((column) =>
    column.getIsVisible()
  ).length
  const hiddenCount = hideableColumns.length - visibleCount

  const handleShowAll = () => {
    const nextVisibility: Record<string, boolean> = {}
    for (const column of hideableColumns) {
      nextVisibility[column.id] = true
    }
    table.setColumnVisibility((prev) => ({ ...prev, ...nextVisibility }))
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            variant='outline'
            className={cn('shrink-0', triggerClassName)}
            aria-label={buttonLabel}
          />
        }
      >
        {showIcon && <Columns3 className='size-3.5' aria-hidden='true' />}
        <span>{buttonLabel}</span>
        {showCountBadge && hiddenCount > 0 && (
          <span className='bg-foreground/10 text-foreground rounded-full px-1.5 text-[10px] font-medium tabular-nums'>
            {visibleCount}/{hideableColumns.length}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='max-h-80 w-48 overflow-y-auto'
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('Toggle columns')}</DropdownMenuLabel>
          {hideableColumns.map((column) => {
            const isVisible = column.getIsVisible()
            const columnLabel =
              typeof column.columnDef.header === 'string'
                ? column.columnDef.header
                : (column.columnDef.meta?.label ?? column.id)
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className='capitalize'
                checked={isVisible}
                disabled={isVisible && visibleCount <= 1}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {columnLabel}
              </DropdownMenuCheckboxItem>
            )
          })}
        </DropdownMenuGroup>
        {hiddenCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleShowAll}>
              <RotateCcw className='size-3.5' aria-hidden='true' />
              <span>{t('Show all')}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
