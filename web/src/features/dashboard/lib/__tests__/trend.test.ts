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

import { bucketTrend, layoutBars, peakValue } from '../trend'

describe('usage trend buckets', () => {
  test('folds rows into the bucket that contains their timestamp', () => {
    const buckets = bucketTrend(
      [
        { created_at: 1000, quota: 5, count: 1, token_used: 10 },
        { created_at: 1999, quota: 7, count: 2, token_used: 20 },
        { created_at: 2500, quota: 3, count: 1, token_used: 4 },
      ],
      1000,
      3000,
      2
    )

    assert.equal(buckets.length, 2)
    assert.deepEqual(
      buckets.map((bucket) => bucket.quota),
      [12, 3]
    )
    assert.deepEqual(
      buckets.map((bucket) => bucket.count),
      [3, 1]
    )
    assert.deepEqual(
      buckets.map((bucket) => bucket.token),
      [30, 4]
    )
  })

  test('clamps rows outside the window into the first and last bucket', () => {
    const buckets = bucketTrend(
      [
        { created_at: 10, quota: 1 },
        { created_at: 99_999, quota: 2 },
      ],
      1000,
      3000,
      4
    )

    assert.equal(buckets[0].quota, 1)
    assert.equal(buckets[3].quota, 2)
  })

  test('keeps the scale usable when every bucket is empty', () => {
    const buckets = bucketTrend([], 1000, 3000, 3)

    assert.equal(peakValue(buckets, 'quota'), 1)
    assert.deepEqual(
      layoutBars(buckets, 'quota', {
        left: 0,
        top: 0,
        width: 300,
        height: 100,
      }).map((bar) => bar.height),
      [0, 0, 0]
    )
  })

  test('gives every bar a full-height hit target inside its slot', () => {
    const buckets = bucketTrend(
      [{ created_at: 2000, quota: 10 }],
      1000,
      3000,
      2
    )
    const bars = layoutBars(buckets, 'quota', {
      left: 10,
      top: 0,
      width: 200,
      height: 100,
    })

    assert.deepEqual(
      bars.map((bar) => [bar.hitX, bar.hitWidth]),
      [
        [10, 100],
        [110, 100],
      ]
    )
    // The populated bucket reaches the top of the plot; the empty one has none.
    assert.equal(bars[0].height, 0)
    assert.equal(bars[1].y, 0)
    assert.equal(bars[1].height, 100)
  })
})
