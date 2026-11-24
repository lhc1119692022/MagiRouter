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
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { openExternalSpeedTest } from '@/features/dashboard/lib/api-info'
import type { ApiInfoItem, PingStatus } from '@/features/dashboard/types'
import { toIntlLocale } from '@/i18n/languages'
import { getBgColorClass } from '@/lib/colors'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

interface ApiInfoItemProps {
  item: ApiInfoItem
  status?: PingStatus
  onTest: (url: string) => void
}

export function ApiInfoItemComponent(props: ApiInfoItemProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const item = props.item
  const status = props.status
  let pingLabel = t('Not tested')
  if (status?.testing) pingLabel = t('Testing...')
  else if (status?.error) pingLabel = t('Unavailable')
  else if (typeof status?.latency === 'number') {
    pingLabel = `${formatNumber(status.latency, locale)} ${t('ms')}`
  }

  return (
    <div className='dash-route-row' role='group' aria-label={item.route}>
      <div className='dash-route-info'>
        <a
          className='dash-route-url block hover:underline'
          href={item.url}
          target='_blank'
          rel='noopener noreferrer'
          title={t('Open in New Tab')}
        >
          {item.url}
        </a>
        <div className='dash-route-note'>
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant='link'
                  size='xs'
                  className='dash-route-details'
                />
              }
              aria-label={`${item.route}: ${t('Details')}`}
            >
              <span
                aria-hidden='true'
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  getBgColorClass(item.color)
                )}
              />
              <span className='truncate'>{item.route}</span>
              <ChevronDown aria-hidden='true' />
            </PopoverTrigger>
            <PopoverContent
              align='start'
              className='max-w-[calc(100vw-2rem)] break-words'
            >
              <PopoverTitle>{item.route}</PopoverTitle>
              {item.description && (
                <PopoverDescription>{item.description}</PopoverDescription>
              )}
              <Button
                variant='outline'
                size='sm'
                onClick={() => openExternalSpeedTest(item.url)}
              >
                {t('External Speed Test')}
              </Button>
            </PopoverContent>
          </Popover>
          <span
            className='dash-ping-badge tabular-nums'
            data-measured={typeof status?.latency === 'number'}
            aria-live='polite'
            title={t('Browser round trip; not model latency.')}
          >
            {pingLabel}
          </span>
        </div>
      </div>
      <div className='dash-route-actions'>
        <Button
          variant='ghost'
          size='sm'
          disabled={status?.testing}
          className='el-btn el-btn-xs el-btn-ghost'
          onClick={() => props.onTest(item.url)}
        >
          {t('Test latency')}
        </Button>
        <CopyButton
          value={item.url}
          aria-label={t('Copy')}
          variant='outline'
          size='sm'
          className='el-btn el-btn-xs el-btn-white'
          iconClassName='hidden'
        >
          {t('Copy')}
        </CopyButton>
      </div>
    </div>
  )
}
