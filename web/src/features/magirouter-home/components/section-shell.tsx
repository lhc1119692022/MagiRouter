import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface SectionShellProps {
  id?: string
  eyebrow: string
  title: ReactNode
  lead?: string
  className?: string
  children?: ReactNode
}

export function SectionShell(props: SectionShellProps) {
  return (
    <section
      id={props.id}
      className={cn(
        'border-border scroll-mt-20 border-t py-16 md:py-24',
        props.className
      )}
    >
      <div className='mx-auto max-w-[1360px] px-4 md:px-6'>
        <p className='text-muted-foreground font-mono text-[11px] tracking-[0.18em] uppercase'>
          {props.eyebrow}
        </p>
        <h2 className='text-magi-heading mt-3 text-[28px] leading-[1.18] font-medium tracking-[-0.025em] md:text-[36px]'>
          {props.title}
        </h2>
        {props.lead && (
          <p className='text-muted-foreground mt-3 max-w-[768px] text-[15px] leading-[1.65] md:text-[16.5px]'>
            {props.lead}
          </p>
        )}
        {props.children}
      </div>
    </section>
  )
}
