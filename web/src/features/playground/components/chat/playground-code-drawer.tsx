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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'

import {
  buildCurlPreview,
  buildJsonPreview,
  REQUEST_PREVIEW_PATH,
} from '../../lib/request-preview'

type PlaygroundCodeDrawerProps = {
  open: boolean
  payload: unknown
  requestPath?: string
  previewHeaders?: Record<string, string>
}

type CodeTab = 'json' | 'curl'

export function PlaygroundCodeDrawer(props: PlaygroundCodeDrawerProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const [tab, setTab] = useState<CodeTab>('json')

  const baseUrl =
    typeof status?.server_address === 'string' ? status.server_address : ''
  const requestPath = props.requestPath ?? REQUEST_PREVIEW_PATH
  const content =
    tab === 'json'
      ? buildJsonPreview(props.payload)
      : buildCurlPreview(props.payload, baseUrl || undefined, {
          path: requestPath,
          headers: props.previewHeaders,
        })

  return (
    <div className='pg-chat-drawer' hidden={!props.open}>
      <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
        <div
          className='console-subtabs'
          role='group'
          aria-label={t('Request preview')}
        >
          {(['json', 'curl'] as const).map((item) => (
            <button
              key={item}
              type='button'
              aria-pressed={tab === item}
              className={
                tab === item
                  ? 'console-subtab-btn is-active'
                  : 'console-subtab-btn'
              }
              onClick={() => setTab(item)}
            >
              {item === 'json' ? 'JSON' : 'cURL'}
            </button>
          ))}
        </div>
        <span className='console-head-meta'>
          <code className='mr-2 font-mono text-[11px]' lang='en'>
            POST {requestPath}
          </code>
          {tab === 'curl'
            ? t('The API example uses your key’s billing group.')
            : t('Only enabled parameters are sent with the request.')}
        </span>
      </div>

      <pre className='setup-snippet-pre max-h-64 overflow-auto rounded-xl'>
        <code>{content}</code>
      </pre>
    </div>
  )
}
