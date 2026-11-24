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
export const CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const CHAT_IMAGE_LIMIT = 2
export const CHAT_IMAGE_MAX_BYTES = 4 * 1024 * 1024

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
  for (const file of files) {
    const prefix = `data:${file.mediaType};base64,`
    if (
      !CHAT_IMAGE_TYPES.includes(file.mediaType) ||
      !file.url.startsWith(prefix)
    ) {
      return null
    }
    const encoded = file.url.slice(prefix.length)
    const padding = encoded.endsWith('==') ? 2 : Number(encoded.endsWith('='))
    if (
      encoded.length % 4 !== 0 ||
      (encoded.length * 3) / 4 - padding > CHAT_IMAGE_MAX_BYTES ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
    ) {
      return null
    }
    const signature = atob(encoded.slice(0, 16))
    if (
      file.mediaType === 'image/png' &&
      !signature.startsWith('\x89PNG\r\n\x1a\n')
    ) {
      return null
    }
    if (
      file.mediaType === 'image/jpeg' &&
      !signature.startsWith('\xff\xd8\xff')
    ) {
      return null
    }
    if (
      file.mediaType === 'image/webp' &&
      !(signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP')
    ) {
      return null
    }
  }
  return files.map((file) => file.url)
}
