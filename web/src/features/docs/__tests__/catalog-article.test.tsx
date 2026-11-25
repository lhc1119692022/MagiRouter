import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { DocsCenter } from '../index'

async function showDocs(
  doc: string | undefined,
  catalog: () => Promise<object[]>,
  options?: {
    statusData?: Record<string, unknown>
    docsConfig?: Record<string, unknown>
  }
) {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/pricing') {
      return { data: { success: true, data: await catalog(), vendors: [] } }
    }
    if (url === '/api/docs_config') {
      return { data: { success: true, data: options?.docsConfig ?? {} } }
    }
    if (url === '/api/status') {
      return { data: { success: true, data: options?.statusData ?? {} } }
    }
    return { data: { success: true, data: url === '/api/notice' ? '' : {} } }
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const root = createRootRoute()
  const docs = createRoute({
    getParentRoute: () => root,
    path: '/docs/',
    validateSearch: (value: Record<string, unknown>) => ({
      doc: typeof value.doc === 'string' ? value.doc : undefined,
    }),
    component: DocsCenter,
  })
  const router = createRouter({
    routeTree: root.addChildren([docs]),
    history: createMemoryHistory({
      initialEntries: [doc ? `/docs?doc=${encodeURIComponent(doc)}` : '/docs'],
    }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('keeps the requested model link pending, then renders only a catalog-backed article', async () => {
  let resolveCatalog: (models: object[]) => void = () => {
    throw new Error('Uninitialized catalog')
  }
  const pending = new Promise<object[]>((resolve) => {
    resolveCatalog = resolve
  })
  await showDocs('model:catalog-only', () => pending)
  expect(await screen.findByRole('heading', { name: 'Loading' })).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: 'Model documentation unavailable' })
  ).not.toBeInTheDocument()
  await act(async () => {
    resolveCatalog([
      {
        id: 1,
        model_name: 'catalog-only',
        supported_endpoint_types: ['openai'],
      },
    ])
    await pending
  })
  expect(
    await screen.findByRole('heading', { name: 'catalog-only' })
  ).toBeVisible()
})

it('leaves an unknown model deep link in place until the user returns to the directory', async () => {
  const user = userEvent.setup()
  const router = await showDocs('model:absent', async () => [])
  expect(
    await screen.findByRole('heading', {
      name: 'Model documentation unavailable',
    })
  ).toBeVisible()
  expect(router.state.location.search.doc).toBe('model:absent')
  expect(document.body).not.toHaveTextContent(
    '可直接通过 MagiRouter 统一密钥调用'
  )
  await user.click(screen.getByRole('link', { name: 'Back to documentation' }))
  expect(
    await screen.findByRole('heading', { level: 1, name: '快速开始' })
  ).toBeVisible()
})

it('reports a catalog error without inventing a model document', async () => {
  await showDocs('model:unknown', async () => {
    throw new Error('Offline')
  })
  expect(
    await screen.findByRole('heading', { name: 'Failed to load models' })
  ).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: 'unknown' })
  ).not.toBeInTheDocument()
})

it('keeps all API overview model families collapsed by default and toggles per modality', async () => {
  const user = userEvent.setup()
  await showDocs(undefined, async () => [
    {
      id: 1,
      model_name: 'gpt-5',
      supported_endpoint_types: ['openai'],
    },
    {
      id: 2,
      model_name: 'custom-text-model',
      supported_endpoint_types: ['openai'],
    },
    {
      id: 3,
      model_name: 'custom-image-model',
      supported_endpoint_types: ['image'],
    },
  ])

  const gptFamilyButton = await screen.findByRole('button', {
    name: /GPT 系列/,
  })
  const otherFamilyButtons = screen.getAllByRole('button', {
    name: /其他 系列/,
  })

  expect(gptFamilyButton).toHaveAttribute('aria-expanded', 'false')
  expect(otherFamilyButtons).toHaveLength(2)
  for (const button of otherFamilyButtons) {
    expect(button).toHaveAttribute('aria-expanded', 'false')
  }
  expect(
    screen.queryByRole('button', { name: 'gpt-5' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'custom-text-model' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'custom-image-model' })
  ).not.toBeInTheDocument()

  await user.click(otherFamilyButtons[0])
  expect(otherFamilyButtons[0]).toHaveAttribute('aria-expanded', 'true')
  expect(otherFamilyButtons[1]).toHaveAttribute('aria-expanded', 'false')
  expect(
    screen.getByRole('button', { name: 'custom-text-model' })
  ).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'custom-image-model' })
  ).not.toBeInTheDocument()

  await user.click(otherFamilyButtons[0])
  expect(otherFamilyButtons[0]).toHaveAttribute('aria-expanded', 'false')
  expect(
    screen.queryByRole('button', { name: 'custom-text-model' })
  ).not.toBeInTheDocument()
})

