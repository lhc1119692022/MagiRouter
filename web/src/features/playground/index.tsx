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
import { Link } from '@tanstack/react-router'
import { KeyRound, XIcon } from 'lucide-react'
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  supportsStudioTask,
  type CreationPreset,
} from '@/features/creation/presets'
import { usePricingData } from '@/features/pricing/hooks'
import { getModelPlaygroundModes } from '@/features/pricing/lib/filters'
import { getConfiguredTaskCapabilities } from '@/lib/model-task-capabilities'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { PlaygroundChat } from './components/chat/playground-chat'
import { PlaygroundChatTopbar } from './components/chat/playground-chat-topbar'
import { PlaygroundCodeDrawer } from './components/chat/playground-code-drawer'
import { PlaygroundInput } from './components/input/playground-input'
import { PlaygroundParameterContent } from './components/input/playground-parameter-panel'
import {
  MultimodalStudio,
  type MultimodalMode,
} from './components/multimodal-studio'
import {
  PlaygroundBilling,
  PlaygroundKeyGuide,
} from './components/playground-billing'
import { PlaygroundPriceQuote } from './components/playground-price-quote'
import { SavePresetAction } from './components/save-preset-action'
import { StudioDiscovery } from './components/studio-discovery'
import {
  useChatHandler,
  usePlaygroundConversation,
  usePlaygroundOptions,
  usePlaygroundState,
} from './hooks'
import { usePlaygroundKeySelection } from './hooks/use-playground-key-selection'
import { previewChatAttachments } from './lib/input/input-tool-utils'
import { resolveChatControls } from './lib/parameters/playground-parameters'
import {
  buildChatCompletionPayload,
  getChatParameterOverrides,
} from './lib/streaming/payload-builder'
import {
  buildProtocolRequestBody,
  getProtocolEndpointPath,
  getProtocolPreviewHeaders,
  resolveChatApiProtocol,
} from './lib/streaming/protocol'
import type { PlaygroundSearch } from './lib/workspace-search'
import type { MessageAttachment, ModelOption } from './types'

import './studio-document.css'

type StudioTab = 'chat' | MultimodalMode

const PlaygroundModelDetails = lazy(async () => ({
  default: (await import('./components/playground-model-details'))
    .PlaygroundModelDetails,
}))

