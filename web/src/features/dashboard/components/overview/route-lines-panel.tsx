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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useApiInfo } from '@/features/dashboard/hooks/use-status-data'
import { testUrlLatency } from '@/features/dashboard/lib/api-info'
import type { ApiInfoItem, PingStatusMap } from '@/features/dashboard/types'

import '@/styles/overview-publication.css'

import { ApiInfoItemComponent } from './api-info-item'

export function RouteLinesPanel() {
  const publication = useApiInfo()
  if (!publication.enabled) return null
  return (
    <PublishedRoutes items={publication.items} failed={publication.failed} />
  )
}

function PublishedRoutes({
  items,
  failed,
}: {
  items: ApiInfoItem[]
  failed: boolean
}) {
  const { t } = useTranslation()
  const [measurements, setMeasurements] = useState<PingStatusMap>({})
  const inFlight = useRef(new Map<string, AbortController>())
  useEffect(() => {
    const active = inFlight.current
    return () => {
      for (const request of active.values()) request.abort()
      active.clear()
    }
  }, [])

  const measure = async (url: string) => {
    if (inFlight.current.has(url)) return
    const request = new AbortController()
    inFlight.current.set(url, request)
    setMeasurements((previous) => ({
      ...previous,
      [url]: { latency: null, testing: true, error: false },
    }))
    try {
      const result = await testUrlLatency(url, request.signal)
      if (!request.signal.aborted) {
        setMeasurements((previous) => ({ ...previous, [url]: result }))
      }
    } finally {
      if (inFlight.current.get(url) === request) inFlight.current.delete(url)
    }
  }

  const measureAll = async () => {
    const urls = [...new Set(items.map((item) => item.url))]
    await Promise.all(urls.map(measure))
  }

  return (
    <section
      className='dash-panel is-compact overview-routes'
      aria-label={t('API routes')}
    >
      <div className='dash-panel-head'>
        <h2 className='dash-panel-title'>{t('API routes')}</h2>
        {items.length > 0 && (
          <Button
            variant='link'
            size='sm'
            className='dash-panel-link'
            disabled={items.some((item) => measurements[item.url]?.testing)}
            onClick={() => void measureAll()}
          >
            {t('Test all routes')}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className='text-muted-foreground py-4 text-center text-xs'>
          {failed ? t('Failed to load') : t('No API routes configured')}
        </p>
      ) : (
        <div className='dash-route-list'>
          {items.map((item) => (
            <ApiInfoItemComponent
              key={item.id ?? `${item.url}-${item.route}`}
              item={item}
              status={measurements[item.url]}
              onTest={measure}
            />
          ))}
        </div>
      )}
    </section>
  )
}
