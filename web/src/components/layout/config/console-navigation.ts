import type { TFunction } from 'i18next'
import {
  ChartColumn,
  CreditCard,
  FlaskConical,
  MessagesSquare,
  PlugZap,
  ServerCog,
  ShieldAlert,
  Ticket,
  Workflow,
} from 'lucide-react'

import type {
  NavGroup,
  NavLink,
  SidebarBadges,
} from '@/components/layout/types'
import { ROLE } from '@/lib/roles'

import { sidebarIcons } from './sidebar-icons'

export function buildConsoleNavigation(
  t: TFunction,
  role: number,
  badges: SidebarBadges = {}
): NavGroup[] {
  const signedIn = role >= ROLE.USER
  const admin = role >= ROLE.ADMIN
  const root = role >= ROLE.SUPER_ADMIN
  const entry = (
    sidebarKey: Exclude<keyof typeof sidebarIcons, 'home' | 'console'>,
    title: string,
    url: NavLink['url'],
    props: Partial<NavLink> = {}
  ): NavLink => ({
    sidebarKey,
    title,
    url,
    icon: sidebarIcons[sidebarKey],
    ...props,
  })
  return [
    {
      id: 'shell',
      title: '',
      items: [
        {
          sidebarKey: 'home-console',
          title: signedIn ? t('Console') : t('Platform home'),
          url: signedIn ? '/dashboard/overview' : '/',
          icon: signedIn ? sidebarIcons.console : sidebarIcons.home,
        },
        entry('models', t('Model Square'), '/pricing'),
      ],
    },
    {
      id: 'config',
      title: t('Configuration'),
      items: [
        entry('keys', t('API Keys'), '/keys'),
        ...(signedIn
          ? [entry('channels', t('Channel status'), '/channel-status')]
          : []),
      ],
    },
    {
      id: 'general',
      title: t('Account area'),
      items: [
        ...(signedIn
          ? [
              entry('llm-logs', t('LLM Logs'), '/usage-logs/common'),
              entry('task-logs', t('Task Logs'), '/usage-logs/task', {
                activeUrls: ['/usage-logs/drawing'],
                configUrls: ['/usage-logs/task', '/usage-logs/drawing'],
              }),
              entry('audit', t('Audit Logs'), '/usage-logs/audit'),
            ]
          : []),
        {
          sidebarKey: 'chat',
          title: t('External chat'),
          icon: sidebarIcons.chat,
          disabled: true,
          hidden: true,
        },
        entry('billing', t('Top up & billing'), '/wallet'),
        ...(admin
          ? [
              {
                sidebarKey: 'activity',
                title: t('Activity · unavailable'),
                disabled: true as const,
                icon: sidebarIcons.activity,
              },
            ]
          : []),
      ],
    },
    {
      id: 'personal',
      title: t('Settings'),
      items: [
        ...(signedIn
          ? [
              entry(
                'account',
                t('Account', { context: 'sidebar' }),
                '/profile'
              ),
              entry('security', t('Security'), '/security'),
              entry('support', t('Support'), '/about', {
                hash: 'timeline-notice-section',
              }),
            ]
          : []),
        entry('docs', t('Developer documentation'), '/docs'),
      ],
    },
    ...(admin
      ? [
          {
            id: 'admin',
            title: t('Admin', { context: 'sidebar' }),
            items: [
              entry('admin-channels', t('Channel management'), '/channels'),
              entry(
                'admin-upstream-balance',
                t('Upstream Balance'),
                '/upstream-balance'
              ),
              entry('admin-users', t('Users & billing'), '/users'),
              entry(
                'admin-models-sort',
                t('Model management'),
                '/models/metadata',
                { hint: t('Sort') }
              ),
              entry(
                'admin-ops',
                t('Models & operations'),
                '/models/deployments'
              ),
              entry('admin-profit', t('Profit Analysis'), '/profit-analytics'),
              entry(
                'admin-media-traffic',
                t('Media Traffic'),
                '/media-traffic'
              ),
              ...(root
                ? [
                    entry(
                      'admin-settings',
                      t('System Settings'),
                      '/system-settings/site',
                      {
                        activeUrls: ['/system-settings'],
                        badge: badges.modelPricing,
                      }
                    ),
                  ]
                : []),
            ],
          },
        ]
      : []),
    ...(signedIn
      ? [
          {
            id: 'more',
            title: t('More tools'),
            items: [
              {
                title: t('Dashboard'),
                url: '/dashboard/models',
                icon: ChartColumn,
              },
              {
                title: t('Chat'),
                type: 'chat-presets' as const,
                icon: MessagesSquare,
              },
              ...(admin
                ? [
                    {
                      title: t('Redemption Codes'),
                      url: '/redemption-codes',
                      icon: Ticket,
                    },
                    {
                      title: t('Subscriptions'),
                      url: '/subscriptions',
                      icon: CreditCard,
                    },
                    {
                      title: t('Violation Audit'),
                      url: '/violation-audit',
                      icon: ShieldAlert,
                    },
                  ]
                : []),
              ...(root
                ? [
                    {
                      title: t('System Info'),
                      url: '/system-info',
                      icon: ServerCog,
                    },
                    {
                      title: t('Plugins'),
                      url: '/task-plugins',
                      icon: PlugZap,
                    },
                    {
                      title: t('Request processing'),
                      url: '/request-processing',
                      icon: Workflow,
                    },
                  ]
                : []),
            ],
          },
          {
            id: 'workspace-footer',
            title: t('Sidebar footer'),
            items: [
              {
                title: t('Canvas / Playground'),
                url: '/playground',
                icon: FlaskConical,
              },
            ],
          },
        ]
      : []),
  ]
}
