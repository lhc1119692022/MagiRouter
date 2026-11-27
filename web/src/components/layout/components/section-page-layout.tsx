import {
  Children,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'

import { Main } from './main'
import { PageFooterProvider } from './page-footer'

type SlotProps = { children?: ReactNode }

function SectionPageLayoutTitle(_props: SlotProps) {
  return null
}
SectionPageLayoutTitle.displayName = 'SectionPageLayout.Title'

function SectionPageLayoutSubtitle(_props: SlotProps) {
  return null
}
SectionPageLayoutSubtitle.displayName = 'SectionPageLayout.Subtitle'

function SectionPageLayoutActions(_props: SlotProps) {
  return null
}
SectionPageLayoutActions.displayName = 'SectionPageLayout.Actions'

function SectionPageLayoutContent(_props: SlotProps) {
  return null
}
SectionPageLayoutContent.displayName = 'SectionPageLayout.Content'

function SectionPageLayoutBreadcrumb(_props: SlotProps) {
  return null
}
SectionPageLayoutBreadcrumb.displayName = 'SectionPageLayout.Breadcrumb'

export type SectionPageLayoutProps = {
  children: ReactNode
  fixedContent?: boolean
  scrollWithDocument?: boolean
  stackActionsOnMobile?: boolean
  wideContent?: boolean
}

export function SectionPageLayout(props: SectionPageLayoutProps) {
  const [footerContainer, setFooterContainer] = useState<HTMLDivElement | null>(
    null
  )

  let title: ReactNode = null
  let subtitle: ReactNode = null
  let actions: ReactNode = null
  let content: ReactNode = null
  let breadcrumb: ReactNode = null
  const scrollWithDocument =
    !props.fixedContent && props.scrollWithDocument !== false
  let contentClass =
    'console-page-inner min-h-0 flex-1 overflow-auto pt-1 pb-6 sm:pb-8'
  if (props.fixedContent) {
    contentClass = 'console-page-inner min-h-0 flex-1 overflow-hidden pb-4'
  }
  if (scrollWithDocument) {
    contentClass = 'console-page-inner console-document-content'
  }

  Children.forEach(props.children, (node) => {
    if (!isValidElement(node)) return
    const child = node as ReactElement<SlotProps>
    if (child.type === SectionPageLayoutTitle) title = child.props.children
    else if (child.type === SectionPageLayoutSubtitle) {
      subtitle = child.props.children
    } else if (child.type === SectionPageLayoutActions) {
      actions = child.props.children
    } else if (child.type === SectionPageLayoutContent) {
      content = child.props.children
    } else if (child.type === SectionPageLayoutBreadcrumb) {
      breadcrumb = child.props.children
    }
  })

  return (
    <PageFooterProvider container={footerContainer}>
      <Main
        className={cn(
          scrollWithDocument && 'console-document-page overflow-visible',
          props.wideContent && 'console-page-wide'
        )}
      >
        <div
          className={
            scrollWithDocument
              ? 'console-document-heading'
              : 'w-full shrink-0 pt-4 sm:pt-6'
          }
        >
          <div className='console-page-inner'>
            {breadcrumb != null && <div className='mb-3'>{breadcrumb}</div>}
            <div className='console-head-bar'>
              <div className='console-head-left'>
                <h1 className='console-h1'>{title}</h1>
                {subtitle != null && (
                  <span className='console-head-meta'>{subtitle}</span>
                )}
              </div>
              {actions != null && (
                <div
                  className={
                    props.stackActionsOnMobile
                      ? 'console-head-right max-sm:basis-full'
                      : 'console-head-right'
                  }
                >
                  {actions}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={contentClass}>{content}</div>

        <div
          ref={setFooterContainer}
          className='bg-background shrink-0 border-t px-4 pt-2.5 pb-4 empty:hidden sm:px-6 sm:pt-3 sm:pb-6'
        />
      </Main>
    </PageFooterProvider>
  )
}

SectionPageLayout.Title = SectionPageLayoutTitle
SectionPageLayout.Subtitle = SectionPageLayoutSubtitle
SectionPageLayout.Actions = SectionPageLayoutActions
SectionPageLayout.Content = SectionPageLayoutContent
SectionPageLayout.Breadcrumb = SectionPageLayoutBreadcrumb
