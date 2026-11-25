import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'

import type { PricingModel } from '@/features/pricing/types'

import { Hero } from '../components/hero'
import type { HomeShowcaseConfig } from '../lib/showcase-config'

afterEach(cleanup)

const sampleModels: PricingModel[] = [
  {
    id: 1,
    model_name: 'gpt-6.2-sol',
    vendor_name: 'OpenAI',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 2,
    enable_groups: ['default'],
    supported_endpoint_types: ['openai-response'],
  },
  {
    id: 2,
    model_name: 'gpt-image-2.5',
    vendor_name: 'OpenAI',
    quota_type: 1,
    model_ratio: 0,
    completion_ratio: 1,
    model_price: 0.04,
    enable_groups: ['default'],
    supported_endpoint_types: ['image-generation'],
  },
]

async function renderHero(showcaseConfig?: HomeShowcaseConfig) {
  const root = createRootRoute()
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <Hero
        isAuthenticated
        baseUrl='https://api.example.test'
        models={sampleModels}
        showcaseConfig={showcaseConfig}
      />
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}

test('links featured models directly to Playground and appends inline explore-all link', async () => {
  await renderHero({
    text: {
      title: '定制语言模型舞台',
      description: '左侧垂直居中展示文案。',
      media_url: 'https://cdn.example.test/hero-text.webp',
      models: ['gpt-6.2-sol', 'claude-opus-5.5'],
    },
  })

  expect(
    await screen.findByRole('heading', { name: '定制语言模型舞台' })
  ).toBeVisible()

  const baseUrlButton = screen.getByRole('button', {
    name: '复制 Base URL https://api.example.test',
  })
  expect(baseUrlButton).toHaveTextContent('https://api.example.test')
  expect(baseUrlButton).not.toHaveTextContent('/v1')

  const bgImage = document.querySelector('img.showcase-media-bg')
  expect(bgImage).toHaveAttribute(
    'src',
    'https://cdn.example.test/hero-text.webp'
  )

  const gptLink = screen.getByRole('link', { name: /gpt-6\.2-sol/ })
  const gptDest = new URL(gptLink.getAttribute('href') ?? '', 'https://x.test')
  expect(gptDest.pathname).toBe('/playground')
  expect(Object.fromEntries(gptDest.searchParams)).toEqual({
    mode: 'chat',
    model: 'gpt-6.2-sol',
  })

  const exploreLink = screen.getByRole('link', { name: '探索全部' })
  expect(exploreLink).toHaveClass('showcase-explore-link')
  expect(exploreLink).not.toHaveClass('el-btn')
  const exploreDest = new URL(
    exploreLink.getAttribute('href') ?? '',
    'https://x.test'
  )
  expect(exploreDest.pathname).toBe('/pricing')
  expect(exploreDest.searchParams.get('task')).toBe('text')
})

test('switches tabs to render video background media and image Playground links', async () => {
  const user = userEvent.setup()
  await renderHero({
    image: {
      media_url: 'https://cdn.example.test/image-reel.mp4',
      poster_url: '/poster-image.webp',
    },
  })

  await user.click(await screen.findByRole('tab', { name: '图片生成' }))

  const video = document.querySelector('video.showcase-media-bg')
  expect(video).toHaveAttribute(
    'src',
    'https://cdn.example.test/image-reel.mp4'
  )
  expect(video).toHaveAttribute('poster', '/poster-image.webp')

  const imageModelLink = screen.getByRole('link', { name: /gpt-image-2\.5/ })
  const imageDest = new URL(
    imageModelLink.getAttribute('href') ?? '',
    'https://x.test'
  )
  expect(imageDest.pathname).toBe('/playground')
  expect(Object.fromEntries(imageDest.searchParams)).toEqual({
    mode: 'image',
    model: 'gpt-image-2.5',
  })
})
