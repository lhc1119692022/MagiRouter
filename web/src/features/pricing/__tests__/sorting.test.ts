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
import { describe, expect, test } from 'vitest'

import { DEFAULT_CATALOG_SORT, SORT_OPTIONS } from '../constants'
import { sortModels } from '../lib/filters'
import type { PricingModel, PricingVendor } from '../types'

function pricingModel(
  modelName: string,
  overrides: Partial<PricingModel>
): PricingModel {
  return {
    id: 1,
    model_name: modelName,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    ...overrides,
  }
}

const models = [
  pricingModel('legacy-ratio', { model_ratio: 1, completion_ratio: 4 }),
  pricingModel('legacy-per-call', { quota_type: 1, model_price: 0.05 }),
  pricingModel('expr-tokens', {
    billing_mode: 'tiered_expr',
    billing_expr: 'tier("base", p * 1 + c * 10)',
  }),
  pricingModel('expr-long-context', {
    billing_mode: 'tiered_expr',
    billing_expr:
      'len <= 200000 ? tier("standard", p * 3 + c * 15) : tier("long", p * 6 + c * 22.5)',
  }),
  pricingModel('expr-input-only', {
    billing_mode: 'tiered_expr',
    billing_expr: 'tier("base", p * 0.1)',
  }),
  pricingModel('expr-fixed', {
    billing_mode: 'tiered_expr',
    billing_expr: 'tier("request", fixed(0.02))',
  }),
  pricingModel('expr-task', {
    billing_mode: 'tiered_expr',
    billing_expr: 'tier("base", u("seconds") * 0.1)',
    billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
    billing_usage_examples: [{ label: '5s', facts: { seconds: 5 } }],
  }),
]

describe('price sorting', () => {
  test.each([
    [
      SORT_OPTIONS.INPUT_PRICE_LOW,
      [
        'expr-input-only',
        'expr-tokens',
        'legacy-ratio',
        'expr-long-context',
        'legacy-per-call',
        'expr-fixed',
        'expr-task',
      ],
    ],
    [
      SORT_OPTIONS.INPUT_PRICE_HIGH,
      [
        'expr-long-context',
        'legacy-ratio',
        'expr-tokens',
        'expr-input-only',
        'legacy-per-call',
        'expr-fixed',
        'expr-task',
      ],
    ],
    [
      SORT_OPTIONS.OUTPUT_PRICE_LOW,
      [
        'legacy-ratio',
        'expr-tokens',
        'expr-long-context',
        'legacy-per-call',
        'expr-input-only',
        'expr-fixed',
        'expr-task',
      ],
    ],
    [
      SORT_OPTIONS.REQUEST_PRICE_HIGH,
      [
        'expr-task',
        'legacy-per-call',
        'expr-fixed',
        'legacy-ratio',
        'expr-tokens',
        'expr-long-context',
        'expr-input-only',
      ],
    ],
  ])(
    '%s compares base prices across legacy and expression billing and keeps unpriced models last',
    (sortBy, expected) => {
      expect(sortModels(models, sortBy).map((m) => m.model_name)).toEqual(
        expected
      )
    }
  )
})

test('sorts a plugin model by the token price its ordinary requests pay', () => {
  // Ratio 0.25 is $0.5 / 1M input tokens; the plugin has no price.
  const dualUse = pricingModel('dual-use', {
    model_ratio: 0.25,
    completion_ratio: 4,
    billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
    ordinary_pricing: true,
    billing_plugin_variants: [
      {
        plugin_key: 'alpha',
        plugin_name: 'Alpha',
        billing_mode: 'tiered_expr',
        billing_expr: '',
        billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
      },
    ],
  })
  expect(
    sortModels([...models, dualUse], SORT_OPTIONS.INPUT_PRICE_LOW).map(
      (m) => m.model_name
    )
  ).toEqual([
    'expr-input-only',
    'dual-use',
    'expr-tokens',
    'legacy-ratio',
    'expr-long-context',
    'legacy-per-call',
    'expr-fixed',
    'expr-task',
  ])
})

