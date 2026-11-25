import { Link } from '@tanstack/react-router'
import { ExternalLink, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useApiInfo } from '@/features/dashboard/hooks/use-status-data'
import {
  buildDocsModelFamilies,
  buildModelDocArticle,
  buildStaticDocs,
  type DocsArticle,
} from '@/features/docs/data/docs-data'
import {
  DOCS_CONFIG_OPTION_KEY,
  DOCS_STATIC_GROUPS,
  isValidDocsArticleId,
  normalizeDocsApiEntries,
  parseDocsConfig,
  renderSectionsToMarkdown,
  resolveDocsExampleModels,
  serializeDocsConfig,
  type DocsArticleOverride,
  type DocsConfig,
  type DocsConfigMethod,
  type DocsConfigModality,
  type DocsEndpointConfig,
  type DocsExampleModels,
  type DocsModelOverride,
  type DocsStaticGroupName,
} from '@/features/docs/lib/docs-config'
import { resolveBaseUrl } from '@/features/magirouter-home/lib/snippets'
import { usePricingData } from '@/features/pricing/hooks'
import { useStatus } from '@/hooks/use-status'

import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const EXAMPLE_MODEL_FIELDS: Array<{
  key: keyof DocsExampleModels
  labelKey: string
}> = [
  { key: 'openai', labelKey: 'OpenAI / Default Example Model' },
  { key: 'anthropic', labelKey: 'Anthropic Example Model' },
  { key: 'gemini', labelKey: 'Gemini Example Model' },
  { key: 'image', labelKey: 'Image Example Model' },
  { key: 'video', labelKey: 'Video Example Model' },
  { key: 'audio', labelKey: 'Audio Example Model' },
]

type ArticleDraft = {
  isCustom: boolean
  isNew: boolean
  id: string
  group: DocsStaticGroupName
  title: string
  summary: string
  orderText: string
  hidden: boolean
  urlLabel: string
  urlValue: string
  endpointsText: string
  markdown: string
  curl: string
  python: string
  node: string
  json: string
  responseTitle: string
  responseJson: string
}

type ModelOverrideDraft = {
  isNew: boolean
  modelId: string
  familyName: string
  cap: '' | DocsConfigModality
  hidden: boolean
  summary: string
  endpointPath: string
  endpointsText: string
  markdown: string
  curl: string
  python: string
  node: string
  json: string
  responseTitle: string
  responseJson: string
}

function formatEndpointsText(endpoints?: DocsEndpointConfig[]): string {
  if (!endpoints || endpoints.length === 0) return ''
  return endpoints.map((item) => `${item.method} ${item.path}`).join('\n')
}

function parseEndpointsText(raw: string): {
  endpoints?: DocsEndpointConfig[]
  error?: string
} {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return {}
  if (lines.length > 12) {
    return { error: 'Specify at most 12 endpoints.' }
  }
  const parsed: DocsEndpointConfig[] = []
  for (const line of lines) {
    const match = line.match(/^(POST|GET|DELETE)\s+(\/\S+)$/i)
    if (!match) {
      return {
        error: 'Each endpoint line must look like "POST /v1/chat/completions".',
      }
    }
    parsed.push({
      method: match[1].toUpperCase() as DocsConfigMethod,
      path: match[2],
    })
  }
  return { endpoints: parsed }
}

function buildSnippetsPayload(draft: {
  curl: string
  python: string
  node: string
  json: string
}) {
  const snippets = {
    ...(draft.curl.trim() ? { curl: draft.curl.trim() } : {}),
    ...(draft.python.trim() ? { python: draft.python.trim() } : {}),
    ...(draft.node.trim() ? { node: draft.node.trim() } : {}),
    ...(draft.json.trim() ? { json: draft.json.trim() } : {}),
  }
  return Object.keys(snippets).length > 0 ? snippets : undefined
}

function hasArticleOverrideContent(override: DocsArticleOverride): boolean {
  return Boolean(
    override.group ||
    override.title ||
    override.summary ||
    override.hidden ||
    override.order !== undefined ||
    override.url_label ||
    override.url_value ||
    (override.endpoints && override.endpoints.length > 0) ||
    override.markdown ||
    override.snippets ||
    override.response_title ||
    override.response_json
  )
}

function createArticleDraft(
  builtIn: DocsArticle | undefined,
  override: DocsArticleOverride | undefined
): ArticleDraft {
  const isCustom = !builtIn
  const group =
    override?.group ??
    (builtIn && builtIn.group !== 'API 概览' ? builtIn.group : '快速开始')
  return {
    isCustom,
    isNew: !builtIn && !override,
    id: override?.id ?? builtIn?.id ?? '',
    group,
    title: override?.title ?? '',
    summary: override?.summary ?? '',
    orderText: override?.order !== undefined ? String(override.order) : '',
    hidden: Boolean(override?.hidden),
    urlLabel: override?.url_label ?? '',
    urlValue: override?.url_value ?? '',
    endpointsText: formatEndpointsText(override?.endpoints),
    markdown: override?.markdown ?? '',
    curl: override?.snippets?.curl ?? '',
    python: override?.snippets?.python ?? '',
    node: override?.snippets?.node ?? '',
    json: override?.snippets?.json ?? '',
    responseTitle: override?.response_title ?? '',
    responseJson: override?.response_json ?? '',
  }
}

