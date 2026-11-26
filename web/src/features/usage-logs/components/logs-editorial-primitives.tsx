import { cn } from '@/lib/utils'

import { parseTaskProgressPercent, type LogsStatusTone } from '../lib/editorial'

export interface LogsStatItem {
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'warn' | 'err'
}

export function LogsStatStrip(props: {
  items: readonly LogsStatItem[]
  className?: string
}) {
  return (
    <div className={cn('logs-stat-strip', props.className)}>
      {props.items.map((item) => (
        <div key={item.label} className='logs-stat-cell'>
          <span className='logs-stat-label'>{item.label}</span>
          <div className='logs-stat-val-row'>
            <span
              className={cn(
                'logs-stat-val',
                item.tone === 'warn' && 'is-warn',
                item.tone === 'err' && 'is-err'
              )}
            >
              {item.value}
            </span>
            {item.sub ? (
              <span className='logs-stat-sub'>{item.sub}</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export function LogsStatusPill(props: {
  label: string
  tone?: LogsStatusTone
  className?: string
}) {
  const tone = props.tone ?? 'success'
  return (
    <span
      className={cn(
        'logs-status-pill',
        tone === 'running' && 'is-run',
        tone === 'warn' && 'is-warn',
        tone === 'err' && 'is-err',
        tone === 'muted' && 'is-muted',
        props.className
      )}
    >
      <span className='logs-status-dot' aria-hidden='true' />
      {props.label}
    </span>
  )
}

export function LogsProgressBar(props: {
  progress?: string | null
  failed?: boolean
  trailing?: string
}) {
  const raw = props.progress?.trim() ?? ''
  if (!raw) {
    return <span className='text-muted-foreground/60 text-xs'>-</span>
  }
  const percent = parseTaskProgressPercent(raw)
  if (percent === null) {
    return <span className='logs-mono'>{raw}</span>
  }
  return (
    <div className='logs-progress-wrap'>
      <div className='logs-progress-top'>
        <span className='logs-progress-pct'>{percent}%</span>
        {props.trailing ? (
          <span className='logs-sub-meta font-mono text-[11px]'>
            {props.trailing}
          </span>
        ) : null}
      </div>
      <div className='logs-progress-track'>
        <div
          className={cn('logs-progress-fill', props.failed && 'is-err')}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