export function Playground(props: {
  initialMode?: StudioTab
  initialModel?: string
  initialGroup?: string
  editPreset?: boolean
  preset?: CreationPreset
}) {
  const { t } = useTranslation()
  const canSavePresets = useAuthStore(
    (state) => state.auth.user?.role === ROLE.SUPER_ADMIN
  )
  const userGroup = useAuthStore((state) => state.auth.user?.group || '')
  const [selectedTab, setActiveTab] = useState<StudioTab | null>(
    props.initialMode ?? null
  )
  const [requestedModel, setRequestedModel] = useState(props.initialModel)
  const [mediaDrafts, setMediaDrafts] = useState<
    Partial<Record<MultimodalMode, string>>
  >({})
  const [mediaRunning, setMediaRunning] = useState(false)
  const [parametersOpen, setParametersOpen] = useState(false)
  const parametersId = useId()
  const parameterButton = useRef<HTMLButtonElement>(null)
  const keyTriggerRef = useRef<HTMLButtonElement>(null)
  const closeParameters = () => {
    setParametersOpen(false)
    parameterButton.current?.focus()
  }
  const focusKeyPicker = () => {
    keyTriggerRef.current?.focus()
    keyTriggerRef.current?.click()
  }
  const [detailsModel, setDetailsModel] = useState('')
  const [codeOpen, setCodeOpen] = useState(false)
  const [draftAttachments, setDraftAttachments] = useState<MessageAttachment[]>(
    []
  )
  const [draft, setDraft] = useState(
    props.preset?.mode === 'chat' ? props.preset.prompt : ''
  )

  const {
    config,
    messages,
    isLoadingMessages,
    updateMessages,
    updateConfig,
    updateParameterEnabled,
    resetParameterOverrides,
    clearMessages,
  } = usePlaygroundState(props.preset, props.initialGroup)

  const activeTab = selectedTab ?? (messages.length > 0 ? 'chat' : 'video')
  const {
    keys: billingKeys,
    id: billingKeyId,
    select: selectKey,
  } = usePlaygroundKeySelection()
  const selectedKey = billingKeys.eligible.find(
    (key) => key.id === billingKeyId
  )
  const editingPreset =
    canSavePresets && props.editPreset === true && billingKeyId === null
  const authoringGroup =
    canSavePresets && billingKeyId === null && (editingPreset || requestedModel)
      ? (props.initialGroup ?? '')
      : undefined
  const {
    scope,
    authorModels,
    groups,
    isLoadingModels,
    modelsError,
    retryModels,
  } = usePlaygroundOptions({ selectedKey, authoringGroup })
  const catalog = usePricingData()
  const catalogByName = useMemo(
    () => new Map(catalog.models.map((model) => [model.model_name, model])),
    [catalog.models]
  )
  const { executionModels, authoringModels } = useMemo(() => {
    const matchesMode = (option: ModelOption) => {
      const model = catalogByName.get(option.value)
      if (
        model &&
        (model.supported_endpoint_types?.length ||
          model.input_modalities?.length ||
          model.output_modalities?.length ||
          getConfiguredTaskCapabilities(model.tags) !== undefined)
      ) {
        return getModelPlaygroundModes(model).includes(activeTab)
      }
      return activeTab === 'chat' || option.value === requestedModel
    }
    return {
      executionModels: (scope?.models ?? []).filter(matchesMode),
      authoringModels: (authorModels ?? []).filter(matchesMode),
    }
  }, [scope, authorModels, catalogByName, activeTab, requestedModel])
  const executionModel = requestedModel
    ? executionModels.find((option) => option.value === requestedModel)
    : executionModels[0]
  const authoringModel = requestedModel
    ? authoringModels.find((option) => option.value === requestedModel)
    : authoringModels[0]
  const selectedModel = executionModel ?? authoringModel
  const selectableModels = editingPreset ? authoringModels : executionModels
  const activeModel = selectedModel?.value ?? ''
  const metadata = catalogByName.get(activeModel)
  const canGenerate = !!scope && !!executionModel && !!selectedKey
  const profile = selectedModel?.chatControls
  useEffect(() => {
    if (activeTab === 'chat' && activeModel && activeModel !== config.model) {
      updateConfig('model', activeModel)
    }
  }, [activeModel, activeTab, config.model, updateConfig])
  const selectBillingKey = (id: number | null) => {
    if (billingKeyId !== null && billingKeyId !== id) resetParameterOverrides()
    setDetailsModel('')
    setCodeOpen(false)
    selectKey(id)
  }
  const controls = useMemo(
    () =>
      resolveChatControls(
        { ...config, model: activeModel, group: scope?.group ?? '' },
        config.model === activeModel ? profile : undefined
      ),
    [config, activeModel, profile, scope?.group]
  )
  const chatReady =
    activeTab === 'chat' && canGenerate && config.model === activeModel
  const acceptsAttachments = chatReady
  const resolvedProtocol = useMemo(
    () =>
      resolveChatApiProtocol(
        controls.config.protocol,
        activeModel,
        metadata?.supported_endpoint_types
      ),
    [controls.config.protocol, activeModel, metadata?.supported_endpoint_types]
  )
  const { sendChat, stopGeneration, isGenerating } = useChatHandler({
    config: controls.config,
    billingKeyId: chatReady ? scope?.keyId : null,
    acceptsAttachments,
    protocol: resolvedProtocol,
    onMessageUpdate: updateMessages,
  })

  const {
    editingMessageKey,
    sessionAttachments,
    handleSendMessage,
    handleRegenerateMessage,
    handleEditMessage,
    handleEditOpenChange,
    applyEdit,
    handleDeleteMessage,
    clearSessionAttachments,
  } = usePlaygroundConversation({
    messages,
    updateMessages,
    sendChat,
  })

  const handleClearMessages = () => {
    setActiveTab('chat')
    handleEditOpenChange(false)
    clearSessionAttachments()
    clearMessages()
  }

  const selectModel = (value: string) => {
    if (!selectableModels.some((option) => option.value === value)) return
    setRequestedModel(value)
    if (activeTab === 'chat') updateConfig('model', value)
  }

  const requestPayload = useMemo(() => {
    const body = buildChatCompletionPayload(
      messages,
      controls.config,
      draft,
      acceptsAttachments && draftAttachments.length
        ? previewChatAttachments(draftAttachments)
        : undefined,
      sessionAttachments
    )
    delete body.group
    return buildProtocolRequestBody(resolvedProtocol, body)
  }, [
    messages,
    controls,
    draft,
    acceptsAttachments,
    draftAttachments,
    sessionAttachments,
    resolvedProtocol,
  ])
  const requestPreviewPath = useMemo(
    () =>
      getProtocolEndpointPath(
        resolvedProtocol,
        activeModel,
        controls.config.stream
      ),
    [resolvedProtocol, activeModel, controls.config.stream]
  )
  const requestPreviewHeaders = useMemo(
    () => getProtocolPreviewHeaders(resolvedProtocol),
    [resolvedProtocol]
  )

  let modelHint = executionModels.length
    ? t('Select model')
    : t('No models available')
  if (requestedModel) {
    modelHint = t('Requested model is unavailable in this group: {{model}}', {
      model: requestedModel,
    })
  }
  const studioTabs: { id: StudioTab; label: string }[] = [
    { id: 'chat', label: t('Text Chat') },
    { id: 'video', label: t('Video Generation') },
    { id: 'image', label: t('Image Generation') },
    { id: 'audio', label: t('Audio Synthesis') },
  ]

  const returnSearch: PlaygroundSearch =
    props.preset?.mode === activeTab && props.preset.model === requestedModel
      ? { preset: props.preset.id, group: props.initialGroup }
      : {
          mode: activeTab,
          model: requestedModel,
          editPreset: canSavePresets && props.editPreset ? true : undefined,
        }
  const superadminAuthoringChat =
    canSavePresets &&
    !billingKeys.loading &&
    (!isLoadingModels || !!activeModel) &&
    (editingPreset || (!!props.preset && !selectedKey))
  const showChatComposer = chatReady || superadminAuthoringChat
  const mediaKeyGuide =
    activeTab !== 'chat' &&
    !selectedKey &&
    !billingKeys.loading &&
    !billingKeys.error ? (
      <PlaygroundKeyGuide hasKeys={billingKeys.eligible.length > 0} />
    ) : null
  const mediaStatusNotice =
    activeTab !== 'chat' &&
    !isLoadingModels &&
    !catalog.isLoading &&
    scope &&
    !activeModel ? (
      <p role='status' className='pg-media-status-notice'>
        {modelHint}
      </p>
    ) : undefined
  const chatPriceQuote =
    chatReady && scope && activeModel ? (
      <PlaygroundPriceQuote
        compact
        group={scope.group}
        groups={groups}
        model={metadata}
      />
    ) : undefined
  const mediaPriceQuote =
    activeTab !== 'chat' && scope && metadata ? (
      <PlaygroundPriceQuote
        compact
        group={scope.group}
        groups={groups}
        model={metadata}
      />
    ) : undefined
  const loadingWorkspace = isLoadingMessages && !selectedTab
  const renderBilling = (actions?: ReactNode) => (
    <PlaygroundBilling
      layout={activeTab === 'chat' ? 'chat' : 'media'}
      actions={actions}
      keyTriggerRef={keyTriggerRef}
      selection={billingKeyId}
      onSelect={selectBillingKey}
      keys={billingKeys}
      disabled={isGenerating || mediaRunning}
      group={scope?.group ?? ''}
      models={selectableModels}
      editingPreset={editingPreset}
      model={metadata}
      modelId={scope || editingPreset ? activeModel : ''}
      pendingModel={scope || editingPreset ? undefined : requestedModel}
      returnSearch={returnSearch}
      onSelectModel={selectModel}
      loadingModels={isLoadingModels || catalog.isLoading}
      modelsError={modelsError}
      retryModels={() => void retryModels()}
      onDetails={() => setDetailsModel(activeModel)}
    />
  )

  const renderChatGate = () => {
    const compactClass =
      messages.length > 0 ? 'pg-chat-gate is-compact' : 'pg-chat-gate'
    if (billingKeys.loading) {
      return (
        <div className={compactClass} role='status'>
          <p className='pg-chat-gate-text'>{t('Loading')}</p>
        </div>
      )
    }
    if (billingKeys.error) {
      return (
        <div className={compactClass} role='status'>
          <span className='pg-chat-gate-icon' aria-hidden='true'>
            <KeyRound size={18} />
          </span>
          <p className='pg-chat-gate-text'>{t('Failed to load API keys')}</p>
          <div className='pg-chat-gate-actions'>
            <button
              type='button'
              className='el-btn el-btn-md el-btn-primary'
              onClick={() => void billingKeys.retry()}
            >
              {t('Retry')}
            </button>
          </div>
        </div>
      )
    }
    if (billingKeys.eligible.length === 0) {
      return (
        <div className={compactClass} role='status'>
          <span className='pg-chat-gate-icon' aria-hidden='true'>
            <KeyRound size={18} />
          </span>
          {requestedModel && (
            <div className='pg-chat-gate-badges'>
              <span className='pg-chat-gate-badge'>
                {t('Target model')} · {requestedModel}
              </span>
            </div>
          )}
          <p className='pg-chat-gate-text'>
            {t(
              'No usable API key yet. Create your first API key to start chatting.'
            )}
          </p>
          <div className='pg-chat-gate-actions'>
            <Link
              to='/keys'
              search={{ action: 'create', playground: returnSearch }}
              className='el-btn el-btn-md el-btn-primary'
            >
              {t('Create an API key')}
            </Link>
          </div>
        </div>
      )
    }
    if (billingKeyId !== null && !selectedKey) {
      return (
        <div className={compactClass} role='status'>
          <span className='pg-chat-gate-icon' aria-hidden='true'>
            <KeyRound size={18} />
          </span>
          <p className='pg-chat-gate-text'>
            {t('Selected key is unavailable')}
          </p>
          <div className='pg-chat-gate-actions'>
            <button
              type='button'
              className='el-btn el-btn-md el-btn-primary'
              onClick={focusKeyPicker}
            >
              {t('Select an API key')}
            </button>
            <Link
              to='/keys'
              search={{ action: 'create', playground: returnSearch }}
              className='el-btn el-btn-md el-btn-white'
            >
              {t('Create an API key')}
            </Link>
          </div>
        </div>
      )
    }
    if (!selectedKey) {
      return (
        <div className={compactClass} role='status'>
          <span className='pg-chat-gate-icon' aria-hidden='true'>
            <KeyRound size={18} />
          </span>
          {requestedModel && (
            <div className='pg-chat-gate-badges'>
              <span className='pg-chat-gate-badge'>
                {t('Target model')} · {requestedModel}
              </span>
            </div>
          )}
          <p className='pg-chat-gate-text'>
            {t(
              'Select an API key to load available models and start chatting.'
            )}
          </p>
          <div className='pg-chat-gate-keys'>
            {billingKeys.eligible.slice(0, 4).map((key) => {
              const keyName = key.name || `#${key.id}`
              const keyGroup = key.group || userGroup
              return (
                <button
                  key={key.id}
                  type='button'
                  className='pg-chat-gate-key-btn'
                  onClick={() => selectBillingKey(key.id)}
                >
                  <span className='pg-key-option-name'>{keyName}</span>
                  {keyGroup && (
                    <span className='pg-key-option-group'>{keyGroup}</span>
                  )}
                </button>
              )
            })}
          </div>
          <div className='pg-chat-gate-actions'>
            {billingKeys.eligible.length > 4 && (
              <button
                type='button'
                className='el-btn el-btn-sm el-btn-primary'
                onClick={focusKeyPicker}
              >
                {t('Select an API key')}
              </button>
            )}
            <Link to='/keys' className='el-btn el-btn-sm el-btn-white'>
              {t('Manage API keys')}
            </Link>
          </div>
        </div>
      )
    }
    if (modelsError) {
      return (
        <div className={compactClass} role='status'>
          <span className='pg-chat-gate-icon' aria-hidden='true'>
            <KeyRound size={18} />
          </span>
          <p className='pg-chat-gate-text'>{t('Failed to load models')}</p>
          <div className='pg-chat-gate-actions'>
            <button
              type='button'
              className='el-btn el-btn-md el-btn-primary'
              onClick={() => void retryModels()}
            >
              {t('Retry')}
            </button>
            <button
              type='button'
              className='el-btn el-btn-md el-btn-white'
              onClick={() => selectBillingKey(null)}
            >
              {t('Clear selection')}
            </button>
          </div>
        </div>
      )
    }
    if (!scope || isLoadingModels || catalog.isLoading) {
      return (
        <div className={compactClass} role='status'>
          <p className='pg-chat-gate-text'>{t('Loading')}</p>
        </div>
      )
    }
    if (!executionModel) {
      const selectedKeyName = selectedKey.name || `#${selectedKey.id}`
      const firstModel = executionModels[0]?.value
      return (
        <div className={compactClass} role='status'>
          <span className='pg-chat-gate-icon' aria-hidden='true'>
            <KeyRound size={18} />
          </span>
          <div className='pg-chat-gate-badges'>
            <span className='pg-chat-gate-badge'>
              {selectedKeyName} · {scope.group}
            </span>
            {requestedModel && (
              <span className='pg-chat-gate-badge'>
                {t('Target model')} · {requestedModel}
              </span>
            )}
          </div>
          {requestedModel && firstModel ? (
            <>
              <p className='pg-chat-gate-text'>
                {t('Selected key ({{key}}) does not support model {{model}}.', {
                  key: selectedKeyName,
                  model: requestedModel,
                  interpolation: { escapeValue: false },
                })}
              </p>
              <p className='pg-chat-gate-subtext'>
                {t('Requested model is unavailable in this group: {{model}}', {
                  model: requestedModel,
                  interpolation: { escapeValue: false },
                })}
              </p>
              <div className='pg-chat-gate-actions'>
                <button
                  type='button'
                  className='el-btn el-btn-md el-btn-primary'
                  onClick={() => selectModel(firstModel)}
                >
                  {t('Switch to {{model}}', {
                    model: firstModel,
                    interpolation: { escapeValue: false },
                  })}
                </button>
                {billingKeys.eligible.length > 1 && (
                  <button
                    type='button'
                    className='el-btn el-btn-md el-btn-white'
                    onClick={focusKeyPicker}
                  >
                    {t('Switch API key')}
                  </button>
                )}
                <Link
                  to='/keys'
                  search={{ action: 'create', playground: returnSearch }}
                  className='el-btn el-btn-md el-btn-white'
                >
                  {t('Create an API key')}
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className='pg-chat-gate-text'>
                {t(
                  'Selected key ({{key}}) has no available models for {{mode}}.',
                  {
                    key: selectedKeyName,
                    mode: t('Text Chat'),
                    interpolation: { escapeValue: false },
                  }
                )}
              </p>
              {requestedModel && (
                <p className='pg-chat-gate-subtext'>
                  {t(
                    'Requested model is unavailable in this group: {{model}}',
                    {
                      model: requestedModel,
                      interpolation: { escapeValue: false },
                    }
                  )}
                </p>
              )}
              <div className='pg-chat-gate-actions'>
                {billingKeys.eligible.length > 1 && (
                  <button
                    type='button'
                    className='el-btn el-btn-md el-btn-primary'
                    onClick={focusKeyPicker}
                  >
                    {t('Switch API key')}
                  </button>
                )}
                <Link
                  to='/keys'
                  search={{ action: 'create', playground: returnSearch }}
                  className={
                    billingKeys.eligible.length > 1
                      ? 'el-btn el-btn-md el-btn-white'
                      : 'el-btn el-btn-md el-btn-primary'
                  }
                >
                  {t('Create an API key')}
                </Link>
                <Link to='/pricing' className='el-btn el-btn-md el-btn-white'>
                  {t('Model Square')}
                </Link>
              </div>
            </>
          )}
        </div>
      )
    }
    return (
      <div className={compactClass} role='status'>
        <p className='pg-chat-gate-text'>{t('Loading')}</p>
      </div>
    )
  }

  return (
    <div className='console-page-inner pg-document'>
      <header className='pg-document-heading'>
        <div className='pg-document-crumb'>
          <Link to='/create'>{t('AI Creation Center')}</Link>
          <span aria-hidden='true'>/</span>
          <span lang='en'>Playground</span>
          {props.preset && (
            <span className='el-pill'>{props.preset.title}</span>
          )}
        </div>
        <div className='pg-head-row'>
          <div className='pg-title-group'>
            <h1 className='pg-title' lang='en'>
              Playground
            </h1>
          </div>
          <div className='pg-head-right'>
            <div
              className='theme-switch'
              role='group'
              aria-label={t('Mode')}
              style={{ width: 'auto', padding: '3px' }}
            >
              {studioTabs.map((tab) => {
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type='button'
                    aria-pressed={active}
                    disabled={isGenerating || mediaRunning}
                    onClick={() => {
                      if (activeTab === tab.id) return
                      setActiveTab(tab.id)
                      setParametersOpen(false)
                      setRequestedModel(undefined)
                      setDetailsModel('')
                      setCodeOpen(false)
                      setMediaRunning(false)
                    }}
                    className={
                      active
                        ? 'el-btn el-btn-xs el-btn-primary'
                        : 'el-btn el-btn-xs el-btn-ghost'
                    }
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
            <Link to='/pricing' className='el-btn el-btn-sm el-btn-white'>
              {t('Model Square')} →
            </Link>
          </div>
        </div>
      </header>

      {loadingWorkspace && <p role='status'>{t('Loading')}</p>}
      {!loadingWorkspace &&
        (activeTab === 'chat' ? (
          <div className='pg-chat-shell'>
            <PlaygroundChatTopbar
              renderBilling={renderBilling}
              presetAction={
                canSavePresets && (
                  <SavePresetAction
                    className='pg-topbar-btn'
                    available={
                      !!metadata &&
                      config.model === activeModel &&
                      supportsStudioTask(metadata, 'chat')
                    }
                    capture={() => ({
                      mode: 'chat',
                      model: activeModel,
                      prompt: draft,
                      parameters: getChatParameterOverrides(controls.config),
                    })}
                  />
                )
              }
              modelValue={activeModel}
              hasMessages={messages.length > 0}
              onClearMessages={handleClearMessages}
              parametersOpen={parametersOpen}
              parametersId={parametersId}
              parameterButton={parameterButton}
              onToggleParameters={() => setParametersOpen((prev) => !prev)}
              codeOpen={codeOpen}
              onToggleCode={() => setCodeOpen((prev) => !prev)}
            />
            {parametersOpen && (
              <aside
                id={parametersId}
                className='pg-chat-parameters'
                aria-labelledby={`${parametersId}-title`}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation()
                    closeParameters()
                  }
                }}
              >
                <div className='pg-chat-parameters-heading'>
                  <h2 id={`${parametersId}-title`}>{t('Parameters')}</h2>
                  <Button
                    type='button'
                    size='icon-sm'
                    variant='ghost'
                    aria-label={t('Close')}
                    onClick={closeParameters}
                  >
                    <XIcon aria-hidden='true' />
                  </Button>
                </div>
                <PlaygroundParameterContent
                  config={controls.config}
                  resolvedProtocol={resolvedProtocol}
                  disabled={
                    isGenerating || !activeModel || activeModel !== config.model
                  }
                  onProtocolChange={(protocol) =>
                    updateConfig('protocol', protocol)
                  }
                  onConfigChange={updateConfig}
                  onParameterEnabledChange={updateParameterEnabled}
                />
              </aside>
            )}
            <div className='pg-chat-conversation'>
              <PlaygroundCodeDrawer
                open={codeOpen && !!activeModel && activeModel === config.model}
                payload={requestPayload}
                requestPath={requestPreviewPath}
                previewHeaders={requestPreviewHeaders}
              />
              <PlaygroundChat
                messages={messages}
                isLoadingMessages={isLoadingMessages}
                onRegenerateMessage={
                  chatReady ? handleRegenerateMessage : undefined
                }
                onEditMessage={handleEditMessage}
                onDeleteMessage={handleDeleteMessage}
                isGenerating={isGenerating}
                editingKey={editingMessageKey}
                onCancelEdit={handleEditOpenChange}
                onSaveEdit={(newContent) => applyEdit(newContent, false)}
                onSaveEditAndSubmit={
                  !chatReady
                    ? undefined
                    : (newContent) => applyEdit(newContent, true)
                }
              />

              {showChatComposer ? (
                <div className='pg-chat-composer-wrap'>
                  {superadminAuthoringChat && !chatReady && (
                    <div className='pg-preset-authoring-banner' role='status'>
                      <span>
                        {t(
                          'Preset editing mode · Select an API key to send live test requests.'
                        )}
                      </span>
                    </div>
                  )}
                  <PlaygroundInput
                    key={String(billingKeyId ?? 'none')}
                    acceptsAttachments={acceptsAttachments}
                    onAttachmentsChange={setDraftAttachments}
                    canSubmit={chatReady}
                    priceQuote={chatPriceQuote}
                    reasoning={{
                      choices: controls.efforts,
                      defaultValue: controls.defaultEffort,
                      value: controls.config.reasoning_effort,
                      onChange: (value) =>
                        updateConfig('reasoning_effort', value),
                    }}
                    webSearch={{
                      supported: controls.webSearchSupported,
                      enabled: controls.config.web_search,
                      onChange: (enabled) =>
                        updateConfig('web_search', enabled),
                    }}
                    fileOutput={{
                      value: controls.config.fileOutput,
                      onChange: (value) => updateConfig('fileOutput', value),
                    }}
                    disabled={isGenerating}
                    showWelcome={!isLoadingMessages && !messages.length}
                    draft={{ value: draft, onChange: setDraft }}
                    groups={groups}
                    groupValue={scope?.group ?? ''}
                    isGenerating={isGenerating}
                    isModelLoading={isLoadingModels}
                    modelValue={activeModel}
                    models={executionModels}
                    onClearMessages={handleClearMessages}
                    onModelChange={selectModel}
                    onStop={stopGeneration}
                    onSubmit={(text, attachments) => {
                      if (chatReady) handleSendMessage(text, attachments)
                    }}
                    hasMessages={messages.length > 0}
                    showModelSelector={executionModels.length > 0}
                  />
                </div>
              ) : (
                renderChatGate()
              )}
            </div>
          </div>
        ) : (
          <MultimodalStudio
            sessionKey={JSON.stringify([activeTab, billingKeyId, activeModel])}
            canSavePresets={canSavePresets}
            mode={activeTab}
            currentModel={metadata}
            draft={
              mediaDrafts[activeTab] ??
              (props.preset?.mode === activeTab ? props.preset.prompt : '')
            }
            onDraftChange={(value) =>
              setMediaDrafts((old) => ({ ...old, [activeTab]: value }))
            }
            billing={renderBilling()}
            keyGuide={mediaKeyGuide}
            priceQuote={mediaPriceQuote}
            statusNotice={mediaStatusNotice}
            preset={
              props.preset?.mode === activeTab &&
              props.preset.model === activeModel
                ? props.preset
                : undefined
            }
            billingKeyId={canGenerate ? (scope?.keyId ?? null) : null}
            onRunningChange={setMediaRunning}
          />
        ))}
      <StudioDiscovery
        mode={activeTab}
        group={scope?.group ?? ''}
        currentModel={scope ? activeModel : ''}
        allowed={executionModels}
        loadingModels={isLoadingModels}
        modelsError={modelsError}
        retryModels={retryModels}
        busy={isGenerating || mediaRunning}
        currentPresetId={props.preset?.id}
        onSelectModel={selectModel}
      />
      {detailsModel && detailsModel === activeModel && (
        <Suspense fallback={<p role='status'>{t('Loading')}</p>}>
          <PlaygroundModelDetails
            catalog={catalog}
            modelName={detailsModel}
            chatParameters={
              activeTab === 'chat' && detailsModel === config.model
                ? controls.parameterInfo
                : undefined
            }
            onClose={() => setDetailsModel('')}
          />
        </Suspense>
      )}
    </div>
  )
}
