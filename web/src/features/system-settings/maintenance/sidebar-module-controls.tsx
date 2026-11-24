import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { buildConsoleNavigation } from '@/components/layout/config/console-navigation'
import {
  CHAT_PRESETS_MODULE,
  sidebarModuleForRoute,
  type SidebarModuleRef,
} from '@/components/layout/config/sidebar-modules'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { parseHeaderNavModulesFromStatus } from '@/lib/nav-modules'

import {
  SettingsControlGroup,
  SettingsSwitchField,
} from '../components/settings-form-layout'
import type { SidebarModulesAdminConfig } from './config'

type SidebarModuleControlsProps = {
  role: number
  site: SidebarModulesAdminConfig | null
  value: SidebarModulesAdminConfig
  disabled?: boolean
  onChange: (section: string, module: string, checked: boolean) => void
  onReset?: (visible: SidebarModuleRef[]) => void
}

type EntryControl = {
  ref: SidebarModuleRef
  title: string
  detail?: string
  headerOff?: boolean
}

export function SidebarModuleControls(props: SidebarModuleControlsProps) {
  const { t } = useTranslation()
  const id = useId()
  const { status } = useStatus()
  const header = parseHeaderNavModulesFromStatus(
    status as Record<string, unknown> | null
  )
  const groups = buildConsoleNavigation(t, props.role).flatMap((group) => {
    const entries: EntryControl[] = group.items
      .flatMap((entry): EntryControl[] => {
        if (entry.hidden || entry.disabled) return []
        if (entry.type === 'chat-presets') {
          return [{ ref: CHAT_PRESETS_MODULE, title: entry.title }]
        }
        if (!entry.url) return []
        const headerOff =
          (entry.sidebarKey === 'docs' && !header.docs) ||
          (entry.sidebarKey === 'models' && !header.pricing.enabled)
        return (entry.configUrls ?? [entry.url]).flatMap((route) => {
          if (!route) return []
          const ref = sidebarModuleForRoute(route)
          if (!ref) return []
          const title =
            route === '/usage-logs/drawing'
              ? t('Task Logs · Drawing')
              : entry.title
          let detail: string = route
          if (route === '/playground') {
            detail = props.site
              ? t('Show this shortcut in your console and model catalog.')
              : t(
                  'Hiding the Chat area hides this card. Turning off this switch also closes the workspace site-wide.'
                )
          }
          return [{ ref, title, detail, headerOff }]
        })
      })
      .filter(
        ({ ref: [section, module], headerOff }) =>
          !props.site ||
          (!headerOff &&
            props.site[section]?.enabled &&
            props.site[section][module])
      )
    return entries.length
      ? [
          {
            id: group.id ?? group.title,
            title: group.title || t('Sidebar entries'),
            entries,
          },
        ]
      : []
  })
  const visibleEntries = groups.flatMap((group) => group.entries)
  const gates = [
    ['console', t('Console area')],
    ['personal', t('Personal area')],
    ['admin', t('Admin area')],
    ['chat', t('Chat area')],
  ].filter(([section]) =>
    visibleEntries.some((entry) => entry.ref[0] === section)
  )
  return (
    <div className='grid min-w-0 gap-4' data-settings-form-span='full'>
      <p className='text-muted-foreground text-sm'>
        {t('These switches control sidebar entries, not account permissions.')}
      </p>
      {groups.map((group) => (
        <SettingsControlGroup
          role='group'
          aria-label={group.title}
          key={group.id}
          className='bg-card space-y-0 px-4 py-3'
        >
          <h3 className='text-sm font-semibold'>{group.title}</h3>
          <div className='grid min-w-0 gap-x-6 md:grid-cols-2'>
            {group.entries.map(
              ({ ref: [section, module], title, detail, headerOff }) => (
                <SettingsSwitchField
                  key={`${section}.${module}`}
                  controlId={`${id}-${section}-${module}`}
                  label={title}
                  description={
                    headerOff ? t('Unavailable in the top navigation') : detail
                  }
                  checked={props.value[section]?.[module] !== false}
                  disabled={
                    props.disabled ||
                    (props.value[section]?.enabled === false &&
                      (props.site !== null ||
                        section !== 'chat' ||
                        module !== 'playground'))
                  }
                  onCheckedChange={(checked) =>
                    props.onChange(section, module, checked)
                  }
                />
              )
            )}
          </div>
        </SettingsControlGroup>
      ))}
      {gates.length > 0 && (
        <SettingsControlGroup
          role='group'
          aria-label={t('Visibility groups')}
          className='space-y-0 px-4 py-3'
        >
          <h3 className='text-sm font-semibold'>{t('Visibility groups')}</h3>
          <div className='grid gap-x-6 md:grid-cols-2'>
            {gates.map(([section, title]) => (
              <SettingsSwitchField
                key={section}
                controlId={`${id}-${section}`}
                label={title}
                description={visibleEntries
                  .filter((entry) => entry.ref[0] === section)
                  .map((entry) => entry.title)
                  .join(' · ')}
                checked={props.value[section]?.enabled !== false}
                disabled={props.disabled}
                onCheckedChange={(checked) =>
                  props.onChange(section, 'enabled', checked)
                }
              />
            ))}
          </div>
        </SettingsControlGroup>
      )}
      {props.onReset && (
        <Button
          type='button'
          variant='outline'
          className='justify-self-start'
          disabled={props.disabled}
          onClick={() =>
            props.onReset?.(visibleEntries.map((entry) => entry.ref))
          }
        >
          {t('Reset to Default')}
        </Button>
      )}
    </div>
  )
}
