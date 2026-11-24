import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProfileHeader } from '../components/profile-header'
import type { UserProfile } from '../types'

const BASE_PROFILE: UserProfile = {
  id: 7,
  username: 'alice',
  display_name: 'Alice',
  role: 1,
  email: 'alice@example.com',
  group: 'vip',
  quota: 1000000,
  used_quota: 250000,
  request_count: 42,
  status: 1,
  aff_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  created_time: 1700000000,
}

function getConcurrencyMetricContainer(): HTMLElement {
  const term = screen.getByText('Concurrency Limit')
  const container = term.parentElement
  if (!container) {
    throw new Error('Missing concurrency metric container')
  }
  return container
}

describe('ProfileHeader concurrency limit stat', () => {
  it('renders four metric skeletons while loading', () => {
    const { container } = render(<ProfileHeader profile={null} loading />)
    const metrics = container.querySelector('.identity-metrics')
    expect(metrics).not.toBeNull()
    expect(metrics?.children).toHaveLength(4)
  })

  it('shows unlimited when concurrency limit is disabled', () => {
    render(
      <ProfileHeader
        loading={false}
        profile={{
          ...BASE_PROFILE,
          max_concurrency: 10,
          concurrency_limit: {
            enabled: false,
            user_override: 10,
            effective_limit: 0,
            source: 'disabled',
          },
        }}
      />
    )

    const metric = getConcurrencyMetricContainer()
    expect(within(metric).getByText('Unlimited')).toBeInTheDocument()
    expect(
      within(metric).getByText('Concurrency limit disabled')
    ).toBeInTheDocument()
  })

  it('shows formatted effective limit for a custom user override', () => {
    render(
      <ProfileHeader
        loading={false}
        profile={{
          ...BASE_PROFILE,
          max_concurrency: 1200,
          concurrency_limit: {
            enabled: true,
            user_override: 1200,
            effective_limit: 1200,
            source: 'user',
          },
        }}
      />
    )

    const metric = getConcurrencyMetricContainer()
    expect(within(metric).getByText('1,200')).toBeInTheDocument()
    expect(within(metric).getByText('Custom user limit')).toBeInTheDocument()
  })

  it('shows group policy limit when enforced by user group', () => {
    render(
      <ProfileHeader
        loading={false}
        profile={{
          ...BASE_PROFILE,
          concurrency_limit: {
            enabled: true,
            user_override: 0,
            effective_limit: 16,
            source: 'group',
          },
        }}
      />
    )

    const metric = getConcurrencyMetricContainer()
    expect(within(metric).getByText('16')).toBeInTheDocument()
    expect(within(metric).getByText('Group policy (vip)')).toBeInTheDocument()
  })

  it('shows unlimited when group policy has no cap', () => {
    render(
      <ProfileHeader
        loading={false}
        profile={{
          ...BASE_PROFILE,
          concurrency_limit: {
            enabled: true,
            user_override: 0,
            effective_limit: 0,
            source: 'group',
          },
        }}
      />
    )

    const metric = getConcurrencyMetricContainer()
    expect(within(metric).getByText('Unlimited')).toBeInTheDocument()
    expect(within(metric).getByText('Group policy (vip)')).toBeInTheDocument()
  })

  it('shows default policy limit when enforced by global default', () => {
    render(
      <ProfileHeader
        loading={false}
        profile={{
          ...BASE_PROFILE,
          concurrency_limit: {
            enabled: true,
            user_override: 0,
            effective_limit: 8,
            source: 'default',
          },
        }}
      />
    )

    const metric = getConcurrencyMetricContainer()
    expect(within(metric).getByText('8')).toBeInTheDocument()
    expect(
      within(metric).getByText('Default concurrency policy')
    ).toBeInTheDocument()
  })

  it('shows unlimited when default policy has no cap', () => {
    render(
      <ProfileHeader
        loading={false}
        profile={{
          ...BASE_PROFILE,
          concurrency_limit: {
            enabled: true,
            user_override: 0,
            effective_limit: 0,
            source: 'default',
          },
        }}
      />
    )

    const metric = getConcurrencyMetricContainer()
    expect(within(metric).getByText('Unlimited')).toBeInTheDocument()
    expect(
      within(metric).getByText('Default concurrency policy')
    ).toBeInTheDocument()
  })

  it('falls back to max_concurrency when concurrency_limit is absent', () => {
    const { rerender } = render(
      <ProfileHeader
        loading={false}
        profile={{
          ...BASE_PROFILE,
          max_concurrency: 15,
        }}
      />
    )

    let metric = getConcurrencyMetricContainer()
    expect(within(metric).getByText('15')).toBeInTheDocument()
    expect(within(metric).getByText('Custom user limit')).toBeInTheDocument()

    rerender(
      <ProfileHeader
        loading={false}
        profile={{
          ...BASE_PROFILE,
          max_concurrency: 0,
        }}
      />
    )

    metric = getConcurrencyMetricContainer()
    expect(within(metric).getByText('Unlimited')).toBeInTheDocument()
    expect(
      within(metric).getByText('Simultaneous requests')
    ).toBeInTheDocument()
  })
})
