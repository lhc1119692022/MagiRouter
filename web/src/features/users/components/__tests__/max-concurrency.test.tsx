import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Row,
} from '@tanstack/react-table'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import {
  transformFormDataToPayload,
  transformUserToFormDefaults,
} from '../../lib/user-form'
import type { User } from '../../types'
import { DataTableRowActions } from '../data-table-row-actions'
import { UserConcurrencyDialog } from '../user-concurrency-dialog'
import { useUsersColumns } from '../users-columns'
import { UsersMutateDrawer } from '../users-mutate-drawer'
import { UsersProvider, useUsers } from '../users-provider'

const BASE_USER: User = {
  id: 9,
  username: 'concurrency-user',
  display_name: 'Concurrency User',
  role: 1,
  status: 1,
  quota: 0,
  used_quota: 0,
  request_count: 0,
  group: 'default',
  max_concurrency: 12,
}

function ConcurrencyDialogHost(props: { onSuccess?: () => void }) {
  const { open, setOpen, currentRow } = useUsers()
  return (
    <UserConcurrencyDialog
      open={open === 'concurrency'}
      onOpenChange={(isOpen) => !isOpen && setOpen(null)}
      user={open === 'concurrency' ? currentRow : null}
      onSuccess={props.onSuccess ?? (() => undefined)}
    />
  )
}

function ConcurrencyColumnTable(props: { users: User[] }) {
  const columns = useUsersColumns().filter(
    (column) => column.id === 'max_concurrency'
  )
  const table = useReactTable({
    columns,
    data: props.users,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => (
              <th key={header.id}>
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext()
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function renderUpdateDrawer(userRecord: User): void {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/group/') {
      return { data: { success: true, data: ['default', 'vip'] } }
    }
    if (url === '/api/authz/catalog') {
      return { data: { success: true, data: { resources: [], roles: [] } } }
    }
    return { data: { success: true, data: userRecord } }
  })

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <UsersProvider>
        <UsersMutateDrawer
          open
          onOpenChange={() => undefined}
          currentRow={userRecord}
        />
      </UsersProvider>
    </QueryClientProvider>
  )
}

