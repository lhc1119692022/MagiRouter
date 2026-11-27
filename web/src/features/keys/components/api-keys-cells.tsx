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
import { Check, Copy, Loader2 } from 'lucide-react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { BadgeCell } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { copyToClipboard } from '@/lib/copy-to-clipboard'

import type { ApiKey } from '../types'
import { useApiKeys } from './api-keys-provider'

export function ApiKeyCell({ apiKey }: { apiKey: ApiKey }) {
  const { t } = useTranslation()
  const {
    resolveRealKey,
    resolvedKeys,
    loadingKeys,
    copiedKeyId,
    markKeyCopied,
  } = useApiKeys()

  const isLoading = !!loadingKeys[apiKey.id]
  const resolvedFullKey = resolvedKeys[apiKey.id]
  const isCopied = copiedKeyId === apiKey.id
  const maskedKey = `sk-${apiKey.key}`

  const handleCopy = useCallback(async () => {
    const realKey = resolvedFullKey || (await resolveRealKey(apiKey.id))
    if (!realKey) return

    const ok = await copyToClipboard(realKey)
    if (ok) markKeyCopied(apiKey.id)
  }, [resolvedFullKey, resolveRealKey, apiKey.id, markKeyCopied])

  let copyIcon = <Copy className='size-3.5' />
  let copyTooltip = t('Copy API key')
  if (isLoading) {
    copyIcon = <Loader2 className='size-3.5 animate-spin' />
    copyTooltip = t('Loading...')
  } else if (isCopied) {
    copyIcon = <Check className='size-3.5 text-green-600' />
    copyTooltip = t('Copied!')
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type='button'
            className='key-secret-cell'
            onClick={handleCopy}
            disabled={isLoading}
            aria-label={copyTooltip}
          />
        }
      >
        <span className='key-secret-code'>{maskedKey}</span>
        <span className='key-icon-btn' aria-hidden='true'>
          {copyIcon}
        </span>
      </TooltipTrigger>
      <TooltipContent>{copyTooltip}</TooltipContent>
    </Tooltip>
  )
}

type ApiKeyRestrictionProps = {
  apiKey: ApiKey
  detailsTrigger?: 'hover' | 'click'
}

export function ModelLimitsCell(props: ApiKeyRestrictionProps) {
  const { t } = useTranslation()
  const models = props.apiKey.model_limits_enabled
    ? (props.apiKey.model_limits || '').split(',').filter(Boolean)
    : []

  return (
    <ApiKeyRestrictionCell
      items={models}
      label={t('{{count}} models', { count: models.length })}
      title={t('Models')}
      emptyLabel={t('Unlimited')}
      detailsTrigger={props.detailsTrigger}
    />
  )
}

export function IpRestrictionsCell(props: ApiKeyRestrictionProps) {
  const { t } = useTranslation()
  const ips = (props.apiKey.allow_ips || '')
    .split('\n')
    .map((ip) => ip.trim())
    .filter(Boolean)

  return (
    <ApiKeyRestrictionCell
      items={ips}
      label={t('{{count}} IP(s)', { count: ips.length })}
      title={t('IP Restriction')}
      emptyLabel={t('No restriction')}
      detailsTrigger={props.detailsTrigger}
    />
  )
}

function ApiKeyRestrictionCell(props: {
  items: string[]
  label: string
  title: string
  emptyLabel: string
  detailsTrigger?: 'hover' | 'click'
}) {
  if (!props.items.length) {
    if (props.detailsTrigger === 'click') {
      return (
        <span className='inline-flex items-center gap-1.5 text-xs'>
          <span className='text-muted-foreground'>{props.title}</span>
          <span>{props.emptyLabel}</span>
        </span>
      )
    }
    return <span className='key-sub-note'>{props.emptyLabel}</span>
  }

  const details = (
    <div className='max-h-[200px] space-y-1 overflow-y-auto text-xs'>
      {props.items.map((item) => (
        <div key={item} className='font-mono break-all'>
          {item}
        </div>
      ))}
    </div>
  )

  if (props.detailsTrigger === 'click') {
    return (
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant='ghost'
              size='sm'
              aria-label={`${props.title}: ${props.label}`}
              className='h-7 max-w-full justify-start px-0 text-xs font-normal underline decoration-dotted underline-offset-4'
            />
          }
        >
          {props.label}
        </PopoverTrigger>
        <PopoverContent align='start' className='max-w-[calc(100vw-2rem)]'>
          <PopoverTitle>{props.title}</PopoverTitle>
          {details}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<BadgeCell />}>
        <span className='key-limit-chip'>{props.label}</span>
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-xs'>
        {details}
      </TooltipContent>
    </Tooltip>
  )
}
