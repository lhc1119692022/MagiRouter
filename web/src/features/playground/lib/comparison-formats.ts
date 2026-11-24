type EndpointInfo = string | { path?: string; method?: string }

const FORMAT_LABELS = new Map<string, string>([
  ['openai', 'Chat'],
  ['/v1/chat/completions', 'Chat'],
  ['openai-response', 'Responses'],
  ['/v1/responses', 'Responses'],
  ['openai-response-compact', 'Responses Compact'],
  ['/v1/responses/compact', 'Responses Compact'],
  ['anthropic', 'Messages'],
  ['/v1/messages', 'Messages'],
  ['gemini', 'generateContent'],
  ['/v1beta/models/{model}:generateContent', 'generateContent'],
  ['embeddings', 'Embeddings'],
  ['/v1/embeddings', 'Embeddings'],
  ['jina-rerank', 'Rerank'],
  ['/v1/rerank', 'Rerank'],
  ['image-generation', 'Images'],
  ['/v1/images/generations', 'Images'],
  ['image-edits', 'Image edits'],
  ['/v1/images/edits', 'Image edits'],
  ['openai-video', 'Videos'],
  ['/v1/video/generations', 'Videos'],
  ['audio-speech', 'Speech'],
  ['/v1/audio/speech', 'Speech'],
  ['audio-transcriptions', 'Transcriptions'],
  ['/v1/audio/transcriptions', 'Transcriptions'],
])

export function getComparisonFormats(
  endpointTypes: readonly string[] | undefined,
  endpointMap: Record<string, EndpointInfo>
): string {
  const formats = new Set<string>()
  for (const type of endpointTypes ?? []) {
    const knownFormat = FORMAT_LABELS.get(type)
    if (knownFormat) {
      formats.add(knownFormat)
      continue
    }
    const endpoint = endpointMap[type]
    const declared = typeof endpoint === 'string' ? endpoint : endpoint?.path
    const path = (declared || type).split(/[?#]/u, 1)[0]
    if (path.startsWith('/') && !path.startsWith('//')) {
      formats.add(FORMAT_LABELS.get(path) ?? path)
    }
  }
  return [...formats].join(' · ')
}
