import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { getUserGroups, getUserModels } from '@/features/playground/api'
import {
  CHAT_REASONING_EFFORTS,
  type ModelOption,
} from '@/features/playground/types'
import { usePricingData } from '@/features/pricing/hooks'
import type { PricingModel } from '@/features/pricing/types'
import { api } from '@/lib/api'
import {
  getModelTaskCapabilities,
  type ModelTaskCapability,
} from '@/lib/model-task-capabilities'
import {
  getServerErrorSources,
  getServerErrorStatus,
  requireServerSuccess,
} from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

const chat = z.strictObject({
  reasoning_effort: z.enum(CHAT_REASONING_EFFORTS).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().min(1).max(200000).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  seed: z.number().int().min(0).max(2147483647).optional(),
})
const image = z.strictObject({
  imageTask: z.enum(['generate', 'edit']).optional(),
  imageSize: z.enum(['1024x1024', '1024x1536', '1536x1024']).optional(),
  quality: z.enum(['auto', 'low', 'medium', 'high']).optional(),
  imageCount: z.union([z.literal(1), z.literal(2), z.literal(4)]).optional(),
  imageFormat: z.enum(['png', 'jpeg', 'webp']).optional(),
})
const video = z.strictObject({
  videoTask: z.enum(['t2v', 'i2v', 'ref2v']).optional(),
  resolution: z.enum(['480p', '720p', '1080p']).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']).optional(),
  duration: z.number().int().min(4).max(15).optional(),
  nativeAudio: z.boolean().optional(),
  cameraFixed: z.boolean().optional(),
})
const audio = z.strictObject({
  voice: z
    .enum(['marin', 'cedar', 'alloy', 'ash', 'coral', 'nova', 'sage'])
    .optional(),
  audioFormat: z.enum(['mp3', 'wav', 'opus', 'aac', 'flac']).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  instructions: z.string().max(2000).optional(),
})

