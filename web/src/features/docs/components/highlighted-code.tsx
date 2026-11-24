import type { ReactNode } from 'react'

import { CopyButton } from '@/components/copy-button'
import { cn } from '@/lib/utils'

export type CodeLanguage = 'curl' | 'python' | 'node' | 'json' | 'bash'

const TOKEN_PATTERNS: Record<CodeLanguage, RegExp> = {
  json: /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g,
  curl: /(#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b(curl|export|https?:\/\/[^\s'"]+)\b|(\s--?[a-zA-Z0-9-]+)/g,
  bash: /(#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b(export|curl|npm|npx|pnpm|claude|codex)\b|(\s--?[a-zA-Z0-9-]+)/g,
  python:
    /(#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b(import|from|as|def|return|const|await|async|True|False|None|print)\b|\b(\d+(?:\.\d+)?)\b/g,
  node: /(\/\/[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(import|from|const|let|var|await|async|new|return|true|false|null|console)\b|\b(\d+(?:\.\d+)?)\b/g,
}

function tokenizeLine(code: string, language: CodeLanguage): ReactNode[] {
  const pattern = new RegExp(TOKEN_PATTERNS[language].source, 'g')
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(code)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(code.slice(lastIndex, match.index))
    }
    const full = match[0]
    let tokenClass = ''
    if (language === 'json') {
      if (match[1]) tokenClass = 'mr-tok-key tok-key'
      else if (match[2]) tokenClass = 'mr-tok-str tok-str'
      else if (match[3]) tokenClass = 'mr-tok-kw tok-kw'
      else if (match[4]) tokenClass = 'mr-tok-num tok-num'
    } else if (language === 'curl' || language === 'bash') {
      if (match[1]) tokenClass = 'mr-tok-com tok-com'
      else if (match[2]) tokenClass = 'mr-tok-str tok-str'
      else if (match[3]) tokenClass = 'mr-tok-kw tok-kw'
      else if (match[4]) tokenClass = 'mr-tok-flag tok-flag'
    } else {
      if (match[1]) tokenClass = 'mr-tok-com tok-com'
      else if (match[2]) tokenClass = 'mr-tok-str tok-str'
      else if (match[3]) tokenClass = 'mr-tok-kw tok-kw'
      else if (match[4]) tokenClass = 'mr-tok-num tok-num'
    }

    nodes.push(
      tokenClass ? (
        <span key={match.index} className={tokenClass}>
          {full}
        </span>
      ) : (
        full
      )
    )
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < code.length) {
    nodes.push(code.slice(lastIndex))
  }

  return nodes
}

export interface HighlightedCodeProps {
  code: string
  language: CodeLanguage
  className?: string
}

export function HighlightedCode(props: HighlightedCodeProps) {
  const useCustomClass = Boolean(props.className)
  return (
    <pre
      className={cn(
        !useCustomClass &&
          'mr-code-pre m-0 overflow-x-auto px-4 py-3.5 text-[12.5px] leading-[1.65] whitespace-pre-wrap break-words',
        props.className
      )}
    >
      <code>{tokenizeLine(props.code, props.language)}</code>
    </pre>
  )
}

export interface CodeCardTab<T extends string = string> {
  value: T
  label: string
}

export interface CodeCardProps<T extends string = string> {
  code: string
  language: CodeLanguage
  title?: string
  subtitle?: string
  tabs?: CodeCardTab<T>[]
  activeTab?: T
  onTabChange?: (tab: T) => void
  className?: string
}

export function CodeCard<T extends string = string>(props: CodeCardProps<T>) {
  return (
    <div className={cn('mr-code-card', props.className)}>
      <div className='mr-code-head flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5'>
        <div className='flex min-w-0 items-center gap-2'>
          {props.tabs && props.tabs.length > 0 ? (
            <div className='inline-flex items-center gap-1'>
              {props.tabs.map((tab) => {
                const active = tab.value === props.activeTab
                return (
                  <button
                    key={tab.value}
                    type='button'
                    onClick={() => props.onTabChange?.(tab.value)}
                    className={cn(
                      'rounded-full px-2.5 py-1 font-mono text-[11px] transition-all',
                      active
                        ? 'bg-background text-foreground font-semibold shadow-xs ring-1 ring-border'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          ) : (
            <span className='text-muted-foreground font-mono text-[11.5px] font-medium'>
              {props.title}
            </span>
          )}
        </div>
        <div className='flex items-center gap-2'>
          {props.subtitle && (
            <span className='text-muted-foreground hidden font-mono text-[11px] sm:inline'>
              {props.subtitle}
            </span>
          )}
          <CopyButton value={props.code} size='sm' />
        </div>
      </div>
      <HighlightedCode code={props.code} language={props.language} />
    </div>
  )
}
