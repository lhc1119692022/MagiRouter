import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { DocsCenterSection } from '../docs-center-section'

vi.mock('../../components/settings-page-context', async (original) => ({
  ...(await original<
    typeof import('../../components/settings-page-context')
  >()),
  SettingsPageFormActions: (props: {
    onSave: () => void
    isSaveDisabled: boolean
  }) => (
    <button
      type='button'
      disabled={props.isSaveDisabled}
      onClick={props.onSave}
    >
      Save changes
    </button>
  ),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function renderEditor(initial = '{}') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const root = createRootRoute()
  const settings = createRoute({
    getParentRoute: () => root,
    path: '/system-settings/content/$section',
    component: () => <DocsCenterSection value={initial} />,
  })
  const site = createRoute({
    getParentRoute: () => root,
    path: '/system-settings/site/$section',
    component: () => <div />,
  })
  const router = createRouter({
    routeTree: root.addChildren([settings, site]),
    history: createMemoryHistory({
      initialEntries: ['/system-settings/content/docs'],
    }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

test('saves example models, custom articles, and model overrides to console_setting.docs_config', async () => {
  const user = userEvent.setup()
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/pricing') {
      return {
        data: {
          success: true,
          data: [
            {
              id: 1,
              model_name: 'gpt-9-live',
              supported_endpoint_types: ['openai'],
            },
            {
              id: 2,
              model_name: 'video-pro-2',
              supported_endpoint_types: ['video'],
            },
          ],
          vendors: [],
        },
      }
    }
    return { data: { success: true, data: {} } }
  })
  const putSpy = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })

  await renderEditor()

  const saveButton = screen.getByRole('button', { name: 'Save changes' })
  expect(saveButton).toBeDisabled()

  const openaiInput = screen.getByLabelText('OpenAI / Default Example Model')
  await user.type(openaiInput, 'gpt-9-live')
  await waitFor(() => expect(saveButton).toBeEnabled())

  await user.click(screen.getByRole('tab', { name: /Guide Articles/ }))
  await user.click(screen.getByRole('button', { name: 'Add Custom Article' }))
  await user.type(screen.getByLabelText('Article ID'), 'custom-changelog')
  await user.type(screen.getByLabelText('Title'), '模型更新日志')
  await user.type(
    screen.getByLabelText('Markdown Body'),
    '## 最新上线\n\n已上线新模型。'
  )
  await user.click(screen.getByRole('button', { name: 'Apply' }))

  await user.click(screen.getByRole('tab', { name: /Model Overrides/ }))
  await user.type(
    screen.getByPlaceholderText('Select or enter a model ID'),
    'video-pro-2'
  )
  await user.click(screen.getByRole('button', { name: 'Add Model Override' }))
  await user.type(screen.getByLabelText('Endpoint Path'), '/v1/videos')
  await user.type(screen.getByLabelText('Summary'), '高帧率视频模型')
  await user.click(screen.getByRole('button', { name: 'Apply' }))

  await user.click(saveButton)

  await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(1))
  expect(putSpy).toHaveBeenCalledWith('/api/option/', {
    key: 'console_setting.docs_config',
    value: JSON.stringify({
      example_models: { openai: 'gpt-9-live' },
      articles: [
        {
          id: 'custom-changelog',
          group: '快速开始',
          title: '模型更新日志',
          markdown: '## 最新上线\n\n已上线新模型。',
        },
      ],
      model_overrides: [
        {
          model_id: 'video-pro-2',
          summary: '高帧率视频模型',
          endpoint_path: '/v1/videos',
        },
      ],
    }),
  })
})
