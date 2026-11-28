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
import { Link } from '@tanstack/react-router'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Markdown, MarkdownLabel } from '@/components/ui/markdown'
import { useFAQ } from '@/features/dashboard/hooks/use-status-data'
import { useStatus } from '@/hooks/use-status'
import { getDocumentationLink } from '@/lib/documentation-link'
import { parseHeaderNavModules } from '@/lib/nav-modules'

import '@/styles/dashboard-editorial.css'

export function FAQPanel() {
  const { t } = useTranslation()
  const heading = useId()
  const { items, loading, failed, enabled } = useFAQ()
  const { status } = useStatus()
  const [selectedValue, setSelectedValue] = useState<string | null | undefined>(
    undefined
  )
  const entries = useMemo(
    () =>
      items
        .filter(
          (item) =>
            typeof item?.question === 'string' &&
            typeof item.answer === 'string'
        )
        .map((item, idx) => {
          const key = item.id != null ? `${item.id}-${idx}` : `faq-${idx}`
          return {
            item,
            key,
            value: `item-${key}`,
          }
        }),
    [items]
  )
  if (!enabled && !loading && !failed) return null
  const firstValue = entries[0]?.value ?? null
  let activeValue: string | null = null
  if (selectedValue === undefined) {
    activeValue = firstValue
  } else if (
    selectedValue &&
    entries.some((entry) => entry.value === selectedValue)
  ) {
    activeValue = selectedValue
  }
  const accordionValue = activeValue ? [activeValue] : []
  const docsEnabled = parseHeaderNavModules(status?.HeaderNavModules).docs
  const docs = getDocumentationLink(status?.docs_link)
  let message = t('No FAQ entries available')
  if (loading) message = t('Loading...')
  if (failed) message = t('Could not load this source')
  return (
    <section
      className='dash-panel dash-editorial dash-faq-panel'
      aria-labelledby={heading}
    >
      <div className='dash-panel-head'>
        <h2 id={heading} className='dash-panel-title'>
          {t('Frequently asked questions (FAQ)')}
        </h2>
        {docsEnabled &&
          (docs.external ? (
            <a
              href={docs.href}
              target='_blank'
              rel='noopener noreferrer'
              className='dash-panel-link'
            >
              {t('Read documentation')} <span aria-hidden='true'>→</span>
            </a>
          ) : (
            <Link
              to='/docs'
              search={docs.search}
              hash={docs.hash}
              className='dash-panel-link'
            >
              {t('Read documentation')} <span aria-hidden='true'>→</span>
            </Link>
          ))}
      </div>
      {!entries.length && (
        <p
          className='dash-editorial-message'
          role={failed ? 'alert' : 'status'}
        >
          {message}
        </p>
      )}
      {entries.length > 0 && (
        <Accordion
          multiple={false}
          className='dash-faq-list'
          value={accordionValue}
          onValueChange={(nextValue) => {
            setSelectedValue(nextValue.at(-1) ?? null)
          }}
        >
          {entries.map(({ item, key, value }) => (
            <AccordionItem key={key} value={value} className='dash-faq-item'>
              <AccordionTrigger className='dash-faq-trigger'>
                <MarkdownLabel>{item.question}</MarkdownLabel>
                <span className='dash-faq-mark' aria-hidden='true' />
              </AccordionTrigger>
              <AccordionContent className='dash-faq-body'>
                <Markdown breaks className='dash-faq-answer'>
                  {item.answer}
                </Markdown>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </section>
  )
}
