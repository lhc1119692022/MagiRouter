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
import type { SupportedParameter } from '@/features/pricing/lib/mock-stats'

import {
  CHAT_REASONING_EFFORTS,
  type ChatControls,
  type PlaygroundConfig,
  type ParameterEnabled,
} from '../../types'

export type PlaygroundParameterKey = keyof ParameterEnabled

export type PlaygroundParameterControl = {
  key: PlaygroundParameterKey
  labelKey: string
  descriptionKey: string
  valueType: 'slider' | 'number'
  min: number
  max: number
  step: number
}

export const PLAYGROUND_PARAMETER_CONTROLS = [
  {
    key: 'temperature',
    labelKey: 'Temperature',
    descriptionKey: 'Controls randomness and creativity',
    valueType: 'slider',
    min: 0,
    max: 2,
    step: 0.1,
  },
  {
    key: 'top_p',
    labelKey: 'Top P',
    descriptionKey: 'Limits token selection to a probability mass',
    valueType: 'slider',
    min: 0,
    max: 1,
    step: 0.1,
  },
  {
    key: 'frequency_penalty',
    labelKey: 'Frequency Penalty',
    descriptionKey: 'Reduces repeated wording',
    valueType: 'slider',
    min: -2,
    max: 2,
    step: 0.1,
  },
  {
    key: 'presence_penalty',
    labelKey: 'Presence Penalty',
    descriptionKey: 'Encourages new topics',
    valueType: 'slider',
    min: -2,
    max: 2,
    step: 0.1,
  },
  {
    key: 'max_tokens',
    labelKey: 'Max Tokens',
    descriptionKey: 'Caps the response length',
    valueType: 'number',
    min: 1,
    max: 200000,
    step: 1,
  },
  {
    key: 'seed',
    labelKey: 'Seed',
    descriptionKey: 'Keeps compatible responses more repeatable',
    valueType: 'number',
    min: 0,
    max: 2147483647,
    step: 1,
  },
] as const satisfies readonly PlaygroundParameterControl[]

export function resolveChatControls(
  config: PlaygroundConfig,
  controls?: ChatControls
) {
  const efforts = CHAT_REASONING_EFFORTS.filter((value) =>
    controls?.efforts?.includes(value)
  )
  const reasoning =
    config.reasoning_effort && efforts.includes(config.reasoning_effort)
      ? config.reasoning_effort
      : ''
  const defaultEffort =
    controls?.default_effort && efforts.includes(controls.default_effort)
      ? controls.default_effort
      : undefined
  const webSearchSupported = controls?.web_search === true
  const webSearchEnabled = webSearchSupported && config.web_search === true
  const sampling =
    controls?.sampling === 'always' ||
    (controls?.sampling === 'none_only' &&
      (reasoning || defaultEffort) === 'none')
  const supported = PLAYGROUND_PARAMETER_CONTROLS.filter(({ key }) => {
    if (key === 'temperature' || key === 'top_p') return sampling
    return controls?.fields?.includes(key) === true
  })
  const parameterInfo: SupportedParameter[] = supported.map((control) => ({
    name: control.key,
    type: control.step === 1 ? 'integer' : 'number',
    descriptionKey: control.descriptionKey,
    range: `${control.min} – ${control.max}`,
  }))
  if (efforts.length) {
    parameterInfo.push({
      name: 'reasoning_effort',
      type: 'enum',
      descriptionKey: 'Reasoning Effort',
      enumValues: efforts,
      range: efforts.join(' · '),
      defaultValue: defaultEffort,
    })
  }
  if (webSearchSupported) {
    parameterInfo.push({
      name: 'web_search_options',
      type: 'object',
      descriptionKey: 'Web search',
    })
  }
  return {
    parameterInfo,
    efforts,
    defaultEffort,
    webSearchSupported,
    fields: PLAYGROUND_PARAMETER_CONTROLS,
    config: {
      ...config,
      historyTurns: 0 as const,
      reasoning_effort: reasoning,
      web_search: webSearchEnabled,
    } satisfies PlaygroundConfig,
  }
}

export function isValidPlaygroundParameterValue(
  control: PlaygroundParameterControl,
  value: number | null
): value is number {
  return (
    value !== null &&
    Number.isFinite(value) &&
    value >= control.min &&
    value <= control.max &&
    (control.step !== 1 || Number.isInteger(value))
  )
}
