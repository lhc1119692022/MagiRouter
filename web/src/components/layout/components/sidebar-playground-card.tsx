import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export function SidebarPlaygroundCard({ title }: { title: string }) {
  const { t } = useTranslation()

  return (
    <Link
      to='/playground'
      title={title}
      aria-label={title}
      className='sidebar-playground-card'
    >
      <span className='sidebar-playground-icon' aria-hidden='true'>
        <svg
          width='15'
          height='15'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.8'
          strokeLinecap='round'
          strokeLinejoin='round'
        >
          <path d='M10 2v7.31' />
          <path d='M14 9.3V1.99' />
          <path d='M8.5 2h7' />
          <path d='M14 9.3a6.5 6.5 0 1 1-4 0' />
          <path d='M5.52 16h12.96' />
        </svg>
      </span>
      <span className='sidebar-playground-text'>
        <span className='sidebar-playground-title'>{title}</span>
        <span className='sidebar-playground-sub'>
          {t('Live debugging and multimodal creation')}
        </span>
      </span>
      <span className='sidebar-playground-arrow' aria-hidden='true'>
        ↗
      </span>
    </Link>
  )
}
