import { useState } from 'react'

import { CodeCard } from '@/features/docs/components/highlighted-code'
import { cn } from '@/lib/utils'

import {
  PROTOCOL_OPTIONS,
  SNIPPET_LANGUAGES,
  buildSnippet,
  type ProtocolId,
  type SnippetLanguage,
} from '../lib/snippets'

interface CodeSampleProps {
  baseUrl: string
  model: string
}

export function CodeSample(props: CodeSampleProps) {
  const [language, setLanguage] = useState<SnippetLanguage>('curl')
  const [protocol, setProtocol] = useState<ProtocolId>('responses')

  const currentProtocol =
    PROTOCOL_OPTIONS.find((item) => item.value === protocol) ??
    PROTOCOL_OPTIONS[0]
  const code = buildSnippet(language, props.baseUrl, props.model, protocol)

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-1.5'>
        {PROTOCOL_OPTIONS.map((option) => {
          const active = option.value === protocol
          return (
            <button
              key={option.value}
              type='button'
              onClick={() => setProtocol(option.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <CodeCard
        tabs={SNIPPET_LANGUAGES}
        activeTab={language}
        onTabChange={setLanguage}
        language={language}
        subtitle={currentProtocol.endpoint}
        code={code}
      />
    </div>
  )
}
