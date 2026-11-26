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
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { DEFAULT_CONFIG } from '../../constants'
import {
  isValidPlaygroundParameterValue,
  PLAYGROUND_PARAMETER_CONTROLS,
  type PlaygroundParameterControl,
  type PlaygroundParameterKey,
} from '../../lib/parameters/playground-parameters'
import {
  CHAT_API_PROTOCOL_OPTIONS,
  getProtocolEndpointPath,
  RESOLVED_PROTOCOL_LABEL_KEYS,
  resolveChatApiProtocol,
} from '../../lib/streaming/protocol'
import type {
  ChatApiProtocol,
  PlaygroundConfig,
  ResolvedChatApiProtocol,
} from '../../types'

type PlaygroundParameterProps = {
  config: PlaygroundConfig
  disabled?: boolean
  resolvedProtocol?: ResolvedChatApiProtocol
  onProtocolChange?: (protocol: ChatApiProtocol) => void
  onConfigChange: (key: PlaygroundParameterKey, value: number | null) => void
  onParameterEnabledChange: (
    key: PlaygroundParameterKey,
    value: boolean
  ) => void
}

function PlaygroundParameterRow(
  props: PlaygroundParameterProps & { control: PlaygroundParameterControl }
) {
  const { t, i18n } = useTranslation()
  const inputId = useId()
  const [invalidDraft, setInvalidDraft] = useState('')
  const control = props.control
  const value = props.config[control.key]
  const enabled = props.config.parameterEnabled[control.key]
  const valid = isValidPlaygroundParameterValue(control, value)
  const invalid = enabled && !valid
  const label = t(control.labelKey)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  return (
    <Field
      orientation='horizontal'
      aria-label={label}
      data-disabled={props.disabled}
      data-invalid={invalid}
      className='pg-parameter-row grid min-w-0 grid-cols-[minmax(0,1fr)_auto_6rem] items-center gap-x-3 gap-y-1'
    >
      <FieldLabel htmlFor={inputId} className='min-w-0 break-words'>
        {label}
      </FieldLabel>
      <Switch
        aria-label={t('Enable {{parameter}}', { parameter: label })}
        aria-controls={inputId}
        checked={enabled}
        disabled={props.disabled}
        onCheckedChange={(checked) => {
          setInvalidDraft('')
          if (checked && !valid) {
            props.onConfigChange(control.key, DEFAULT_CONFIG[control.key])
          }
          props.onParameterEnabledChange(control.key, checked)
        }}
      />
      <Input
        id={inputId}
        type='number'
        min={control.min}
        max={control.max}
        step={control.step === 1 ? 1 : 'any'}
        required={enabled}
        disabled={props.disabled || !enabled}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${inputId}-error` : undefined}
        title={t(control.descriptionKey)}
        className='tabular-nums'
        value={value !== null && Number.isFinite(value) ? value : invalidDraft}
        onChange={(event) => {
          const input = event.currentTarget
          const parsed = input.valueAsNumber
          if (isValidPlaygroundParameterValue(control, parsed)) {
            setInvalidDraft('')
            props.onConfigChange(control.key, parsed)
          } else {
            setInvalidDraft(input.value)
            props.onConfigChange(control.key, null)
          }
        }}
      />
      {invalid && (
        <FieldError id={`${inputId}-error`} className='col-span-full text-xs'>
          {control.step === 1 && <span>{t('Enter a whole number')}. </span>}
          {t('Allowed range: {{min}} to {{max}}', {
            min: formatNumber(control.min, locale),
            max: formatNumber(control.max, locale),
          })}
        </FieldError>
      )}
    </Field>
  )
}

export function PlaygroundParameterContent(props: PlaygroundParameterProps) {
  const { t } = useTranslation()
  const protocolId = useId()
  const selectedProtocol = props.config.protocol ?? 'auto'
  const resolvedProtocol =
    props.resolvedProtocol ??
    resolveChatApiProtocol(selectedProtocol, props.config.model)
  const resolvedEndpoint = getProtocolEndpointPath(
    resolvedProtocol,
    props.config.model,
    props.config.stream
  )
  const selectedProtocolOption =
    CHAT_API_PROTOCOL_OPTIONS.find(
      (option) => option.value === selectedProtocol
    ) ?? CHAT_API_PROTOCOL_OPTIONS[0]

  return (
    <>
      {props.onProtocolChange && (
        <div className='pg-parameter-protocol'>
          <Field data-disabled={props.disabled}>
            <FieldLabel htmlFor={protocolId}>{t('API Protocol')}</FieldLabel>
            <Select
              value={selectedProtocol}
              disabled={props.disabled}
              onValueChange={(value) => {
                if (!value) return
                const nextOption = CHAT_API_PROTOCOL_OPTIONS.find(
                  (option) => option.value === value
                )
                if (nextOption) {
                  props.onProtocolChange?.(nextOption.value)
                }
              }}
            >
              <SelectTrigger
                id={protocolId}
                aria-label={t('API Protocol')}
                className='w-full'
              >
                <SelectValue>{t(selectedProtocolOption.labelKey)}</SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {CHAT_API_PROTOCOL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className='pg-protocol-option'>
                      <span>{t(option.labelKey)}</span>
                      {option.endpointLabel && (
                        <span className='pg-protocol-option-path' lang='en'>
                          {option.endpointLabel}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription className='pg-protocol-resolved'>
              {selectedProtocol === 'auto'
                ? t('Auto-selected: {{protocol}}', {
                    protocol: t(RESOLVED_PROTOCOL_LABEL_KEYS[resolvedProtocol]),
                  })
                : t('Active endpoint')}
              <code className='pg-protocol-endpoint' lang='en'>
                {resolvedEndpoint}
              </code>
            </FieldDescription>
          </Field>
        </div>
      )}
      <p
        role='note'
        className='pg-parameter-note text-muted-foreground text-xs'
      >
        {t(
          'Some newer models, especially reasoning models, may ignore or reject these parameters. If you are unsure, leave them off.'
        )}
      </p>
      <FieldGroup className='pg-parameter-fields'>
        {PLAYGROUND_PARAMETER_CONTROLS.map((control) => (
          <PlaygroundParameterRow
            key={`${props.config.model}:${props.config.group}:${control.key}`}
            {...props}
            control={control}
          />
        ))}
      </FieldGroup>
    </>
  )
}
