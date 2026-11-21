import { Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { PricingModel } from '@/features/pricing/types'
import { copyToClipboard } from '@/lib/copy-to-clipboard'

interface HeroProps {
  isAuthenticated: boolean
  baseUrl: string
  sampleModel: string
  models: PricingModel[]
  cheapestGroupLabel?: string
}

type CapabilityKey = 'text' | 'image' | 'video' | 'audio'

const IMAGE_PATTERN = /image|flux|dall|midjourney|seedream|banana|ideogram|recraft/i
const VIDEO_PATTERN = /video|seedance|kling|veo|sora|minimax|runway|luma|vidu/i
const AUDIO_PATTERN = /audio|tts|whisper|speech|transcrib|voice/i

function pickLiveChips(
  models: PricingModel[],
  matcher: (model: PricingModel) => boolean,
  preferred: string[]
): string[] {
  const matched = models.filter(matcher)
  if (matched.length === 0) return preferred
  const chosen: string[] = []
  for (const name of preferred) {
    const found = matched.find(
      (item) => item.model_name.toLowerCase() === name.toLowerCase()
    )
    if (found && !chosen.includes(found.model_name)) {
      chosen.push(found.model_name)
    }
  }
  for (const item of matched) {
    if (chosen.length >= 4) break
    if (!chosen.includes(item.model_name)) {
      chosen.push(item.model_name)
    }
  }
  return chosen.slice(0, 4)
}

export function Hero(props: HeroProps) {
  const navigate = useNavigate()
  const [activeCapability, setActiveCapability] =
    useState<CapabilityKey>('text')
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const audioTimerRef = useRef<number | null>(null)
  const endpoint = `${props.baseUrl}/v1`

  const modelNameSet = new Set(props.models.map((item) => item.model_name))

  const textChips = pickLiveChips(
    props.models,
    (item) => {
      const combined = `${item.model_name} ${item.tags ?? ''}`
      return (
        !IMAGE_PATTERN.test(combined) &&
        !VIDEO_PATTERN.test(combined) &&
        !AUDIO_PATTERN.test(combined)
      )
    },
    ['gpt-6.2-sol', 'claude-opus-5.5', 'gemini-4-hydrogen', 'deepseek-v4.1-flash']
  )
  const imageChips = pickLiveChips(
    props.models,
    (item) => IMAGE_PATTERN.test(`${item.model_name} ${item.tags ?? ''}`),
    ['gpt-image-2.5', 'nano-banana-2', 'seedream-5.5', 'flux-3-klein']
  )
  const videoChips = pickLiveChips(
    props.models,
    (item) => VIDEO_PATTERN.test(`${item.model_name} ${item.tags ?? ''}`),
    ['seedance-2.5', 'kling-4.0', 'veo-3.1', 'minimax-h3']
  )
  const audioChips = pickLiveChips(
    props.models,
    (item) => AUDIO_PATTERN.test(`${item.model_name} ${item.tags ?? ''}`),
    ['whisper-1', 'gpt-audio-1.5']
  )

  const handleCopyBaseUrl = useCallback(async () => {
    const copied = await copyToClipboard(endpoint)
    if (copied) {
      setCopiedUrl(true)
      window.setTimeout(() => setCopiedUrl(false), 1800)
    }
  }, [endpoint])

  const handleJumpModel = useCallback(
    (modelName: string) => {
      if (modelNameSet.has(modelName)) {
        void navigate({
          to: '/pricing/$modelId',
          params: { modelId: modelName },
        })
      } else {
        void navigate({
          to: '/pricing',
          search: { search: modelName },
        })
      }
    },
    [modelNameSet, navigate]
  )

  const handleToggleAudioDemo = useCallback(() => {
    if (audioPlaying) {
      if (audioTimerRef.current) window.clearTimeout(audioTimerRef.current)
      setAudioPlaying(false)
      return
    }
    setAudioPlaying(true)
    try {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (AudioCtor) {
        const ctx = new AudioCtor()
        const notes = [440, 554.37, 659.25]
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = freq
          const start = ctx.currentTime + idx * 0.16
          gain.gain.setValueAtTime(0.001, start)
          gain.gain.exponentialRampToValueAtTime(0.06, start + 0.04)
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(start)
          osc.stop(start + 0.36)
        })
        window.setTimeout(() => {
          void ctx.close().catch(() => undefined)
        }, 1200)
      }
    } catch {
      // AudioContext unavailable in restricted environments
    }
    audioTimerRef.current = window.setTimeout(() => {
      setAudioPlaying(false)
    }, 3200)
  }, [audioPlaying])

  useEffect(() => {
    return () => {
      if (audioTimerRef.current) window.clearTimeout(audioTimerRef.current)
    }
  }, [])

  const leadTextModel = textChips[0] || props.sampleModel || 'gpt-6.2-sol'
  const leadImageModel = imageChips[0] || 'gpt-image-2.5'
  const leadVideoModel = videoChips[0] || 'seedance-2.5'
  const leadAudioModel = audioChips[audioChips.length - 1] || 'gpt-audio-1.5'

  return (
    <section className='hero-section'>
      <div className='el-container'>
        <div className='hero-header-center'>
          <h1 className='el-h1'>
            MagiRouter：统一 API 调用
            <br />
            以极低折扣接通全球顶级模型
          </h1>
          <p className='el-body' style={{ maxWidth: 680 }}>
            MagiRouter 帮你把图片、视频和语言模型放在同一把 Key 后面。只为交付的内容付费，请求失败不收费，让团队以极低成本快速把生产级 AI 能力接入自己的产品。
          </p>
          <div className='hero-cta-row'>
            <Link
              to={props.isAuthenticated ? '/dashboard' : '/sign-up'}
              className='el-btn el-btn-xl el-btn-primary hero-start-btn'
            >
              <span>{props.isAuthenticated ? '进入控制台' : '立即开始'}</span>
              <svg
                className='btn-arrow'
                width='16'
                height='16'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
                aria-hidden='true'
              >
                <path d='M5 12h14' />
                <path d='m12 5 7 7-7 7' />
              </svg>
            </Link>
            <Link to='/pricing' className='el-btn el-btn-xl el-btn-white'>
              浏览价格列表
            </Link>
          </div>

          <button
            type='button'
            className='baseurl-copy-box'
            id='hero-baseurl-copy'
            aria-label={`复制 Base URL ${endpoint}`}
            onClick={() => void handleCopyBaseUrl()}
          >
            <span className='baseurl-route-label'>
              <span className='status-dot' aria-hidden='true' />
              <span>Base URL</span>
            </span>
            <span className='baseurl-divider' aria-hidden='true' />
            <code className='baseurl-code'>{endpoint}</code>
            <span className='baseurl-copy-icon' aria-hidden='true'>
              {copiedUrl ? (
                <svg
                  width='14'
                  height='14'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='var(--el-green-600)'
                  strokeWidth='2.2'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                >
                  <polyline points='20 6 9 17 4 12' />
                </svg>
              ) : (
                <svg
                  width='14'
                  height='14'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.9'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                >
                  <rect x='9' y='9' width='13' height='13' rx='2' />
                  <path d='M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' />
                </svg>
              )}
            </span>
          </button>
        </div>

        <div className='showcase-wrap'>
          <div className='showcase-shell'>
            <div className='showcase-tab-collar'>
              <div
                className='showcase-tablist'
                role='tablist'
                aria-label='模型能力展示'
              >
                <button
                  type='button'
                  className='showcase-tab'
                  role='tab'
                  aria-selected={activeCapability === 'text'}
                  onClick={() => setActiveCapability('text')}
                >
                  <svg
                    className='showcase-tab-icon'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='1.8'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    aria-hidden='true'
                  >
                    <path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' />
                    <path d='M8 9h8' />
                    <path d='M8 13h5' />
                  </svg>
                  <span>语言模型</span>
                </button>
                <button
                  type='button'
                  className='showcase-tab'
                  role='tab'
                  aria-selected={activeCapability === 'image'}
                  onClick={() => setActiveCapability('image')}
                >
                  <svg
                    className='showcase-tab-icon'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='1.8'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    aria-hidden='true'
                  >
                    <rect x='3' y='3' width='18' height='18' rx='2' />
                    <circle cx='9' cy='9' r='2' />
                    <path d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' />
                  </svg>
                  <span>图片生成</span>
                </button>
                <button
                  type='button'
                  className='showcase-tab'
                  role='tab'
                  aria-selected={activeCapability === 'video'}
                  onClick={() => setActiveCapability('video')}
                >
                  <svg
                    className='showcase-tab-icon'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='1.8'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    aria-hidden='true'
                  >
                    <path d='M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z' />
                    <path d='m6.2 5.3 3.1 3.9' />
                    <path d='m12.4 3.4 3.1 4' />
                    <path d='M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z' />
                  </svg>
                  <span>视频生成</span>
                </button>
                <button
                  type='button'
                  className='showcase-tab'
                  role='tab'
                  aria-selected={activeCapability === 'audio'}
                  onClick={() => setActiveCapability('audio')}
                >
                  <svg
                    className='showcase-tab-icon'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='1.8'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    aria-hidden='true'
                  >
                    <path d='M2 10v3' />
                    <path d='M6 6v11' />
                    <path d='M10 3v18' />
                    <path d='M14 8v7' />
                    <path d='M18 5v13' />
                    <path d='M22 10v3' />
                  </svg>
                  <span>音频生成</span>
                </button>
              </div>
            </div>

            <div className='showcase-card'>
              {activeCapability === 'text' && (
                <div className='showcase-panel'>
                  <div className='showcase-left'>
                    <div>
                      <span className='el-eyebrow'>
                        LANGUAGE MODELS · OPENAI RESPONSES
                      </span>
                      <p className='showcase-desc'>
                        优先通过 OpenAI Responses（/v1/responses）接入对话、深度推理、代码生成与智能体工具调用，并按优先级提供 Anthropic Messages、Gemini 与 OpenAI Chat Completions 协议接口。全系列不降智号池稳定输出。
                      </p>
                      <div className='showcase-model-chips'>
                        {textChips.map((chipName) => (
                          <button
                            key={chipName}
                            type='button'
                            className='showcase-model-chip'
                            onClick={() => handleJumpModel(chipName)}
                          >
                            {chipName}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Link
                        to='/pricing'
                        className='el-btn el-btn-lg el-btn-white'
                      >
                        探索全部语言模型 API ↗
                      </Link>
                    </div>
                  </div>

                  <div className='showcase-right'>
                    <div className='showcase-paper'>
                      <div>
                        <div className='demo-prompt-card'>
                          为新款陶瓷香薰花器撰写一段 60 字以内的商品介绍，突出手工釉面与极简桌面陈列感。
                        </div>
                        <div className='demo-reply-stream'>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: 8,
                            }}
                          >
                            <span className='el-eyebrow'>
                              RESPONSES STREAM · {leadTextModel.toUpperCase()}
                            </span>
                            <span
                              className='tabular-nums'
                              style={{
                                fontSize: '11.5px',
                                color: 'var(--ink-muted)',
                              }}
                            >
                              首字 310ms · 92 tok/s
                            </span>
                          </div>
                          温润窑变白釉覆盖手工拉坯器身，哑光石质肌理自然融入桌面光线。无需多余装饰，一枝枯枝或几滴冷萃精油，即刻为办公与居家角落注入松弛秩序。
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: 14,
                          fontSize: 12,
                          color: 'var(--ink-muted)',
                        }}
                      >
                        <span>
                          支持 Responses 工具调用 · Structured Outputs · Prompt Caching
                        </span>
                        <span className='tabular-nums'>
                          {props.cheapestGroupLabel || 'GPT Pro ×0.25'}
                        </span>
                      </div>
                    </div>
                    <div className='showcase-endpoint-bar'>
                      <span>$ POST /v1/responses</span>
                      <span style={{ color: 'var(--ink-muted)' }}>
                        &quot;model&quot;: &quot;{leadTextModel}&quot;
                      </span>
                      <span className='endpoint-status'>✓ 200 OK</span>
                    </div>
                  </div>
                </div>
              )}

              {activeCapability === 'image' && (
                <div className='showcase-panel'>
                  <div className='showcase-left'>
                    <div>
                      <span className='el-eyebrow'>
                        IMAGE GENERATION &amp; EDITING
                      </span>
                      <p className='showcase-desc'>
                        通过自然语言提示词与多参考图完成文生图与图像编辑。覆盖商品精修、角色一致性、精准海报文字排版与最高 4K 分辨率输出，按张或按用量透明计费。
                      </p>
                      <div className='showcase-model-chips'>
                        {imageChips.map((chipName) => (
                          <button
                            key={chipName}
                            type='button'
                            className='showcase-model-chip'
                            onClick={() => handleJumpModel(chipName)}
                          >
                            {chipName}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Link
                        to='/pricing'
                        className='el-btn el-btn-lg el-btn-white'
                      >
                        探索全部图片 API ↗
                      </Link>
                    </div>
                  </div>

                  <div className='showcase-right'>
                    <div className='showcase-paper'>
                      <div
                        className='demo-visual-stage'
                        style={{
                          background:
                            'radial-gradient(circle at 72% 28%, #F6D8B8 0%, #D99B66 28%, #543D2B 72%, #211812 100%)',
                          color: '#FFFFFF',
                        }}
                      >
                        <svg
                          viewBox='0 0 560 220'
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                          aria-hidden='true'
                        >
                          <defs>
                            <linearGradient
                              id='mrAmberBottle'
                              x1='0'
                              y1='0'
                              x2='1'
                              y2='1'
                            >
                              <stop
                                offset='0%'
                                stopColor='#FDE6C4'
                                stopOpacity='0.92'
                              />
                              <stop
                                offset='48%'
                                stopColor='#C86D2D'
                                stopOpacity='0.95'
                              />
                              <stop
                                offset='100%'
                                stopColor='#3E1D0C'
                                stopOpacity='0.98'
                              />
                            </linearGradient>
                            <radialGradient
                              id='mrSunGlow'
                              cx='65%'
                              cy='30%'
                              r='50%'
                            >
                              <stop
                                offset='0%'
                                stopColor='#FFF3DF'
                                stopOpacity='0.55'
                              />
                              <stop
                                offset='100%'
                                stopColor='#FFF3DF'
                                stopOpacity='0'
                              />
                            </radialGradient>
                          </defs>
                          <rect width='560' height='220' fill='url(#mrSunGlow)' />
                          <ellipse
                            cx='320'
                            cy='192'
                            rx='135'
                            ry='18'
                            fill='rgba(12,10,9,0.45)'
                          />
                          <rect
                            x='275'
                            y='74'
                            width='90'
                            height='114'
                            rx='18'
                            fill='url(#mrAmberBottle)'
                          />
                          <rect
                            x='303'
                            y='42'
                            width='34'
                            height='36'
                            rx='6'
                            fill='#231814'
                          />
                          <rect
                            x='289'
                            y='108'
                            width='62'
                            height='52'
                            rx='6'
                            fill='#FDFCFC'
                            fillOpacity='0.88'
                          />
                          <line
                            x1='299'
                            y1='126'
                            x2='341'
                            y2='126'
                            stroke='#1C1917'
                            strokeWidth='2.5'
                          />
                          <line
                            x1='305'
                            y1='138'
                            x2='335'
                            y2='138'
                            stroke='#777169'
                            strokeWidth='1.5'
                          />
                          <circle
                            cx='155'
                            cy='145'
                            r='36'
                            fill='rgba(253,252,252,0.16)'
                            stroke='rgba(255,255,255,0.28)'
                            strokeWidth='0.8'
                          />
                        </svg>
                        <div
                          style={{
                            position: 'relative',
                            zIndex: 2,
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-end',
                            gap: 12,
                          }}
                        >
                          <div
                            style={{
                              fontSize: '12.5px',
                              background: 'rgba(12,10,9,0.58)',
                              backdropFilter: 'blur(8px)',
                              padding: '8px 12px',
                              borderRadius: 10,
                              border: '0.5px solid rgba(255,255,255,0.2)',
                            }}
                          >
                            &quot;暖奶油色背景上的琥珀色玻璃瓶，柔和棚拍侧光，极简商品摄影&quot;
                          </div>
                          <span className='sr-card-route-tag'>
                            1024×1024 · 4K 可选
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className='showcase-endpoint-bar'>
                      <span>$ POST /v1/images/generations</span>
                      <span style={{ color: 'var(--ink-muted)' }}>
                        &quot;model&quot;: &quot;{leadImageModel}&quot;
                      </span>
                      <span className='endpoint-status'>✓ completed</span>
                    </div>
                  </div>
                </div>
              )}

              {activeCapability === 'video' && (
                <div className='showcase-panel'>
                  <div className='showcase-left'>
                    <div>
                      <span className='el-eyebrow'>
                        VIDEO &amp; NATIVE AUDIO TASKS
                      </span>
                      <p className='showcase-desc'>
                        支持文生视频与首帧驱动生成，按模型原生能力输出分辨率与时长，支持原生音频的模型自动随片交付。提交后返回任务 ID，支持轮询或 Webhook 通知。
                      </p>
                      <div className='showcase-model-chips'>
                        {videoChips.map((chipName) => (
                          <button
                            key={chipName}
                            type='button'
                            className='showcase-model-chip'
                            onClick={() => handleJumpModel(chipName)}
                          >
                            {chipName}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Link
                        to='/pricing'
                        className='el-btn el-btn-lg el-btn-white'
                      >
                        探索全部视频 API ↗
                      </Link>
                    </div>
                  </div>

                  <div className='showcase-right'>
                    <div className='showcase-paper'>
                      <div
                        className='demo-visual-stage'
                        style={{
                          background:
                            'linear-gradient(155deg, #27323F 0%, #5B5048 45%, #D99B6C 85%, #F7CFA0 100%)',
                          color: '#FFFFFF',
                        }}
                      >
                        <svg
                          viewBox='0 0 560 220'
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                          }}
                          aria-hidden='true'
                        >
                          <path
                            d='M0 155 Q140 132 280 148 T560 140 L560 220 L0 220 Z'
                            fill='rgba(18,22,28,0.62)'
                          />
                          <circle
                            cx='430'
                            cy='72'
                            r='28'
                            fill='rgba(255,226,184,0.85)'
                          />
                          <path
                            d='M120 148 L146 92 L160 112 L176 76 L202 148 Z'
                            fill='rgba(12,10,9,0.5)'
                          />
                        </svg>
                        <div
                          style={{
                            position: 'relative',
                            zIndex: 2,
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                            }}
                          >
                            <span
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 9999,
                                background: '#FFFFFF',
                                color: '#000000',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              ▶
                            </span>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>
                                黄昏海峡渡轮跟拍 · 原生环境音
                              </div>
                              <div
                                style={{
                                  fontSize: '11.5px',
                                  color: 'rgba(255,255,255,0.72)',
                                }}
                              >
                                1080p · 24fps · 00:05
                              </div>
                            </div>
                          </div>
                          <span className='sr-card-route-tag'>
                            异步任务 · 失败不计费
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className='showcase-endpoint-bar'>
                      <span>$ POST /v1/videos/generations</span>
                      <span style={{ color: 'var(--ink-muted)' }}>
                        &quot;model&quot;: &quot;{leadVideoModel}&quot;
                      </span>
                      <span className='endpoint-status'>✓ completed</span>
                    </div>
                  </div>
                </div>
              )}

              {activeCapability === 'audio' && (
                <div className='showcase-panel'>
                  <div className='showcase-left'>
                    <div>
                      <span className='el-eyebrow'>
                        SPEECH SYNTHESIS &amp; TRANSCRIPTION
                      </span>
                      <p className='showcase-desc'>
                        覆盖超拟真语音合成（TTS）、多语种高精度语音转文字（STT）与音频配音生成，支持情感停顿标记与流式低延迟输出，适配语音助手与内容创作流程。
                      </p>
                      <div className='showcase-model-chips'>
                        {audioChips.map((chipName) => (
                          <button
                            key={chipName}
                            type='button'
                            className='showcase-model-chip'
                            onClick={() => handleJumpModel(chipName)}
                          >
                            {chipName}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Link
                        to='/pricing'
                        className='el-btn el-btn-lg el-btn-white'
                      >
                        探索全部音频 API ↗
                      </Link>
                    </div>
                  </div>

                  <div className='showcase-right'>
                    <div className='showcase-paper'>
                      <div className='demo-prompt-card'>
                        “欢迎接入 MagiRouter 统一路由网关。只需一次配置，即可稳定调用全系列文本、视觉与语音模型。”
                      </div>
                      <div
                        className={`demo-audio-player${audioPlaying ? ' is-playing' : ''}`}
                      >
                        <div
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 10,
                            background:
                              'radial-gradient(circle at 30% 30%, #FFAE70, #FA4028)',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 96 }}>
                          <div
                            style={{
                              fontSize: '13.5px',
                              fontWeight: 500,
                              color: 'var(--ink-strong)',
                            }}
                          >
                            中文拟真女声
                          </div>
                          <div
                            className='tabular-nums'
                            style={{
                              fontSize: '11.5px',
                              color: 'var(--ink-muted)',
                            }}
                          >
                            0:14 · 48kHz
                          </div>
                        </div>
                        <div className='audio-wave-bars' aria-hidden='true'>
                          {[10, 18, 24, 14, 22, 26, 12, 20, 16, 24, 14, 18].map(
                            (barHeight, barIdx) => (
                              <span
                                key={barIdx}
                                style={{ height: barHeight }}
                              />
                            )
                          )}
                        </div>
                        <button
                          type='button'
                          className='el-btn el-btn-sm el-btn-primary'
                          style={{ width: 36, height: 36, padding: 0 }}
                          aria-label={audioPlaying ? '停止试听' : '试听音频演示'}
                          onClick={handleToggleAudioDemo}
                        >
                          {audioPlaying ? '❚❚' : '▶'}
                        </button>
                      </div>
                    </div>
                    <div className='showcase-endpoint-bar'>
                      <span>$ POST /v1/audio/speech</span>
                      <span style={{ color: 'var(--ink-muted)' }}>
                        &quot;model&quot;: &quot;{leadAudioModel}&quot;
                      </span>
                      <span className='endpoint-status'>✓ streaming</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
