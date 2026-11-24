import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { SectionPageLayout } from '@/components/layout/components/section-page-layout'
import { UptimePanel } from '@/features/dashboard/components/overview/uptime-panel'

export const Route = createFileRoute('/_authenticated/channel-status')({
  validateSearch: z.object({
    group: z.string().max(50).optional().catch(undefined),
  }),
  component: ChannelStatus,
})

function ChannelStatus() {
  const { t } = useTranslation()
  const { group } = Route.useSearch()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Channel status')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <UptimePanel group={group} />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
