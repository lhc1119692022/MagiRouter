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
import {
  getMimeTypeForFilename,
  parseCodeBlockInfo,
  sanitizeDownloadFilename,
} from '@/components/ai-elements/code-block-file'

import type { ChatFileOutputFormat } from '../../types'

export interface ChatFileOutputOption {
  value: ChatFileOutputFormat
  label?: string
  labelKey?: string
  shortLabel?: string
  shortLabelKey?: string
}

export const CHAT_FILE_OUTPUT_OPTIONS: readonly ChatFileOutputOption[] = [
  { value: 'off', labelKey: 'Off', shortLabelKey: 'Off' },
  {
    value: 'auto',
    labelKey: 'Auto (model chooses format)',
    shortLabelKey: 'Auto',
  },
  { value: 'md', label: 'Markdown (.md)', shortLabel: 'MD' },
  { value: 'json', label: 'JSON (.json)', shortLabel: 'JSON' },
  { value: 'csv', label: 'CSV (.csv)', shortLabel: 'CSV' },
  { value: 'html', label: 'HTML (.html)', shortLabel: 'HTML' },
  { value: 'txt', labelKey: 'Plain text (.txt)', shortLabel: 'TXT' },
  { value: 'code', labelKey: 'Source code', shortLabelKey: 'Code' },
] as const

const FORMAT_GUIDANCE: Record<Exclude<ChatFileOutputFormat, 'off'>, string> = {
  auto: "Choose the most suitable file format and filename extension for the user's request.",
  md: 'Deliver the primary output as a Markdown file (.md). If the Markdown file itself contains code blocks, wrap the outer file block in four backticks (````).',
  json: 'Deliver the primary output as a valid JSON file (.json).',
  csv: 'Deliver the primary output as a valid RFC 4180 CSV file (.csv) with a header row.',
  html: 'Deliver the primary output as a standalone HTML file (.html).',
  txt: 'Deliver the primary output as a plain text file (.txt).',
  code: 'Deliver the primary output as complete source code file(s) with appropriate extensions.',
}

export function buildFileOutputSystemInstruction(
  format: ChatFileOutputFormat
): string | null {
  if (format === 'off') {
    return null
  }

  return [
    'The user wants the response delivered as downloadable file(s).',
    'Wrap each downloadable file in a fenced code block whose opening info string includes `filename="<name>.<ext>"`, for example:',
    '```csv filename="report.csv"',
    'col1,col2',
    'val1,val2',
    '```',
    'Rules:',
    '- Output complete, ready-to-save file contents inside each file block with no omissions or placeholders.',
    '- If multiple files are needed, emit one fenced block per file with a distinct `filename="..."`.',
    '- Keep any brief explanation outside the file blocks.',
    `- ${FORMAT_GUIDANCE[format]}`,
  ].join('\n')
}

export interface ExtractedOutputFile {
  id: string
  filename: string
  language: string
  content: string
  mimeType: string
  sizeBytes: number
  lineCount: number
}

const FENCE_OPEN_PATTERN = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/
const FENCE_CLOSE_PATTERN = /^ {0,3}(`{3,}|~{3,})\s*$/

function deduplicateFilename(filename: string, used: Set<string>): string {
  const key = filename.toLowerCase()
  if (!used.has(key)) {
    used.add(key)
    return filename
  }

  const dotIndex = filename.lastIndexOf('.')
  const hasExt = dotIndex > 0 && dotIndex < filename.length - 1
  const stem = hasExt ? filename.slice(0, dotIndex) : filename
  const ext = hasExt ? filename.slice(dotIndex) : ''

  let suffix = 2
  while (used.has(`${stem}-${suffix}${ext}`.toLowerCase())) {
    suffix++
  }
  const unique = `${stem}-${suffix}${ext}`
  used.add(unique.toLowerCase())
  return unique
}

interface ParsedFencedBlock {
  infoString: string
  content: string
  startLine: number
  endLine: number
}

function scanFencedBlocks(markdown: string): ParsedFencedBlock[] {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n')
  const blocks: ParsedFencedBlock[] = []

  let current: {
    fenceChar: string
    fenceLength: number
    infoString: string
    startLine: number
    contentLines: string[]
  } | null = null

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!current) {
      const openMatch = line.match(FENCE_OPEN_PATTERN)
      if (!openMatch) continue
      const fence = openMatch[1]
      const infoString = openMatch[2].trim()
      if (fence[0] === '`' && infoString.includes('`')) continue
      current = {
        fenceChar: fence[0],
        fenceLength: fence.length,
        infoString,
        startLine: index,
        contentLines: [],
      }
      continue
    }

    const closeMatch = line.match(FENCE_CLOSE_PATTERN)
    if (
      closeMatch &&
      closeMatch[1][0] === current.fenceChar &&
      closeMatch[1].length >= current.fenceLength
    ) {
      blocks.push({
        infoString: current.infoString,
        content: current.contentLines.join('\n'),
        startLine: current.startLine,
        endLine: index,
      })
      current = null
      continue
    }

    current.contentLines.push(line)
  }

  return blocks
}

export function extractOutputFiles(markdown: string): ExtractedOutputFile[] {
  if (!markdown) {
    return []
  }

  const blocks = scanFencedBlocks(markdown)
  const usedNames = new Set<string>()
  const encoder = new TextEncoder()
  const files: ExtractedOutputFile[] = []

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]
    const parsed = parseCodeBlockInfo(block.infoString)
    if (!parsed.filename) {
      continue
    }

    const content = block.content
    if (content.trim().length === 0) {
      continue
    }

    const filename = deduplicateFilename(parsed.filename, usedNames)
    const lineCount = content ? content.split('\n').length : 0
    files.push({
      id: `${index}-${filename}`,
      filename,
      language: parsed.language,
      content,
      mimeType: getMimeTypeForFilename(filename),
      sizeBytes: encoder.encode(content).length,
      lineCount,
    })
  }

  return files
}

export interface AssistantDownloadTarget {
  filename: string
  content: string
  mimeType: string
}

function formatTimestampSlug(timestamp?: number): string {
  const date = new Date(timestamp ?? Date.now())
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function getAssistantDownloadTarget(
  markdown: string,
  createdAt?: number
): AssistantDownloadTarget {
  const trimmed = markdown.trim()
  const blocks = scanFencedBlocks(markdown)

  if (blocks.length === 1) {
    const onlyBlock = blocks[0]
    const parsed = parseCodeBlockInfo(onlyBlock.infoString)
    if (parsed.filename) {
      const lines = markdown.replaceAll('\r\n', '\n').split('\n')
      const outside = [
        ...lines.slice(0, onlyBlock.startLine),
        ...lines.slice(onlyBlock.endLine + 1),
      ]
        .join('\n')
        .trim()
      if (!outside) {
        const safeName =
          sanitizeDownloadFilename(parsed.filename) ?? parsed.filename
        return {
          filename: safeName,
          content: onlyBlock.content,
          mimeType: getMimeTypeForFilename(safeName),
        }
      }
    }
  }

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed)
      const filename = `response-${formatTimestampSlug(createdAt)}.json`
      return {
        filename,
        content: trimmed,
        mimeType: 'application/json;charset=utf-8',
      }
    } catch {
      // Not valid JSON; fall through to Markdown download
    }
  }

  const filename = `response-${formatTimestampSlug(createdAt)}.md`
  return {
    filename,
    content: markdown,
    mimeType: 'text/markdown;charset=utf-8',
  }
}