describe('User max_concurrency support', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useAuthStore.getState().auth.reset()
  })

  test('maps max_concurrency in user form helpers', () => {
    const defaultsWithoutValue = transformUserToFormDefaults({
      ...BASE_USER,
      max_concurrency: undefined,
    })
    expect(defaultsWithoutValue.max_concurrency).toBe(0)

    const defaultsWithValue = transformUserToFormDefaults(BASE_USER)
    expect(defaultsWithValue.max_concurrency).toBe(12)

    const updatePayload = transformFormDataToPayload(defaultsWithValue, 9)
    expect(updatePayload.max_concurrency).toBe(12)

    const createPayload = transformFormDataToPayload(defaultsWithValue)
    expect(createPayload.max_concurrency).toBeUndefined()
  })

  test('loads, validates, and submits max_concurrency in UsersMutateDrawer', async () => {
    const user = userEvent.setup()
    const putSpy = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })

    renderUpdateDrawer(BASE_USER)

    const input = await screen.findByRole('spinbutton', {
      name: 'Max concurrency',
    })
    await waitFor(() => expect(input).toHaveValue(12))

    fireEvent.change(input, { target: { value: '100001' } })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
    expect(putSpy).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '25' } })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(putSpy).toHaveBeenCalledWith(
        '/api/user/',
        expect.objectContaining({
          id: 9,
          max_concurrency: 25,
        }),
        {}
      )
    )
  })

  test('UserConcurrencyDialog validates, resets to follow policy, and submits atomically without changing group', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onSuccess = vi.fn()
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: {
          id: 9,
          max_concurrency: 0,
          concurrency_limit: {
            enabled: true,
            user_override: 0,
            effective_limit: 8,
            source: 'group',
          },
        },
      },
    })
    const putSpy = vi.spyOn(api, 'put')

    render(
      <UserConcurrencyDialog
        open
        onOpenChange={onOpenChange}
        user={{
          ...BASE_USER,
          group: 'vip',
          max_concurrency: 12,
          concurrency_limit: {
            enabled: true,
            user_override: 12,
            effective_limit: 12,
            source: 'user',
          },
        }}
        onSuccess={onSuccess}
      />
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'Adjust Concurrency',
    })
    expect(within(dialog).getByText('concurrency-user')).toBeInTheDocument()
    expect(within(dialog).getByText('vip')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'Adjusting concurrency does not change the user group.'
      )
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('12 · Custom user limit')
    ).toBeInTheDocument()

    const input = within(dialog).getByRole('spinbutton', {
      name: 'Max concurrency',
    })
    expect(input).toHaveValue(12)

    const followButton = within(dialog).getByRole('button', {
      name: 'Follow group / default',
    })
    expect(followButton).toBeEnabled()

    fireEvent.change(input, { target: { value: '100001' } })
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(
      within(dialog).getByText('Must be between 0 and 100000')
    ).toBeInTheDocument()
    expect(postSpy).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '-1' } })
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(
      within(dialog).getByText('Must be between 0 and 100000')
    ).toBeInTheDocument()
    expect(postSpy).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '3.5' } })
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByText('Must be an integer')).toBeInTheDocument()
    expect(postSpy).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '32' } })
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/user/manage', {
        id: 9,
        action: 'set_concurrency',
        value: 32,
      })
    )

    await user.click(followButton)
    expect(input).toHaveValue(0)
    expect(followButton).toBeDisabled()

    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(postSpy).toHaveBeenLastCalledWith('/api/user/manage', {
        id: 9,
        action: 'set_concurrency',
        value: 0,
      })
    )
    for (const call of postSpy.mock.calls) {
      expect(call[1]).not.toHaveProperty('group')
    }
    expect(putSpy).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledTimes(2)
    expect(onOpenChange).toHaveBeenNthCalledWith(1, false)
    expect(onOpenChange).toHaveBeenNthCalledWith(2, false)
    expect(onSuccess).toHaveBeenCalledTimes(2)
  })

  test('table concurrency column opens dialog for manageable rows and stays plain text otherwise', async () => {
    const user = userEvent.setup()
    useAuthStore
      .getState()
      .auth.setUser({ id: 2, username: 'admin-op', role: 10 })

    const rows: User[] = [
      {
        ...BASE_USER,
        id: 11,
        username: 'regular-user',
        role: 1,
        group: 'vip',
        max_concurrency: 20,
        concurrency_limit: {
          enabled: true,
          user_override: 20,
          effective_limit: 20,
          source: 'user',
        },
      },
      {
        ...BASE_USER,
        id: 12,
        username: 'peer-admin',
        role: 10,
        group: 'default',
        max_concurrency: 0,
        concurrency_limit: {
          enabled: true,
          user_override: 0,
          effective_limit: 5,
          source: 'group',
        },
      },
      {
        ...BASE_USER,
        id: 13,
        username: 'deleted-user',
        role: 1,
        DeletedAt: '2026-01-01T00:00:00Z',
        concurrency_limit: {
          enabled: false,
          user_override: 0,
          effective_limit: 0,
          source: 'disabled',
        },
      },
      {
        ...BASE_USER,
        id: 14,
        username: 'default-policy-user',
        role: 1,
        max_concurrency: 0,
        concurrency_limit: {
          enabled: true,
          user_override: 0,
          effective_limit: 6,
          source: 'default',
        },
      },
      {
        ...BASE_USER,
        id: 15,
        username: 'fallback-user',
        role: 1,
        max_concurrency: 0,
      },
    ]

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <UsersProvider>
          <ConcurrencyColumnTable users={rows} />
          <ConcurrencyDialogHost />
        </UsersProvider>
      </QueryClientProvider>
    )

    expect(
      screen.getByRole('columnheader', { name: 'Concurrency' })
    ).toBeInTheDocument()

    const cells = screen.getAllByRole('cell')
    expect(within(cells[0]).getByText('20')).toBeInTheDocument()
    expect(within(cells[0]).getByText('Custom')).toBeInTheDocument()
    expect(within(cells[1]).getByText('5')).toBeInTheDocument()
    expect(within(cells[1]).getByText('Group')).toBeInTheDocument()
    expect(within(cells[1]).queryByRole('button')).not.toBeInTheDocument()
    expect(within(cells[2]).getByText('Unlimited')).toBeInTheDocument()
    expect(within(cells[2]).getByText('Disabled')).toBeInTheDocument()
    expect(within(cells[2]).queryByRole('button')).not.toBeInTheDocument()
    expect(within(cells[3]).getByText('6')).toBeInTheDocument()
    expect(within(cells[3]).getByText('Default')).toBeInTheDocument()
    expect(within(cells[4]).getByText('Follow group')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Adjust Concurrency: regular-user' })
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'Adjust Concurrency',
    })
    expect(within(dialog).getByText('regular-user')).toBeInTheDocument()
    expect(
      within(dialog).getByRole('spinbutton', { name: 'Max concurrency' })
    ).toHaveValue(20)
  })

  test('row actions menu opens concurrency dialog when permitted and disables it otherwise', async () => {
    const user = userEvent.setup()
    useAuthStore
      .getState()
      .auth.setUser({ id: 2, username: 'admin-op', role: 10 })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <UsersProvider>
          <DataTableRowActions row={{ original: BASE_USER } as Row<User>} />
          <ConcurrencyDialogHost />
        </UsersProvider>
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const adjustItem = await screen.findByRole('menuitem', {
      name: 'Adjust Concurrency',
    })
    expect(adjustItem).not.toHaveAttribute('aria-disabled', 'true')
    await user.click(adjustItem)

    const dialog = await screen.findByRole('dialog', {
      name: 'Adjust Concurrency',
    })
    expect(within(dialog).getByText('concurrency-user')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )

    const peerAdmin: User = {
      ...BASE_USER,
      id: 20,
      username: 'other-admin',
      role: 10,
    }

    rerender(
      <QueryClientProvider client={queryClient}>
        <UsersProvider>
          <DataTableRowActions row={{ original: peerAdmin } as Row<User>} />
          <ConcurrencyDialogHost />
        </UsersProvider>
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const disabledItem = await screen.findByRole('menuitem', {
      name: 'Adjust Concurrency',
    })
    expect(disabledItem).toHaveAttribute('aria-disabled', 'true')
  })
})
