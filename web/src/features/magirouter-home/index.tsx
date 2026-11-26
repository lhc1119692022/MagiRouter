import { useMemo } from 'react'

import { SitePopupHost } from '@/components/site-popup-host'
import { usePricingData } from '@/features/pricing/hooks'
import { useStatus } from '@/hooks/use-status'

import { BrandFooter } from './components/brand-footer'
import { Hero } from './components/hero'
import { IntegrationSection } from './components/integration-section'
import { ModelsSection } from './components/models-section'
import { RoutesSection } from './components/routes-section'
import { buildBillingComparisonData } from './lib/catalog-quote'
import { parseHomeShowcaseConfig } from './lib/showcase-config'
import { resolveBaseUrl } from './lib/snippets'

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

  const showcaseConfig = useMemo(
    () =>
      parseHomeShowcaseConfig(
        status?.home_showcase ?? status?.data?.home_showcase
      ),
    [status?.data?.home_showcase, status?.home_showcase]
  )

  const billingComparison = useMemo(
    () =>
      buildBillingComparisonData(
        models,
        pricing.usableGroup,
        pricing.groupRatio
      ),
    [models, pricing.usableGroup, pricing.groupRatio]
  )

  return (
    <main data-page='home'>
      <Hero
        isAuthenticated={props.isAuthenticated}
        baseUrl={baseUrl}
        models={models}
        showcaseConfig={showcaseConfig}
      />
      <ModelsSection
        models={models}
        isLoading={pricing.isLoading}
        priceRate={pricing.priceRate}
        usdExchangeRate={pricing.usdExchangeRate}
        groupRatio={pricing.groupRatio}
      />
      <RoutesSection
        comparison={billingComparison}
        loading={pricing.isLoading}
        failed={Boolean(pricing.error)}
        priceRate={pricing.priceRate}
      />
      <IntegrationSection isAuthenticated={props.isAuthenticated} />
      <BrandFooter />
      <SitePopupHost trigger='home' />
    </main>
  )
}
