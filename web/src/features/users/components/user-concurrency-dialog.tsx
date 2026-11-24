import type { TFunction } from 'i18next'
import { Pencil } from 'lucide-react'
import { type FormEvent, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { GroupBadge } from '@/components/group-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { adjustUserConcurrency } from '../api'
import { USER_ROLE, isUserDeleted } from '../constants'
import type { User } from '../types'
import { useUsers } from './users-provider'

const MAX_CONCURRENCY_LIMIT = 100000

interface UserConcurrencyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
  onSuccess: () => void
}

function parseConcurrencyInput(
  raw: string
): { value: number; errorKey: null } | { value: null; errorKey: string } {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { value: null, errorKey: 'Must be an integer' }
  }
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return { value: null, errorKey: 'Must be an integer' }
  }
  if (parsed < 0 || parsed > MAX_CONCURRENCY_LIMIT) {
    return { value: null, errorKey: 'Must be between 0 and 100000' }
  }
  return { value: parsed, errorKey: null }
}

function getEffectiveSummary(
  user: User,
  t: TFunction,
  locale?: string
): { value: string; source: string } {
  const summary = user.concurrency_limit

  if (summary) {
    if (!summary.enabled || summary.source === 'disabled') {
      return {
        value: t('Unlimited'),
        source: t('Concurrency limit disabled'),
      }
    }

    if (summary.source === 'user') {
      return {
        value: formatNumber(summary.effective_limit, locale),
        source: t('Custom user limit'),
      }
    }

    const value =
      summary.effective_limit > 0
        ? formatNumber(summary.effective_limit, locale)
        : t('Unlimited')

    if (summary.source === 'group') {
      return {
        value,
        source: t('Group policy ({{group}})', { group: user.group }),
      }
    }

    return {
      value,
      source: t('Default concurrency policy'),
    }
  }

  const maxConcurrency = user.max_concurrency ?? 0
  if (maxConcurrency > 0) {
    return {
      value: formatNumber(maxConcurrency, locale),
      source: t('Custom user limit'),
    }
  }

  return {
    value: t('Follow group'),
    source: t('Group policy ({{group}})', { group: user.group }),
  }
}

function getConcurrencyCellDisplay(
  user: User,
  t: TFunction,
  locale?: string
): { primary: string; secondary?: string; muted: boolean } {
  const summary = user.concurrency_limit

  if (summary) {
    if (!summary.enabled || summary.source === 'disabled') {
      return {
        primary: t('Unlimited'),
        secondary: t('Disabled'),
        muted: true,
      }
    }

    if (summary.source === 'user') {
      return {
        primary: formatNumber(summary.effective_limit, locale),
        secondary: t('Custom'),
        muted: false,
      }
    }

    const isUnlimited = summary.effective_limit <= 0
    const primary = isUnlimited
      ? t('Unlimited')
      : formatNumber(summary.effective_limit, locale)

    if (summary.source === 'group') {
      return {
        primary,
        secondary: t('Group'),
        muted: isUnlimited,
      }
    }

    return {
      primary,
      secondary: t('Default'),
      muted: isUnlimited,
    }
  }

  const maxConcurrency = user.max_concurrency ?? 0
  if (maxConcurrency > 0) {
    return {
      primary: formatNumber(maxConcurrency, locale),
      secondary: t('Custom'),
      muted: false,
    }
  }

  return {
    primary: t('Follow group'),
    muted: true,
  }
}

export function UserConcurrencyCell(props: { user: User }) {
  const { t, i18n } = useTranslation()
  const { setCurrentRow, setOpen } = useUsers()
  const currentUserRole = useAuthStore((s) => s.auth.user?.role ?? 0)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const user = props.user
  const canManage =
    !isUserDeleted(user) &&
    (currentUserRole === USER_ROLE.ROOT || currentUserRole > user.role)
  const display = getConcurrencyCellDisplay(user, t, locale)

  const content = (
    <span className='grid min-w-0 grid-cols-1 gap-y-0.5 text-left text-sm tabular-nums'>
      <span
        className={cn('truncate', display.muted && 'text-muted-foreground')}
      >
        {display.primary}
      </span>
      {display.secondary ? (
        <span
          data-table-text='secondary'
          className='text-muted-foreground text-xs font-normal'
        >
          {display.secondary}
        </span>
      ) : null}
    </span>
  )

  if (!canManage) {
    return <div className='min-w-0'>{content}</div>
  }

  const handleAdjustConcurrency = () => {
    setCurrentRow(user)
    setOpen('concurrency')
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type='button'
            variant='ghost'
            className='group/concurrency -ml-2 h-auto min-w-0 justify-start gap-1.5 px-2 py-1 font-normal'
            onClick={handleAdjustConcurrency}
            aria-label={`${t('Adjust Concurrency')}: ${user.username}`}
          />
        }
      >
        {content}
        <Pencil
          className='text-muted-foreground size-3.5 shrink-0 opacity-60 transition-opacity group-hover/concurrency:opacity-100'
          aria-hidden='true'
        />
      </TooltipTrigger>
      <TooltipContent>{t('Adjust Concurrency')}</TooltipContent>
    </Tooltip>
  )
}

