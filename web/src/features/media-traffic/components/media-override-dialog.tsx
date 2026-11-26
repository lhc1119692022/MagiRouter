import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { searchUsersForMediaRelay } from '@/features/system-settings/media-relay/api'
import type { UserSearchOption } from '@/features/system-settings/media-relay/types'

export interface MediaOverrideTarget {
  userId: number
  username: string
  displayName?: string
  extraDailyMB?: number
  expiresAt?: number
  note?: string
}

interface MediaOverrideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: MediaOverrideTarget | null
  isSaving: boolean
  onSave: (payload: {
    userId: number
    extra_daily_mb: number
    expires_at: number
    note: string
  }) => Promise<void>
}

function unixSecondsToDateTimeLocal(unixSeconds: number): string {
  if (!unixSeconds || unixSeconds <= 0) return ''
  const date = new Date(unixSeconds * 1000)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (val: number) => String(val).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function dateTimeLocalToUnixSeconds(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return 0
  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed) || parsed <= 0) return 0
  return Math.floor(parsed / 1000)
}

export function MediaOverrideDialog(props: MediaOverrideDialogProps) {
  const { t } = useTranslation()
  const [selectedUserId, setSelectedUserId] = useState<number>(0)
  const [selectedLabel, setSelectedLabel] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchOption[]>([])
  const [searching, setSearching] = useState(false)
  const [extraDailyMB, setExtraDailyMB] = useState('500')
  const [expiresAtInput, setExpiresAtInput] = useState('')
  const [note, setNote] = useState('')
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    if (!props.open) return
    setErrorText('')
    setSearchKeyword('')
    setSearchResults([])
    if (props.target) {
      setSelectedUserId(props.target.userId)
      setSelectedLabel(
        props.target.username
          ? `${props.target.username} (#${props.target.userId})`
          : `#${props.target.userId}`
      )
      setExtraDailyMB(
        String(
          props.target.extraDailyMB && props.target.extraDailyMB > 0
            ? props.target.extraDailyMB
            : 500
        )
      )
      setExpiresAtInput(unixSecondsToDateTimeLocal(props.target.expiresAt ?? 0))
      setNote(props.target.note ?? '')
    } else {
      setSelectedUserId(0)
      setSelectedLabel('')
      setExtraDailyMB('500')
      setExpiresAtInput('')
      setNote('')
    }
  }, [props.open, props.target])

  const handleSearchUsers = async () => {
    if (!searchKeyword.trim()) return
    setSearching(true)
    try {
      const list = await searchUsersForMediaRelay(searchKeyword)
      setSearchResults(list)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const applyPresetHours = (hours: number) => {
    if (hours <= 0) {
      setExpiresAtInput('')
      return
    }
    setExpiresAtInput(
      unixSecondsToDateTimeLocal(Math.floor(Date.now() / 1000) + hours * 3600)
    )
  }

  const handleSubmit = async () => {
    setErrorText('')
    if (selectedUserId <= 0) {
      setErrorText(t('Please select a target user'))
      return
    }
    const mb = Number(extraDailyMB)
    if (!Number.isFinite(mb) || mb <= 0) {
      setErrorText(t('Extra daily quota must be greater than 0 MB'))
      return
    }
    const expiresAt = dateTimeLocalToUnixSeconds(expiresAtInput)
    await props.onSave({
      userId: selectedUserId,
      extra_daily_mb: Math.round(mb),
      expires_at: expiresAt,
      note: note.trim(),
    })
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Targeted daily traffic override')}
      description={t(
        'Grant extra daily cloud media transfer quota to a specific user (permanent or time-limited).'
      )}
      contentClassName='sm:max-w-lg'
      footer={
        <div className='flex w-full items-center justify-between gap-2'>
          <span className='text-destructive text-xs'>{errorText}</span>
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => props.onOpenChange(false)}
              disabled={props.isSaving}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='button'
              onClick={() => void handleSubmit()}
              disabled={props.isSaving}
            >
              {props.isSaving ? t('Saving...') : t('Save override')}
            </Button>
          </div>
        </div>
      }
    >
      <div className='space-y-4'>
        {props.target ? (
          <div className='rounded-md border px-3 py-2 text-sm'>
            <span className='text-muted-foreground'>{t('Target user')}: </span>
            <span className='font-medium'>{selectedLabel}</span>
          </div>
        ) : (
          <div className='space-y-2'>
            <Label htmlFor='media-override-user-search'>
              {t('Search user')}
            </Label>
            <div className='flex gap-2'>
              <Input
                id='media-override-user-search'
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleSearchUsers()
                  }
                }}
                placeholder={t('Username, email, or user ID')}
              />
              <Button
                type='button'
                variant='outline'
                onClick={() => void handleSearchUsers()}
                disabled={searching}
              >
                <Search className='h-4 w-4' />
              </Button>
            </div>
            {selectedUserId > 0 && (
              <div className='text-xs text-emerald-600 dark:text-emerald-400'>
                {t('Selected')}: {selectedLabel}
              </div>
            )}
            {searchResults.length > 0 && (
              <div className='max-h-36 space-y-1 overflow-y-auto rounded-md border p-1.5'>
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    type='button'
                    className={`hover:bg-muted flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
                      selectedUserId === user.id ? 'bg-muted font-medium' : ''
                    }`}
                    onClick={() => {
                      setSelectedUserId(user.id)
                      setSelectedLabel(`${user.username} (#${user.id})`)
                    }}
                  >
                    <span>
                      {user.username}
                      {user.display_name ? ` (${user.display_name})` : ''}
                    </span>
                    <span className='text-muted-foreground'>
                      #{user.id} {user.group ? `· ${user.group}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className='space-y-1.5'>
          <Label htmlFor='media-override-mb'>
            {t('Extra daily traffic (MB)')}
          </Label>
          <Input
            id='media-override-mb'
            type='number'
            min={1}
            step={50}
            value={extraDailyMB}
            onChange={(event) => setExtraDailyMB(event.target.value)}
          />
        </div>

        <div className='space-y-1.5'>
          <Label htmlFor='media-override-expires'>
            {t('Expiration time (leave empty for permanent)')}
          </Label>
          <Input
            id='media-override-expires'
            type='datetime-local'
            value={expiresAtInput}
            onChange={(event) => setExpiresAtInput(event.target.value)}
          />
          <div className='flex flex-wrap gap-1.5 pt-1'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='h-7 text-xs'
              onClick={() => applyPresetHours(24)}
            >
              +24h
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='h-7 text-xs'
              onClick={() => applyPresetHours(24 * 7)}
            >
              +7d
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='h-7 text-xs'
              onClick={() => applyPresetHours(24 * 30)}
            >
              +30d
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='h-7 text-xs'
              onClick={() => applyPresetHours(0)}
            >
              {t('Permanent')}
            </Button>
          </div>
        </div>

        <div className='space-y-1.5'>
          <Label htmlFor='media-override-note'>{t('Note (optional)')}</Label>
          <Input
            id='media-override-note'
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('e.g. Heavy video generation project')}
          />
        </div>
      </div>
    </Dialog>
  )
}
