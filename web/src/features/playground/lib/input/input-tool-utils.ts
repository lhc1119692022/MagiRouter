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
import type {
  ChatAttachment,
  ChatAttachmentKind,
  MessageAttachment,
} from '../../types'

export const CHAT_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]
export const CHAT_IMAGE_LIMIT = 2
export const CHAT_IMAGE_MAX_BYTES = 4 * 1024 * 1024

export const CHAT_ATTACHMENT_LIMIT = 5
export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const CHAT_TEXT_FILE_MAX_BYTES = 1 * 1024 * 1024

const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const TEXT_EXTENSION_TO_MIME: Record<string, string> = {
  bash: 'text/x-shellscript',
  c: 'text/x-c',
  cfg: 'text/plain',
  cjs: 'text/javascript',
  conf: 'text/plain',
  cpp: 'text/x-c++',
  cs: 'text/x-csharp',
  css: 'text/css',
  csv: 'text/csv',
  env: 'text/plain',
  go: 'text/x-go',
  graphql: 'text/plain',
  h: 'text/x-c',
  hpp: 'text/x-c++',
  htm: 'text/html',
  html: 'text/html',
  ini: 'text/plain',
  java: 'text/x-java',
  js: 'text/javascript',
  json: 'application/json',
  jsonl: 'application/x-ndjson',
  jsx: 'text/javascript',
  kt: 'text/x-kotlin',
  less: 'text/css',
  log: 'text/plain',
  markdown: 'text/markdown',
  md: 'text/markdown',
  mjs: 'text/javascript',
  php: 'text/x-php',
  prisma: 'text/plain',
  ps1: 'text/plain',
  py: 'text/x-python',
  rb: 'text/x-ruby',
  rs: 'text/x-rust',
  scss: 'text/css',
  sh: 'text/x-shellscript',
  sql: 'application/sql',
  svg: 'image/svg+xml',
  tex: 'text/x-tex',
  toml: 'application/toml',
  ts: 'text/typescript',
  tsv: 'text/tab-separated-values',
  tsx: 'text/typescript',
  txt: 'text/plain',
  xml: 'application/xml',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  zsh: 'text/x-shellscript',
}

const EXTRA_TEXT_MIME_TYPES = new Set([
  'application/javascript',
  'application/json',
  'application/sql',
  'application/toml',
  'application/typescript',
  'application/x-javascript',
  'application/x-ndjson',
  'application/x-sh',
  'application/x-yaml',
  'application/xml',
  'application/yaml',
  'image/svg+xml',
])

export const CHAT_ATTACHMENT_ACCEPT = [
  ...CHAT_IMAGE_TYPES,
  'application/pdf',
  '.pdf',
  'text/*',
  'application/json',
  'application/xml',
  'application/yaml',
  'application/x-yaml',
  ...Object.keys(TEXT_EXTENSION_TO_MIME).map((ext) => `.${ext}`),
].join(',')

const DATA_URL_PATTERN = /^data:([^;,]*)(?:;[^,]*)?;base64,(.*)$/i

function getLowerExtension(filename?: string): string {
  if (!filename) return ''
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === filename.length - 1) return ''
  return filename.slice(dotIndex + 1).toLowerCase()
}

function normalizeMediaType(mediaType?: string): string {
  const clean = (mediaType ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return clean === 'image/jpg' ? 'image/jpeg' : clean
}

function decodeBase64ToBytes(encoded: string): Uint8Array | null {
  if (encoded === '') {
    return new Uint8Array(0)
  }
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    return null
  }
  try {
    const binary = atob(encoded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    return null
  }
}

function hasImageMagicBytes(mediaType: string, bytes: Uint8Array): boolean {
  if (mediaType === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    )
  }
  if (mediaType === 'image/jpeg') {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    )
  }
  if (mediaType === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    )
  }
  if (mediaType === 'image/gif') {
    return (
      bytes.length >= 6 &&
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38 &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) &&
      bytes[5] === 0x61
    )
  }
  return false
}

function hasPdfMagicBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  )
}

export function classifyAttachmentFile(file: {
  filename?: string
  mediaType?: string
}): { kind: ChatAttachmentKind; mediaType: string } | null {
  const mime = normalizeMediaType(file.mediaType)
  const ext = getLowerExtension(file.filename)

  if (CHAT_IMAGE_TYPES.includes(mime)) {
    return { kind: 'image', mediaType: mime }
  }
  if (
    (!mime || mime === 'application/octet-stream') &&
    ext &&
    IMAGE_EXTENSION_TO_MIME[ext]
  ) {
    return { kind: 'image', mediaType: IMAGE_EXTENSION_TO_MIME[ext] }
  }

  if (mime === 'application/pdf' || ext === 'pdf') {
    return { kind: 'pdf', mediaType: 'application/pdf' }
  }

  if (ext && TEXT_EXTENSION_TO_MIME[ext]) {
    const resolvedMime =
      mime && (mime.startsWith('text/') || EXTRA_TEXT_MIME_TYPES.has(mime))
        ? mime
        : TEXT_EXTENSION_TO_MIME[ext]
    return { kind: 'text', mediaType: resolvedMime }
  }

  if (mime.startsWith('text/') || EXTRA_TEXT_MIME_TYPES.has(mime)) {
    return { kind: 'text', mediaType: mime }
  }

  return null
}

