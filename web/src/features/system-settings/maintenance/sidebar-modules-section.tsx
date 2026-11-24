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
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'

import { getSiteModuleEnvelope } from '../api'
import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import {
  SIDEBAR_MODULES_DEFAULT,
  parseSidebarModulesAdmin,
  serializeSidebarModulesAdmin,
  type SidebarModulesAdminConfig,
} from './config'
import { SidebarModuleControls } from './sidebar-module-controls'

type SidebarModulesSectionProps = {
  config: SidebarModulesAdminConfig
  initialSerialized: string
}

export function SidebarModulesSection(props: SidebarModulesSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const form = useForm<SidebarModulesAdminConfig>({ values: props.config })
  const save = form.handleSubmit(async (values) => {
    const serialized = serializeSidebarModulesAdmin(values)
    if (serialized === props.initialSerialized) return
    let value: string
    try {
      const { envelope } = await getSiteModuleEnvelope()
      const latest = parseSidebarModulesAdmin(JSON.stringify(envelope))
      const updated = { ...envelope }
      for (const [section, defaults] of Object.entries(
        SIDEBAR_MODULES_DEFAULT
      )) {
        const original = envelope[section]
        const merged: Record<string, unknown> = {
          ...(typeof original === 'object' && original !== null
            ? original
            : {}),
        }
        for (const key of Object.keys(defaults)) {
          merged[key] =
            values[section][key] !== props.config[section][key]
              ? values[section][key]
              : latest[section][key]
        }
        updated[section] = merged
      }
      value = JSON.stringify(updated)
    } catch (error) {
      handleServerError(error, t('Failed to update settings'))
      return
    }
    await updateOption.mutateAsync({ key: 'SidebarModulesAdmin', value })
  })
  const reset = () => {
    const next = { ...form.getValues() }
    for (const [section, defaults] of Object.entries(SIDEBAR_MODULES_DEFAULT)) {
      next[section] = { ...next[section], ...defaults }
    }
    form.reset(next)
  }
  return (
    <SettingsSection title={t('Sidebar modules')}>
      <SettingsForm onSubmit={save}>
        <SettingsPageFormActions
          onSave={save}
          onReset={reset}
          isSaving={form.formState.isSubmitting || updateOption.isPending}
          resetLabel='Reset to default'
          saveLabel='Save sidebar modules'
        />
        <SidebarModuleControls
          role={ROLE.SUPER_ADMIN}
          site={null}
          value={form.watch()}
          disabled={updateOption.isPending}
          onChange={(section, module, checked) =>
            form.setValue(`${section}.${module}`, checked, {
              shouldDirty: true,
            })
          }
        />
      </SettingsForm>
    </SettingsSection>
  )
}
