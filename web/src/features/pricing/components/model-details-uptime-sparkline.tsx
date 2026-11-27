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
import { useTranslation } from 'react-i18next'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  formatUptimePct,
  getSuccessRateDotClass,
  getSuccessRateTextClass,
  shouldAllowCriticalSuccessRate,
} from '@/features/performance-metrics/lib/format'
import type { SuccessRatePoint } from '@/features/performance-metrics/types'
import { formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { isMeasuredRate } from '../lib/monitored-requests'

type SparklineSize = 'sm' | 'md'

type UptimeSparklineProps = {
  series: SuccessRatePoint[]
  overallSuccessRate?: number
  size?: SparklineSize
  className?: string
}

function heightFor(uptime: number): string {
  if (uptime >= 95.0) return 'h-full'
  if (uptime >= 80.0) return 'h-[80%]'
  if (uptime >= 30.0) return 'h-[60%]'
  return 'h-[40%]'
}

export function UptimeSparkline(props: UptimeSparklineProps) {
  const { t } = useTranslation()
  const size = props.size ?? 'md'
  const overall = props.overallSuccessRate

  if (props.series.length === 0 && !isMeasuredRate(overall)) {
    return (
      <span className={cn('text-muted-foreground text-xs', props.className)}>
        {t('Not monitored')}
      </span>
    )
  }

  const containerHeight = size === 'sm' ? 'h-3.5' : 'h-5'
  const barWidth = size === 'sm' ? 'w-[3px]' : 'w-1'
  const gap = size === 'sm' ? 'gap-px' : 'gap-[2px]'
  const allowCritical = shouldAllowCriticalSuccessRate(
    isMeasuredRate(overall) ? overall : undefined,
    props.series.map((sample) => sample.success_rate)
  )

  return (
    <div className={cn('flex items-center gap-2', props.className)}>
      {props.series.length > 0 && (
        <div
          className={cn('flex items-end', containerHeight, gap)}
          role='img'
          aria-label={t('Sampled request success rates')}
        >
          {props.series.map((sample) => (
            <Tooltip key={sample.ts}>
              <TooltipTrigger
                render={
                  <div
                    className={cn(
                      'rounded-sm transition-opacity hover:opacity-80',
                      barWidth,
                      containerHeight,
                      'flex items-end'
                    )}
                  />
                }
              >
                <div
                  className={cn(
                    'w-full rounded-sm',
                    getSuccessRateDotClass(sample.success_rate, {
                      allowCritical,
                    }),
                    heightFor(sample.success_rate)
                  )}
                  aria-hidden
                />
              </TooltipTrigger>
              <TooltipContent side='top' className='font-mono text-xs'>
                <div className='font-medium'>
                  {formatTimestampToDate(sample.ts)}
                </div>
                <div>{formatUptimePct(sample.success_rate)}</div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
      {isMeasuredRate(overall) && (
        <span
          className={cn(
            'font-mono text-sm font-semibold tabular-nums',
            getSuccessRateTextClass(overall)
          )}
        >
          {formatUptimePct(overall)}
        </span>
      )}
    </div>
  )
}
