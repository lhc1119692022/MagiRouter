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
/**
 * Application-wide constants
 */

// System Configuration Defaults
export const DEFAULT_SYSTEM_NAME = 'MagiRouter'
// MagiRouter: new filename so browsers drop the cached upstream favicon.
export const DEFAULT_LOGO = '/magirouter-logo.png'

/**
 * Names shipped by the upstream project. A fresh deployment still carries one
 * of these until an admin renames the site, which used to leak into the tab
 * title and the header. Treat them as "not configured yet".
 */
const LEGACY_SYSTEM_NAMES = new Set([
  'new api',
  'newapi',
  'one api',
  'oneapi',
  'one-api',
])

export function resolveSystemName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name) return DEFAULT_SYSTEM_NAME
  return LEGACY_SYSTEM_NAMES.has(name.toLowerCase())
    ? DEFAULT_SYSTEM_NAME
    : name
}

// LocalStorage Keys
export const STORAGE_KEYS = {
  SYSTEM_NAME: 'system_name',
  LOGO: 'logo',
  FOOTER_HTML: 'footer_html',
} as const
