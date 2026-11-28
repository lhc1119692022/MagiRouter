import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Layers,
  SquareDashed,
  Type,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { cn } from '@/lib/utils'

import type { GeneratedImageItem } from '../lib/image-layers'

interface ImageLayerInspectorProps {
  items: readonly GeneratedImageItem[]
  selectedIndex: number
  outputFormat: string
  onSelectIndex: (index: number) => void
}

interface OverlayRect {
  leftPct: number
  topPct: number
  widthPct: number
  heightPct: number
}

function parseDimensions(
  size?: string
): { width: number; height: number } | null {
  if (!size) return null
  const match = /^(\d+)\s*[xX×]\s*(\d+)$/.exec(size.trim())
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }
  return { width, height }
}

function resolveLayerOverlayRect(
  item: GeneratedImageItem,
  baseSize?: string
): OverlayRect | null {
  const normalized = item.boundingBox?.normalized
  if (normalized) {
    const [left, top, right, bottom] = normalized
    const width = Math.max(0, right - left)
    const height = Math.max(0, bottom - top)
    if (width > 0 && height > 0) {
      return {
        leftPct: (left / 1000) * 100,
        topPct: (top / 1000) * 100,
        widthPct: (width / 1000) * 100,
        heightPct: (height / 1000) * 100,
      }
    }
  }
  const absolute = item.boundingBox?.absolute
  const baseDims = parseDimensions(baseSize)
  if (absolute && baseDims) {
    const [left, top, right, bottom] = absolute
    const width = Math.max(0, right - left)
    const height = Math.max(0, bottom - top)
    if (width > 0 && height > 0) {
      return {
        leftPct: (left / baseDims.width) * 100,
        topPct: (top / baseDims.height) * 100,
        widthPct: (width / baseDims.width) * 100,
        heightPct: (height / baseDims.height) * 100,
      }
    }
  }
  return null
}

