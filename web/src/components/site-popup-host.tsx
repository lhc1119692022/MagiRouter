import { AlertTriangle, Bell, Info } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Markdown } from '@/components/ui/markdown'
import { useStatus } from '@/hooks/use-status'
import {
  getSitePopupFingerprint,
  markSitePopupAcknowledged,
  parseSitePopups,
  shouldShowSitePopup,
  type SitePopupItem,
  type SitePopupTone,
  type SitePopupTrigger,
} from '@/lib/site-popups'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

function PopupToneIcon({ tone }: { tone: SitePopupTone }) {
  if (tone === 'warning') {
    return (
      <span className='inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400'>
        <AlertTriangle className='size-4' />
      </span>
    )
  }
  if (tone === 'notice') {
    return (
      <span className='bg-primary/10 text-primary inline-flex size-8 shrink-0 items-center justify-center rounded-lg'>
        <Bell className='size-4' />
      </span>
    )
  }
  return (
    <span className='inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/12 text-sky-600 dark:text-sky-400'>
      <Info className='size-4' />
    </span>
  )
}

export function SitePopupDialog({
  popup,
  open,
  onConfirm,
  onDismiss,
}: {
  popup: SitePopupItem
  open: boolean
  onConfirm: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const checkboxId = useId()
  const [agreed, setAgreed] = useState(false)
  const requireConfirm = Boolean(popup.require_confirm)
  const needsCheckbox = Boolean(popup.checkbox_label)
  const confirmDisabled = needsCheckbox && !agreed

  return (
    <Dialog
      open={open}
      disablePointerDismissal={requireConfirm}
      showCloseButton={!requireConfirm}
      onOpenChange={(nextOpen) => {
        if (nextOpen) return
        if (requireConfirm) return
        onDismiss()
      }}
      contentClassName='sm:max-w-xl'
      title={
        <span className='flex items-center gap-2.5'>
          <PopupToneIcon tone={popup.tone} />
          <span>{popup.title}</span>
        </span>
      }
      footer={
        <div className='flex w-full items-center justify-end gap-2'>
          <Button
            type='button'
            disabled={confirmDisabled}
            onClick={onConfirm}
            className={cn(
              popup.tone === 'warning' &&
                'bg-amber-600 text-white hover:bg-amber-700'
            )}
          >
            {popup.confirm_text || t('I understand')}
          </Button>
        </div>
      }
    >
      <div className='grid gap-4'>
        <div className='text-foreground/90 max-h-[58vh] overflow-y-auto pr-1 text-sm [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5'>
          <Markdown>{popup.content}</Markdown>
        </div>
        {needsCheckbox && (
          <label
            htmlFor={checkboxId}
            className='bg-muted/40 flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm leading-snug select-none'
          >
            <Checkbox
              id={checkboxId}
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(Boolean(checked))}
              className='mt-0.5'
            />
            <span>{popup.checkbox_label}</span>
          </label>
        )}
      </div>
    </Dialog>
  )
}

export function SitePopupHost({
  trigger,
  suppressed = false,
}: {
  trigger: SitePopupTrigger
  suppressed?: boolean
}) {
  const { status } = useStatus()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([])

  const scope = trigger === 'console' ? `user:${userId ?? 'guest'}` : 'anon'

  const popups = useMemo(
    () =>
      parseSitePopups(status?.site_popups ?? status?.data?.site_popups).filter(
        (item) => item.enabled && item.trigger === trigger
      ),
    [status?.data?.site_popups, status?.site_popups, trigger]
  )

  const activePopup = useMemo(() => {
    if (suppressed) return null
    for (const popup of popups) {
      const key = `${popup.id}:${getSitePopupFingerprint(popup)}`
      if (dismissedKeys.includes(key)) continue
      if (shouldShowSitePopup(popup, scope)) {
        return popup
      }
    }
    return null
  }, [dismissedKeys, popups, scope, suppressed])

  if (!activePopup) return null

  const activeKey = `${activePopup.id}:${getSitePopupFingerprint(activePopup)}`
  const closeCurrent = () => {
    markSitePopupAcknowledged(activePopup, scope)
    setDismissedKeys((prev) =>
      prev.includes(activeKey) ? prev : [...prev, activeKey]
    )
  }

  return (
    <SitePopupDialog
      key={activeKey}
      popup={activePopup}
      open
      onConfirm={closeCurrent}
      onDismiss={closeCurrent}
    />
  )
}