it('expands only the active model family when opening a model deep link', async () => {
  await showDocs('model:claude-sonnet-4-6', async () => [
    {
      id: 1,
      model_name: 'gpt-5',
      supported_endpoint_types: ['openai'],
    },
    {
      id: 2,
      model_name: 'claude-sonnet-4-6',
      supported_endpoint_types: ['anthropic'],
    },
  ])

  expect(
    await screen.findByRole('heading', { name: 'claude-sonnet-4-6' })
  ).toBeVisible()
  expect(screen.getByRole('button', { name: /GPT 系列/ })).toHaveAttribute(
    'aria-expanded',
    'false'
  )
  expect(screen.getByRole('button', { name: /Claude 系列/ })).toHaveAttribute(
    'aria-expanded',
    'true'
  )
})

it('syncs entry domains from api_info and picks live example models automatically', async () => {
  await showDocs(
    undefined,
    async () => [
      {
        id: 1,
        model_name: 'gpt-9-live',
        supported_endpoint_types: ['openai'],
      },
      {
        id: 2,
        model_name: 'claude-live-5',
        supported_endpoint_types: ['anthropic'],
      },
    ],
    {
      statusData: {
        server_address: 'https://api.custom.test',
        api_info_enabled: true,
        api_info: [
          {
            id: 1,
            route: '香港直连',
            url: 'https://hk.custom.test',
            description: '亚洲低延迟入口',
            color: 'blue',
          },
        ],
      },
    }
  )

  expect(await screen.findByText('香港直连')).toBeVisible()
  expect(
    screen.getAllByText('https://hk.custom.test/v1').length
  ).toBeGreaterThan(0)
  expect(document.body).not.toHaveTextContent('cn.magirouter.com')
  expect(document.body).toHaveTextContent('gpt-9-live')
})

it('applies docs_config overrides for hidden chapters, custom markdown articles, and model overrides', async () => {
  const user = userEvent.setup()
  await showDocs(
    'custom-guide',
    async () => [
      {
        id: 1,
        model_name: 'hidden-model',
        supported_endpoint_types: ['openai'],
      },
      {
        id: 2,
        model_name: 'special-video-v2',
        supported_endpoint_types: ['video'],
      },
    ],
    {
      statusData: {
        server_address: 'https://gateway.custom.test',
      },
      docsConfig: {
        articles: [
          { id: 'task-batch', hidden: true },
          {
            id: 'custom-guide',
            group: '快速开始',
            title: '定制接入说明',
            summary: '来自后台配置的自定义章节',
            markdown:
              '## 1. 自定义小节\n\n请访问 {{V1_URL}} 调用接口。\n\n## 2. 注意事项\n\n支持 Markdown 表格与列表。',
          },
        ],
        model_overrides: [
          { model_id: 'hidden-model', hidden: true },
          {
            model_id: 'special-video-v2',
            family_name: '专属视频系列',
            cap: 'video',
            summary: '后台覆写的视频模型简介',
            endpoint_path: '/v1/videos/generations',
            markdown:
              '## 专属参数\n\n调用 {{MODEL}} 时可传入 `resolution=1080p`，端点为 {{V1_URL}}。',
          },
        ],
      },
    }
  )

  expect(
    await screen.findByRole('heading', { level: 1, name: '定制接入说明' })
  ).toBeVisible()
  expect(screen.getByRole('button', { name: '1. 自定义小节' })).toBeVisible()
  expect(screen.getByRole('button', { name: '2. 注意事项' })).toBeVisible()
  expect(document.body).toHaveTextContent('https://gateway.custom.test/v1')
  expect(
    screen.queryByRole('button', { name: '批量任务 (Batch)' })
  ).not.toBeInTheDocument()

  const customFamilyBtn = await screen.findByRole('button', {
    name: /专属视频系列/,
  })
  expect(customFamilyBtn).toHaveAttribute('aria-expanded', 'false')
  expect(
    screen.queryByRole('button', { name: /其他 系列/ })
  ).not.toBeInTheDocument()

  await user.click(customFamilyBtn)
  await user.click(screen.getByRole('button', { name: 'special-video-v2' }))

  expect(
    await screen.findByRole('heading', { level: 1, name: 'special-video-v2' })
  ).toBeVisible()
  expect(screen.getByText('后台覆写的视频模型简介')).toBeVisible()
  expect(
    screen.getByText('https://gateway.custom.test/v1/videos/generations')
  ).toBeVisible()
  expect(document.body).toHaveTextContent('resolution=1080p')
  expect(document.body).toHaveTextContent('special-video-v2')
})
