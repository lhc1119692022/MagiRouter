import { createFileRoute } from '@tanstack/react-router'
import z from 'zod'

import { DocsCenter } from '@/features/docs'

const docsSearchSchema = z.object({
  doc: z.string().optional(),
})

export const Route = createFileRoute('/docs/')({
  validateSearch: docsSearchSchema,
  component: DocsCenter,
})
