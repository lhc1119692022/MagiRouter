import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { parseHeaderNavModulesFromStatus } from '@/lib/nav-modules'
import { cn } from '@/lib/utils'

import type { TopNavLink } from '../types'
import { HeaderNavLink } from './header-nav-link'

const creativeIcons = {
  center: (
    <path d='m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z' />
  ),
  canvas: (
    <>
      <rect x='3' y='3' width='7' height='7' rx='1.5' />
      <rect x='14' y='14' width='7' height='7' rx='1.5' />
      <path d='M10 6.5h4.5A2.5 2.5 0 0 1 17 9v5' />
    </>
  ),
  workbench: (
    <>
      <rect x='3' y='4' width='18' height='16' rx='2.5' />
      <path d='M3 10h18M9 10v10' />
    </>
  ),
  models: (
    <>
      {[
        [3, 3],
        [14, 3],
        [14, 14],
        [3, 14],
      ].map(([left, top]) => (
        <rect
          key={`${left}:${top}`}
          x={left}
          y={top}
          width='7'
          height='7'
          rx='1'
        />
      ))}
    </>
  ),
}

export function CreationNavigation({
  link,
  pricingLink,
  mobile,
  active,
  onNavigate,
}: {
  link: TopNavLink
  pricingLink?: TopNavLink
  mobile?: boolean
  active?: boolean
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { canvasUrl, workbenchUrl } = parseHeaderNavModulesFromStatus(
    status ?? null
  )
  const destination = (href?: string) =>
    href ? { ...link, href, external: href.startsWith('https://') } : undefined
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !wrap.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const navigate = () => {
    setOpen(false)
    onNavigate?.()
  }
  const options = [
    {
      id: 'center',
      title: t('AI Creation Center'),
      description: t('Choose image, video and audio presets by scene.'),
      link,
    },
    {
      id: 'canvas',
      title: t('Canvas'),
      description: t('Visual workflow editor'),
      link: destination(canvasUrl),
    },
    {
      id: 'workbench',
      title: t('Workbench'),
      description: t('Manage project storyboards and assets'),
      link: destination(workbenchUrl),
    },
    ...(pricingLink
      ? [
          {
            id: 'models' as const,
            title: t('All creative models'),
            description: t('Browse image, video and audio model pricing.'),
            link: pricingLink,
          },
        ]
      : []),
  ] as const
  return (
    <div
      ref={wrap}
      className={cn(
        'nav-dropdown-wrap creation-nav',
        mobile && 'creation-nav-mobile'
      )}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <Button
        ref={trigger}
        type='button'
        variant='ghost'
        className={cn(
          'nav-link-item creation-nav-trigger',
          (active || open) && 'is-active'
        )}
        aria-current={active ? 'location' : undefined}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={link.disabled}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span>{link.title}</span>
        <svg
          width='12'
          height='12'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
          aria-hidden='true'
        >
          <path d='m6 9 6 6 6-6' />
        </svg>
      </Button>
      {open && (
        <div
          id={panelId}
          role='group'
          aria-label={t('AI Studio menu')}
          className='nav-dropdown-panel'
        >
          {options.map((option) => {
            const body = (
              <>
                <span className='dropdown-icon'>
                  <svg
                    width='15'
                    height='15'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='1.8'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    aria-hidden='true'
                  >
                    {creativeIcons[option.id]}
                  </svg>
                </span>
                <span>
                  <span className='dropdown-title-row'>
                    <span className='dropdown-title'>{option.title}</span>
                    {!option.link && (
                      <span className='dropdown-soon-badge'>
                        {t('Under construction')}
                      </span>
                    )}
                  </span>
                  <span className='dropdown-desc block'>
                    {option.description}
                  </span>
                </span>
              </>
            )
            return option.link ? (
              <HeaderNavLink
                key={option.id}
                link={{ ...option.link, title: option.title }}
                search={
                  option.id === 'models' ? { task: 'creative' } : undefined
                }
                className='dropdown-item'
                onNavigate={navigate}
              >
                {body}
              </HeaderNavLink>
            ) : (
              <button
                key={option.id}
                type='button'
                disabled
                className='dropdown-item is-disabled-item'
              >
                {body}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
