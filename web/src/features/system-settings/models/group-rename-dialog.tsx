import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getServerMessage } from '@/lib/server-error-message'

import type { GroupRenameImpact } from '../types'

type GroupRenameDialogProps = {
  open: boolean
  groupName: string | null
  existingGroupNames: readonly string[]
  hasUnsavedChanges?: boolean
  onOpenChange: (open: boolean) => void
  onPreview: (oldName: string, newName: string) => Promise<GroupRenameImpact>
  onConfirm: (oldName: string, newName: string) => Promise<GroupRenameImpact>
}

export function GroupRenameDialog(props: GroupRenameDialogProps) {
  const { t } = useTranslation()
  const [newName, setNewName] = useState('')
  const [preview, setPreview] = useState<GroupRenameImpact | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)

  const oldName = props.groupName ?? ''
  const trimmed = newName.trim()

  useEffect(() => {
    if (props.open) {
      setNewName('')
      setPreview(null)
      setErrorMessage(null)
      setIsPreviewing(false)
      setIsConfirming(false)
    }
  }, [props.open, props.groupName])

  const validateClient = (candidate: string): string | null => {
    if (!candidate) return t('Group name cannot be empty')
    if (candidate === oldName) {
      return t('New group name must be different from the current name')
    }
    const lower = candidate.toLowerCase()
    if (lower === 'default' || lower === 'auto' || lower === 'all') {
      return t('Reserved group name cannot be renamed')
    }
    if ([...candidate].length > 64) {
      return t('Group name must be 64 characters or fewer')
    }
    if (candidate.includes(',') || candidate.includes('::')) {
      return t("Group name cannot contain commas or '::'")
    }
    if (props.existingGroupNames.includes(candidate)) {
      return t('Target group name already exists')
    }
    return null
  }

  const previewMatchesCurrent =
    preview !== null &&
    preview.old_name === oldName &&
    preview.new_name === trimmed

  const isBusy = isPreviewing || isConfirming

  const handlePreview = async () => {
    if (!oldName || props.hasUnsavedChanges) return
    const clientError = validateClient(trimmed)
    if (clientError) {
      setErrorMessage(clientError)
      setPreview(null)
      return
    }
    setErrorMessage(null)
    setIsPreviewing(true)
    try {
      const impact = await props.onPreview(oldName, trimmed)
      setPreview(impact)
    } catch (error) {
      setPreview(null)
      setErrorMessage(
        getServerMessage(error) || t('Failed to update setting')
      )
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleConfirm = async () => {
    if (!oldName || props.hasUnsavedChanges || !previewMatchesCurrent) return
    setErrorMessage(null)
    setIsConfirming(true)
    try {
      await props.onConfirm(oldName, trimmed)
      props.onOpenChange(false)
    } catch (error) {
      setErrorMessage(
        getServerMessage(error) || t('Failed to update setting')
      )
    } finally {
      setIsConfirming(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (previewMatchesCurrent) {
      void handleConfirm()
    } else {
      void handlePreview()
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!isBusy) props.onOpenChange(open)
      }}
      title={t('Rename group')}
      description={t(
        'Atomically renames this group across channels, routing abilities, users, tokens, subscriptions, model group pricing, and related settings.'
      )}
      footer={
        <div className='flex items-center justify-end gap-2'>
          <Button
            type='button'
            variant='outline'
            disabled={isBusy}
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          {!previewMatchesCurrent ? (
            <Button
              type='submit'
              form='group-rename-form'
              disabled={isBusy || !trimmed || Boolean(props.hasUnsavedChanges)}
            >
              {isPreviewing ? t('Checking...') : t('Preview impact')}
            </Button>
          ) : (
            <Button
              type='submit'
              form='group-rename-form'
              disabled={isBusy || Boolean(props.hasUnsavedChanges)}
            >
              {isConfirming ? t('Renaming...') : t('Confirm rename')}
            </Button>
          )}
        </div>
      }
    >
      <form
        id='group-rename-form'
        className='space-y-4'
        onSubmit={handleSubmit}
      >
        {props.hasUnsavedChanges ? (
          <Alert variant='destructive'>
            <AlertTriangle className='h-4 w-4' />
            <AlertDescription>
              {t(
                'Save or discard unsaved group changes before renaming a group.'
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className='space-y-1.5'>
          <Label>{t('Current group name')}</Label>
          <div className='bg-muted/40 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-mono'>
            <span>{oldName}</span>
            {trimmed ? (
              <>
                <ArrowRight className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
                <span className='font-semibold'>{trimmed}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className='space-y-1.5'>
          <Label htmlFor='group-rename-input'>{t('New group name')}</Label>
          <Input
            id='group-rename-input'
            aria-label={t('New group name')}
            placeholder={t('Enter new group name')}
            value={newName}
            disabled={isBusy || Boolean(props.hasUnsavedChanges)}
            onChange={(event) => {
              setNewName(event.target.value)
              setPreview(null)
              setErrorMessage(null)
            }}
          />
        </div>

        {errorMessage ? (
          <Alert variant='destructive'>
            <AlertTriangle className='h-4 w-4' />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        {previewMatchesCurrent && preview ? (
          <div className='bg-muted/30 space-y-2.5 rounded-lg border p-3 text-xs'>
            <div className='flex items-center justify-between gap-2'>
              <span className='font-medium'>{t('Impact preview')}</span>
              <Badge variant='secondary'>
                {preview.old_name} → {preview.new_name}
              </Badge>
            </div>
            <dl className='grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3'>
              <div className='flex items-center justify-between gap-2'>
                <dt className='text-muted-foreground'>{t('Affected channels')}</dt>
                <dd className='font-mono font-medium tabular-nums'>
                  {preview.channels}
                </dd>
              </div>
              <div className='flex items-center justify-between gap-2'>
                <dt className='text-muted-foreground'>{t('Affected users')}</dt>
                <dd className='font-mono font-medium tabular-nums'>
                  {preview.users}
                </dd>
              </div>
              <div className='flex items-center justify-between gap-2'>
                <dt className='text-muted-foreground'>{t('Affected tokens')}</dt>
                <dd className='font-mono font-medium tabular-nums'>
                  {preview.tokens}
                </dd>
              </div>
              <div className='flex items-center justify-between gap-2'>
                <dt className='text-muted-foreground'>
                  {t('Affected subscriptions')}
                </dt>
                <dd className='font-mono font-medium tabular-nums'>
                  {preview.subscriptions}
                </dd>
              </div>
              <div className='flex items-center justify-between gap-2'>
                <dt className='text-muted-foreground'>
                  {t('Model group prices')}
                </dt>
                <dd className='font-mono font-medium tabular-nums'>
                  {preview.model_group_prices}
                </dd>
              </div>
              <div className='flex items-center justify-between gap-2'>
                <dt className='text-muted-foreground'>
                  {t('Updated settings')}
                </dt>
                <dd className='font-mono font-medium tabular-nums'>
                  {preview.updated_options.length}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </form>
    </Dialog>
  )
}
