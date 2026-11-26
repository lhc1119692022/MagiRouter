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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { ModelDetailsContent } from '../components/model-details'
import type { PricingModel } from '../types'

vi.mock('../components/model-details-performance', () => ({
  ModelDetailsPerformance: (props: { mode?: string }) => (
    <div data-testid='mock-trends' data-mode={props.mode ?? 'full'}>
      Mock Trends
    </div>
  ),
}))

let client: QueryClient

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
  })
})

afterEach(() => {
  client.clear()
  useSystemConfigStore
    .getState()
    .setConfig({ currency: DEFAULT_CURRENCY_CONFIG })
})

function seedMonitoring(modelName: string) {
  const windowStart = 1789387200
  client.setQueryData(['perf-metrics', modelName, undefined, undefined], {
    model_name: modelName,
    summary: {
      success_rate: 99.6,
      avg_latency_ms: 1250,
      avg_tps: 68.4,
      cache_hit_rate: 42.5,
    },
    series: [
      {
        ts: windowStart,
        avg_ttft_ms: 320,
        avg_latency_ms: 1250,
        success_rate: 99.6,
        avg_tps: 68.4,
        cache_hit_rate: 42.5,
      },
    ],
    window_start: windowStart,
    window_end: windowStart + 3600,
    groups: [
      {
        group: 'vip',
        success_rate: 99.8,
        avg_latency_ms: 980,
        avg_ttft_ms: 240,
        avg_tps: 84.2,
        cache_hit_rate: 51.3,
        series: [
          {
            ts: windowStart,
            avg_ttft_ms: 240,
            avg_latency_ms: 980,
            success_rate: 99.8,
            avg_tps: 84.2,
            cache_hit_rate: 51.3,
          },
        ],
      },
      {
        group: 'default',
        success_rate: 98.5,
        avg_latency_ms: 1620,
        avg_ttft_ms: 410,
        avg_tps: 52.1,
        cache_hit_rate: null,
        series: [],
      },
    ],
  })
}

