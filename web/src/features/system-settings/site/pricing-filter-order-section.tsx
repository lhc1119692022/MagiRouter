import {
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  GripVertical,
  RotateCcw,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  EXCLUDED_GROUPS,
  QUOTA_TYPES,
  getQuotaTypeLabels,
} from '@/features/pricing/constants'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import {
  PRICING_FILTER_ORDER_OPTION_KEY,
  applyManualOrder,
  parsePricingFilterOrderConfig,
  serializePricingFilterOrderConfig,
  sortCatalogVendors,
  type PricingFilterOrderConfig,
  type PricingQuotaFacet,
} from '@/features/pricing/lib/filter-order-config'
import { sortCatalogGroups } from '@/features/pricing/lib/filters'
import { getLobeIcon } from '@/lib/lobe-icon'
import {
  CATEGORY_LABEL_KEYS,
  MODEL_CAPABILITY_CATEGORIES,
  type ModelCapabilityCategory,
} from '@/lib/model-task-capabilities'

import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type FilterOrderItem = {
  id: string
  label: string
  meta?: string
  iconKey?: string
}

function reorderArray<T>(items: readonly T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return [...items]
  }
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

function OrderDimensionCard(props: {
  title: string
  description: string
  items: FilterOrderItem[]
  isManual: boolean
  disabled: boolean
  onReorder: (nextIds: string[]) => void
  onResetDefault: () => void
}) {
  const { t } = useTranslation()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const ids = useMemo(() => props.items.map((item) => item.id), [props.items])

  const commitMove = (from: number, to: number) => {
    const reordered = reorderArray(ids, from, to)
    props.onReorder(reordered)
  }

  return (
    <fieldset
      disabled={props.disabled}
      className='grid min-w-0 gap-3 rounded-xl border p-4'
    >
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='grid gap-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <legend className='text-sm font-semibold'>{props.title}</legend>
            <Badge variant={props.isManual ? 'default' : 'secondary'}>
              {props.isManual ? t('Manual order') : t('Default order')}
            </Badge>
          </div>
          <p className='text-muted-foreground text-xs'>{props.description}</p>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={!props.isManual || props.disabled}
          onClick={props.onResetDefault}
        >
          <RotateCcw className='mr-1.5 size-3.5' />
          {t('Reset to default')}
        </Button>
      </div>

      {props.items.length === 0 ? (
        <div className='text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-xs'>
          {t('No items available in the current model catalog.')}
        </div>
      ) : (
        <>
          <div
            className='bg-muted/35 flex flex-wrap items-center gap-1.5 rounded-lg border px-3 py-2'
            aria-label={t('Preview order for {{title}}', {
              title: props.title,
            })}
          >
            <span className='text-muted-foreground mr-1 text-xs'>
              {t('Preview')}:
            </span>
            {props.items.map((item) => (
              <span
                key={item.id}
                className='bg-background inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium'
              >
                {item.iconKey ? getLobeIcon(item.iconKey, 12) : null}
                <span>{item.label}</span>
                {item.meta ? (
                  <span className='text-muted-foreground tabular-nums'>
                    {item.meta}
                  </span>
                ) : null}
              </span>
            ))}
          </div>

          <ul
            className='grid gap-1.5'
            aria-label={t('{{title}} order list', { title: props.title })}
          >
            {props.items.map((item, index) => {
              const isDropTarget =
                dropIndex === index && dragIndex !== null && dragIndex !== index
              return (
                <li
                  key={item.id}
                  draggable={!props.disabled}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => {
                    event.preventDefault()
                    if (dropIndex !== index) setDropIndex(index)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (dragIndex !== null && dragIndex !== index) {
                      commitMove(dragIndex, index)
                    }
                    setDragIndex(null)
                    setDropIndex(null)
                  }}
                  onDragEnd={() => {
                    setDragIndex(null)
                    setDropIndex(null)
                  }}
                  className={
                    isDropTarget
                      ? 'border-primary bg-primary/5 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors'
                      : 'bg-background flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors'
                  }
                >
                  <div className='flex min-w-0 items-center gap-2.5'>
                    <GripVertical
                      className='text-muted-foreground size-4 shrink-0 cursor-grab'
                      aria-hidden='true'
                    />
                    <span className='text-muted-foreground w-5 shrink-0 text-xs tabular-nums'>
                      {index + 1}
                    </span>
                    {item.iconKey ? (
                      <span className='shrink-0'>
                        {getLobeIcon(item.iconKey, 15)}
                      </span>
                    ) : null}
                    <span className='truncate font-medium'>{item.label}</span>
                    {item.meta ? (
                      <span className='text-muted-foreground shrink-0 text-xs tabular-nums'>
                        {item.meta}
                      </span>
                    ) : null}
                  </div>
                  <div className='flex shrink-0 items-center gap-1'>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='size-7'
                      disabled={index === 0}
                      aria-label={t('Move {{name}} to top', {
                        name: item.label,
                      })}
                      title={t('Move to top')}
                      onClick={() => commitMove(index, 0)}
                    >
                      <ArrowUpToLine className='size-3.5' />
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='size-7'
                      disabled={index === 0}
                      aria-label={t('Move {{name}} up', { name: item.label })}
                      title={t('Move up')}
                      onClick={() => commitMove(index, index - 1)}
                    >
                      <ArrowUp className='size-3.5' />
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='size-7'
                      disabled={index === props.items.length - 1}
                      aria-label={t('Move {{name}} down', {
                        name: item.label,
                      })}
                      title={t('Move down')}
                      onClick={() => commitMove(index, index + 1)}
                    >
                      <ArrowDown className='size-3.5' />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </fieldset>
  )
}

export function PricingFilterOrderSection(props: { value: string }) {
  const { t } = useTranslation()
  const initialConfig = useMemo(
    () => parsePricingFilterOrderConfig(props.value),
    [props.value]
  )
  return (
    <SettingsSection title={t('Model Square Filter Order')}>
      <PricingFilterOrderEditor
        key={props.value}
        initialConfig={initialConfig}
      />
    </SettingsSection>
  )
}

function PricingFilterOrderEditor(props: {
  initialConfig: PricingFilterOrderConfig
}) {
  const { t } = useTranslation()
  const save = useUpdateOption()
  const pricing = usePricingData()
  const [draft, setDraft] = useState<PricingFilterOrderConfig>(
    props.initialConfig
  )

  const initialSerialized = useMemo(
    () => serializePricingFilterOrderConfig(props.initialConfig),
    [props.initialConfig]
  )
  const draftSerialized = useMemo(
    () => serializePricingFilterOrderConfig(draft),
    [draft]
  )
  const isDirty = draftSerialized !== initialSerialized

  const vendorItems = useMemo<FilterOrderItem[]>(() => {
    const visibleVendorIds = new Set(
      pricing.models.map((model) => model.vendor_id)
    )
    const catalogVendors =
      visibleVendorIds.size > 0
        ? pricing.vendors.filter((vendor) => visibleVendorIds.has(vendor.id))
        : pricing.vendors
    const mergedVendors = [...catalogVendors]
    const seenNames = new Set(
      mergedVendors.map((vendor) => vendor.name.toLowerCase())
    )
    let syntheticId = -1
    for (const savedName of draft.vendors) {
      if (seenNames.has(savedName.toLowerCase())) continue
      seenNames.add(savedName.toLowerCase())
      mergedVendors.push({ id: syntheticId--, name: savedName })
    }
    return sortCatalogVendors(mergedVendors, draft.vendors).map((vendor) => ({
      id: vendor.name,
      label: vendor.name,
      iconKey: vendor.icon,
    }))
  }, [draft.vendors, pricing.models, pricing.vendors])

  const groupItems = useMemo<FilterOrderItem[]>(() => {
    const activeVendors = sortCatalogVendors(pricing.vendors, draft.vendors)
    const rawGroupSet = new Set<string>()
    for (const model of pricing.models) {
      for (const group of model.enable_groups ?? []) {
        if (
          !EXCLUDED_GROUPS.includes(group) &&
          Object.hasOwn(pricing.usableGroup, group)
        ) {
          rawGroupSet.add(group)
        }
      }
    }
    if (rawGroupSet.size === 0) {
      for (const group of Object.keys(pricing.usableGroup)) {
        if (!EXCLUDED_GROUPS.includes(group)) rawGroupSet.add(group)
      }
    }
    for (const savedGroup of draft.groups) {
      if (!EXCLUDED_GROUPS.includes(savedGroup)) {
        rawGroupSet.add(savedGroup)
      }
    }
    const defaultGroups = sortCatalogGroups([...rawGroupSet], pricing.models, {
      groupRatio: pricing.groupRatio,
      vendors: activeVendors,
    })
    const orderedGroups = applyManualOrder(defaultGroups, draft.groups)
    return orderedGroups.map((groupName) => {
      const ratio = pricing.groupRatio[groupName]
      return {
        id: groupName,
        label: groupName,
        meta: typeof ratio === 'number' ? `×${ratio}` : undefined,
      }
    })
  }, [
    draft.groups,
    draft.vendors,
    pricing.groupRatio,
    pricing.models,
    pricing.usableGroup,
    pricing.vendors,
  ])

  const capabilityItems = useMemo<FilterOrderItem[]>(() => {
    const ordered = applyManualOrder(
      MODEL_CAPABILITY_CATEGORIES,
      draft.capabilities
    )
    return ordered.map((category) => ({
      id: category,
      label: t(CATEGORY_LABEL_KEYS[category]),
    }))
  }, [draft.capabilities, t])

  const quotaTypeItems = useMemo<FilterOrderItem[]>(() => {
    const quotaLabels = getQuotaTypeLabels(t)
    const defaultQuota: PricingQuotaFacet[] = [
      QUOTA_TYPES.TOKEN,
      QUOTA_TYPES.REQUEST,
      QUOTA_TYPES.TASK,
    ]
    const ordered = applyManualOrder(defaultQuota, draft.quota_types)
    return ordered.map((quota) => ({
      id: quota,
      label: quotaLabels[quota],
    }))
  }, [draft.quota_types, t])

  const handleSave = () => {
    if (!isDirty || save.isPending) return
    save.mutate({
      key: PRICING_FILTER_ORDER_OPTION_KEY,
      value: draftSerialized,
    })
  }

  return (
    <>
      <SettingsPageFormActions
        isSaving={save.isPending}
        isSaveDisabled={!isDirty || save.isPending}
        onSave={handleSave}
      />
      <div className='text-muted-foreground grid gap-1 text-sm'>
        <p>
          {t(
            'Control the display order of filter rows on Model Square. Drag items or use the arrows to customize; leave a section on default order to keep automatic sorting.'
          )}
        </p>
      </div>

      <div className='grid min-w-0 gap-4'>
        <OrderDimensionCard
          title={t('Model manufacturers')}
          description={t(
            'Default: sorted alphabetically (A–Z). Any new manufacturers not pinned here follow automatically in alphabetical order.'
          )}
          items={vendorItems}
          isManual={draft.vendors.length > 0}
          disabled={save.isPending}
          onReorder={(nextIds) =>
            setDraft((previous) => ({ ...previous, vendors: nextIds }))
          }
          onResetDefault={() =>
            setDraft((previous) => ({ ...previous, vendors: [] }))
          }
        />

        <OrderDimensionCard
          title={t('Multiplier groups')}
          description={t(
            'Default: clustered by manufacturer order and series multiplier ascending. Customize here to pin promotional or key groups first.'
          )}
          items={groupItems}
          isManual={draft.groups.length > 0}
          disabled={save.isPending}
          onReorder={(nextIds) =>
            setDraft((previous) => ({ ...previous, groups: nextIds }))
          }
          onResetDefault={() =>
            setDraft((previous) => ({ ...previous, groups: [] }))
          }
        />

        <OrderDimensionCard
          title={t('Task capabilities')}
          description={t(
            'Default: ordered by primary modality (reasoning, image, video, audio, transcription, other).'
          )}
          items={capabilityItems}
          isManual={draft.capabilities.length > 0}
          disabled={save.isPending}
          onReorder={(nextIds) =>
            setDraft((previous) => ({
              ...previous,
              capabilities: nextIds as ModelCapabilityCategory[],
            }))
          }
          onResetDefault={() =>
            setDraft((previous) => ({ ...previous, capabilities: [] }))
          }
        />

        <OrderDimensionCard
          title={t('Pricing Type')}
          description={t(
            'Default: token-based, per request, then task billing.'
          )}
          items={quotaTypeItems}
          isManual={draft.quota_types.length > 0}
          disabled={save.isPending}
          onReorder={(nextIds) =>
            setDraft((previous) => ({
              ...previous,
              quota_types: nextIds as PricingQuotaFacet[],
            }))
          }
          onResetDefault={() =>
            setDraft((previous) => ({ ...previous, quota_types: [] }))
          }
        />
      </div>
    </>
  )
}
