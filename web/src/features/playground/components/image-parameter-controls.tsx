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
  isExperimentalPixelSize,
  resolveSizeFromSpec,
  resolveTierRatioFromPixelSize,
  validateImagePixelSize,
  type ImageAspectRatio,
  type ImageBackgroundMode,
  type ImageComplexity,
  type ImageInputFidelity,
  type ImageModelProfile,
  type ImageOutputFormat,
  type ImageQuality,
  type ImageStudioParams,
  type ImageStyleMode,
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

function formatSupportsTransparency(fmt: ImageOutputFormat): boolean {
  return fmt === 'png' || fmt === 'webp'
}

export function ImageParameterControls(props: ImageParameterControlsProps) {
  const { t } = useTranslation()
  const layerMode =
    props.profile.supportsLayerDecomposition && props.params.layerDecomposition
  const sizeSpec = props.profile.sizeSpec
  const isDiscreteSize = sizeSpec.strategy === 'discrete_presets'
  const isAutoTier =
    !layerMode &&
    !isDiscreteSize &&
    props.params.sizeMode === 'tier' &&
    props.params.sizeTier === 'auto'
  const resolvedTierPixels = resolveSizeFromSpec(
    sizeSpec,
    props.params.sizeTier,
    props.params.aspectRatio
  )
  const pixelValidation =
    !layerMode &&
    !isDiscreteSize &&
    sizeSpec.supportsCustomPixels &&
    props.params.sizeMode === 'pixels'
      ? validateImagePixelSize(props.params.pixelSize, props.profile)
      : null
  const activeDisplaySize =
    !layerMode && !isDiscreteSize && props.params.sizeMode === 'tier'
      ? resolvedTierPixels
      : props.params.pixelSize
  const showExperimentalSizeHint =
    !layerMode &&
    (!pixelValidation || pixelValidation.valid) &&
    isExperimentalPixelSize(activeDisplaySize, props.profile)
  const maxSequentialImages = Math.max(1, 15 - props.referenceCount)
  const isSvgFormat = props.params.outputFormat === 'svg'
  const isGifFormat = props.params.outputFormat === 'gif'
  const effectiveImageCount = isSvgFormat ? 1 : props.params.imageCount
  const showCompressionControl =
    props.profile.supportsOutputCompression &&
    (props.params.outputFormat === 'jpeg' ||
      props.params.outputFormat === 'webp')
  const showGifControls = props.profile.supportsGifOptions && isGifFormat
  const showStreamControl =
    props.profile.supportsStream && !isGifFormat && !isSvgFormat

  const handleSizeModeSwitch = (nextMode: 'tier' | 'pixels') => {
    if (nextMode === props.params.sizeMode) return
    if (nextMode === 'pixels') {
      const seedPixels =
        resolvedTierPixels === 'auto'
          ? props.profile.defaultPixelSize
          : resolvedTierPixels
      props.onChange({
        sizeMode: 'pixels',
        pixelSize: seedPixels,
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
    const patch: Partial<ImageStudioParams> = { outputFormat: fmt }
    if (
      !formatSupportsTransparency(fmt) &&
      props.params.background === 'transparent'
    ) {
      patch.background =
        props.profile.defaultBackground === 'transparent'
          ? 'opaque'
          : props.profile.defaultBackground
    }
    if (fmt === 'svg') {
      patch.imageCount = 1
      patch.stream = false
    } else if (fmt === 'gif') {
      patch.stream = false
    }
    props.onChange(patch)
  }

  const handleBackgroundChange = (background: ImageBackgroundMode) => {
    if (
      background === 'transparent' &&
      !formatSupportsTransparency(props.params.outputFormat)
    ) {
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
    } else if (pixelValidation.reason === 'multiple') {
      pixelErrorMessage = t(
        'Width and height must both be multiples of {{multiple}} px.',
        { multiple: props.profile.pixelRange?.edgeMultiple ?? 16 }
      )
    } else if (pixelValidation.reason === 'maxEdge') {
      pixelErrorMessage = t('Each edge must not exceed {{maxEdge}} px.', {
        maxEdge: props.profile.pixelRange?.maxEdge ?? 3840,
      })
    } else if (pixelValidation.reason === 'pixels') {
      pixelErrorMessage = t(
        'Total pixels are outside the supported range for this model.'
      )
    } else if (props.profile.pixelRange?.maxRatio === 3) {
      pixelErrorMessage = t('Aspect ratio must stay between 1:3 and 3:1.')
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
    if (isDiscreteSize) {
      return (
        <>
          <div className='pg-seg-row' role='group' aria-label={t('Image size')}>
            {sizeSpec.sizePresets.map((preset) => (
              <button
                key={preset.value}
                type='button'
                disabled={props.disabled}
                onClick={() =>
                  props.onChange({
                    sizeMode: 'pixels',
                    pixelSize: preset.value,
                  })
                }
                className={cn(
                  'pg-seg-btn',
                  props.params.pixelSize === preset.value && 'is-active'
                )}
              >
                <span>
                  {preset.value === 'auto'
                    ? 'auto'
                    : formatPixelDisplay(preset.value)}
                </span>
                {preset.ratioLabel && (
                  <span className='pg-seg-sub'>{preset.ratioLabel}</span>
                )}
              </button>
            ))}
          </div>
          {props.params.pixelSize === 'auto' && (
            <span className='pg-field-hint'>
              {t('Model automatically selects the best size and aspect ratio.')}
            </span>
          )}
        </>
      )
    }
    if (props.params.sizeMode === 'tier') {
      return (
        <>
          {sizeSpec.resolutionTiers.length > 1 && (
            <div
              className='pg-seg-row'
              role='group'
              aria-label={t('Resolution tier')}
            >
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

          {isAutoTier ? (
            <span className='pg-field-hint'>
              {t('Model automatically selects the best size and aspect ratio.')}
            </span>
          ) : (
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
          )}
          {showExperimentalSizeHint && (
            <span className='pg-field-hint'>
              {t(
                'Resolutions above 2560 × 1440 are experimental on this model.'
              )}
            </span>
          )}
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
        {!pixelErrorMessage &&
          props.profile.isGptImage &&
          props.profile.pixelRange?.edgeMultiple &&
          props.profile.pixelRange?.maxEdge && (
            <span className='pg-field-hint'>
              {t(
                'Multiples of {{multiple}} px, max edge {{maxEdge}} px, ratio 1:3 to 3:1.',
                {
                  multiple: props.profile.pixelRange.edgeMultiple,
                  maxEdge: props.profile.pixelRange.maxEdge,
                }
              )}
            </span>
          )}
        {showExperimentalSizeHint && (
          <span className='pg-field-hint'>
            {t('Resolutions above 2560 × 1440 are experimental on this model.')}
          </span>
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

      {props.profile.qualityOptions.length > 0 && (
        <div className='pg-field'>
          <span className='pg-field-label'>{t('Quality')}</span>
          <div className='pg-seg-row' role='group' aria-label={t('Quality')}>
            {props.profile.qualityOptions.map((level: ImageQuality) => (
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
            ))}
          </div>
        </div>
      )}

      {props.profile.complexityOptions.length > 0 && (
        <div className='pg-field'>
          <span className='pg-field-label'>{t('Planning complexity')}</span>
          <div
            className='pg-seg-row'
            role='group'
            aria-label={t('Planning complexity')}
          >
            {props.profile.complexityOptions.map((level: ImageComplexity) => (
              <button
                key={level}
                type='button'
                disabled={props.disabled}
                onClick={() => props.onChange({ complexity: level })}
                className={cn(
                  'pg-seg-btn',
                  props.params.complexity === level && 'is-active'
                )}
              >
                {level}
              </button>
            ))}
          </div>
          <span className='pg-field-hint'>
            {t(
              'Controls planning effort before rendering independently of quality.'
            )}
          </span>
        </div>
      )}

      {props.profile.styleOptions.length > 0 && (
        <div className='pg-field'>
          <span className='pg-field-label'>{t('Style')}</span>
          <div className='pg-seg-row' role='group' aria-label={t('Style')}>
            {props.profile.styleOptions.map((styleOption: ImageStyleMode) => (
              <button
                key={styleOption}
                type='button'
                disabled={props.disabled}
                onClick={() => props.onChange({ style: styleOption })}
                className={cn(
                  'pg-seg-btn',
                  props.params.style === styleOption && 'is-active'
                )}
              >
                {styleOption}
              </button>
            ))}
          </div>
        </div>
      )}

      {props.profile.maxImageCount > 1 && (
        <div className='pg-field'>
          <span className='pg-field-label'>{t('Image count')}</span>
          <div className='pg-image-count-row'>
            {props.profile.imageCountPresets.length > 0 && (
              <div
                className='pg-seg-row'
                role='group'
                aria-label={t('Image count')}
              >
                {props.profile.imageCountPresets.map((count) => (
                  <button
                    key={count}
                    type='button'
                    disabled={props.disabled || isSvgFormat}
                    onClick={() => props.onChange({ imageCount: count })}
                    className={cn(
                      'pg-seg-btn',
                      effectiveImageCount === count && 'is-active'
                    )}
                  >
                    {t('{{count}} image(s)', { count })}
                  </button>
                ))}
              </div>
            )}
            <span
              className='pg-slider-val shrink-0 tabular-nums'
              data-testid='pg-image-count-value'
            >
              {t('{{count}} image(s)', { count: effectiveImageCount })}
            </span>
          </div>
          {isSvgFormat && (
            <span className='pg-field-hint'>
              {t('SVG output supports 1 image per request.')}
            </span>
          )}
        </div>
      )}

      {props.profile.outputFormats.length > 0 && (
        <div className='pg-field'>
          <span className='pg-field-label'>{t('Output format')}</span>
          <div
            className='pg-seg-row'
            role='group'
            aria-label={t('Output format')}
          >
            {props.profile.outputFormats.map((fmt) => {
              const svgBlocked = fmt === 'svg' && props.referenceCount > 0
              return (
                <button
                  key={fmt}
                  type='button'
                  disabled={props.disabled || svgBlocked}
                  title={
                    svgBlocked
                      ? t(
                          'SVG output is only supported without reference images.'
                        )
                      : undefined
                  }
                  onClick={() => handleOutputFormatChange(fmt)}
                  className={cn(
                    'pg-seg-btn',
                    props.params.outputFormat === fmt && 'is-active'
                  )}
                >
                  {fmt.toUpperCase()}
                </button>
              )
            })}
          </div>
          {layerMode && (
            <span className='pg-field-hint'>
              {t(
                'Applies to the base image only; extracted layers always output PNG.'
              )}
            </span>
          )}
          {showCompressionControl && (
            <div className='pg-subpanel'>
              <div className='pg-field-head'>
                <span className='pg-field-label'>
                  {t('Output compression')}
                </span>
                <span className='pg-slider-val tabular-nums'>
                  {props.params.outputCompression}%
                </span>
              </div>
              <input
                type='range'
                min={0}
                max={100}
                step={5}
                disabled={props.disabled}
                aria-label={t('Output compression')}
                value={props.params.outputCompression}
                onChange={(event) =>
                  props.onChange({
                    outputCompression: Number(event.target.value),
                  })
                }
                className='w-full accent-black dark:accent-white'
              />
            </div>
          )}
          {showGifControls && (
            <div className='pg-subpanel'>
              <div className='pg-field'>
                <div className='pg-field-head'>
                  <span className='pg-field-label'>{t('Frame count')}</span>
                  <span className='pg-slider-val tabular-nums'>
                    {props.params.frameCount}
                  </span>
                </div>
                <input
                  type='range'
                  min={2}
                  max={16}
                  step={1}
                  disabled={props.disabled}
                  aria-label={t('Frame count')}
                  value={props.params.frameCount}
                  onChange={(event) =>
                    props.onChange({ frameCount: Number(event.target.value) })
                  }
                  className='w-full accent-black dark:accent-white'
                />
              </div>
              <div className='pg-field'>
                <div className='pg-field-head'>
                  <span className='pg-field-label'>{t('Frame duration')}</span>
                  <span className='pg-slider-val tabular-nums'>
                    {props.params.frameDurationMs} ms
                  </span>
                </div>
                <input
                  type='range'
                  min={20}
                  max={2000}
                  step={10}
                  disabled={props.disabled}
                  aria-label={t('Frame duration')}
                  value={props.params.frameDurationMs}
                  onChange={(event) =>
                    props.onChange({
                      frameDurationMs: Number(event.target.value),
                    })
                  }
                  className='w-full accent-black dark:accent-white'
                />
              </div>
            </div>
          )}
        </div>
      )}

      {props.profile.backgroundOptions.length > 0 && !layerMode && (
        <div className='pg-field'>
          <span className='pg-field-label'>{t('Background alpha')}</span>
          <div
            className='pg-seg-row'
            role='group'
            aria-label={t('Background alpha')}
          >
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
          {props.params.background === 'transparent' &&
            props.profile.outputFormats.includes('webp') && (
              <span className='pg-field-hint'>
                {t('Transparent background requires PNG or WEBP output.')}
              </span>
            )}
        </div>
      )}

      {props.profile.inputFidelityOptions.length > 0 &&
        props.referenceCount > 0 && (
          <div className='pg-field'>
            <span className='pg-field-label'>{t('Input fidelity')}</span>
            <div
              className='pg-seg-row'
              role='group'
              aria-label={t('Input fidelity')}
            >
              {props.profile.inputFidelityOptions.map(
                (fidelity: ImageInputFidelity) => (
                  <button
                    key={fidelity}
                    type='button'
                    disabled={props.disabled}
                    onClick={() => props.onChange({ inputFidelity: fidelity })}
                    className={cn(
                      'pg-seg-btn',
                      props.params.inputFidelity === fidelity && 'is-active'
                    )}
                  >
                    {fidelity}
                  </button>
                )
              )}
            </div>
            <span className='pg-field-hint'>
              {t(
                'Controls how closely the output preserves faces and details from reference images.'
              )}
            </span>
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

      {showStreamControl && (
        <div className='pg-field'>
          <div className='pg-toggle-grid'>
            <div className='pg-toggle-item'>
              <span className='pg-field-label'>{t('Stream output')}</span>
              <Switch
                size='sm'
                checked={props.params.stream}
                disabled={props.disabled}
                aria-label={t('Stream output')}
                onCheckedChange={(checked) =>
                  props.onChange({ stream: checked })
                }
              />
            </div>
          </div>
          {props.params.stream && props.profile.maxPartialImages > 0 && (
            <div className='pg-subpanel'>
              <div className='pg-field-head'>
                <span className='pg-field-label'>
                  {t('Partial preview images')}
                </span>
                <span className='pg-slider-val tabular-nums'>
                  {props.params.partialImages}
                </span>
              </div>
              <div
                className='pg-seg-row'
                role='group'
                aria-label={t('Partial preview images')}
              >
                {Array.from(
                  { length: props.profile.maxPartialImages + 1 },
                  (_, index) => index
                ).map((count) => (
                  <button
                    key={count}
                    type='button'
                    disabled={props.disabled}
                    onClick={() => props.onChange({ partialImages: count })}
                    className={cn(
                      'pg-seg-btn',
                      props.params.partialImages === count && 'is-active'
                    )}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
