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

  it('keeps group primary prices aligned on the group header row and places cache prices on a separate row without nested border boxes', () => {
    const model: PricingModel = {
      id: 3,
      model_name: 'kimi-k3.1-pro',
      vendor_name: 'Moonshot AI',
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 5,
      billing_mode: 'tiered_expr',
      billing_expr:
        'tier("base", p * 2 + c * 10 + cr * 0.2 + cc * 2 + cc1h * 4)',
      supported_endpoint_types: ['openai'],
      enable_groups: ['kimi-promo'],
      group_ratio: { 'kimi-promo': 0.09 },
    }

    render(
      <QueryClientProvider client={client}>
        <ModelDetailsContent
          model={model}
          groupRatio={{ 'kimi-promo': 0.09 }}
          usableGroup={{
            'kimi-promo': { desc: 'Kimi Promo', ratio: 0.09 },
          }}
          endpointMap={{}}
          autoGroups={[]}
          priceRate={1}
          usdExchangeRate={1}
          tokenUnit='M'
        />
      </QueryClientProvider>
    )

    const panel = screen.getByRole('tabpanel')
    const pricingSection = within(panel)
      .getByText('Pricing & Routes')
      .closest('section')
    expect(pricingSection).not.toBeNull()
    expect(pricingSection).not.toHaveClass('border')

    const ratioBadge = within(panel).getByText('0.09x')
    const headerRow = ratioBadge.parentElement?.parentElement
    expect(headerRow).not.toBeNull()
    expect(within(headerRow as HTMLElement).getByText('$0.18')).toBeVisible()
    expect(within(headerRow as HTMLElement).getByText('$0.9')).toBeVisible()
    expect(
      within(headerRow as HTMLElement).queryByText('$0.018')
    ).not.toBeInTheDocument()

    const groupCard = headerRow?.parentElement
    expect(groupCard).not.toBeNull()
    expect(within(groupCard as HTMLElement).getByText('$0.018')).toBeVisible()
    expect(within(groupCard as HTMLElement).getByText('$0.36')).toBeVisible()

    const availabilityRow = within(groupCard as HTMLElement).getByText(
      'Availability'
    ).parentElement?.parentElement
    expect(availabilityRow).not.toHaveClass('border')
    expect(availabilityRow).toHaveClass('border-t')
  })

  it('avoids red for degraded available groups, reserves red for 0% unavailability, and displays insufficient throughput samples', () => {
    const windowStart = 1789387200
    const model: PricingModel = {
      id: 4,
      model_name: 'claude-sonnet-5-5',
      vendor_name: 'Anthropic',
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 5,
      supported_endpoint_types: ['anthropic'],
      enable_groups: ['claude-aws', 'claude-down'],
      group_ratio: { 'claude-aws': 0.55, 'claude-down': 1 },
    }
    client.setQueryData(
      ['perf-metrics', model.model_name, undefined, undefined],
      {
        model_name: model.model_name,
        summary: {
          success_rate: 60,
          avg_latency_ms: 9460,
          avg_tps: 0,
          tps_insufficient: true,
          cache_hit_rate: 0,
        },
        series: [],
        window_start: windowStart,
        window_end: windowStart + 23 * 3600,
        groups: [
          {
            group: 'claude-aws',
            success_rate: 60,
            avg_latency_ms: 9460,
            avg_ttft_ms: 6770,
            avg_tps: 0,
            tps_insufficient: true,
            cache_hit_rate: 0,
            series: [
              {
                ts: windowStart,
                avg_ttft_ms: 6770,
                avg_latency_ms: 9460,
                success_rate: 100,
                avg_tps: 0,
              },
              {
                ts: windowStart + 3600,
                avg_ttft_ms: 0,
                avg_latency_ms: 9460,
                success_rate: 0,
                avg_tps: 0,
              },
            ],
          },
          {
            group: 'claude-down',
            success_rate: 0,
            avg_latency_ms: 2000,
            avg_ttft_ms: 0,
            avg_tps: 0,
            tps_insufficient: true,
            cache_hit_rate: null,
            series: [
              {
                ts: windowStart,
                avg_ttft_ms: 0,
                avg_latency_ms: 2000,
                success_rate: 0,
                avg_tps: 0,
              },
            ],
          },
        ],
      }
    )

    render(
      <QueryClientProvider client={client}>
        <ModelDetailsContent
          model={model}
          groupRatio={{ 'claude-aws': 0.55, 'claude-down': 1 }}
          usableGroup={{
            'claude-aws': { desc: 'Claude AWS', ratio: 0.55 },
            'claude-down': { desc: 'Claude Down', ratio: 1 },
          }}
          endpointMap={{}}
          autoGroups={[]}
          priceRate={1}
          usdExchangeRate={1}
          tokenUnit='M'
        />
      </QueryClientProvider>
    )

    const insufficientLabels = screen.getAllByText('Insufficient samples')
    expect(insufficientLabels.length).toBeGreaterThanOrEqual(3)

    const degradedRateLabels = screen.getAllByText('60.00%')
    for (const label of degradedRateLabels) {
      expect(label).toHaveClass('text-amber-600')
      expect(label).not.toHaveClass('text-red-600')
    }

    const unavailableRateLabel = screen.getByText('0.00%')
    expect(unavailableRateLabel).toHaveClass('text-red-600')

    const bars = screen.getAllByRole('img', {
      name: 'Sampled request success rates',
    })
    expect(bars).toHaveLength(2)
    expect(bars[0].querySelectorAll('[data-state="warn"]')).toHaveLength(1)
    expect(bars[0].querySelectorAll('[data-state="err"]')).toHaveLength(0)
    expect(bars[1].querySelectorAll('[data-state="err"]')).toHaveLength(1)
  })

  it('renders each group with its own billing mode and price without global override chrome', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const model: PricingModel = {
      id: 99,
      model_name: 'gpt-image-2.6-sunburst',
      vendor_name: 'OpenAI',
      quota_type: 0,
      model_ratio: 0,
      completion_ratio: 1,
      billing_mode: 'tiered_expr',
      billing_expr: 'tier("standard", p * 5 + c * 30)',
      group_billing_exprs: {
        percall: 'tier("image", fixed(0.08)) * image_count',
      },
      enable_groups: ['default', 'percall'],
    }

    render(
      <QueryClientProvider client={client}>
        <ModelDetailsContent
          model={model}
          groupRatio={{ default: 1, percall: 1.5 }}
          usableGroup={{
            default: { desc: 'Token group', ratio: 1 },
            percall: { desc: 'Per-image group', ratio: 1.5 },
          }}
          endpointMap={{}}
          autoGroups={[]}
          priceRate={1}
          usdExchangeRate={1}
          tokenUnit='M'
        />
      </QueryClientProvider>
    )

    expect(screen.queryByText('Official Base')).not.toBeInTheDocument()
    expect(screen.queryByText('Official base pricing')).not.toBeInTheDocument()
    expect(screen.getByText('default')).toBeInTheDocument()
    expect(screen.getByText('percall')).toBeInTheDocument()
    expect(screen.getByText('$5')).toBeInTheDocument()
    expect(screen.getByText('$30')).toBeInTheDocument()
    expect(screen.getByText('$0.12')).toBeInTheDocument()
  })
})
