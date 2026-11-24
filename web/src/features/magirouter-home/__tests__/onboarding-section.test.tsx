import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import { IntegrationSection } from '../components/integration-section'

afterEach(cleanup)

async function renderOnboarding(isAuthenticated: boolean) {
  const root = createRootRoute()
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <IntegrationSection isAuthenticated={isAuthenticated} />,
  })
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}

test('renders three beginner-friendly workflow cards with model and app icons for signed-in users', async () => {
  await renderOnboarding(true)

  expect(
    await screen.findByRole('heading', { name: '三步快速上手' })
  ).toBeVisible()
  expect(screen.getByRole('link', { name: '前往仪表板' })).toHaveAttribute(
    'href',
    '/dashboard'
  )
  expect(screen.getByRole('link', { name: '在线充值' })).toHaveAttribute(
    'href',
    '/wallet'
  )
  expect(screen.getByRole('link', { name: /创建 API 密钥/ })).toHaveAttribute(
    'href',
    '/keys'
  )
  expect(screen.getByRole('link', { name: /查看接入指南/ })).toHaveAttribute(
    'href',
    '/docs'
  )
  expect(screen.getByLabelText('支持的主流模型品牌')).toHaveTextContent(
    'Claude'
  )
  expect(screen.getByLabelText('Magpie')).toBeInTheDocument()
  expect(screen.getByLabelText('CC Switch')).toBeInTheDocument()
  expect(screen.getByLabelText('Codex')).toBeInTheDocument()
  expect(screen.getByLabelText('Claude Code')).toBeInTheDocument()
  expect(screen.getByLabelText('WorkBuddy')).toBeInTheDocument()
  expect(screen.getByLabelText('豆包工作')).toBeInTheDocument()
  expect(screen.getByLabelText('ZCode')).toBeInTheDocument()
  expect(screen.getByLabelText('Qoder')).toBeInTheDocument()
})

test('routes unauthenticated users to sign-up and sign-in redirects', async () => {
  await renderOnboarding(false)

  expect(await screen.findByRole('link', { name: '注册账号' })).toHaveAttribute(
    'href',
    '/sign-up'
  )
  expect(screen.getByRole('link', { name: '在线充值' })).toHaveAttribute(
    'href',
    '/sign-in?redirect=%2Fwallet'
  )
  expect(screen.getByRole('link', { name: /创建 API 密钥/ })).toHaveAttribute(
    'href',
    '/sign-in?redirect=%2Fkeys'
  )
})
