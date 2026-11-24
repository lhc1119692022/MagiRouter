import { z } from 'zod'

export const playgroundSearchSchema = z.object({
  mode: z.enum(['chat', 'video', 'image', 'audio']).optional().catch(undefined),
  model: z.string().min(1).optional().catch(undefined),
  preset: z.string().min(1).max(64).optional(),
  group: z.string().min(1).max(128).optional().catch(undefined),
  scene: z.string().min(1).max(64).optional().catch(undefined),
  editPreset: z.boolean().optional().catch(undefined),
})

export type PlaygroundSearch = z.infer<typeof playgroundSearchSchema>

export const playgroundCreatedKeySchema = z.object({
  owner: z.number().int().positive(),
  id: z.number().int().positive(),
})

export type PlaygroundCreatedKey = z.infer<typeof playgroundCreatedKeySchema>

declare module '@tanstack/react-router' {
  interface HistoryState {
    playgroundCreatedKey?: PlaygroundCreatedKey
  }
}
