import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PageFooterPortal } from '../page-footer'
import { SectionPageLayout } from '../section-page-layout'

function renderPage(
  props: {
    fixedContent?: boolean
    scrollWithDocument?: boolean
    wideContent?: boolean
  } = {}
) {
  render(
    <SectionPageLayout {...props}>
      <SectionPageLayout.Title>Page title</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <section aria-label='Page content' />
        <PageFooterPortal>
          <nav aria-label='Pagination' />
        </PageFooterPortal>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
  return screen.getByRole('region', { name: 'Page content' })
}

describe('console page scrolling', () => {
  it('puts the title, content and footer in the document flow by default', () => {
    const content = renderPage()
    const documentPage = screen
      .getByRole('heading')
      .closest('.console-document-page')
    expect(documentPage).toContainElement(content)
    expect(documentPage).toContainElement(
      screen.getByRole('navigation', { name: 'Pagination' })
    )
    expect(content.closest('.overflow-auto, .overflow-hidden')).toBeNull()
    expect(documentPage).not.toHaveClass('console-page-wide')
  })

  it('adds the wide page modifier class when wideContent is enabled', () => {
    renderPage({ wideContent: true })
    const documentPage = screen
      .getByRole('heading')
      .closest('.console-document-page')
    expect(documentPage).toHaveClass('console-page-wide')
  })

  it('keeps the fixed table viewport separate from its pagination', () => {
    const content = renderPage({ fixedContent: true })
    const viewport = content.closest('.console-page-inner')
    const pagination = screen.getByRole('navigation', { name: 'Pagination' })
    expect(viewport).toHaveClass('overflow-hidden')
    expect(viewport).not.toContainElement(pagination)
    expect(pagination.parentElement).toHaveClass('console-page-footer')
  })

  it('retains the separately scrollable editor body when requested', () => {
    const content = renderPage({ scrollWithDocument: false })
    const viewport = content.closest('.console-page-inner')
    expect(viewport).toHaveClass('overflow-auto')
    expect(viewport).not.toContainElement(screen.getByRole('heading'))
  })
})
