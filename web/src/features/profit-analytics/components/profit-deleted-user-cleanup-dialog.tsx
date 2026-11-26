import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import {
  cleanupProfitDeletedUserRecords,
  getProfitDeletedUserRecords,
} from '../api'
import type {
  ProfitDeletedUserCleanupRequest,
  ProfitDeletedUserOrphanSummary,
  ProfitDeletedUserOrphanUserItem,
} from '../types'

interface ProfitDeletedUserCleanupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialUserId: number | null
  symbol: string
}

interface ScopeCounters {
  topupOrders: number
  completedTopupOrders: number
  completedTopupMoney: number
  subscriptionOrders: number
  completedSubOrders: number
  completedSubMoney: number
  quotaDataRecords: number
  quotaDataRequests: number
  billedLocal: number
  userSubscriptions: number
  usedRedemptions: number
  checkins: number
  totalRecords: number
}

function formatMoneyValue(
  value: number,
  symbol: string,
  locale: string | undefined
): string {
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value))
  return value < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`
}

function formatDeletedUserOptionLabel(
  item: ProfitDeletedUserOrphanUserItem
): string {
  if (item.username) {
    return `${item.username} (#${item.user_id})`
  }
  return `#${item.user_id}`
}

function toScopeCounters(
  source: ProfitDeletedUserOrphanSummary | ProfitDeletedUserOrphanUserItem
): ScopeCounters {
  return {
    topupOrders: source.topup_orders,
    completedTopupOrders: source.completed_topup_orders,
    completedTopupMoney: source.completed_topup_money,
    subscriptionOrders: source.subscription_orders,
    completedSubOrders: source.completed_subscription_orders,
    completedSubMoney: source.completed_subscription_money,
    quotaDataRecords: source.quota_data_records,
    quotaDataRequests: source.quota_data_requests,
    billedLocal: source.billed_local,
    userSubscriptions: source.user_subscriptions,
    usedRedemptions: source.used_redemptions,
    checkins: source.checkins,
    totalRecords: source.total_records,
  }
}

