export interface LayerBoundingBox {
  absolute?: [number, number, number, number]
  normalized?: [number, number, number, number]
}

export interface LayerTextStyle {
  similarFontFamily?: string
  foregroundColor?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  shadow?: boolean
  translucent?: boolean
}

export interface LayerTextRecognition {
  text: string
  styles: LayerTextStyle[]
}

export interface GeneratedImageItem {
  id: string
  url: string
  label?: string
  size?: string
  zIndex?: number
  name?: string
  description?: string
  background?: string
  boundingBox?: LayerBoundingBox
  textRecognition?: LayerTextRecognition
}

export function isLayerDecompositionOutput(
  items: readonly GeneratedImageItem[]
): boolean {
  return items.some(
    (item) =>
      item.zIndex !== undefined ||
      item.boundingBox !== undefined ||
      item.textRecognition !== undefined
  )
}
