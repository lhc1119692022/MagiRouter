import { ModelDetailsDrawer } from '@/features/pricing/components/model-details'
import { DEFAULT_TOKEN_UNIT } from '@/features/pricing/constants'
import type { usePricingData } from '@/features/pricing/hooks'
import type { SupportedParameter } from '@/features/pricing/lib/mock-stats'

export function PlaygroundModelDetails(props: {
  modelName: string
  catalog: ReturnType<typeof usePricingData>
  onClose: () => void
  chatParameters?: SupportedParameter[]
}) {
  const model = props.catalog.models.find(
    (item) => item.model_name === props.modelName
  )
  if (!model) return null
  return (
    <ModelDetailsDrawer
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      model={model}
      groupRatio={props.catalog.groupRatio}
      usableGroup={props.catalog.usableGroup}
      autoGroups={props.catalog.autoGroups}
      priceRate={props.catalog.priceRate}
      usdExchangeRate={props.catalog.usdExchangeRate}
      tokenUnit={DEFAULT_TOKEN_UNIT}
      endpointMap={
        props.catalog.endpointMap as Record<
          string,
          { path?: string; method?: string }
        >
      }
      hideEstimates
      chatParameters={props.chatParameters}
    />
  )
}
