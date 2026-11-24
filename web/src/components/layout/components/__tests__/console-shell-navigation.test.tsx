import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { Sidebar, SidebarProvider, useSidebar } from '@/components/ui/sidebar'
import { LayoutProvider, useLayout } from '@/context/layout-provider'
import { SearchProvider, useSearch } from '@/context/search-provider'

function NavigationFixture() {
  const { toggleSidebar, isMobile, openMobile, state } = useSidebar()
  const { variant } = useLayout()
  return (
    <>
      <button
        type='button'
        onClick={toggleSidebar}
        aria-expanded={isMobile ? openMobile : state === 'expanded'}
      >
        Navigation
      </button>
      <Sidebar id='test-navigation' variant={variant}>
        <a href='/keys'>Keys</a>
      </Sidebar>
    </>
  )
}

function renderNavigation(width: number) {
  vi.stubGlobal('innerWidth', width)
  return render(
    <LayoutProvider>
      <SidebarProvider>
        <NavigationFixture />
      </SidebarProvider>
    </LayoutProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  for (const cookie of ['layout_variant', 'sidebar_state']) {
    document.cookie = `${cookie}=; path=/; max-age=0`
  }
})

test.each([390, 768])(
  'at %ipx the inline navigation starts visible and can be dismissed and reopened with the keyboard',
  async (width) => {
    renderNavigation(width)
    const trigger = screen.getByRole('button', { name: 'Navigation' })
    expect(screen.getByRole('complementary')).toContainElement(
      screen.getByRole('link', { name: 'Keys' })
    )
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    trigger.focus()
    await userEvent.keyboard('[Space]')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Keys' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Control>}b{/Control}')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Keys' })).toBeVisible()
  }
)

test.each(['sidebar', 'inset', 'floating'])(
  'at 1024px the desktop rail honors the saved %s layout',
  (variant) => {
    document.cookie = `layout_variant=${variant}; path=/`
    const { container } = renderNavigation(1024)
    expect(container.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      'data-variant',
      variant
    )
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  }
)

function CommandFixture() {
  const { open } = useSearch()
  return open ? <span role='status'>Commands</span> : null
}

test('a local navigation provider does not claim the global collapse shortcut when disabled', async () => {
  vi.stubGlobal('innerWidth', 1600)
  render(
    <LayoutProvider>
      <SidebarProvider keyboardShortcut={false}>
        <NavigationFixture />
      </SidebarProvider>
    </LayoutProvider>
  )
  await userEvent.keyboard('{Control>}b{/Control}')
  expect(screen.getByRole('button', { name: 'Navigation' })).toHaveAttribute(
    'aria-expanded',
    'true'
  )
  expect(document.cookie).not.toContain('sidebar_state=')
})

test('the command palette does not claim model search and only toggles for its own shortcut', () => {
  render(
    <SearchProvider>
      <CommandFixture />
    </SearchProvider>
  )
  const model = new KeyboardEvent('keydown', {
    key: 'k',
    metaKey: true,
    bubbles: true,
    cancelable: true,
  })
  act(() => {
    document.dispatchEvent(model)
  })
  expect(model.defaultPrevented).toBe(false)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  const palette = new KeyboardEvent('keydown', {
    key: 'K',
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  })
  act(() => {
    document.dispatchEvent(palette)
  })
  expect(palette.defaultPrevented).toBe(true)
  expect(screen.getByRole('status')).toHaveTextContent('Commands')
})
