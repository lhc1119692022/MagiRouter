import { Link } from '@tanstack/react-router'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  AudioLines,
  Download,
  Image as ImageIcon,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { JsonCodeEditor } from '@/components/json-code-editor'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  supportsStudioTask,
  type CreationPreset,
} from '@/features/creation/presets'
import { resolveApiKeyValue } from '@/features/keys/api'
import { resolveBaseUrl } from '@/features/magirouter-home/lib/snippets'
import type { PricingModel } from '@/features/pricing/types'
import { useStatus } from '@/hooks/use-status'
import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { cn } from '@/lib/utils'

import {
  buildImageRequestPayload,
  createDefaultImageParams,
  extractReferencesFromPayload,
  getActiveImageSize,
  parseEditedJsonPayload,
  resolveImageModelProfile,
  syncImageParamsFromJson,
  validateSeedreamPixelSize,
  type ImageStudioParams,
} from '../lib/image-model-params'
import {
  extractImageReferenceCountFromPayload,
  resolveImageRoute,
  type ImageRouteResolution,
} from '../lib/image-routing'
import { ImageParameterControls } from './image-parameter-controls'
import {
  ImageReferenceSlots,
  type ImageReferenceItem,
} from './image-reference-slots'
import { SavePresetAction } from './save-preset-action'

export type MultimodalMode = 'video' | 'image' | 'audio'

interface MultimodalStudioProps {
  sessionKey: string
  canSavePresets?: boolean
  mode: MultimodalMode
  currentModel?: PricingModel
  draft: string
  onDraftChange: (value: string) => void
  billing?: ReactNode
  keyGuide: ReactNode
  priceQuote?: ReactNode
  statusNotice?: ReactNode
  preset?: CreationPreset
  billingKeyId: number | null
  onRunningChange: (running: boolean) => void
}

interface MediaOption {
  id: string
  vendor: string
  summary: string
}

interface GeneratedImageItem {
  id: string
  url: string
  label?: string
  size?: string
}

interface SessionRunRecord {
  id: string
  mode: MultimodalMode
  model: string
  status: 'done' | 'queued' | 'error'
  summary: string
  timeLabel: string
}

/**
 * Fallback copy only — never fallback *models*.
 *
 * The studio lists exactly what the live catalog exposes for the selected
 * modality; if a modality has no live model we show an explicit empty state
 * instead of inventing a model the backend cannot route.
 */
const MODE_COPY: Record<MultimodalMode, { summary: string }> = {
  video: {
    summary: '视频生成模型 · 以控制台实际配置的分辨率与时长为准',
  },
  image: {
    summary: '图像生成模型 · 以控制台实际配置的尺寸与质量档位为准',
  },
  audio: {
    summary: '语音合成模型 · 以控制台实际配置的音色与格式为准',
  },
}

const AUDIO_WAVE_HEIGHTS = [
  28, 42, 65, 50, 82, 92, 60, 44, 76, 88, 56, 36, 68, 95, 74, 48, 62, 86, 54,
  38, 72, 90, 66, 44, 78, 84, 52, 34, 60, 74, 46, 30,
]

function getModeTitleKey(mode: MultimodalMode): string {
  if (mode === 'image') return 'Image generation'
  if (mode === 'video') return 'Video Generation'
  return 'Audio Generation'
}

function getEndpointPath(mode: MultimodalMode, imageEndpoint?: string): string {
  if (mode === 'video') return '/v1/video/generations'
  if (mode === 'image') return imageEndpoint ?? '/v1/images/generations'
  return '/v1/audio/speech'
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const remainder = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function extractShortLabel(url: string): string {
  const cleaned = url.split('?')[0] || url
  const parts = cleaned.split('/').filter(Boolean)
  return parts.at(-1) || cleaned
}

function getStageStatusLabel(
  status: 'idle' | 'running' | 'done' | 'error'
): string {
  if (status === 'running') return '生成中…'
  if (status === 'done') return '已完成'
  if (status === 'error') return '调用失败'
  return '就绪'
}

function getPromptPlaceholder(
  mode: MultimodalMode,
  layerDecomposition?: boolean
): string {
  if (mode === 'video') return '描述画面主体、动作、镜头运动与声音…'
  if (mode === 'image' && layerDecomposition) {
    return '可选：指定需要拆分的图层元素，留空将自动识别主体、背景与文字…'
  }
  if (mode === 'image') return '描述画面主体、光影、材质与构图…'
  return '输入要合成为拟真语音的文本内容…'
}

function getImageIntentLabelKey(
  intent: ImageRouteResolution['intent']
): string {
  if (intent === 'layer-decomposition') return 'Layer decomposition'
  if (intent === 'reference-generation') return 'Reference generation'
  if (intent === 'image-edit') return 'Image edit'
  return 'Text to Image'
}

function extractGeneratedImagesFromPayload(
  payload: unknown,
  fallbackFormat: string
): GeneratedImageItem[] {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  const items: unknown[] = Array.isArray(record.data) ? record.data : []
  const results: GeneratedImageItem[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    const itemFormat =
      typeof entry.output_format === 'string' && entry.output_format
        ? entry.output_format
        : fallbackFormat
    let url = ''
    if (typeof entry.url === 'string' && entry.url) {
      url = entry.url
    } else if (typeof entry.b64_json === 'string' && entry.b64_json) {
      url = `data:image/${itemFormat};base64,${entry.b64_json}`
    }
    if (!url) continue
    let label: string | undefined
    if (typeof entry.name === 'string' && entry.name.trim()) {
      label = entry.name.trim()
    } else if (typeof entry.z_index === 'number') {
      label = entry.z_index === 0 ? 'Base' : `Layer #${entry.z_index}`
    }
    results.push({
      id: `${label ?? 'img'}-${url.slice(0, 64)}-${results.length + 1}`,
      url,
      label,
      size: typeof entry.size === 'string' ? entry.size : undefined,
    })
  }
  return results
}

function parseSseGeneratedImages(
  rawText: string,
  fallbackFormat: string
): GeneratedImageItem[] {
  const results: GeneratedImageItem[] = []
  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const dataStr = trimmed.slice(5).trim()
    if (!dataStr || dataStr === '[DONE]') continue
    try {
      const parsed: unknown = JSON.parse(dataStr)
      const batch = extractGeneratedImagesFromPayload(parsed, fallbackFormat)
      if (batch.length > 0) {
        results.push(...batch)
        continue
      }
      if (parsed && typeof parsed === 'object') {
        const single = extractGeneratedImagesFromPayload(
          { data: [parsed] },
          fallbackFormat
        )
        results.push(...single)
      }
    } catch {
      // ignore non-JSON SSE keepalive lines
    }
  }
  return results
}

function getVideoTaskLabel(task: 't2v' | 'i2v' | 'ref2v' | 'edit'): string {
  if (task === 'i2v') return '图生视频'
  if (task === 'ref2v') return '多参考生成'
  if (task === 'edit') return '视频编辑'
  return '文生视频'
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (
      record.error &&
      typeof record.error === 'object' &&
      'message' in record.error &&
      typeof (record.error as Record<string, unknown>).message === 'string'
    ) {
      return (record.error as Record<string, unknown>).message as string
    }
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message
    }
  }
  return fallback
}

