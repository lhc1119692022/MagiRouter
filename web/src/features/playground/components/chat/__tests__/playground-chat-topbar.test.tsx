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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'

import { PlaygroundBilling } from '../../playground-billing'
import { PlaygroundChatTopbar } from '../playground-chat-topbar'

const CLOSED_DRAWERS = {
  parametersId: 'chat-parameters',
  parametersOpen: false,
  codeOpen: false,
  onToggleParameters: vi.fn(),
  onToggleCode: vi.fn(),
}

const baseProps = {
  renderBilling: (actions: ReactNode) => (
    <section aria-label='Billing'>{actions}</section>
  ),
  modelValue: 'gpt-4o',
  ...CLOSED_DRAWERS,
}

type TopbarProps = Parameters<typeof PlaygroundChatTopbar>[0]

async function renderTopbar(props: Partial<TopbarProps> = {}) {
  const root = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <PlaygroundChatTopbar {...baseProps} {...props} />,
  })
  const keysRoute = createRoute({
    getParentRoute: () => root,
    path: '/keys',
    component: () => <div>Keys page</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([indexRoute, keysRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  const view = render(<RouterProvider router={router} />)
  return { router, unmount: view.unmount }
}

describe('playground chat top bar', () => {
  test('reports both drawers as closed until the visitor opens them', async () => {
    await renderTopbar()

    expect(screen.getByRole('button', { name: 'Parameters' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(
      screen.getByRole('button', { name: 'Request preview' })
    ).toHaveAttribute('aria-expanded', 'false')
  })

  test('asks the page to toggle each drawer', async () => {
    const user = userEvent.setup()
    const onToggleParameters = vi.fn()
    const onToggleCode = vi.fn()
    await renderTopbar({ ...CLOSED_DRAWERS, onToggleParameters, onToggleCode })

    await user.click(screen.getByRole('button', { name: 'Parameters' }))
    await user.click(screen.getByRole('button', { name: 'Request preview' }))

    expect(onToggleParameters).toHaveBeenCalledTimes(1)
    expect(onToggleCode).toHaveBeenCalledTimes(1)
  })

  test('reports an open drawer through aria-expanded', async () => {
    await renderTopbar({ parametersOpen: true, codeOpen: true })

    expect(screen.getByRole('button', { name: 'Parameters' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(
      screen.getByRole('button', { name: 'Request preview' })
    ).toHaveAttribute('aria-expanded', 'true')
  })

  test('keeps the billing controls and text actions in the same header', async () => {
    await renderTopbar()
    const header = screen
      .getByRole('region', { name: 'Billing' })
      .closest('header')
    expect(header).toContainElement(
      screen.getByRole('button', { name: 'Parameters' })
    )
    expect(header).toContainElement(
      screen.getByRole('button', { name: 'Request preview' })
    )
  })

  test('offers a new chat only once the conversation has messages', async () => {
    const first = await renderTopbar({ hasMessages: false })
    expect(screen.queryByRole('button', { name: 'New chat' })).toBeNull()
    first.unmount()

    await renderTopbar({ hasMessages: true, onClearMessages: vi.fn() })
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument()
  })

  test('places Details directly after the Model selector in the left group, separate from right actions', async () => {
    const onDetails = vi.fn()
    await renderTopbar({
      renderBilling: (actions) => (
        <PlaygroundBilling
          layout='chat'
          selection={42}
          onSelect={vi.fn()}
          keys={{
            eligible: [
              {
                id: 42,
                name: 'Primary key',
                group: 'default',
                status: 1,
                expires: -1,
                hasQuota: true,
              },
            ],
            loading: false,
            error: false,
            retry: vi.fn(),
          }}
          disabled={false}
          group='default'
          models={[{ value: 'gpt-4o', label: 'gpt-4o' }]}
          model={{
            id: 1,
            model_name: 'gpt-4o',
            quota_type: 0,
            model_ratio: 1,
            completion_ratio: 1,
            enable_groups: ['default'],
          }}
          modelId='gpt-4o'
          editingPreset={false}
          returnSearch={{ mode: 'chat' }}
          onSelectModel={vi.fn()}
          loadingModels={false}
          modelsError={null}
          retryModels={vi.fn()}
          onDetails={onDetails}
          actions={actions}
        />
      ),
    })
    const billing = screen.getByRole('region', { name: 'Billing' })
    const leftGroup = billing.querySelector('.pg-chat-bar-left')
    const rightGroup = billing.querySelector('.pg-chat-bar-right')
    expect(leftGroup).not.toBeNull()
    expect(rightGroup).not.toBeNull()
    const modelPicker = within(leftGroup as HTMLElement).getByRole('combobox', {
      name: 'Select model',
    })
    const detailsButton = within(leftGroup as HTMLElement).getByRole('button', {
      name: 'Details',
    })
    expect(
      modelPicker.compareDocumentPosition(detailsButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      within(rightGroup as HTMLElement).queryByRole('button', {
        name: 'Details',
      })
    ).toBeNull()
    expect(
      within(rightGroup as HTMLElement).getByRole('button', {
        name: 'Parameters',
      })
    ).toHaveClass('pg-topbar-btn')
    expect(detailsButton).toHaveClass('pg-topbar-btn')
    expect(screen.queryByRole('status', { name: 'Billing group' })).toBeNull()
  })

  test('always shows Create an API key at the end of the key dropdown and triggers onCreateKey without clearing selection', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onCreateKey = vi.fn()
    const renderBillingWithSelection = (selection: number | null) =>
      renderTopbar({
        renderBilling: (actions) => (
          <PlaygroundBilling
            layout='media'
            selection={selection}
            onSelect={onSelect}
            onCreateKey={onCreateKey}
            keys={{
              eligible: [
                {
                  id: 42,
                  name: 'Primary key',
                  group: 'default',
                  status: 1,
                  expires: -1,
                  hasQuota: true,
                },
              ],
              loading: false,
              error: false,
              retry: vi.fn(),
            }}
            disabled={false}
            group={selection ? 'default' : ''}
            models={[]}
            modelId=''
            editingPreset={false}
            returnSearch={{ mode: 'image', model: 'gpt-image-1.5' }}
            onSelectModel={vi.fn()}
            loadingModels={false}
            modelsError={null}
            retryModels={vi.fn()}
            onDetails={vi.fn()}
            actions={actions}
          />
        ),
      })

    const unselected = await renderBillingWithSelection(null)
    await user.click(screen.getByRole('combobox', { name: 'API Key' }))
    const unselectedOptions = await screen.findAllByRole('option')
    expect(unselectedOptions.at(-1)).toHaveAccessibleName('Create an API key')
    await user.click(unselectedOptions.at(-1) as HTMLElement)
    expect(onCreateKey).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
    unselected.unmount()

    await renderBillingWithSelection(42)
    await user.click(screen.getByRole('combobox', { name: 'API Key' }))
    const selectedOptions = await screen.findAllByRole('option')
    expect(selectedOptions.at(-2)).toHaveAccessibleName('Clear selection')
    expect(selectedOptions.at(-1)).toHaveAccessibleName('Create an API key')
    await user.click(selectedOptions.at(-1) as HTMLElement)
    expect(onCreateKey).toHaveBeenCalledTimes(2)
    expect(onSelect).not.toHaveBeenCalled()
  })

  test('falls back to navigating to /keys create flow when onCreateKey is omitted', async () => {
    const user = userEvent.setup()
    const { router } = await renderTopbar({
      renderBilling: (actions) => (
        <PlaygroundBilling
          layout='chat'
          selection={null}
          onSelect={vi.fn()}
          keys={{
            eligible: [
              {
                id: 42,
                name: 'Primary key',
                group: 'default',
                status: 1,
                expires: -1,
                hasQuota: true,
              },
            ],
            loading: false,
            error: false,
            retry: vi.fn(),
          }}
          disabled={false}
          group=''
          models={[]}
          modelId=''
          editingPreset={false}
          returnSearch={{ mode: 'chat', model: 'gpt-4o' }}
          onSelectModel={vi.fn()}
          loadingModels={false}
          modelsError={null}
          retryModels={vi.fn()}
          onDetails={vi.fn()}
          actions={actions}
        />
      ),
    })

    await user.click(screen.getByRole('combobox', { name: 'API Key' }))
    await user.click(
      await screen.findByRole('option', { name: 'Create an API key' })
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/keys'))
    expect(router.state.location.search).toEqual({
      action: 'create',
      playground: { mode: 'chat', model: 'gpt-4o' },
    })
  })
})
