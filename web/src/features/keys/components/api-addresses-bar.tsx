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
import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { LoadingState } from '@/components/loading-state'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { useApiInfo } from '@/features/dashboard/hooks/use-status-data'
import { useStatus } from '@/hooks/use-status'

export function ApiAddressesBar() {
  const { t } = useTranslation()
  const { status, loading } = useStatus()
  const { items } = useApiInfo()
  const serverAddress =
    (typeof status?.server_address === 'string' &&
      status.server_address.trim()) ||
    ''
  const addresses = items.length
    ? items
    : [
        {
          url: serverAddress || window.location.origin,
          route: serverAddress ? t('Default API address') : t('Current domain'),
          description: '',
        },
      ]

  return (
    <section
      aria-label={t('API Addresses')}
      className='flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3'
    >
      <div className='text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-xs font-medium whitespace-nowrap'>
        <Globe className='size-3.5 shrink-0' aria-hidden='true' />
        <span>{t('API Addresses')}</span>
      </div>

      {loading ? (
        <LoadingState inline size='sm' message={t('Loading...')} />
      ) : (
        <ItemGroup className='min-w-0 flex-1 flex-row flex-wrap items-stretch gap-2'>
          {addresses.map((address) => (
            <Item
              key={address.url}
              role='listitem'
              variant='outline'
              size='xs'
              className='bg-muted/35 w-auto min-w-0 flex-1 basis-[280px] flex-nowrap items-center justify-between gap-2.5 rounded-lg px-3 py-2'
            >
              <ItemContent className='min-w-0 gap-0.5'>
                <div className='flex flex-wrap items-baseline gap-x-2 gap-y-0.5'>
                  <ItemTitle className='line-clamp-none text-xs font-semibold break-all'>
                    {address.route}
                  </ItemTitle>
                  <code className='text-foreground/90 font-mono text-xs break-all select-text'>
                    {address.url}
                  </code>
                </div>
                {address.description && (
                  <ItemDescription className='line-clamp-none text-xs break-words'>
                    {address.description}
                  </ItemDescription>
                )}
              </ItemContent>
              <ItemActions className='shrink-0'>
                <CopyButton
                  value={address.url}
                  size='sm'
                  tooltip={t('Copy API URL')}
                  aria-label={`${t('Copy API URL')}: ${address.url}`}
                />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </section>
  )
}
