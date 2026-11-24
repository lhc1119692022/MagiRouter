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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { AnnouncementBanner } from '../announcement-banner'

test('clicking the close control dismisses the banner', async () => {
  const user = userEvent.setup()
  const onDismiss = vi.fn()
  render(
    <AnnouncementBanner
      message='主站稳定运行'
      showAction={false}
      onAction={vi.fn()}
      onDismiss={onDismiss}
    />
  )

  await user.click(screen.getByRole('button', { name: 'Close' }))

  expect(onDismiss).toHaveBeenCalledTimes(1)
})

// The banner close control is centred with `transform: translateY(-50%)`. The
// global press feedback in styles/index.css scales every `:active` button with
// `transform: scale(0.98)`, which replaces that translate and drops the control
// by half its height mid-click, so a press that started on its upper half ended
// outside the element and never produced a click. Opting out keeps the control
// in place for the whole press.
test('the close control does not take the displacing global press transform', () => {
  render(
    <AnnouncementBanner
      message='主站稳定运行'
      showAction={false}
      onAction={vi.fn()}
      onDismiss={vi.fn()}
    />
  )

  expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute(
    'data-no-press'
  )
})

test('the announcement action appears only when the visitor can use it', async () => {
  const user = userEvent.setup()
  const onAction = vi.fn()
  const props = {
    message: '主站稳定运行',
    onAction,
    onDismiss: vi.fn(),
  }

  const { unmount } = render(
    <AnnouncementBanner {...props} showAction={false} />
  )
  expect(screen.queryByRole('button', { name: /查看通知/ })).toBeNull()
  unmount()

  render(<AnnouncementBanner {...props} showAction />)
  await user.click(screen.getByRole('button', { name: /查看通知/ }))

  expect(onAction).toHaveBeenCalledTimes(1)
})
