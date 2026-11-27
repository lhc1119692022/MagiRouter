import { describe, expect, it } from 'vitest'

import { computeHorizontalPeekWidths } from '../horizontal-peek'

describe('computeHorizontalPeekWidths', () => {
  it('returns null when all columns already fit without horizontal scroll', () => {
    expect(computeHorizontalPeekWidths(1200, [150, 150, 200, 200])).toBeNull()
  })

  it('returns null when the straddling column is already cut near half', () => {
    const widths = [200, 200, 200, 200, 200, 200, 200]
    expect(computeHorizontalPeekWidths(1100, widths)).toBeNull()
  })

  it('pushes an almost-complete straddling column so exactly half of it is clipped', () => {
    const widths = [200, 200, 200, 200, 200, 200, 200]
    const result = computeHorizontalPeekWidths(1190, widths)
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.targetIndex).toBe(5)
    expect(result.columnMinWidths).toHaveLength(widths.length)
    const leftOfTarget = result.columnMinWidths
      .slice(0, 5)
      .reduce((sum, width) => sum + width, 0)
    const visibleTargetWidth = 1190 - leftOfTarget
    expect(visibleTargetWidth).toBeCloseTo(100, 1)
  })

  it('pushes the previous column to the right edge when the next column barely peeks in', () => {
    const widths = [200, 200, 200, 200, 200, 200, 200]
    const result = computeHorizontalPeekWidths(1012, widths)
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.targetIndex).toBe(4)
    expect(result.columnMinWidths).toHaveLength(widths.length)
    const leftOfTarget = result.columnMinWidths
      .slice(0, 4)
      .reduce((sum, width) => sum + width, 0)
    const visibleTargetWidth = 1012 - leftOfTarget
    expect(visibleTargetWidth).toBeCloseTo(100, 1)
  })
})
