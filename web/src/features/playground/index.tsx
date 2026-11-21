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
import { useCallback, useState } from 'react'

import { PlaygroundChat } from './components/chat/playground-chat'
import { PlaygroundInput } from './components/input/playground-input'
import {
  MultimodalStudio,
  type MultimodalMode,
} from './components/multimodal-studio'
import {
  useChatHandler,
  usePlaygroundConversation,
  usePlaygroundOptions,
  usePlaygroundState,
} from './hooks'

type StudioTab = 'chat' | MultimodalMode

export function Playground() {
  const [activeTab, setActiveTab] = useState<StudioTab>('chat')
  const [activeMediaModel, setActiveMediaModel] = useState<string>('')

  const {
    config,
    parameterEnabled,
    messages,
    isLoadingMessages,
    models,
    groups,
    updateMessages,
    setModels,
    setGroups,
    updateConfig,
    updateParameterEnabled,
    clearMessages,
  } = usePlaygroundState()

  const { sendChat, stopGeneration, isGenerating } = useChatHandler({
    config,
    parameterEnabled,
    onMessageUpdate: updateMessages,
  })

  const {
    editingMessageKey,
    handleSendMessage,
    handleRegenerateMessage,
    handleEditMessage,
    handleEditOpenChange,
    applyEdit,
    handleDeleteMessage,
  } = usePlaygroundConversation({
    messages,
    updateMessages,
    sendChat,
  })

  const handleClearMessages = () => {
    handleEditOpenChange(false)
    clearMessages()
  }

  const { isLoadingModels } = usePlaygroundOptions({
    currentGroup: config.group,
    currentModel: config.model,
    setGroups,
    setModels,
    updateConfig,
  })

  const handleActiveMediaModelChange = useCallback((modelId: string) => {
    setActiveMediaModel(modelId)
  }, [])

  const studioTabs: { id: StudioTab; label: string }[] = [
    { id: 'chat', label: '文本对话' },
    { id: 'video', label: '视频生成' },
    { id: 'image', label: '图片生成' },
    { id: 'audio', label: '音频合成' },
  ]

  const headerModelBadge =
    activeTab === 'chat'
      ? config.model || 'text-model'
      : activeMediaModel || activeTab

  return (
    <div className='relative flex size-full min-h-0 flex-col overflow-hidden'>
      <div className='el-container shrink-0 pt-3 pb-1'>
        <div className='pg-head-row'>
          <div className='pg-title-group'>
            <h1 className='pg-title'>Playground</h1>
            <span
              className='el-pill'
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {headerModelBadge}
            </span>
          </div>
          <div className='pg-head-right'>
            <div
              className='theme-switch'
              role='tablist'
              aria-label='Playground 模态切换'
              style={{ width: 'auto', padding: '3px' }}
            >
              {studioTabs.map((tab) => {
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type='button'
                    onClick={() => setActiveTab(tab.id)}
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
              全部模型广场 →
            </Link>
          </div>
        </div>
      </div>

      {activeTab === 'chat' ? (
        <>
          <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
            <PlaygroundChat
              messages={messages}
              isLoadingMessages={isLoadingMessages}
              onRegenerateMessage={handleRegenerateMessage}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onSelectPrompt={handleSendMessage}
              isGenerating={isGenerating}
              editingKey={editingMessageKey}
              onCancelEdit={handleEditOpenChange}
              onSaveEdit={(newContent) => applyEdit(newContent, false)}
              onSaveEditAndSubmit={(newContent) => applyEdit(newContent, true)}
            />
          </div>

          {/* Input area: center content and constrain to the same container width */}
          <div className='mx-auto w-full max-w-4xl'>
            <PlaygroundInput
              config={config}
              disabled={isGenerating}
              groups={groups}
              groupValue={config.group}
              isGenerating={isGenerating}
              isModelLoading={isLoadingModels}
              modelValue={config.model}
              models={models}
              onGroupChange={(value) => updateConfig('group', value)}
              onConfigChange={updateConfig}
              onClearMessages={handleClearMessages}
              onModelChange={(value) => updateConfig('model', value)}
              onParameterEnabledChange={updateParameterEnabled}
              onStop={stopGeneration}
              onSubmit={handleSendMessage}
              parameterEnabled={parameterEnabled}
              hasMessages={messages.length > 0}
            />
          </div>
        </>
      ) : (
        <div className='el-container min-h-0 flex-1 overflow-y-auto pb-6'>
          <MultimodalStudio
            key={activeTab}
            mode={activeTab}
            groupValue={config.group}
            groups={groups}
            onGroupChange={(value) => updateConfig('group', value)}
            onActiveModelChange={handleActiveMediaModelChange}
          />
        </div>
      )}
    </div>
  )
}
