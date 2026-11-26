import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'

import { DEFAULT_CONFIG } from '../../../constants'
import type { PlaygroundParameterKey } from '../../../lib/parameters/playground-parameters'
import type { ChatApiProtocol, PlaygroundConfig } from '../../../types'
import { PlaygroundParameterContent } from '../playground-parameter-panel'

function ParameterPanelFixture(props: {
  initialConfig?: PlaygroundConfig
  disabled?: boolean
  enableProtocolSelector?: boolean
  onProtocolChange?: (protocol: ChatApiProtocol) => void
  onValueChange?: (key: PlaygroundParameterKey, value: number | null) => void
}) {
  const [config, setConfig] = useState(props.initialConfig ?? DEFAULT_CONFIG)
  return (
    <PlaygroundParameterContent
      config={config}
      disabled={props.disabled}
      onProtocolChange={
        props.enableProtocolSelector
          ? (protocol) => {
              props.onProtocolChange?.(protocol)
              setConfig((previous) => ({ ...previous, protocol }))
            }
          : undefined
      }
      onConfigChange={(key, value) => {
        props.onValueChange?.(key, value)
        setConfig((previous) => ({ ...previous, [key]: value }))
      }}
      onParameterEnabledChange={(key, enabled) =>
        setConfig((previous) => ({
          ...previous,
          parameterEnabled: { ...previous.parameterEnabled, [key]: enabled },
        }))
      }
    />
  )
}

it('offers all six unchecked overrides in order for a model without metadata', () => {
  render(
    <ParameterPanelFixture
      initialConfig={{ ...DEFAULT_CONFIG, model: 'unknown-model' }}
    />
  )
  const labels = [
    'Temperature',
    'Top P',
    'Frequency Penalty',
    'Presence Penalty',
    'Max Tokens',
    'Seed',
  ]
  const switches = screen.getAllByRole('switch')
  const inputs = screen.getAllByRole('spinbutton')
  expect(switches).toHaveLength(labels.length)
  expect(inputs).toHaveLength(labels.length)
  labels.forEach((label, index) => {
    expect(switches[index]).toHaveAccessibleName(`Enable ${label}`)
    expect(switches[index]).not.toBeChecked()
    expect(inputs[index]).toHaveAccessibleName(label)
    expect(inputs[index]).toBeDisabled()
  })
  expect(screen.getByRole('note')).toHaveTextContent(/reasoning models/i)
})

it('enables a field by keyboard without enabling others and remembers its value when switched off', async () => {
  const user = userEvent.setup()
  const change = vi.fn()
  render(<ParameterPanelFixture onValueChange={change} />)
  const temperatureSwitch = screen.getByRole('switch', {
    name: 'Enable Temperature',
  })
  const temperature = screen.getByRole('spinbutton', { name: 'Temperature' })
  await user.tab()
  expect(temperatureSwitch).toHaveFocus()
  await user.keyboard('[Space]')
  expect(temperatureSwitch).toBeChecked()
  expect(temperature).toBeEnabled()
  expect(screen.getByRole('spinbutton', { name: 'Top P' })).toBeDisabled()

  await user.clear(temperature)
  await user.type(temperature, '0.35')
  expect(change).toHaveBeenLastCalledWith('temperature', 0.35)
  await user.click(temperatureSwitch)
  expect(temperatureSwitch).not.toBeChecked()
  expect(temperature).toBeDisabled()
  await user.click(temperatureSwitch)
  expect(temperature).toHaveValue(0.35)
})

it.each(['', '0', '1.5', '200001'])(
  'leaves Max Tokens enabled but clears the override for invalid input %j until corrected',
  async (invalid) => {
    const user = userEvent.setup()
    const change = vi.fn()
    render(<ParameterPanelFixture onValueChange={change} />)
    const toggle = screen.getByRole('switch', { name: 'Enable Max Tokens' })
    const input = screen.getByRole('spinbutton', { name: 'Max Tokens' })
    await user.click(toggle)
    fireEvent.change(input, { target: { value: invalid } })
    expect(change).toHaveBeenLastCalledWith('max_tokens', null)
    expect(toggle).toBeChecked()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/1.*200,?000/)

    fireEvent.change(input, { target: { value: '1' } })
    expect(change).toHaveBeenLastCalledWith('max_tokens', 1)
    expect(input).not.toBeInvalid()
  }
)

it('uses zero when explicitly enabling a previously unset seed', async () => {
  const user = userEvent.setup()
  const change = vi.fn()
  render(
    <ParameterPanelFixture
      initialConfig={{ ...DEFAULT_CONFIG, seed: null }}
      onValueChange={change}
    />
  )
  const toggle = screen.getByRole('switch', { name: 'Enable Seed' })
  await user.click(toggle)
  expect(toggle).toBeChecked()
  expect(screen.getByRole('spinbutton', { name: 'Seed' })).toHaveValue(0)
  expect(change).toHaveBeenLastCalledWith('seed', 0)
})

it('locks both the switches and the enabled values while the panel is disabled', async () => {
  const user = userEvent.setup()
  render(
    <ParameterPanelFixture
      disabled
      initialConfig={{
        ...DEFAULT_CONFIG,
        parameterEnabled: { ...DEFAULT_CONFIG.parameterEnabled, seed: true },
      }}
    />
  )
  const seed = screen.getByRole('switch', { name: 'Enable Seed' })
  await user.click(seed)
  expect(seed).toBeChecked()
  expect(seed).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByRole('spinbutton', { name: 'Seed' })).toBeDisabled()
})

it('renders the API Protocol selector at the top of Parameters with auto-detection and manual options', async () => {
  const user = userEvent.setup()
  const onProtocolChange = vi.fn()
  render(
    <ParameterPanelFixture
      enableProtocolSelector
      initialConfig={{ ...DEFAULT_CONFIG, model: 'claude-sonnet-5-5' }}
      onProtocolChange={onProtocolChange}
    />
  )

  const protocolTrigger = screen.getByRole('combobox', { name: 'API Protocol' })
  const note = screen.getByRole('note')
  expect(
    protocolTrigger.compareDocumentPosition(note) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expect(protocolTrigger).toHaveTextContent('Default (Auto)')
  expect(screen.getByText('/v1/messages')).toBeVisible()

  await user.click(protocolTrigger)
  for (const label of [
    'Default (Auto)',
    'OpenAI Chat',
    'OpenAI Responses',
    'Anthropic Messages',
    'Google Gemini (v1beta)',
  ]) {
    expect(
      screen.getByRole('option', {
        name: new RegExp(label.replaceAll(/[()]/g, '\\$&')),
      })
    ).toBeVisible()
  }

  await user.click(
    screen.getByRole('option', { name: /Google Gemini \(v1beta\)/ })
  )
  expect(onProtocolChange).toHaveBeenCalledWith('gemini_v1beta')
  expect(
    screen.getByText(
      '/v1beta/models/claude-sonnet-5-5:streamGenerateContent?alt=sse'
    )
  ).toBeVisible()
})