export function ProfitDeletedUserCleanupDialog(
  props: ProfitDeletedUserCleanupDialogProps
) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()

  const [selectedUserId, setSelectedUserId] = useState<number>(0)
  const [includeTopUps, setIncludeTopUps] = useState(true)
  const [includeSubOrders, setIncludeSubOrders] = useState(true)
  const [includeQuotaData, setIncludeQuotaData] = useState(true)
  const [includeLiability, setIncludeLiability] = useState(true)

  const previewQuery = useQuery({
    queryKey: ['profit-deleted-user-records'],
    queryFn: getProfitDeletedUserRecords,
    enabled: props.open,
  })

  useEffect(() => {
    if (!props.open) return
    setSelectedUserId(props.initialUserId ?? 0)
    setIncludeTopUps(true)
    setIncludeSubOrders(true)
    setIncludeQuotaData(true)
    setIncludeLiability(true)
  }, [props.initialUserId, props.open])

  const users = useMemo(
    () => previewQuery.data?.users ?? [],
    [previewQuery.data?.users]
  )

  useEffect(() => {
    if (!props.open || selectedUserId <= 0 || !previewQuery.data) return
    const exists = users.some((item) => item.user_id === selectedUserId)
    if (!exists) {
      setSelectedUserId(0)
    }
  }, [previewQuery.data, props.open, selectedUserId, users])

  const selectedUser = useMemo(
    () => users.find((item) => item.user_id === selectedUserId) ?? null,
    [selectedUserId, users]
  )

  const scopeCounters = useMemo<ScopeCounters | null>(() => {
    if (!previewQuery.data) return null
    if (selectedUser) {
      return toScopeCounters(selectedUser)
    }
    return toScopeCounters(previewQuery.data.summary)
  }, [previewQuery.data, selectedUser])

  const symbol = previewQuery.data?.currency.symbol || props.symbol || '$'

  const liabilityRecordCount = scopeCounters
    ? scopeCounters.userSubscriptions +
      scopeCounters.usedRedemptions +
      scopeCounters.checkins
    : 0

  const selectedRecordCount = useMemo(() => {
    if (!scopeCounters) return 0
    let total = 0
    if (includeTopUps) total += scopeCounters.topupOrders
    if (includeSubOrders) total += scopeCounters.subscriptionOrders
    if (includeQuotaData) total += scopeCounters.quotaDataRecords
    if (includeLiability) total += liabilityRecordCount
    return total
  }, [
    includeLiability,
    includeQuotaData,
    includeSubOrders,
    includeTopUps,
    liabilityRecordCount,
    scopeCounters,
  ])

  const hasSelectedCategory =
    includeTopUps || includeSubOrders || includeQuotaData || includeLiability

  const cleanupMutation = useMutation({
    mutationFn: (payload: ProfitDeletedUserCleanupRequest) =>
      cleanupProfitDeletedUserRecords(payload),
    onSuccess: (result) => {
      if (result.total_deleted > 0) {
        toast.success(
          t('Cleaned up {{count}} deleted-user records', {
            count: result.total_deleted,
          })
        )
      } else {
        toast.info(t('No matching deleted-user records found'))
      }
      void queryClient.invalidateQueries({ queryKey: ['profit-analytics'] })
      void queryClient.invalidateQueries({
        queryKey: ['profit-deleted-user-records'],
      })
      props.onOpenChange(false)
    },
    onError: (error) => {
      handleServerError(error, t('Failed to clean up deleted-user records'))
    },
  })

  const handleConfirm = () => {
    if (!hasSelectedCategory || selectedRecordCount <= 0) return
    cleanupMutation.mutate({
      user_id: selectedUserId,
      include_topups: includeTopUps,
      include_subscription_orders: includeSubOrders,
      include_quota_data: includeQuotaData,
      include_user_subscriptions: includeLiability,
      include_used_redemptions: includeLiability,
      include_checkins: includeLiability,
    })
  }

  let dialogBody: ReactNode
  if (previewQuery.isLoading) {
    dialogBody = <LoadingState className='min-h-[160px]' />
  } else if (previewQuery.isError) {
    dialogBody = (
      <ErrorState
        title={t('Failed to load deleted-user records')}
        onRetry={() => void previewQuery.refetch()}
      />
    )
  } else if (!scopeCounters || users.length === 0) {
    dialogBody = (
      <EmptyState
        className='min-h-[140px]'
        title={t('No residual deleted-user records found')}
      />
    )
  } else {
    dialogBody = (
      <div className='space-y-4'>
        <div className='space-y-1.5'>
          <Label htmlFor='profit-cleanup-user-scope'>
            {t('Cleanup scope')}
          </Label>
          <NativeSelect
            id='profit-cleanup-user-scope'
            value={String(selectedUserId)}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10)
              setSelectedUserId(Number.isFinite(parsed) ? parsed : 0)
            }}
          >
            <NativeSelectOption value='0'>
              {t('All deleted users ({{count}})', { count: users.length })}
            </NativeSelectOption>
            {users.map((item) => (
              <NativeSelectOption
                key={item.user_id}
                value={String(item.user_id)}
              >
                {formatDeletedUserOptionLabel(item)} ·{' '}
                {t('{{count}} records', { count: item.total_records })}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {selectedUser && (
            <div className='flex flex-wrap items-center gap-2 pt-1 text-xs'>
              <Badge variant='outline' className='font-normal'>
                #{selectedUser.user_id}
              </Badge>
              <Badge variant='secondary' className='font-normal'>
                {selectedUser.soft_deleted
                  ? t('Soft-deleted user')
                  : t('Permanently deleted user')}
              </Badge>
              {selectedUser.display_name && (
                <span className='text-muted-foreground'>
                  {selectedUser.display_name}
                </span>
              )}
            </div>
          )}
        </div>

        <div className='space-y-2'>
          <div className='text-sm font-medium'>
            {t('Record categories to remove')}
          </div>

          <div className='space-y-2 rounded-md border p-3'>
            <label className='flex cursor-pointer items-start gap-3'>
              <Checkbox
                checked={includeTopUps}
                onCheckedChange={(checked) =>
                  setIncludeTopUps(Boolean(checked))
                }
                className='mt-0.5'
              />
              <div className='min-w-0 flex-1 text-sm'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-medium'>
                    {t('Wallet top-up orders')}
                  </span>
                  <span className='text-muted-foreground text-xs tabular-nums'>
                    {formatNumber(scopeCounters.topupOrders, locale)}
                  </span>
                </div>
                <p className='text-muted-foreground text-xs'>
                  {t('Completed: {{count}} ({{amount}})', {
                    count: scopeCounters.completedTopupOrders,
                    amount: formatMoneyValue(
                      scopeCounters.completedTopupMoney,
                      symbol,
                      locale
                    ),
                  })}
                </p>
              </div>
            </label>

            <label className='flex cursor-pointer items-start gap-3 border-t pt-2'>
              <Checkbox
                checked={includeSubOrders}
                onCheckedChange={(checked) =>
                  setIncludeSubOrders(Boolean(checked))
                }
                className='mt-0.5'
              />
              <div className='min-w-0 flex-1 text-sm'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-medium'>
                    {t('Subscription orders')}
                  </span>
                  <span className='text-muted-foreground text-xs tabular-nums'>
                    {formatNumber(scopeCounters.subscriptionOrders, locale)}
                  </span>
                </div>
                <p className='text-muted-foreground text-xs'>
                  {t('Completed: {{count}} ({{amount}})', {
                    count: scopeCounters.completedSubOrders,
                    amount: formatMoneyValue(
                      scopeCounters.completedSubMoney,
                      symbol,
                      locale
                    ),
                  })}
                </p>
              </div>
            </label>

            <label className='flex cursor-pointer items-start gap-3 border-t pt-2'>
              <Checkbox
                checked={includeQuotaData}
                onCheckedChange={(checked) =>
                  setIncludeQuotaData(Boolean(checked))
                }
                className='mt-0.5'
              />
              <div className='min-w-0 flex-1 text-sm'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-medium'>
                    {t('Usage & billing stats')}
                  </span>
                  <span className='text-muted-foreground text-xs tabular-nums'>
                    {formatNumber(scopeCounters.quotaDataRecords, locale)}
                  </span>
                </div>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    '{{requests}} requests · {{amount}} billed (also removes residual channel, model, and group rows)',
                    {
                      requests: formatNumber(
                        scopeCounters.quotaDataRequests,
                        locale
                      ),
                      amount: formatMoneyValue(
                        scopeCounters.billedLocal,
                        symbol,
                        locale
                      ),
                    }
                  )}
                </p>
              </div>
            </label>

            <label className='flex cursor-pointer items-start gap-3 border-t pt-2'>
              <Checkbox
                checked={includeLiability}
                onCheckedChange={(checked) =>
                  setIncludeLiability(Boolean(checked))
                }
                className='mt-0.5'
              />
              <div className='min-w-0 flex-1 text-sm'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-medium'>
                    {t('Subscriptions, redemptions & check-ins')}
                  </span>
                  <span className='text-muted-foreground text-xs tabular-nums'>
                    {formatNumber(liabilityRecordCount, locale)}
                  </span>
                </div>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Subscriptions: {{subs}} · Used redemptions: {{redemptions}} · Check-ins: {{checkins}}',
                    {
                      subs: formatNumber(
                        scopeCounters.userSubscriptions,
                        locale
                      ),
                      redemptions: formatNumber(
                        scopeCounters.usedRedemptions,
                        locale
                      ),
                      checkins: formatNumber(scopeCounters.checkins, locale),
                    }
                  )}
                </p>
              </div>
            </label>
          </div>
        </div>

        <p className='text-destructive text-xs'>
          {t('This action cannot be undone.')}
        </p>
      </div>
    )
  }

  return (
    <ConfirmDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      className='sm:max-w-xl'
      title={t('Clean up deleted-user records')}
      desc={t(
        'Permanently remove residual top-up, subscription, and usage records left behind by deleted users. Active user records are never affected.'
      )}
      confirmText={
        cleanupMutation.isPending
          ? t('Cleaning...')
          : t('Clean up selected ({{count}})', {
              count: selectedRecordCount,
            })
      }
      destructive
      isLoading={cleanupMutation.isPending}
      disabled={
        previewQuery.isLoading ||
        previewQuery.isError ||
        !hasSelectedCategory ||
        selectedRecordCount <= 0
      }
      handleConfirm={handleConfirm}
    >
      {dialogBody}
    </ConfirmDialog>
  )
}
