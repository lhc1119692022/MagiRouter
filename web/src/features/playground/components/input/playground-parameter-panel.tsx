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
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
import type { PlaygroundConfig } from '../../types'

type PlaygroundParameterProps = {
  config: PlaygroundConfig
  disabled?: boolean
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

  return (
    <>
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
