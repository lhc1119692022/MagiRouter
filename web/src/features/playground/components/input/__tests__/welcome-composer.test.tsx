import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { DEFAULT_CONFIG } from '../../../constants'
import {
  buildChatCompletionPayload,
  createLoadingAssistantMessage,
  createUserMessage,
  previewChatImageUrls,
  selectedChatImageUrls,
} from '../../../lib'
import { PlaygroundInput } from '../playground-input'

const defaults = {
  models: [{ value: 'chat-model', label: 'Chat model' }],
  modelValue: 'chat-model',
  groups: [{ value: 'default', label: 'Default', ratio: 1 }],
  groupValue: 'default',
  onGroupChange: () => {},
  onModelChange: () => {},
  showModelSelector: false,
}

const sampleImage =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/1GcAAAAASUVORK5CYII='

function installLocalImagePreview() {
  const image = new File(
    [
      Uint8Array.from(atob(sampleImage.split(',')[1]), (char) =>
        char.charCodeAt(0)
      ),
    ],
    'fixture.png',
    { type: 'image/png' }
  )
  const blobs = new Map<string, Blob>()
  const create = vi.fn((file: Blob) => {
    const url = `blob:fixture-${blobs.size}`
    blobs.set(url, file)
    return url
  })
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create
      static revokeObjectURL = (url: string) => {
        blobs.delete(url)
      }
    }
  )
  const read = vi.fn(async (url: string) => {
    const blob = blobs.get(url)
    if (!blob) throw new Error('Expected a local fixture')
    return { blob: async () => blob }
  })
  vi.stubGlobal('fetch', read)
  return { create, image, read }
}

afterEach(() => vi.unstubAllGlobals())

it('shows only verified English effort values and keeps the provider default distinct', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const view = render(
    <PlaygroundInput
      {...defaults}
      onSubmit={vi.fn()}
      reasoning={{
        choices: ['low', 'high'],
        value: '',
        defaultValue: 'high',
        onChange,
      }}
    />
  )
  const composer = within(screen.getByRole('form', { name: 'Text Chat' }))
  const select = composer.getByRole('combobox', { name: 'Thinking level' })
  expect(select).toHaveTextContent('Thinking · Default')
  await user.click(select)
  expect(
    screen.getAllByRole('option').map((option) => option.textContent)
  ).toEqual(['Default · High', 'Low', 'High'])
  expect(screen.getByRole('option', { name: 'Low' })).toHaveAttribute(
    'lang',
    'en'
  )
  await user.click(screen.getByRole('option', { name: 'Low' }))
  expect(onChange).toHaveBeenCalledWith('low')
  view.rerender(
    <PlaygroundInput
      {...defaults}
      onSubmit={vi.fn()}
      reasoning={{ choices: [], value: '', onChange }}
    />
  )
  expect(
    screen.queryByRole('combobox', { name: 'Thinking level' })
  ).not.toBeInTheDocument()
  const mutedThinking = composer.getByRole('button', { name: 'Thinking level' })
  expect(mutedThinking).toBeDisabled()
  expect(mutedThinking).toHaveTextContent('Thinking · Default')
})