describe('catalog sorting (time, unified price, name)', () => {
  const catalogModels: PricingModel[] = [
    pricingModel('beta-model', {
      id: 2,
      created_time: 1000,
      model_ratio: 5,
      enable_groups: ['pro', 'std'],
      group_ratio: { pro: 0.25, std: 1 },
    }),
    pricingModel('alpha-model', {
      id: 1,
      created_time: 3000,
      quota_type: 1,
      model_price: 0.04,
      enable_groups: ['pro'],
      group_ratio: { pro: 0.25, std: 1 },
    }),
    pricingModel('gamma-model', {
      id: 3,
      created_time: 2000,
      billing_mode: 'tiered_expr',
      billing_expr:
        'len < 1000 ? tier("call", fixed(0.02)) : tier("tokens", p * 10 + c * 30)',
      enable_groups: ['std'],
      group_ratio: { pro: 0.25, std: 1 },
    }),
    pricingModel('unpriced-model', {
      id: 4,
      created_time: 2000,
      price_unconfigured: true,
      enable_groups: ['std'],
      group_ratio: { pro: 0.25, std: 1 },
    }),
  ]

  test('sorts by created_time descending (newest first) with id tie-break, and ascending (oldest first)', () => {
    expect(
      sortModels(catalogModels, SORT_OPTIONS.TIME_DESC).map(
        (item) => item.model_name
      )
    ).toEqual(['alpha-model', 'unpriced-model', 'gamma-model', 'beta-model'])

    expect(
      sortModels(catalogModels, SORT_OPTIONS.TIME_ASC).map(
        (item) => item.model_name
      )
    ).toEqual(['beta-model', 'gamma-model', 'unpriced-model', 'alpha-model'])
  })

  test('sorts by unified effective card price ascending and descending while keeping unpriced models last', () => {
    // Your-price effective prices: alpha = 0.04 * 0.25 = 0.01, gamma = 0.02 * 1 = 0.02, beta = 10 * 0.25 = 2.5
    expect(
      sortModels(catalogModels, SORT_OPTIONS.PRICE_ASC, {
        priceMode: 'yours',
      }).map((item) => item.model_name)
    ).toEqual(['alpha-model', 'gamma-model', 'beta-model', 'unpriced-model'])

    expect(
      sortModels(catalogModels, SORT_OPTIONS.PRICE_DESC, {
        priceMode: 'yours',
      }).map((item) => item.model_name)
    ).toEqual(['beta-model', 'gamma-model', 'alpha-model', 'unpriced-model'])

    // Official-price 1x prices: gamma = 0.02, alpha = 0.04, beta = 10
    expect(
      sortModels(catalogModels, SORT_OPTIONS.PRICE_ASC, {
        priceMode: 'official',
      }).map((item) => item.model_name)
    ).toEqual(['gamma-model', 'alpha-model', 'beta-model', 'unpriced-model'])
  })

  test('sorts by name ascending and descending', () => {
    expect(
      sortModels(catalogModels, SORT_OPTIONS.NAME).map(
        (item) => item.model_name
      )
    ).toEqual(['alpha-model', 'beta-model', 'gamma-model', 'unpriced-model'])

    expect(
      sortModels(catalogModels, SORT_OPTIONS.NAME_DESC).map(
        (item) => item.model_name
      )
    ).toEqual(['unpriced-model', 'gamma-model', 'beta-model', 'alpha-model'])
  })

  test('uses manufacturer sort as default, following vendor filter order with model names descending per vendor', () => {
    expect(DEFAULT_CATALOG_SORT).toBe(SORT_OPTIONS.VENDOR)

    const orderedVendors: PricingVendor[] = [
      { id: 10, name: 'Anthropic' },
      { id: 20, name: 'OpenAI' },
      { id: 30, name: 'Google' },
    ]
    const vendorModels: PricingModel[] = [
      pricingModel('gpt-5.4', { vendor_id: 20, vendor_name: 'OpenAI' }),
      pricingModel('gemini-3-pro', { vendor_id: 30, vendor_name: 'Google' }),
      pricingModel('claude-4-sonnet', {
        vendor_id: 10,
        vendor_name: 'Anthropic',
      }),
      pricingModel('gpt-6.2-sol', { vendor_id: 20, vendor_name: 'OpenAI' }),
      pricingModel('claude-5-opus', {
        vendor_id: 10,
        vendor_name: 'Anthropic',
      }),
      pricingModel('gemini-4-neon', { vendor_id: 30, vendor_name: 'Google' }),
      pricingModel('zeta-unlisted', { vendor_name: 'Zeta' }),
      pricingModel('alpha-unlisted', { vendor_name: 'Zeta' }),
      pricingModel('orphan-a'),
      pricingModel('orphan-z'),
    ]

    expect(
      sortModels(vendorModels, SORT_OPTIONS.VENDOR, {
        vendors: orderedVendors,
      }).map((item) => item.model_name)
    ).toEqual([
      'claude-5-opus',
      'claude-4-sonnet',
      'gpt-6.2-sol',
      'gpt-5.4',
      'gemini-4-neon',
      'gemini-3-pro',
      'zeta-unlisted',
      'alpha-unlisted',
      'orphan-z',
      'orphan-a',
    ])
  })
})
