import { useMemo } from 'react'

import { EXCLUDED_GROUPS } from '@/features/pricing/constants'
import { usePricingData } from '@/features/pricing/hooks'
import { getConfiguredGroupRatio } from '@/features/pricing/lib/model-helpers'
import { useStatus } from '@/hooks/use-status'

import { BrandFooter } from './components/brand-footer'
import { Hero } from './components/hero'
import { IntegrationSection } from './components/integration-section'
import { ModelsSection } from './components/models-section'
import { RoutesSection } from './components/routes-section'
import { resolveBaseUrl, type SampleModels } from './lib/snippets'

const FALLBACK_SAMPLE_MODEL = 'gpt-6.2-sol'
const NON_TEXT_MODEL_PATTERN =
  /image|flux|dall|midjourney|seedream|banana|video|seedance|kling|veo|sora|minimax|audio|tts|whisper|speech|transcrib|embed|rerank|moderation/i

function isTextSampleCandidate(model: {
  model_name: string
  tags?: string
  supported_endpoint_types?: string[]
}): boolean {
  const endpoints = model.supported_endpoint_types ?? []
  if (!endpoints.includes('openai') && !endpoints.includes('openai-response')) {
    return false
  }
  const combined = `${model.model_name} ${model.tags ?? ''}`
  return !NON_TEXT_MODEL_PATTERN.test(combined)
}

interface MagiRouterHomeProps {
  isAuthenticated: boolean
}

export function MagiRouterHome(props: MagiRouterHomeProps) {
  const { status } = useStatus()
  const pricing = usePricingData()
  const baseUrl = resolveBaseUrl(status?.server_address)

  const models = useMemo(
    () =>
      [...pricing.models].sort((a, b) =>
        b.model_name.localeCompare(a.model_name, 'en', { numeric: true })
      ),
    [pricing.models]
  )

  const sampleModels = useMemo<SampleModels>(() => {
    const openai =
      models.find((model) => /^gpt-6\.2-sol$/i.test(model.model_name))
        ?.model_name ??
      models.find(
        (model) =>
          isTextSampleCandidate(model) &&
          /^(gpt|o[1-9])/i.test(model.model_name)
      )?.model_name ??
      models.find((model) => isTextSampleCandidate(model))?.model_name ??
      FALLBACK_SAMPLE_MODEL

    const anthropic =
      models.find((model) => /^claude/i.test(model.model_name))?.model_name ??
      'claude-opus-5.5'

    const gemini =
      models.find(
        (model) =>
          /^gemini/i.test(model.model_name) &&
          !NON_TEXT_MODEL_PATTERN.test(model.model_name)
      )?.model_name ?? 'gemini-4-hydrogen'

    return { openai, anthropic, gemini }
  }, [models])

  const cheapestGroup = useMemo(() => {
    const groups = Object.keys(pricing.usableGroup).filter(
      (group) => !EXCLUDED_GROUPS.includes(group)
    )
    const sorted = groups
      .map((group) => ({
        group,
        ratio: getConfiguredGroupRatio(pricing.groupRatio, group),
      }))
      .filter((entry) => Number.isFinite(entry.ratio) && entry.ratio > 0)
      .sort((left, right) => left.ratio - right.ratio)
    if (sorted.length > 0) {
      return {
        name: sorted[0].group,
        label: `${sorted[0].group} ×${sorted[0].ratio}`,
      }
    }
    return { name: 'GPT Pro', label: 'GPT Pro ×0.25' }
  }, [pricing.groupRatio, pricing.usableGroup])

  return (
    <main data-page='home'>
      <Hero
        isAuthenticated={props.isAuthenticated}
        baseUrl={baseUrl}
        sampleModel={sampleModels.openai || FALLBACK_SAMPLE_MODEL}
        models={models}
        cheapestGroupLabel={cheapestGroup.label}
      />
      <ModelsSection
        models={models}
        isLoading={pricing.isLoading}
        priceRate={pricing.priceRate}
        usdExchangeRate={pricing.usdExchangeRate}
        isAuthenticated={props.isAuthenticated}
      />
      <RoutesSection
        usableGroup={pricing.usableGroup}
        groupRatio={pricing.groupRatio}
        models={models}
        priceRate={pricing.priceRate}
      />
      <IntegrationSection
        baseUrl={baseUrl}
        isAuthenticated={props.isAuthenticated}
        sampleModels={sampleModels}
        defaultGroup={cheapestGroup.name}
      />
      <BrandFooter />
    </main>
  )
}
