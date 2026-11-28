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
import { describe, expect, test } from 'vitest'

import { DEFAULT_CONFIG } from '../../constants'
import { parseChatAttachments } from '../input/input-tool-utils'
import {
  buildFileOutputSystemInstruction,
  extractOutputFiles,
  getAssistantDownloadTarget,
} from '../message/message-file-utils'
import { createUserMessage } from '../message/message-utils'
import { buildChatCompletionPayload } from '../streaming/payload-builder'

const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const VALID_PDF_DATA_URL =
  'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PD4+CmVuZG9iago='

function encodeUtf8DataUrl(mimeType: string, text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

describe('parseChatAttachments', () => {
  test('parses valid PNG images, PDFs, and UTF-8 text/CSV files even with empty or Windows Excel MIME types', () => {
    const result = parseChatAttachments([
      {
        filename: 'photo.png',
        mediaType: 'image/png',
        url: VALID_PNG_DATA_URL,
      },
      {
        filename: 'spec.pdf',
        mediaType: 'application/pdf',
        url: VALID_PDF_DATA_URL,
      },
      {
        filename: 'sales.csv',
        mediaType: 'application/vnd.ms-excel',
        url: encodeUtf8DataUrl(
          'application/vnd.ms-excel',
          '产品,销量\n咖啡,12\n'
        ),
      },
      {
        filename: 'README.md',
        mediaType: '',
        url: encodeUtf8DataUrl('', '# 标题\n内容'),
      },
    ])

    expect(result.error).toBeUndefined()
    expect(result.attachments).toHaveLength(4)
    expect(result.attachments?.[0]).toMatchObject({
      name: 'photo.png',
      kind: 'image',
      mediaType: 'image/png',
      url: VALID_PNG_DATA_URL,
    })
    expect(result.attachments?.[1]).toMatchObject({
      name: 'spec.pdf',
      kind: 'pdf',
      mediaType: 'application/pdf',
      url: VALID_PDF_DATA_URL,
    })
    expect(result.attachments?.[2]).toMatchObject({
      name: 'sales.csv',
      kind: 'text',
      mediaType: 'text/csv',
      textContent: '产品,销量\n咖啡,12\n',
    })
    expect(result.attachments?.[3]).toMatchObject({
      name: 'README.md',
      kind: 'text',
      mediaType: 'text/markdown',
      textContent: '# 标题\n内容',
    })
  })

  test('rejects spoofed PNGs, spoofed PDFs, binary NUL payloads, and too many attachments', () => {
    expect(
      parseChatAttachments([
        {
          filename: 'fake.png',
          mediaType: 'image/png',
          url: 'data:image/png;base64,ZmFrZQ==',
        },
      ])
    ).toEqual({ error: 'invalid' })

    expect(
      parseChatAttachments([
        {
          filename: 'fake.pdf',
          mediaType: 'application/pdf',
          url: 'data:application/pdf;base64,ZmFrZQ==',
        },
      ])
    ).toEqual({ error: 'invalid' })

    expect(
      parseChatAttachments([
        {
          filename: 'binary.txt',
          mediaType: 'text/plain',
          url: 'data:text/plain;base64,AAECAw==',
        },
      ])
    ).toEqual({ error: 'type' })

    expect(
      parseChatAttachments(
        Array.from({ length: 6 }, (_, index) => ({
          filename: `img-${index}.png`,
          mediaType: 'image/png',
          url: VALID_PNG_DATA_URL,
        }))
      )
    ).toEqual({ error: 'limit' })
  })
})

describe('buildChatCompletionPayload with attachments and file output', () => {
  test('encodes mixed attachments without empty text parts and injects file-output instructions', () => {
    const parsed = parseChatAttachments([
      {
        filename: 'photo.png',
        mediaType: 'image/png',
        url: VALID_PNG_DATA_URL,
      },
      {
        filename: 'spec.pdf',
        mediaType: 'application/pdf',
        url: VALID_PDF_DATA_URL,
      },
      {
        filename: 'data.csv',
        mediaType: 'text/csv',
        url: encodeUtf8DataUrl('text/csv', 'a,b\n1,2'),
      },
    ])
    const userMessage = createUserMessage('')
    const payload = buildChatCompletionPayload(
      [userMessage],
      { ...DEFAULT_CONFIG, model: 'qwen4-max', fileOutput: 'json' },
      undefined,
      parsed.attachments
    )

    expect(payload.messages[0]).toEqual({
      role: 'system',
      content: buildFileOutputSystemInstruction('json'),
    })
    expect(payload.messages[1]).toEqual({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: VALID_PNG_DATA_URL } },
        {
          type: 'file',
          file: { filename: 'spec.pdf', file_data: VALID_PDF_DATA_URL },
        },
        {
          type: 'text',
          text: '<file name="data.csv" type="text/csv">\na,b\n1,2\n</file>',
        },
      ],
    })
  })

  test('defaults to conditional auto file-output guidance and omits it when explicitly off', () => {
    const userMessage = createUserMessage('Hello')
    const defaultPayload = buildChatCompletionPayload([userMessage], {
      ...DEFAULT_CONFIG,
      model: 'qwen4-max',
    })
    expect(defaultPayload.messages[0]).toEqual({
      role: 'system',
      content: buildFileOutputSystemInstruction('auto'),
    })
    expect(defaultPayload.messages[0].content).toContain(
      'answer ordinary questions normally'
    )
    expect(
      buildChatCompletionPayload([userMessage], {
        ...DEFAULT_CONFIG,
        model: 'qwen4-max',
        fileOutput: 'off',
      }).messages
    ).toEqual([{ role: 'user', content: 'Hello' }])
  })
})

describe('extractOutputFiles and getAssistantDownloadTarget', () => {
  test('extracts named files including 4-backtick nested markdown and deduplicates duplicate names', () => {
    const markdown = [
      'Here are the generated files:',
      '',
      '```csv filename="report.csv"',
      'name,total',
      'A,10',
      '```',
      '',
      '````markdown filename="guide.md"',
      '# Guide',
      '```ts',
      'export const x = 1',
      '```',
      '````',
      '',
      '```csv filename="report.csv"',
      'name,total',
      'B,20',
      '```',
      '',
      '```js',
      'console.log("unnamed snippet ignored")',
      '```',
    ].join('\n')

    const files = extractOutputFiles(markdown)
    expect(files.map((file) => file.filename)).toEqual([
      'report.csv',
      'guide.md',
      'report-2.csv',
    ])
    expect(files[1].content).toContain('```ts\nexport const x = 1\n```')
    expect(files[0].mimeType).toBe('text/csv;charset=utf-8')
  })

  test('selects exact filename for single-file reply, .json for raw JSON, and .md for general prose', () => {
    const singleFile = getAssistantDownloadTarget(
      '```json filename="config.json"\n{"a":1}\n```',
      1700000000000
    )
    expect(singleFile).toEqual({
      filename: 'config.json',
      content: '{"a":1}',
      mimeType: 'application/json;charset=utf-8',
    })

    const rawJson = getAssistantDownloadTarget('{"ok": true}', 1700000000000)
    expect(rawJson.filename).toMatch(/^response-\d{8}-\d{6}\.json$/)
    expect(rawJson.mimeType).toBe('application/json;charset=utf-8')

    const prose = getAssistantDownloadTarget(
      '# Summary\nAll good.',
      1700000000000
    )
    expect(prose.filename).toMatch(/^response-\d{8}-\d{6}\.md$/)
    expect(prose.mimeType).toBe('text/markdown;charset=utf-8')
  })
})
