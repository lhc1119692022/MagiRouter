import { Code, Plus, Table, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { JsonCodeEditor } from '@/components/json-code-editor'
import { MultiSelect, type Option } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import { ENDPOINT_HTTP_METHODS, ENDPOINT_TEMPLATES } from '../constants'

type ModelEndpointsEditorProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  id?: string
  ariaLabel?: string
}

type EndpointRow = {
  id: string
  key: string
  method: string
  path: string
  extraFields?: Record<string, unknown>
}

type ParsedEndpointResult = { ok: true; rows: EndpointRow[] } | { ok: false }

const TEMPLATE_OPTIONS: Option[] = Object.entries(ENDPOINT_TEMPLATES).map(
  ([key, config]) => ({
    value: key,
    label: key,
    hint: `${config.method} ${config.path}`,
  })
)

const KNOWN_METHODS = new Set<string>(ENDPOINT_HTTP_METHODS)

function parseEndpointConfig(
  raw: string,
  allocateId: () => string
): ParsedEndpointResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: true, rows: [] }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { ok: false }
  }

  if (Array.isArray(parsed)) {
    const rows: EndpointRow[] = []
    for (const item of parsed) {
      if (typeof item !== 'string') {
        return { ok: false }
      }
      const key = item.trim()
      if (!key) continue
      const preset = ENDPOINT_TEMPLATES[key]
      rows.push({
        id: allocateId(),
        key,
        method: preset?.method ?? 'POST',
        path: preset?.path ?? '',
      })
    }
    return { ok: true, rows }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false }
  }

  const rows: EndpointRow[] = []
  for (const [key, config] of Object.entries(parsed)) {
    if (typeof config === 'string') {
      rows.push({
        id: allocateId(),
        key,
        method: 'POST',
        path: config,
      })
      continue
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { ok: false }
    }
    const record = config as Record<string, unknown>
    const { path: rawPath, method: rawMethod, ...rest } = record
    const method =
      typeof rawMethod === 'string' && rawMethod.trim()
        ? rawMethod.trim().toUpperCase()
        : 'POST'
    const path = typeof rawPath === 'string' ? rawPath : ''
    rows.push({
      id: allocateId(),
      key,
      method,
      path,
      extraFields: Object.keys(rest).length > 0 ? rest : undefined,
    })
  }
  return { ok: true, rows }
}

function serializeEndpointRows(rows: EndpointRow[]): string {
  const serialized: Record<string, Record<string, unknown>> = {}
  for (const row of rows) {
    const trimmedKey = row.key.trim()
    if (!trimmedKey) continue
    serialized[trimmedKey] = {
      ...row.extraFields,
      path: row.path.trim(),
      method: row.method || 'POST',
    }
  }
  if (Object.keys(serialized).length === 0) {
    return ''
  }
  return JSON.stringify(serialized, null, 2)
}

