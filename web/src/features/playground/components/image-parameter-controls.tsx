import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

import {
  formatPixelDisplay,
  resolveSizeFromSpec,
  resolveTierRatioFromPixelSize,
  validateSeedreamPixelSize,
  type ImageAspectRatio,
  type ImageBackgroundMode,
  type ImageModelProfile,
  type ImageOutputFormat,
  type ImageStudioParams,
  type OpenAIImageQuality,
} from '../lib/image-model-params'

interface ImageParameterControlsProps {
  profile: ImageModelProfile
  params: ImageStudioParams
  referenceCount: number
  disabled?: boolean
  onChange: (patch: Partial<ImageStudioParams>) => void
}

function getBackgroundLabelKey(mode: ImageBackgroundMode): string {
  if (mode === 'transparent') return 'Transparent (RGBA)'
  if (mode === 'opaque') return 'Opaque (RGB)'
  return 'Auto'
}

export function ImageParameterControls(props: ImageParameterControlsProps) {
  const { t } = useTranslation()
  const layerMode =
    props.profile.supportsLayerDecomposition && props.params.layerDecomposition
  const sizeSpec = props.profile.sizeSpec
  const resolvedTierPixels = resolveSizeFromSpec(
    sizeSpec,
    props.params.sizeTier,
    props.params.aspectRatio
  )
  const pixelValidation =
    !layerMode && props.params.sizeMode === 'pixels'
      ? validateSeedreamPixelSize(props.params.pixelSize, props.profile)
      : null
  const maxSequentialImages = Math.max(1, 15 - props.referenceCount)

  const handleSizeModeSwitch = (nextMode: 'tier' | 'pixels') => {
    if (nextMode === props.params.sizeMode) return
    if (nextMode === 'pixels') {
      props.onChange({
        sizeMode: 'pixels',
        pixelSize: resolvedTierPixels,
      })
      return
    }
    const matched = resolveTierRatioFromPixelSize(
      props.params.pixelSize,
      sizeSpec
    )
    props.onChange({
      sizeMode: 'tier',
      ...(matched
        ? { sizeTier: matched.sizeTier, aspectRatio: matched.aspectRatio }
        : {}),
    })
  }

  const handleOutputFormatChange = (fmt: ImageOutputFormat) => {
    if (fmt === 'jpeg' && props.params.background === 'transparent') {
      const fallbackBg =
        props.profile.defaultBackground === 'transparent'
          ? 'opaque'
          : props.profile.defaultBackground
      props.onChange({ outputFormat: fmt, background: fallbackBg })
      return
    }
    props.onChange({ outputFormat: fmt })
  }

  const handleBackgroundChange = (background: ImageBackgroundMode) => {
    if (background === 'transparent' && props.params.outputFormat === 'jpeg') {
      props.onChange({ background, outputFormat: 'png' })
      return
    }
    props.onChange({ background })
  }

  let pixelErrorMessage: string | null = null
  if (pixelValidation && !pixelValidation.valid) {
    if (pixelValidation.reason === 'format') {
      pixelErrorMessage = t(
        'Enter dimensions in WIDTHxHEIGHT format (e.g. 2048x2048).'
      )
    } else if (pixelValidation.reason === 'pixels') {
      pixelErrorMessage = t(
        'Total pixels are outside the supported range for this model.'
      )
    } else {
      pixelErrorMessage = t('Aspect ratio must stay between 1:16 and 16:1.')
    }
  }

  const renderSizeSelector = () => {
    if (layerMode) {
      return (
        <>
          <div className='pg-seg-row'>
            {props.profile.layerResolutionTiers.map((tier) => (
              <button
                key={tier}
                type='button'
                disabled={props.disabled}
                onClick={() => props.onChange({ layerSizeTier: tier })}
                className={cn(
                  'pg-seg-btn',
                  props.params.layerSizeTier === tier && 'is-active'
                )}
              >
                {tier}
              </button>
            ))}
          </div>
          <span className='pg-field-hint'>
            {t('Output aspect ratio follows the input image.')}
          </span>
        </>
      )
    }
    if (props.params.sizeMode === 'tier') {
      return (
        <>
          {sizeSpec.resolutionTiers.length > 0 && (
            <div className='pg-seg-row'>
              {sizeSpec.resolutionTiers.map((tier) => (
                <button
                  key={tier}
                  type='button'
                  disabled={props.disabled}
                  onClick={() => props.onChange({ sizeTier: tier })}
                  className={cn(
                    'pg-seg-btn',
                    props.params.sizeTier === tier && 'is-active'
                  )}
                >
                  {tier}
                </button>
              ))}
            </div>
          )}

          <div className='pg-size-combo-row'>
            <Select
              value={props.params.aspectRatio}
              disabled={props.disabled || sizeSpec.aspectRatios.length === 0}
              onValueChange={(value) => {
                if (value) {
                  props.onChange({ aspectRatio: value as ImageAspectRatio })
                }
              }}
            >
              <SelectTrigger
                aria-label={t('Aspect ratio')}
                className='pg-ratio-select'
              >
                <SelectValue>
                  <span className='pg-ratio-trigger-val'>
                    <span className='pg-ratio-trigger-label'>
                      {t('Aspect ratio')}
                    </span>
                    <span className='tabular-nums'>
                      {props.params.aspectRatio}
                    </span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent align='start' alignItemWithTrigger={false}>
                {sizeSpec.aspectRatios.map((ratio) => {
                  const ratioPixels = resolveSizeFromSpec(
                    sizeSpec,
                    props.params.sizeTier,
                    ratio
                  )
                  return (
                    <SelectItem key={ratio} value={ratio} aria-label={ratio}>
                      <span className='pg-ratio-option'>
                        <span className='pg-ratio-option-code tabular-nums'>
                          {ratio}
                        </span>
                        <span className='pg-ratio-option-px tabular-nums'>
                          {formatPixelDisplay(ratioPixels)}
                        </span>
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>

            <span
              className='pg-resolved-size-badge tabular-nums'
              data-testid='pg-resolved-pixel-size'
              title={t('Resolved width and height sent to the API')}
            >
              {formatPixelDisplay(resolvedTierPixels)} px
            </span>
          </div>
        </>
      )
    }
    return (
      <>
        <div className='pg-seg-row'>
          {sizeSpec.sizePresets.map((preset) => (
            <button
              key={preset.value}
              type='button'
              disabled={props.disabled}
              onClick={() => props.onChange({ pixelSize: preset.value })}
              className={cn(
                'pg-seg-btn',
                props.params.pixelSize === preset.value && 'is-active'
              )}
            >
              <span>{preset.value}</span>
              <span className='pg-seg-sub'>{preset.ratioLabel}</span>
            </button>
          ))}
        </div>
        <Input
          type='text'
          value={props.params.pixelSize}
          disabled={props.disabled}
          aria-label={t('Custom pixel size')}
          aria-invalid={Boolean(pixelErrorMessage)}
          placeholder={props.profile.defaultPixelSize}
          className='pg-ark-input'
          onChange={(event) =>
            props.onChange({ pixelSize: event.target.value })
          }
        />
        {pixelErrorMessage && (
          <p className='pg-field-error' role='alert'>
            {pixelErrorMessage}
          </p>
        )}
      </>
    )
  }

  return (
    <>
      {props.profile.supportsLayerDecomposition && (
        <div className='pg-field'>
          <div className='pg-toggle-item'>
            <div className='pg-toggle-copy'>
              <span className='pg-field-label'>{t('Layer decomposition')}</span>
              <span className='pg-field-hint'>
                {t(
                  'Split 1 image into 1 base + up to {{count}} transparent layers',
                  {
                    count: props.profile.maxLayers,
                  }
                )}
              </span>
            </div>
            <Switch
              size='sm'
              checked={props.params.layerDecomposition}
              disabled={props.disabled}
              aria-label={t('Layer decomposition')}
              onCheckedChange={(checked) =>
                props.onChange({ layerDecomposition: checked })
              }
            />
          </div>

          {layerMode && props.profile.supportsLayerDecompositionOptions && (
            <div className='pg-subpanel'>
              <div className='pg-field'>
                <div className='pg-field-head'>
                  <span className='pg-field-label'>
                    {t('Max output images')}
                  </span>
                  <span className='pg-slider-val tabular-nums'>
                    {props.params.layerMaxImages}
                  </span>
                </div>
                <input
                  type='range'
                  min={2}
                  max={100}
                  step={1}
                  disabled={props.disabled}
                  aria-label={t('Max output images')}
                  value={props.params.layerMaxImages}
                  onChange={(event) =>
                    props.onChange({
                      layerMaxImages: Number(event.target.value),
                    })
                  }
                  className='w-full accent-black dark:accent-white'
                />
              </div>
              <div className='pg-toggle-item'>
                <span className='pg-field-label'>{t('Rich text OCR')}</span>
                <Switch
                  size='sm'
                  checked={props.params.layerTextRecognition}
                  disabled={props.disabled}
                  aria-label={t('Rich text OCR')}
                  onCheckedChange={(checked) =>
                    props.onChange({ layerTextRecognition: checked })
                  }
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className='pg-field'>
        <div className='pg-field-head'>
          <span className='pg-field-label'>{t('Image size')}</span>
          {!layerMode && sizeSpec.supportsCustomPixels && (
            <div
              className='pg-inline-switch'
              role='group'
              aria-label={t('Size mode')}
            >
              <button
                type='button'
                disabled={props.disabled}
                className={cn(
                  'pg-inline-switch-btn',
                  props.params.sizeMode === 'tier' && 'is-active'
                )}
                onClick={() => handleSizeModeSwitch('tier')}
              >
                {t('Resolution tier')}
              </button>
              <button
                type='button'
                disabled={props.disabled}
                className={cn(
                  'pg-inline-switch-btn',
                  props.params.sizeMode === 'pixels' && 'is-active'
                )}
                onClick={() => handleSizeModeSwitch('pixels')}
              >
                {t('Custom pixels')}
              </button>
            </div>
          )}
        </div>

        {renderSizeSelector()}
      </div>

      {!props.profile.isSeedream && (
        <>
          <div className='pg-field'>
            <span className='pg-field-label'>{t('Quality')}</span>
            <div className='pg-seg-row'>
              {(['auto', 'low', 'medium', 'high'] as OpenAIImageQuality[]).map(
                (level) => (
                  <button
                    key={level}
                    type='button'
                    disabled={props.disabled}
                    onClick={() => props.onChange({ quality: level })}
                    className={cn(
                      'pg-seg-btn',
                      props.params.quality === level && 'is-active'
                    )}
                  >
                    {level}
                  </button>
                )
              )}
            </div>
          </div>

          <div className='pg-field'>
            <div className='pg-field-head'>
              <span className='pg-field-label'>{t('Image count')}</span>
              <span className='pg-slider-val'>
                {props.params.imageCount} 张
              </span>
            </div>
            <div className='pg-seg-row'>
              {([1, 2, 4] as const).map((count) => (
                <button
                  key={count}
                  type='button'
                  disabled={props.disabled}
                  onClick={() => props.onChange({ imageCount: count })}
                  className={cn(
                    'pg-seg-btn',
                    props.params.imageCount === count && 'is-active'
                  )}
                >
                  {count} 张
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {props.profile.outputFormats.length > 0 && (
        <div className='pg-field'>
          <span className='pg-field-label'>{t('Output format')}</span>
          <div className='pg-seg-row'>
            {props.profile.outputFormats.map((fmt) => (
              <button
                key={fmt}
                type='button'
                disabled={props.disabled}
                onClick={() => handleOutputFormatChange(fmt)}
                className={cn(
                  'pg-seg-btn',
                  props.params.outputFormat === fmt && 'is-active'
                )}
              >
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
          {layerMode && (
            <span className='pg-field-hint'>
              {t(
                'Applies to the base image only; extracted layers always output PNG.'
              )}
            </span>
          )}
        </div>
      )}

      {props.profile.backgroundOptions.length > 0 && !layerMode && (
        <div className='pg-field'>
          <span className='pg-field-label'>{t('Background alpha')}</span>
          <div className='pg-seg-row'>
            {props.profile.backgroundOptions.map((bg) => (
              <button
                key={bg}
                type='button'
                disabled={props.disabled}
                onClick={() => handleBackgroundChange(bg)}
                className={cn(
                  'pg-seg-btn',
                  props.params.background === bg && 'is-active'
                )}
              >
                {t(getBackgroundLabelKey(bg))}
              </button>
            ))}
          </div>
        </div>
      )}

      {props.profile.optimizePromptModes.length > 1 && (
        <div className='pg-field'>
          <span className='pg-field-label'>{t('Prompt optimization')}</span>
          <div className='pg-seg-row'>
            {props.profile.optimizePromptModes.map((optMode) => (
              <button
                key={optMode}
                type='button'
                disabled={props.disabled}
                onClick={() => props.onChange({ optimizePromptMode: optMode })}
                className={cn(
                  'pg-seg-btn',
                  props.params.optimizePromptMode === optMode && 'is-active'
                )}
              >
                {optMode === 'standard' ? t('Standard') : t('Fast')}
              </button>
            ))}
          </div>
        </div>
      )}

      {props.profile.supportsSequentialGeneration && (
        <div className='pg-field'>
          <span className='pg-field-label'>
            {t('Sequential image generation')}
          </span>
          <div className='pg-seg-row'>
            {(['disabled', 'auto'] as const).map((seqMode) => (
              <button
                key={seqMode}
                type='button'
                disabled={props.disabled}
                onClick={() =>
                  props.onChange({ sequentialGeneration: seqMode })
                }
                className={cn(
                  'pg-seg-btn',
                  props.params.sequentialGeneration === seqMode && 'is-active'
                )}
              >
                {seqMode === 'disabled' ? t('Single image') : t('Auto group')}
              </button>
            ))}
          </div>

          {props.params.sequentialGeneration === 'auto' && (
            <div className='pg-subpanel'>
              <div className='pg-field-head'>
                <span className='pg-field-label'>{t('Max group images')}</span>
                <span className='pg-slider-val tabular-nums'>
                  {Math.min(
                    props.params.sequentialMaxImages,
                    maxSequentialImages
                  )}
                </span>
              </div>
              <input
                type='range'
                min={1}
                max={maxSequentialImages}
                step={1}
                disabled={props.disabled}
                aria-label={t('Max group images')}
                value={Math.min(
                  props.params.sequentialMaxImages,
                  maxSequentialImages
                )}
                onChange={(event) =>
                  props.onChange({
                    sequentialMaxImages: Number(event.target.value),
                  })
                }
                className='w-full accent-black dark:accent-white'
              />
              <span className='pg-field-hint'>
                {t('Reference images + generated images must not exceed 15.')}
              </span>
            </div>
          )}
        </div>
      )}

      {props.profile.supportsResponseFormat && (
        <div className='pg-field'>
          <span className='pg-field-label'>{t('Response format')}</span>
          <div className='pg-seg-row'>
            {(['url', 'b64_json'] as const).map((fmt) => (
              <button
                key={fmt}
                type='button'
                disabled={props.disabled}
                onClick={() => props.onChange({ responseFormat: fmt })}
                className={cn(
                  'pg-seg-btn',
                  props.params.responseFormat === fmt && 'is-active'
                )}
              >
                {fmt === 'url' ? 'URL' : 'Base64'}
              </button>
            ))}
          </div>
        </div>
      )}

      {props.profile.supportsStream && (
        <div className='pg-toggle-grid'>
          <div className='pg-toggle-item'>
            <span className='pg-field-label'>{t('Stream output')}</span>
            <Switch
              size='sm'
              checked={props.params.stream}
              disabled={props.disabled}
              aria-label={t('Stream output')}
              onCheckedChange={(checked) => props.onChange({ stream: checked })}
            />
          </div>
        </div>
      )}
    </>
  )
}