it('renders synced model switching, real web search toggle, and price readout beside Send without fake stubs', async () => {
  const user = userEvent.setup()
  const onModelChange = vi.fn()
  const onWebSearchChange = vi.fn()
  const view = render(
    <PlaygroundInput
      {...defaults}
      models={[
        { value: 'chat-a', label: 'chat-a' },
        { value: 'chat-b', label: 'chat-b' },
      ]}
      modelValue='chat-a'
      onModelChange={onModelChange}
      showModelSelector
      priceQuote={
        <span aria-label='Reference price'>Input ¥14 / 1M token</span>
      }
      webSearch={{
        supported: true,
        enabled: false,
        onChange: onWebSearchChange,
      }}
      onSubmit={vi.fn()}
    />
  )
  const composer = within(screen.getByRole('form', { name: 'Text Chat' }))
  expect(composer.queryByRole('button', { name: 'Search' })).toBeNull()
  expect(
    composer.queryByRole('button', { name: 'Clear chat history' })
  ).toBeNull()

  const modelPicker = composer.getByRole('combobox', { name: 'Switch model' })
  expect(modelPicker).toHaveValue('chat-a')
  await user.click(modelPicker)
  await user.click(await screen.findByRole('option', { name: 'chat-b' }))
  expect(onModelChange).toHaveBeenCalledWith('chat-b')

  const searchToggle = composer.getByRole('button', { name: 'Online search' })
  expect(searchToggle).toBeEnabled()
  expect(searchToggle).toHaveAttribute('aria-pressed', 'false')
  await user.click(searchToggle)
  expect(onWebSearchChange).toHaveBeenCalledWith(true)

  const price = composer.getByLabelText('Reference price')
  const sendButton = composer.getByRole('button', { name: 'Send' })
  expect(
    price.compareDocumentPosition(sendButton) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()

  view.rerender(
    <PlaygroundInput
      {...defaults}
      showModelSelector
      webSearch={{
        supported: false,
        enabled: false,
        onChange: onWebSearchChange,
      }}
      onSubmit={vi.fn()}
    />
  )
  const updatedComposer = within(
    screen.getByRole('form', { name: 'Text Chat' })
  )
  const disabledSearch = updatedComposer.getByRole('button', {
    name: 'Online search',
  })
  expect(disabledSearch).toBeDisabled()
  expect(disabledSearch).toHaveAttribute('aria-pressed', 'false')
})

it('previews removable local images and files, rejects unsupported or oversized uploads, and sends validated attachments', async () => {
  const { create, image, read } = installLocalImagePreview()
  const user = userEvent.setup()
  const submit = vi.fn()
  const view = render(
    <PlaygroundInput
      {...defaults}
      acceptsAttachments
      canSubmit={false}
      onSubmit={submit}
    />
  )
  const upload = screen.getByLabelText('Upload files')
  const openDialog = vi.spyOn(upload, 'click')
  await user.click(
    screen.getByRole('button', { name: 'Attach images or files' })
  )
  expect(openDialog).toHaveBeenCalledOnce()
  const form = screen.getByRole('form', { name: 'Text Chat' })
  fireEvent.drop(form, {
    dataTransfer: {
      files: [new File(['binary'], 'archive.zip', { type: 'application/zip' })],
      types: ['Files'],
    },
  })
  const large = new File(['fixture'], 'large.png', { type: 'image/png' })
  Object.defineProperty(large, 'size', { value: 10 * 1024 * 1024 + 1 })
  fireEvent.drop(form, { dataTransfer: { files: [large], types: ['Files'] } })
  expect(create).not.toHaveBeenCalled()
  await user.upload(upload, image)
  expect(screen.getByRole('img', { name: 'fixture.png' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Remove attachment' }))
  expect(
    screen.queryByRole('img', { name: 'fixture.png' })
  ).not.toBeInTheDocument()
  const csvFile = new File(['name,score\nAlice,95\n'], 'scores.csv', {
    type: 'text/csv',
  })
  await user.upload(upload, [image, csvFile])
  const input = screen.getByRole('textbox', { name: 'Ask anything' })
  await user.type(input, 'Describe the fixture{Enter}')
  expect(submit).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled()
  expect(input).toHaveValue('Describe the fixture')
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  view.rerender(
    <PlaygroundInput
      {...defaults}
      acceptsAttachments
      canSubmit
      onSubmit={submit}
    />
  )
  await user.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith('Describe the fixture', [
      expect.objectContaining({
        name: 'fixture.png',
        mediaType: 'image/png',
        kind: 'image',
        url: sampleImage,
      }),
      expect.objectContaining({
        name: 'scores.csv',
        mediaType: 'text/csv',
        kind: 'text',
        textContent: 'name,score\nAlice,95\n',
      }),
    ])
  )
  const messages = [
    createUserMessage('Describe the fixture'),
    createLoadingAssistantMessage(),
  ]
  const body = buildChatCompletionPayload(messages, DEFAULT_CONFIG, undefined, [
    sampleImage,
  ])
  expect(body.messages[0].content).toEqual([
    { type: 'text', text: 'Describe the fixture' },
    { type: 'image_url', image_url: { url: sampleImage } },
  ])
  expect(
    buildChatCompletionPayload(messages, DEFAULT_CONFIG).messages[0].content
  ).toBe('Describe the fixture')
  expect(JSON.stringify(messages)).not.toContain('data:image')
  expect(previewChatImageUrls(1)).toEqual([
    'https://example.invalid/image-1.png',
  ])
})

it('allows submitting an attachment without text and toggles file output format in the composer', async () => {
  const { image } = installLocalImagePreview()
  const user = userEvent.setup()
  const submit = vi.fn()
  const onFileOutputChange = vi.fn()
  const view = render(
    <PlaygroundInput
      {...defaults}
      acceptsAttachments
      onSubmit={submit}
      fileOutput={{ value: 'off', onChange: onFileOutputChange }}
    />
  )

  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  await user.upload(screen.getByLabelText('Upload files'), image)
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith('', [
      expect.objectContaining({
        name: 'fixture.png',
        kind: 'image',
        url: sampleImage,
      }),
    ])
  )

  const fileOutputSelect = screen.getByRole('combobox', { name: 'File output' })
  expect(fileOutputSelect).toHaveTextContent('File output')
  await user.click(fileOutputSelect)
  await user.click(screen.getByRole('option', { name: 'CSV (.csv)' }))
  expect(onFileOutputChange).toHaveBeenCalledWith('csv')

  view.rerender(
    <PlaygroundInput
      {...defaults}
      acceptsAttachments
      onSubmit={submit}
      fileOutput={{ value: 'csv', onChange: onFileOutputChange }}
    />
  )
  expect(
    screen.getByRole('combobox', { name: 'File output' })
  ).toHaveTextContent('File output · CSV')
})

it('discards attachments on a route change without losing text or accepting incompatible pasted files', async () => {
  const { image, read } = installLocalImagePreview()
  const user = userEvent.setup()
  const submit = vi.fn()
  const view = render(
    <PlaygroundInput
      {...defaults}
      acceptsAttachments
      onSubmit={submit}
      initialPrompt='Keep this draft'
    />
  )
  await user.upload(screen.getByLabelText('Upload files'), image)
  view.rerender(
    <PlaygroundInput {...defaults} modelValue='text-only' onSubmit={submit} />
  )
  expect(
    screen.queryByRole('button', { name: 'Attach images or files' })
  ).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Upload files')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('img', { name: 'fixture.png' })
  ).not.toBeInTheDocument()
  const form = screen.getByRole('form', { name: 'Text Chat' })
  fireEvent.drop(form, { dataTransfer: { files: [image], types: ['Files'] } })
  await user.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => expect(submit).toHaveBeenCalledWith('Keep this draft'))
  expect(read).not.toHaveBeenCalled()
  expect(
    selectedChatImageUrls([
      { mediaType: 'image/png', url: 'data:image/png;base64,ZmFrZQ==' },
    ])
  ).toBeNull()
  expect(
    selectedChatImageUrls(
      Array.from({ length: 3 }, () => ({
        mediaType: 'image/png',
        url: sampleImage,
      }))
    )
  ).toBeNull()
})

