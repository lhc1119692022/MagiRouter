import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { CreationCenter } from '..'
import { PresetWorkspace } from '../preset-workspace'

const preset = {
  id: 'studio-photo',
  title: 'Published studio brief',
  model: 'configured-model',
  mode: 'image',
  prompt: 'Photograph the supplied product.',
}

async function renderPage(
  page: typeof CreationCenter,
  presets: unknown[] | Error | Promise<unknown[]>,
  allowed: boolean,
  groupAllowed = allowed
) {
  vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url === '/api/user/self/creation-presets') {
      if (presets instanceof Error) throw presets
      return { data: { success: true, data: await presets } }
    }
    const params = config?.params
    const scopedGroup =
      params && typeof params === 'object' && 'group' in params && params.group
    const fixtures: Record<string, unknown> = {
      '/api/status': {
        SidebarModulesAdmin: '{"chat":{"enabled":false,"playground":false}}',
      },
      '/api/user/models': (scopedGroup ? groupAllowed : allowed)
        ? [preset.model]
        : ['other-model'],
      '/api/user/self/groups': {
        default: { desc: 'Default', ratio: 1 },
        studio: { desc: 'Studio', ratio: 2 },
      },
      '/api/pricing': [
        {
          model_name: preset.model,
          supported_endpoint_types: ['image-generation'],
          output_modalities: ['image'],
          input_modalities: ['text'],
          enable_groups: ['studio'],
        },
      ],
    }
    return { data: { success: true, data: fixtures[url] ?? [], vendors: [] } }
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree: createRootRoute({ component: page }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

afterEach(() => vi.restoreAllMocks())

function expectHubFrame() {
  expect(screen.getByRole('searchbox', { name: 'Search scenes' })).toBeVisible()
  expect(screen.getByRole('group', { name: 'Mode' })).toBeVisible()
  expect(screen.getByRole('group', { name: 'All categories' })).toBeVisible()
  expect(
    screen.getByRole('region', { name: 'Featured inspiration' })
  ).toBeVisible()
  expect(screen.getByRole('region', { name: 'Scene presets' })).toBeVisible()
}

it('has no runnable examples or canvas button on an unconfigured site', async () => {
  await renderPage(CreationCenter, [], true)
  expect(
    await screen.findByText('No creation presets have been published.')
  ).toBeVisible()
  expectHubFrame()
  expect(screen.queryByRole('article')).toBeNull()
  expect(screen.queryByRole('link', { name: 'Canvas' })).toBeNull()
  expect(screen.queryByText('Playground is disabled on this site.')).toBeNull()
})

it('keeps the hub frame visible while loading and if the endpoint is missing', async () => {
  let reject!: (error: Error) => void
  const pending = new Promise<unknown[]>((_, rejectPromise) => {
    reject = rejectPromise
  })
  await renderPage(CreationCenter, pending, false)
  expect(await screen.findByRole('status')).toHaveTextContent('Loading')
  expectHubFrame()
  reject(Object.assign(new Error('missing'), { response: { status: 404 } }))
  expect(
    await screen.findByText('Creation presets are unavailable on this site.')
  ).toBeVisible()
  expectHubFrame()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
  expect(screen.queryByRole('article')).toBeNull()
})

it('keeps both sections and lets visitors clear a search with no matches', async () => {
  await renderPage(CreationCenter, [preset], true)
  await screen.findByRole('link', { name: /Try in Playground/ })
  const search = screen.getByRole('searchbox')
  await userEvent.type(search, 'missing')
  expectHubFrame()
  const results = screen.getByRole('region', { name: 'Scene presets' })
  expect(within(results).getByText('No results found')).toBeVisible()
  await userEvent.click(
    within(results).getByRole('button', { name: 'Clear filters' })
  )
  expect(search).toHaveValue('')
  expect(within(results).getByRole('article')).toBeVisible()
})

it('finds a published preset by tag without including private drafts or untagged matches', async () => {
  await renderPage(
    CreationCenter,
    [
      preset,
      { ...preset, id: 'cover', title: 'Cover design', tags: ['Editorial'] },
      {
        ...preset,
        id: 'draft',
        title: 'Private',
        tags: ['Editorial'],
        published: false,
      },
    ],
    true
  )
  await screen.findByRole('heading', { name: 'Cover design' })
  await userEvent.type(screen.getByRole('searchbox'), 'EDITORIAL')
  const card = screen.getByRole('article')
  expect(card).toHaveTextContent('Cover design')
  expect(within(card).getByText('Editorial')).toBeVisible()
  expect(screen.queryByText('Private')).not.toBeInTheDocument()
})

it('opens only the published target when the sidebar entry is hidden', async () => {
  const draft = {
    ...preset,
    id: 'draft',
    title: 'Unreleased request',
    published: false,
  }
  const cover = 'https://assets.example.test/cover.jpg'
  await renderPage(
    CreationCenter,
    [{ ...preset, cover_url: cover }, draft],
    true
  )
  expect(
    await screen.findByRole('link', { name: /Try in Playground/ })
  ).toHaveAttribute('href', '/playground?preset=studio-photo&group=studio')
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.queryByText(draft.title)).toBeNull()
  const artwork = within(screen.getByRole('article')).getByRole('presentation')
  expect(artwork).toHaveAttribute('src', cover)
  fireEvent.error(artwork)
  expect(artwork).not.toBeInTheDocument()
  expect(screen.getByRole('article')).toHaveTextContent(preset.title)
})

it('does not substitute an available model for an inaccessible preset', async () => {
  await renderPage(CreationCenter, [preset], false)
  expect(
    await screen.findByText('This model is not available for this preset.')
  ).toBeVisible()
  expect(screen.queryByRole('link', { name: /Try in Playground/ })).toBeNull()
})

it('rechecks the exact group on opening a preset without silently selecting a different model or submitting a request', async () => {
  const writes = vi.spyOn(api, 'post')
  await renderPage(
    () => <PresetWorkspace id={preset.id} group='studio' />,
    [preset],
    true,
    false
  )
  expect(
    await screen.findByText('This model is not available for this preset.')
  ).toBeVisible()
  expect(api.get).toHaveBeenCalledWith('/api/user/models', {
    params: expect.objectContaining({ group: 'studio' }),
  })
  expect(api.get).not.toHaveBeenCalledWith('/api/user/models', {
    params: expect.objectContaining({ group: 'default' }),
  })
  expect(writes).not.toHaveBeenCalled()
})
