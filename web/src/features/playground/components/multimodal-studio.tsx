import { useQuery } from '@tanstack/react-query'
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
import { useEffect, useMemo, useRef, useState } from 'react'

import { HighlightedCode } from '@/features/docs/components/highlighted-code'
import { getApiKeys } from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'
import { resolveBaseUrl } from '@/features/magirouter-home/lib/snippets'
import { usePricingData } from '@/features/pricing/hooks'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

export type MultimodalMode = 'video' | 'image' | 'audio'

interface MultimodalStudioProps {
  mode: MultimodalMode
  groupValue: string
  groups: { value: string; label: string }[]
  onGroupChange: (group: string) => void
  onActiveModelChange?: (modelId: string) => void
}

interface MediaOption {
  id: string
  vendor: string
  summary: string
  unitPrice: number
  unitLabel: string
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
const MODE_COPY: Record<
  MultimodalMode,
  { summary: string; emptyHint: string }
> = {
  video: {
    summary: '视频生成模型 · 以控制台实际配置的分辨率与时长为准',
    emptyHint: '当前分组还没有可用的视频生成模型。',
  },
  image: {
    summary: '图像生成模型 · 以控制台实际配置的尺寸与质量档位为准',
    emptyHint: '当前分组还没有可用的图像生成模型。',
  },
  audio: {
    summary: '语音合成模型 · 以控制台实际配置的音色与格式为准',
    emptyHint: '当前分组还没有可用的语音合成模型。',
  },
}

const EXAMPLE_PROMPTS: Record<
  MultimodalMode,
  { title: string; prompt: string; meta: string }[]
> = {
  video: [
    {
      title: '清晨咖啡馆窗边热气特写',
      prompt:
        '清晨的咖啡馆窗边，蒸汽从杯口缓缓升起，镜头慢慢推近杯沿，背景人声轻柔，电影级自然晨光与浅景深。',
      meta: '720p · 5s · 16:9',
    },
    {
      title: '晨雾茶园慢推航拍',
      prompt:
        '清晨薄雾笼罩的高山梯田茶园，金色阳光穿透云层洒在露珠上，镜头缓慢低空推近，自然光影与微风沙沙声。',
      meta: '720p · 5s · 16:9',
    },
    {
      title: '极简建筑光影延时',
      prompt:
        '清水混凝土美术馆中庭，午后阳光斜射在几何楼梯上缓缓移动，极简克制的建筑摄影质感，电影级稳定运镜。',
      meta: '1080p · 5s · 16:9',
    },
  ],
  image: [
    {
      title: '极简陶瓷香薰产品摄影',
      prompt:
        '一只哑光米白色手工陶瓷香薰瓶放置在温润石灰岩台面上，侧逆自然窗光投下柔和长影，极简杂志棚拍构图。',
      meta: '1536×1024 · high',
    },
    {
      title: '现代编辑风科技海报',
      prompt:
        '黑白高对比度瑞士平面设计风格海报，干净留白与克制的几何线条，中心呈现磨砂玻璃棱镜折射微光。',
      meta: '1024×1024 · high',
    },
    {
      title: '自然光室内空间概念图',
      prompt:
        '日式侘寂风书房一角，原木长桌、亚麻窗帘、一枝枯梅插在黑陶瓶中，清晨漫射自然光与胶片质感。',
      meta: '1536×1024 · high',
    },
  ],
  audio: [
    {
      title: '品牌欢迎播报',
      prompt:
        '欢迎使用 MagiRouter，一个密钥即可低延迟调用全球主流语言、图像、视频与音频模型。',
      meta: 'marin · mp3 · 1.0x',
    },
    {
      title: '产品发布会旁白',
      prompt:
        '从单行 Base URL 切换到多模态生产级并发，每一次调用都以 1:1 汇率透明计费，失败请求自动免扣。',
      meta: 'cedar · mp3 · 1.0x',
    },
    {
      title: '英文双语播报示例',
      prompt:
        'MagiRouter unifies OpenAI Responses, Anthropic Messages, and Gemini native endpoints behind one reliable gateway.',
      meta: 'nova · mp3 · 1.0x',
    },
  ],
}

const AUDIO_WAVE_HEIGHTS = [
  28, 42, 65, 50, 82, 92, 60, 44, 76, 88, 56, 36, 68, 95, 74, 48, 62, 86, 54,
  38, 72, 90, 66, 44, 78, 84, 52, 34, 60, 74, 46, 30,
]

function matchesMultimodal(modelName: string, mode: MultimodalMode): boolean {
  const lower = modelName.toLowerCase()
  if (mode === 'video') {
    return (
      lower.includes('video') ||
      lower.includes('seedance') ||
      lower.includes('kling') ||
      lower.includes('veo') ||
      lower.includes('sora') ||
      lower.includes('hailuo') ||
      lower.includes('runway') ||
      lower.includes('luma')
    )
  }
  if (mode === 'image') {
    return (
      lower.includes('image') ||
      lower.includes('flux') ||
      lower.includes('seedream') ||
      lower.includes('dall') ||
      lower.includes('midjourney') ||
      lower.includes('imagen') ||
      lower.includes('banana')
    )
  }
  return (
    lower.includes('tts') ||
    lower.includes('audio') ||
    lower.includes('speech') ||
    lower.includes('whisper')
  )
}

function getResolutionFactor(resolution: string): number {
  if (resolution === '480p') return 0.65
  if (resolution === '1080p') return 1.55
  return 1
}

function getImageQualityFactor(quality: string): number {
  if (quality === 'low') return 0.6
  if (quality === 'high') return 1.65
  return 1
}

function getEndpointPath(mode: MultimodalMode, imageTask: string): string {
  if (mode === 'video') return '/v1/videos/generations'
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

function ensureBearerKey(rawKey: string): string {
  const trimmed = rawKey.trim()
  return trimmed.startsWith('sk-') ? trimmed : `sk-${trimmed}`
}

function extractShortLabel(url: string): string {
  const cleaned = url.split('?')[0] || url
  const parts = cleaned.split('/').filter(Boolean)
  return parts.at(-1) || cleaned
}

function getModeUnitSuffix(mode: MultimodalMode): string {
  if (mode === 'image') return '/ 张'
  return '/ 次'
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

export function MultimodalStudio(props: MultimodalStudioProps) {
  const { mode, groupValue, groups, onGroupChange, onActiveModelChange } = props
  const { status } = useStatus()
  const pricing = usePricingData(true)
  const baseUrl = resolveBaseUrl(status?.server_address)

  const keysQuery = useQuery({
    queryKey: ['playground-api-keys'],
    queryFn: () => getApiKeys({ p: 1, size: 50 }),
    staleTime: 60_000,
  })

  const enabledKeys = useMemo<ApiKey[]>(() => {
    const items = keysQuery.data?.data?.items ?? []
    return items.filter((item) => item.status === 1 && Boolean(item.key))
  }, [keysQuery.data])

  const [selectedKeyId, setSelectedKeyId] = useState<string>('')

  useEffect(() => {
    if (enabledKeys.length > 0 && !selectedKeyId) {
      setSelectedKeyId(String(enabledKeys[0].id))
    }
  }, [enabledKeys, selectedKeyId])

  const selectedKey = useMemo(
    () =>
      enabledKeys.find((item) => String(item.id) === selectedKeyId) ??
      enabledKeys[0] ??
      null,
    [enabledKeys, selectedKeyId]
  )

  const modelOptions = useMemo<MediaOption[]>(() => {
    const matched = pricing.models
      .filter((model) => matchesMultimodal(model.model_name, mode))
      .slice(0, 18)
      .map((model) => {
        const priced = model.quota_type === 1 && model.model_price > 0
        const unitPrice = priced ? model.model_price : 0
        const unitSuffix = getModeUnitSuffix(mode)
        return {
          id: model.model_name,
          vendor: model.vendor_name || 'MagiRouter',
          summary: model.description?.trim() || MODE_COPY[mode].summary,
          unitPrice,
          unitLabel: priced
            ? `$${unitPrice.toFixed(3)} ${unitSuffix}`
            : '按实际用量计费',
        }
      })
    return matched
  }, [pricing.models, mode])

  const [selectedModelId, setSelectedModelId] = useState(
    modelOptions[0]?.id ?? ''
  )

  const hasModels = modelOptions.length > 0
  const activeModel =
    modelOptions.find((item) => item.id === selectedModelId) ??
    modelOptions[0] ?? {
      id: '',
      vendor: '',
      summary: MODE_COPY[mode].summary,
      unitPrice: 0,
      unitLabel: '按实际用量计费',
    }

  useEffect(() => {
    if (activeModel?.id) {
      onActiveModelChange?.(activeModel.id)
    }
  }, [activeModel?.id, onActiveModelChange])

  const [inputView, setInputView] = useState<'form' | 'json'>('form')
  const [prompt, setPrompt] = useState('')
  const [activeExampleIdx, setActiveExampleIdx] = useState<number | null>(null)
  const [videoTask, setVideoTask] = useState<'t2v' | 'i2v' | 'ref2v' | 'edit'>(
    't2v'
  )
  const [resolution, setResolution] = useState<'480p' | '720p' | '1080p'>(
    '720p'
  )
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [duration, setDuration] = useState(5)
  const [nativeAudio, setNativeAudio] = useState(true)
  const [cameraFixed, setCameraFixed] = useState(false)
  const [imageTask, setImageTask] = useState<'generate' | 'edit'>('generate')
  const [imageSize, setImageSize] = useState('1536x1024')
  const [imageQuality, setImageQuality] = useState<
    'auto' | 'low' | 'medium' | 'high'
  >('high')
  const [imageCount, setImageCount] = useState(1)
  const [imageFormat, setImageFormat] = useState<'png' | 'jpeg' | 'webp'>('png')
  const [voice, setVoice] = useState('marin')
  const [audioFormat, setAudioFormat] = useState<
    'mp3' | 'wav' | 'opus' | 'aac' | 'flac'
  >('mp3')
  const [speed, setSpeed] = useState(1)
  const [instructions, setInstructions] = useState('')
  const [references, setReferences] = useState<ReferenceEntry[]>([])
  const [showRefInput, setShowRefInput] = useState(false)
  const [refInput, setRefInput] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const [runStatus, setRunStatus] = useState<
    'idle' | 'running' | 'done' | 'error'
  >('idle')
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

  const groupRatio = useMemo(() => {
    const raw = pricing.groupRatio[groupValue]
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : 1
  }, [pricing.groupRatio, groupValue])

  const estimatedCost = useMemo(() => {
    if (props.mode === 'video') {
      return (
        activeModel.unitPrice *
        duration *
        getResolutionFactor(resolution) *
        groupRatio
      )
    }
    if (props.mode === 'image') {
      return (
        activeModel.unitPrice *
        imageCount *
        getImageQualityFactor(imageQuality) *
        groupRatio
      )
    }
    const estMinutes = Math.max(0.05, (prompt.trim().length || 30) / 360)
    return activeModel.unitPrice * estMinutes * groupRatio
  }, [
    activeModel.unitPrice,
    duration,
    groupRatio,
    imageCount,
    imageQuality,
    prompt,
    props.mode,
    resolution,
  ])

  const endpointPath = getEndpointPath(props.mode, imageTask)
  const examples = EXAMPLE_PROMPTS[props.mode]
  const effectivePrompt = prompt.trim() || examples[0].prompt

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
    setActiveExampleIdx(null)
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
    if (!selectedKey?.key) {
      setRunStatus('error')
      setErrorMessage(
        '请先在「API 密钥」页面创建一个启用状态的密钥，再发起多模态实时生成。'
      )
      return
    }

    setRunStatus('running')
    setErrorMessage(null)

    const authHeader = `Bearer ${ensureBearerKey(selectedKey.key)}`

    try {
      if (props.mode === 'image') {
        const response = await fetch(`${baseUrl}${endpointPath}`, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payloadObject),
        })
        const json = await response.json().catch(() => null)
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
        const response = await fetch(`${baseUrl}${endpointPath}`, {
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
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl)
        }
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

      let response = await fetch(`${baseUrl}/v1/videos/generations`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadObject),
      })
      if (response.status === 404) {
        response = await fetch(`${baseUrl}/v1/video/generations`, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payloadObject),
        })
      }
      const json = await response.json().catch(() => null)
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
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : '调用失败，请检查密钥权限、余额或模型分组配置。'
      setRunStatus('error')
      setErrorMessage(message)
      appendRunRecord('error', message)
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
      <div className='pg-workspace-grid' id='pg-workspace-grid'>
        <div className='pg-panel pg-config-panel'>
          <div className='pg-empty-multimodal'>
            <span className='pg-empty-eyebrow'>MODALITY NOT CONFIGURED</span>
            <h3 className='pg-empty-title'>{MODE_COPY[mode].emptyHint}</h3>
            <p className='pg-empty-desc'>
              当前分组只暴露了已上线且可用渠道支持的模型。先到控制台的「模型广场」确认模型已启用，
              再到「渠道」为该模型挂上可用渠道，这里会自动出现。
            </p>
            <div className='pg-empty-actions'>
              <Link to='/pricing' className='el-btn el-btn-sm el-btn-primary'>
                查看模型广场 →
              </Link>
              <Link
                to='/dashboard/models'
                className='el-btn el-btn-sm el-btn-white'
              >
                控制台 · 模型与渠道
              </Link>
            </div>
          </div>
        </div>
        <div className='pg-panel pg-preview-panel'>
          <div className='pg-empty-preview'>
            <span>{pricing.isLoading ? '正在读取线上模型目录…' : '暂无可用模型'}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='pg-workspace-grid' id='pg-workspace-grid'>
      <div className='pg-panel pg-config-panel'>
        <div className='pg-api-bar'>
          <div className='pg-api-col'>
            <label htmlFor='pg-api-key-select' className='pg-api-label'>
              API 密钥
            </label>
            {enabledKeys.length > 0 ? (
              <select
                id='pg-api-key-select'
                value={selectedKey ? String(selectedKey.id) : ''}
                onChange={(event) => setSelectedKeyId(event.target.value)}
                className='el-select-trigger w-full'
              >
                {enabledKeys.map((apiKey) => (
                  <option key={apiKey.id} value={String(apiKey.id)}>
                    {apiKey.name || `Key #${apiKey.id}`}
                  </option>
                ))}
              </select>
            ) : (
              <Link
                to='/keys'
                className='el-select-trigger w-full justify-between no-underline'
              >
                <span className='truncate'>前往创建密钥 →</span>
              </Link>
            )}
          </div>
          <div className='pg-api-col'>
            <label htmlFor='pg-route-group-select' className='pg-api-label'>
              路由分组
            </label>
            <select
              id='pg-route-group-select'
              value={groupValue}
              onChange={(event) => onGroupChange(event.target.value)}
              className='el-select-trigger w-full'
            >
              {groups.length > 0 ? (
                groups.map((group) => (
                  <option key={group.value} value={group.value}>
                    {group.label}
                  </option>
                ))
              ) : (
                <option value='default'>default · 1.00x</option>
              )}
            </select>
          </div>
        </div>

        <div className='pg-panel-scroll'>
          <div className='pg-model-section'>
            <div className='pg-model-head-row'>
              <span className='pg-field-label'>选择模型</span>
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
              <select
                aria-label='选择模型'
                value={activeModel.id}
                onChange={(event) => setSelectedModelId(event.target.value)}
                className='el-select-trigger min-w-0 flex-1'
              >
                {modelOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.id}
                  </option>
                ))}
              </select>
              <Link
                to='/pricing/$modelId'
                params={{ modelId: activeModel.id }}
                className='el-btn el-btn-xs el-btn-white pg-detail-btn'
              >
                详情
              </Link>
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

              <div className='pg-field'>
                <div className='pg-field-head'>
                  <span className='pg-field-label'>
                    {props.mode === 'audio' ? '合成文本' : '提示词'}
                  </span>
                  <span className='pg-char-count'>{prompt.length} / 2000</span>
                </div>
                <textarea
                  className='pg-textarea'
                  rows={4}
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value)
                    setActiveExampleIdx(null)
                  }}
                  placeholder={getPromptPlaceholder(mode)}
                />
              </div>

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
                      {['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].map(
                        (ratio) => (
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
                        )
                      )}
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
                        onChange={(event) =>
                          setNativeAudio(event.target.checked)
                        }
                        className='size-4 accent-black dark:accent-white'
                      />
                    </label>
                    <label className='pg-toggle-item cursor-pointer'>
                      <span>固定镜头</span>
                      <input
                        type='checkbox'
                        checked={cameraFixed}
                        onChange={(event) =>
                          setCameraFixed(event.target.checked)
                        }
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
                      {['1536x1024', '1024x1024', '1024x1536'].map((size) => (
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
                      ))}
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
                      {[1, 2, 4].map((count) => (
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
                      {[
                        'marin',
                        'cedar',
                        'alloy',
                        'ash',
                        'coral',
                        'nova',
                        'sage',
                      ].map((voiceName) => (
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
          <div
            className='pg-cost-summary'
            title='按当前规格与分组倍率估算 · 上游失败自动免扣'
          >
            <div className='pg-cost-left'>
              <span className='pg-cost-label'>预估</span>
              <span className='pg-cost-val tabular-nums'>
                ~${estimatedCost.toFixed(4)}
              </span>
            </div>
            <span className='el-pill tabular-nums' id='create-price-badge'>
              {activeModel.unitLabel}
            </span>
          </div>
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
              重置
            </button>
            <button
              type='button'
              disabled={runStatus === 'running'}
              className='el-btn el-btn-sm el-btn-primary'
              onClick={() => void handleSubmit()}
            >
              {runStatus === 'running' ? (
                <>
                  <Loader2 size={14} className='animate-spin' />
                  <span>生成中…</span>
                </>
              ) : (
                <span>提交生成 →</span>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className='pg-panel pg-stage-panel'>
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={15} style={{ color: '#FA4028', flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </span>
            {!selectedKey && (
              <Link to='/keys' className='el-btn el-btn-xs el-btn-white'>
                管理密钥
              </Link>
            )}
          </div>
        )}

        {props.mode === 'audio' ? (
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
                  className='create-stage-art object-contain bg-black/80'
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
                  className='create-stage-art object-contain bg-black'
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
                  <span className='sr-card-route-tag'>{stageModeBadge}</span>
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

        <div className='pg-stage-prompts' id='pg-stage-prompts'>
          <div className='pg-stage-prompts-head'>
            <span className='pg-stage-prompts-label'>示例提示词</span>
            <span className='pg-stage-prompts-hint'>点击填入左侧提示词</span>
          </div>
          <div className='pg-stage-prompts-list'>
            {examples.map((example, exampleIdx) => (
              <button
                key={example.title}
                type='button'
                onClick={() => {
                  setPrompt(example.prompt)
                  setActiveExampleIdx(exampleIdx)
                }}
                className={cn(
                  'pg-stage-prompt-item',
                  activeExampleIdx === exampleIdx && 'is-active'
                )}
              >
                <span className='pg-stage-prompt-main'>
                  <span className='pg-stage-prompt-index'>
                    {String(exampleIdx + 1).padStart(2, '0')}
                  </span>
                  <span className='pg-stage-prompt-text'>{example.prompt}</span>
                </span>
                <span className='pg-stage-prompt-arrow' aria-hidden='true'>
                  ↗
                </span>
              </button>
            ))}
          </div>
        </div>

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
                  <span className='pg-char-count shrink-0'>{run.timeLabel}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