it('fills an editable draft from a starter and only sends after explicit submission', async () => {
  const user = userEvent.setup()
  const submit = vi.fn()
  render(<PlaygroundInput {...defaults} onSubmit={submit} showWelcome />)

  const input = screen.getByRole('textbox', { name: 'Ask anything' })
  expect(input).not.toHaveFocus()
  expect(
    screen.getByRole('heading', { name: 'What would you like to know?' })
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Analyze data' }))
  expect(input).toHaveFocus()
  expect(input).toHaveValue('Analyze data')
  expect(submit).not.toHaveBeenCalled()
  await user.keyboard('{Shift>}{Enter}{/Shift}from today')
  expect(submit).not.toHaveBeenCalled()
  await user.keyboard('{Enter}')
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith('Analyze data\nfrom today')
  )
  expect(input).toHaveValue('')
})

it('keeps the same composer and unsent text when a conversation is restored', () => {
  const submit = vi.fn()
  const view = render(
    <PlaygroundInput
      {...defaults}
      onSubmit={submit}
      initialPrompt='Preset draft'
      showWelcome
    />
  )
  const input = screen.getByRole('textbox', { name: 'Ask anything' })

  view.rerender(
    <PlaygroundInput
      {...defaults}
      onSubmit={submit}
      hasMessages
      showWelcome={false}
    />
  )

  expect(screen.getByRole('textbox', { name: 'Ask anything' })).toBe(input)
  expect(input).toHaveValue('Preset draft')
  expect(input).not.toHaveFocus()
  expect(
    screen.queryByRole('heading', { name: 'What would you like to know?' })
  ).not.toBeInTheDocument()
  expect(submit).not.toHaveBeenCalled()
})
