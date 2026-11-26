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
import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  downloadTextFile,
  getCodeBlockDownloadFilename,
  parseCodeBlockInfo,
  sanitizeDownloadFilename,
} from '../code-block-file'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('code-block-file', () => {
  test('parses language and filename from attribute, colon, and bare filename info strings', () => {
    expect(parseCodeBlockInfo('csv filename="report.csv"')).toEqual({
      language: 'csv',
      filename: 'report.csv',
    })
    expect(parseCodeBlockInfo('python:scripts/parse.py')).toEqual({
      language: 'python',
      filename: 'parse.py',
    })
    expect(parseCodeBlockInfo("ts title='helpers.ts'")).toEqual({
      language: 'ts',
      filename: 'helpers.ts',
    })
    expect(parseCodeBlockInfo('filename="notes.md"')).toEqual({
      language: 'markdown',
      filename: 'notes.md',
    })
    expect(parseCodeBlockInfo('typescript')).toEqual({
      language: 'typescript',
    })
  })

  test('sanitizes path traversal and Windows-forbidden characters from filenames', () => {
    expect(sanitizeDownloadFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitizeDownloadFilename('dir\\bad:name?.csv')).toBe('bad-name-.csv')
    expect(sanitizeDownloadFilename('..')).toBeUndefined()
  })

  test('maps language names to real file extensions when no filename is given', () => {
    expect(getCodeBlockDownloadFilename('python')).toBe('code.py')
    expect(getCodeBlockDownloadFilename('typescript')).toBe('code.ts')
    expect(getCodeBlockDownloadFilename('javascript')).toBe('code.js')
    expect(getCodeBlockDownloadFilename('markdown')).toBe('code.md')
    expect(getCodeBlockDownloadFilename('plaintext')).toBe('code.txt')
    expect(getCodeBlockDownloadFilename('csv', 'sales.csv')).toBe('sales.csv')
  })

  test('prepends UTF-8 BOM for CSV downloads and preserves plain UTF-8 for JSON downloads', async () => {
    const blobs: Blob[] = []
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((blob) => {
        blobs.push(blob as Blob)
        return 'blob:mock'
      })
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined)
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    downloadTextFile('名称,数量\n苹果,3\n', 'report.csv')
    downloadTextFile('{"ok":true}', 'data.json')

    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(click).toHaveBeenCalledTimes(2)
    const csvBytes = new Uint8Array(await blobs[0].arrayBuffer())
    expect(csvBytes.slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]))
    expect(await blobs[1].text()).toBe('{"ok":true}')
  })
})
