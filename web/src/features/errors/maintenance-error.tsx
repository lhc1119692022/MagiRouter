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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

export function MaintenanceError() {
  const { t } = useTranslation()
  return (
    <div className='bg-background text-foreground h-svh px-4'>
      <div className='m-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-2 text-center'>
        <h1 className='text-magi-heading font-mono text-[6.5rem] leading-none font-semibold tracking-tighter'>
          503
        </h1>
        <span className='text-foreground mt-2 text-lg font-medium'>
          {t('Website is under maintenance!')}
        </span>
        <p className='text-muted-foreground text-center text-sm leading-relaxed'>
          {t('The site is not available at the moment.')} <br />
          {t("We'll be back online shortly.")}
        </p>
        <div className='mt-6 flex gap-4'>
          <Button variant='outline' className='rounded-full px-5'>
            {t('Learn more')}
          </Button>
        </div>
      </div>
    </div>
  )
}
