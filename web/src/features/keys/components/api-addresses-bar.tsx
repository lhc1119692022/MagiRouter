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
import { Loader2, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useApiInfo } from '@/features/dashboard/hooks/use-status-data'
import {
  getLatencyColorClass,
  testUrlLatency,
} from '@/features/dashboard/lib/api-info'
import type { PingStatus, PingStatusMap } from '@/features/dashboard/types'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

interface DisplayAddress {
  key: string
  url: string
  route: string
  description: string
  isDefault: boolean
}

function normalizeEndpointUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase()
}

function LatencyTestButton({
  url,
  status,
  onTest,
}: {
  url: string
  status?: PingStatus
  onTest: (targetUrl: string) => void
}) {
  const { t } = useTranslation()
  const isTesting = Boolean(status?.testing)
  const latency =
    !isTesting && typeof status?.latency === 'number' ? status.latency : null
  const isError = !isTesting && Boolean(status?.error)

  let tooltipText = t('Test latency')
  let ariaLabel = `${t('Test latency')}: ${url}`
  if (isTesting) {
    tooltipText = t('Testing...')
    ariaLabel = `${t('Testing...')}: ${url}`
  } else if (latency !== null) {
    tooltipText = `${t('Test latency')} · ${t('Browser round trip; not model latency.')}`
    ariaLabel = `${t('Test latency')}: ${url} (${latency}ms)`
  } else if (isError) {
    tooltipText = `${t('Test failed')} · ${t('Retry')}`
    ariaLabel = `${t('Test failed')}: ${url}`
  }

  const button = (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      disabled={isTesting}
      className={cn(
        'shrink-0 rounded-md',
        latency !== null || isError
          ? 'h-6 w-auto gap-1 px-1.5 text-[11px] font-medium'
          : 'text-muted-foreground hover:text-foreground size-6',
        latency !== null && getLatencyColorClass(latency),
        isError && 'text-destructive hover:text-destructive'
      )}
      onClick={() => onTest(url)}
      aria-label={ariaLabel}
    >
      {isTesting ? (
        <Loader2 className='size-3.5 animate-spin' aria-hidden='true' />
      ) : (
        <Zap
          className={cn(latency !== null || isError ? 'size-3' : 'size-3.5')}
          aria-hidden='true'
        />
      )}
      {latency !== null && (
        <span className='font-mono leading-none tabular-nums'>{latency}ms</span>
      )}
      {isError && <span className='leading-none'>{t('Failed')}</span>}
    </Button>
  )

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  )
}

export function ApiAddressesBar() {
  const { t } = useTranslation()
  const { status, loading } = useStatus()
  const { items } = useApiInfo()
  const [measurements, setMeasurements] = useState<PingStatusMap>({})
  const inFlight = useRef(new Map<string, AbortController>())

  const serverAddress =
    (typeof status?.server_address === 'string' &&
      status.server_address.trim()) ||
    ''

  const addresses = useMemo<DisplayAddress[]>(() => {
    if (items.length > 0) {
      const normalizedServer = serverAddress
        ? normalizeEndpointUrl(serverAddress)
        : ''
      const matchedIndex = normalizedServer
        ? items.findIndex(
            (item) => normalizeEndpointUrl(item.url) === normalizedServer
          )
        : -1
      const defaultIndex = matchedIndex >= 0 ? matchedIndex : 0

      return items.map((item, index) => ({
        key: String(item.id ?? `${item.url}-${item.route}-${index}`),
        url: item.url,
        route: item.route,
        description: item.description ?? '',
        isDefault: index === defaultIndex,
      }))
    }

    const fallbackUrl = serverAddress || window.location.origin
    return [
      {
        key: fallbackUrl,
        url: fallbackUrl,
        route: serverAddress ? t('Default API address') : t('Current domain'),
        description: '',
        isDefault: !serverAddress,
      },
    ]
  }, [items, serverAddress, t])

  useEffect(() => {
    const activeUrls = new Set(addresses.map((address) => address.url))
    for (const [url, controller] of inFlight.current.entries()) {
      if (!activeUrls.has(url)) {
        controller.abort()
        inFlight.current.delete(url)
      }
    }
  }, [addresses])

  useEffect(() => {
    const active = inFlight.current
    return () => {
      for (const controller of active.values()) {
        controller.abort()
      }
      active.clear()
    }
  }, [])

  const measure = async (url: string) => {
    if (inFlight.current.has(url)) return
    const controller = new AbortController()
    inFlight.current.set(url, controller)
    setMeasurements((previous) => ({
      ...previous,
      [url]: { latency: null, testing: true, error: false },
    }))
    try {
      const result = await testUrlLatency(url, controller.signal)
      if (!controller.signal.aborted) {
        setMeasurements((previous) => ({ ...previous, [url]: result }))
      } else {
        setMeasurements((previous) => {
          if (!previous[url]?.testing) return previous
          const next = { ...previous }
          delete next[url]
          return next
        })
      }
    } finally {
      if (inFlight.current.get(url) === controller) {
        inFlight.current.delete(url)
      }
    }
  }

  return (
    <section aria-label={t('API Addresses')} className='shrink-0'>
      {loading ? (
        <LoadingState inline size='sm' message={t('Loading...')} />
      ) : (
        <div
          role='list'
          className='flex flex-row flex-wrap items-center gap-2.5'
        >
          {addresses.map((address) => {
            const routeLabel = (
              <span className='text-foreground text-[13px] font-medium whitespace-nowrap'>
                {address.route}
              </span>
            )

            return (
              <div
                key={address.key}
                role='listitem'
                className='keys-address-chip inline-flex min-h-8 w-fit max-w-full flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-1.5 text-xs'
              >
                <div className='inline-flex shrink-0 items-center gap-1.5'>
                  {address.description ? (
                    <Tooltip>
                      <TooltipTrigger render={routeLabel} />
                      <TooltipContent>
                        <p>{address.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    routeLabel
                  )}
                  {address.isDefault && (
                    <span className='inline-flex items-center rounded bg-teal-500/12 px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap text-teal-700 dark:bg-teal-400/15 dark:text-teal-300'>
                      {t('Default')}
                    </span>
                  )}
                </div>

                <span
                  aria-hidden='true'
                  className='bg-border h-3.5 w-px shrink-0'
                />

                <div className='inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5'>
                  <code className='text-foreground/80 font-mono text-xs break-all select-text'>
                    {address.url}
                  </code>
                  <div className='inline-flex shrink-0 items-center gap-0.5'>
                    <CopyButton
                      value={address.url}
                      variant='ghost'
                      size='icon'
                      className='text-muted-foreground hover:text-foreground size-6 rounded-md'
                      iconClassName='size-3.5'
                      tooltip={t('Copy API URL')}
                      aria-label={`${t('Copy API URL')}: ${address.url}`}
                    />
                    <LatencyTestButton
                      url={address.url}
                      status={measurements[address.url]}
                      onTest={(targetUrl) => void measure(targetUrl)}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
