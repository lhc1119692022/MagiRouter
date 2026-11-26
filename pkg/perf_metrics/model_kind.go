package perfmetrics

import "strings"

const (
	ModelKindText          = "text"
	ModelKindImage         = "image"
	ModelKindVideo         = "video"
	ModelKindAudio         = "audio"
	ModelKindTranscription = "transcription"
	ModelKindOther         = "other"

	MetricFocusCacheRate = "cache_rate"
	MetricFocusDuration  = "duration"
)

var CanonicalCapabilities = []string{
	ModelKindText,
	ModelKindImage,
	ModelKindVideo,
	ModelKindAudio,
	ModelKindTranscription,
	ModelKindOther,
}

const (
	catalogCategoryTagPrefix = "@mr:catalog:v1="
	legacyTaskTagPrefix      = "@mr:tasks:v1="
)

var validCapabilitySet = map[string]bool{
	ModelKindText:          true,
	ModelKindImage:         true,
	ModelKindVideo:         true,
	ModelKindAudio:         true,
	ModelKindTranscription: true,
	ModelKindOther:         true,
}

var legacyTaskCodeToCapability = map[string]string{
	"txt": ModelKindText,
	"t2i": ModelKindImage,
	"i2i": ModelKindImage,
	"t2v": ModelKindVideo,
	"i2v": ModelKindVideo,
	"tts": ModelKindAudio,
	"aud": ModelKindAudio,
	"stt": ModelKindTranscription,
}

var imageModelKeywords = []string{
	"midjourney",
	"mj_",
	"dall-e",
	"gpt-image",
	"imagen",
	"flux",
	"sdxl",
	"stable-diffusion",
	"ideogram",
	"recraft",
	"seedream",
	"cogview",
	"kolors",
}

var videoModelKeywords = []string{
	"sora",
	"veo",
	"kling",
	"vidu",
	"jimeng",
	"runway",
	"luma",
	"pika",
	"hailuo",
	"wan-",
	"seedance",
	"cogvideo",
}

var audioModelKeywords = []string{
	"suno",
	"tts-",
	"realtime",
	"audio-preview",
	"cosyvoice",
	"fish-speech",
	"minimax-speech",
	"eleven_",
}

var transcriptionModelKeywords = []string{
	"whisper",
	"transcribe",
	"speech-to-text",
	"asr-",
	"-asr",
}

var otherNonChatKeywords = []string{
	"embedding",
	"embed",
	"rerank",
	"bge-",
	"m3e",
	"moderation",
}

func containsAnyKeyword(lower string, keywords []string) bool {
	for _, keyword := range keywords {
		if strings.Contains(lower, keyword) {
			return true
		}
	}
	return false
}

func ClassifyModelKind(modelName string) string {
	lower := strings.ToLower(strings.TrimSpace(modelName))
	if lower == "" {
		return ModelKindText
	}
	if containsAnyKeyword(lower, videoModelKeywords) {
		return ModelKindVideo
	}
	if containsAnyKeyword(lower, imageModelKeywords) {
		return ModelKindImage
	}
	if containsAnyKeyword(lower, transcriptionModelKeywords) {
		return ModelKindTranscription
	}
	if containsAnyKeyword(lower, audioModelKeywords) {
		return ModelKindAudio
	}
	if containsAnyKeyword(lower, otherNonChatKeywords) {
		return ModelKindOther
	}
	return ModelKindText
}

func parseDeclaredCapabilities(tags string) ([]string, bool) {
	if strings.TrimSpace(tags) == "" {
		return nil, false
	}
	parts := strings.FieldsFunc(tags, func(r rune) bool {
		return r == ',' || r == '，'
	})
	var legacyDecl string
	for _, raw := range parts {
		token := strings.TrimSpace(raw)
		if strings.HasPrefix(token, catalogCategoryTagPrefix) {
			val := strings.TrimPrefix(token, catalogCategoryTagPrefix)
			if val == "auto" {
				return nil, false
			}
			if val == "none" {
				return []string{}, true
			}
			seen := make(map[string]bool)
			for _, code := range strings.Split(val, "+") {
				if validCapabilitySet[code] {
					seen[code] = true
				}
			}
			return orderedCapabilities(seen), true
		}
		if strings.HasPrefix(token, legacyTaskTagPrefix) {
			legacyDecl = strings.TrimPrefix(token, legacyTaskTagPrefix)
		}
	}
	if legacyDecl != "" {
		if legacyDecl == "none" {
			return []string{}, true
		}
		seen := make(map[string]bool)
		for _, code := range strings.Split(legacyDecl, "+") {
			if capName, ok := legacyTaskCodeToCapability[code]; ok {
				seen[capName] = true
			}
		}
		return orderedCapabilities(seen), true
	}
	return nil, false
}

func orderedCapabilities(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for _, capName := range CanonicalCapabilities {
		if set[capName] {
			out = append(out, capName)
		}
	}
	return out
}

// ClassifyModelCapabilities returns the Model Plaza capability categories
// supported by a model, honoring explicit model-management tags first and
// falling back to declared endpoints and model-name family rules.
func ClassifyModelCapabilities(modelName string, tags string, endpoints []string) []string {
	if declared, ok := parseDeclaredCapabilities(tags); ok {
		if len(declared) > 0 {
			return declared
		}
	}
	seen := make(map[string]bool)
	for _, ep := range endpoints {
		switch strings.ToLower(strings.TrimSpace(ep)) {
		case "image-generation", "image-edit", "image-edits", "/v1/images/generations", "/v1/images/edits":
			seen[ModelKindImage] = true
		case "openai-video", "video-generation", "/v1/videos":
			seen[ModelKindVideo] = true
		case "audio-transcription", "audio-transcriptions", "/v1/audio/transcriptions":
			seen[ModelKindTranscription] = true
		case "audio-speech", "text-to-speech", "/v1/audio/speech":
			seen[ModelKindAudio] = true
		case "embeddings", "jina-rerank", "/v1/embeddings", "/v1/rerank":
			seen[ModelKindOther] = true
		}
	}
	nameKind := ClassifyModelKind(modelName)
	if nameKind != ModelKindText || len(seen) == 0 {
		seen[nameKind] = true
	}
	return orderedCapabilities(seen)
}

// IsRandomTestExcludedByDefault reports whether a model belongs to non-chat
// media or moderation families that should be skipped by default when randomly
// sampling a channel's models for active health checks.
func IsRandomTestExcludedByDefault(modelName string) bool {
	lower := strings.ToLower(strings.TrimSpace(modelName))
	if lower == "" {
		return true
	}
	kind := ClassifyModelKind(lower)
	if kind == ModelKindImage || kind == ModelKindVideo || kind == ModelKindAudio || kind == ModelKindTranscription {
		return true
	}
	return strings.Contains(lower, "moderation")
}
