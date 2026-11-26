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
import { useCallback, useEffect, useRef, useState } from 'react'

import type { CreationPreset } from '@/features/creation/presets'

import { DEFAULT_CONFIG, DEFAULT_NUMERIC_PARAMETERS } from '../constants'
import {
  saveConfig,
  saveMessages,
  applyMessageStateUpdate,
  getInitialPlaygroundConfig,
  loadMessages,
  type MessageStateUpdater,
} from '../lib'
import type {
  Message,
  PlaygroundConfig,
  ParameterEnabled,
  ModelOption,
  GroupOption,
} from '../types'

const MESSAGE_SAVE_DEBOUNCE_MS = 500

/**
 * Main state management hook for playground
 */
export function usePlaygroundState(
  preset?: CreationPreset,
  initialGroup?: string
) {
  // Load initial state from localStorage
  const [config, setConfig] = useState<PlaygroundConfig>(() =>
    getInitialPlaygroundConfig(preset, initialGroup)
  )
  const presetMode = preset?.mode
  const { model, group, protocol, stream, historyTurns, reasoning_effort } =
    config
  useEffect(() => {
    if (presetMode !== 'chat') {
      saveConfig({
        model,
        group,
        protocol,
        stream,
        historyTurns,
        reasoning_effort,
      })
    }
  }, [
    model,
    group,
    protocol,
    stream,
    historyTurns,
    reasoning_effort,
    presetMode,
  ])

  const [messages, setMessages] = useState<Message[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(true)
  const messagesSaveTimerRef = useRef<number | null>(null)
  const latestMessagesRef = useRef<Message[]>(messages)
  const hasLoadedMessagesRef = useRef(false)

  const [models, setModels] = useState<ModelOption[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])

  const persistMessages = useCallback((messagesToSave: Message[]) => {
    latestMessagesRef.current = messagesToSave

    if (!hasLoadedMessagesRef.current) {
      return
    }

    if (messagesSaveTimerRef.current !== null) {
      window.clearTimeout(messagesSaveTimerRef.current)
    }

    messagesSaveTimerRef.current = window.setTimeout(() => {
      messagesSaveTimerRef.current = null
      saveMessages(latestMessagesRef.current)
    }, MESSAGE_SAVE_DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    let cancelled = false

    window.setTimeout(() => {
      const loadedMessages = loadMessages() ?? []
      if (cancelled) {
        return
      }

      latestMessagesRef.current = loadedMessages
      hasLoadedMessagesRef.current = true
      setMessages(loadedMessages)
      setIsLoadingMessages(false)
    }, 0)

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () => () => {
      if (messagesSaveTimerRef.current !== null) {
        window.clearTimeout(messagesSaveTimerRef.current)
        saveMessages(latestMessagesRef.current)
      }
    },
    []
  )

  // Update config with automatic save
  const updateConfig = useCallback(
    <K extends keyof PlaygroundConfig>(key: K, value: PlaygroundConfig[K]) => {
      setConfig((prev) => {
        if (prev[key] === value) return prev
        if (key === 'model' || key === 'group') {
          return {
            ...DEFAULT_CONFIG,
            model: prev.model,
            group: prev.group,
            protocol: prev.protocol,
            stream: prev.stream,
            fileOutput: prev.fileOutput,
            historyTurns: prev.historyTurns,
            [key]: value,
          }
        }
        return { ...prev, [key]: value }
      })
    },
    []
  )

  // Update parameter enabled with automatic save
  const updateParameterEnabled = useCallback(
    (key: keyof ParameterEnabled, value: boolean) => {
      setConfig((prev) => ({
        ...prev,
        parameterEnabled: { ...prev.parameterEnabled, [key]: value },
      }))
    },
    []
  )

  // Update messages with automatic save
  const updateMessages = useCallback(
    (updater: MessageStateUpdater) => {
      setMessages((prev) => {
        const newMessages = applyMessageStateUpdate(prev, updater)
        persistMessages(newMessages)
        return newMessages
      })
    },
    [persistMessages]
  )

  // Clear all messages
  const clearMessages = useCallback(() => {
    updateMessages([])
    setConfig((previous) => ({
      ...previous,
      ...DEFAULT_NUMERIC_PARAMETERS,
      web_search: false,
      fileOutput: 'off',
    }))
  }, [updateMessages])

  // Reset config to defaults
  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_CONFIG)
  }, [])

  const resetParameterOverrides = useCallback(() => {
    setConfig((previous) => ({
      ...DEFAULT_CONFIG,
      model: previous.model,
      group: previous.group,
      protocol: previous.protocol,
      stream: previous.stream,
      historyTurns: previous.historyTurns,
    }))
  }, [])

  return {
    // State
    config,
    parameterEnabled: config.parameterEnabled,
    messages,
    isLoadingMessages,
    models,
    groups,

    // Setters
    setModels,
    setGroups,

    // Actions
    updateConfig,
    updateParameterEnabled,
    updateMessages,
    clearMessages,
    resetConfig,
    resetParameterOverrides,
  }
}
