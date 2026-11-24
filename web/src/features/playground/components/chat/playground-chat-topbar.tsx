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
import { SlidersHorizontalIcon } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PlaygroundChatTopbarProps = {
  renderBilling: (actions: ReactNode) => ReactNode
  presetAction?: ReactNode
  modelValue: string
  hasMessages?: boolean
  onClearMessages?: () => void
  parametersOpen: boolean
  parametersId: string
  parameterButton?: Ref<HTMLButtonElement>
  onToggleParameters: () => void
  codeOpen: boolean
  onToggleCode: () => void
}

export function PlaygroundChatTopbar(props: PlaygroundChatTopbarProps) {
  const { t } = useTranslation()

  return (
    <header className='pg-chat-topbar'>
      {props.renderBilling(
        <>
          {props.presetAction}
          <Button
            ref={props.parameterButton}
            size='xs'
            variant={props.parametersOpen ? 'default' : 'outline'}
            className={cn('pg-topbar-btn', props.parametersOpen && 'is-active')}
            type='button'
            aria-expanded={props.parametersOpen}
            aria-controls={
              props.parametersOpen ? props.parametersId : undefined
            }
            onClick={props.onToggleParameters}
          >
            <SlidersHorizontalIcon aria-hidden='true' />
            <span>{t('Parameters')}</span>
          </Button>
          <Button
            type='button'
            size='xs'
            variant={props.codeOpen ? 'default' : 'outline'}
            className={cn('pg-topbar-btn', props.codeOpen && 'is-active')}
            aria-expanded={props.codeOpen}
            disabled={!props.modelValue}
            onClick={props.onToggleCode}
          >
            {t('Request preview')}
          </Button>
          {props.hasMessages && props.onClearMessages ? (
            <Button
              type='button'
              size='xs'
              variant='outline'
              className='pg-topbar-btn'
              onClick={props.onClearMessages}
            >
              {t('New chat')}
            </Button>
          ) : null}
        </>
      )}
    </header>
  )
}
