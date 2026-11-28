export type ImageRouteIntent =
  | 'text-to-image'
  | 'reference-generation'
  | 'image-edit'
  | 'layer-decomposition'

export type ImageRouteEndpoint = '/v1/images/generations' | '/v1/images/edits'

export interface ImageRouteResolution {
  intent: ImageRouteIntent
  endpoint: ImageRouteEndpoint
  task: 'generate' | 'edit'
  matchedKeywords: string[]
  isFallback: boolean
}

export const IMAGE_EDIT_KEYWORDS = [
  '局部重绘',
  '高清修复',
  '背景换成',
  '背景改为',
  '去除背景',
  '移除背景',
  '换背景',
  '去背景',
  '换衣服',
  '改颜色',
  '去水印',
  '清晰化',
  '编辑',
  '修改',
  '改动',
  '更改',
  '调整',
  '改成',
  '改为',
  '变成',
  '换成',
  '替换',
  '更换',
  '去掉',
  '去除',
  '移除',
  '删除',
  '消除',
  '擦除',
  '抹掉',
  '抠图',
  '抠出',
  '换装',
  '戴上',
  '加上',
  '补全',
  '扩图',
  '重绘',
  '修复',
  '修图',
  '精修',
  '调色',
  '变色',
  '上色',
  'p图',
  'remove background',
  'change background',
  'replace background',
  'change color',
  'put on',
  'take off',
  'inpaint',
  'outpaint',
  'retouch',
  'recolor',
  'repaint',
  'upscale',
  'restore',
  'replace',
  'remove',
  'modify',
  'delete',
  'erase',
  'adjust',
  'alter',
  'swap',
  'edit',
  'fix',
] as const

export const IMAGE_REFERENCE_GENERATION_KEYWORDS = [
  '风格参考',
  '同款风格',
  '类似风格',
  '相同风格',
  '保持风格',
  '风格迁移',
  '构图参考',
  '姿势参考',
  '姿态参考',
  '动作参考',
  '角色一致',
  '人物一致',
  '保持一致',
  '同一角色',
  '同一个人',
  '根据参考',
  '基于参考',
  '参考这张',
  '参考原图',
  '参考生成',
  '融合生成',
  '多图融合',
  '换场景生成',
  '参考图',
  '一致性',
  '三视图',
  '多角度',
  '同系列',
  '新场景',
  '照这张',
  '参考',
  '画风',
  '转绘',
  '延续',
  '衍生',
  '模仿',
  'character consistency',
  'composition reference',
  'in the style of',
  'character sheet',
  'same character',
  'consistent with',
  'like this image',
  'pose reference',
  'style transfer',
  'keep identity',
  'generate from',
  'inspired by',
  'similar to',
  'turnaround',
  'style of',
  'based on',
  'reference',
  'variation',
  'combine',
  'blend',
] as const

const ASCII_KEYWORD_PATTERN = /^[a-z0-9\s-]+$/

function escapeRegex(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function collectKeywordMatches(
  normalizedPrompt: string,
  keywords: readonly string[]
): string[] {
  const matches: string[] = []
  for (const keyword of keywords) {
    const normalizedKeyword = keyword.toLowerCase()
    const isMatched = ASCII_KEYWORD_PATTERN.test(normalizedKeyword)
      ? new RegExp(
          `\\b${escapeRegex(normalizedKeyword).replaceAll(/\s+/g, '\\s+')}\\b`,
          'i'
        ).test(normalizedPrompt)
      : normalizedPrompt.includes(normalizedKeyword)

    if (!isMatched) continue
    const alreadyCovered = matches.some((existing) =>
      existing.includes(normalizedKeyword)
    )
    if (!alreadyCovered) {
      matches.push(normalizedKeyword)
    }
  }
  return matches
}

export function resolveImageRoute(options: {
  prompt: string
  referenceCount: number
  layerDecomposition?: boolean
}): ImageRouteResolution {
  if (options.layerDecomposition) {
    return {
      intent: 'layer-decomposition',
      endpoint: '/v1/images/generations',
      task: 'generate',
      matchedKeywords: [],
      isFallback: false,
    }
  }

  if (options.referenceCount <= 0) {
    return {
      intent: 'text-to-image',
      endpoint: '/v1/images/generations',
      task: 'generate',
      matchedKeywords: [],
      isFallback: false,
    }
  }

  const normalizedPrompt = options.prompt.trim().toLowerCase()
  const editMatches = normalizedPrompt
    ? collectKeywordMatches(normalizedPrompt, IMAGE_EDIT_KEYWORDS)
    : []
  const referenceMatches = normalizedPrompt
    ? collectKeywordMatches(
        normalizedPrompt,
        IMAGE_REFERENCE_GENERATION_KEYWORDS
      )
    : []

  if (
    referenceMatches.length > 0 &&
    referenceMatches.length > editMatches.length
  ) {
    return {
      intent: 'reference-generation',
      endpoint: '/v1/images/generations',
      task: 'generate',
      matchedKeywords: referenceMatches,
      isFallback: false,
    }
  }

  if (editMatches.length > 0) {
    return {
      intent: 'image-edit',
      endpoint: '/v1/images/edits',
      task: 'edit',
      matchedKeywords: editMatches,
      isFallback: false,
    }
  }

  return {
    intent: 'image-edit',
    endpoint: '/v1/images/edits',
    task: 'edit',
    matchedKeywords: [],
    isFallback: true,
  }
}

export function extractImageReferenceCountFromPayload(
  payload: Record<string, unknown>
): number {
  const imageField = payload.image
  if (typeof imageField === 'string') {
    return imageField.trim() ? 1 : 0
  }
  if (Array.isArray(imageField)) {
    return imageField.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0
    ).length
  }
  return 0
}
