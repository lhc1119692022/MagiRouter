import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface HeaderAccountMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initials: string
  displayName: string
  secondaryText?: string
  formattedBalance: string
  onSignOut: () => void
}

export function HeaderAccountMenu(props: HeaderAccountMenuProps) {
  const { t } = useTranslation()
  const balanceLabel = useId()
  return (
    <div className='nav-popover-anchor'>
      <DropdownMenu
        modal={false}
        open={props.open}
        onOpenChange={props.onOpenChange}
      >
        <DropdownMenuTrigger
          className='nav-user-pill'
          title={t('Account menu')}
          aria-label={t('Account menu')}
        >
          <span className='nav-user-avatar'>{props.initials}</span>
          <span className='hidden sm:inline'>{props.displayName}</span>
          <svg
            className='nav-user-chevron'
            width='13'
            height='13'
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
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align='end'
          sideOffset={10}
          className='nav-account-menu header-account-popover'
          aria-label={t('Account menu')}
        >
          <div className='nav-account-header'>
            <div className='nav-account-name'>{props.displayName}</div>
            {props.secondaryText &&
              props.secondaryText !== props.displayName && (
                <div className='nav-account-email'>{props.secondaryText}</div>
              )}
            <DropdownMenuGroup
              className='nav-account-bal account-balance-card'
              aria-labelledby={balanceLabel}
            >
              <div className='account-balance-details'>
                <span id={balanceLabel}>{t('Available Balance')}</span>
                <strong className='tabular-nums'>
                  {props.formattedBalance}
                </strong>
              </div>
              <DropdownMenuItem
                className='account-recharge-action'
                render={<Link to='/wallet' />}
              >
                {t('Recharge')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </div>
          <DropdownMenuItem
            className='nav-menu-item'
            render={<Link to='/dashboard' />}
          >
            <span className='nav-menu-item-left'>
              <svg
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.8'
                strokeLinecap='round'
                strokeLinejoin='round'
                aria-hidden='true'
              >
                <path d='M22 12h-4l-3 9L9 3l-3 9H2' />
              </svg>
              {t('Console')}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className='nav-menu-item'
            render={<Link to='/security' />}
          >
            <span className='nav-menu-item-left'>
              <svg
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.8'
                strokeLinecap='round'
                strokeLinejoin='round'
                aria-hidden='true'
              >
                <path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
              </svg>
              {t('Account security')}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className='nav-menu-sep' />
          <DropdownMenuItem
            className='nav-menu-item is-danger'
            variant='destructive'
            onClick={props.onSignOut}
          >
            <span className='nav-menu-item-left'>
              <svg
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.8'
                strokeLinecap='round'
                strokeLinejoin='round'
                aria-hidden='true'
              >
                <path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' />
                <polyline points='16 17 21 12 16 7' />
                <line x1='21' y1='12' x2='9' y2='12' />
              </svg>
              {t('Log out')}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