function createModelOverrideDraft(
  modelId: string,
  override: DocsModelOverride | undefined
): ModelOverrideDraft {
  return {
    isNew: !override,
    modelId: override?.model_id ?? modelId,
    familyName: override?.family_name ?? '',
    cap: override?.cap ?? '',
    hidden: Boolean(override?.hidden),
    summary: override?.summary ?? '',
    endpointPath: override?.endpoint_path ?? '',
    endpointsText: formatEndpointsText(override?.endpoints),
    markdown: override?.markdown ?? '',
    curl: override?.snippets?.curl ?? '',
    python: override?.snippets?.python ?? '',
    node: override?.snippets?.node ?? '',
    json: override?.snippets?.json ?? '',
    responseTitle: override?.response_title ?? '',
    responseJson: override?.response_json ?? '',
  }
}

export function DocsCenterSection({ value }: { value: string }) {
  const { t } = useTranslation()
  const initialConfig = useMemo(() => parseDocsConfig(value), [value])
  return (
    <SettingsSection title={t('Docs Center')}>
      <DocsCenterEditor key={value} initialConfig={initialConfig} />
    </SettingsSection>
  )
}

function DocsCenterEditor({ initialConfig }: { initialConfig: DocsConfig }) {
  const { t } = useTranslation()
  const save = useUpdateOption()
  const catalog = usePricingData()
  const { status } = useStatus()
  const apiInfo = useApiInfo()
  const modelDatalistId = useId()
  const fieldIdPrefix = useId()

  const [config, setConfig] = useState<DocsConfig>(initialConfig)
  const [savedSerialized, setSavedSerialized] = useState(() =>
    serializeDocsConfig(initialConfig)
  )
  const [articleDraft, setArticleDraft] = useState<ArticleDraft | null>(null)
  const [articleError, setArticleError] = useState('')
  const [modelDraft, setModelDraft] = useState<ModelOverrideDraft | null>(null)
  const [modelError, setModelError] = useState('')
  const [newModelId, setNewModelId] = useState('')

  const baseUrl = resolveBaseUrl(status?.server_address)
  const apiEntries = useMemo(
    () =>
      normalizeDocsApiEntries(apiInfo.enabled ? apiInfo.items : [], baseUrl),
    [apiInfo.enabled, apiInfo.items, baseUrl]
  )
  const autoExampleModels = useMemo(
    () => resolveDocsExampleModels(catalog.models),
    [catalog.models]
  )
  const activeExampleModels = useMemo(
    () => resolveDocsExampleModels(catalog.models, config.example_models),
    [catalog.models, config.example_models]
  )
  const builtInArticles = useMemo(
    () =>
      buildStaticDocs(baseUrl, {
        apiEntries,
        exampleModels: activeExampleModels,
      }),
    [activeExampleModels, apiEntries, baseUrl]
  )
  const builtInArticleMap = useMemo(
    () => new Map(builtInArticles.map((article) => [article.id, article])),
    [builtInArticles]
  )
  const articleOverrideMap = useMemo(
    () => new Map((config.articles ?? []).map((item) => [item.id, item])),
    [config.articles]
  )
  const modelOverrideMap = useMemo(
    () =>
      new Map(
        (config.model_overrides ?? []).map((item) => [item.model_id, item])
      ),
    [config.model_overrides]
  )
  const modelNames = useMemo(
    () =>
      [...new Set(catalog.models.map((item) => item.model_name))].sort((a, b) =>
        a.localeCompare(b, 'en', { numeric: true })
      ),
    [catalog.models]
  )
  const liveModelMap = useMemo(
    () => new Map(catalog.models.map((item) => [item.model_name, item])),
    [catalog.models]
  )

  const currentSerialized = useMemo(() => serializeDocsConfig(config), [config])
  const isDirty = currentSerialized !== savedSerialized
  const hasAnyCustomConfig = currentSerialized !== '{}'

  const handleSave = () => {
    if (!isDirty || save.isPending) return
    save.mutate(
      { key: DOCS_CONFIG_OPTION_KEY, value: currentSerialized },
      { onSuccess: () => setSavedSerialized(currentSerialized) }
    )
  }

  const updateExampleModel = (key: keyof DocsExampleModels, value: string) => {
    setConfig((prev) => ({
      ...prev,
      example_models: {
        ...prev.example_models,
        [key]: value,
      },
    }))
  }

  const upsertArticleOverride = (next: DocsArticleOverride) => {
    setConfig((prev) => {
      const existing = prev.articles ?? []
      const filtered = existing.filter((item) => item.id !== next.id)
      const shouldKeep =
        !builtInArticleMap.has(next.id) || hasArticleOverrideContent(next)
      return {
        ...prev,
        articles: shouldKeep ? [...filtered, next] : filtered,
      }
    })
  }

  const removeArticleOverride = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      articles: (prev.articles ?? []).filter((item) => item.id !== id),
    }))
  }

  const toggleBuiltInHidden = (articleId: string, visible: boolean) => {
    const existing = articleOverrideMap.get(articleId)
    const next: DocsArticleOverride = {
      ...(existing ?? { id: articleId }),
      hidden: visible ? undefined : true,
    }
    upsertArticleOverride(next)
  }

  const handleApplyArticleDraft = () => {
    if (!articleDraft) return
    const id = articleDraft.id.trim()
    if (!isValidDocsArticleId(id)) {
      setArticleError(
        t(
          'Article ID must start with a letter or digit and use only letters, digits, ".", "_", or "-".'
        )
      )
      return
    }
    if (articleDraft.isNew) {
      if (builtInArticleMap.has(id) || articleOverrideMap.has(id)) {
        setArticleError(t('An article with this ID already exists.'))
        return
      }
    }
    if (articleDraft.isCustom && !articleDraft.title.trim()) {
      setArticleError(t('Title is required for custom articles.'))
      return
    }
    let order: number | undefined
    if (articleDraft.orderText.trim()) {
      const parsedOrder = Number(articleDraft.orderText.trim())
      if (
        !Number.isInteger(parsedOrder) ||
        parsedOrder < -1000 ||
        parsedOrder > 10000
      ) {
        setArticleError(t('Order must be an integer between -1000 and 10000.'))
        return
      }
      order = parsedOrder
    }
    const urlValue = articleDraft.urlValue.trim()
    const lowerUrl = urlValue.toLowerCase()
    if (
      lowerUrl.startsWith('javascript:') ||
      lowerUrl.startsWith('data:') ||
      lowerUrl.startsWith('vbscript:')
    ) {
      setArticleError(t('URL value uses an unsupported protocol.'))
      return
    }
    const parsedEndpoints = parseEndpointsText(articleDraft.endpointsText)
    if (parsedEndpoints.error) {
      setArticleError(t(parsedEndpoints.error))
      return
    }

    const builtIn = builtInArticleMap.get(id)
    const next: DocsArticleOverride = {
      id,
      group:
        articleDraft.isCustom || articleDraft.group !== builtIn?.group
          ? articleDraft.group
          : undefined,
      title: articleDraft.title.trim() || undefined,
      summary: articleDraft.summary.trim() || undefined,
      hidden: articleDraft.hidden ? true : undefined,
      order,
      url_label: articleDraft.urlLabel.trim() || undefined,
      url_value: urlValue || undefined,
      endpoints: parsedEndpoints.endpoints,
      markdown: articleDraft.markdown.trim() || undefined,
      snippets: buildSnippetsPayload(articleDraft),
      response_title: articleDraft.responseTitle.trim() || undefined,
      response_json: articleDraft.responseJson.trim() || undefined,
    }
    upsertArticleOverride(next)
    setArticleDraft(null)
    setArticleError('')
  }

  const handleOpenModelOverrideEditor = (targetModelId: string) => {
    const trimmed = targetModelId.trim()
    if (!trimmed) return
    setModelError('')
    setModelDraft(
      createModelOverrideDraft(trimmed, modelOverrideMap.get(trimmed))
    )
    setNewModelId('')
  }

  const handleApplyModelDraft = () => {
    if (!modelDraft) return
    const modelId = modelDraft.modelId.trim()
    if (!modelId) {
      setModelError(t('Model ID is required.'))
      return
    }
    if (modelDraft.isNew && modelOverrideMap.has(modelId)) {
      setModelError(t('An override for this model already exists.'))
      return
    }
    const endpointPath = modelDraft.endpointPath.trim()
    if (
      endpointPath &&
      (!endpointPath.startsWith('/') || /\s/.test(endpointPath))
    ) {
      setModelError(
        t('Endpoint path must start with "/" and contain no spaces.')
      )
      return
    }
    const parsedEndpoints = parseEndpointsText(modelDraft.endpointsText)
    if (parsedEndpoints.error) {
      setModelError(t(parsedEndpoints.error))
      return
    }
    const next: DocsModelOverride = {
      model_id: modelId,
      family_name: modelDraft.familyName.trim() || undefined,
      cap: modelDraft.cap || undefined,
      hidden: modelDraft.hidden ? true : undefined,
      summary: modelDraft.summary.trim() || undefined,
      endpoint_path: endpointPath || undefined,
      endpoints: parsedEndpoints.endpoints,
      markdown: modelDraft.markdown.trim() || undefined,
      snippets: buildSnippetsPayload(modelDraft),
      response_title: modelDraft.responseTitle.trim() || undefined,
      response_json: modelDraft.responseJson.trim() || undefined,
    }
    setConfig((prev) => ({
      ...prev,
      model_overrides: [
        ...(prev.model_overrides ?? []).filter(
          (item) => item.model_id !== modelId
        ),
        next,
      ],
    }))
    setModelDraft(null)
    setModelError('')
  }

  const removeModelOverride = (modelId: string) => {
    setConfig((prev) => ({
      ...prev,
      model_overrides: (prev.model_overrides ?? []).filter(
        (item) => item.model_id !== modelId
      ),
    }))
  }

  const loadDefaultModelMarkdown = (modelId: string) => {
    const liveModel = liveModelMap.get(modelId)
    const families = buildDocsModelFamilies(
      liveModel
        ? [liveModel]
        : [{ model_name: modelId } as (typeof catalog.models)[number]]
    )
    const family = families[0] ?? {
      name: '其他 系列',
      cap: 'text' as const,
      vendor: 'MagiRouter',
      models: [modelId],
    }
    const generated = buildModelDocArticle(
      modelId,
      baseUrl,
      family,
      liveModel,
      {
        recommendedEntry: apiEntries[1],
      }
    )
    return renderSectionsToMarkdown(generated.sections)
  }

  const customArticles = (config.articles ?? []).filter(
    (item) => !builtInArticleMap.has(item.id)
  )

  return (
    <>
      <SettingsPageFormActions
        isSaving={save.isPending}
        isSaveDisabled={!isDirty || save.isPending}
        onSave={handleSave}
      />

      <datalist id={modelDatalistId}>
        {modelNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className='bg-muted/30 grid gap-3 rounded-xl border p-4 text-sm'>
        <p className='text-muted-foreground leading-relaxed'>
          {t(
            'Manage the built-in Docs Center (/docs). Entry domains automatically sync with API Addresses, and the API Overview catalog stays live with your online models.'
          )}
        </p>
        <div className='flex flex-wrap items-center gap-2'>
          <a
            href='/docs'
            target='_blank'
            rel='noreferrer'
            className='text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline'
          >
            <span>{t('Open Docs Center')}</span>
            <ExternalLink className='size-3.5' />
          </a>
          <span className='text-muted-foreground text-xs'>·</span>
          <Link
            to='/system-settings/content/$section'
            params={{ section: 'api-info' }}
            className='text-primary text-xs font-medium hover:underline'
          >
            {t('Configure API Addresses')}
          </Link>
          <span className='text-muted-foreground text-xs'>·</span>
          <Link
            to='/system-settings/site/$section'
            params={{ section: 'general' }}
            className='text-primary text-xs font-medium hover:underline'
          >
            {t('External Documentation Link')}
          </Link>
          {hasAnyCustomConfig && (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='ml-auto h-7 text-xs'
              onClick={() => setConfig({})}
            >
              <RotateCcw className='mr-1 size-3.5' />
              {t('Reset all to defaults')}
            </Button>
          )}
        </div>
      </div>

      {isDirty && (
        <p className='text-xs font-medium text-amber-600 dark:text-amber-400'>
          {t('You have unsaved changes. Click Save to publish them to /docs.')}
        </p>
      )}

      <Tabs defaultValue='models' className='grid gap-4'>
        <TabsList>
          <TabsTrigger value='models'>{t('Example Models')}</TabsTrigger>
          <TabsTrigger value='articles'>
            {t('Guide Articles')}
            {(config.articles?.length ?? 0) > 0
              ? ` (${config.articles?.length})`
              : ''}
          </TabsTrigger>
          <TabsTrigger value='overrides'>
            {t('Model Overrides')}
            {(config.model_overrides?.length ?? 0) > 0
              ? ` (${config.model_overrides?.length})`
              : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value='models' className='grid gap-4'>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t(
              'Used in Quickstart and protocol code snippets. Leave any field empty to automatically pick the latest online model from your live catalog.'
            )}
          </p>
          <div className='grid gap-4 sm:grid-cols-2'>
            {EXAMPLE_MODEL_FIELDS.map((field) => (
              <Field key={field.key}>
                <FieldLabel htmlFor={`${fieldIdPrefix}-example-${field.key}`}>
                  {t(field.labelKey)}
                </FieldLabel>
                <Input
                  id={`${fieldIdPrefix}-example-${field.key}`}
                  list={modelDatalistId}
                  value={config.example_models?.[field.key] ?? ''}
                  onChange={(event) =>
                    updateExampleModel(field.key, event.target.value)
                  }
                  placeholder={t('Auto: {{model}}', {
                    model: autoExampleModels[field.key],
                  })}
                />
              </Field>
            ))}
          </div>
        </TabsContent>

        <TabsContent value='articles' className='grid gap-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Edit built-in guide chapters in Markdown, hide unused sections, or add custom pages. Placeholders {{BASE_URL}}, {{V1_URL}}, and {{MODEL}} are supported.'
              )}
            </p>
            <Button
              type='button'
              size='sm'
              onClick={() => {
                setArticleError('')
                setArticleDraft(createArticleDraft(undefined, undefined))
              }}
            >
              <Plus className='mr-1 size-4' />
              {t('Add Custom Article')}
            </Button>
          </div>

          <div className='grid gap-4'>
            {DOCS_STATIC_GROUPS.map((group) => {
              const groupBuiltIns = builtInArticles.filter(
                (article) =>
                  (articleOverrideMap.get(article.id)?.group ??
                    article.group) === group
              )
              const groupCustoms = customArticles.filter(
                (article) => article.group === group
              )
              if (groupBuiltIns.length === 0 && groupCustoms.length === 0) {
                return null
              }
              return (
                <div key={group} className='grid gap-2 rounded-xl border p-3'>
                  <div className='text-xs font-semibold tracking-wide'>
                    {group}
                  </div>
                  <div className='grid gap-2'>
                    {groupBuiltIns.map((article) => {
                      const override = articleOverrideMap.get(article.id)
                      const isHidden = Boolean(override?.hidden)
                      const isCustomized = Boolean(override)
                      let statusLabel = t('Default')
                      let statusVariant: 'outline' | 'secondary' = 'outline'
                      if (isHidden) {
                        statusLabel = t('Hidden')
                      } else if (isCustomized) {
                        statusLabel = t('Customized')
                        statusVariant = 'secondary'
                      }
                      return (
                        <div
                          key={article.id}
                          className='bg-background flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2'
                        >
                          <div className='min-w-0'>
                            <div className='flex flex-wrap items-center gap-2'>
                              <span className='truncate text-sm font-medium'>
                                {override?.title || article.title}
                              </span>
                              <code className='text-muted-foreground text-xs'>
                                {article.id}
                              </code>
                              <Badge variant={statusVariant}>
                                {statusLabel}
                              </Badge>
                            </div>
                          </div>
                          <div className='flex items-center gap-2'>
                            <Switch
                              checked={!isHidden}
                              aria-label={t('Toggle visibility for {{title}}', {
                                title: override?.title || article.title,
                              })}
                              onCheckedChange={(checked) =>
                                toggleBuiltInHidden(article.id, checked)
                              }
                            />
                            <Button
                              type='button'
                              variant='outline'
                              size='sm'
                              onClick={() => {
                                setArticleError('')
                                setArticleDraft(
                                  createArticleDraft(article, override)
                                )
                              }}
                            >
                              <Pencil className='mr-1 size-3.5' />
                              {t('Edit')}
                            </Button>
                            {isCustomized && (
                              <Button
                                type='button'
                                variant='ghost'
                                size='sm'
                                onClick={() =>
                                  removeArticleOverride(article.id)
                                }
                              >
                                <RotateCcw className='size-3.5' />
                                <span className='sr-only'>{t('Reset')}</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {groupCustoms.map((article) => (
                      <div
                        key={article.id}
                        className='bg-background flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2'
                      >
                        <div className='min-w-0'>
                          <div className='flex flex-wrap items-center gap-2'>
                            <span className='truncate text-sm font-medium'>
                              {article.title || article.id}
                            </span>
                            <code className='text-muted-foreground text-xs'>
                              {article.id}
                            </code>
                            <Badge>{t('Custom')}</Badge>
                            {article.hidden && (
                              <Badge variant='outline'>{t('Hidden')}</Badge>
                            )}
                          </div>
                        </div>
                        <div className='flex items-center gap-2'>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => {
                              setArticleError('')
                              setArticleDraft(
                                createArticleDraft(undefined, article)
                              )
                            }}
                          >
                            <Pencil className='mr-1 size-3.5' />
                            {t('Edit')}
                          </Button>
                          <Button
                            type='button'
                            variant='ghost'
                            size='sm'
                            onClick={() => removeArticleOverride(article.id)}
                          >
                            <Trash2 className='text-destructive size-3.5' />
                            <span className='sr-only'>{t('Delete')}</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value='overrides' className='grid gap-4'>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t(
              'Online models automatically appear in API Overview. Add an override here only when a model needs custom parameters, dedicated code snippets, custom grouping, or should be hidden from docs.'
            )}
          </p>
          <div className='flex flex-wrap gap-2'>
            <Input
              list={modelDatalistId}
              value={newModelId}
              onChange={(event) => setNewModelId(event.target.value)}
              placeholder={t('Select or enter a model ID')}
              className='max-w-sm flex-1'
            />
            <Button
              type='button'
              size='sm'
              disabled={!newModelId.trim()}
              onClick={() => handleOpenModelOverrideEditor(newModelId)}
            >
              <Plus className='mr-1 size-4' />
              {t('Add Model Override')}
            </Button>
          </div>

          {(config.model_overrides?.length ?? 0) === 0 ? (
            <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm'>
              {t(
                'No model overrides configured yet. All online models currently use auto-generated documentation.'
              )}
            </div>
          ) : (
            <div className='grid gap-2'>
              {(config.model_overrides ?? []).map((override) => (
                <div
                  key={override.model_id}
                  className='bg-background flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2'
                >
                  <div className='flex flex-wrap items-center gap-2'>
                    <code className='text-sm font-medium'>
                      {override.model_id}
                    </code>
                    {override.hidden && (
                      <Badge variant='outline'>{t('Hidden')}</Badge>
                    )}
                    {override.cap && (
                      <Badge variant='secondary'>{override.cap}</Badge>
                    )}
                    {override.family_name && (
                      <Badge variant='secondary'>{override.family_name}</Badge>
                    )}
                    {override.markdown && (
                      <Badge variant='outline'>{t('Markdown')}</Badge>
                    )}
                    {override.snippets && (
                      <Badge variant='outline'>{t('Snippets')}</Badge>
                    )}
                  </div>
                  <div className='flex items-center gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        handleOpenModelOverrideEditor(override.model_id)
                      }
                    >
                      <Pencil className='mr-1 size-3.5' />
                      {t('Edit')}
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => removeModelOverride(override.model_id)}
                    >
                      <Trash2 className='text-destructive size-3.5' />
                      <span className='sr-only'>{t('Delete')}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(articleDraft)}
        onOpenChange={(open) => {
          if (!open) {
            setArticleDraft(null)
            setArticleError('')
          }
        }}
        title={
          articleDraft?.isNew
            ? t('Add Custom Article')
            : t('Edit Guide Article')
        }
        description={t(
          'Leave fields blank on built-in articles to keep default content. Remember to click Save on the settings page to publish.'
        )}
        contentClassName='max-w-3xl max-h-[85vh] overflow-y-auto'
        footer={
          <div className='flex w-full items-center justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setArticleDraft(null)
                setArticleError('')
              }}
            >
              {t('Cancel')}
            </Button>
            <Button type='button' onClick={handleApplyArticleDraft}>
              {t('Apply')}
            </Button>
          </div>
        }
      >
        {articleDraft && (
          <div className='grid gap-4'>
            {articleError && (
              <p className='text-destructive text-xs font-medium'>
                {articleError}
              </p>
            )}
            <div className='grid gap-3 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor={`${fieldIdPrefix}-article-id`}>
                  {t('Article ID')}
                </FieldLabel>
                <Input
                  id={`${fieldIdPrefix}-article-id`}
                  value={articleDraft.id}
                  disabled={!articleDraft.isNew}
                  onChange={(event) =>
                    setArticleDraft((prev) =>
                      prev ? { ...prev, id: event.target.value } : prev
                    )
                  }
                  placeholder='custom-guide'
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldIdPrefix}-article-group`}>
                  {t('Section Group')}
                </FieldLabel>
                <NativeSelect
                  id={`${fieldIdPrefix}-article-group`}
                  value={articleDraft.group}
                  onChange={(event) =>
                    setArticleDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            group: event.target.value as DocsStaticGroupName,
                          }
                        : prev
                    )
                  }
                >
                  {DOCS_STATIC_GROUPS.map((group) => (
                    <NativeSelectOption key={group} value={group}>
                      {group}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldIdPrefix}-article-title`}>
                  {t('Title')}
                </FieldLabel>
                <Input
                  id={`${fieldIdPrefix}-article-title`}
                  value={articleDraft.title}
                  onChange={(event) =>
                    setArticleDraft((prev) =>
                      prev ? { ...prev, title: event.target.value } : prev
                    )
                  }
                  placeholder={
                    builtInArticleMap.get(articleDraft.id)?.title ??
                    t('Article title')
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldIdPrefix}-article-order`}>
                  {t('Sort Order')}
                </FieldLabel>
                <Input
                  id={`${fieldIdPrefix}-article-order`}
                  value={articleDraft.orderText}
                  onChange={(event) =>
                    setArticleDraft((prev) =>
                      prev ? { ...prev, orderText: event.target.value } : prev
                    )
                  }
                  placeholder={t('Optional integer (smaller comes first)')}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor={`${fieldIdPrefix}-article-summary`}>
                {t('Summary')}
              </FieldLabel>
              <Textarea
                id={`${fieldIdPrefix}-article-summary`}
                rows={2}
                value={articleDraft.summary}
                onChange={(event) =>
                  setArticleDraft((prev) =>
                    prev ? { ...prev, summary: event.target.value } : prev
                  )
                }
                placeholder={
                  builtInArticleMap.get(articleDraft.id)?.summary ??
                  t('Short summary shown beneath the page title')
                }
              />
            </Field>

            <Field>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <FieldLabel htmlFor={`${fieldIdPrefix}-article-markdown`}>
                  {t('Markdown Body')}
                </FieldLabel>
                {!articleDraft.isCustom &&
                  builtInArticleMap.get(articleDraft.id) && (
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      className='h-7 text-xs'
                      onClick={() => {
                        const builtIn = builtInArticleMap.get(articleDraft.id)
                        if (!builtIn) return
                        setArticleDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                markdown: renderSectionsToMarkdown(
                                  builtIn.sections
                                ),
                              }
                            : prev
                        )
                      }}
                    >
                      {t('Load default body')}
                    </Button>
                  )}
              </div>
              <Textarea
                id={`${fieldIdPrefix}-article-markdown`}
                rows={10}
                className='font-mono text-xs'
                value={articleDraft.markdown}
                onChange={(event) =>
                  setArticleDraft((prev) =>
                    prev ? { ...prev, markdown: event.target.value } : prev
                  )
                }
                placeholder={t(
                  'Use ## Heading for sections (auto-indexed in table of contents). Supports {{BASE_URL}}, {{V1_URL}}, and {{MODEL}}.'
                )}
              />
            </Field>

            <details className='rounded-lg border p-3'>
              <summary className='cursor-pointer text-xs font-semibold'>
                {t('Endpoints & Code Snippets (Optional)')}
              </summary>
              <div className='mt-3 grid gap-3'>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <Field>
                    <FieldLabel htmlFor={`${fieldIdPrefix}-article-url-label`}>
                      {t('URL Label')}
                    </FieldLabel>
                    <Input
                      id={`${fieldIdPrefix}-article-url-label`}
                      value={articleDraft.urlLabel}
                      onChange={(event) =>
                        setArticleDraft((prev) =>
                          prev
                            ? { ...prev, urlLabel: event.target.value }
                            : prev
                        )
                      }
                      placeholder='Base URL'
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${fieldIdPrefix}-article-url-value`}>
                      {t('URL Value')}
                    </FieldLabel>
                    <Input
                      id={`${fieldIdPrefix}-article-url-value`}
                      value={articleDraft.urlValue}
                      onChange={(event) =>
                        setArticleDraft((prev) =>
                          prev
                            ? { ...prev, urlValue: event.target.value }
                            : prev
                        )
                      }
                      placeholder='{{V1_URL}}'
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor={`${fieldIdPrefix}-article-endpoints`}>
                    {t('Endpoints')}
                  </FieldLabel>
                  <Textarea
                    id={`${fieldIdPrefix}-article-endpoints`}
                    rows={3}
                    className='font-mono text-xs'
                    value={articleDraft.endpointsText}
                    onChange={(event) =>
                      setArticleDraft((prev) =>
                        prev
                          ? { ...prev, endpointsText: event.target.value }
                          : prev
                      )
                    }
                    placeholder='POST /v1/chat/completions'
                  />
                  <FieldDescription>
                    {t('One endpoint per line, e.g. POST /v1/responses')}
                  </FieldDescription>
                </Field>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <Field>
                    <FieldLabel htmlFor={`${fieldIdPrefix}-article-curl`}>
                      cURL
                    </FieldLabel>
                    <Textarea
                      id={`${fieldIdPrefix}-article-curl`}
                      rows={4}
                      className='font-mono text-xs'
                      value={articleDraft.curl}
                      onChange={(event) =>
                        setArticleDraft((prev) =>
                          prev ? { ...prev, curl: event.target.value } : prev
                        )
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${fieldIdPrefix}-article-python`}>
                      Python
                    </FieldLabel>
                    <Textarea
                      id={`${fieldIdPrefix}-article-python`}
                      rows={4}
                      className='font-mono text-xs'
                      value={articleDraft.python}
                      onChange={(event) =>
                        setArticleDraft((prev) =>
                          prev ? { ...prev, python: event.target.value } : prev
                        )
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${fieldIdPrefix}-article-node`}>
                      Node.js
                    </FieldLabel>
                    <Textarea
                      id={`${fieldIdPrefix}-article-node`}
                      rows={4}
                      className='font-mono text-xs'
                      value={articleDraft.node}
                      onChange={(event) =>
                        setArticleDraft((prev) =>
                          prev ? { ...prev, node: event.target.value } : prev
                        )
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${fieldIdPrefix}-article-json`}>
                      JSON
                    </FieldLabel>
                    <Textarea
                      id={`${fieldIdPrefix}-article-json`}
                      rows={4}
                      className='font-mono text-xs'
                      value={articleDraft.json}
                      onChange={(event) =>
                        setArticleDraft((prev) =>
                          prev ? { ...prev, json: event.target.value } : prev
                        )
                      }
                    />
                  </Field>
                </div>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <Field>
                    <FieldLabel
                      htmlFor={`${fieldIdPrefix}-article-response-title`}
                    >
                      {t('Response Title')}
                    </FieldLabel>
                    <Input
                      id={`${fieldIdPrefix}-article-response-title`}
                      value={articleDraft.responseTitle}
                      onChange={(event) =>
                        setArticleDraft((prev) =>
                          prev
                            ? { ...prev, responseTitle: event.target.value }
                            : prev
                        )
                      }
                      placeholder='Response · 200 OK'
                    />
                  </Field>
                  <Field>
                    <FieldLabel
                      htmlFor={`${fieldIdPrefix}-article-response-json`}
                    >
                      {t('Response JSON')}
                    </FieldLabel>
                    <Textarea
                      id={`${fieldIdPrefix}-article-response-json`}
                      rows={3}
                      className='font-mono text-xs'
                      value={articleDraft.responseJson}
                      onChange={(event) =>
                        setArticleDraft((prev) =>
                          prev
                            ? { ...prev, responseJson: event.target.value }
                            : prev
                        )
                      }
                    />
                  </Field>
                </div>
              </div>
            </details>
          </div>
        )}
      </Dialog>

      <Dialog
        open={Boolean(modelDraft)}
        onOpenChange={(open) => {
          if (!open) {
            setModelDraft(null)
            setModelError('')
          }
        }}
        title={
          modelDraft?.isNew ? t('Add Model Override') : t('Edit Model Override')
        }
        description={t(
          'Customize documentation for a specific model ID. Leave fields blank to keep auto-generated defaults.'
        )}
        contentClassName='max-w-3xl max-h-[85vh] overflow-y-auto'
        footer={
          <div className='flex w-full items-center justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                setModelDraft(null)
                setModelError('')
              }}
            >
              {t('Cancel')}
            </Button>
            <Button type='button' onClick={handleApplyModelDraft}>
              {t('Apply')}
            </Button>
          </div>
        }
      >
        {modelDraft && (
          <div className='grid gap-4'>
            {modelError && (
              <p className='text-destructive text-xs font-medium'>
                {modelError}
              </p>
            )}
            <div className='grid gap-3 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor={`${fieldIdPrefix}-model-id`}>
                  {t('Model ID')}
                </FieldLabel>
                <Input
                  id={`${fieldIdPrefix}-model-id`}
                  list={modelDatalistId}
                  value={modelDraft.modelId}
                  disabled={!modelDraft.isNew}
                  onChange={(event) =>
                    setModelDraft((prev) =>
                      prev ? { ...prev, modelId: event.target.value } : prev
                    )
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldIdPrefix}-model-cap`}>
                  {t('Modality Override')}
                </FieldLabel>
                <NativeSelect
                  id={`${fieldIdPrefix}-model-cap`}
                  value={modelDraft.cap}
                  onChange={(event) =>
                    setModelDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            cap: event.target.value as '' | DocsConfigModality,
                          }
                        : prev
                    )
                  }
                >
                  <NativeSelectOption value=''>
                    {t('Auto-detect')}
                  </NativeSelectOption>
                  <NativeSelectOption value='text'>
                    {t('Language Models')}
                  </NativeSelectOption>
                  <NativeSelectOption value='image'>
                    {t('Image Generation')}
                  </NativeSelectOption>
                  <NativeSelectOption value='video'>
                    {t('Video Generation')}
                  </NativeSelectOption>
                  <NativeSelectOption value='audio'>
                    {t('Audio')}
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldIdPrefix}-model-family`}>
                  {t('Model Family Name')}
                </FieldLabel>
                <Input
                  id={`${fieldIdPrefix}-model-family`}
                  value={modelDraft.familyName}
                  onChange={(event) =>
                    setModelDraft((prev) =>
                      prev ? { ...prev, familyName: event.target.value } : prev
                    )
                  }
                  placeholder={t('Optional custom sidebar family')}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldIdPrefix}-model-endpoint`}>
                  {t('Endpoint Path')}
                </FieldLabel>
                <Input
                  id={`${fieldIdPrefix}-model-endpoint`}
                  value={modelDraft.endpointPath}
                  onChange={(event) =>
                    setModelDraft((prev) =>
                      prev
                        ? { ...prev, endpointPath: event.target.value }
                        : prev
                    )
                  }
                  placeholder='/v1/chat/completions'
                />
              </Field>
            </div>

            <div className='flex items-center justify-between rounded-lg border px-3 py-2'>
              <div>
                <div className='text-sm font-medium'>
                  {t('Hide this model in Docs')}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {t(
                    'Removes the model from API Overview sidebar without disabling API access.'
                  )}
                </div>
              </div>
              <Switch
                checked={modelDraft.hidden}
                onCheckedChange={(checked) =>
                  setModelDraft((prev) =>
                    prev ? { ...prev, hidden: checked } : prev
                  )
                }
              />
            </div>

            <Field>
              <FieldLabel htmlFor={`${fieldIdPrefix}-model-summary`}>
                {t('Summary')}
              </FieldLabel>
              <Textarea
                id={`${fieldIdPrefix}-model-summary`}
                rows={2}
                value={modelDraft.summary}
                onChange={(event) =>
                  setModelDraft((prev) =>
                    prev ? { ...prev, summary: event.target.value } : prev
                  )
                }
                placeholder={t(
                  'Optional summary override (defaults to Model Management description)'
                )}
              />
            </Field>

            <Field>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <FieldLabel htmlFor={`${fieldIdPrefix}-model-markdown`}>
                  {t('Markdown Body')}
                </FieldLabel>
                {modelDraft.modelId.trim() && (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='h-7 text-xs'
                    onClick={() =>
                      setModelDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              markdown: loadDefaultModelMarkdown(
                                prev.modelId.trim()
                              ),
                            }
                          : prev
                      )
                    }
                  >
                    {t('Load default template')}
                  </Button>
                )}
              </div>
              <Textarea
                id={`${fieldIdPrefix}-model-markdown`}
                rows={8}
                className='font-mono text-xs'
                value={modelDraft.markdown}
                onChange={(event) =>
                  setModelDraft((prev) =>
                    prev ? { ...prev, markdown: event.target.value } : prev
                  )
                }
                placeholder={t(
                  'Write custom parameter tables or usage notes in Markdown. Supports {{BASE_URL}}, {{V1_URL}}, and {{MODEL}}.'
                )}
              />
            </Field>

            <details className='rounded-lg border p-3'>
              <summary className='cursor-pointer text-xs font-semibold'>
                {t('Endpoints & Code Snippets (Optional)')}
              </summary>
              <div className='mt-3 grid gap-3'>
                <Field>
                  <FieldLabel htmlFor={`${fieldIdPrefix}-model-endpoints`}>
                    {t('Endpoints')}
                  </FieldLabel>
                  <Textarea
                    id={`${fieldIdPrefix}-model-endpoints`}
                    rows={2}
                    className='font-mono text-xs'
                    value={modelDraft.endpointsText}
                    onChange={(event) =>
                      setModelDraft((prev) =>
                        prev
                          ? { ...prev, endpointsText: event.target.value }
                          : prev
                      )
                    }
                    placeholder='POST /v1/videos'
                  />
                </Field>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <Field>
                    <FieldLabel htmlFor={`${fieldIdPrefix}-model-curl`}>
                      cURL
                    </FieldLabel>
                    <Textarea
                      id={`${fieldIdPrefix}-model-curl`}
                      rows={4}
                      className='font-mono text-xs'
                      value={modelDraft.curl}
                      onChange={(event) =>
                        setModelDraft((prev) =>
                          prev ? { ...prev, curl: event.target.value } : prev
                        )
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${fieldIdPrefix}-model-python`}>
                      Python
                    </FieldLabel>
                    <Textarea
                      id={`${fieldIdPrefix}-model-python`}
                      rows={4}
                      className='font-mono text-xs'
                      value={modelDraft.python}
                      onChange={(event) =>
                        setModelDraft((prev) =>
                          prev ? { ...prev, python: event.target.value } : prev
                        )
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${fieldIdPrefix}-model-node`}>
                      Node.js
                    </FieldLabel>
                    <Textarea
                      id={`${fieldIdPrefix}-model-node`}
                      rows={4}
                      className='font-mono text-xs'
                      value={modelDraft.node}
                      onChange={(event) =>
                        setModelDraft((prev) =>
                          prev ? { ...prev, node: event.target.value } : prev
                        )
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${fieldIdPrefix}-model-json`}>
                      JSON
                    </FieldLabel>
                    <Textarea
                      id={`${fieldIdPrefix}-model-json`}
                      rows={4}
                      className='font-mono text-xs'
                      value={modelDraft.json}
                      onChange={(event) =>
                        setModelDraft((prev) =>
                          prev ? { ...prev, json: event.target.value } : prev
                        )
                      }
                    />
                  </Field>
                </div>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <Field>
                    <FieldLabel
                      htmlFor={`${fieldIdPrefix}-model-response-title`}
                    >
                      {t('Response Title')}
                    </FieldLabel>
                    <Input
                      id={`${fieldIdPrefix}-model-response-title`}
                      value={modelDraft.responseTitle}
                      onChange={(event) =>
                        setModelDraft((prev) =>
                          prev
                            ? { ...prev, responseTitle: event.target.value }
                            : prev
                        )
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel
                      htmlFor={`${fieldIdPrefix}-model-response-json`}
                    >
                      {t('Response JSON')}
                    </FieldLabel>
                    <Textarea
                      id={`${fieldIdPrefix}-model-response-json`}
                      rows={3}
                      className='font-mono text-xs'
                      value={modelDraft.responseJson}
                      onChange={(event) =>
                        setModelDraft((prev) =>
                          prev
                            ? { ...prev, responseJson: event.target.value }
                            : prev
                        )
                      }
                    />
                  </Field>
                </div>
              </div>
            </details>
          </div>
        )}
      </Dialog>
    </>
  )
}
