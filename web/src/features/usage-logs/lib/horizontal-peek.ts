import { type RefObject, useEffect, useLayoutEffect } from 'react'

const MIN_PEEK_RATIO = 0.34
const MAX_PEEK_RATIO = 0.66
const TARGET_PEEK_RATIO = 0.5
const OVERFLOW_TOLERANCE_PX = 2

export interface HorizontalPeekAdjustment {
  targetIndex: number
  columnMinWidths: number[]
  minTableWidth: number
}

export function computeHorizontalPeekWidths(
  containerWidth: number,
  naturalWidths: readonly number[]
): HorizontalPeekAdjustment | null {
  if (
    !Number.isFinite(containerWidth) ||
    containerWidth <= 0 ||
    naturalWidths.length < 2
  ) {
    return null
  }

  const totalWidth = naturalWidths.reduce((sum, width) => sum + width, 0)
  if (totalWidth <= containerWidth + OVERFLOW_TOLERANCE_PX) {
    return null
  }

  let cumulativeLeft = 0
  let straddleIndex = -1
  for (let index = 0; index < naturalWidths.length; index += 1) {
    const colWidth = naturalWidths[index]
    const cumulativeRight = cumulativeLeft + colWidth
    if (cumulativeRight >= containerWidth - 0.5) {
      straddleIndex = index
      break
    }
    cumulativeLeft = cumulativeRight
  }

  if (straddleIndex <= 0) {
    return null
  }

  const straddleWidth = naturalWidths[straddleIndex]
  if (straddleWidth <= 0) {
    return null
  }

  const visibleWidth = Math.max(0, containerWidth - cumulativeLeft)
  const visibleRatio = visibleWidth / straddleWidth

  if (visibleRatio >= MIN_PEEK_RATIO && visibleRatio <= MAX_PEEK_RATIO) {
    return null
  }

  let targetIndex = straddleIndex
  let delta = 0

  if (visibleRatio > MAX_PEEK_RATIO) {
    delta = visibleWidth - straddleWidth * TARGET_PEEK_RATIO
  } else {
    targetIndex = straddleIndex - 1
    if (targetIndex <= 0) {
      return null
    }
    const prevWidth = naturalWidths[targetIndex]
    const prevLeft = cumulativeLeft - prevWidth
    delta = containerWidth - prevLeft - prevWidth * TARGET_PEEK_RATIO
  }

  if (delta <= 1) {
    return null
  }

  const extraPerColumn = delta / targetIndex
  const columnMinWidths = naturalWidths.map((width, index) =>
    index < targetIndex
      ? Math.round((width + extraPerColumn) * 100) / 100
      : Math.round(width * 100) / 100
  )

  return {
    targetIndex,
    columnMinWidths,
    minTableWidth: Math.ceil(totalWidth + delta),
  }
}

function clearPeekStyles(
  tableElement: HTMLTableElement,
  headers: HTMLElement[],
  cols: HTMLElement[]
) {
  for (const header of headers) {
    if (header.dataset.peekAppliedWidth !== undefined) {
      if (header.style.width === header.dataset.peekAppliedWidth) {
        header.style.width = header.dataset.peekOrigWidth ?? ''
      }
      if (header.style.minWidth === header.dataset.peekAppliedWidth) {
        header.style.minWidth = header.dataset.peekOrigMinWidth ?? ''
      }
      delete header.dataset.peekAppliedWidth
      delete header.dataset.peekOrigWidth
      delete header.dataset.peekOrigMinWidth
    }
  }
  for (const col of cols) {
    if (col.dataset.peekAppliedWidth !== undefined) {
      if (col.style.width === col.dataset.peekAppliedWidth) {
        col.style.width = col.dataset.peekOrigWidth ?? ''
      }
      delete col.dataset.peekAppliedWidth
      delete col.dataset.peekOrigWidth
    }
  }
  if (tableElement.dataset.peekAppliedMinWidth !== undefined) {
    if (
      tableElement.style.minWidth === tableElement.dataset.peekAppliedMinWidth
    ) {
      tableElement.style.minWidth = tableElement.dataset.peekOrigMinWidth ?? ''
    }
    delete tableElement.dataset.peekAppliedMinWidth
    delete tableElement.dataset.peekOrigMinWidth
  }
}

