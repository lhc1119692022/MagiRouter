import { useMemo } from 'react'

import { usePricingData } from '@/features/pricing/hooks'
import { useStatus } from '@/hooks/use-status'

import { BrandFooter } from './components/brand-footer'
import { Hero } from './components/hero'
import { IntegrationSection } from './components/integration-section'
import { ModelsSection } from './components/models-section'
import { RoutesSection } from './components/routes-section'
import { findCatalogQuote } from './lib/catalog-quote'
import { resolveBaseUrl, type SampleModels } from './lib/snippets'

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
      (pricing.error ? [] : [...pricing.models]).sort((a, b) =>
        b.model_name.localeCompare(a.model_name, 'en', { numeric: true })
      ),
    [pricing.error, pricing.models]
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
      'YOUR_OPENAI_MODEL'

    const anthropic =
      models.find((model) => /^claude/i.test(model.model_name))?.model_name ??
      'YOUR_ANTHROPIC_MODEL'

    const gemini =
      models.find(
        (model) =>
          /^gemini/i.test(model.model_name) &&
          !NON_TEXT_MODEL_PATTERN.test(model.model_name)
      )?.model_name ?? 'YOUR_GEMINI_MODEL'

    return { openai, anthropic, gemini }
  }, [models])

  const quote = useMemo(
    () => findCatalogQuote(models, pricing.usableGroup, pricing.groupRatio),
    [models, pricing.usableGroup, pricing.groupRatio]
  )

  return (
    <main data-page='home'>
      <Hero
        isAuthenticated={props.isAuthenticated}
        baseUrl={baseUrl}
        models={models}
        quote={quote}
      />
      <ModelsSection
        models={models}
        isLoading={pricing.isLoading}
        priceRate={pricing.priceRate}
        usdExchangeRate={pricing.usdExchangeRate}
      />
      <RoutesSection
        quote={quote}
        loading={pricing.isLoading}
        failed={Boolean(pricing.error)}
      />
      <IntegrationSection
        baseUrl={baseUrl}
        isAuthenticated={props.isAuthenticated}
        sampleModels={sampleModels}
        defaultGroup={quote?.group ?? ''}
      />
      <BrandFooter />
    </main>
  )
}
