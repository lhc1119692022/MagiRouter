/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { useMediaQuery } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'
import { getUserGroups } from '@/lib/api'
import { getCurrencyDisplay } from '@/lib/currency'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { API_KEY_STATUS, API_KEY_STATUSES } from '../constants'
import type { ApiKey } from '../types'
import { ApiKeyGroupCell } from './api-key-group-cell'
import { ApiKeyQuotaCell } from './api-key-quota-cell'
import {
  ApiKeyActivityCell,
  ApiKeyTimestampCell,
} from './api-key-timestamp-cell'
import {
  ApiKeyCell,
  IpRestrictionsCell,
  ModelLimitsCell,
} from './api-keys-cells'
import { DataTableRowActions } from './data-table-row-actions'

type UserGroupsMeta = {
  ratios: Record<string, number | string>
  descriptions: Record<string, string>
  requireExplicitGroup: boolean
}

const EMPTY_USER_GROUPS_META: UserGroupsMeta = {
  ratios: {},
  descriptions: {},
  requireExplicitGroup: false,
}

function useUserGroupsMeta(): UserGroupsMeta {
  const { data } = useQuery({
    queryKey: ['user-groups'],
    queryFn: async () => requireServerSuccess(await getUserGroups()),
    staleTime: 0,
    select: (res): UserGroupsMeta => {
      const ratios: Record<string, number | string> = {}
      const descriptions: Record<string, string> = {}
      if (res.success && res.data) {
        for (const [group, info] of Object.entries(res.data)) {
          if (
            typeof info.ratio === 'number' ||
            typeof info.ratio === 'string'
          ) {
            ratios[group] = info.ratio
          }
          if (typeof info.desc === 'string' && info.desc.trim()) {
            descriptions[group] = info.desc.trim()
          }
        }
      }
      return {
        ratios,
        descriptions,
        requireExplicitGroup:
          res.success && res.require_explicit_group === true,
      }
    },
  })

  return data ?? EMPTY_USER_GROUPS_META
}

function getStatusTagClassName(status: number): string {
  if (status === API_KEY_STATUS.ENABLED) return 'key-status-tag is-enabled'
  if (status === API_KEY_STATUS.DISABLED) return 'key-status-tag is-disabled'
  if (status === API_KEY_STATUS.EXPIRED) return 'key-status-tag is-expired'
  return 'key-status-tag is-exhausted'
}

export function useApiKeysColumns(now: number): ColumnDef<ApiKey>[] {
  const { t, i18n } = useTranslation()
  useSystemConfigStore((state) => state.config.currency)
  const { meta: currency } = getCurrencyDisplay()
  const quotaUnit = currency.kind === 'tokens' ? t('Tokens') : currency.symbol
  const {
    ratios: groupRatios,
    descriptions: groupDescriptions,
    requireExplicitGroup,
  } = useUserGroupsMeta()
  const shouldReduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const justNowLabel = t('Just now')
  return useMemo<ColumnDef<ApiKey>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label={t('Select all')}
            className='translate-y-[2px]'
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={t('Select row')}
            className='translate-y-[2px]'
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        accessorKey: 'name',
        header: t('Name'),
        cell: ({ row }) => {
          const name = String(row.getValue('name') ?? '')
          return (
            <span className='key-name-primary' title={name}>
              {name}
            </span>
          )
        },
        size: 156,
        meta: { mobileTitle: true },
      },
      {
        id: 'key',
        accessorKey: 'key',
        header: t('API Key'),
        cell: ({ row }) => <ApiKeyCell apiKey={row.original} />,
        enableSorting: false,
        size: 215,
      },
      {
        accessorKey: 'group',
        header: t('Group'),
        cell: ({ row }) => {
          const apiKey = row.original
          const group = row.getValue('group') as string
          const autoOrderText =
            group === 'auto' && apiKey.auto_groups?.length
              ? apiKey.auto_groups.join(' → ')
              : ''
          const subNote = autoOrderText || groupDescriptions[group] || ''
          return (
            <div className='key-group-wrap'>
              <ApiKeyGroupCell
                group={group}
                ratio={groupRatios[group]}
                crossGroupRetry={apiKey.cross_group_retry}
                shouldReduceMotion={shouldReduceMotion}
                requireExplicitGroup={requireExplicitGroup}
              />
              {subNote && (
                <span className='key-sub-note' title={subNote}>
                  {subNote}
                </span>
              )}
            </div>
          )
        },
        filterFn: (row, id, value) => {
          if (!value || value === 'all') return true
          const target = String(value)
          const rowGroup = String(row.getValue(id) ?? '')
          if (rowGroup === target) return true
          return (
            rowGroup === 'auto' &&
            Boolean(row.original.auto_groups?.includes(target))
          )
        },
        size: 185,
        meta: { mobileHidden: true },
      },
      {
        id: 'quota',
        accessorKey: 'remain_quota',
        header: `${t('Quota')} (${quotaUnit})`,
        cell: ({ row }) => <ApiKeyQuotaCell apiKey={row.original} now={now} />,
        size: 196,
        minSize: 180,
      },
      {
        accessorKey: 'status',
        header: t('Status'),
        cell: ({ row }) => {
          const status = row.getValue('status') as number
          const statusConfig = API_KEY_STATUSES[status]
          if (!statusConfig) return null
          return (
            <span className={getStatusTagClassName(status)}>
              <span className='key-status-dot' aria-hidden='true' />
              <span>{t(statusConfig.label)}</span>
            </span>
          )
        },
        filterFn: (row, id, value) => value.includes(String(row.getValue(id))),
        size: 96,
        meta: { mobileBadge: true },
      },
      {
        accessorKey: 'expired_time',
        header: t('Expires'),
        cell: ({ row }) => {
          const expiredTime = row.getValue('expired_time') as number
          if (expiredTime === -1) {
            return (
              <span className='text-foreground text-[12.5px] font-normal whitespace-nowrap'>
                {t('Never')}
              </span>
            )
          }
          return (
            <ApiKeyTimestampCell
              timestamp={expiredTime}
              now={now}
              locale={locale}
              justNowLabel={justNowLabel}
              className={
                expiredTime * 1000 <= now
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              }
            />
          )
        },
        size: 138,
        meta: { mobileHidden: true },
      },
      {
        id: 'activity_time',
        accessorKey: 'created_time',
        header: t('Time'),
        cell: ({ row }) => (
          <ApiKeyActivityCell apiKey={row.original} now={now} />
        ),
        size: 185,
        meta: { mobileHidden: true },
      },
      {
        id: 'model_limits',
        accessorKey: 'model_limits',
        header: t('Models'),
        cell: ({ row }) => <ModelLimitsCell apiKey={row.original} />,
        enableSorting: false,
        size: 118,
        meta: { mobileHidden: true },
      },
      {
        id: 'allow_ips',
        accessorKey: 'allow_ips',
        header: t('IP Restriction'),
        cell: ({ row }) => <IpRestrictionsCell apiKey={row.original} />,
        enableSorting: false,
        size: 118,
        meta: { mobileHidden: true },
      },
      {
        id: 'actions',
        header: () => t('Actions'),
        cell: ({ row }) => <DataTableRowActions row={row} />,
        meta: { pinned: 'right' as const },
        size: 144,
      },
    ],
    [
      t,
      quotaUnit,
      now,
      groupRatios,
      groupDescriptions,
      requireExplicitGroup,
      shouldReduceMotion,
      locale,
      justNowLabel,
    ]
  )
}
