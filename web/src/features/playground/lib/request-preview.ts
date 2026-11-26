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
export const REQUEST_PREVIEW_PATH = '/v1/chat/completions'

export interface CurlPreviewOptions {
  path?: string
  headers?: Record<string, string>
}

/** Pretty-printed request body for the JSON tab. */
export function buildJsonPreview(body: unknown): string {
  return JSON.stringify(body, null, 2)
}

/**
 * cURL equivalent of the same request.
 *
 * The key is shown as an environment reference rather than a real secret so the
 * snippet stays safe to paste into a chat, issue, or ticket.
 */
export function buildCurlPreview(
  body: unknown,
  baseUrl = '$MAGIROUTER_BASE_URL',
  options?: CurlPreviewOptions
): string {
  const path = options?.path ?? REQUEST_PREVIEW_PATH
  const headers = options?.headers ?? {
    'Content-Type': 'application/json',
    Authorization: 'Bearer $MAGIROUTER_API_KEY',
  }
  const endpoint = `${baseUrl.replace(/\/+$/, '')}${path}`
  const headerLines = Object.entries(headers).map(
    ([name, value]) => `  -H "${name}: ${value}" \\`
  )
  return [
    `curl ${endpoint} \\`,
    ...headerLines,
    `  -d '${buildJsonPreview(body)}'`,
  ].join('\n')
}
