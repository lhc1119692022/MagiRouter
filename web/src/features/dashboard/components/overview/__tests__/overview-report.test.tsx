import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { VendorMutateDialog } from '@/features/models/components/dialogs/vendor-mutate-dialog'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { UsageTrendPanel } from '../usage-trend-panel'
import { useOverviewReport } from '../use-overview-report'

let client: QueryClient
let vendorName = 'Assigned vendor'
let rejectUsage = false
let rejectCatalog = false

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  vi.restoreAllMocks()
  vendorName = 'Assigned vendor'
  rejectUsage = false
  rejectCatalog = false
})

async function loadReport(
  showDistributions = true,
  editVendor = false,
  empty = false
) {
  useAuthStore
    .getState()
    .auth.setUser({ id: 12, username: 'reader', role: editVendor ? 10 : 1 })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], {
    log_max_range_days: 90,
    enable_data_export: false,
  })
  const received: { start_timestamp: number; end_timestamp: number }[] = []
  const vendor = {
    id: 3,
    name: vendorName,
    status: 1,
    created_time: 1,
    updated_time: 1,
    version: 'sample-v1',
  }
  const get = vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url === '/api/vendors/3' && editVendor) {
      return { data: { success: true, data: { ...vendor, name: vendorName } } }
    }
    if (url === '/api/pricing') {
      if (rejectCatalog) throw new Error('catalog is unavailable')
      return {
        data: {
          success: true,
          vendors: [{ id: 3, name: vendorName }],
          data: [{ model_name: 'configured-model', vendor_id: 3 }],
        },
      }
    }
    if (url !== '/api/data/self') throw new Error(`Unexpected request: ${url}`)
    const params = config?.params
    if (
      typeof params !== 'object' ||
      params === null ||
      !('start_timestamp' in params) ||
      typeof params.start_timestamp !== 'number' ||
      !('end_timestamp' in params) ||
      typeof params.end_timestamp !== 'number'
    ) {
      throw new Error('The report must request a numeric time range')
    }
    const range = {
      start_timestamp: params.start_timestamp,
      end_timestamp: params.end_timestamp,
    }
    received.push(range)
    if (rejectUsage) throw new Error('usage is unavailable')
    const quota = range.start_timestamp === 0 ? 1000000 : 500000
    return {
      data: {
        success: true,
        data: empty
          ? []
          : [
              {
                created_at: range.end_timestamp - 1,
                model_name: 'configured-model',
                quota,
                count: 3,
                token_used: 100,
              },
              {
                created_at: range.end_timestamp,
                model_name: 'retired-model',
                quota: 500000,
                count: 2,
                token_used: 50,
              },
            ],
      },
    }
  })
  const root = createRootRoute()
  function ReportPage() {
    const report = useOverviewReport()
    const [open, setOpen] = useState(editVendor)
    return (
      <>
        <UsageTrendPanel
          report={report}
          notices={<aside>Site notices</aside>}
          showDistributions={showDistributions}
        />
        {editVendor && (
          <VendorMutateDialog
            open={open}
            onOpenChange={setOpen}
            currentVendor={vendor}
          />
        )}
      </>
    )
  }
  const report = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: ReportPage,
  })
  const details = createRoute({
    getParentRoute: () => root,
    path: '/pricing/$modelId',
  })
  const dashboard = createRoute({
    getParentRoute: () => root,
    path: '/dashboard/$section',
  })
  const router = createRouter({
    routeTree: root.addChildren([report, details, dashboard]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { get, received }
}

it('still reads recorded spending with data export disabled, sharing one personal query per reporting period', async () => {
  const { received } = await loadReport()
  const ranges = within(
    await screen.findByRole('group', { name: 'Reporting period' })
  )
  expect(ranges.getByRole('button', { name: 'Today' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(
    ranges.getAllByRole('button').map((button) => button.textContent)
  ).toEqual(['Today', '7 Days', '30 days', 'All'])
  const models = within(
    await screen.findByRole('region', { name: 'Model spending share' })
  )
  const vendors = within(
    screen.getByRole('region', { name: 'Vendor spending breakdown' })
  )
  const configured = await models.findByRole('link', {
    name: /configured-model/,
  })
  expect(configured).toHaveAttribute('href', '/pricing/configured-model')
  expect(configured).toHaveTextContent('50%')
  expect(models.queryByRole('link', { name: /retired-model/ })).toBeNull()
  expect(await vendors.findByText('Assigned vendor')).toBeVisible()
  expect(vendors.getByText('Unassigned vendor')).toBeVisible()
  expect(received).toHaveLength(1)
  expect(new Date(received[0].start_timestamp * 1000).getHours()).toBe(0)
  const today = new Date(received[0].start_timestamp * 1000)
  for (const [label, dayOffset] of [
    ['7 Days', 6],
    ['30 days', 29],
  ] as const) {
    await userEvent.click(ranges.getByRole('button', { name: label }))
    const expected = new Date(today)
    expected.setDate(expected.getDate() - dayOffset)
    await waitFor(() =>
      expect(received.at(-1)?.start_timestamp).toBe(expected.getTime() / 1000)
    )
    expect(await screen.findByText('Assigned vendor')).toBeVisible()
  }
  await userEvent.click(ranges.getByRole('button', { name: 'All' }))
  expect(
    await screen.findByRole('heading', {
      name: 'Spending and requests over the available period',
    })
  ).toBeVisible()
  expect(
    await screen.findByRole('link', { name: /configured-model.*67%/ })
  ).toBeVisible()
  expect(received).toHaveLength(4)
  expect(received[3].start_timestamp).toBe(0)
  expect(
    screen.getByRole('link', { name: /View detailed analytics/ })
  ).toHaveAttribute('href', '/dashboard/models')
})

it('reflects a saved rename from the original vendor editor without changing the underlying spending', async () => {
  const put = vi.spyOn(api, 'put').mockImplementation(async (url, values) => {
    if (url !== '/api/vendors/') throw new Error(`Unexpected write: ${url}`)
    vendorName = (values as { name: string }).name
    return {
      data: {
        success: true,
        data: { ...(values as object), name: vendorName },
      },
    }
  })
  await loadReport(true, true)
  const name = await screen.findByLabelText('Vendor Name *')
  await waitFor(() => expect(name).toHaveValue('Assigned vendor'))
  const user = userEvent.setup()
  await user.clear(name)
  await user.type(name, 'Renamed vendor')
  await user.click(screen.getByRole('button', { name: 'Save metadata' }))
  const panel = within(
    await screen.findByRole('region', { name: 'Vendor spending breakdown' })
  )
  expect(await panel.findByText('Renamed vendor')).toBeVisible()
  expect(put).toHaveBeenCalledWith(
    '/api/vendors/',
    expect.objectContaining({
      name: 'Renamed vendor',
      id: 3,
      version: 'sample-v1',
    })
  )
  expect(panel.getByText('3 requests')).toBeVisible()
  expect(screen.queryByText('Assigned vendor')).toBeNull()
})

it('keeps a truthful empty state without model lookups, fabricated bars or placeholder vendors', async () => {
  const { get } = await loadReport(true, false, true)
  const share = within(
    await screen.findByRole('region', { name: 'Model spending share' })
  )
  expect(share.getByText('No data available')).toBeVisible()
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  expect(screen.queryByText('Unassigned vendor')).not.toBeInTheDocument()
  expect(get.mock.calls.some(([url]) => url === '/api/pricing')).toBe(false)
})

it('switches trend metrics and inspects the same bucket with the keyboard without reloading spending', async () => {
  const { received } = await loadReport()
  const user = userEvent.setup()
  const chart = await screen.findByRole('slider', { name: 'Usage trend' })
  await user.click(screen.getByRole('button', { name: 'Requests' }))
  expect(screen.getByRole('button', { name: 'Requests' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  chart.focus()
  await user.keyboard('{End}')
  expect(chart).toHaveAttribute(
    'aria-valuetext',
    expect.stringContaining('Requests 5')
  )
  expect(chart).toHaveAttribute(
    'aria-valuetext',
    expect.stringContaining('Tokens 150')
  )
  const legend = screen.getByRole('link', { name: /configured-model/ })
  legend.focus()
  await user.keyboard('{Enter}')
  await waitFor(() =>
    expect(
      screen.queryByRole('group', { name: 'Reporting period' })
    ).not.toBeInTheDocument()
  )
  expect(received).toHaveLength(1)
})

it('reports catalogue failure without disguising it as missing vendor assignments', async () => {
  rejectCatalog = true
  await loadReport()
  const vendors = within(
    await screen.findByRole('region', { name: 'Vendor spending breakdown' })
  )
  expect(
    await vendors.findByText('Failed to load model metadata')
  ).toBeVisible()
  expect(vendors.queryByText('Unassigned vendor')).toBeNull()
  rejectCatalog = false
  await userEvent.click(vendors.getByRole('button', { name: 'Retry' }))
  expect(await vendors.findByText('Assigned vendor')).toBeVisible()
})

it('does not fetch the model directory or render the distribution panels when switched off', async () => {
  const { get } = await loadReport(false)
  expect(
    await screen.findByRole('heading', {
      name: 'Today’s spending and requests',
    })
  ).toBeVisible()
  expect(
    screen.queryByRole('region', { name: 'Model spending share' })
  ).toBeNull()
  expect(get.mock.calls.some(([url]) => url === '/api/pricing')).toBe(false)
})

it('retries a failed report instead of displaying zero spend or dropping site notices', async () => {
  rejectUsage = true
  await loadReport()
  expect(await screen.findByText('Site notices')).toBeVisible()
  expect(await screen.findByText('Failed to load')).toBeVisible()
  expect(screen.queryByText('No data available')).toBeNull()
  rejectUsage = false
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('Assigned vendor')).toBeVisible()
})

it('keeps the final time label on the thirty-day plot without overlapping adjacent date labels', async () => {
  await loadReport()
  const ranges = within(
    await screen.findByRole('group', { name: 'Reporting period' })
  )
  await userEvent.click(ranges.getByRole('button', { name: '30 days' }))
  const chart = await screen.findByRole('slider', { name: 'Usage trend' })
  const ticks = [...chart.querySelectorAll('text[text-anchor="middle"]')]
  const positions = ticks.map((tick) => Number(tick.getAttribute('x')))
  expect(positions.length).toBeGreaterThan(1)
  for (let index = 1; index < positions.length; index++) {
    expect(positions[index] - positions[index - 1]).toBeGreaterThanOrEqual(60)
  }
  expect(positions.at(-1)).toBeGreaterThan(585)
})
