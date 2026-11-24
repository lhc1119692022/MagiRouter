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
import { Shield, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'

import { ChangePasswordDialog } from './dialogs/change-password-dialog'
import { DeleteAccountDialog } from './dialogs/delete-account-dialog'

type AccountActionCardProps = {
  action: 'password' | 'delete'
  username: string
  hasPassword?: boolean
  onUpdate?: () => void
}

export function AccountActionCard(props: AccountActionCardProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const descriptionId = useId()
  const actions = {
    password: {
      title: t(
        props.hasPassword === false ? 'Set Password' : 'Change Password'
      ),
      description: t(
        props.hasPassword === false
          ? 'Add a password after verifying your identity'
          : 'Update your password to keep your account secure'
      ),
      icon: Shield,
    },
    delete: {
      title: t('Delete Account'),
      description: t('Permanently delete your account and all data'),
      icon: Trash2,
    },
  }
  const action = actions[props.action]
  return (
    <>
      <Card data-card-hover='false' data-action={props.action}>
        <div className='identity-action-row'>
          <IconBadge
            tone={props.action === 'delete' ? 'destructive' : 'neutral'}
            size='sm'
          >
            <action.icon />
          </IconBadge>
          <div className='min-w-0 flex-1 space-y-0.5'>
            <h3 className='identity-action-title'>{action.title}</h3>
            <p id={descriptionId} className='identity-action-description'>
              {action.description}
            </p>
          </div>
          <Button
            type='button'
            aria-describedby={descriptionId}
            size='sm'
            variant={props.action === 'delete' ? 'destructive' : 'outline'}
            onClick={() => setOpen(true)}
          >
            {action.title}
          </Button>
        </div>
      </Card>
      {props.action === 'password' && (
        <ChangePasswordDialog
          open={open}
          onOpenChange={setOpen}
          username={props.username}
          hasPassword={props.hasPassword}
          onSuccess={props.onUpdate}
        />
      )}
      {props.action === 'delete' && (
        <DeleteAccountDialog
          open={open}
          onOpenChange={setOpen}
          username={props.username}
        />
      )}
    </>
  )
}
