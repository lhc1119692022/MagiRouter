import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { DataTableView } from '../data-table-view'

function parseZIndex(element: Element): number {
  const match = element.className
    .split(/\s+/)
    .find((token) => /^z-\d+$/.test(token))
  return match ? Number(match.slice(2)) : 0
}

function PinnedTableFixture() {
  const table = useReactTable({
    data: [{ model: 'claude-haiku-5-5', pricing: '0.1', actions: 'Edit' }],
    columns: [
      { accessorKey: 'model', header: 'Model' },
      { accessorKey: 'pricing', header: 'Pricing' },
      { accessorKey: 'actions', header: 'Actions' },
    ],
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <DataTableView
      table={table}
      splitHeader
      pinnedColumns={[
        { columnId: 'model', side: 'left' },
        { columnId: 'actions', side: 'right' },
      ]}
    />
  )
}

test('keeps the sticky header stacked above pinned body cells and isolated within the table container', () => {
  const { container } = render(<PinnedTableFixture />)

  const tableHeader = container.querySelector('[data-slot="table-header"]')
  if (!tableHeader) {
    throw new Error('Expected a rendered table header')
  }

  const leftPinnedHeader = screen.getByRole('columnheader', { name: 'Model' })
  const rightPinnedHeader = screen.getByRole('columnheader', {
    name: 'Actions',
  })
  const unpinnedHeader = screen.getByRole('columnheader', { name: 'Pricing' })
  const leftPinnedCell = screen.getByRole('cell', { name: 'claude-haiku-5-5' })
  const rightPinnedCell = screen.getByRole('cell', { name: 'Edit' })

  expect(container.firstElementChild).toHaveClass('isolate')
  expect(tableHeader).toHaveClass('sticky', 'top-0')
  expect(parseZIndex(tableHeader)).toBeGreaterThan(parseZIndex(leftPinnedCell))
  expect(parseZIndex(tableHeader)).toBeGreaterThan(parseZIndex(rightPinnedCell))
  expect(parseZIndex(leftPinnedCell)).toBeGreaterThan(0)
  expect(parseZIndex(rightPinnedCell)).toBeGreaterThan(0)
  expect(parseZIndex(leftPinnedHeader)).toBeGreaterThan(
    parseZIndex(unpinnedHeader)
  )
  expect(parseZIndex(rightPinnedHeader)).toBeGreaterThan(
    parseZIndex(unpinnedHeader)
  )
  expect(leftPinnedHeader).toHaveClass('sticky', 'left-0')
  expect(rightPinnedHeader).toHaveClass('sticky', 'right-0')
  expect(leftPinnedCell).toHaveClass('sticky', 'left-0')
  expect(rightPinnedCell).toHaveClass('sticky', 'right-0')
})
