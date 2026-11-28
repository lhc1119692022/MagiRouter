import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import {
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { useTranslation } from 'react-i18next'

import { GroupBadge } from '@/components/group-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { PricingCurrency } from '@/features/model-pricing/currency'
import {
  combineBillingExpr,
  splitBillingExprAndRequestRules,
} from '@/features/pricing/lib/billing-expr'
import { isValidBillingGroupName } from '@/features/pricing/lib/group-pricing'

import { TieredPricingEditor } from './tiered-pricing-editor'

const DEFAULT_TAB = '__default__'
const ADD_GROUP_VALUE = '__add__'
const DEFAULT_GROUP_BILLING_EXPR = 'tier("base", p * 0 + c * 0)'

type GroupPricingEditorProps = {
  modelName: string
  groups: string[]
  groupRatio: Record<string, number>
  expressions: Record<string, string>
  onChange: Dispatch<SetStateAction<Record<string, string>>>
  defaultExpression: string
  currency: PricingCurrency
  children: ReactNode
}

export function GroupPricingEditor(props: GroupPricingEditorProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(DEFAULT_TAB)

  const configuredGroups = Object.keys(props.expressions).sort((left, right) =>
    left.localeCompare(right)
  )
  const activeGroupSet = new Set(props.groups)
  const hasActiveGroups = props.groups.length > 0
  const activeTab =
    selected === DEFAULT_TAB || Object.hasOwn(props.expressions, selected)
      ? selected
      : DEFAULT_TAB

  const addableGroups = props.groups
    .filter(
      (group) =>
        isValidBillingGroupName(group) &&
        !Object.hasOwn(props.expressions, group)
    )
    .sort((left, right) => left.localeCompare(right))

  const handleAddGroup = (group: string) => {
    if (!group || group === ADD_GROUP_VALUE || !isValidBillingGroupName(group)) {
      return
    }
    const initialExpression =
      props.defaultExpression.trim() || DEFAULT_GROUP_BILLING_EXPR
    props.onChange((previous) => ({
      ...previous,
      [group]: initialExpression,
    }))
    setSelected(group)
  }

  const handleRemoveGroup = (group: string) => {
    props.onChange((previous) => {
      const next = { ...previous }
      delete next[group]
      return next
    })
    setSelected(DEFAULT_TAB)
  }

  if (configuredGroups.length === 0 && addableGroups.length === 0) {
    return props.children
  }

  const addItems = [
    { value: ADD_GROUP_VALUE, label: t('Add group pricing') },
    ...addableGroups.map((group) => {
      const ratio = props.groupRatio[group]
      return {
        value: group,
        label:
          typeof ratio === 'number' && Number.isFinite(ratio)
            ? `${group} (${ratio}x)`
            : group,
      }
    }),
  ]

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setSelected(String(value))}
      className='gap-4'
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <TabsList
          aria-label={t('Group pricing scope')}
          className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'
        >
          <TabsTrigger value={DEFAULT_TAB}>{t('Default pricing')}</TabsTrigger>
          {configuredGroups.map((group) => (
            <TabsTrigger key={group} value={group} className='gap-1.5'>
              <span>{group}</span>
              {hasActiveGroups && !activeGroupSet.has(group) ? (
                <AlertTriangle
                  className='text-destructive size-3.5 shrink-0'
                  aria-hidden='true'
                />
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {addableGroups.length > 0 && (
          <Select
            items={addItems}
            value={ADD_GROUP_VALUE}
            onValueChange={(value) => {
              if (value && value !== ADD_GROUP_VALUE) {
                handleAddGroup(value)
              }
            }}
          >
            <SelectTrigger
              aria-label={t('Add group pricing')}
              className='h-8 w-auto min-w-36 gap-1.5 text-xs'
            >
              <Plus className='size-3.5 shrink-0' />
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {addableGroups.map((group) => {
                  const ratio = props.groupRatio[group]
                  return (
                    <SelectItem key={group} value={group}>
                      {typeof ratio === 'number' && Number.isFinite(ratio)
                        ? `${group} (${ratio}x)`
                        : group}
                    </SelectItem>
                  )
                })}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </div>

      <TabsContent value={DEFAULT_TAB} keepMounted className='space-y-4 pt-0'>
        {props.children}
      </TabsContent>

      {configuredGroups.map((group) => {
        const rawExpr = props.expressions[group] ?? ''
        const split = splitBillingExprAndRequestRules(rawExpr)
        const ratio = props.groupRatio[group]
        const displayRatio =
          typeof ratio === 'number' && Number.isFinite(ratio) ? ratio : 1
        const isInactiveGroup = hasActiveGroups && !activeGroupSet.has(group)
        return (
          <TabsContent key={group} value={group} className='space-y-4 pt-0'>
            <div className='bg-muted/30 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2'>
              <div className='flex flex-wrap items-center gap-2 text-xs'>
                <GroupBadge group={group} size='sm' />
                {isInactiveGroup ? (
                  <>
                    <Badge variant='destructive' className='gap-1'>
                      <AlertTriangle className='size-3' />
                      {t('Inactive group')}
                    </Badge>
                    <span className='text-destructive'>
                      {t(
                        'This group is not in active billing groups. Rename the group from Group Pricing or remove this override.'
                      )}
                    </span>
                  </>
                ) : (
                  <span className='text-muted-foreground'>
                    {t(
                      'Group pricing multiplies by group ratio ({{ratio}}x) on settlement.',
                      { ratio: displayRatio }
                    )}
                  </span>
                )}
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => handleRemoveGroup(group)}
              >
                <Trash2 className='mr-1.5 size-3.5' />
                {t('Remove group pricing')}
              </Button>
            </div>

            <TieredPricingEditor
              currency={props.currency}
              modelName={props.modelName}
              billingExpr={split.billingExpr}
              requestRuleExpr={split.requestRuleExpr}
              onBillingExprChange={(nextBillingExpr) =>
                props.onChange((previous) => ({
                  ...previous,
                  [group]: combineBillingExpr(
                    nextBillingExpr,
                    split.requestRuleExpr
                  ),
                }))
              }
              onRequestRuleExprChange={(nextRequestRuleExpr) =>
                props.onChange((previous) => ({
                  ...previous,
                  [group]: combineBillingExpr(
                    split.billingExpr,
                    nextRequestRuleExpr
                  ),
                }))
              }
            />
          </TabsContent>
        )
      })}
    </Tabs>
  )
}
