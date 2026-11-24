import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { RouteLinesPanel } from '../route-lines-panel'

const items = [
  {
    url: 'https://gateway.example/v1',
    route: 'Main line',
    description: 'Global edge',
    color: 'blue',
  },
  {
    url: 'https://edge.example',
    route: 'Alternate',
    description: 'Edge',
    color: 'green',
  },
]
let client: QueryClient

function renderRoutes(enabled: boolean, entries = items) {
  useAuthStore.getState().auth.setUser({ id: 14, username: 'reader', role: 1 })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], {
    api_info_enabled: enabled,
    api_info: entries,
  })
  return render(
    <QueryClientProvider client={client}>
      <RouteLinesPanel />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  client.clear()
  vi.unstubAllGlobals()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
})

it('shows the published lines to a regular user and measures only their explicitly selected address without credentials', async () => {
  const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', request)
  const user = userEvent.setup()
  renderRoutes(true)
  const panel = within(screen.getByRole('region', { name: 'API routes' }))
  const main = within(panel.getByRole('group', { name: 'Main line' }))
  expect(main.getByText('https://gateway.example/v1')).toBeVisible()
  expect(request).not.toHaveBeenCalled()
  await user.click(main.getByRole('button', { name: 'Test latency' }))
  expect(request).toHaveBeenCalledExactlyOnceWith(
    'https://gateway.example/v1',
    expect.objectContaining({
      method: 'HEAD',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      cache: 'no-store',
    })
  )
  expect(await main.findByText(/\d+\s*ms/)).toBeVisible()
  await user.click(main.getByRole('button', { name: 'Copy' }))
  expect(await navigator.clipboard.readText()).toBe(
    'https://gateway.example/v1'
  )
  await user.click(panel.getByRole('button', { name: 'Test all routes' }))
  expect(request).toHaveBeenCalledTimes(3)
})

it('does not label rejected or HTTP error responses as a successful latency measurement', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new TypeError('CORS unavailable'))
  )
  renderRoutes(true)
  await userEvent.click(screen.getByRole('button', { name: 'Test all routes' }))
  expect(await screen.findAllByText('Unavailable')).toHaveLength(2)
  expect(screen.queryByText(/\d+\s*ms/)).not.toBeInTheDocument()
})

it('keeps the published address, description and optional external test accessible from the same compact route row', async () => {
  const user = userEvent.setup()
  const open = vi.spyOn(window, 'open').mockImplementation(() => null)
  try {
    renderRoutes(true)
    const row = within(screen.getByRole('group', { name: items[0].route }))
    const address = row.getByRole('link', { name: items[0].url })
    expect(address).toHaveAttribute('href', items[0].url)
    expect(address).toHaveAttribute('target', '_blank')
    expect(address.getAttribute('rel')?.split(' ')).toContain('noreferrer')
    const details = row.getByRole('button', { name: /Details/ })
    details.focus()
    await user.keyboard('{Enter}')
    const popup = within(
      await screen.findByRole('dialog', { name: items[0].route })
    )
    expect(popup.getByText(items[0].description)).toBeVisible()
    expect(open).not.toHaveBeenCalled()
    await user.click(popup.getByRole('button', { name: 'External Speed Test' }))
    expect(open).toHaveBeenCalledExactlyOnceWith(
      `https://www.tcptest.cn/http/${encodeURIComponent(items[0].url)}`,
      '_blank',
      'noopener,noreferrer'
    )
    await user.keyboard('{Escape}')
    expect(details).toHaveFocus()
  } finally {
    open.mockRestore()
  }
})

it('does not expose links with embedded credentials, query parameters or fragments in legacy published settings', () => {
  renderRoutes(true, [
    items[0],
    ...[
      'https://gateway.example/v1?token=private',
      'https://name:pass@gateway.example',
      'https://gateway.example/v1#private',
      'javascript:alert(1)',
    ].map((url) => ({ ...items[1], url })),
  ])
  expect(screen.getAllByRole('button', { name: 'Test latency' })).toHaveLength(
    1
  )
  expect(screen.queryByText('Alternate')).not.toBeInTheDocument()
})

it('hides a disabled publication even if a stale status payload contains addresses', () => {
  const result = renderRoutes(false)
  expect(result.container).toBeEmptyDOMElement()
})

it('cancels an in-flight browser probe and allows a fresh measurement after the administrator republishes the lines', async () => {
  let firstSignal: AbortSignal | undefined
  const request = vi
    .fn()
    .mockImplementationOnce(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          firstSignal = options.signal ?? undefined
          firstSignal?.addEventListener(
            'abort',
            () => reject(new Error('Cancelled')),
            { once: true }
          )
        })
    )
    .mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', request)
  renderRoutes(true)
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Test latency' })[0]
  )
  await act(async () => {
    client.setQueryData(['status'], { api_info_enabled: false })
  })
  await waitFor(() =>
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  )
  expect(firstSignal?.aborted).toBe(true)
  await act(async () => {
    client.setQueryData(['status'], { api_info_enabled: true, api_info: items })
  })
  expect(
    await screen.findByRole('button', { name: 'Test all routes' })
  ).toBeEnabled()
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Test latency' })[0]
  )
  expect(await screen.findByText(/\d+\s*ms/)).toBeVisible()
})
