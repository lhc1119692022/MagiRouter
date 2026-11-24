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
import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { aggregateModelShare, shareBarWidth } from '../model-share'

describe('model share aggregation', () => {
  test('sums quota per model and ranks the largest consumers first', () => {
    const shares = aggregateModelShare(
      [
        { created_at: 0, model_name: 'gpt-4o', quota: 60 },
        { created_at: 0, model_name: 'gpt-4o', quota: 40 },
        { created_at: 0, model_name: 'claude', quota: 100 },
      ],
      5
    )

    assert.deepEqual(
      shares.map((item) => item.model),
      ['claude', 'gpt-4o']
    )
    assert.equal(shares[0].share, 0.5)
    assert.equal(shares[1].quota, 100)
  })

  test('drops unattributed rows instead of inventing a placeholder model', () => {
    const shares = aggregateModelShare(
      [
        { created_at: 0, model_name: '', quota: 900 },
        { created_at: 0, model_name: 'gpt-4o', quota: 100 },
      ],
      5
    )

    assert.deepEqual(
      shares.map((item) => item.model),
      ['gpt-4o']
    )
    assert.equal(shares[0].share, 1)
  })

  test('respects the limit and returns nothing when no quota was spent', () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      created_at: 0,
      model_name: `model-${index}`,
      quota: 10 - index,
    }))

    assert.equal(aggregateModelShare(rows, 3).length, 3)
    assert.deepEqual(
      aggregateModelShare([{ created_at: 0, model_name: 'idle', quota: 0 }], 5),
      []
    )
  })
})

describe('model share bar width', () => {
  test('keeps a visible sliver for tiny shares and clamps to the track', () => {
    assert.equal(shareBarWidth(0.0001), '2.0%')
    assert.equal(shareBarWidth(0.42), '42.0%')
    assert.equal(shareBarWidth(1.5), '100.0%')
    assert.equal(shareBarWidth(0), '0%')
  })
})
