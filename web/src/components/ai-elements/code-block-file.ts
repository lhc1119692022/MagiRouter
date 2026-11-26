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
export interface ParsedCodeBlockInfo {
  language: string
  filename?: string
}

const LANGUAGE_TO_EXTENSION: Record<string, string> = {
  bash: 'sh',
  c: 'c',
  'c#': 'cs',
  'c++': 'cpp',
  cjs: 'cjs',
  conf: 'conf',
  cpp: 'cpp',
  cs: 'cs',
  csharp: 'cs',
  css: 'css',
  csv: 'csv',
  dockerfile: 'dockerfile',
  go: 'go',
  golang: 'go',
  graphql: 'graphql',
  h: 'h',
  hpp: 'hpp',
  htm: 'html',
  html: 'html',
  ini: 'ini',
  java: 'java',
  javascript: 'js',
  js: 'js',
  json: 'json',
  json5: 'json',
  jsonc: 'json',
  jsonl: 'jsonl',
  jsx: 'jsx',
  kotlin: 'kt',
  kt: 'kt',
  less: 'less',
  log: 'log',
  markdown: 'md',
  md: 'md',
  mdx: 'mdx',
  mjs: 'mjs',
  php: 'php',
  plain: 'txt',
  plaintext: 'txt',
  powershell: 'ps1',
  prisma: 'prisma',
  ps1: 'ps1',
  py: 'py',
  python: 'py',
  rb: 'rb',
  rs: 'rs',
  ruby: 'rb',
  rust: 'rs',
  scss: 'scss',
  sh: 'sh',
  shell: 'sh',
  shellscript: 'sh',
  sql: 'sql',
  svg: 'svg',
  swift: 'swift',
  tex: 'tex',
  text: 'txt',
  toml: 'toml',
  ts: 'ts',
  tsv: 'tsv',
  tsx: 'tsx',
  txt: 'txt',
  typescript: 'ts',
  xml: 'xml',
  yaml: 'yml',
  yml: 'yml',
  zsh: 'sh',
}

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  bash: 'bash',
  c: 'c',
  cjs: 'javascript',
  conf: 'ini',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  csv: 'csv',
  go: 'go',
  graphql: 'graphql',
  h: 'c',
  hpp: 'cpp',
  htm: 'html',
  html: 'html',
  ini: 'ini',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsonl: 'json',
  jsx: 'jsx',
  kt: 'kotlin',
  less: 'less',
  log: 'plaintext',
  markdown: 'markdown',
  md: 'markdown',
  mdx: 'mdx',
  mjs: 'javascript',
  php: 'php',
  prisma: 'prisma',
  ps1: 'powershell',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  scss: 'scss',
  sh: 'bash',
  sql: 'sql',
  svg: 'xml',
  swift: 'swift',
  tex: 'latex',
  toml: 'toml',
  ts: 'typescript',
  tsv: 'tsv',
  tsx: 'tsx',
  txt: 'plaintext',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash',
}

const EXTENSION_TO_MIME: Record<string, string> = {
  cjs: 'text/javascript;charset=utf-8',
  css: 'text/css;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  htm: 'text/html;charset=utf-8',
  html: 'text/html;charset=utf-8',
  js: 'text/javascript;charset=utf-8',
  json: 'application/json;charset=utf-8',
  jsonl: 'application/x-ndjson;charset=utf-8',
  markdown: 'text/markdown;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
  mdx: 'text/markdown;charset=utf-8',
  mjs: 'text/javascript;charset=utf-8',
  svg: 'image/svg+xml;charset=utf-8',
  tsv: 'text/tab-separated-values;charset=utf-8',
  xml: 'application/xml;charset=utf-8',
  yaml: 'text/yaml;charset=utf-8',
  yml: 'text/yaml;charset=utf-8',
}

const FILENAME_ATTR_PATTERN =
  /(?:^|\s)(?:filename|file|title|path)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'`]+))/i
const SAFE_LANGUAGE_TOKEN_PATTERN = /^[a-z0-9][a-z0-9+#._-]{0,31}$/i
const MAX_FILENAME_LENGTH = 120

function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return ''
  }
  return filename.slice(dotIndex + 1).toLowerCase()
}