function StageArtwork(props: { mode: 'video' | 'image' }) {
  if (props.mode === 'video') {
    return (
      <svg
        className='create-stage-art'
        viewBox='0 0 560 300'
        preserveAspectRatio='xMidYMid slice'
        aria-hidden='true'
      >
        <circle
          cx='410'
          cy='80'
          r='150'
          fill='none'
          stroke='rgba(255,255,255,0.12)'
          strokeWidth='1'
        />
        <circle
          cx='410'
          cy='80'
          r='96'
          fill='none'
          stroke='rgba(255,255,255,0.1)'
          strokeWidth='1'
        />
        <rect
          x='84'
          y='96'
          width='392'
          height='108'
          rx='12'
          fill='rgba(12,10,9,0.22)'
          stroke='rgba(255,255,255,0.18)'
          strokeWidth='1'
        />
        {[96, 188, 280, 372].map((frameX) => (
          <rect
            key={frameX}
            x={frameX}
            y='116'
            width='82'
            height='68'
            rx='8'
            fill='rgba(255,255,255,0.05)'
            stroke='rgba(255,255,255,0.26)'
            strokeWidth='1'
          />
        ))}
        {Array.from({ length: 16 }, (_, slot) => 96 + slot * 24).map((dotX) => (
          <g key={dotX}>
            <rect
              x={dotX}
              y='103'
              width='10'
              height='6'
              rx='2'
              fill='rgba(255,255,255,0.28)'
            />
            <rect
              x={dotX}
              y='191'
              width='10'
              height='6'
              rx='2'
              fill='rgba(255,255,255,0.28)'
            />
          </g>
        ))}
      </svg>
    )
  }
  return (
    <svg
      className='create-stage-art'
      viewBox='0 0 560 300'
      preserveAspectRatio='xMidYMid slice'
      aria-hidden='true'
    >
      <circle
        cx='420'
        cy='74'
        r='138'
        fill='none'
        stroke='rgba(255,255,255,0.12)'
        strokeWidth='1'
      />
      <rect
        x='138'
        y='64'
        width='284'
        height='172'
        rx='14'
        fill='rgba(12,10,9,0.2)'
        stroke='rgba(255,255,255,0.24)'
        strokeWidth='1'
      />
      <circle cx='216' cy='124' r='20' fill='rgba(255,255,255,0.22)' />
      <path
        d='M162 210 L248 144 L312 190 L356 156 L402 210 Z'
        fill='rgba(255,255,255,0.14)'
      />
    </svg>
  )
}

export function MultimodalStudio(props: MultimodalStudioProps) {
  const { t } = useTranslation()
  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null)
  const [inputView, setInputView] = useState<'form' | 'json'>('form')
  const [layerDecompositionActive, setLayerDecompositionActive] =
    useState(false)
  const syncFromJsonRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    setInputView('form')
    setLayerDecompositionActive(false)
  }, [props.mode])

  useEffect(() => {
    setLayerDecompositionActive(false)
  }, [props.sessionKey])

  const handleSelectInputView = (nextView: 'form' | 'json') => {
    if (nextView === inputView) return
    if (inputView === 'json' && nextView === 'form') {
      syncFromJsonRef.current?.()
    }
    setInputView(nextView)
  }

  const promptOptional = props.mode === 'image' && layerDecompositionActive

  return (
    <div className='pg-workspace-grid' id='pg-workspace-grid'>
      <div className='pg-panel pg-config-panel'>
        <div className='pg-studio-panel-head'>
          <h2 className='pg-studio-panel-title'>
            {t(getModeTitleKey(props.mode))}
          </h2>
          <div
            className='pg-mode-tabs pg-mode-slider'
            role='tablist'
            aria-label={t('Input mode')}
            data-active={inputView}
          >
            <span className='pg-mode-slider-thumb' aria-hidden='true' />
            <button
              type='button'
              role='tab'
              aria-selected={inputView === 'form'}
              onClick={() => handleSelectInputView('form')}
              className={cn('pg-mode-tab', inputView === 'form' && 'is-active')}
            >
              {t('Form')}
            </button>
            <button
              type='button'
              role='tab'
              aria-selected={inputView === 'json'}
              onClick={() => handleSelectInputView('json')}
              className={cn('pg-mode-tab', inputView === 'json' && 'is-active')}
            >
              {t('JSON')}
            </button>
          </div>
        </div>

        <div className='pg-panel-scroll'>
          <div hidden={inputView === 'json'} className='pg-studio-top-fields'>
            {props.billing}
            <label className='pg-field'>
              <span className='pg-field-head'>
                <span className='pg-field-label'>
                  {t('Prompt')}
                  {promptOptional && (
                    <span className='pg-optional-tag'>{t('Optional')}</span>
                  )}
                </span>
                <span className='pg-char-count' aria-hidden='true'>
                  {props.draft.length} / 2000
                </span>
              </span>
              <Textarea
                className='pg-textarea'
                rows={4}
                value={props.draft}
                onChange={(event) => props.onDraftChange(event.target.value)}
                placeholder={getPromptPlaceholder(props.mode, promptOptional)}
              />
            </label>
          </div>

          {stage && (
            <MediaSession
              key={props.sessionKey}
              canSavePresets={props.canSavePresets}
              mode={props.mode}
              currentModel={props.currentModel}
              draft={props.draft}
              onDraftChange={props.onDraftChange}
              keyGuide={props.keyGuide}
              priceQuote={props.priceQuote}
              statusNotice={props.statusNotice}
              preset={props.preset}
              billingKeyId={props.billingKeyId}
              onRunningChange={props.onRunningChange}
              inputView={inputView}
              onLayerDecompositionChange={setLayerDecompositionActive}
              syncFromJsonRef={syncFromJsonRef}
              stage={stage}
              footerSlot={footerSlot}
            />
          )}
        </div>

        <div ref={setFooterSlot} className='pg-studio-footer-slot' />
      </div>
      <div
        ref={setStage}
        className={cn(
          'pg-panel',
          props.currentModel ? 'pg-stage-panel' : 'pg-preview-panel'
        )}
      />
    </div>
  )
}

