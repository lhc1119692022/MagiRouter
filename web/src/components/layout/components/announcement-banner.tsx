/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useTranslation } from 'react-i18next'

export interface AnnouncementBannerProps {
  message: string
  showAction: boolean
  onAction: () => void
  onDismiss: () => void
}

export function AnnouncementBanner(props: AnnouncementBannerProps) {
  const { t } = useTranslation()

  return (
    <div
      id='announcement-bar'
      className='el-banner'
      role='region'
      aria-label={t('System Announcement')}
    >
      <svg
        className='el-banner-ear-left'
        viewBox='0 0 20 22'
        aria-hidden='true'
      >
        <path d='M20 2C8.95431 2 0 10.9543 0 22V0H20V2Z' fill='currentColor' />
      </svg>
      <svg
        className='el-banner-ear-right'
        viewBox='0 0 20 22'
        aria-hidden='true'
      >
        <path d='M0 2C11.0457 2 20 10.9543 20 22V0H0V2Z' fill='currentColor' />
      </svg>

      <div className='el-banner-inner'>
        <span className='el-banner-tag'>
          <svg
            width='13'
            height='13'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.9'
            strokeLinecap='round'
            strokeLinejoin='round'
            aria-hidden='true'
          >
            <path d='M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' />
            <path d='M10.3 21a1.94 1.94 0 0 0 3.4 0' />
          </svg>
          <span>站点通知</span>
        </span>
        <span className='el-banner-sep' />
        <span className='el-banner-text'>{props.message}</span>
        {props.showAction && (
          <button
            type='button'
            className='el-banner-cta'
            onClick={props.onAction}
          >
            查看通知 →
          </button>
        )}
      </div>

      <button
        type='button'
        className='el-banner-close'
        data-no-press
        onClick={props.onDismiss}
        aria-label={t('Close')}
      >
        <svg
          width='16'
          height='16'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.75'
          strokeLinecap='round'
          aria-hidden='true'
        >
          <path d='M18 6 6 18M6 6l12 12' />
        </svg>
      </button>
    </div>
  )
}