export function sanitizeDownloadFilename(raw: string): string | undefined {
  let cleaned = raw.trim().replaceAll(/^['"]+|['"]+$/g, '')
  if (!cleaned) {
    return undefined
  }

  cleaned = cleaned.replaceAll('\\', '/').replace(/\/+$/, '')
  const segments = cleaned.split('/').filter(Boolean)
  let base = segments.at(-1) ?? ''
  base = base
    // eslint-disable-next-line no-control-regex
    .replaceAll(/[\u0000-\u001f\u007f]/g, '')
    .replaceAll(/[<>:"/\\|?*]/g, '-')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/^\.+$/, '')

  if (!base || base === '.' || base === '..') {
    return undefined
  }

  if (base.length > MAX_FILENAME_LENGTH) {
    const ext = getFileExtension(base)
    if (ext && ext.length <= 16) {
      const stemLimit = MAX_FILENAME_LENGTH - ext.length - 1
      base = `${base.slice(0, Math.max(1, stemLimit))}.${ext}`
    } else {
      base = base.slice(0, MAX_FILENAME_LENGTH)
    }
  }

  return base
}

export function getLanguageForFilename(filename: string): string {
  const ext = getFileExtension(filename)
  if (!ext) {
    if (filename.toLowerCase() === 'dockerfile') {
      return 'dockerfile'
    }
    return 'plaintext'
  }
  return EXTENSION_TO_LANGUAGE[ext] ?? 'plaintext'
}

export function parseCodeBlockInfo(info?: string): ParsedCodeBlockInfo {
  const trimmed = info?.trim() ?? ''
  if (!trimmed) {
    return { language: 'plaintext' }
  }

  let filename: string | undefined
  let remainder = trimmed

  const attrMatch = remainder.match(FILENAME_ATTR_PATTERN)
  if (attrMatch) {
    const rawName = attrMatch[1] ?? attrMatch[2] ?? attrMatch[3] ?? ''
    filename = sanitizeDownloadFilename(rawName)
    remainder = `${remainder.slice(0, attrMatch.index ?? 0)} ${remainder.slice(
      (attrMatch.index ?? 0) + attrMatch[0].length
    )}`.trim()
  }

  let firstToken = remainder.split(/\s+/, 1)[0] ?? ''

  if (!filename && firstToken.includes(':')) {
    const colonIndex = firstToken.indexOf(':')
    const maybeLang = firstToken.slice(0, colonIndex).trim()
    const maybeFile = firstToken.slice(colonIndex + 1).trim()
    if (maybeFile && (maybeFile.includes('.') || maybeFile.includes('/'))) {
      filename = sanitizeDownloadFilename(maybeFile)
      firstToken = maybeLang
    }
  }

  if (
    !filename &&
    firstToken.includes('.') &&
    !firstToken.startsWith('.') &&
    !firstToken.endsWith('.')
  ) {
    const ext = getFileExtension(firstToken)
    if (ext && (EXTENSION_TO_LANGUAGE[ext] || /^[a-z0-9]{1,8}$/i.test(ext))) {
      filename = sanitizeDownloadFilename(firstToken)
      firstToken = ''
    }
  }

  const normalizedLang = firstToken.trim().toLowerCase()
  if (normalizedLang && SAFE_LANGUAGE_TOKEN_PATTERN.test(normalizedLang)) {
    return {
      language: normalizedLang,
      ...(filename ? { filename } : {}),
    }
  }

  return {
    language: filename ? getLanguageForFilename(filename) : 'plaintext',
    ...(filename ? { filename } : {}),
  }
}

export function getExtensionForLanguage(language: string): string {
  const normalized = language.trim().toLowerCase()
  if (LANGUAGE_TO_EXTENSION[normalized]) {
    return LANGUAGE_TO_EXTENSION[normalized]
  }
  const safe = normalized.replaceAll(/[^a-z0-9]/g, '')
  return safe && safe.length <= 12 ? safe : 'txt'
}

export function getCodeBlockDownloadFilename(
  language: string,
  filename?: string
): string {
  const sanitized = filename ? sanitizeDownloadFilename(filename) : undefined
  if (sanitized) {
    return sanitized
  }
  return `code.${getExtensionForLanguage(language)}`
}

export function getMimeTypeForFilename(filename: string): string {
  const ext = getFileExtension(filename)
  return EXTENSION_TO_MIME[ext] ?? 'text/plain;charset=utf-8'
}

export function downloadTextFile(
  content: string,
  filename: string,
  mimeType?: string
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const safeFilename = sanitizeDownloadFilename(filename) ?? 'download.txt'
  const resolvedMime = mimeType ?? getMimeTypeForFilename(safeFilename)
  const isCsv = getFileExtension(safeFilename) === 'csv'
  const payload =
    isCsv && !content.startsWith('\uFEFF') ? `\uFEFF${content}` : content

  const blob = new Blob([payload], { type: resolvedMime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = safeFilename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B'
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`
  }
  const kb = bytes / 1024
  if (kb < 1024) {
    return `${kb >= 100 ? Math.round(kb) : Number(kb.toFixed(1))} KB`
  }
  const mb = kb / 1024
  return `${Number(mb.toFixed(1))} MB`
}
