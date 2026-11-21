import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

interface CtaBandProps {
  isAuthenticated: boolean
}

export function CtaBand(props: CtaBandProps) {
  const { t } = useTranslation()

  return (
    <section className='border-border border-t py-16 md:py-22'>
      <div className='mx-auto max-w-[1360px] px-4 md:px-6'>
        <div className='bg-foreground text-background flex flex-col items-start justify-between gap-8 rounded-[28px] px-7 py-10 sm:px-10 sm:py-12 md:flex-row md:items-end'>
          <div>
            <p className='font-mono text-[11px] tracking-[0.18em] uppercase opacity-70'>
              {t('Ready to Ship')}
            </p>
            <h2 className='mt-3 text-[28px] leading-[1.18] font-medium tracking-[-0.025em] md:text-[36px]'>
              {t('Start building with MagiRouter')}
            </h2>
            <p className='mt-3 max-w-[560px] text-[15px] leading-[1.65] opacity-75 md:text-[16px]'>
              {t('Sign up, top up, and make your first call in a few minutes.')}
            </p>
          </div>
          <div className='flex flex-wrap gap-3'>
            <Button
              className='bg-background text-foreground hover:bg-background/90 h-11 rounded-full px-6 text-[14.5px] font-medium'
              render={
                <Link to={props.isAuthenticated ? '/dashboard' : '/sign-up'} />
              }
            >
              {props.isAuthenticated ? t('Go to Dashboard') : t('Get started')}
              <ArrowRight data-icon='inline-end' />
            </Button>
            <Button
              variant='outline'
              className='border-background/25 text-background hover:bg-background/10 h-11 rounded-full bg-transparent px-5 text-[14.5px] font-medium'
              render={<Link to='/docs' />}
            >
              {t('Docs')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
