import { createFileRoute } from '@tanstack/react-router'

import { CreationCenter } from '@/features/creation'

export const Route = createFileRoute('/_authenticated/create/')({
  component: CreationCenter,
})
