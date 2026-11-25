import {
  ArrowDown,
  ArrowUp,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { SitePopupDialog } from '@/components/site-popup-host'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  SITE_POPUP_FREQUENCIES,
  SITE_POPUP_PRESETS,
  SITE_POPUP_TONES,
  SITE_POPUP_TRIGGERS,
  SITE_POPUPS_OPTION_KEY,
  isValidSitePopupId,
  parseSitePopups,
  serializeSitePopups,
  type SitePopupFrequency,
  type SitePopupItem,
  type SitePopupTone,
  type SitePopupTrigger,
} from '@/lib/site-popups'

import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const TRIGGER_LABEL_KEYS: Record<SitePopupTrigger, string> = {
  sign_up: 'Sign-up Page',
  console: 'Console',
  sign_in: 'Sign-in Page',
  home: 'Home Page',
}

const FREQUENCY_LABEL_KEYS: Record<SitePopupFrequency, string> = {
  once: 'Once (until updated)',
  daily: 'Once per 24 hours',
  session: 'Once per session',
  always: 'Every visit',
}

const TONE_LABEL_KEYS: Record<SitePopupTone, string> = {
  info: 'Info',
  warning: 'Warning / Disclaimer',
  notice: 'Announcement',
}

type PopupDraft = {
  isNew: boolean
  id: string
  enabled: boolean
  trigger: SitePopupTrigger
  title: string
  content: string
  tone: SitePopupTone
  confirmText: string
  frequency: SitePopupFrequency
  requireConfirm: boolean
  checkboxLabel: string
  versionText: string
}

function buildUniquePopupId(baseId: string, existing: SitePopupItem[]): string {
  const used = new Set(existing.map((item) => item.id))
  if (!used.has(baseId)) return baseId
  for (let suffix = 2; suffix < 100; suffix++) {
    const candidate = `${baseId}-${suffix}`
    if (!used.has(candidate)) return candidate
  }
  return `${baseId}-${Date.now()}`
}

function createDraftFromItem(item: SitePopupItem, isNew: boolean): PopupDraft {
  return {
    isNew,
    id: item.id,
    enabled: item.enabled,
    trigger: item.trigger,
    title: item.title,
    content: item.content,
    tone: item.tone,
    confirmText: item.confirm_text ?? '',
    frequency: item.frequency,
    requireConfirm: Boolean(item.require_confirm),
    checkboxLabel: item.checkbox_label ?? '',
    versionText: String(item.version || 1),
  }
}

export function SitePopupsSection({ value }: { value: string }) {
  const { t } = useTranslation()
  const initialItems = useMemo(() => parseSitePopups(value), [value])
  return (
    <SettingsSection title={t('Site Popups')}>
      <SitePopupsEditor key={value} initialItems={initialItems} />
    </SettingsSection>
  )
}

