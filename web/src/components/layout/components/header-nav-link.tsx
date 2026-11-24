import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import type { TopNavLink } from '../types'

export function HeaderNavLink({
  link,
  className,
  onNavigate,
  children,
  search,
}: {
  link: TopNavLink
  className?: string
  onNavigate?: () => void
  children?: ReactNode
  search?: Record<string, string>
}) {
  if (link.disabled) {
    return (
      <span className={className} aria-disabled='true'>
        {children ?? link.title}
      </span>
    )
  }
  if (link.external) {
    return (
      <a
        href={link.href}
        target='_blank'
        rel='noopener noreferrer'
        className={className}
        onClick={onNavigate}
      >
        {children ?? link.title}
      </a>
    )
  }
  if (link.requiresAuth) {
    return (
      <Link
        to='/sign-in'
        search={{
          redirect: search
            ? `${link.href}?${new URLSearchParams(search)}`
            : link.href,
        }}
        className={className}
        onClick={onNavigate}
      >
        {children ?? link.title}
      </Link>
    )
  }
  return (
    <Link
      to={link.href}
      search={search ?? link.search}
      hash={link.hash}
      className={className}
      onClick={onNavigate}
    >
      {children ?? link.title}
    </Link>
  )
}
