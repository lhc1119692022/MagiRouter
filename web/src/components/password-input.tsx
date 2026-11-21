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
import { Eye, EyeOff } from 'lucide-react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { Input } from './ui/input'

type PasswordInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> & {
  ref?: React.Ref<HTMLInputElement>
}

export function PasswordInput({
  className,
  disabled,
  ref,
  ...props
}: PasswordInputProps) {
  const { t } = useTranslation()
  const [showPassword, setShowPassword] = React.useState(false)
  const visibilityLabel = showPassword ? t('Hide password') : t('Show password')

  return (
    <div className={cn('relative w-full rounded-md', className)}>
      <Input
        type={showPassword ? 'text' : 'password'}
        ref={ref}
        disabled={disabled}
        className='pe-10'
        {...props}
      />
      <button
        type='button'
        disabled={disabled}
        data-no-press
        className={cn(
          'absolute end-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md border-0 bg-transparent p-0 transition-colors hover:bg-transparent disabled:opacity-50',
          showPassword
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => setShowPassword((prev) => !prev)}
        onMouseDown={(event) => event.preventDefault()}
        aria-label={visibilityLabel}
        title={visibilityLabel}
        aria-pressed={showPassword}
      >
        {showPassword ? (
          <Eye size={16} aria-hidden='true' />
        ) : (
          <EyeOff size={16} aria-hidden='true' />
        )}
      </button>
    </div>
  )
}
