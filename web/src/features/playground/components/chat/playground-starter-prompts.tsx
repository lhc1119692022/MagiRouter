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
import {
  BarChartIcon,
  CodeSquareIcon,
  GraduationCapIcon,
  NotepadTextIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

type PlaygroundStarterPromptsProps = {
  disabled?: boolean
  onSelectPrompt: (prompt: string) => void
}

const starterPrompts = [
  { icon: BarChartIcon, text: 'Analyze data' },
  { icon: NotepadTextIcon, text: 'Summarize text' },
  { icon: CodeSquareIcon, text: 'Code' },
  { icon: GraduationCapIcon, text: 'Get advice' },
]

export function PlaygroundStarterPrompts(props: PlaygroundStarterPromptsProps) {
  const { t } = useTranslation()

  return (
    <div className='flex flex-wrap justify-center gap-1.5 sm:gap-2'>
      {starterPrompts.map(({ icon: Icon, text }) => (
        <Button
          className='text-muted-foreground hover:text-foreground h-auto min-h-9 max-w-full gap-2 rounded-full px-3 py-1.5 text-sm whitespace-normal pointer-coarse:min-h-11'
          disabled={props.disabled}
          key={text}
          onClick={() => props.onSelectPrompt(t(text))}
          type='button'
          variant='ghost'
        >
          <Icon aria-hidden='true' className='size-4 shrink-0' />
          <span>{t(text)}</span>
        </Button>
      ))}
    </div>
  )
}
