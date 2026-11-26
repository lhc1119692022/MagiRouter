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
import { SSE } from 'sse.js'

import { resolveApiKeyValue } from '@/features/keys/api'

import { ERROR_MESSAGES } from '../constants'
import {
  buildProtocolRequestBody,
  getProtocolEndpointPath,
  getProtocolRequestHeaders,
  getProtocolStreamEventNames,
  getStreamReadyStateError,
  isStreamClosedReadyState,
  parseProtocolStreamEvent,
  parseStreamErrorDetails,
} from '../lib'
import type { ChatCompletionRequest, ResolvedChatApiProtocol } from '../types'

interface StreamEventSource {
  readyState?: number
  addEventListener: (
    type: string,
    listener: (
      event: Event & {
        data?: string
        readyState?: number
        responseCode?: number
      }
    ) => void
  ) => void
  close: () => void
  stream: () => void
}

interface StreamRequestCallbacks {
  onUpdate: (type: 'reasoning' | 'content', chunk: string) => void
  onComplete: () => void
  onError: (error: string, errorCode?: string) => void
}

interface StreamRequestControllerRuntime {
  getHeaders: (
    keyId?: number | null,
    protocol?: ResolvedChatApiProtocol
  ) => Promise<Record<string, string>>
  createSource: (
    payload: ChatCompletionRequest,
    headers: Record<string, string>,
    keyId?: number | null,
    protocol?: ResolvedChatApiProtocol
  ) => StreamEventSource
  setStreaming: (streaming: boolean) => void
}

export function createStreamRequestController(
  runtime: StreamRequestControllerRuntime
) {
  let source: StreamEventSource | null = null
  let generation = 0

  const closeActiveSource = (target: StreamEventSource) => {
    target.close()
    if (source === target) {
      source = null
      runtime.setStreaming(false)
    }
  }

  const send = async (
    payload: ChatCompletionRequest,
    callbacks: StreamRequestCallbacks,
    keyId?: number | null,
    protocol: ResolvedChatApiProtocol = 'openai_chat'
  ) => {
    const requestGeneration = generation + 1
    generation = requestGeneration
    const previousSource = source
    source = null
    previousSource?.close()
    runtime.setStreaming(false)

    let headers: Record<string, string>
    try {
      headers = await runtime.getHeaders(keyId, protocol)
    } catch (error: unknown) {
      if (generation !== requestGeneration) return
      callbacks.onError(
        error instanceof Error
          ? error.message
          : ERROR_MESSAGES.STREAM_START_ERROR
      )
      return
    }
    if (generation !== requestGeneration) return

    const nextSource = runtime.createSource(payload, headers, keyId, protocol)
    source = nextSource
    runtime.setStreaming(true)
    let completed = false
    let openResponseCode: number | undefined

    const isCurrent = () =>
      generation === requestGeneration && source === nextSource

    const handleError = (errorMessage: string, errorCode?: string) => {
      if (!isCurrent() || completed) return
      completed = true
      callbacks.onError(errorMessage, errorCode)
      closeActiveSource(nextSource)
    }

    const handleComplete = () => {
      if (!isCurrent() || completed) return
      completed = true
      closeActiveSource(nextSource)
      callbacks.onComplete()
    }

    nextSource.addEventListener('open', (event) => {
      if (!isCurrent()) return
      if (typeof event.responseCode === 'number') {
        openResponseCode = event.responseCode
      }
    })

    for (const eventName of getProtocolStreamEventNames(protocol)) {
      nextSource.addEventListener(eventName, (event) => {
        if (!isCurrent() || completed) return
        const data = event.data ?? ''
        try {
          const parsed = parseProtocolStreamEvent(protocol, eventName, data)
          if (parsed.error) {
            handleError(parsed.error.errorMessage, parsed.error.errorCode)
            return
          }
          for (const update of parsed.updates) {
            callbacks.onUpdate(update.type, update.chunk)
          }
          if (parsed.done) {
            handleComplete()
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to parse SSE message:', error)
          handleError(ERROR_MESSAGES.PARSE_ERROR)
        }
      })
    }

    nextSource.addEventListener('error', (event) => {
      if (!isCurrent() || completed) return
      if (!isStreamClosedReadyState(nextSource.readyState)) {
        const { errorCode, errorMessage } = parseStreamErrorDetails(event.data)
        handleError(errorMessage, errorCode)
      }
    })

    nextSource.addEventListener('readystatechange', (event) => {
      if (!isCurrent() || completed) return
      const errorMessage = getStreamReadyStateError(
        event.readyState,
        nextSource
      )

      if (errorMessage) {
        handleError(errorMessage)
        return
      }

      if (isStreamClosedReadyState(event.readyState)) {
        if (openResponseCode !== undefined && openResponseCode !== 200) {
          handleError(
            `HTTP ${openResponseCode}: ${ERROR_MESSAGES.CONNECTION_CLOSED}`
          )
          return
        }
        handleComplete()
      }
    })

    try {
      if (!isCurrent()) return
      nextSource.stream()
    } catch (error: unknown) {
      if (!isCurrent() || completed) return
      // eslint-disable-next-line no-console
      console.error('Failed to start SSE stream:', error)
      handleError(ERROR_MESSAGES.STREAM_START_ERROR)
    }
  }

  const cancel = (notify: boolean) => {
    generation += 1
    const activeSource = source
    source = null
    activeSource?.close()
    if (notify) runtime.setStreaming(false)
  }

  const stop = () => cancel(true)
  const dispose = () => cancel(false)

  return { send, stop, dispose }
}

/**
 * Hook for handling streaming chat completion requests
 */
export function useStreamRequest() {
  const [isStreaming, setIsStreaming] = useState(false)
  const controllerRef = useRef<ReturnType<
    typeof createStreamRequestController
  > | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = createStreamRequestController({
      getHeaders: async (keyId, protocol = 'openai_chat') => {
        if (keyId == null || !Number.isSafeInteger(keyId) || keyId <= 0) {
          throw new Error('Select an API key')
        }
        return getProtocolRequestHeaders(
          protocol,
          await resolveApiKeyValue(keyId)
        )
      },
      createSource: (payload, headers, _keyId, protocol = 'openai_chat') => {
        const endpointPath = getProtocolEndpointPath(
          protocol,
          payload.model,
          true
        )
        const wireBody = buildProtocolRequestBody(protocol, {
          ...payload,
          stream: true,
        })
        return new SSE(endpointPath, {
          headers,
          method: 'POST',
          payload: JSON.stringify(wireBody),
          start: false,
        }) as StreamEventSource
      },
      setStreaming: setIsStreaming,
    })
  }

  const sendStreamRequest = useCallback(
    (
      payload: ChatCompletionRequest,
      onUpdate: (type: 'reasoning' | 'content', chunk: string) => void,
      onComplete: () => void,
      onError: (error: string, errorCode?: string) => void,
      keyId?: number | null,
      protocol: ResolvedChatApiProtocol = 'openai_chat'
    ) =>
      controllerRef.current?.send(
        payload,
        {
          onUpdate,
          onComplete,
          onError,
        },
        keyId,
        protocol
      ),
    []
  )

  const stopStream = useCallback(() => {
    controllerRef.current?.stop()
  }, [])

  useEffect(
    () => () => {
      controllerRef.current?.dispose()
    },
    []
  )

  return {
    sendStreamRequest,
    stopStream,
    isStreaming,
  }
}
