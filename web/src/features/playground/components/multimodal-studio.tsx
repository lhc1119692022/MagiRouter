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
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  supportsStudioTask,
  type CreationPreset,
} from '@/features/creation/presets'
import { HighlightedCode } from '@/features/docs/components/highlighted-code'
import { resolveApiKeyValue } from '@/features/keys/api'
import { resolveBaseUrl } from '@/features/magirouter-home/lib/snippets'
import type { PricingModel } from '@/features/pricing/types'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

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

interface ReferenceEntry {
  id: string
  url: string
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

function getEndpointPath(mode: MultimodalMode, imageTask: string): string {
  if (mode === 'video') return '/v1/video/generations'
  if (mode === 'image') {
    return imageTask === 'edit' ? '/v1/images/edits' : '/v1/images/generations'
  }
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

function getPromptPlaceholder(mode: MultimodalMode): string {
  if (mode === 'video') return '描述画面主体、动作、镜头运动与声音…'
  if (mode === 'image') return '描述画面主体、光影、材质与构图…'
  return '输入要合成为拟真语音的文本内容…'
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

export function MultimodalStudio({
  sessionKey,
  billing,
  ...sessionProps
}: MultimodalStudioProps) {
  const { t } = useTranslation()
  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  return (
    <div className='pg-workspace-grid' id='pg-workspace-grid'>
      <div className='pg-panel pg-config-panel'>
        {billing}
        <label className='pg-field'>
          <span className='pg-field-head'>
            <span className='pg-field-label'>{t('Prompt')}</span>
            <span className='pg-char-count' aria-hidden='true'>
              {sessionProps.draft.length} / 2000
            </span>
          </span>
          <Textarea
            className='pg-textarea'
            rows={4}
            value={sessionProps.draft}
            onChange={(event) => sessionProps.onDraftChange(event.target.value)}
            placeholder={getPromptPlaceholder(sessionProps.mode)}
          />
        </label>
        {stage && (
          <MediaSession key={sessionKey} {...sessionProps} stage={stage} />
        )}
      </div>
      <div
        ref={setStage}
        className={cn(
          'pg-panel',
          sessionProps.currentModel ? 'pg-stage-panel' : 'pg-preview-panel'
        )}
      />
    </div>
  )
}

function MediaSession(
  props: Omit<MultimodalStudioProps, 'billing' | 'sessionKey'> & {
    stage: HTMLDivElement
  }
) {
  const { t } = useTranslation()
  const {
    mode,
    currentModel: current,
    draft: prompt,
    onDraftChange: setPrompt,
  } = props
  const { status } = useStatus()
  const baseUrl = resolveBaseUrl(status?.server_address)

  const hasModels = !!current
  const activeModel: MediaOption = {
    id: current?.model_name ?? '',
    vendor: current?.vendor_name ?? '',
    summary: current?.description?.trim() || MODE_COPY[mode].summary,
  }

  const [inputView, setInputView] = useState<'form' | 'json'>('form')
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
  const [imageTask, setImageTask] = useState<'generate' | 'edit'>(
    imagePreset?.imageTask ?? 'generate'
  )
  const [imageSize, setImageSize] = useState(
    imagePreset?.imageSize ?? '1536x1024'
  )
  const [imageQuality, setImageQuality] = useState<
    'auto' | 'low' | 'medium' | 'high'
  >(imagePreset?.quality ?? 'high')
  const [imageCount, setImageCount] = useState(imagePreset?.imageCount ?? 1)
  const [imageFormat, setImageFormat] = useState<'png' | 'jpeg' | 'webp'>(
    imagePreset?.imageFormat ?? 'png'
  )
  const [voice, setVoice] = useState(audioPreset?.voice ?? 'marin')
  const [audioFormat, setAudioFormat] = useState<
    'mp3' | 'wav' | 'opus' | 'aac' | 'flac'
  >(audioPreset?.audioFormat ?? 'mp3')
  const [speed, setSpeed] = useState(audioPreset?.speed ?? 1)
  const [instructions, setInstructions] = useState(
    audioPreset?.instructions ?? ''
  )
  const [references, setReferences] = useState<ReferenceEntry[]>([])
  const needsReference =
    (mode === 'image' && imageTask === 'edit') ||
    (mode === 'video' && videoTask !== 't2v')
  const insufficientReferences = needsReference && !references.length
  const supportedSceneModel =
    !!current &&
    supportsStudioTask(current, mode, mode === 'image' ? imageTask : videoTask)
  const selectedKey = props.billingKeyId
  const keyAllowed = !!selectedKey
  const [showRefInput, setShowRefInput] = useState(false)
  let blockingReason: string | undefined
  if (!supportedSceneModel) {
    blockingReason = t('This model is not available for this preset.')
  } else if (insufficientReferences) {
    blockingReason = t('Add reference materials first ({{count}} required).', {
      count: 1,
    })
  } else if (!keyAllowed) {
    blockingReason = t('Choose a key that allows this model and group.')
  }
  const [refInput, setRefInput] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

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
  const [generatedImages, setGeneratedImages] = useState<string[]>([])
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

  const endpointPath = getEndpointPath(props.mode, imageTask)
  const effectivePrompt = prompt.trim()

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
      return {
        model: activeModel.id,
        prompt: effectivePrompt,
        size: imageSize,
        quality: imageQuality,
        n: imageCount,
        output_format: imageFormat,
        ...(imageTask === 'edit' && references.length > 0
          ? { image: references.map((item) => item.url) }
          : {}),
      }
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
    imageCount,
    imageFormat,
    imageQuality,
    imageSize,
    imageTask,
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

  const curlCommand = useMemo(
    () =>
      `curl ${baseUrl}${endpointPath} \\\n  -H "Authorization: Bearer $MAGIROUTER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${payloadJson}'`,
    [baseUrl, endpointPath, payloadJson]
  )

  const copyWithFeedback = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedKey(key)
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current))
    }, 1800)
  }

  const addReference = () => {
    const cleaned = refInput.trim()
    if (!cleaned || references.length >= 9) return
    const entryId = `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setReferences((prev) => [...prev, { id: entryId, url: cleaned }])
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
    setImageSize('1536x1024')
    setImageQuality('high')
    setImageCount(1)
    setImageFormat('png')
    setVoice('marin')
    setAudioFormat('mp3')
    setSpeed(1)
    setInstructions('')
    setReferences([])
    setErrorMessage(null)
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
      !supportedSceneModel ||
      !hasModels ||
      !effectivePrompt
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
          body: JSON.stringify(payloadObject),
        })
        const json = await response.json().catch(() => null)
        if (request.signal.aborted) return
        if (!response.ok) {
          throw new Error(
            extractErrorMessage(json, `请求失败（HTTP ${response.status}）`)
          )
        }
        const items: unknown[] = Array.isArray(json?.data) ? json.data : []
        const urls: string[] = []
        for (const item of items) {
          if (item && typeof item === 'object') {
            const record = item as Record<string, unknown>
            if (typeof record.url === 'string' && record.url) {
              urls.push(record.url)
            } else if (typeof record.b64_json === 'string' && record.b64_json) {
              urls.push(`data:image/${imageFormat};base64,${record.b64_json}`)
            }
          }
        }
        if (urls.length === 0) {
          throw new Error('接口已返回成功，但未包含可预览的图像地址或 Base64。')
        }
        setGeneratedImages(urls)
        setRunStatus('done')
        appendRunRecord('done', `生成 ${urls.length} 张图像 · ${imageSize}`)
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
          body: JSON.stringify(payloadObject),
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
        body: JSON.stringify(payloadObject),
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

  const showReferenceZone =
    (props.mode === 'video' && videoTask !== 't2v') ||
    (props.mode === 'image' && imageTask === 'edit')

  const stageStatusLabel = getStageStatusLabel(runStatus)
  const videoStageBadge = `VIDEO · ${getVideoTaskLabel(videoTask)} · ${resolution}`
  const imageStageBadge = `IMAGE · ${imageTask === 'edit' ? '多图参考编辑' : '文生图'} · ${imageQuality}`
  const stageModeBadge = mode === 'video' ? videoStageBadge : imageStageBadge

  const estSpeechSeconds = Math.max(
    3,
    Math.round(effectivePrompt.length / 4.2 / speed)
  )
  const displayDurationSec = audioUrl ? audioDurationSec : estSpeechSeconds
  const activeWaveBars = Math.round(audioProgress * AUDIO_WAVE_HEIGHTS.length)

  if (!hasModels) {
    return (
      <>
        <div className='pg-empty-multimodal'>
          {props.statusNotice}
          {props.keyGuide}
          <Button type='button' disabled>
            {t('Generate')}
          </Button>
        </div>
        {createPortal(
          <div className='pg-empty-preview'>
            <span>{t('Output Preview')}</span>
          </div>,
          props.stage
        )}
      </>
    )
  }

  return (
    <>
      <div className='pg-panel-scroll'>
        <div className='pg-model-section'>
          <div className='pg-model-head-row'>
            <span className='pg-field-label'>{t('Parameters')}</span>
            <div className='pg-mode-tabs' role='tablist'>
              <button
                type='button'
                onClick={() => setInputView('form')}
                className={cn(
                  'pg-mode-tab',
                  inputView === 'form' && 'is-active'
                )}
              >
                表单
              </button>
              <button
                type='button'
                onClick={() => setInputView('json')}
                className={cn(
                  'pg-mode-tab',
                  inputView === 'json' && 'is-active'
                )}
              >
                JSON
              </button>
            </div>
          </div>

          <div className='pg-model-select-row'>
            {props.canSavePresets && (
              <SavePresetAction
                available={supportedSceneModel}
                capture={() => {
                  const model = activeModel.id
                  if (mode === 'image') {
                    return {
                      mode,
                      model,
                      prompt,
                      parameters: {
                        imageTask,
                        imageSize,
                        quality: imageQuality,
                        imageCount,
                        imageFormat,
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
                }}
              />
            )}
          </div>
          <span className='pg-field-hint'>{activeModel.summary}</span>
        </div>

        {inputView === 'form' ? (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
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

            {props.mode === 'image' && (
              <div className='pg-field'>
                <span className='pg-field-label'>生成方式</span>
                <div className='pg-seg-row'>
                  {(
                    [
                      ['generate', '文生图'],
                      ['edit', '多图参考编辑'],
                    ] as const
                  ).map(([modeKey, label]) => (
                    <button
                      key={modeKey}
                      type='button'
                      onClick={() => setImageTask(modeKey)}
                      className={cn(
                        'pg-seg-btn',
                        imageTask === modeKey && 'is-active'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showReferenceZone && (
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
                          addReference()
                        }
                      }}
                    />
                    <button
                      type='button'
                      className='el-btn el-btn-xs el-btn-primary'
                      onClick={addReference}
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
              <>
                <div className='pg-field'>
                  <span className='pg-field-label'>输出尺寸</span>
                  <div className='pg-seg-row'>
                    {(['1536x1024', '1024x1024', '1024x1536'] as const).map(
                      (size) => (
                        <button
                          key={size}
                          type='button'
                          onClick={() => setImageSize(size)}
                          className={cn(
                            'pg-seg-btn',
                            imageSize === size && 'is-active'
                          )}
                        >
                          {size}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className='pg-field'>
                  <span className='pg-field-label'>画质档位</span>
                  <div className='pg-seg-row'>
                    {(['auto', 'low', 'medium', 'high'] as const).map(
                      (level) => (
                        <button
                          key={level}
                          type='button'
                          onClick={() => setImageQuality(level)}
                          className={cn(
                            'pg-seg-btn',
                            imageQuality === level && 'is-active'
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
                    <span className='pg-field-label'>生成张数</span>
                    <span className='pg-slider-val'>{imageCount} 张</span>
                  </div>
                  <div className='pg-seg-row'>
                    {([1, 2, 4] as const).map((count) => (
                      <button
                        key={count}
                        type='button'
                        onClick={() => setImageCount(count)}
                        className={cn(
                          'pg-seg-btn',
                          imageCount === count && 'is-active'
                        )}
                      >
                        {count} 张
                      </button>
                    ))}
                  </div>
                </div>

                <div className='pg-field'>
                  <span className='pg-field-label'>输出格式</span>
                  <div className='pg-seg-row'>
                    {(['png', 'jpeg', 'webp'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type='button'
                        onClick={() => setImageFormat(fmt)}
                        className={cn(
                          'pg-seg-btn',
                          imageFormat === fmt && 'is-active'
                        )}
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </>
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
        ) : (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span className='pg-field-hint'>
                POST {baseUrl}
                {endpointPath}
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type='button'
                  className='el-btn el-btn-xs el-btn-white'
                  onClick={() => void copyWithFeedback('json', payloadJson)}
                >
                  {copiedKey === 'json' ? '已复制' : '复制 JSON'}
                </button>
                <button
                  type='button'
                  className='el-btn el-btn-xs el-btn-white'
                  onClick={() => void copyWithFeedback('curl', curlCommand)}
                >
                  {copiedKey === 'curl' ? '已复制' : '复制 cURL'}
                </button>
              </div>
            </div>
            <HighlightedCode
              code={payloadJson}
              language='json'
              className='pg-json-pre'
            />
          </div>
        )}
      </div>

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
            disabled={
              runStatus === 'running' ||
              !hasModels ||
              !effectivePrompt ||
              !keyAllowed ||
              insufficientReferences ||
              !supportedSceneModel
            }
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
      </div>
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
              {mode === 'image' && generatedImages.length > 0 && (
                <>
                  <img
                    src={generatedImages[0]}
                    alt={effectivePrompt}
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
                    </span>
                    <a
                      href={generatedImages[0]}
                      target='_blank'
                      rel='noreferrer'
                      download={`magirouter-image.${imageFormat}`}
                      className='sr-card-route-tag no-underline'
                    >
                      下载原图 ↗
                    </a>
                  </div>
                  <div />
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
                          : `${imageSize} · ${imageCount} 张 · ${imageFormat}`}
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
