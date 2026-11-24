import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { formatTimestampToDate } from '@/lib/format'

import { ModelDetailsApi } from '../components/model-details-api'
import { ZmModelCardGrid } from '../components/zm-model-card-grid'
import type { PricingModel } from '../types'

vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}))

const start = Date.parse('2026-01-01T00:00:00Z') / 1000
const end = start + 23 * 3600 + 1800
const models: PricingModel[] = ['sampled', 'failed', 'idle'].map(
  (name, index) => ({
    id: index + 1,
    model_name: name,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['shared', 'premium'],
  })
)

let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(() => {
  client.clear()
  vi.restoreAllMocks()
})

function renderCatalog() {
  render(
    <QueryClientProvider client={client}>
      <ZmModelCardGrid
        models={models}
        onModelClick={vi.fn()}
        selectedGroup='premium'
      />
    </QueryClientProvider>
  )
}

it('displays only fixed-window observations for the matching model and identifies the visible-group scope even when a price group is selected', async () => {
  const request = vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        window_start: start,
        window_end: end,
        models: [
          {
            model_name: 'sampled',
            success_rate: 0.5,
            recent_success_series: [
              { ts: start - 3600, success_rate: 100 },
              { ts: start, success_rate: 0.5 },
              { ts: end + 3600, success_rate: 100 },
            ],
          },
          {
            model_name: 'failed',
            success_rate: 0,
            recent_success_series: [{ ts: start, success_rate: 0 }],
          },
        ],
        recent_success_series: {
          idle: [{ ts: start - 3 * 86400, success_rate: 100 }],
        },
      },
    },
  })
  renderCatalog()
  const [sampled, failed, idle] = screen.getAllByRole('article')
  expect(await within(sampled).findByText('0.50%')).toBeVisible()
  expect(within(sampled).getByText('All visible groups')).toBeVisible()
  expect(
    within(sampled).getByTitle(
      (label) =>
        label.includes(formatTimestampToDate(start)) &&
        label.includes(formatTimestampToDate(end))
    )
  ).toBeVisible()
  const sampledTicks = [
    ...within(sampled).getByRole('img', {
      name: 'Sampled request success rates',
    }).children,
  ]
  expect(sampledTicks).toHaveLength(24)
  expect(
    sampledTicks.filter((tick) => tick.getAttribute('data-state') === 'err')
  ).toHaveLength(1)
  expect(
    sampledTicks.filter((tick) => tick.getAttribute('data-state') === 'empty')
  ).toHaveLength(23)
  expect(sampledTicks[0]).toHaveAttribute(
    'title',
    `${formatTimestampToDate(start)} · 0.50%`
  )
  expect(sampledTicks[1]).not.toHaveAttribute('title')

  expect(within(failed).getByText('0.00%')).toBeVisible()
  expect(within(idle).getByText('Not monitored')).toBeVisible()
  expect(
    within(idle).queryByRole('img', { name: 'Sampled request success rates' })
  ).toBeNull()
  const idleTicks = [...idle.querySelectorAll('.zm-uptime-tick')]
  expect(idleTicks).toHaveLength(24)
  expect(
    idleTicks.every((tick) => tick.getAttribute('data-state') === 'empty')
  ).toBe(true)

  expect(request).toHaveBeenCalledWith('/api/perf-metrics/summary', {
    params: { hours: 24, recent_model: undefined },
    paramsSerializer: { indexes: null },
  })
})

it('reports a metrics failure without showing uptime, dates or sample bars', async () => {
  vi.spyOn(api, 'get').mockRejectedValue(new Error('unavailable'))
  renderCatalog()
  expect(await screen.findAllByText('Monitoring unavailable')).toHaveLength(3)
  expect(screen.queryByText(/%/)).toBeNull()
  expect(
    screen.queryByRole('img', { name: 'Sampled request success rates' })
  ).toBeNull()
  const cards = screen.getAllByRole('article')
  for (const card of cards) {
    const ticks = [...card.querySelectorAll('.zm-uptime-tick')]
    expect(ticks).toHaveLength(24)
    expect(
      ticks.every((tick) => tick.getAttribute('data-state') === 'empty')
    ).toBe(true)
  }
})

it('places healthy, warning and critical hourly samples at their window offsets while keeping unsampled hours gray', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        window_start: start,
        window_end: end,
        models: [
          {
            model_name: 'sampled',
            success_rate: 88.5,
            recent_success_series: [
              { ts: start + 2 * 3600, success_rate: 100 },
              { ts: start + 10 * 3600, success_rate: 80 },
              { ts: start + 23 * 3600, success_rate: 50 },
            ],
          },
        ],
      },
    },
  })
  renderCatalog()
  const [sampled] = screen.getAllByRole('article')
  expect(await within(sampled).findByText('88.50%')).toBeVisible()
  const ticks = [
    ...within(sampled).getByRole('img', {
      name: 'Sampled request success rates',
    }).children,
  ]
  expect(ticks).toHaveLength(24)
  expect(ticks[0]).toHaveAttribute('data-state', 'empty')
  expect(ticks[2]).toHaveAttribute('data-state', 'ok')
  expect(ticks[2]).toHaveClass('is-ok')
  expect(ticks[10]).toHaveAttribute('data-state', 'warn')
  expect(ticks[10]).toHaveClass('is-warn')
  expect(ticks[23]).toHaveAttribute('data-state', 'err')
  expect(ticks[23]).toHaveClass('is-err')
  expect(
    ticks.filter((tick) => tick.getAttribute('data-state') === 'empty')
  ).toHaveLength(21)
})

it('does not invent per-group request and token limits when the catalog has not published any', () => {
  client.setQueryData(['status'], {})
  render(
    <QueryClientProvider client={client}>
      <ModelDetailsApi model={models[0]} endpointMap={{}} />
    </QueryClientProvider>
  )
  expect(screen.getByText('Authentication')).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Rate limits' })).toBeNull()
  expect(screen.queryByRole('columnheader', { name: 'RPM' })).toBeNull()
})
