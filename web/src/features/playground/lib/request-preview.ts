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
  baseUrl = '$MAGIROUTER_BASE_URL'
): string {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}${REQUEST_PREVIEW_PATH}`
  return [
    `curl ${endpoint} \\`,
    '  -H "Content-Type: application/json" \\',
    '  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\',
    `  -d '${buildJsonPreview(body)}'`,
  ].join('\n')
}