describe('ModelDetailsContent redesigned 2-panel drawer', () => {
  it('renders 2 top tabs, first-glance specs, protocol-aware calling docs button, and fused group metrics', async () => {
    const onOpenDocs = vi.fn()
    const model: PricingModel = {
      id: 1,
      model_name: 'claude-opus-4-6',
      vendor_name: 'Anthropic',
      quota_type: 0,
      model_ratio: 2.5,
      completion_ratio: 5,
      cache_ratio: 0.1,
      context_length: 200_000,
      max_output_tokens: 32_000,
      input_modalities: ['text', 'image'],
      output_modalities: ['text'],
      supported_endpoint_types: ['anthropic', 'openai'],
      enable_groups: ['vip', 'default'],
      group_ratio: { vip: 0.5, default: 1 },
    }
    seedMonitoring(model.model_name)

    render(
      <QueryClientProvider client={client}>
        <ModelDetailsContent
          model={model}
          groupRatio={{ vip: 0.5, default: 1 }}
          usableGroup={{
            vip: { desc: 'VIP', ratio: 0.5 },
            default: { desc: 'Default', ratio: 1 },
          }}
          endpointMap={{}}
          autoGroups={[]}
          priceRate={1}
          usdExchangeRate={1}
          tokenUnit='M'
          onOpenDocs={onOpenDocs}
        />
      </QueryClientProvider>
    )

    // Exactly 2 top-level panels: Pricing & Performance + API & Docs
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(
      screen.getByRole('tab', { name: 'Pricing & Performance' })
    ).toBeVisible()
    expect(screen.getByRole('tab', { name: 'API & Docs' })).toBeVisible()

    // First-glance specs & direct calling docs button in header
    const header = screen.getByRole('banner')
    expect(within(header).getByText('200K')).toBeVisible()
    expect(within(header).getByText('32K')).toBeVisible()
    const docsLink = within(header).getByRole('link', { name: /Calling docs/ })
    expect(docsLink).toHaveAttribute('href', '/docs?doc=proto-anthropic')

    const user = userEvent.setup()
    await user.click(docsLink)
    expect(onOpenDocs).toHaveBeenCalledWith('proto-anthropic')

    // Summary strip shows all 4 metrics including cache hit rate
    expect(screen.getByText('42.5%')).toBeVisible()
    expect(screen.getByText('68.4 t/s')).toBeVisible()

    // Per-group fused cards show prices AND throughput, latency/TTFT, cache hit rate, availability
    expect(screen.getByText('99.80%')).toBeVisible()
    expect(screen.getByText('84.2 t/s')).toBeVisible()
    expect(screen.getByText('51.3%')).toBeVisible()
    expect(screen.getByText(/980ms/)).toBeVisible()
    expect(screen.getByText(/TTFT 240ms/)).toBeVisible()
    expect(screen.getByText('98.50%')).toBeVisible()
    expect(screen.getByText('52.1 t/s')).toBeVisible()
    expect(screen.getByText('$2.5')).toBeVisible()
    expect(screen.getByText('$12.5')).toBeVisible()

    // Official base pricing card and cache price display are explicitly visible
    expect(screen.getByText('Official base pricing')).toBeVisible()
    expect(
      screen.getByText('Reference rate before group multiplier')
    ).toBeVisible()
    expect(screen.getAllByText('Cache').length).toBeGreaterThanOrEqual(2)

    // Availability in group cards uses 24-slot mini status blocks + percentage
    const sampledBar = screen.getByRole('img', {
      name: 'Sampled request success rates',
    })
    expect(sampledBar.querySelectorAll('[data-state]')).toHaveLength(24)
    expect(
      sampledBar.querySelectorAll('[data-state="ok"]').length
    ).toBeGreaterThan(0)
    const emptyBar = screen.getByRole('img', { name: 'Not monitored' })
    expect(emptyBar.querySelectorAll('[data-state="empty"]')).toHaveLength(24)

    // Local toggle switches between Group routes and 24h trends
    await user.click(screen.getByRole('button', { name: '24h trends' }))
    expect(screen.getByTestId('mock-trends')).toHaveAttribute(
      'data-mode',
      'trends'
    )
    await user.click(screen.getByRole('button', { name: 'Group routes' }))
    expect(screen.queryByTestId('mock-trends')).not.toBeInTheDocument()
  })

  it('deduplicates tiered pricing, trims 4-decimal trailing zeros, and rescales via group pills', async () => {
    const model: PricingModel = {
      id: 2,
      model_name: 'gpt-5.4',
      vendor_name: 'OpenAI',
      quota_type: 0,
      model_ratio: 2,
      completion_ratio: 4,
      billing_mode: 'tiered_expr',
      billing_expr:
        'len < 128000 ? tier("std", p * 4 + cr * 0.4 + cc * 5 + c * 16) : tier("long", p * 8 + cr * 0.8 + cc * 10 + c * 32)',
      supported_endpoint_types: ['openai-response'],
      enable_groups: ['vip', 'default'],
      group_ratio: { vip: 0.5, default: 2 },
    }
    seedMonitoring(model.model_name)

    render(
      <QueryClientProvider client={client}>
        <ModelDetailsContent
          model={model}
          groupRatio={{ vip: 0.5, default: 2 }}
          usableGroup={{
            vip: { desc: 'VIP', ratio: 0.5 },
            default: { desc: 'Default', ratio: 2 },
          }}
          endpointMap={{}}
          autoGroups={[]}
          priceRate={1}
          usdExchangeRate={1}
          tokenUnit='M'
        />
      </QueryClientProvider>
    )

    expect(screen.getByRole('link', { name: /Calling docs/ })).toHaveAttribute(
      'href',
      '/docs?doc=proto-responses'
    )

    // No redundant "Dynamic Pricing" header or 4-decimal trailing zeros
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).queryByText('Dynamic Pricing')).not.toBeInTheDocument()
    expect(
      within(panel).queryByText('Tiered price table')
    ).not.toBeInTheDocument()
    expect(within(panel).queryByText(/\.0000/)).not.toBeInTheDocument()

    // Official base pricing is listed separately and explicitly
    expect(within(panel).getByText('Official base pricing')).toBeVisible()
    expect(
      within(panel).getByText('Reference rate before group multiplier')
    ).toBeVisible()

    // Tier table clearly annotates actual usage price for the selected group
    expect(
      within(panel).getByText('Actual usage price for selected group')
    ).toBeVisible()
    expect(within(panel).getByText('Base × 0.5')).toBeVisible()

    // Group cards below include cache pricing (Cached input + Cache write) for dynamic usage-based models
    expect(within(panel).getAllByText('$0.2').length).toBeGreaterThan(0)
    expect(within(panel).getAllByText('$2.5').length).toBeGreaterThan(0)
    expect(within(panel).getAllByText('$0.8').length).toBeGreaterThan(0)
    expect(within(panel).getAllByText('$10').length).toBeGreaterThan(0)

    // Single tier table defaults to first group (vip · 0.5x): $4*0.5=$2, $16*0.5=$8, $8*0.5=$4, $32*0.5=$16
    const table = screen.getByRole('table')
    expect(within(table).getByText('$2')).toBeVisible()
    expect(within(table).getByText('$16')).toBeVisible()

    // Switch to Official Base (1x) via explicit button
    const user = userEvent.setup()
    const baseButton = screen.getByRole('button', { name: /Official Base/ })
    await user.click(baseButton)
    expect(baseButton).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(panel).getByText('Showing official base pricing (1x)')
    ).toBeVisible()
    expect(within(table).getByText('$4')).toBeVisible()
    expect(within(table).getByText('$32')).toBeVisible()

    // Switch to default (2x) via explicit button
    const defaultButton = screen.getByRole('button', { name: /default.*2x/ })
    await user.click(defaultButton)
    expect(defaultButton).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(panel).getByText('Actual usage price for selected group')
    ).toBeVisible()
    expect(within(panel).getByText('Base × 2')).toBeVisible()
    expect(within(table).getByText('$8')).toBeVisible()
    expect(within(table).getByText('$64')).toBeVisible()
  })
})