export function ModelEndpointsEditor(props: ModelEndpointsEditorProps) {
  const { t } = useTranslation()
  const nextRowIdRef = useRef(1)
  const allocateId = useCallback(() => {
    const id = `endpoint-row-${nextRowIdRef.current}`
    nextRowIdRef.current += 1
    return id
  }, [])

  const initialParsed = useMemo(
    () => parseEndpointConfig(props.value, allocateId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const [mode, setMode] = useState<'visual' | 'json'>(
    initialParsed.ok ? 'visual' : 'json'
  )
  const [rows, setRows] = useState<EndpointRow[]>(
    initialParsed.ok ? initialParsed.rows : []
  )
  const [jsonDraft, setJsonDraft] = useState(props.value)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const lastEmittedRef = useRef(props.value)

  useEffect(() => {
    if (props.value === lastEmittedRef.current) {
      return
    }
    lastEmittedRef.current = props.value
    setJsonDraft(props.value)
    setJsonError(null)
    const parsed = parseEndpointConfig(props.value, allocateId)
    if (parsed.ok) {
      setRows(parsed.rows)
    } else {
      setMode('json')
    }
  }, [props.value, allocateId])

  const commitRows = useCallback(
    (updatedRows: EndpointRow[]) => {
      setRows(updatedRows)
      const nextJson = serializeEndpointRows(updatedRows)
      setJsonDraft(nextJson)
      setJsonError(null)
      lastEmittedRef.current = nextJson
      props.onChange(nextJson)
    },
    [props]
  )

  const selectedTemplateKeys = useMemo(() => {
    const seen = new Set<string>()
    const selected: string[] = []
    for (const row of rows) {
      const trimmedKey = row.key.trim()
      if (trimmedKey in ENDPOINT_TEMPLATES && !seen.has(trimmedKey)) {
        seen.add(trimmedKey)
        selected.push(trimmedKey)
      }
    }
    return selected
  }, [rows])

  const duplicateKeys = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      const trimmedKey = row.key.trim()
      if (!trimmedKey) continue
      counts.set(trimmedKey, (counts.get(trimmedKey) ?? 0) + 1)
    }
    const duplicates = new Set<string>()
    for (const [key, count] of counts) {
      if (count > 1) {
        duplicates.add(key)
      }
    }
    return duplicates
  }, [rows])

  const handleTemplateSelectionChange = useCallback(
    (nextSelected: string[]) => {
      const currentSet = new Set(selectedTemplateKeys)
      const nextSet = new Set(nextSelected)
      const removed = new Set(
        selectedTemplateKeys.filter((key) => !nextSet.has(key))
      )
      const added = nextSelected.filter((key) => !currentSet.has(key))

      const updatedRows = rows.filter((row) => !removed.has(row.key.trim()))
      for (const key of added) {
        const template = ENDPOINT_TEMPLATES[key]
        if (!template) continue
        updatedRows.push({
          id: allocateId(),
          key,
          method: template.method,
          path: template.path,
        })
      }
      commitRows(updatedRows)
    },
    [selectedTemplateKeys, rows, allocateId, commitRows]
  )

  const handleAddCustomRow = () => {
    setRows((current) => [
      ...current,
      {
        id: allocateId(),
        key: '',
        method: 'POST',
        path: '',
      },
    ])
  }

  const handleDeleteRow = (id: string) => {
    commitRows(rows.filter((row) => row.id !== id))
  }

  const handleRowChange = (
    id: string,
    field: 'key' | 'method' | 'path',
    nextValue: string
  ) => {
    commitRows(
      rows.map((row) => (row.id === id ? { ...row, [field]: nextValue } : row))
    )
  }

  const handleJsonChange = (nextJson: string) => {
    setJsonDraft(nextJson)
    setJsonError(null)
    lastEmittedRef.current = nextJson
    props.onChange(nextJson)
  }

  const handleToggleMode = () => {
    if (mode === 'visual') {
      const nextJson = serializeEndpointRows(rows)
      setJsonDraft(nextJson)
      setJsonError(null)
      lastEmittedRef.current = nextJson
      props.onChange(nextJson)
      setMode('json')
      return
    }

    const parsed = parseEndpointConfig(jsonDraft, allocateId)
    if (!parsed.ok) {
      setJsonError(
        t(
          'Invalid JSON. Fix syntax or structure errors before switching to visual mode.'
        )
      )
      return
    }
    setRows(parsed.rows)
    setJsonError(null)
    setMode('visual')
  }

  const renderTemplateSummary = useCallback(
    (values: string[]) =>
      t('{{count}} template(s) selected', { count: values.length }),
    [t]
  )

  return (
    <div className='space-y-3'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-start'>
        {mode === 'visual' && (
          <div className='min-w-0 flex-1'>
            <MultiSelect
              id={props.id}
              options={TEMPLATE_OPTIONS}
              selected={selectedTemplateKeys}
              onChange={handleTemplateSelectionChange}
              placeholder={t('Select endpoint templates...')}
              emptyText={t('No matching endpoints')}
              disabled={props.disabled}
              renderSelectedSummary={
                selectedTemplateKeys.length > 0
                  ? renderTemplateSummary
                  : undefined
              }
            />
          </div>
        )}
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={handleToggleMode}
          disabled={props.disabled}
          className='shrink-0'
        >
          {mode === 'visual' ? (
            <>
              <Code className='mr-2 h-4 w-4' aria-hidden='true' />
              {t('JSON Mode')}
            </>
          ) : (
            <>
              <Table className='mr-2 h-4 w-4' aria-hidden='true' />
              {t('Visual Mode')}
            </>
          )}
        </Button>
      </div>

      {mode === 'visual' ? (
        <div className='space-y-2'>
          {rows.length > 0 ? (
            <div className='space-y-2'>
              <div className='text-muted-foreground hidden grid-cols-[minmax(0,1.1fr)_110px_minmax(0,1.6fr)_auto] gap-2 text-xs font-medium sm:grid'>
                <div>{t('Endpoint Type')}</div>
                <div>{t('Method')}</div>
                <div>{t('Path')}</div>
                <div className='w-9' />
              </div>
              {rows.map((row) => {
                const trimmedKey = row.key.trim()
                const isDuplicate =
                  trimmedKey.length > 0 && duplicateKeys.has(trimmedKey)
                const hasCustomMethod =
                  row.method.length > 0 && !KNOWN_METHODS.has(row.method)
                return (
                  <div
                    key={row.id}
                    className='grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.1fr)_110px_minmax(0,1.6fr)_auto] sm:items-center'
                  >
                    <Input
                      value={row.key}
                      onChange={(event) =>
                        handleRowChange(row.id, 'key', event.target.value)
                      }
                      placeholder='image-generation'
                      aria-label={t('Endpoint Type')}
                      aria-invalid={isDuplicate || undefined}
                      disabled={props.disabled}
                    />
                    <NativeSelect
                      value={row.method}
                      onChange={(event) =>
                        handleRowChange(row.id, 'method', event.target.value)
                      }
                      aria-label={t('Method')}
                      disabled={props.disabled}
                      className='w-full'
                    >
                      {hasCustomMethod && (
                        <NativeSelectOption value={row.method}>
                          {row.method}
                        </NativeSelectOption>
                      )}
                      {ENDPOINT_HTTP_METHODS.map((method) => (
                        <NativeSelectOption key={method} value={method}>
                          {method}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <Input
                      value={row.path}
                      onChange={(event) =>
                        handleRowChange(row.id, 'path', event.target.value)
                      }
                      placeholder='/v1/images/generations'
                      aria-label={t('Path')}
                      disabled={props.disabled}
                      className='font-mono text-xs sm:text-sm'
                    />
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      aria-label={t('Delete endpoint')}
                      onClick={() => handleDeleteRow(row.id)}
                      disabled={props.disabled}
                      className='h-9 w-9'
                    >
                      <Trash2 className='h-4 w-4' aria-hidden='true' />
                    </Button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className='text-muted-foreground flex h-24 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm'>
              {t(
                'No endpoints configured. Select templates above or add a custom endpoint.'
              )}
            </div>
          )}

          {duplicateKeys.size > 0 && (
            <p role='alert' className='text-destructive text-xs'>
              {t('Duplicate endpoint types will overwrite earlier entries.')}
            </p>
          )}

          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={handleAddCustomRow}
            disabled={props.disabled}
            className='w-full'
          >
            <Plus className='mr-2 h-4 w-4' aria-hidden='true' />
            {t('Add custom endpoint')}
          </Button>
        </div>
      ) : (
        <div className='space-y-2'>
          <JsonCodeEditor
            id={props.id}
            value={jsonDraft}
            onChange={handleJsonChange}
            disabled={props.disabled}
            ariaLabel={props.ariaLabel ?? t('Endpoint Configuration')}
            aria-invalid={Boolean(jsonError) || undefined}
            placeholder='{"image-generation": {"path": "/v1/images/generations", "method": "POST"}}'
          />
          {jsonError && (
            <p role='alert' className='text-destructive text-xs'>
              {jsonError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
