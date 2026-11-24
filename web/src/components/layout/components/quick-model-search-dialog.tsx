import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  BookOpen,
  FlaskConical,
  Search,
  Sparkles,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { usePricingData } from '@/features/pricing/hooks'
import { getLobeIcon } from '@/lib/lobe-icon'
import { getOrdinaryModelTags } from '@/lib/model-task-capabilities'

interface QuickModelSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QuickModelSearchDialog(props: QuickModelSearchDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const pricing = usePricingData(props.open)

  const filteredModels = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const list = pricing.models
    if (!keyword) return list.slice(0, 8)
    return list
      .filter((model) => {
        const haystack = [
          model.model_name,
          model.vendor_name ?? '',
          model.description ?? '',
          getOrdinaryModelTags(model.tags).join(' '),
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(keyword)
      })
      .slice(0, 12)
  }, [pricing.models, query])

  const handleOpenChange = (open: boolean) => {
    if (!open) setQuery('')
    props.onOpenChange(open)
  }

  const goToModel = (modelName: string) => {
    handleOpenChange(false)
    void navigate({
      to: '/pricing/$modelId',
      params: { modelId: modelName },
    })
  }

  const goToPath = (to: '/pricing' | '/docs' | '/playground') => {
    handleOpenChange(false)
    void navigate({ to })
  }

  const renderResults = () => {
    if (pricing.isLoading) {
      return (
        <div className='space-y-2.5 p-3'>
          {['sk-1', 'sk-2', 'sk-3', 'sk-4'].map((slot) => (
            <Skeleton key={slot} className='h-10 w-full rounded-xl' />
          ))}
        </div>
      )
    }
    if (filteredModels.length === 0) {
      return (
        <div className='text-muted-foreground px-4 py-8 text-center text-sm'>
          {t('No matching models found')}
        </div>
      )
    }
    return filteredModels.map((model) => {
      const iconKey = model.icon || model.vendor_icon
      return (
        <button
          key={model.model_name}
          type='button'
          onClick={() => goToModel(model.model_name)}
          className='hover:bg-muted/70 flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors'
        >
          <div className='flex min-w-0 items-center gap-2.5'>
            {iconKey ? (
              <span className='shrink-0'>{getLobeIcon(iconKey, 18)}</span>
            ) : (
              <span className='bg-muted text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px]'>
                M
              </span>
            )}
            <div className='min-w-0'>
              <p className='text-foreground truncate font-mono text-xs font-medium'>
                {model.model_name}
              </p>
              <p className='text-muted-foreground truncate text-[11px]'>
                {model.vendor_name || t('Model')}
                {model.enable_groups?.length
                  ? ` · ${model.enable_groups.slice(0, 3).join(', ')}`
                  : ''}
              </p>
            </div>
          </div>
          <ArrowRight className='text-muted-foreground size-3.5 shrink-0' />
        </button>
      )
    })
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={handleOpenChange}
      title={t('Quick Model Search')}
      description={t(
        'Jump straight to any live model pricing card, developer docs, or Playground.'
      )}
      contentClassName='sm:max-w-lg'
      contentHeight='auto'
    >
      <div className='space-y-4'>
        <div className='border-border bg-muted/50 focus-within:border-foreground/40 focus-within:bg-background flex items-center gap-2.5 rounded-full border px-4 py-2.5 transition-colors'>
          <Search className='text-muted-foreground size-4 shrink-0' />
          <input
            type='text'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Search model name, provider, or tag...')}
            autoFocus
            className='text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none'
          />
          {query && (
            <button
              type='button'
              onClick={() => setQuery('')}
              className='text-muted-foreground hover:text-foreground text-xs'
            >
              {t('Clear')}
            </button>
          )}
        </div>

        <div className='flex flex-wrap gap-2'>
          <button
            type='button'
            onClick={() => goToPath('/pricing')}
            className='border-border hover:bg-muted text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors'
          >
            <Sparkles className='size-3.5' />
            {t('Model Square')}
          </button>
          <button
            type='button'
            onClick={() => goToPath('/playground')}
            className='border-border hover:bg-muted text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors'
          >
            <FlaskConical className='size-3.5' />
            {t('Playground')}
          </button>
          <button
            type='button'
            onClick={() => goToPath('/docs')}
            className='border-border hover:bg-muted text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors'
          >
            <BookOpen className='size-3.5' />
            {t('Docs')}
          </button>
        </div>

        <div className='border-border divide-border max-h-80 divide-y overflow-y-auto rounded-2xl border'>
          {renderResults()}
        </div>
      </div>
    </Dialog>
  )
}
