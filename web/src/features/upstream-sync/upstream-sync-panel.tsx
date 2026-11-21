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
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  RefreshCw,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { getUpstreamCompareUrl, UPSTREAM_REPO } from './lib'
import { useUpstreamSync } from './use-upstream-sync'

const SYNC_COMMANDS = [
  'git fetch upstream',
  'git merge upstream/main',
  'git push origin HEAD',
].join('\n')

function formatDay(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function UpstreamSyncPanel() {
  const { t } = useTranslation()
  const sync = useUpstreamSync()

  if (!sync.enabled) return null

  const compareUrl = getUpstreamCompareUrl(sync.meta?.upstreamBase ?? null)
  const behind = sync.state === 'behind'
  const head = sync.commits.slice(0, 8)

  let upstreamHint = t('Checking...')
  if (!sync.loading && sync.error === 'rate-limit') {
    upstreamHint = t('GitHub rate limit reached. Try again later.')
  } else if (!sync.loading) {
    upstreamHint = t(
      'Could not reach GitHub from this browser. Use the compare link to check manually.'
    )
  }

  const gapText = sync.gap.matched
    ? t('{{n}} upstream commits not merged yet', { n: sync.gap.count })
    : t('More than {{n}} upstream commits not merged yet', { n: sync.gap.count })

  let syncStatus: ReactNode
  if (sync.state === 'up-to-date') {
    syncStatus = (
      <>
        <CheckCircle2 className='size-4 text-emerald-600' aria-hidden='true' />
        {t('Up to date with upstream')}
      </>
    )
  } else if (sync.state === 'behind') {
    syncStatus = (
      <>
        <AlertTriangle className='size-4 text-amber-600' aria-hidden='true' />
        <span>{gapText}</span>
      </>
    )
  } else {
    syncStatus = (
      <span className='text-muted-foreground text-xs'>
        {t(
          'This build does not record an upstream base, so the gap cannot be measured.'
        )}
      </span>
    )
  }

  return (
    <section className='bg-card overflow-hidden rounded-lg border shadow-xs'>
      <div className='flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='bg-muted text-muted-foreground inline-flex size-7 items-center justify-center rounded-md'>
            <GitBranch className='size-4' aria-hidden='true' />
          </span>
          <div className='min-w-0'>
            <h3 className='text-sm font-semibold'>{t('Upstream sync')}</h3>
            <p className='text-muted-foreground mt-0.5 text-xs'>
              {t(
                'Track the official repository so every deployment can state exactly which upstream commits it contains.'
              )}
            </p>
          </div>
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={sync.refresh}
          disabled={sync.refreshing}
          data-no-press
        >
          <RefreshCw
            className={cn('size-3.5', sync.refreshing && 'animate-spin')}
            aria-hidden='true'
          />
          {sync.refreshing ? t('Checking...') : t('Check now')}
        </Button>
      </div>

      <div className='space-y-4 p-4 sm:p-5'>
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='rounded-lg border p-3.5'>
            <div className='text-muted-foreground text-xs'>
              {t('Running build')}
            </div>
            <div className='mt-1 font-mono text-sm break-all'>
              {sync.meta?.version ?? t('Unknown')}
            </div>
            <div className='text-muted-foreground mt-2 flex flex-wrap items-center gap-1.5 text-xs'>
              <span>{t('Build commit')}</span>
              {sync.meta?.commit ? (
                <Badge variant='outline' className='font-mono'>
                  {sync.meta.commit.slice(0, 7)}
                </Badge>
              ) : (
                <span>{t('not stamped')}</span>
              )}
              <span aria-hidden='true'>·</span>
              <span>{t('Upstream base')}</span>
              {sync.meta?.upstreamBase ? (
                <Badge variant='outline' className='font-mono'>
                  {sync.meta.upstreamBase.slice(0, 7)}
                </Badge>
              ) : (
                <span>{t('not recorded')}</span>
              )}
            </div>
          </div>

          <div className='rounded-lg border p-3.5'>
            <div className='text-muted-foreground text-xs'>
              {t('Upstream main')} · {UPSTREAM_REPO}
            </div>
            {sync.latest ? (
              <>
                <div className='mt-1 flex items-center gap-2'>
                  <Badge variant='outline' className='font-mono'>
                    {sync.latest.shortSha}
                  </Badge>
                  <span className='truncate text-sm'>{sync.latest.message}</span>
                </div>
                <div className='text-muted-foreground mt-2 text-xs'>
                  {formatDay(sync.latest.authoredAt)}
                  {sync.latest.authorName ? ` · ${sync.latest.authorName}` : ''}
                </div>
              </>
            ) : (
              <div className='text-muted-foreground mt-2 text-xs'>
                {upstreamHint}
              </div>
            )}
          </div>
        </div>

        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex items-center gap-2 text-sm' aria-live='polite'>
            {syncStatus}
          </div>
          <a
            href={compareUrl}
            target='_blank'
            rel='noreferrer'
            className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline'
          >
            {t('Open on GitHub')}
            <ExternalLink className='size-3' aria-hidden='true' />
          </a>
        </div>

        {behind && head.length > 0 && (
          <ul className='divide-y rounded-lg border text-sm'>
            {head.map((commit) => (
              <li
                key={commit.sha}
                className='flex items-start gap-3 px-3.5 py-2.5'
              >
                <code className='text-muted-foreground mt-0.5 shrink-0 font-mono text-xs'>
                  {commit.shortSha}
                </code>
                <span className='min-w-0 flex-1'>{commit.message}</span>
                <span className='text-muted-foreground shrink-0 text-xs'>
                  {formatDay(commit.authoredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <details className='group rounded-lg border'>
          <summary className='text-muted-foreground cursor-pointer list-none px-3.5 py-2.5 text-xs select-none'>
            {t('How to merge upstream changes')}
          </summary>
          <div className='border-t px-3.5 py-3'>
            <pre className='bg-muted/40 overflow-x-auto rounded-md p-3 font-mono text-xs leading-relaxed'>
              {SYNC_COMMANDS}
            </pre>
            <div className='mt-2 flex items-center justify-between gap-2'>
              <span className='text-muted-foreground text-xs'>
                {t(
                  'Resolve conflicts, rebuild, then deploy the new commit. The version stamp updates automatically.'
                )}
              </span>
              <CopyButton value={SYNC_COMMANDS} size='sm' variant='outline' />
            </div>
          </div>
        </details>
      </div>
    </section>
  )
}
