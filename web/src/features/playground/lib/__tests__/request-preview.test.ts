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

import {
  buildCurlPreview,
  buildJsonPreview,
  REQUEST_PREVIEW_PATH,
} from '../request-preview'

describe('request preview', () => {
  test('pretty prints the body so the drawer stays readable', () => {
    assert.equal(
      buildJsonPreview({ model: 'gpt-4o', stream: true }),
      '{\n  "model": "gpt-4o",\n  "stream": true\n}'
    )
  })

  test('builds a curl command that targets the chat completions path', () => {
    const curl = buildCurlPreview(
      { model: 'gpt-4o' },
      'https://api.example.com/'
    )

    assert.ok(
      curl.startsWith(`curl https://api.example.com${REQUEST_PREVIEW_PATH}`)
    )
    assert.ok(curl.includes('-H "Content-Type: application/json"'))
    assert.ok(curl.includes('Authorization: Bearer $MAGIROUTER_API_KEY'))
    assert.ok(curl.includes('"model": "gpt-4o"'))
  })

  test('never embeds a real key and falls back to a base URL placeholder', () => {
    const curl = buildCurlPreview({ model: 'gpt-4o' })

    assert.ok(curl.startsWith('curl $MAGIROUTER_BASE_URL'))
    assert.ok(curl.includes('$MAGIROUTER_API_KEY'))
    assert.ok(!/sk-[A-Za-z0-9]/.test(curl))
  })

  test('uses custom protocol path and headers when provided', () => {
    const curl = buildCurlPreview(
      { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] },
      'https://api.example.com/',
      {
        path: '/v1beta/models/gemini-4-neon:streamGenerateContent?alt=sse',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': '$MAGIROUTER_API_KEY',
        },
      }
    )

    assert.ok(
      curl.startsWith(
        'curl https://api.example.com/v1beta/models/gemini-4-neon:streamGenerateContent?alt=sse'
      )
    )
    assert.ok(curl.includes('-H "x-goog-api-key: $MAGIROUTER_API_KEY"'))
    assert.ok(!curl.includes('Authorization:'))
  })
})