export const presetCoverUrl = z.string().refine((value) => {
  const authority = /^https:\/\/([^/?#]+)/.exec(value)?.[1]
  if (
    !authority ||
    authority.includes('@') ||
    /[\\\s#]/u.test(value) ||
    new TextEncoder().encode(value).length > 2048
  ) {
    return false
  }
  try {
    return Boolean(new URL(value).hostname)
  } catch {
    return false
  }
})

export const creationPresetTags = z
  .array(
    z
      .string()
      .min(1)
      .refine((tag) => tag === tag.trim() && [...tag].length <= 32)
  )
  .max(12)
  .refine((tags) => new Set(tags).size === tags.length)

const common = {
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/),
  title: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(256),
  prompt: z
    .string()
    .min(1)
    .max(8000)
    .refine((value) => !!value.trim()),
  category: z.string().max(80).optional(),
  tags: creationPresetTags.optional(),
  description: z.string().max(500).optional(),
  featured: z.boolean().optional(),
  published: z.boolean().optional(),
  cover_url: presetCoverUrl.optional(),
}
const preset = z.discriminatedUnion('mode', [
  z.strictObject({
    ...common,
    mode: z.literal('chat'),
    parameters: chat.optional(),
  }),
  z.strictObject({
    ...common,
    mode: z.literal('image'),
    parameters: image.optional(),
  }),
  z.strictObject({
    ...common,
    mode: z.literal('video'),
    parameters: video.optional(),
  }),
  z.strictObject({
    ...common,
    mode: z.literal('audio'),
    parameters: audio.optional(),
  }),
])
export const creationPresetList = z
  .array(preset)
  .max(100)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length
  )
export type CreationPreset = z.infer<typeof preset>
export type StudioMode = CreationPreset['mode']
export const creationPresetOption = 'console_setting.creation_presets'
export const mediaLabels = {
  chat: 'Text Chat',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
} as const

export async function createCreationPreset(
  item: CreationPreset
): Promise<CreationPreset> {
  const response = await api.post(
    '/api/option/creation-presets',
    preset.parse(item)
  )
  return preset.parse(requireServerSuccess(response.data).data)
}

export function getCreationPresetsErrorMessage(error: unknown) {
  switch (getServerErrorStatus(error)) {
    case 404:
      return 'Creation presets are unavailable on this site.'
    case 401:
      return 'Sign in to view creation presets.'
    case 403:
      return 'Your account cannot view creation presets.'
  }
  if (
    getServerErrorSources(error).some((source) =>
      ['ERR_NETWORK', 'ETIMEDOUT', 'ECONNABORTED'].includes(String(source.code))
    )
  ) {
    return 'Could not reach the server to load creation presets. Check your connection and retry.'
  }
  return 'Could not load creation presets.'
}

export function useCreationPresets() {
  return useQuery({
    queryKey: ['creation-presets'],
    meta: { errorToast: false, redirectOnInternalServerError: false },
    queryFn: async () => {
      const response = await api.get('/api/user/self/creation-presets')
      return creationPresetList
        .parse(requireServerSuccess(response.data).data)
        .filter((item) => item.published !== false)
    },
    retry: false,
  })
}

export function useCreationModels(enabled: boolean) {
  const user = useAuthStore((state) => state.auth.user?.id)
  const accountGroup = useAuthStore((state) => state.auth.user?.group)
  const models = useQuery({
    queryKey: ['creation-user-models', user],
    queryFn: () => getUserModels(''),
    enabled,
  })
  const groups = useQuery({
    queryKey: ['playground-groups', user],
    queryFn: getUserGroups,
    enabled,
  })
  const catalog = usePricingData(enabled)
  const availableGroups = (groups.data ?? []).map((group) => group.value)
  return {
    allowed: models.data ?? [],
    catalog: catalog.models,
    groups: [...new Set([accountGroup, 'default', ...availableGroups])].filter(
      (group): group is string => !!group && availableGroups.includes(group)
    ),
    autoGroups: catalog.autoGroups,
    loading: models.isLoading || groups.isLoading || catalog.isLoading,
    error: models.error || groups.error || catalog.error,
  }
}

export function getPresetGroups(
  item: CreationPreset,
  access: ReturnType<typeof useCreationModels>
) {
  if (!presetAvailable(item, access)) return []
  const enabled =
    access.catalog.find((model) => model.model_name === item.model)
      ?.enable_groups ?? []
  return access.groups.filter(
    (group) =>
      enabled.includes('all') ||
      enabled.includes(group) ||
      (group === 'auto' &&
        access.autoGroups.some((name) => enabled.includes(name)))
  )
}

export function supportsStudioTask(
  model: PricingModel,
  mode: StudioMode,
  task?: string
): boolean {
  const endpoints = new Set(
    (model.supported_endpoint_types ?? []).map((value) =>
      value.trim().toLowerCase()
    )
  )
  const capabilities = getModelTaskCapabilities(model)
  let capability: ModelTaskCapability
  let compatible: string[]
  switch (mode) {
    case 'chat':
      capability = 'text-generation'
      compatible = ['openai', '/v1/chat/completions']
      break
    case 'image':
      capability = task === 'edit' ? 'image-to-image' : 'text-to-image'
      compatible =
        task === 'edit'
          ? ['image-edit', 'image-edits', '/v1/images/edits']
          : ['image-generation', '/v1/images/generations']
      break
    case 'video':
      if (task === 'edit') return false
      capability =
        task === 'i2v' || task === 'ref2v' ? 'image-to-video' : 'text-to-video'
      compatible = ['openai-video', '/v1/video/generations']
      break
    case 'audio':
      capability = 'text-to-speech'
      compatible = ['audio-speech', 'speech', 'tts', '/v1/audio/speech']
      break
  }
  return (
    capabilities.includes(capability) &&
    compatible.some((value) => endpoints.has(value))
  )
}

export function presetAvailable(
  item: CreationPreset,
  models: { allowed: ModelOption[]; catalog: PricingModel[] }
): boolean {
  if (!models.allowed.some((option) => option.value === item.model)) {
    return false
  }
  const model = models.catalog.find(
    (option) => option.model_name === item.model
  )
  if (!model?.enable_groups?.length) return false
  let task: string | undefined
  if (item.mode === 'image') task = item.parameters?.imageTask
  if (item.mode === 'video') task = item.parameters?.videoTask
  return supportsStudioTask(model, item.mode, task)
}
