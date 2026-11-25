import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatCurrencyFromUSD } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { useBillingHistory } from '../hooks/use-billing-history'
import {
  formatTimestamp,
  getPaymentMethodName,
  getStatusConfig,
} from '../lib/billing'
import type { TopupStatus } from '../types'

type StatusFilter = 'all' | TopupStatus

interface BillingHistoryCardProps {
  refreshKey?: number
  onOrderCompleted?: () => void | Promise<void>
}

export function BillingHistoryCard({
  refreshKey = 0,
  onOrderCompleted,
}: BillingHistoryCardProps) {
  const { t } = useTranslation()
  const {
    records,
    total,
    page,
    pageSize,
    keyword,
    loading,
    completing,
    isAdmin,
    handlePageChange,
    handleSearch,
    handleCompleteOrder,
    refresh,
  } = useBillingHistory()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [confirmTradeNo, setConfirmTradeNo] = useState<string | null>(null)
  const { copyToClipboard, copiedText } = useCopyToClipboard({ notify: false })
  const prevRefreshKeyRef = useRef(refreshKey)

  useEffect(() => {
    if (prevRefreshKeyRef.current !== refreshKey) {
      prevRefreshKeyRef.current = refreshKey
      void refresh()
    }
  }, [refreshKey, refresh])

  const filteredRecords = useMemo(() => {
    if (statusFilter === 'all') return records
    return records.filter((record) => record.status === statusFilter)
  }, [records, statusFilter])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const displayCount = statusFilter === 'all' ? total : filteredRecords.length
  const hasActiveFilter = statusFilter !== 'all' || keyword.trim().length > 0

  const handleConfirmComplete = async () => {
    if (!confirmTradeNo) return
    const success = await handleCompleteOrder(confirmTradeNo)
    if (success) {
      setConfirmTradeNo(null)
      await onOrderCompleted?.()
    }
  }

  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('All') },
    { value: 'success', label: t('Success') },
    { value: 'pending', label: t('Pending') },
    { value: 'expired', label: t('Expired') },
  ]

  const renderTableRows = () => {
    if (loading) {
      return ['row-1', 'row-2', 'row-3'].map((rowKey) => (
        <tr key={rowKey} className='is-static-row'>
          <td colSpan={6}>
            <Skeleton className='h-5 w-full rounded' />
          </td>
        </tr>
      ))
    }

    if (filteredRecords.length === 0) {
      return (
        <tr className='is-static-row'>
          <td colSpan={6}>
            <div className='keys-empty-state'>
              <div className='font-medium text-[var(--ink-body)]'>
                {hasActiveFilter
                  ? t('No matching order records')
                  : t('No top-up records yet')}
              </div>
              {!hasActiveFilter && (
                <div className='mt-1 text-xs text-[var(--ink-muted)]'>
                  {t(
                    'Completed top-up orders and credit details will appear here automatically.'
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )
    }

    return filteredRecords.map((record) => {
      const statusConfig = getStatusConfig(record.status)
      const isCopied = copiedText === record.trade_no
      return (
        <tr key={record.id} className='is-static-row'>
          <td>
            <span className='logs-mono'>
              {formatTimestamp(record.create_time)}
            </span>
          </td>
          <td>
            <div className='flex items-center gap-1.5'>
              <span className='logs-mono text-[var(--ink-strong)]'>
                {record.trade_no}
              </span>
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded-md transition-colors'
                onClick={() => void copyToClipboard(record.trade_no)}
                aria-label={t('Copy')}
              >
                {isCopied ? (
                  <Check className='size-3.5 text-emerald-600' />
                ) : (
                  <Copy className='size-3.5' />
                )}
              </button>
            </div>
          </td>
          <td>
            <span className='el-pill'>
              {getPaymentMethodName(record.payment_method, t)}
            </span>
          </td>
          <td>
            <span className='logs-mono font-medium text-[var(--ink-strong)] tabular-nums'>
              {formatCurrencyFromUSD(record.amount, {
                digitsLarge: 2,
                digitsSmall: 2,
                abbreviate: false,
              })}
            </span>
          </td>
          <td>
            <span className='logs-mono tabular-nums'>
              {formatNumber(record.money)}
            </span>
          </td>
          <td>
            <div className='flex items-center gap-2'>
              <StatusBadge
                variant={statusConfig.variant}
                label={t(statusConfig.label)}
                showDot
                copyable={false}
              />
              {isAdmin && record.status === 'pending' && (
                <button
                  type='button'
                  className='el-btn el-btn-xs el-btn-white'
                  onClick={() => setConfirmTradeNo(record.trade_no)}
                  disabled={completing}
                >
                  {t('Complete Order')}
                </button>
              )}
            </div>
          </td>
        </tr>
      )
    })
  }

  return (
    <>
      <section
        id='wallet-billing-history'
        className='keys-table-card scroll-mt-4'
        aria-label={t('Top-up & Order History')}
      >
        <div className='keys-toolbar'>
          <div className='keys-toolbar-left'>
            <h2 className='el-console-card-title mr-1'>
              {t('Top-up & Order History')}
            </h2>
            <div className='catalog-search-wrap'>
              <span className='catalog-search-icon' aria-hidden='true'>
                <Search className='size-3.5' />
              </span>
              <input
                type='search'
                className='keys-search-input'
                value={keyword}
                onChange={(event) => handleSearch(event.target.value)}
                placeholder={t('Search by order number...')}
                aria-label={t('Search by order number...')}
              />
            </div>
            <div
              className='keys-status-pills'
              role='group'
              aria-label={t('Filter by order status')}
            >
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  type='button'
                  className={cn(
                    'keys-status-pill',
                    statusFilter === option.value && 'is-active'
                  )}
                  onClick={() => setStatusFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <span className='console-head-meta tabular-nums'>
              {t('{{count}} records', { count: displayCount })}
            </span>
            <button
              type='button'
              className='el-btn el-btn-xs el-btn-white'
              onClick={() => void refresh()}
              disabled={loading}
              aria-label={t('Refresh')}
            >
              <RefreshCw
                className={cn('size-3.5', loading && 'animate-spin')}
              />
            </button>
          </div>
        </div>

        <div className='logs-table-scroll'>
          <table
            className='logs-table'
            aria-label={t('Top-up & Order History')}
          >
            <thead>
              <tr>
                <th>{t('Time')}</th>
                <th>{t('Order Number')}</th>
                <th>{t('Payment Method')}</th>
                <th>{t('Amount')}</th>
                <th>{t('Payment')}</th>
                <th>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>{renderTableRows()}</tbody>
          </table>
        </div>

        {!loading && records.length > 0 && total > pageSize && (
          <div className='keys-pagination'>
            <div className='tabular-nums'>
              {t('Showing')} {(page - 1) * pageSize + 1}-
              {Math.min(page * pageSize, total)} {t('of')} {total}
            </div>
            <div className='flex items-center gap-1.5'>
              <button
                type='button'
                className='el-btn el-btn-xs el-btn-white'
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                aria-label={t('Previous')}
              >
                <ChevronLeft className='size-3.5' />
              </button>
              <span className='px-1.5 font-mono text-xs tabular-nums'>
                {page} / {totalPages}
              </span>
              <button
                type='button'
                className='el-btn el-btn-xs el-btn-white'
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                aria-label={t('Next')}
              >
                <ChevronRight className='size-3.5' />
              </button>
            </div>
          </div>
        )}
      </section>

      <AlertDialog
        open={!!confirmTradeNo}
        onOpenChange={(open) => !open && setConfirmTradeNo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Complete Order')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Are you sure you want to manually complete this order? The user will be credited with the corresponding quota.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completing}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmComplete()}
              disabled={completing}
            >
              {completing ? t('Processing...') : t('Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