function buildLayerDownloadFilename(
  item: GeneratedImageItem,
  fallbackExt: string
): string {
  const isBase = item.zIndex === 0
  const ext = isBase ? fallbackExt : 'png'
  const rawName = (
    item.name ||
    item.label ||
    (isBase ? 'base' : `layer-${item.zIndex ?? 1}`)
  )
    .trim()
    .replaceAll(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
  return `magirouter-${rawName || 'layer'}.${ext}`
}

function getLayerDisplayTitle(
  item: GeneratedImageItem,
  baseLabel: string,
  layerPrefix: string
): string {
  if (item.name?.trim()) return item.name.trim()
  if (item.label?.trim()) return item.label.trim()
  if (item.zIndex === 0) return baseLabel
  if (item.zIndex !== undefined) return `${layerPrefix} #${item.zIndex}`
  return layerPrefix
}

export function ImageLayerInspector(props: ImageLayerInspectorProps) {
  const { t } = useTranslation()
  const [viewMode, setViewMode] = useState<'composite' | 'solo'>('composite')
  const [showBoxes, setShowBoxes] = useState(true)
  const [hiddenLayerIds, setHiddenLayerIds] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const indexedItems = useMemo(
    () => props.items.map((item, originalIndex) => ({ item, originalIndex })),
    [props.items]
  )

  const baseEntry = useMemo(
    () =>
      indexedItems.find((entry) => entry.item.zIndex === 0) ?? indexedItems[0],
    [indexedItems]
  )

  const foregroundAscending = useMemo(
    () =>
      indexedItems
        .filter((entry) => entry.item.id !== baseEntry?.item.id)
        .toSorted(
          (left, right) =>
            (left.item.zIndex ?? left.originalIndex) -
            (right.item.zIndex ?? right.originalIndex)
        ),
    [indexedItems, baseEntry]
  )

  const stackDescending = useMemo(() => {
    const ordered = [...foregroundAscending].toReversed()
    if (baseEntry) ordered.push(baseEntry)
    return ordered
  }, [foregroundAscending, baseEntry])

  const activeEntry =
    indexedItems[props.selectedIndex] ?? baseEntry ?? indexedItems[0]
  const activeLayer = activeEntry?.item

  const toggleLayerVisibility = (id: string) => {
    setHiddenLayerIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const copyWithState = async (key: string, text: string) => {
    await copyToClipboard(text)
    setCopiedId(key)
    window.setTimeout(
      () => setCopiedId((curr) => (curr === key ? null : curr)),
      1500
    )
  }

  const manifestJson = useMemo(() => {
    const manifest = props.items.map((item) => ({
      z_index: item.zIndex,
      name: item.name ?? item.label,
      description: item.description,
      size: item.size,
      background: item.background,
      bounding_box: item.boundingBox,
      text_recognition: item.textRecognition
        ? { text: item.textRecognition.text }
        : undefined,
      url: item.url.startsWith('data:') ? '[base64-image]' : item.url,
    }))
    return JSON.stringify(manifest, null, 2)
  }, [props.items])

  if (!activeLayer) return null

  const baseDims = parseDimensions(baseEntry?.item.size)
  const canComposite = Boolean(baseEntry)
  const activeView = canComposite ? viewMode : 'solo'
  const activeStyle = activeLayer.textRecognition?.styles[0]

  return (
    <div className='pg-layer-inspector' data-testid='pg-layer-inspector'>
      <div className='pg-layer-toolbar'>
        <div className='pg-layer-toolbar-left'>
          {canComposite && (
            <div
              className='pg-inline-switch'
              role='tablist'
              aria-label={t('Layer preview mode')}
            >
              <button
                type='button'
                role='tab'
                aria-selected={activeView === 'composite'}
                className={cn(
                  'pg-inline-switch-btn',
                  activeView === 'composite' && 'is-active'
                )}
                onClick={() => setViewMode('composite')}
              >
                {t('Composite')}
              </button>
              <button
                type='button'
                role='tab'
                aria-selected={activeView === 'solo'}
                className={cn(
                  'pg-inline-switch-btn',
                  activeView === 'solo' && 'is-active'
                )}
                onClick={() => setViewMode('solo')}
              >
                {t('Solo layer')}
              </button>
            </div>
          )}
          {activeView === 'composite' && foregroundAscending.length > 0 && (
            <button
              type='button'
              className={cn('pg-layer-tool-btn', showBoxes && 'is-active')}
              aria-pressed={showBoxes}
              onClick={() => setShowBoxes((prev) => !prev)}
            >
              <SquareDashed size={12} aria-hidden='true' />
              <span>{t('Bounds')}</span>
            </button>
          )}
          <span className='pg-layer-count-pill tabular-nums'>
            <Layers size={12} aria-hidden='true' />
            <span>
              {t('Base + {{count}} layers', {
                count: foregroundAscending.length,
              })}
            </span>
          </span>
        </div>

        <div className='pg-layer-toolbar-right'>
          <button
            type='button'
            className='pg-layer-tool-btn'
            onClick={() => void copyWithState('manifest', manifestJson)}
          >
            {copiedId === 'manifest' ? (
              <Check size={12} aria-hidden='true' />
            ) : (
              <Copy size={12} aria-hidden='true' />
            )}
            <span>
              {copiedId === 'manifest' ? t('Copied') : t('Copy layers JSON')}
            </span>
          </button>
          <a
            href={activeLayer.url}
            target='_blank'
            rel='noreferrer'
            download={buildLayerDownloadFilename(
              activeLayer,
              props.outputFormat
            )}
            className='pg-layer-tool-btn no-underline'
          >
            <Download size={12} aria-hidden='true' />
            <span>{t('Download layer')}</span>
          </a>
        </div>
      </div>

      <div className='pg-layer-canvas pg-checkerboard'>
        {activeView === 'composite' && baseEntry ? (
          <div
            className='pg-layer-composite-frame'
            style={
              baseDims
                ? { aspectRatio: `${baseDims.width} / ${baseDims.height}` }
                : undefined
            }
          >
            <img
              src={baseEntry.item.url}
              alt={getLayerDisplayTitle(
                baseEntry.item,
                t('Base layer'),
                t('Layer')
              )}
              className={cn(
                'pg-layer-base-img',
                hiddenLayerIds.has(baseEntry.item.id) && 'is-hidden'
              )}
            />
            {foregroundAscending.map((entry) => {
              const isHidden = hiddenLayerIds.has(entry.item.id)
              if (isHidden) return null
              const rect = resolveLayerOverlayRect(
                entry.item,
                baseEntry.item.size
              )
              const isSelected = entry.originalIndex === props.selectedIndex
              const title = getLayerDisplayTitle(
                entry.item,
                t('Base layer'),
                t('Layer')
              )
              return (
                <button
                  key={entry.item.id}
                  type='button'
                  className={cn(
                    'pg-layer-overlay',
                    showBoxes && 'show-box',
                    isSelected && 'is-selected'
                  )}
                  style={
                    rect
                      ? {
                          left: `${rect.leftPct}%`,
                          top: `${rect.topPct}%`,
                          width: `${rect.widthPct}%`,
                          height: `${rect.heightPct}%`,
                        }
                      : { inset: 0 }
                  }
                  title={title}
                  aria-label={title}
                  onClick={() => props.onSelectIndex(entry.originalIndex)}
                >
                  <img
                    src={entry.item.url}
                    alt={title}
                    className='pg-layer-overlay-img'
                  />
                  {(showBoxes || isSelected) && (
                    <span className='pg-layer-overlay-tag'>{title}</span>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <img
            src={activeLayer.url}
            alt={getLayerDisplayTitle(activeLayer, t('Base layer'), t('Layer'))}
            className='pg-layer-solo-img'
          />
        )}
      </div>

      <div className='pg-layer-detail-bar'>
        <div className='pg-layer-detail-meta'>
          <span className='pg-layer-detail-name'>
            {activeLayer.zIndex === 0
              ? t('Base layer')
              : `L${activeLayer.zIndex ?? props.selectedIndex}`}
            {' · '}
            {getLayerDisplayTitle(activeLayer, t('Base layer'), t('Layer'))}
          </span>
          {activeLayer.size && (
            <span className='pg-layer-detail-chip tabular-nums'>
              {activeLayer.size}
            </span>
          )}
          {activeLayer.boundingBox?.absolute && (
            <span className='pg-layer-detail-chip tabular-nums'>
              [{activeLayer.boundingBox.absolute.join(', ')}]
            </span>
          )}
        </div>
        {activeLayer.description && (
          <p className='pg-layer-detail-desc'>{activeLayer.description}</p>
        )}
        {activeLayer.textRecognition && (
          <div className='pg-layer-ocr-box' data-testid='pg-layer-ocr-box'>
            <div className='pg-layer-ocr-head'>
              <span className='pg-layer-ocr-label'>
                <Type size={12} aria-hidden='true' />
                <span>{t('Rich text OCR')}</span>
              </span>
              <button
                type='button'
                className='pg-layer-tool-btn'
                onClick={() =>
                  void copyWithState(
                    `ocr-${activeLayer.id}`,
                    activeLayer.textRecognition?.text ?? ''
                  )
                }
              >
                {copiedId === `ocr-${activeLayer.id}`
                  ? t('Copied')
                  : t('Copy text')}
              </button>
            </div>
            <p className='pg-layer-ocr-text'>
              {activeLayer.textRecognition.text}
            </p>
            {activeStyle && (
              <div className='pg-layer-ocr-styles'>
                {activeStyle.similarFontFamily && (
                  <span className='pg-layer-detail-chip'>
                    {activeStyle.similarFontFamily}
                  </span>
                )}
                {activeStyle.foregroundColor && (
                  <span className='pg-layer-detail-chip'>
                    <span
                      className='pg-layer-color-swatch'
                      style={{ background: activeStyle.foregroundColor }}
                    />
                    {activeStyle.foregroundColor}
                  </span>
                )}
                {activeStyle.bold && (
                  <span className='pg-layer-detail-chip'>Bold</span>
                )}
                {activeStyle.italic && (
                  <span className='pg-layer-detail-chip'>Italic</span>
                )}
                {activeStyle.underline && (
                  <span className='pg-layer-detail-chip'>Underline</span>
                )}
                {activeStyle.strikethrough && (
                  <span className='pg-layer-detail-chip'>Strikethrough</span>
                )}
                {activeStyle.shadow && (
                  <span className='pg-layer-detail-chip'>Shadow</span>
                )}
                {activeStyle.translucent && (
                  <span className='pg-layer-detail-chip'>Translucent</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className='pg-layer-list'
        role='list'
        aria-label={t('Decomposed layers')}
      >
        {stackDescending.map((entry) => {
          const isSelected = entry.originalIndex === props.selectedIndex
          const isHidden = hiddenLayerIds.has(entry.item.id)
          const title = getLayerDisplayTitle(
            entry.item,
            t('Base layer'),
            t('Layer')
          )
          return (
            <div
              key={entry.item.id}
              role='listitem'
              className={cn(
                'pg-layer-row',
                isSelected && 'is-selected',
                isHidden && 'is-hidden'
              )}
            >
              <button
                type='button'
                className='pg-layer-vis-btn'
                aria-label={
                  isHidden
                    ? t('Show layer {{name}}', { name: title })
                    : t('Hide layer {{name}}', { name: title })
                }
                aria-pressed={!isHidden}
                onClick={() => toggleLayerVisibility(entry.item.id)}
              >
                {isHidden ? (
                  <EyeOff size={13} aria-hidden='true' />
                ) : (
                  <Eye size={13} aria-hidden='true' />
                )}
              </button>

              <button
                type='button'
                className='pg-layer-select-btn'
                onClick={() => props.onSelectIndex(entry.originalIndex)}
              >
                <span className='pg-layer-thumb pg-checkerboard'>
                  <img src={entry.item.url} alt={title} />
                </span>
                <span className='pg-layer-z-tag tabular-nums'>
                  {entry.item.zIndex === 0
                    ? t('Base layer')
                    : `L${entry.item.zIndex ?? entry.originalIndex}`}
                </span>
                <span className='pg-layer-row-name'>{title}</span>
                {entry.item.textRecognition && (
                  <span className='pg-layer-ocr-pill'>OCR</span>
                )}
                {entry.item.size && (
                  <span className='pg-layer-row-size tabular-nums'>
                    {entry.item.size}
                  </span>
                )}
              </button>

              <a
                href={entry.item.url}
                target='_blank'
                rel='noreferrer'
                download={buildLayerDownloadFilename(
                  entry.item,
                  props.outputFormat
                )}
                className='pg-layer-dl-btn'
                aria-label={t('Download {{name}}', { name: title })}
              >
                <Download size={12} aria-hidden='true' />
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}
