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
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Copy } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { getApiKeys, resolveApiKeyValue } from '@/features/keys/api'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

const QUICK_KEY_COUNT = 4

export function QuickKeysPanel() {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const [copying, setCopying] = useState(false)

  const query = useQuery({
    queryKey: ['dashboard', 'overview', 'quick-keys'],
    queryFn: async () =>
      requireServerSuccess(await getApiKeys({ p: 1, size: QUICK_KEY_COUNT })),
    staleTime: 60 * 1000,
  })

  const keys = (query.data?.data?.items ?? []).filter((item) => item.key)
  const masked = (key: string) => `sk-${key.slice(0, 3)}${'•'.repeat(12)}`
  let emptyMessage = t('No data available')
  if (query.isPending) emptyMessage = t('Loading')
  if (query.isError) emptyMessage = t('Failed to load API keys')

  return (
    <div className='dash-panel is-compact'>
      <div className='dash-panel-head'>
        <h2 className='dash-panel-title'>{t('API Keys')}</h2>
        <Link className='dash-panel-link' to='/keys'>
          {t('View all')}
        </Link>
      </div>

      {keys.length === 0 ? (
        <p className='text-muted-foreground py-5 text-center text-xs'>
          {emptyMessage}
        </p>
      ) : (
        <div className='dash-quick-keys'>
          {keys.map((item) => (
            <div className='dash-qkey-row' key={item.id}>
              <div className='min-w-0 flex-1'>
                <div className='dash-qkey-name truncate'>
                  {item.name || t('Default')}
                </div>
                <div className='dash-qkey-meta'>
                  {item.key ? masked(item.key) : ''}
                </div>
                <div className='dash-qkey-meta'>
                  {formatQuota(item.remain_quota ?? 0)}
                </div>
              </div>
              <Button
                variant='ghost'
                size='icon'
                disabled={copying}
                onClick={async () => {
                  setCopying(true)
                  try {
                    await copyToClipboard(await resolveApiKeyValue(item.id))
                  } catch (error) {
                    handleServerError(error, t('Failed to copy to clipboard'))
                  } finally {
                    setCopying(false)
                  }
                }}
                aria-label={t('Copy')}
                className='size-7 shrink-0'
              >
                <Copy className='size-4' aria-hidden='true' />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