function MediaSession(
  props: Omit<MultimodalStudioProps, 'billing' | 'sessionKey'> & {
    inputView: 'form' | 'json'
    onLayerDecompositionChange: (active: boolean) => void
    syncFromJsonRef: MutableRefObject<(() => void) | null>
    stage: HTMLDivElement
    footerSlot: HTMLDivElement | null
  }
) {
  const { t } = useTranslation()
  const mode = props.mode
  const current = props.currentModel
  const prompt = props.draft
  const setPrompt = props.onDraftChange
  const { status } = useStatus()
  const baseUrl = resolveBaseUrl(status?.server_address)

  const hasModels = !!current
  const activeModel: MediaOption = {
    id: current?.model_name ?? '',
    vendor: current?.vendor_name ?? '',
    summary: current?.description?.trim() || MODE_COPY[mode].summary,
  }

  const imageProfile = useMemo(
    () => resolveImageModelProfile(current?.model_name),
    [current?.model_name]
  )
  const imagePreset =
    props.preset?.mode === 'image' ? props.preset.parameters : undefined
  const videoPreset =
    props.preset?.mode === 'video' ? props.preset.parameters : undefined
  const audioPreset =
    props.preset?.mode === 'audio' ? props.preset.parameters : undefined
  const [videoTask, setVideoTask] = useState<'t2v' | 'i2v' | 'ref2v' | 'edit'>(
    videoPreset?.videoTask ?? 't2v'
  )
  const [resolution, setResolution] = useState<'480p' | '720p' | '1080p'>(
    videoPreset?.resolution ?? '720p'
  )
  const [aspectRatio, setAspectRatio] = useState(
    videoPreset?.aspectRatio ?? '16:9'
  )
  const [duration, setDuration] = useState(videoPreset?.duration ?? 5)
  const [nativeAudio, setNativeAudio] = useState(
    videoPreset?.nativeAudio ?? true
  )
  const [cameraFixed, setCameraFixed] = useState(
    videoPreset?.cameraFixed ?? false
  )
  const [imageParams, setImageParams] = useState<ImageStudioParams>(() =>
    createDefaultImageParams(imageProfile, imagePreset)
  )
  const [voice, setVoice] = useState(audioPreset?.voice ?? 'marin')
  const [audioFormat, setAudioFormat] = useState<
    'mp3' | 'wav' | 'opus' | 'aac' | 'flac'
  >(audioPreset?.audioFormat ?? 'mp3')
  const [speed, setSpeed] = useState(audioPreset?.speed ?? 1)
  const [instructions, setInstructions] = useState(
    audioPreset?.instructions ?? ''
  )
  const [references, setReferences] = useState<ImageReferenceItem[]>([])
  const [jsonDraft, setJsonDraft] = useState('')
  const [jsonDirty, setJsonDirty] = useState(false)
  const [showRefInput, setShowRefInput] = useState(false)
  const [refInput, setRefInput] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const layerDecompositionEnabled =
    mode === 'image' &&
    imageProfile.supportsLayerDecomposition &&
    imageParams.layerDecomposition
  const { onLayerDecompositionChange } = props
  useEffect(() => {
    onLayerDecompositionChange(layerDecompositionEnabled)
  }, [layerDecompositionEnabled, onLayerDecompositionChange])

  const [runStatus, setRunStatus] = useState<
    'idle' | 'running' | 'done' | 'error'
  >('idle')
  const { onRunningChange } = props
  const pendingRun = useRef<AbortController | null>(null)
  useEffect(() => () => pendingRun.current?.abort(), [])
  useEffect(() => {
    onRunningChange(runStatus === 'running')
    if (runStatus === 'running') return () => onRunningChange(false)
  }, [onRunningChange, runStatus])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageItem[]>(
    []
  )
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(
    null
  )
  const [videoTaskInfo, setVideoTaskInfo] = useState<{
    taskId: string
    statusText: string
  } | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [audioProgress, setAudioProgress] = useState(0)
  const [audioDurationSec, setAudioDurationSec] = useState(6)
  const [sessionRuns, setSessionRuns] = useState<SessionRunRecord[]>([])
  const audioElementRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [audioUrl])

  const effectivePrompt = prompt.trim()
  const formImageRoute = useMemo(
    () =>
      resolveImageRoute({
        prompt: effectivePrompt,
        referenceCount: references.length,
        layerDecomposition: layerDecompositionEnabled,
      }),
    [effectivePrompt, layerDecompositionEnabled, references.length]
  )

  const payloadObject = useMemo(() => {
    if (props.mode === 'video') {
      return {
        model: activeModel.id,
        task: videoTask,
        prompt: effectivePrompt,
        resolution,
        ratio: aspectRatio,
        duration,
        generate_audio: nativeAudio,
        camera_fixed: cameraFixed,
        ...(references.length > 0
          ? { references: references.map((item) => item.url) }
          : {}),
      }
    }
    if (props.mode === 'image') {
      return buildImageRequestPayload({
        model: activeModel.id,
        prompt: effectivePrompt,
        references: references.map((item) => item.url),
        profile: imageProfile,
        params: imageParams,
      })
    }
    return {
      model: activeModel.id,
      voice,
      input: effectivePrompt,
      response_format: audioFormat,
      speed,
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
    }
  }, [
    activeModel.id,
    aspectRatio,
    audioFormat,
    cameraFixed,
    duration,
    effectivePrompt,
    imageParams,
    imageProfile,
    instructions,
    nativeAudio,
    props.mode,
    references,
    resolution,
    speed,
    videoTask,
    voice,
  ])

  const payloadJson = useMemo(
    () => JSON.stringify(payloadObject, null, 2),
    [payloadObject]
  )

  const activeJsonText =
    props.inputView === 'json' && jsonDirty ? jsonDraft : payloadJson
  const parsedJson = useMemo(
    () => parseEditedJsonPayload(activeJsonText),
    [activeJsonText]
  )

  const effectiveImageRoute = useMemo(() => {
    if (props.mode !== 'image') return formImageRoute
    if (props.inputView === 'json' && jsonDirty && parsedJson.ok) {
      const jsonPrompt =
        typeof parsedJson.value.prompt === 'string'
          ? parsedJson.value.prompt
          : ''
      const jsonRefCount = extractImageReferenceCountFromPayload(
        parsedJson.value
      )
      const jsonLayerMode = parsedJson.value.layer_decomposition === true
      return resolveImageRoute({
        prompt: jsonPrompt,
        referenceCount: jsonRefCount,
        layerDecomposition: jsonLayerMode,
      })
    }
    return formImageRoute
  }, [formImageRoute, jsonDirty, parsedJson, props.inputView, props.mode])

  const endpointPath = getEndpointPath(
    props.mode,
    props.mode === 'image' ? effectiveImageRoute.endpoint : undefined
  )

  let activePayloadForSend: Record<string, unknown> | null = payloadObject
  if (props.inputView === 'json') {
    activePayloadForSend = parsedJson.ok ? parsedJson.value : null
  }
  const activePayloadJson =
    props.inputView === 'json' ? activeJsonText : payloadJson

  props.syncFromJsonRef.current = () => {
    if (!jsonDirty || !parsedJson.ok) {
      setJsonDirty(false)
      setJsonDraft('')
      return
    }
    const record = parsedJson.value
    if (props.mode === 'image') {
      if (typeof record.prompt === 'string') {
        setPrompt(record.prompt)
      }
      const extractedRefs = extractReferencesFromPayload(record)
      if (extractedRefs !== undefined) {
        setReferences(
          extractedRefs.map((url, idx) => ({
            id: `ref-json-${Date.now()}-${idx}`,
            url,
          }))
        )
      } else {
        setReferences([])
      }
      setImageParams((prev) =>
        syncImageParamsFromJson(record, imageProfile, prev)
      )
    } else if (props.mode === 'video') {
      if (typeof record.prompt === 'string') setPrompt(record.prompt)
      if (
        record.resolution === '480p' ||
        record.resolution === '720p' ||
        record.resolution === '1080p'
      ) {
        setResolution(record.resolution)
      }
      if (
        record.ratio === '16:9' ||
        record.ratio === '9:16' ||
        record.ratio === '1:1' ||
        record.ratio === '4:3' ||
        record.ratio === '3:4' ||
        record.ratio === '21:9'
      ) {
        setAspectRatio(record.ratio)
      }
      if (typeof record.duration === 'number') {
        setDuration(Math.min(15, Math.max(4, Math.round(record.duration))))
      }
      if (typeof record.generate_audio === 'boolean') {
        setNativeAudio(record.generate_audio)
      }
      if (typeof record.camera_fixed === 'boolean') {
        setCameraFixed(record.camera_fixed)
      }
    } else {
      if (typeof record.input === 'string') setPrompt(record.input)
      if (
        record.voice === 'marin' ||
        record.voice === 'cedar' ||
        record.voice === 'alloy' ||
        record.voice === 'ash' ||
        record.voice === 'coral' ||
        record.voice === 'nova' ||
        record.voice === 'sage'
      ) {
        setVoice(record.voice)
      }
      if (
        record.response_format === 'mp3' ||
        record.response_format === 'wav' ||
        record.response_format === 'opus' ||
        record.response_format === 'aac' ||
        record.response_format === 'flac'
      ) {
        setAudioFormat(record.response_format)
      }
      if (typeof record.speed === 'number') {
        setSpeed(Math.min(2, Math.max(0.5, record.speed)))
      }
      if (typeof record.instructions === 'string') {
        setInstructions(record.instructions)
      }
    }
    setJsonDirty(false)
    setJsonDraft('')
  }

  const presetRequiresReference =
    mode === 'image' &&
    props.inputView === 'form' &&
    imagePreset?.imageTask === 'edit' &&
    references.length === 0
  const effectiveImageTask: 'generate' | 'edit' = presetRequiresReference
    ? 'edit'
    : effectiveImageRoute.task

  const layerNeedsSingleReference =
    mode === 'image' &&
    props.inputView === 'form' &&
    layerDecompositionEnabled &&
    references.length !== 1
  const videoNeedsReference =
    mode === 'video' &&
    props.inputView === 'form' &&
    videoTask !== 't2v' &&
    references.length === 0
  const insufficientReferences =
    presetRequiresReference || layerNeedsSingleReference || videoNeedsReference

  const invalidSeedreamPixels =
    mode === 'image' &&
    props.inputView === 'form' &&
    imageProfile.isSeedream &&
    !layerDecompositionEnabled &&
    imageParams.sizeMode === 'pixels' &&
    !validateSeedreamPixelSize(imageParams.pixelSize, imageProfile).valid

  const supportedSceneModel =
    !!current &&
    supportsStudioTask(
      current,
      mode,
      mode === 'image' ? effectiveImageTask : videoTask
    )
  const selectedKey = props.billingKeyId
  const keyAllowed = !!selectedKey
  const jsonInvalid = props.inputView === 'json' && !parsedJson.ok

  const jsonHasPromptOrLayer = (() => {
    if (props.inputView !== 'json') return true
    if (!parsedJson.ok) return false
    if (mode === 'image') {
      if (parsedJson.value.layer_decomposition === true) return true
      return (
        typeof parsedJson.value.prompt === 'string' &&
        parsedJson.value.prompt.trim().length > 0
      )
    }
    if (mode === 'audio') {
      return (
        typeof parsedJson.value.input === 'string' &&
        parsedJson.value.input.trim().length > 0
      )
    }
    return (
      typeof parsedJson.value.prompt === 'string' &&
      parsedJson.value.prompt.trim().length > 0
    )
  })()

  const promptReady =
    props.inputView === 'json'
      ? jsonHasPromptOrLayer
      : Boolean(effectivePrompt) || layerDecompositionEnabled

  let blockingReason: string | undefined
  if (jsonInvalid) {
    blockingReason = t(parsedJson.errorKey)
  } else if (!supportedSceneModel) {
    if (props.preset) {
      blockingReason = t('This model is not available for this preset.')
    } else if (mode === 'image') {
      blockingReason = t('This model does not have {{endpoint}} configured.', {
        endpoint: endpointPath,
      })
    } else {
      blockingReason = t('This model is not available for this preset.')
    }
  } else if (layerNeedsSingleReference) {
    blockingReason = t(
      'Layer decomposition requires exactly 1 reference image.'
    )
  } else if (insufficientReferences) {
    blockingReason = t('Add reference materials first ({{count}} required).', {
      count: 1,
    })
  } else if (invalidSeedreamPixels) {
    blockingReason = t(
      'Total pixels are outside the supported range for this model.'
    )
  } else if (!keyAllowed) {
    blockingReason = t('Choose a key that allows this model and group.')
  }

  const curlCommand = useMemo(
    () =>
      `curl ${baseUrl}${endpointPath} \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${activePayloadJson}'`,
    [activePayloadJson, baseUrl, endpointPath]
  )

  const copyWithFeedback = async (key: string, value: string) => {
    const copied = await copyToClipboard(value)
    if (!copied) return
    setCopiedKey(key)
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current))
    }, 1800)
  }

  const maxImageReferences = layerDecompositionEnabled
    ? 1
    : imageProfile.maxReferences

  const appendReferenceItem = (url: string, name?: string) => {
    const cleaned = url.trim()
    const maxLimit = mode === 'image' ? maxImageReferences : 9
    if (!cleaned) return
    const entryId = `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setReferences((prev) => {
      if (prev.length >= maxLimit) return prev
      return [...prev, { id: entryId, url: cleaned, name }]
    })
  }

  const addVideoReference = () => {
    const cleaned = refInput.trim()
    if (!cleaned || references.length >= 9) return
    appendReferenceItem(cleaned)
    setRefInput('')
    setShowRefInput(false)
  }

  const moveReference = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= references.length) return
    setReferences((prev) => {
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  const removeReference = (index: number) => {
    setReferences((prev) => prev.filter((_, itemIdx) => itemIdx !== index))
  }

  const handleReset = () => {
    setPrompt('')
    setResolution('720p')
    setAspectRatio('16:9')
    setDuration(5)
    setNativeAudio(true)
    setCameraFixed(false)
    setImageParams(createDefaultImageParams(imageProfile))
    setVoice('marin')
    setAudioFormat('mp3')
    setSpeed(1)
    setInstructions('')
    setReferences([])
    setJsonDirty(false)
    setJsonDraft('')
    setErrorMessage(null)
  }

  const handlePatchImageParams = (patch: Partial<ImageStudioParams>) => {
    setImageParams((prev) => ({ ...prev, ...patch }))
  }

  const appendRunRecord = (
    statusType: SessionRunRecord['status'],
    summary: string
  ) => {
    const now = new Date()
    const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    setSessionRuns((prev) => [
      {
        id: `run-${Date.now()}`,
        mode: props.mode,
        model: activeModel.id,
        status: statusType,
        summary,
        timeLabel,
      },
      ...prev.slice(0, 5),
    ])
  }

  const handleSubmit = async () => {
    if (
      pendingRun.current ||
      !selectedKey ||
      insufficientReferences ||
      invalidSeedreamPixels ||
      jsonInvalid ||
      !activePayloadForSend ||
      !supportedSceneModel ||
      !hasModels ||
      !promptReady
    ) {
      return
    }

    const request = new AbortController()
    pendingRun.current = request
    setRunStatus('running')
    setErrorMessage(null)

    try {
      const authHeader = `Bearer ${await resolveApiKeyValue(selectedKey)}`
      if (request.signal.aborted) return
      if (props.mode === 'image') {
        const response = await fetch(endpointPath, {
          signal: request.signal,
          redirect: 'error',
          credentials: 'omit',
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(activePayloadForSend),
        })
        const contentType = response.headers.get('content-type') ?? ''
        let items: GeneratedImageItem[] = []
        if (response.ok && contentType.includes('text/event-stream')) {
          const rawText = await response.text()
          if (request.signal.aborted) return
          items = parseSseGeneratedImages(rawText, imageParams.outputFormat)
        } else {
          const json = await response.json().catch(() => null)
          if (request.signal.aborted) return
          if (!response.ok) {
            throw new Error(
              extractErrorMessage(json, `请求失败（HTTP ${response.status}）`)
            )
          }
          items = extractGeneratedImagesFromPayload(
            json,
            imageParams.outputFormat
          )
        }
        if (items.length === 0) {
          throw new Error('接口已返回成功，但未包含可预览的图像地址或 Base64。')
        }
        setGeneratedImages(items)
        setSelectedImageIndex(0)
        setRunStatus('done')
        const activeSize = getActiveImageSize(imageProfile, imageParams)
        appendRunRecord('done', `生成 ${items.length} 张图像 · ${activeSize}`)
        return
      }

      if (props.mode === 'audio') {
        const response = await fetch(endpointPath, {
          signal: request.signal,
          redirect: 'error',
          credentials: 'omit',
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(activePayloadForSend),
        })
        if (!response.ok) {
          const errJson = await response.json().catch(() => null)
          throw new Error(
            extractErrorMessage(errJson, `请求失败（HTTP ${response.status}）`)
          )
        }
        const blob = await response.blob()
        if (request.signal.aborted) return
        const nextObjectUrl = URL.createObjectURL(blob)
        setAudioUrl(nextObjectUrl)
        setAudioProgress(0)
        setIsAudioPlaying(false)
        setRunStatus('done')
        appendRunRecord(
          'done',
          `合成成功 · ${voice} · ${audioFormat.toUpperCase()}`
        )
        return
      }

      const response = await fetch(endpointPath, {
        signal: request.signal,
        redirect: 'error',
        credentials: 'omit',
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(activePayloadForSend),
      })
      const json = await response.json().catch(() => null)
      if (request.signal.aborted) return
      if (!response.ok) {
        throw new Error(
          extractErrorMessage(json, `请求失败（HTTP ${response.status}）`)
        )
      }
      const directUrl =
        json?.url ||
        json?.data?.[0]?.url ||
        json?.video_url ||
        json?.output?.url ||
        null
      const taskId = String(
        json?.task_id || json?.id || json?.data?.task_id || ''
      )
      if (typeof directUrl === 'string' && directUrl) {
        setGeneratedVideoUrl(directUrl)
        setVideoTaskInfo(null)
        setRunStatus('done')
        appendRunRecord('done', `视频生成完成 · ${resolution} · ${duration}s`)
      } else {
        const safeTaskId = taskId || 'submitted'
        const statusText = String(json?.status || 'IN_PROGRESS')
        setGeneratedVideoUrl(null)
        setVideoTaskInfo({ taskId: safeTaskId, statusText })
        setRunStatus('done')
        appendRunRecord('queued', `异步任务已提交 · ${safeTaskId}`)
      }
    } catch (caughtError) {
      if (request.signal.aborted) return
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : '调用失败，请检查密钥权限、余额或模型分组配置。'
      setRunStatus('error')
      setErrorMessage(message)
      appendRunRecord('error', message)
    } finally {
      pendingRun.current = null
    }
  }

  const handleToggleAudioPlay = () => {
    const audioEl = audioElementRef.current
    if (!audioEl || !audioUrl) return
    if (isAudioPlaying) {
      audioEl.pause()
      setIsAudioPlaying(false)
    } else {
      void audioEl.play()
      setIsAudioPlaying(true)
    }
  }

  const showVideoReferenceZone = props.mode === 'video' && videoTask !== 't2v'

  const stageStatusLabel = getStageStatusLabel(runStatus)
  const activeImageSize = getActiveImageSize(imageProfile, imageParams)
  const imageIntentLabel = t(getImageIntentLabelKey(effectiveImageRoute.intent))
  const videoStageBadge = `VIDEO · ${getVideoTaskLabel(videoTask)} · ${resolution}`
  const imageStageBadge = imageProfile.isSeedream
    ? `IMAGE · ${imageIntentLabel} · ${imageProfile.family}`
    : `IMAGE · ${imageIntentLabel} · ${imageParams.quality}`
  const stageModeBadge = mode === 'video' ? videoStageBadge : imageStageBadge
  const imageStageSpec = imageProfile.isSeedream
    ? [
        activeImageSize,
        imageProfile.outputFormats.length > 0
          ? imageParams.outputFormat.toUpperCase()
          : null,
        imageParams.responseFormat,
      ]
        .filter(Boolean)
        .join(' · ')
    : `${imageParams.pixelSize} · ${imageParams.imageCount} 张 · ${imageParams.outputFormat}`

  const estSpeechSeconds = Math.max(
    3,
    Math.round(effectivePrompt.length / 4.2 / speed)
  )
  const displayDurationSec = audioUrl ? audioDurationSec : estSpeechSeconds
  const activeWaveBars = Math.round(audioProgress * AUDIO_WAVE_HEIGHTS.length)
  const activePreviewImage =
    generatedImages[selectedImageIndex] ?? generatedImages[0]

  const jsonEditorView = (
    <div className='pg-json-panel'>
      <div className='pg-json-toolbar'>
        <code className='pg-json-endpoint'>
          POST {baseUrl}
          {endpointPath}
        </code>
        <div className='pg-json-toolbar-actions'>
          {jsonDirty && (
            <button
              type='button'
              className='el-btn el-btn-xs el-btn-ghost'
              onClick={() => {
                setJsonDirty(false)
                setJsonDraft('')
              }}
            >
              <RotateCcw size={12} aria-hidden='true' />
              <span>{t('Sync from form')}</span>
            </button>
          )}
          <button
            type='button'
            className='el-btn el-btn-xs el-btn-white'
            onClick={() => void copyWithFeedback('json', activeJsonText)}
          >
            {copiedKey === 'json' ? t('Copied') : t('Copy JSON')}
          </button>
          <button
            type='button'
            className='el-btn el-btn-xs el-btn-white'
            onClick={() => void copyWithFeedback('curl', curlCommand)}
          >
            {copiedKey === 'curl' ? t('Copied') : t('Copy cURL')}
          </button>
        </div>
      </div>

      <JsonCodeEditor
        value={activeJsonText}
        onChange={(nextValue) => {
          setJsonDraft(nextValue)
          setJsonDirty(true)
        }}
        ariaLabel={t('Request body JSON')}
        heightClassName='pg-json-code-editor-area'
        className='pg-json-code-editor'
      />

      {!parsedJson.ok && (
        <p className='pg-field-error' role='alert'>
          {t(parsedJson.errorKey)}
        </p>
      )}
    </div>
  )

  const canSubmitRequest =
    runStatus !== 'running' &&
    hasModels &&
    promptReady &&
    keyAllowed &&
    !insufficientReferences &&
    !invalidSeedreamPixels &&
    !jsonInvalid &&
    supportedSceneModel

  if (!hasModels) {
    return (
      <>
        {props.inputView === 'json' ? (
          jsonEditorView
        ) : (
          <div className='pg-empty-multimodal'>
            {props.statusNotice}
            {props.keyGuide}
            <Button type='button' disabled>
              {t('Generate')}
            </Button>
          </div>
        )}
        {props.inputView === 'json' &&
          props.footerSlot &&
          createPortal(
            <div className='pg-cost-footer'>
              {props.keyGuide}
              <Button type='button' disabled>
                {t('Generate')}
              </Button>
            </div>,
            props.footerSlot
          )}
        {createPortal(
          <div className='pg-empty-preview'>
            <span>{t('Output Preview')}</span>
          </div>,
          props.stage
        )}
      </>
    )
  }

  const capturePreset = () => {
    const model = activeModel.id
    if (mode === 'image') {
      const normalizedPresetSize: '1024x1024' | '1024x1536' | '1536x1024' =
        imageParams.pixelSize === '1024x1024' ||
        imageParams.pixelSize === '1024x1536' ||
        imageParams.pixelSize === '1536x1024'
          ? imageParams.pixelSize
          : '1536x1024'
      const normalizedCount: 1 | 2 | 4 =
        imageParams.imageCount === 2 || imageParams.imageCount === 4
          ? imageParams.imageCount
          : 1
      return {
        mode,
        model,
        prompt,
        parameters: {
          imageTask: effectiveImageTask,
          imageSize: normalizedPresetSize,
          quality: imageParams.quality,
          imageCount: normalizedCount,
          imageFormat: imageParams.outputFormat,
        },
      }
    }
    if (mode === 'audio') {
      return {
        mode,
        model,
        prompt,
        parameters: {
          voice,
          audioFormat,
          speed,
          ...(instructions.trim() ? { instructions } : {}),
        },
      }
    }
    if (videoTask === 'edit') return null
    return {
      mode,
      model,
      prompt,
      parameters: {
        videoTask,
        resolution,
        aspectRatio,
        duration,
        nativeAudio,
        cameraFixed,
      },
    }
  }

  return (
    <>
      {props.inputView === 'form' ? (
        <div className='pg-form-body'>
          {props.mode === 'image' && (
            <ImageReferenceSlots
              references={references}
              maxReferences={maxImageReferences}
              route={formImageRoute}
              layerDecomposition={layerDecompositionEnabled}
              disabled={runStatus === 'running'}
              onAddUrl={appendReferenceItem}
              onMove={moveReference}
              onRemove={removeReference}
            />
          )}

          <div className='pg-model-section'>
            <div className='pg-model-head-row'>
              <span className='pg-field-label'>{t('Parameters')}</span>
              {props.canSavePresets && (
                <SavePresetAction
                  available={supportedSceneModel}
                  capture={capturePreset}
                />
              )}
            </div>
            <span className='pg-field-hint'>{activeModel.summary}</span>
          </div>

          <div className='pg-params-stack'>
            {props.mode === 'video' && (
              <div className='pg-field'>
                <span className='pg-field-label'>生成方式</span>
                <div className='pg-seg-row'>
                  {(
                    [
                      ['t2v', '文生视频'],
                      ['i2v', '图生视频'],
                      ['ref2v', '多参考生成'],
                      ['edit', '视频编辑'],
                    ] as const
                  ).map(([modeKey, label]) => (
                    <button
                      key={modeKey}
                      type='button'
                      onClick={() => setVideoTask(modeKey)}
                      className={cn(
                        'pg-seg-btn',
                        videoTask === modeKey && 'is-active'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showVideoReferenceZone && (
              <div className='pg-upload-zone'>
                <div className='pg-upload-top'>
                  <span className='pg-upload-lead'>
                    <ImageIcon size={14} />
                    <span className='pg-upload-name'>参考素材</span>
                    <span
                      className='pg-upload-info'
                      title='最多 9 个参考链接，可使用 ↑ / ↓ 调整顺序并在提示词中按序号引用'
                    >
                      ?
                    </span>
                  </span>
                  <span className='pg-upload-actions'>
                    <span className='pg-char-count'>
                      {references.length} / 9
                    </span>
                    <button
                      type='button'
                      className='pg-icon-btn'
                      disabled={references.length >= 9}
                      aria-label='添加参考素材'
                      title='添加参考素材链接'
                      onClick={() => setShowRefInput((prev) => !prev)}
                    >
                      <Plus size={13} />
                    </button>
                  </span>
                </div>

                {showRefInput && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type='url'
                      className='pg-input'
                      style={{ height: '30px', fontSize: '11.5px' }}
                      placeholder='粘贴图片 / 视频链接后回车'
                      value={refInput}
                      onChange={(event) => setRefInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addVideoReference()
                        }
                      }}
                    />
                    <button
                      type='button'
                      className='el-btn el-btn-xs el-btn-primary'
                      onClick={addVideoReference}
                    >
                      添加
                    </button>
                  </div>
                )}

                {references.length > 0 && (
                  <div className='pg-asset-chips'>
                    {references.map((entry, entryIdx) => (
                      <span key={entry.id} className='pg-asset-chip'>
                        <span className='pg-asset-idx'>#{entryIdx + 1}</span>
                        <span className='pg-asset-name' title={entry.url}>
                          {extractShortLabel(entry.url)}
                        </span>
                        <button
                          type='button'
                          className='pg-asset-move'
                          disabled={entryIdx === 0}
                          aria-label='上移'
                          onClick={() => moveReference(entryIdx, -1)}
                        >
                          <ArrowUp size={10} />
                        </button>
                        <button
                          type='button'
                          className='pg-asset-move'
                          disabled={entryIdx === references.length - 1}
                          aria-label='下移'
                          onClick={() => moveReference(entryIdx, 1)}
                        >
                          <ArrowDown size={10} />
                        </button>
                        <button
                          type='button'
                          className='pg-asset-chip-x'
                          aria-label='删除'
                          onClick={() => removeReference(entryIdx)}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {props.mode === 'video' && (
              <>
                <div className='pg-field'>
                  <span className='pg-field-label'>分辨率</span>
                  <div className='pg-seg-row'>
                    {(['480p', '720p', '1080p'] as const).map((item) => (
                      <button
                        key={item}
                        type='button'
                        onClick={() => setResolution(item)}
                        className={cn(
                          'pg-seg-btn',
                          resolution === item && 'is-active'
                        )}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className='pg-field'>
                  <span className='pg-field-label'>画幅比例</span>
                  <div className='pg-seg-row'>
                    {(
                      ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] as const
                    ).map((ratio) => (
                      <button
                        key={ratio}
                        type='button'
                        onClick={() => setAspectRatio(ratio)}
                        className={cn(
                          'pg-seg-btn',
                          aspectRatio === ratio && 'is-active'
                        )}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>
                </div>

                <div className='pg-field'>
                  <div className='pg-field-head'>
                    <span className='pg-field-label'>时长</span>
                    <span className='pg-slider-val'>{duration}s</span>
                  </div>
                  <input
                    type='range'
                    min={4}
                    max={15}
                    step={1}
                    value={duration}
                    onChange={(event) =>
                      setDuration(Number(event.target.value))
                    }
                    className='w-full accent-black dark:accent-white'
                  />
                </div>

                <div className='pg-toggle-grid'>
                  <label className='pg-toggle-item cursor-pointer'>
                    <span>生成原生音频</span>
                    <input
                      type='checkbox'
                      checked={nativeAudio}
                      onChange={(event) => setNativeAudio(event.target.checked)}
                      className='size-4 accent-black dark:accent-white'
                    />
                  </label>
                  <label className='pg-toggle-item cursor-pointer'>
                    <span>固定镜头</span>
                    <input
                      type='checkbox'
                      checked={cameraFixed}
                      onChange={(event) => setCameraFixed(event.target.checked)}
                      className='size-4 accent-black dark:accent-white'
                    />
                  </label>
                </div>
              </>
            )}

            {props.mode === 'image' && (
              <ImageParameterControls
                profile={imageProfile}
                params={imageParams}
                referenceCount={references.length}
                disabled={runStatus === 'running'}
                onChange={handlePatchImageParams}
              />
            )}

            {props.mode === 'audio' && (
              <>
                <div className='pg-field'>
                  <span className='pg-field-label'>音色 (Voice)</span>
                  <div className='pg-seg-row'>
                    {(
                      [
                        'marin',
                        'cedar',
                        'alloy',
                        'ash',
                        'coral',
                        'nova',
                        'sage',
                      ] as const
                    ).map((voiceName) => (
                      <button
                        key={voiceName}
                        type='button'
                        onClick={() => setVoice(voiceName)}
                        className={cn(
                          'pg-seg-btn',
                          voice === voiceName && 'is-active'
                        )}
                      >
                        {voiceName}
                      </button>
                    ))}
                  </div>
                </div>

                <div className='pg-field'>
                  <span className='pg-field-label'>音频格式</span>
                  <div className='pg-seg-row'>
                    {(['mp3', 'wav', 'opus', 'aac', 'flac'] as const).map(
                      (fmt) => (
                        <button
                          key={fmt}
                          type='button'
                          onClick={() => setAudioFormat(fmt)}
                          className={cn(
                            'pg-seg-btn',
                            audioFormat === fmt && 'is-active'
                          )}
                        >
                          {fmt.toUpperCase()}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className='pg-field'>
                  <div className='pg-field-head'>
                    <span className='pg-field-label'>语速</span>
                    <span className='pg-slider-val'>{speed.toFixed(2)}x</span>
                  </div>
                  <input
                    type='range'
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={speed}
                    onChange={(event) => setSpeed(Number(event.target.value))}
                    className='w-full accent-black dark:accent-white'
                  />
                </div>

                <div className='pg-field'>
                  <span className='pg-field-label'>语气指令（可选）</span>
                  <input
                    type='text'
                    className='pg-input'
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    placeholder='例如：平稳专业、略带温暖播报语气'
                  />
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        jsonEditorView
      )}

      {props.footerSlot &&
        createPortal(
          <div className='pg-cost-footer'>
            {props.priceQuote && (
              <div className='pg-cost-price-bar'>{props.priceQuote}</div>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexWrap: 'nowrap',
              }}
            >
              <button
                type='button'
                className='el-btn el-btn-xs el-btn-ghost'
                onClick={handleReset}
              >
                {t('Reset')}
              </button>
              <button
                type='button'
                disabled={!canSubmitRequest}
                className='el-btn el-btn-sm el-btn-primary'
                onClick={() => void handleSubmit()}
              >
                {runStatus === 'running' ? (
                  <>
                    <Loader2 size={14} className='animate-spin' />
                    <span>{t('Generating...')}</span>
                  </>
                ) : (
                  <span>{t('Generate')} →</span>
                )}
              </button>
            </div>
            {props.keyGuide}
            {keyAllowed && blockingReason && (
              <p className='el-body-sm' role='status'>
                {blockingReason}
              </p>
            )}
          </div>,
          props.footerSlot
        )}
      {createPortal(
        <>
          <div className='pg-panel-head'>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--ink-strong)',
                }}
              >
                预览输出
              </span>
              <span className='channel-status-pill'>
                <span className='dash-gs-dot' />
                <span>{stageStatusLabel}</span>
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span
                className='console-head-meta tabular-nums'
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                POST {endpointPath}
              </span>
              <button
                type='button'
                className='el-btn el-btn-xs el-btn-white'
                onClick={() => void copyWithFeedback('stage-curl', curlCommand)}
              >
                {copiedKey === 'stage-curl' ? '已复制' : '复制 cURL'}
              </button>
            </div>
          </div>

          {errorMessage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '12px',
                background: 'rgba(250, 64, 40, 0.08)',
                color: 'var(--ink-strong)',
                fontSize: '12.5px',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle
                  size={15}
                  style={{ color: '#FA4028', flexShrink: 0 }}
                />
                <span>{errorMessage}</span>
              </span>
              {!selectedKey && (
                <Link to='/keys' className='el-btn el-btn-xs el-btn-white'>
                  管理密钥
                </Link>
              )}
            </div>
          )}

          {mode === 'audio' ? (
            <div className='pg-audio-stage' id='pg-audio-stage'>
              <div className='pg-audio-head'>
                <div className='pg-audio-identity'>
                  <span
                    className={cn(
                      'pg-audio-orb',
                      isAudioPlaying && 'is-playing'
                    )}
                  >
                    <AudioLines size={18} />
                  </span>
                  <div>
                    <div className='pg-audio-title'>音色 · {voice}</div>
                    <div className='pg-audio-sub'>
                      {activeModel.id} · 拟真语音合成工作台
                    </div>
                  </div>
                </div>
                <div className='pg-audio-pills'>
                  <span className='el-pill tabular-nums'>
                    {audioFormat.toUpperCase()}
                  </span>
                  <span className='el-pill tabular-nums'>
                    {speed.toFixed(2)}x
                  </span>
                  <span className='el-pill tabular-nums'>
                    ~{formatClock(displayDurationSec)}
                  </span>
                </div>
              </div>

              <div className='pg-audio-player'>
                <div className='pg-audio-wave-row'>
                  <button
                    type='button'
                    className='pg-audio-play-btn'
                    disabled={!audioUrl}
                    aria-label={isAudioPlaying ? '暂停音频' : '播放音频'}
                    title={audioUrl ? '播放或暂停音频' : '请先点击提交生成语音'}
                    onClick={handleToggleAudioPlay}
                  >
                    {isAudioPlaying ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <div className='pg-audio-wave'>
                    {AUDIO_WAVE_HEIGHTS.map((heightPct, barIdx) => (
                      <span
                        key={`wave-bar-${barIdx + 1}-${heightPct}`}
                        className={cn(
                          'pg-audio-bar',
                          barIdx < activeWaveBars && 'is-played'
                        )}
                        style={{ height: `${heightPct}%` }}
                      />
                    ))}
                  </div>
                  <span className='pg-audio-time'>
                    {formatClock(audioProgress * displayDurationSec)} /{' '}
                    {formatClock(displayDurationSec)}
                  </span>
                </div>

                {audioUrl && (
                  <audio
                    ref={audioElementRef}
                    src={audioUrl}
                    onLoadedMetadata={(event) => {
                      const secs = event.currentTarget.duration
                      if (Number.isFinite(secs) && secs > 0) {
                        setAudioDurationSec(secs)
                      }
                    }}
                    onTimeUpdate={(event) => {
                      const current = event.currentTarget.currentTime
                      const total = event.currentTarget.duration
                      if (Number.isFinite(total) && total > 0) {
                        setAudioProgress(current / total)
                      }
                    }}
                    onEnded={() => {
                      setIsAudioPlaying(false)
                      setAudioProgress(1)
                    }}
                    className='w-full'
                    controls
                  />
                )}

                <div className='pg-audio-transport'>
                  <span className='pg-field-hint'>
                    {audioUrl
                      ? '语音已通过当前密钥实时合成，可直接试听或下载。'
                      : '点击左侧「提交生成 →」将实时调用 /v1/audio/speech 合成可播放音频。'}
                  </span>
                  {audioUrl && (
                    <a
                      href={audioUrl}
                      download={`magirouter-${voice}.${audioFormat}`}
                      className='el-btn el-btn-xs el-btn-white'
                    >
                      <Download size={12} />
                      <span>下载 {audioFormat.toUpperCase()}</span>
                    </a>
                  )}
                </div>
              </div>

              <div className='pg-audio-card'>
                <div className='pg-audio-card-head'>
                  <span>待合成朗读脚本 · {effectivePrompt.length} 字符</span>
                  <button
                    type='button'
                    className='el-btn el-btn-xs el-btn-white'
                    onClick={() =>
                      void copyWithFeedback('audio-script', effectivePrompt)
                    }
                  >
                    {copiedKey === 'audio-script' ? '已复制' : '复制文案'}
                  </button>
                </div>
                <p className='pg-audio-script'>{effectivePrompt}</p>
                {instructions.trim() && (
                  <div className='pg-audio-cue'>
                    语气指令：{instructions.trim()}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className='create-stage-box' id='create-stage-box'>
              {mode === 'image' && activePreviewImage && (
                <>
                  <img
                    src={activePreviewImage.url}
                    alt={activePreviewImage.label || effectivePrompt}
                    className='create-stage-art bg-black/80 object-contain'
                  />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span className='sr-card-route-tag'>
                      IMAGE · {activeModel.id}
                      {activePreviewImage.label
                        ? ` · ${activePreviewImage.label}`
                        : ''}
                      {activePreviewImage.size
                        ? ` · ${activePreviewImage.size}`
                        : ''}
                    </span>
                    <a
                      href={activePreviewImage.url}
                      target='_blank'
                      rel='noreferrer'
                      download={`magirouter-image.${imageParams.outputFormat}`}
                      className='sr-card-route-tag no-underline'
                    >
                      下载原图 ↗
                    </a>
                  </div>
                  {generatedImages.length > 1 ? (
                    <div className='pg-stage-thumb-strip'>
                      {generatedImages.map((item, idx) => (
                        <button
                          key={item.id}
                          type='button'
                          onClick={() => setSelectedImageIndex(idx)}
                          className={cn(
                            'pg-stage-thumb',
                            idx === selectedImageIndex && 'is-active'
                          )}
                        >
                          <img
                            src={item.url}
                            alt={item.label || `#${idx + 1}`}
                          />
                          <span>{item.label || `#${idx + 1}`}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div />
                  )}
                </>
              )}
              {mode === 'video' && generatedVideoUrl && (
                <>
                  <video
                    src={generatedVideoUrl}
                    controls
                    autoPlay
                    loop
                    className='create-stage-art bg-black object-contain'
                  />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <span className='sr-card-route-tag'>
                      VIDEO · {activeModel.id}
                    </span>
                    <a
                      href={generatedVideoUrl}
                      target='_blank'
                      rel='noreferrer'
                      className='sr-card-route-tag no-underline'
                    >
                      下载视频 ↗
                    </a>
                  </div>
                  <div />
                </>
              )}
              {!(mode === 'image' && generatedImages.length > 0) &&
                !(mode === 'video' && generatedVideoUrl) && (
                  <>
                    <StageArtwork mode={mode} />
                    <div className='create-stage-scrim' />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '10px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span className='sr-card-route-tag'>
                        {stageModeBadge}
                      </span>
                      <span className='sr-card-route-tag tabular-nums'>
                        {mode === 'video'
                          ? `${resolution} · ${duration}s · ${aspectRatio}`
                          : imageStageSpec}
                      </span>
                    </div>

                    <div>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: '19px',
                          fontWeight: 500,
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {videoTaskInfo
                          ? `异步任务已提交 · ${videoTaskInfo.taskId}`
                          : `${activeModel.id} · ${props.mode === 'video' ? '视频生成预览' : '图像生成预览'}`}
                      </h3>
                      <p
                        style={{
                          margin: '8px 0 0',
                          fontSize: '13px',
                          color: 'rgba(255,255,255,0.82)',
                          lineHeight: 1.55,
                        }}
                      >
                        {videoTaskInfo
                          ? `当前状态：${videoTaskInfo.statusText}。异步渲染结果与真实扣费明细将自动写入调用日志。`
                          : '调整左侧参数会同步更新规格、预估费用与请求体；提交后将使用所选密钥真实调用网关并写入日志。'}
                      </p>
                      {videoTaskInfo && (
                        <div style={{ marginTop: '10px' }}>
                          <Link
                            to='/usage-logs'
                            className='sr-card-route-tag no-underline'
                          >
                            前往任务日志查看进度 →
                          </Link>
                        </div>
                      )}
                    </div>
                  </>
                )}
            </div>
          )}

          {sessionRuns.length > 0 && (
            <div
              style={{
                paddingTop: '12px',
                borderTop: 'var(--hairline) solid var(--divider-color)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <span className='pg-field-label'>本次会话调用记录</span>
                <Link to='/usage-logs' className='dash-panel-link'>
                  在调用日志查看全部 →
                </Link>
              </div>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
              >
                {sessionRuns.map((run) => (
                  <div
                    key={run.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      background: 'var(--bg-subtle)',
                      fontSize: '12px',
                    }}
                  >
                    <span
                      className='truncate'
                      style={{ color: 'var(--ink-strong)' }}
                    >
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>
                        {run.model}
                      </strong>{' '}
                      · {run.summary}
                    </span>
                    <span className='pg-char-count shrink-0'>
                      {run.timeLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>,
        props.stage
      )}
    </>
  )
}