function SitePopupsEditor({ initialItems }: { initialItems: SitePopupItem[] }) {
  const { t } = useTranslation()
  const save = useUpdateOption()
  const fieldIdPrefix = useId()

  const [items, setItems] = useState<SitePopupItem[]>(initialItems)
  const [savedSerialized, setSavedSerialized] = useState(() =>
    serializeSitePopups(initialItems)
  )
  const [draft, setDraft] = useState<PopupDraft | null>(null)
  const [draftError, setDraftError] = useState('')
  const [previewItem, setPreviewItem] = useState<SitePopupItem | null>(null)

  const currentSerialized = useMemo(() => serializeSitePopups(items), [items])
  const isDirty = currentSerialized !== savedSerialized
  const reachedLimit = items.length >= 12

  const handleSave = () => {
    if (!isDirty || save.isPending) return
    save.mutate(
      { key: SITE_POPUPS_OPTION_KEY, value: currentSerialized },
      { onSuccess: () => setSavedSerialized(currentSerialized) }
    )
  }

  const openPresetDraft = (presetKey: keyof typeof SITE_POPUP_PRESETS) => {
    const preset = SITE_POPUP_PRESETS[presetKey]
    setDraftError('')
    setDraft(
      createDraftFromItem(
        {
          ...preset,
          id: buildUniquePopupId(preset.id, items),
        },
        true
      )
    )
  }

  const openBlankDraft = () => {
    setDraftError('')
    setDraft(
      createDraftFromItem(
        {
          id: buildUniquePopupId('popup', items),
          enabled: true,
          trigger: 'sign_up',
          title: '',
          content: '',
          tone: 'info',
          frequency: 'once',
          version: 1,
        },
        true
      )
    )
  }

  const handleApplyDraft = () => {
    if (!draft) return
    const id = draft.id.trim()
    if (!isValidSitePopupId(id)) {
      setDraftError(
        t(
          'Popup ID must start with a letter or digit and use only letters, digits, ".", "_", or "-".'
        )
      )
      return
    }
    if (draft.isNew && items.some((item) => item.id === id)) {
      setDraftError(t('A popup with this ID already exists.'))
      return
    }
    if (!draft.title.trim()) {
      setDraftError(t('Popup title is required.'))
      return
    }
    if (!draft.content.trim()) {
      setDraftError(t('Popup content is required.'))
      return
    }
    const parsedVersion = Number(draft.versionText.trim() || '1')
    if (
      !Number.isInteger(parsedVersion) ||
      parsedVersion < 1 ||
      parsedVersion > 100000
    ) {
      setDraftError(t('Version must be an integer between 1 and 100000.'))
      return
    }

    const nextItem: SitePopupItem = {
      id,
      enabled: draft.enabled,
      trigger: draft.trigger,
      title: draft.title.trim(),
      content: draft.content.trim(),
      tone: draft.tone,
      ...(draft.confirmText.trim()
        ? { confirm_text: draft.confirmText.trim() }
        : {}),
      frequency: draft.frequency,
      ...(draft.requireConfirm ? { require_confirm: true } : {}),
      ...(draft.checkboxLabel.trim()
        ? { checkbox_label: draft.checkboxLabel.trim() }
        : {}),
      version: parsedVersion,
    }

    setItems((prev) =>
      draft.isNew
        ? [...prev, nextItem]
        : prev.map((item) => (item.id === id ? nextItem : item))
    )
    setDraft(null)
    setDraftError('')
  }

  const moveItem = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    setItems((prev) => {
      const copy = [...prev]
      const [moved] = copy.splice(index, 1)
      copy.splice(target, 0, moved)
      return copy
    })
  }

  const bumpVersion = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, version: Math.min((item.version || 1) + 1, 100000) }
          : item
      )
    )
  }

  return (
    <>
      <SettingsPageFormActions
        isSaving={save.isPending}
        isSaveDisabled={!isDirty || save.isPending}
        onSave={handleSave}
      />

      <div className='bg-muted/30 grid gap-3 rounded-xl border p-4 text-sm'>
        <p className='text-muted-foreground leading-relaxed'>
          {t(
            'Configure modal notices and disclaimers for key entry pages such as Sign-up and Console. Supports Markdown content, frequency limits, mandatory confirmation, and agreement checkboxes.'
          )}
        </p>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={reachedLimit}
            onClick={() => openPresetDraft('sign_up_qq')}
          >
            <Plus className='mr-1 size-3.5' />
            {t('Add Sign-up Notice Template')}
          </Button>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={reachedLimit}
            onClick={() => openPresetDraft('console_disclaimer')}
          >
            <Plus className='mr-1 size-3.5' />
            {t('Add Console Disclaimer Template')}
          </Button>
          <Button
            type='button'
            size='sm'
            disabled={reachedLimit}
            onClick={openBlankDraft}
          >
            <Plus className='mr-1 size-3.5' />
            {t('Add Popup')}
          </Button>
        </div>
      </div>

      {isDirty && (
        <p className='text-xs font-medium text-amber-600 dark:text-amber-400'>
          {t('You have unsaved changes. Click Save to publish these popups.')}
        </p>
      )}

      {items.length === 0 ? (
        <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm'>
          {t(
            'No popups configured yet. Use one of the quick templates above or add a custom popup.'
          )}
        </div>
      ) : (
        <div className='grid gap-3'>
          {items.map((item, index) => (
            <div
              key={item.id}
              className='bg-background grid gap-2 rounded-xl border p-4'
            >
              <div className='flex flex-wrap items-start justify-between gap-2'>
                <div className='min-w-0 space-y-1'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='font-medium'>{item.title}</span>
                    <code className='text-muted-foreground text-xs'>
                      {item.id}
                    </code>
                    <Badge variant='secondary'>
                      {t(TRIGGER_LABEL_KEYS[item.trigger])}
                    </Badge>
                    <Badge variant='outline'>
                      {t(FREQUENCY_LABEL_KEYS[item.frequency])}
                    </Badge>
                    {item.require_confirm && (
                      <Badge variant='outline'>{t('Mandatory')}</Badge>
                    )}
                    <Badge variant='outline'>{`v${item.version}`}</Badge>
                  </div>
                  <p className='text-muted-foreground line-clamp-2 text-xs'>
                    {item.content}
                  </p>
                </div>

                <div className='flex flex-wrap items-center gap-1.5'>
                  <Switch
                    checked={item.enabled}
                    aria-label={t('Toggle popup {{title}}', {
                      title: item.title,
                    })}
                    onCheckedChange={(checked) =>
                      setItems((prev) =>
                        prev.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, enabled: checked }
                            : entry
                        )
                      )
                    }
                  />
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => setPreviewItem(item)}
                  >
                    <Eye className='mr-1 size-3.5' />
                    {t('Preview')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      setDraftError('')
                      setDraft(createDraftFromItem(item, false))
                    }}
                  >
                    <Pencil className='mr-1 size-3.5' />
                    {t('Edit')}
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    title={t('Bump version to show again to all users')}
                    onClick={() => bumpVersion(item.id)}
                  >
                    <RefreshCw className='size-3.5' />
                    <span className='sr-only'>
                      {t('Show again to all users')}
                    </span>
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    disabled={index === 0}
                    onClick={() => moveItem(index, -1)}
                  >
                    <ArrowUp className='size-3.5' />
                    <span className='sr-only'>{t('Move up')}</span>
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    disabled={index === items.length - 1}
                    onClick={() => moveItem(index, 1)}
                  >
                    <ArrowDown className='size-3.5' />
                    <span className='sr-only'>{t('Move down')}</span>
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() =>
                      setItems((prev) =>
                        prev.filter((entry) => entry.id !== item.id)
                      )
                    }
                  >
                    <Trash2 className='text-destructive size-3.5' />
                    <span className='sr-only'>{t('Delete')}</span>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(draft)}
        onOpenChange={(open) => {
          if (!open) {
            setDraft(null)
            setDraftError('')
          }
        }}
        title={draft?.isNew ? t('Add Popup') : t('Edit Popup')}
        description={t(
          'Changing the title, content, or version automatically shows the updated popup again to users who dismissed an earlier version.'
        )}
        contentClassName='max-w-2xl max-h-[85vh] overflow-y-auto'
        footer={
          <div className='flex w-full items-center justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setDraft(null)
                setDraftError('')
              }}
            >
              {t('Cancel')}
            </Button>
            <Button type='button' onClick={handleApplyDraft}>
              {t('Apply')}
            </Button>
          </div>
        }
      >
        {draft && (
          <div className='grid gap-4'>
            {draftError && (
              <p className='text-destructive text-xs font-medium'>
                {draftError}
              </p>
            )}
            <div className='grid gap-3 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor={`${fieldIdPrefix}-id`}>
                  {t('Popup ID')}
                </FieldLabel>
                <Input
                  id={`${fieldIdPrefix}-id`}
                  value={draft.id}
                  disabled={!draft.isNew}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev ? { ...prev, id: event.target.value } : prev
                    )
                  }
                  placeholder='sign-up-qq-only'
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldIdPrefix}-trigger`}>
                  {t('Trigger Page')}
                </FieldLabel>
                <NativeSelect
                  id={`${fieldIdPrefix}-trigger`}
                  value={draft.trigger}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            trigger: event.target.value as SitePopupTrigger,
                          }
                        : prev
                    )
                  }
                >
                  {SITE_POPUP_TRIGGERS.map((trigger) => (
                    <NativeSelectOption key={trigger} value={trigger}>
                      {t(TRIGGER_LABEL_KEYS[trigger])}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldIdPrefix}-frequency`}>
                  {t('Display Frequency')}
                </FieldLabel>
                <NativeSelect
                  id={`${fieldIdPrefix}-frequency`}
                  value={draft.frequency}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            frequency: event.target.value as SitePopupFrequency,
                          }
                        : prev
                    )
                  }
                >
                  {SITE_POPUP_FREQUENCIES.map((freq) => (
                    <NativeSelectOption key={freq} value={freq}>
                      {t(FREQUENCY_LABEL_KEYS[freq])}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldIdPrefix}-tone`}>
                  {t('Visual Style')}
                </FieldLabel>
                <NativeSelect
                  id={`${fieldIdPrefix}-tone`}
                  value={draft.tone}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev
                        ? { ...prev, tone: event.target.value as SitePopupTone }
                        : prev
                    )
                  }
                >
                  {SITE_POPUP_TONES.map((tone) => (
                    <NativeSelectOption key={tone} value={tone}>
                      {t(TONE_LABEL_KEYS[tone])}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor={`${fieldIdPrefix}-title`}>
                {t('Title')}
              </FieldLabel>
              <Input
                id={`${fieldIdPrefix}-title`}
                value={draft.title}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev ? { ...prev, title: event.target.value } : prev
                  )
                }
                placeholder={t('Enter popup title')}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={`${fieldIdPrefix}-content`}>
                {t('Popup Content (Markdown)')}
              </FieldLabel>
              <Textarea
                id={`${fieldIdPrefix}-content`}
                rows={6}
                value={draft.content}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev ? { ...prev, content: event.target.value } : prev
                  )
                }
                placeholder={t(
                  'Write notice or disclaimer text (Markdown bold, lists, and links supported)'
                )}
              />
            </Field>

            <div className='grid gap-3 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor={`${fieldIdPrefix}-confirm`}>
                  {t('Confirm Button Text')}
                </FieldLabel>
                <Input
                  id={`${fieldIdPrefix}-confirm`}
                  value={draft.confirmText}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev ? { ...prev, confirmText: event.target.value } : prev
                    )
                  }
                  placeholder={t('I understand')}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldIdPrefix}-version`}>
                  {t('Popup Version')}
                </FieldLabel>
                <Input
                  id={`${fieldIdPrefix}-version`}
                  type='number'
                  min={1}
                  max={100000}
                  value={draft.versionText}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev ? { ...prev, versionText: event.target.value } : prev
                    )
                  }
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor={`${fieldIdPrefix}-checkbox`}>
                {t('Agreement Checkbox Text (Optional)')}
              </FieldLabel>
              <Input
                id={`${fieldIdPrefix}-checkbox`}
                value={draft.checkboxLabel}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev ? { ...prev, checkboxLabel: event.target.value } : prev
                  )
                }
                placeholder={t(
                  'e.g. I have read and agree to the disclaimer above'
                )}
              />
              <FieldDescription>
                {t(
                  'If set, users must check this box before clicking the confirm button.'
                )}
              </FieldDescription>
            </Field>

            <div className='flex items-center justify-between rounded-lg border px-3 py-2'>
              <div>
                <div className='text-sm font-medium'>
                  {t('Require Explicit Confirmation')}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {t(
                    'Disables closing via backdrop click, Escape key, or the close button. Recommended for disclaimers.'
                  )}
                </div>
              </div>
              <Switch
                checked={draft.requireConfirm}
                onCheckedChange={(checked) =>
                  setDraft((prev) =>
                    prev ? { ...prev, requireConfirm: checked } : prev
                  )
                }
              />
            </div>

            <div className='flex items-center justify-between rounded-lg border px-3 py-2'>
              <div className='text-sm font-medium'>{t('Enabled')}</div>
              <Switch
                checked={draft.enabled}
                onCheckedChange={(checked) =>
                  setDraft((prev) =>
                    prev ? { ...prev, enabled: checked } : prev
                  )
                }
              />
            </div>
          </div>
        )}
      </Dialog>

      {previewItem && (
        <SitePopupDialog
          key={`preview:${previewItem.id}:${previewItem.version}`}
          popup={previewItem}
          open
          onConfirm={() => setPreviewItem(null)}
          onDismiss={() => setPreviewItem(null)}
        />
      )}
    </>
  )
}
