import { describe, expect, it } from 'vitest'

import {
  parsePricingFilterOrderConfig,
  serializePricingFilterOrderConfig,
  sortCatalogVendors,
} from '../lib/filter-order-config'
import { getCatalogFacets } from '../lib/filters'
import type { PricingModel, PricingVendor } from '../types'

describe('pricing filter order config', () => {
  it('sorts vendors alphabetically by default and applies manual overrides first', () => {
    const vendors: PricingVendor[] = [
      { id: 1, name: 'Google' },
      { id: 2, name: 'Anthropic' },
      { id: 3, name: 'OpenAI' },
      { id: 4, name: 'DeepSeek' },
    ]

    expect(sortCatalogVendors(vendors).map((v) => v.name)).toEqual([
      'Anthropic',
      'DeepSeek',
      'Google',
      'OpenAI',
    ])

    expect(
      sortCatalogVendors(vendors, ['OpenAI', 'Google']).map((v) => v.name)
    ).toEqual(['OpenAI', 'Google', 'Anthropic', 'DeepSeek'])
  })

  it('applies manual order to groups, capabilities, and quota types while keeping defaults for remaining items', () => {
    const vendors: PricingVendor[] = [
      { id: 1, name: 'Anthropic' },
      { id: 2, name: 'Google' },
    ]
    const models: PricingModel[] = [
      {
        id: 1,
        model_name: 'claude-opus',
        vendor_id: 1,
        vendor_name: 'Anthropic',
        enable_groups: ['Claude Cursor', '「限时」特惠'],
        quota_type: 0,
        model_ratio: 1,
        completion_ratio: 1,
        supported_endpoint_types: ['anthropic'],
      },
      {
        id: 2,
        model_name: 'gemini-image',
        vendor_id: 2,
        vendor_name: 'Google',
        enable_groups: ['Gemini Ultra'],
        quota_type: 1,
        model_ratio: 1,
        completion_ratio: 1,
        model_price: 0.1,
        supported_endpoint_types: ['image-generation'],
      },
    ]

    const filterOrder = parsePricingFilterOrderConfig(
      JSON.stringify({
        vendors: ['Google', 'Anthropic'],
        groups: ['「限时」特惠', 'Gemini Ultra'],
        capabilities: ['image', 'text'],
        quota_types: ['request', 'token'],
      })
    )

    const facets = getCatalogFacets(
      models,
      { 'Claude Cursor': {}, 'Gemini Ultra': {}, '「限时」特惠': {} },
      {
        groupRatio: {
          'Claude Cursor': 0.5,
          'Gemini Ultra': 0.45,
          '「限时」特惠': 0.025,
        },
        vendors: sortCatalogVendors(vendors, filterOrder.vendors),
        filterOrder,
      }
    )

    expect(facets.groups).toEqual([
      '「限时」特惠',
      'Gemini Ultra',
      'Claude Cursor',
    ])
    expect(facets.categories).toEqual(['image', 'text'])
    expect(facets.quotaTypes).toEqual(['request', 'token'])
    expect(JSON.parse(serializePricingFilterOrderConfig(filterOrder))).toEqual({
      vendors: ['Google', 'Anthropic'],
      groups: ['「限时」特惠', 'Gemini Ultra'],
      capabilities: ['image', 'text'],
      quota_types: ['request', 'token'],
    })
  })
})
