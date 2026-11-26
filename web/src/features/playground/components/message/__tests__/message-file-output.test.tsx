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
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { MESSAGE_ROLES, MESSAGE_STATUS } from '../../../constants'
import type { Message } from '../../../types'
import { MessageActions } from '../message-actions'
import { PlaygroundMessageContent } from '../playground-message-content'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PlaygroundMessageContent attachments and output files', () => {
  test('renders user attachment badges even when the message has no text', () => {
    const message: Message = {
      key: 'user-1',
      from: MESSAGE_ROLES.USER,
      versions: [{ id: 'v1', content: '' }],
      attachments: [
        {
          name: 'invoice.pdf',
          mediaType: 'application/pdf',
          kind: 'pdf',
          size: 2048,
        },
      ],
    }

    render(
      <PlaygroundMessageContent
        actions={null}
        alignment='end'
        message={message}
        versionContent=''
      />
    )

    expect(screen.getByText('invoice.pdf')).toBeVisible()
    expect(screen.getByText('2 KB')).toBeVisible()
  })

  test('renders downloadable file cards for completed assistant responses and hides them while streaming', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    const content = [
      'Generated two files:',
      '',
      '```csv filename="sales.csv"',
      'item,qty',
      'tea,5',
      '```',
      '',
      '```json filename="summary.json"',
      '{"total":5}',
      '```',
    ].join('\n')

    const streamingMessage: Message = {
      key: 'assistant-1',
      from: MESSAGE_ROLES.ASSISTANT,
      versions: [{ id: 'v1', content }],
      status: MESSAGE_STATUS.STREAMING,
    }

    const view = render(
      <PlaygroundMessageContent
        actions={null}
        alignment='start'
        message={streamingMessage}
        versionContent={content}
      />
    )

    expect(screen.queryByLabelText('Generated files')).toBeNull()

    const completeMessage: Message = {
      ...streamingMessage,
      status: MESSAGE_STATUS.COMPLETE,
    }
    view.rerender(
      <PlaygroundMessageContent
        actions={<MessageActions message={completeMessage} alwaysVisible />}
        alignment='start'
        message={completeMessage}
        versionContent={content}
      />
    )

    expect(screen.getByLabelText('Generated files')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Download sales.csv' }))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Download all' }))
    expect(createObjectURL).toHaveBeenCalledTimes(3)

    const actionDownloadButtons = screen.getAllByRole('button', {
      name: 'Download',
    })
    expect(actionDownloadButtons.length).toBeGreaterThanOrEqual(1)
  })
})
