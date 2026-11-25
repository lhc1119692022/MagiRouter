import { Loader2, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { searchUsers } from '@/features/users/api'
import type { User } from '@/features/users/types'

interface DailyTopUpExemptUsersFieldProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  invalid?: boolean
}

function parseExemptUsers(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0)
  } catch {
    return []
  }
}

function serializeExemptUsers(items: string[]): string {
  return JSON.stringify(items)
}

function isDuplicateIdentifier(list: string[], candidate: string): boolean {
  const normalized = candidate.trim().toLowerCase()
  return list.some((existing) => existing.trim().toLowerCase() === normalized)
}

export function DailyTopUpExemptUsersField(
  props: DailyTopUpExemptUsersFieldProps
) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [suggestions, setSuggestions] = useState<User[]>([])
  const [userLabels, setUserLabels] = useState<Record<string, string>>({})

  const entries = useMemo(() => parseExemptUsers(props.value), [props.value])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed || props.disabled) {
      setSuggestions([])
      setSearching(false)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const response = await searchUsers({
          keyword: trimmed,
          p: 1,
          page_size: 6,
        })
        if (cancelled) {
          return
        }
        const items = response.data?.items
        setSuggestions(Array.isArray(items) ? items : [])
      } catch {
        if (!cancelled) {
          setSuggestions([])
        }
      } finally {
        if (!cancelled) {
          setSearching(false)
        }
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, props.disabled])

  const addIdentifiers = (rawInput: string) => {
    const tokens = rawInput
      .split(/[\n,，]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

    if (tokens.length === 0) {
      return
    }

    const next = [...entries]
    let changed = false
    for (const token of tokens) {
      if (!isDuplicateIdentifier(next, token)) {
        next.push(token)
        changed = true
      }
    }

    if (changed) {
      props.onChange(serializeExemptUsers(next))
    }
    setQuery('')
    setSuggestions([])
  }

  const handleSelectUser = (user: User) => {
    const idKey = String(user.id)
    setUserLabels((previous) => ({
      ...previous,
      [idKey]: `${user.username} (#${user.id})`,
    }))
    if (!isDuplicateIdentifier(entries, idKey)) {
      props.onChange(serializeExemptUsers([...entries, idKey]))
    }
    setQuery('')
    setSuggestions([])
  }

  const handleRemove = (target: string) => {
    const next = entries.filter((item) => item !== target)
    props.onChange(serializeExemptUsers(next))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addIdentifiers(query)
    }
  }

  const visibleSuggestions = suggestions.filter(
    (user) => !isDuplicateIdentifier(entries, String(user.id))
  )

  return (
    <div className='space-y-3'>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <div className='relative flex-1'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={props.disabled}
            aria-invalid={props.invalid}
            placeholder={t(
              'Search user or enter User ID / username / email, press Enter to add'
            )}
            className='pl-9'
          />
          {searching && (
            <Loader2 className='text-muted-foreground absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin' />
          )}
        </div>
        <Button
          type='button'
          variant='outline'
          disabled={props.disabled || query.trim().length === 0}
          onClick={() => addIdentifiers(query)}
          className='shrink-0'
        >
          <Plus className='mr-1.5 h-4 w-4' />
          {t('Add')}
        </Button>
      </div>

      {visibleSuggestions.length > 0 && (
        <div className='bg-popover rounded-md border p-1.5 shadow-sm'>
          <div className='text-muted-foreground px-2 py-1 text-xs'>
            {t('Matching users (click to add by User ID)')}
          </div>
          <div className='space-y-1'>
            {visibleSuggestions.map((user) => (
              <button
                key={user.id}
                type='button'
                onClick={() => handleSelectUser(user)}
                className='hover:bg-accent flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors'
              >
                <span className='min-w-0 truncate font-medium'>
                  {user.username}{' '}
                  <span className='text-muted-foreground font-normal'>
                    #{user.id}
                  </span>
                </span>
                {user.email ? (
                  <span className='text-muted-foreground truncate text-xs'>
                    {user.email}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {entries.length > 0 ? (
        <div className='bg-muted/30 space-y-2 rounded-lg border p-3'>
          <div className='flex items-center justify-between gap-2'>
            <span className='text-muted-foreground text-xs'>
              {t('Whitelisted users: {{count}}', { count: entries.length })}
            </span>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              disabled={props.disabled}
              onClick={() => props.onChange('[]')}
              className='text-muted-foreground hover:text-destructive h-7 px-2 text-xs'
            >
              <Trash2 className='mr-1 h-3.5 w-3.5' />
              {t('Clear all')}
            </Button>
          </div>
          <div className='flex flex-wrap gap-1.5'>
            {entries.map((entry) => {
              const label =
                userLabels[entry] ??
                (/^\d+$/.test(entry) ? `ID #${entry}` : entry)
              return (
                <Badge
                  key={entry}
                  variant='secondary'
                  className='gap-1 py-1 pr-1 pl-2.5 text-xs font-normal'
                >
                  <span>{label}</span>
                  <button
                    type='button'
                    disabled={props.disabled}
                    onClick={() => handleRemove(entry)}
                    aria-label={t('Remove {{item}}', { item: label })}
                    className='hover:bg-foreground/10 rounded-full p-0.5 transition-colors'
                  >
                    <X className='h-3 w-3' />
                  </button>
                </Badge>
              )
            })}
          </div>
        </div>
      ) : (
        <p className='text-muted-foreground text-xs'>
          {t('No whitelisted users yet.')}
        </p>
      )}
    </div>
  )
}
