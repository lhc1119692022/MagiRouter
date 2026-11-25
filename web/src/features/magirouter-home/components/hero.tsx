import { Link } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'

import { getModelPlaygroundModes } from '@/features/pricing/lib/filters'
import type { PricingModel } from '@/features/pricing/types'
import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { getLobeIcon } from '@/lib/lobe-icon'

import {
  DEFAULT_SHOWCASE_TABS,
  resolveShowcaseMediaKind,
  type CapabilityKey,
  type HomeShowcaseConfig,
  type ShowcasePlaygroundMode,
} from '../lib/showcase-config'

interface HeroProps {
  isAuthenticated: boolean
  baseUrl: string
  models: PricingModel[]
  showcaseConfig?: HomeShowcaseConfig
}

const IMAGE_PATTERN =
  /image|flux|dall|midjourney|seedream|banana|ideogram|recraft/i
const VIDEO_PATTERN = /video|seedance|kling|veo|sora|minimax|runway|luma|vidu/i
const AUDIO_PATTERN = /audio|tts|whisper|speech|transcrib|voice/i

function matchesCapability(
  model: PricingModel,
  capability: CapabilityKey
): boolean {
  const combined = `${model.model_name} ${model.tags ?? ''}`
  switch (capability) {
    case 'image':
      return IMAGE_PATTERN.test(combined)
    case 'video':
      return VIDEO_PATTERN.test(combined)
    case 'audio':
      return AUDIO_PATTERN.test(combined)
    case 'text':
      return (
        !IMAGE_PATTERN.test(combined) &&
        !VIDEO_PATTERN.test(combined) &&
        !AUDIO_PATTERN.test(combined)
      )
  }
}

function pickLiveModels(
  models: PricingModel[],
  capability: CapabilityKey,
  preferred: string[]
): string[] {
  const matched = models.filter((item) => matchesCapability(item, capability))
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
    if (chosen.length >= 3) break
    if (!chosen.includes(item.model_name)) {
      chosen.push(item.model_name)
    }
  }
  return chosen.slice(0, 3)
}

function resolveModelMode(
  model: PricingModel | undefined,
  fallback: ShowcasePlaygroundMode
): ShowcasePlaygroundMode {
  if (!model) return fallback
  const [mode] = getModelPlaygroundModes(model)
  return mode ?? fallback
}

export function Hero(props: HeroProps) {
  const [activeCapability, setActiveCapability] =
    useState<CapabilityKey>('text')
  const [copiedUrl, setCopiedUrl] = useState(false)
  const endpoint = props.baseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '')

  const modelByName = useMemo(() => {
    const map = new Map<string, PricingModel>()
    for (const model of props.models) {
      map.set(model.model_name.toLowerCase(), model)
    }
    return map
  }, [props.models])

  const handleCopyBaseUrl = useCallback(async () => {
    const copied = await copyToClipboard(endpoint)
    if (copied) {
      setCopiedUrl(true)
      window.setTimeout(() => setCopiedUrl(false), 1800)
    }
  }, [endpoint])

  const activeDefaults = DEFAULT_SHOWCASE_TABS[activeCapability]
  const customItem = props.showcaseConfig?.[activeCapability]
  const eyebrow = customItem?.eyebrow ?? activeDefaults.eyebrow
  const title = customItem?.title ?? activeDefaults.title
  const description = customItem?.description ?? activeDefaults.description
  const exploreLabel = customItem?.explore_label ?? '探索全部'
  const mediaUrl = customItem?.media_url
  const posterUrl = customItem?.poster_url
  const mediaKind = resolveShowcaseMediaKind(mediaUrl, customItem?.media_type)

  let mediaBackdrop = (
    <div className={`showcase-ambient showcase-ambient-${activeCapability}`}>
      <span className='showcase-orb showcase-orb-primary' />
      <span className='showcase-orb showcase-orb-secondary' />
      <span className='showcase-orb showcase-orb-accent' />
      <span className='showcase-grain' />
    </div>
  )
  if (mediaKind === 'video' && mediaUrl) {
    mediaBackdrop = (
      <video
        key={mediaUrl}
        className='showcase-media-bg'
        src={mediaUrl}
        poster={posterUrl}
        autoPlay
        muted
        loop
        playsInline
      />
    )
  } else if (mediaKind === 'image' && mediaUrl) {
    mediaBackdrop = (
      <img key={mediaUrl} className='showcase-media-bg' src={mediaUrl} alt='' />
    )
  }

  const showcaseModels = useMemo(() => {
    const configured = customItem?.models
    const names =
      configured && configured.length > 0
        ? configured
        : pickLiveModels(
            props.models,
            activeCapability,
            activeDefaults.preferredModels
          )

    return names.map((name) => {
      const matched = modelByName.get(name.toLowerCase())
      const iconKey =
        matched?.icon || matched?.vendor_icon || matched?.vendor_name
      return {
        name: matched?.model_name ?? name,
        iconKey,
        mode: resolveModelMode(matched, activeDefaults.playgroundMode),
      }
    })
  }, [
    activeCapability,
    activeDefaults.playgroundMode,
    activeDefaults.preferredModels,
    customItem?.models,
    modelByName,
    props.models,
  ])

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
            MagiRouter 帮你把图片、视频和语言模型放在同一把 Key
            后面。只为交付的内容付费，请求失败不收费，让团队以极低成本快速把生产级
            AI 能力接入自己的产品。
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
                  id='showcase-tab-text'
                  aria-controls='showcase-stage-panel'
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
                  id='showcase-tab-image'
                  aria-controls='showcase-stage-panel'
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
                  id='showcase-tab-video'
                  aria-controls='showcase-stage-panel'
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
                    <rect x='2' y='4' width='20' height='16' rx='2' />
                    <path d='m10 9 5 3-5 3z' />
                  </svg>
                  <span>视频生成</span>
                </button>
                <button
                  type='button'
                  className='showcase-tab'
                  role='tab'
                  id='showcase-tab-audio'
                  aria-controls='showcase-stage-panel'
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
                    <path d='M12 3v18' />
                    <path d='M8 8v8' />
                    <path d='M16 7v10' />
                    <path d='M4 11v2' />
                    <path d='M20 10v4' />
                  </svg>
                  <span>音频生成</span>
                </button>
              </div>
            </div>

            <div
              id='showcase-stage-panel'
              role='tabpanel'
              aria-labelledby={`showcase-tab-${activeCapability}`}
              className={`showcase-card showcase-stage showcase-stage-${activeCapability}`}
            >
              <div className='showcase-media-layer' aria-hidden='true'>
                {mediaBackdrop}
                <div className='showcase-scrim' />
              </div>

              <div className='showcase-overlay-content'>
                <span className='showcase-stage-eyebrow'>{eyebrow}</span>
                <h2 className='showcase-stage-title'>{title}</h2>
                <p className='showcase-stage-desc'>{description}</p>

                <div className='showcase-action-row'>
                  {showcaseModels.map((item) => (
                    <Link
                      key={item.name}
                      to='/playground'
                      search={{ mode: item.mode, model: item.name }}
                      className='showcase-model-btn'
                    >
                      {item.iconKey && (
                        <span className='showcase-model-btn-icon'>
                          {getLobeIcon(item.iconKey, 15)}
                        </span>
                      )}
                      <span>{item.name}</span>
                    </Link>
                  ))}

                  <Link
                    to='/pricing'
                    search={{ task: activeCapability }}
                    className='showcase-explore-link'
                  >
                    <span>{exploreLabel}</span>
                    <svg
                      className='showcase-explore-arrow'
                      width='15'
                      height='15'
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
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