export function useHorizontalScrollPeek(
  hostRef: RefObject<HTMLElement | null>,
  depsKey: string,
  enabled: boolean
) {
  useLayoutEffect(() => {
    if (!enabled) return
    const host = hostRef.current
    if (!host) return

    let frameId: number | null = null
    let lastMeasuredWidth = -1
    let lastAppliedDeps = ''

    const updateScrollIndicator = () => {
      const scrollContainer = host.querySelector<HTMLElement>(
        "[data-slot='table-container']"
      )
      if (!scrollContainer) {
        delete host.dataset.scrollRight
        return
      }
      const hasMoreRight =
        scrollContainer.scrollWidth -
          scrollContainer.scrollLeft -
          scrollContainer.clientWidth >
        OVERFLOW_TOLERANCE_PX
      if (hasMoreRight) {
        host.dataset.scrollRight = 'true'
      } else {
        delete host.dataset.scrollRight
      }
    }

    const applyPeek = (force = false) => {
      const scrollContainer = host.querySelector<HTMLElement>(
        "[data-slot='table-container']"
      )
      const tableElement = host.querySelector<HTMLTableElement>(
        "[data-slot='table']"
      )
      if (!scrollContainer || !tableElement) return

      const containerWidth = Math.round(scrollContainer.clientWidth)
      if (containerWidth <= 0) return
      if (
        !force &&
        containerWidth === lastMeasuredWidth &&
        depsKey === lastAppliedDeps
      ) {
        updateScrollIndicator()
        return
      }

      const headers = [
        ...tableElement.querySelectorAll<HTMLElement>(
          'thead tr:first-child th'
        ),
      ]
      const cols = [
        ...tableElement.querySelectorAll<HTMLElement>('colgroup col'),
      ]
      clearPeekStyles(tableElement, headers, cols)

      const naturalWidths = headers.map(
        (header) => header.getBoundingClientRect().width
      )
      const adjustment = computeHorizontalPeekWidths(
        containerWidth,
        naturalWidths
      )

      if (adjustment) {
        const appliedTableMinWidth = `max(100%, ${adjustment.minTableWidth}px)`
        tableElement.dataset.peekOrigMinWidth = tableElement.style.minWidth
        tableElement.style.minWidth = appliedTableMinWidth
        tableElement.dataset.peekAppliedMinWidth = appliedTableMinWidth

        adjustment.columnMinWidths.forEach((minWidth, index) => {
          const pxWidth = `${minWidth}px`
          const header = headers[index]
          if (header) {
            header.dataset.peekOrigWidth = header.style.width
            header.dataset.peekOrigMinWidth = header.style.minWidth
            header.style.width = pxWidth
            header.style.minWidth = pxWidth
            header.dataset.peekAppliedWidth = pxWidth
          }
          const col = cols[index]
          if (col) {
            col.dataset.peekOrigWidth = col.style.width
            col.style.width = pxWidth
            col.dataset.peekAppliedWidth = pxWidth
          }
        })
      }

      lastMeasuredWidth = containerWidth
      lastAppliedDeps = depsKey
      updateScrollIndicator()
    }

    const scheduleApply = (force = false) => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        applyPeek(force)
      })
    }

    applyPeek(true)

    const scrollContainer = host.querySelector<HTMLElement>(
      "[data-slot='table-container']"
    )
    scrollContainer?.addEventListener('scroll', updateScrollIndicator, {
      passive: true,
    })

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(() => scheduleApply(false))
      observer.observe(host)
    }

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      scrollContainer?.removeEventListener('scroll', updateScrollIndicator)
      observer?.disconnect()
      const tableElement = host.querySelector<HTMLTableElement>(
        "[data-slot='table']"
      )
      if (tableElement) {
        clearPeekStyles(
          tableElement,
          [
            ...tableElement.querySelectorAll<HTMLElement>(
              'thead tr:first-child th'
            ),
          ],
          [...tableElement.querySelectorAll<HTMLElement>('colgroup col')]
        )
      }
    }
  }, [depsKey, enabled, hostRef])

  useEffect(() => {
    if (enabled) return
    const host = hostRef.current
    if (!host) return
    delete host.dataset.scrollRight
  }, [enabled, hostRef])
}
