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
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

export function UnauthorisedError() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { history } = useRouter()
  return (
    <div className='bg-background text-foreground h-svh px-4'>
      <div className='m-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-2 text-center'>
        <h1 className='text-magi-heading font-mono text-[6.5rem] leading-none font-semibold tracking-tighter'>
          401
        </h1>
        <span className='text-foreground mt-2 text-lg font-medium'>
          {t('Unauthorized Access')}
        </span>
        <p className='text-muted-foreground text-center text-sm leading-relaxed'>
          {t('Please log in with the appropriate credentials')} <br />{' '}
          {t('to access this resource.')}
        </p>
        <div className='mt-6 flex flex-wrap justify-center gap-3'>
          <Button
            variant='outline'
            className='rounded-full px-5'
            onClick={() => history.go(-1)}
          >
            {t('Go Back')}
          </Button>
          <Button
            className='rounded-full px-5'
            onClick={() => navigate({ to: '/' })}
          >
            {t('Back to Home')}
          </Button>
        </div>
      </div>
    </div>
  )
}
