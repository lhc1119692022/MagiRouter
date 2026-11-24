import type { ReactNode } from 'react'

import '@/styles/identity-settings.css'

import { SectionPageLayout } from './section-page-layout'

type IdentitySettingsLayoutProps = {
  surface: 'account' | 'security'
  title: string
  children: ReactNode
}

export function IdentitySettingsLayout({
  surface,
  title,
  children,
}: IdentitySettingsLayoutProps) {
  return (
    <SectionPageLayout scrollWithDocument>
      <SectionPageLayout.Title>{title}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='identity-settings' data-surface={surface}>
          {children}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
