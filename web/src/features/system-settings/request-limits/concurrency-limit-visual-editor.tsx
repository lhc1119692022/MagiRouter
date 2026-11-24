import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { safeJsonParseWithValidation } from '../utils/json-parser'
import { isObjectRecord } from '../utils/json-validators'
import {
  ConcurrencyLimitDialog,
  MAX_CONCURRENCY_LIMIT,
  type ConcurrencyLimitEntryData,
} from './concurrency-limit-dialog'

type ConcurrencyLimitVisualEditorProps = {
  value: string
  onChange: (value: string) => void
}

type ConcurrencyLimitEntry = ConcurrencyLimitEntryData

export function ConcurrencyLimitVisualEditor(
  props: ConcurrencyLimitVisualEditorProps
) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [searchText, setSearchText] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editData, setEditData] = useState<ConcurrencyLimitEntry | null>(null)

  const concurrencyLimits = useMemo<ConcurrencyLimitEntry[]>(() => {
    if (!props.value || props.value.trim() === '') {
      return []
    }

    const parsed = safeJsonParseWithValidation<Record<string, unknown>>(
      props.value,
      {
        fallback: {},
        validator: isObjectRecord,
        silent: true,
      }
    )

    const entries: ConcurrencyLimitEntry[] = []
    for (const [groupName, limit] of Object.entries(parsed)) {
      if (
        groupName.trim() !== '' &&
        typeof limit === 'number' &&
        Number.isInteger(limit) &&
        limit >= 0 &&
        limit <= MAX_CONCURRENCY_LIMIT
      ) {
        entries.push({
          groupName,
          maxConcurrency: limit,
        })
      }
    }
    return entries
  }, [props.value])

  const filteredConcurrencyLimits = useMemo<ConcurrencyLimitEntry[]>(() => {
    if (!searchText) {
      return concurrencyLimits
    }
    const lowerSearch = searchText.toLowerCase()
    return concurrencyLimits.filter((limit) =>
      limit.groupName.toLowerCase().includes(lowerSearch)
    )
  }, [concurrencyLimits, searchText])

  const handleSave = (data: ConcurrencyLimitEntryData): void => {
    const trimmedGroupName = data.groupName.trim()
    if (!trimmedGroupName) {
      return
    }

    const parsed = safeJsonParseWithValidation<Record<string, unknown>>(
      props.value,
      {
        fallback: {},
        validator: isObjectRecord,
        silent: true,
      }
    )

    if (editData && editData.groupName !== trimmedGroupName) {
      delete parsed[editData.groupName]
    }

    parsed[trimmedGroupName] = data.maxConcurrency

    props.onChange(JSON.stringify(parsed, null, 2))
  }

  const handleDelete = (groupName: string): void => {
    const parsed = safeJsonParseWithValidation<Record<string, unknown>>(
      props.value,
      {
        fallback: {},
        validator: isObjectRecord,
        silent: true,
      }
    )

    delete parsed[groupName]

    props.onChange(JSON.stringify(parsed, null, 2))
  }

  const handleEdit = (limit: ConcurrencyLimitEntry): void => {
    setEditData(limit)
    setDialogOpen(true)
  }

  const handleAdd = (): void => {
    setEditData(null)
    setDialogOpen(true)
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-4'>
        <div className='relative flex-1'>
          <Search
            className='text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4'
            aria-hidden='true'
          />
          <Input
            placeholder={t('Search group names...')}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className='pl-9'
          />
        </div>
        <Button type='button' onClick={handleAdd}>
          <Plus className='mr-2 h-4 w-4' aria-hidden='true' />
          {t('Add group')}
        </Button>
      </div>

      <StaticDataTable
        data={filteredConcurrencyLimits}
        getRowKey={(limit) => limit.groupName}
        emptyContent={
          searchText
            ? t('No groups match your search')
            : t(
                'No group concurrency limits configured. Click "Add group" to get started.'
              )
        }
        columns={[
          {
            id: 'group',
            header: t('Group Name'),
            cellClassName: 'font-medium',
            cell: (limit) => limit.groupName,
          },
          {
            id: 'max-concurrency',
            header: t('Max concurrency'),
            className: 'text-right',
            cellClassName: 'text-right',
            cell: (limit) => (
              <span className='font-mono'>
                {limit.maxConcurrency === 0
                  ? t('Unlimited')
                  : formatNumber(limit.maxConcurrency, locale)}
              </span>
            ),
          },
          {
            id: 'actions',
            header: t('Actions'),
            className: 'text-right',
            cellClassName: 'text-right',
            cell: (limit) => (
              <StaticRowActions
                editLabel={t('Edit')}
                deleteLabel={t('Delete')}
                menuLabel={t('Open menu')}
                onEdit={() => handleEdit(limit)}
                onDelete={() => handleDelete(limit.groupName)}
              />
            ),
          },
        ]}
      />

      <ConcurrencyLimitDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        editData={editData}
      />
    </div>
  )
}