export function toMessageAttachment(
  attachment: ChatAttachment
): MessageAttachment {
  return {
    name: attachment.name,
    mediaType: attachment.mediaType,
    kind: attachment.kind,
    ...(attachment.size !== undefined ? { size: attachment.size } : {}),
  }
}

export type ParseChatAttachmentsResult =
  | { attachments: ChatAttachment[]; error?: undefined }
  | { attachments?: undefined; error: 'limit' | 'type' | 'size' | 'invalid' }

export function parseChatAttachments(
  files: { filename?: string; mediaType?: string; url: string }[]
): ParseChatAttachmentsResult {
  if (files.length > CHAT_ATTACHMENT_LIMIT) {
    return { error: 'limit' }
  }

  const parsed: ChatAttachment[] = []
  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    const match = file.url.match(DATA_URL_PATTERN)
    if (!match) {
      return { error: 'invalid' }
    }

    const dataUrlMime = normalizeMediaType(match[1])
    const encoded = match[2] ?? ''
    const classification = classifyAttachmentFile({
      filename: file.filename,
      mediaType: file.mediaType || dataUrlMime,
    })
    if (!classification) {
      return { error: 'type' }
    }

    const bytes = decodeBase64ToBytes(encoded)
    if (!bytes) {
      return { error: 'invalid' }
    }

    const maxBytes =
      classification.kind === 'text'
        ? CHAT_TEXT_FILE_MAX_BYTES
        : CHAT_ATTACHMENT_MAX_BYTES
    if (bytes.length > maxBytes) {
      return { error: 'size' }
    }

    let fallbackName = `file-${index + 1}.txt`
    if (classification.kind === 'image') {
      fallbackName = `image-${index + 1}.${classification.mediaType.split('/')[1] || 'png'}`
    } else if (classification.kind === 'pdf') {
      fallbackName = `document-${index + 1}.pdf`
    }
    const name = file.filename?.trim() || fallbackName

    if (classification.kind === 'image') {
      if (!hasImageMagicBytes(classification.mediaType, bytes)) {
        return { error: 'invalid' }
      }
      parsed.push({
        name,
        mediaType: classification.mediaType,
        kind: 'image',
        size: bytes.length,
        url: `data:${classification.mediaType};base64,${encoded}`,
      })
      continue
    }

    if (classification.kind === 'pdf') {
      if (!hasPdfMagicBytes(bytes)) {
        return { error: 'invalid' }
      }
      parsed.push({
        name,
        mediaType: 'application/pdf',
        kind: 'pdf',
        size: bytes.length,
        url: `data:application/pdf;base64,${encoded}`,
      })
      continue
    }

    if (bytes.includes(0)) {
      return { error: 'type' }
    }
    const textContent = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    parsed.push({
      name,
      mediaType: classification.mediaType,
      kind: 'text',
      size: bytes.length,
      textContent,
    })
  }

  return { attachments: parsed }
}

export function previewChatAttachments(
  attachments: MessageAttachment[]
): ChatAttachment[] {
  return attachments
    .slice(0, CHAT_ATTACHMENT_LIMIT)
    .map((attachment, index) => {
      if (attachment.kind === 'image') {
        const safeName = encodeURIComponent(
          attachment.name || `image-${index + 1}.png`
        )
        return {
          ...attachment,
          url: `https://example.invalid/${safeName}`,
        }
      }
      if (attachment.kind === 'pdf') {
        return {
          ...attachment,
          url: 'data:application/pdf;base64,<base64-pdf>',
        }
      }
      return {
        ...attachment,
        textContent: '<file content>',
      }
    })
}

export function previewChatImageUrls(count: number): string[] {
  return Array.from(
    { length: Math.min(count, CHAT_IMAGE_LIMIT) },
    (_, index) => `https://example.invalid/image-${index + 1}.png`
  )
}

export function selectedChatImageUrls(
  files: { mediaType: string; url: string }[]
): string[] | null {
  if (files.length > CHAT_IMAGE_LIMIT) return null
  const result = parseChatAttachments(files)
  if (result.error || !result.attachments) return null
  if (
    result.attachments.some(
      (item) =>
        item.kind !== 'image' ||
        !item.url ||
        (item.size ?? 0) > CHAT_IMAGE_MAX_BYTES
    )
  ) {
    return null
  }
  return result.attachments.map((item) => item.url as string)
}
