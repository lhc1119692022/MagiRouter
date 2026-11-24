import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { getModelPlaygroundModes } from '@/features/pricing/lib/filters'
import { isTokenBasedModel } from '@/features/pricing/lib/model-helpers'
import { formatPrice, formatRequestPrice } from '@/features/pricing/lib/price'
import type { PricingModel } from '@/features/pricing/types'
import { getLobeIcon } from '@/lib/lobe-icon'

interface ModelsSectionProps {
  models: PricingModel[]
  isLoading: boolean
  priceRate: number
  usdExchangeRate: number
}

function pickVendorTint(vendorName?: string): { bg: string; color: string } {
  const key = (vendorName ?? '').toLowerCase()
  if (key.includes('openai')) return { bg: '#EEF8F3', color: '#0F7652' }
  if (key.includes('anthropic') || key.includes('claude')) {
    return { bg: '#FBF0E9', color: '#C65D2D' }
  }
  if (key.includes('google') || key.includes('gemini')) {
    return { bg: '#EEF4FF', color: '#2563EB' }
  }
  if (key.includes('byte') || key.includes('doubao') || key.includes('seed')) {
    return { bg: '#EDF6FF', color: '#1D4ED8' }
  }
  if (key.includes('deepseek')) return { bg: '#EEF2FF', color: '#4338CA' }
  return { bg: 'var(--bg-cream)', color: 'var(--ink-heading)' }
}

function pickFeaturedModels(models: PricingModel[]): PricingModel[] {
  if (models.length <= 4) return models
  const preferred = [
    /gpt-6\.2-sol/i,
    /claude-opus/i,
    /nano-banana|gemini-4|gemini-3|gemini-2\.5/i,
    /seedance|gpt-6\.2-astra|deepseek/i,
  ]
  const picked: PricingModel[] = []
  const usedVendors = new Set<string>()

  for (const pattern of preferred) {
    const match = models.find(
      (item) =>
        pattern.test(item.model_name) &&
        !picked.some((existing) => existing.model_name === item.model_name)
    )
    if (match) {
      picked.push(match)
      if (match.vendor_name) usedVendors.add(match.vendor_name)
    }
  }

  for (const item of models) {
    if (picked.length >= 4) break
    if (picked.some((existing) => existing.model_name === item.model_name)) {
      continue
    }
    if (item.vendor_name && !usedVendors.has(item.vendor_name)) {
      picked.push(item)
      usedVendors.add(item.vendor_name)
    }
  }

  for (const item of models) {
    if (picked.length >= 4) break
    if (!picked.some((existing) => existing.model_name === item.model_name)) {
      picked.push(item)
    }
  }

  return picked.slice(0, 4)
}

function buildPriceSummary(
  model: PricingModel,
  priceRate: number,
  usdExchangeRate: number
): string {
  if (isTokenBasedModel(model)) {
    const inputText = formatPrice(
      model,
      'input',
      'M',
      false,
      priceRate,
      usdExchangeRate
    )
    const outputText = formatPrice(
      model,
      'output',
      'M',
      false,
      priceRate,
      usdExchangeRate
    )
    return `输入 ${inputText} · 输出 ${outputText} / 1M`
  }
  const reqText = formatRequestPrice(model, false, priceRate, usdExchangeRate)
  return `${reqText} / 次`
}

export function ModelsSection(props: ModelsSectionProps) {
  const { t } = useTranslation()
  const modeLabels = {
    chat: t('Text Chat'),
    image: t('Image Generation'),
    audio: t('Audio'),
    video: t('Video Generation'),
  }
  const featured = useMemo(
    () => pickFeaturedModels(props.models),
    [props.models]
  )

  if (!props.isLoading && props.models.length === 0) return null

  return (
    <section id='home-models' className='el-breakout-cream el-section-md'>
      <div className='el-container'>
        <div className='section-head'>
          <div>
            <h2 className='el-h2'>{t('Top models')}</h2>
            <p className='el-body-sm' style={{ marginTop: 8 }}>
              {t('Open a supported model in Playground or view its details.')}
            </p>
          </div>
          <Link to='/pricing' className='el-btn el-btn-lg el-btn-white'>
            {t('Browse all {{count}} models', { count: props.models.length })} →
          </Link>
        </div>

        <div className='model-grid-4' id='hot-models-grid'>
          {props.isLoading
            ? Array.from({ length: 4 }, (_, idx) => (
                <div key={idx} className='hot-model-card'>
                  <Skeleton className='h-10 w-10 rounded-xl' />
                  <Skeleton className='mt-3 h-5 w-36' />
                  <Skeleton className='mt-2 h-10 w-full' />
                  <Skeleton className='mt-auto h-4 w-40' />
                </div>
              ))
            : featured.map((model) => {
                const iconKey =
                  model.icon || model.vendor_icon || model.vendor_name
                const tint = pickVendorTint(model.vendor_name)
                const routesList = (model.enable_groups ?? []).slice(0, 2)
                const routesText =
                  routesList.length > 0 ? routesList.join(' · ') : 'default'
                const [mode] = getModelPlaygroundModes(model)
                const descText =
                  model.description?.trim() ||
                  `${model.vendor_name || '旗舰'} 稳定直连节点，支持统一密钥路由与实时按量计费。`
                const priceSummary = buildPriceSummary(
                  model,
                  props.priceRate,
                  props.usdExchangeRate
                )

                return (
                  <article
                    key={model.model_name}
                    className='hot-model-card'
                    aria-label={model.model_name}
                  >
                    <div className='hot-card-head'>
                      <div
                        className='vendor-app-icon'
                        style={{ background: tint.bg, color: tint.color }}
                      >
                        {iconKey ? getLobeIcon(iconKey, 22) : null}
                      </div>
                      <span className='el-pill'>{routesText}</span>
                    </div>

                    <div>
                      <h3 className='hot-model-title'>{model.model_name}</h3>
                      <p className='hot-model-desc'>{descText}</p>
                    </div>

                    {mode && (
                      <div className='hot-type-tags'>
                        <span className='hot-type-tag'>{modeLabels[mode]}</span>
                      </div>
                    )}

                    <div className='hot-price-line tabular-nums'>
                      {priceSummary}
                    </div>

                    <div className='hot-card-hover-overlay'>
                      {mode && (
                        <Link
                          to='/playground'
                          search={{ mode, model: model.model_name }}
                          className='hot-hover-action'
                        >
                          <svg
                            width='18'
                            height='18'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='1.8'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            aria-hidden='true'
                          >
                            <path d='M10 2v7.31' />
                            <path d='M14 9.3V1.99' />
                            <path d='M8.5 2h7' />
                            <path d='M14 9.3a6.5 6.5 0 1 1-4 0' />
                            <path d='M5.52 16h12.96' />
                          </svg>
                          <span>{t('Get started')}</span>
                        </Link>
                      )}
                      <Link
                        to='/pricing/$modelId'
                        params={{ modelId: model.model_name }}
                        className='hot-hover-action'
                      >
                        <svg
                          width='18'
                          height='18'
                          viewBox='0 0 24 24'
                          fill='none'
                          stroke='currentColor'
                          strokeWidth='1.8'
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          aria-hidden='true'
                        >
                          <path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
                          <path d='M14 2v6h6' />
                          <line x1='16' y1='13' x2='8' y2='13' />
                          <line x1='16' y1='17' x2='8' y2='17' />
                          <line x1='10' y1='9' x2='8' y2='9' />
                        </svg>
                        <span>{t('View details')}</span>
                      </Link>
                    </div>
                  </article>
                )
              })}
        </div>
      </div>
    </section>
  )
}
