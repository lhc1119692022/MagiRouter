import { readFileSync } from 'node:fs'

import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'

import { DataTableView } from '../data-table-view'

const stylesheet = document.createElement('style')

beforeAll(() => {
  stylesheet.textContent = readFileSync(
    'src/components/data-table/core/table-empty.css',
    'utf8'
  )
  document.head.appendChild(stylesheet)
})
afterAll(() => stylesheet.remove())

function Fixture({
  splitHeader,
  populated = false,
  action = () => {},
}: {
  splitHeader: boolean
  populated?: boolean
  action?: () => void
}) {
  const table = useReactTable({
    data: populated ? [{ name: 'Example', status: 'Ready' }] : [],
    columns: [
      { accessorKey: 'name', header: 'Name', size: 900 },
      { accessorKey: 'status', header: 'Status', size: 900 },
    ],
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <DataTableView
      table={table}
      splitHeader={splitHeader}
      emptyTitle='No matches'
      emptyAction={
        <button type='button' onClick={action}>
          Change filters
        </button>
      }
    />
  )
}

test.each([false, true])(
  'an empty wide table scopes its message to the scroll port and keeps the action usable (split header: %s)',
  async (splitHeader) => {
    const action = vi.fn()
    render(<Fixture splitHeader={splitHeader} action={action} />)
    const message = screen
      .getByText('No matches')
      .closest('[data-slot="empty"]')
    const viewport = message?.closest('[data-slot="table-container"]')
    if (!message || !viewport) {
      throw new Error('Expected the empty message inside a table scroll port')
    }
    expect(getComputedStyle(viewport).containerType).toBe('inline-size')
    expect(getComputedStyle(message).position).toBe('sticky')
    expect(getComputedStyle(message).inlineSize).toContain('100cqi')
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
    await userEvent.click(
      screen.getByRole('button', { name: 'Change filters' })
    )
    expect(action).toHaveBeenCalledOnce()
  }
)

test.each([false, true])(
  'a populated table keeps its columns and does not apply empty-viewport containment (split header: %s)',
  (splitHeader) => {
    render(<Fixture splitHeader={splitHeader} populated />)
    const cell = screen.getByRole('cell', { name: 'Example' })
    const viewport = cell.closest('[data-slot="table-container"]')
    if (!viewport) throw new Error('Expected an ordinary table scroll port')
    expect(getComputedStyle(viewport).containerType).not.toBe('inline-size')
    expect(screen.getByRole('cell', { name: 'Ready' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Change filters' })
    ).not.toBeInTheDocument()
  }
)
