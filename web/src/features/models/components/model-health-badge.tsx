import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

import type { ModelHealthReport } from '../lib/model-health'
import type { Model } from '../types'

export function ModelHealthBadge(props: {
  model: Model
  report: ModelHealthReport
  canPrice: boolean
  onEditMetadata: (model: Model) => void
  onEditPricing: (model: Model) => void
}) {
  const { t } = useTranslation()
  const report = props.report

  if (!report.needsConfirmation) {
    return (
      <StatusBadge
        variant='success'
        icon={CheckCircle2}
        label={t('Confirmed')}
        size='sm'
        copyable={false}
      />
    )
  }

  const isWarning = report.warningCount > 0
  const badgeLabel = isWarning
    ? t('{{count}} to confirm', { count: report.warningCount })
    : t('{{count}} suggested', { count: report.infoCount })
  const hasMetadataIssue = report.issues.some(
    (item) => item.action === 'metadata'
  )
  const hasPricingIssue =
    props.canPrice &&
    props.model.name_rule === 0 &&
    report.issues.some((item) => item.action === 'pricing')

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant='ghost'
            size='sm'
            aria-label={t('Configuration check for {{model}}: {{summary}}', {
              model: props.model.model_name,
              summary: badgeLabel,
            })}
            className='h-auto max-w-full min-w-0 cursor-pointer border-0 p-0'
          />
        }
      >
        <StatusBadge
          variant={isWarning ? 'warning' : 'info'}
          icon={isWarning ? AlertTriangle : Info}
          label={badgeLabel}
          size='sm'
          copyable={false}
          title={undefined}
        />
      </PopoverTrigger>
      <PopoverContent
        role='dialog'
        className='w-80 max-w-[calc(100vw-2rem)] space-y-3 whitespace-normal'
        collisionPadding={16}
      >
        <div className='space-y-1'>
          <PopoverTitle>{t('Configuration check')}</PopoverTitle>
          <PopoverDescription>
            {t('Review incomplete or potentially inaccurate model settings.')}
          </PopoverDescription>
        </div>
        <ul className='space-y-2 text-xs'>
          {report.issues.map((issue) => (
            <li
              key={issue.code}
              className='bg-muted/40 flex items-start gap-2 rounded-md border p-2'
            >
              {issue.severity === 'warning' ? (
                <AlertTriangle
                  className='text-warning mt-0.5 size-3.5 shrink-0'
                  aria-hidden='true'
                />
              ) : (
                <Info
                  className='text-info mt-0.5 size-3.5 shrink-0'
                  aria-hidden='true'
                />
              )}
              <div className='min-w-0 space-y-0.5'>
                <div className='text-foreground font-medium'>
                  {t(issue.titleKey)}
                </div>
                <p className='text-muted-foreground leading-relaxed'>
                  {t(issue.descriptionKey)}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {(hasMetadataIssue || hasPricingIssue) && (
          <div className='flex flex-wrap justify-end gap-2 border-t pt-2'>
            {hasMetadataIssue && (
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => props.onEditMetadata(props.model)}
              >
                {props.model.id > 0 ? t('Edit metadata') : t('Create metadata')}
              </Button>
            )}
            {hasPricingIssue && (
              <Button
                type='button'
                size='sm'
                onClick={() => props.onEditPricing(props.model)}
              >
                {t('Verify pricing')}
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
