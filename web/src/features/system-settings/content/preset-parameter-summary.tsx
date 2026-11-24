import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { mediaLabels, type CreationPreset } from '@/features/creation/presets'
import { PLAYGROUND_PARAMETER_CONTROLS } from '@/features/playground/lib/parameters/playground-parameters'

const parameterLabels: Record<string, string> = {
  ...Object.fromEntries(
    PLAYGROUND_PARAMETER_CONTROLS.map((field) => [field.key, field.labelKey])
  ),
  reasoning_effort: 'Reasoning Effort',
  imageTask: 'Task',
  videoTask: 'Task',
  imageSize: 'Output image size',
  quality: 'Quality',
  imageCount: 'Image count',
  imageFormat: 'Output Format',
  resolution: 'Resolution',
  aspectRatio: 'Aspect Ratio',
  duration: 'Video Duration',
  nativeAudio: 'Generate Native Audio',
  voice: 'Voice',
  audioFormat: 'Output Format',
  speed: 'Speed',
}

export function PresetParameterSummary(props: { item: CreationPreset }) {
  const { t } = useTranslation()
  const parameters = Object.entries(props.item.parameters ?? {})
  const tasks: Record<string, string> = {
    generate: t('Text to Image'),
    edit: t('Image to image'),
    t2v: t('Text to Video'),
    i2v: t('Image to Video'),
    ref2v: t('Multi-reference video'),
  }
  return (
    <section
      aria-label={t('Parameters')}
      className='bg-muted/35 grid gap-3 rounded-md border p-3 text-sm'
    >
      <div className='flex min-w-0 flex-wrap items-center gap-2'>
        <Badge variant='secondary'>{t(mediaLabels[props.item.mode])}</Badge>
        <span className='font-mono break-all'>{props.item.model}</span>
      </div>
      {parameters.length ? (
        <dl className='grid gap-x-4 gap-y-1 sm:grid-cols-2'>
          {parameters.map(([key, value]) => {
            let display = String(value)
            if (typeof value === 'boolean') display = value ? t('Yes') : t('No')
            if (key === 'imageTask' || key === 'videoTask') {
              display = tasks[String(value)]
            }
            let label = t(parameterLabels[key] ?? key)
            if (key === 'cameraFixed') label = t('Fixed camera')
            if (key === 'instructions') label = t('Voice instructions')
            return (
              <div
                key={key}
                className='flex min-w-0 flex-wrap justify-between gap-x-2'
              >
                <dt className='text-muted-foreground'>{label}</dt>
                <dd className='min-w-0 break-words whitespace-pre-wrap'>
                  {display}
                </dd>
              </div>
            )
          })}
        </dl>
      ) : (
        <p className='text-muted-foreground'>{t('Use provider default')}</p>
      )}
    </section>
  )
}
