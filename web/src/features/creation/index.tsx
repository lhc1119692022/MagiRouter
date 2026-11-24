import { Link } from '@tanstack/react-router'
import { ArrowRight, Layers, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { BrandFooter } from '@/features/magirouter-home/components/brand-footer'

import {
  getCreationPresetsErrorMessage,
  getPresetGroups,
  mediaLabels,
  useCreationModels,
  useCreationPresets,
  type CreationPreset,
  type StudioMode,
} from './presets'
import { SceneArt } from './scene-art'

import './creation.css'

function PresetCard(props: {
  preset: CreationPreset
  models: ReturnType<typeof useCreationModels>
}) {
  const { t } = useTranslation()
  const preset = props.preset
  const group = getPresetGroups(preset, props.models)[0]
  let unavailable = t('This model is not available for this preset.')
  if (props.models.loading) unavailable = t('Loading')
  if (props.models.error) unavailable = t('Failed to load models')
  return (
    <article className='creation-card'>
      <div className='creation-card-art'>
        <SceneArt scene={preset} />
        <span>{t(mediaLabels[preset.mode])}</span>
      </div>
      <div className='creation-card-copy'>
        <h3 title={preset.title}>{preset.title}</h3>
        {preset.description && (
          <p className='el-body-sm'>{preset.description}</p>
        )}
        {!!preset.tags?.length && (
          <ul className='flex flex-wrap gap-1' aria-label={t('Tags')}>
            {preset.tags.map((tag) => (
              <li key={tag} className='max-w-full'>
                <Badge
                  variant='outline'
                  className='max-w-full break-all whitespace-normal'
                >
                  {tag}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <footer>
          <span className='max-w-full truncate font-mono' title={preset.model}>
            {preset.model}
          </span>
          {!props.models.error && group ? (
            <Link
              className='el-btn el-btn-sm el-btn-white'
              to='/playground'
              search={{ preset: preset.id, group }}
              aria-label={`${t('Try in Playground')}: ${preset.title}`}
            >
              {t('Try in Playground')}{' '}
              <ArrowRight size={13} aria-hidden='true' />
            </Link>
          ) : (
            <span>{unavailable}</span>
          )}
        </footer>
      </div>
    </article>
  )
}

export function CreationCenter() {
  const { t } = useTranslation()
  const published = useCreationPresets()
  const presets = published.data ?? []
  const models = useCreationModels(!!presets.length)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<StudioMode | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const search = query.trim().toLowerCase()
  const matching = presets.filter(
    (item) =>
      (!mode || item.mode === mode) &&
      [
        item.title,
        item.description,
        item.model,
        item.category,
        item.prompt,
        ...(item.tags ?? []),
      ].some((value) => value?.toLowerCase().includes(search))
  )
  const categories = [...new Set(presets.map((item) => item.category || ''))]
  const filtered = matching.filter(
    (item) => category === null || (item.category || '') === category
  )
  const groups = [...new Set(filtered.map((item) => item.category || ''))]
  const featured = filtered.filter((item) => item.featured)
  const modes: StudioMode[] = presets.some((item) => item.mode === 'chat')
    ? ['chat', 'image', 'video', 'audio']
    : ['image', 'video', 'audio']
  const ready = published.isSuccess
  const resetFilters = () => {
    setQuery('')
    setMode(null)
    setCategory(null)
  }
  return (
    <>
      <main className='creation-page el-section-md'>
        <div className='el-container'>
          <header className='creation-hero'>
            <div>
              <h1 className='el-h2'>{t('AI Creation Center')}</h1>
              <p className='el-body-sm'>
                {t('Choose a published preset to open it in Playground.')}
              </p>
            </div>
          </header>
          <div className='creation-controls'>
            <InputGroup className='creation-search'>
              <InputGroupAddon aria-hidden='true'>
                <Search size={16} />
              </InputGroupAddon>
              <InputGroupInput
                type='search'
                aria-label={t('Search scenes')}
                placeholder={t('Search scenes')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </InputGroup>
            <div className='creation-pills' role='group' aria-label={t('Mode')}>
              <Button
                variant='ghost'
                aria-pressed={mode === null}
                onClick={() => setMode(null)}
              >
                {t('All')}
              </Button>
              {modes.map((value) => (
                <Button
                  variant='ghost'
                  key={value}
                  aria-pressed={mode === value}
                  disabled={!presets.length}
                  onClick={() => setMode(value)}
                >
                  {t(mediaLabels[value])}
                </Button>
              ))}
            </div>
          </div>
          <div
            className='creation-pills creation-categories'
            role='group'
            aria-label={t('All categories')}
          >
            <Button
              variant='ghost'
              aria-pressed={category === null}
              onClick={() => setCategory(null)}
            >
              {t('All categories')}
              {ready && <span>{matching.length}</span>}
            </Button>
            {categories.map((value) => (
              <Button
                variant='ghost'
                key={value}
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >
                {value || t('Scene presets')}
                <span>
                  {
                    matching.filter((item) => (item.category || '') === value)
                      .length
                  }
                </span>
              </Button>
            ))}
          </div>
          <section aria-label={t('Featured inspiration')}>
            <h2 className='creation-heading'>{t('Featured inspiration')}</h2>
            {featured.length > 0 ? (
              <div className='creation-grid creation-featured'>
                {featured.map((item) => (
                  <PresetCard key={item.id} preset={item} models={models} />
                ))}
              </div>
            ) : (
              <div className='creation-featured-note'>
                <Layers size={18} aria-hidden='true' />
                <p>{t('Featured presets appear here.')}</p>
              </div>
            )}
          </section>
          <section aria-label={t('Scene presets')}>
            {(!ready ||
              !groups.length ||
              (groups.length === 1 && !groups[0])) && (
              <h2 className='creation-heading'>{t('Scene presets')}</h2>
            )}
            {published.isLoading && (
              <p className='creation-state' role='status'>
                {t('Loading')}
              </p>
            )}
            {published.isError && (
              <div className='creation-state'>
                <p>{t(getCreationPresetsErrorMessage(published.error))}</p>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => void published.refetch()}
                >
                  {t('Retry')}
                </Button>
              </div>
            )}
            {ready && !presets.length && (
              <EmptyState
                className='creation-state'
                icon={Layers}
                title={t('No creation presets have been published.')}
              />
            )}
            {ready && presets.length > 0 && !groups.length && (
              <EmptyState
                className='creation-state'
                icon={Search}
                title={t('No results found')}
                action={
                  <Button variant='outline' size='sm' onClick={resetFilters}>
                    {t('Clear filters')}
                  </Button>
                }
              />
            )}
            {groups.map((group) => (
              <div key={group} className='creation-category-group'>
                {(group || groups.length > 1) && (
                  <h2 className='creation-heading'>
                    {group || t('Scene presets')}
                  </h2>
                )}
                <div className='creation-grid'>
                  {filtered
                    .filter((item) => (item.category || '') === group)
                    .map((item) => (
                      <PresetCard key={item.id} preset={item} models={models} />
                    ))}
                </div>
              </div>
            ))}
          </section>
        </div>
      </main>
      <BrandFooter />
    </>
  )
}
