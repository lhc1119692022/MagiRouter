import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, it } from 'vitest'

import {
  MODEL_CAPABILITY_CATEGORIES,
  type ModelCapabilityCategory,
} from '@/lib/model-task-capabilities'

import { TaskCapabilityFilters } from '../components/task-capability-filters'

function TaskSelection() {
  const [selected, setSelected] = useState<ModelCapabilityCategory[]>([])
  return (
    <TaskCapabilityFilters
      available={MODEL_CAPABILITY_CATEGORIES}
      selected={selected}
      onChange={setSelected}
    />
  )
}

it('offers six named categories when present and lets a keyboard user add or remove them independently', async () => {
  const user = userEvent.setup()
  render(<TaskSelection />)
  const group = within(screen.getByRole('group', { name: 'Task capabilities' }))
  expect(group.getAllByRole('button', { pressed: false })).toHaveLength(6)
  expect(
    group.queryByRole('button', { name: 'All creative models' })
  ).toBeNull()
  await user.tab()
  expect(group.getByRole('button', { name: 'Text generation' })).toHaveFocus()
  await user.keyboard(' ')
  await user.tab()
  await user.keyboard('{Enter}')
  expect(group.getAllByRole('button', { pressed: true })).toHaveLength(2)
  await user.keyboard(' ')
  await user.tab({ shift: true })
  await user.keyboard('{Enter}')
  expect(group.queryByRole('button', { pressed: true })).toBeNull()
})
