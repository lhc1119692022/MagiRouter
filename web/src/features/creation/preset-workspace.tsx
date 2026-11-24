import { skipToken, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { Playground } from '@/features/playground'
import { getUserModels } from '@/features/playground/api'
import { useAuthStore } from '@/stores/auth-store'

import {
  getCreationPresetsErrorMessage,
  getPresetGroups,
  useCreationModels,
  useCreationPresets,
} from './presets'

export function PresetWorkspace(props: { id: string; group?: string }) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user?.id)
  const published = useCreationPresets()
  const preset = published.data?.find((item) => item.id === props.id)
  const models = useCreationModels(!!preset)
  const groups = preset ? getPresetGroups(preset, models) : []
  const group = props.group
    ? groups.find((name) => name === props.group)
    : groups[0]
  const permitted = useQuery({
    queryKey: ['playground-models', user, group],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: group ? () => getUserModels(group) : skipToken,
  })
  if (
    published.isLoading ||
    models.loading ||
    permitted.isLoading ||
    (group && !permitted.isFetchedAfterMount && permitted.isFetching)
  ) {
    return <p role='status'>{t('Loading')}</p>
  }
  if (
    published.isError ||
    models.error ||
    !preset ||
    permitted.isError ||
    !group ||
    !permitted.data?.some((model) => model.value === preset.model)
  ) {
    let reason = t('This model is not available for this preset.')
    if (!preset) reason = t('This preset is no longer published.')
    if (models.error || permitted.isError) reason = t('Failed to load models')
    if (published.isError) {
      reason = t(getCreationPresetsErrorMessage(published.error))
    }
    return (
      <ErrorState
        title={reason}
        action={<Link to='/create'>{t('AI Creation Center')}</Link>}
      />
    )
  }
  return (
    <Playground
      key={JSON.stringify([preset, group])}
      initialMode={preset.mode}
      initialModel={preset.model}
      initialGroup={group}
      preset={preset}
    />
  )
}