export function UserConcurrencyDialog(props: UserConcurrencyDialogProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const inputId = useId()
  const descriptionId = useId()
  const errorId = useId()

  const initialLimit =
    props.user?.max_concurrency ??
    props.user?.concurrency_limit?.user_override ??
    0

  const [inputValue, setInputValue] = useState<string>(() =>
    String(initialLimit)
  )
  const [validationError, setValidationError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (props.open) {
      setInputValue(String(initialLimit))
      setValidationError(null)
    }
  }, [props.open, props.user?.id, initialLimit])

  if (!props.user) {
    return null
  }

  const user = props.user
  const effectiveSummary = getEffectiveSummary(user, t, locale)
  const isFollowingPolicy = inputValue.trim() === '0'

  const handleConfirm = async () => {
    const parsed = parseConcurrencyInput(inputValue)
    if (parsed.errorKey !== null) {
      setValidationError(parsed.errorKey)
      return
    }

    setValidationError(null)
    setLoading(true)
    try {
      const result = await adjustUserConcurrency({
        id: user.id,
        action: 'set_concurrency',
        value: parsed.value,
      })
      if (result.success) {
        toast.success(t('Concurrency limit updated'))
        props.onOpenChange(false)
        props.onSuccess()
      } else {
        handleServerError(result, t('Failed to update concurrency limit'))
      }
    } catch (error: unknown) {
      handleServerError(error, t('Failed to update concurrency limit'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handleConfirm()
  }

  const handleCancel = () => {
    setValidationError(null)
    props.onOpenChange(false)
  }

  const handleFollowPolicy = () => {
    setInputValue('0')
    setValidationError(null)
  }

  const describedBy = validationError
    ? `${descriptionId} ${errorId}`
    : descriptionId

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Adjust Concurrency')}
      description={t('Adjusting concurrency does not change the user group.')}
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button type='button' variant='outline' onClick={handleCancel}>
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            onClick={() => void handleConfirm()}
            disabled={loading}
          >
            {loading ? t('Processing...') : t('Confirm')}
          </Button>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit} className='space-y-4'>
        <div className='bg-muted/40 space-y-2 rounded-lg border p-3 text-sm'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <span className='font-medium'>{user.username}</span>
            <GroupBadge group={user.group} className='font-normal' />
          </div>
          <div className='text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs'>
            <span>{t('Concurrency Limit')}</span>
            <span className='text-foreground font-medium tabular-nums'>
              {effectiveSummary.value} · {effectiveSummary.source}
            </span>
          </div>
        </div>

        <div className='space-y-2'>
          <Label htmlFor={inputId}>{t('Max concurrency')}</Label>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              id={inputId}
              type='number'
              min={0}
              max={MAX_CONCURRENCY_LIMIT}
              step={1}
              value={inputValue}
              disabled={loading}
              aria-invalid={validationError !== null}
              aria-describedby={describedBy}
              className='min-w-[140px] flex-1'
              onChange={(event) => {
                setInputValue(event.target.value)
                if (validationError !== null) {
                  setValidationError(null)
                }
              }}
            />
            <Button
              type='button'
              variant='secondary'
              size='sm'
              disabled={loading || isFollowingPolicy}
              onClick={handleFollowPolicy}
            >
              {t('Follow group / default')}
            </Button>
          </div>
          <p id={descriptionId} className='text-muted-foreground text-xs'>
            {t(
              'Maximum simultaneous in-flight model requests; 0 follows group or global concurrency settings'
            )}
          </p>
          {validationError ? (
            <p id={errorId} role='alert' className='text-destructive text-xs'>
              {t(validationError)}
            </p>
          ) : null}
        </div>
      </form>
    </Dialog>
  )
}
