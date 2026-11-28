package model

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

var ModelCapabilityCategories = []string{
	"text",
	"image",
	"video",
	"audio",
	"transcription",
	"other",
}

func IsModelCapabilityCategory(code string) bool {
	return slices.Contains(ModelCapabilityCategories, code)
}

func ResolveModelCapabilityCategories(tags string, supportedEndpoints []string, endpointsJSON string) []string {
	var categoryDecl string
	var hasCategoryDecl bool
	var legacyTaskDecl string
	var hasLegacyTaskDecl bool

	for raw := range strings.SplitSeq(strings.ReplaceAll(tags, "，", ","), ",") {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			continue
		}
		kind, value, hasEq := strings.Cut(trimmed, "=")
		if !hasEq || !isCatalogDeclaration(kind, value) {
			continue
		}
		if kind == "@mr:catalog:v1" && !hasCategoryDecl {
			categoryDecl = value
			hasCategoryDecl = true
		} else if kind == "@mr:tasks:v1" && !hasLegacyTaskDecl {
			legacyTaskDecl = value
			hasLegacyTaskDecl = true
		}
	}

	if hasCategoryDecl {
		if categoryDecl != "auto" {
			if categoryDecl == "none" {
				return nil
			}
			selected := make(map[string]bool)
			for code := range strings.SplitSeq(categoryDecl, "+") {
				selected[code] = true
			}
			return orderedCapabilityCategories(selected)
		}
	} else if hasLegacyTaskDecl {
		if legacyTaskDecl == "none" {
			return nil
		}
		selected := make(map[string]bool)
		for code := range strings.SplitSeq(legacyTaskDecl, "+") {
			switch code {
			case "stt":
				selected["transcription"] = true
			case "t2i", "i2i":
				selected["image"] = true
			case "t2v", "i2v":
				selected["video"] = true
			case "txt":
				selected["text"] = true
			case "tts", "aud":
				selected["audio"] = true
			}
		}
		return orderedCapabilityCategories(selected)
	}

	endpoints := make(map[string]bool, len(supportedEndpoints))
	for _, endpoint := range supportedEndpoints {
		normalized := strings.ToLower(strings.TrimSpace(endpoint))
		if normalized != "" {
			endpoints[normalized] = true
		}
	}
	for _, endpoint := range extractEndpointDisplayKeys(endpointsJSON) {
		normalized := strings.ToLower(strings.TrimSpace(endpoint))
		if normalized != "" {
			endpoints[normalized] = true
		}
	}

	detected := make(map[string]bool)
	if hasAnyEndpoint(endpoints, "audio-transcription", "audio-transcriptions", "/v1/audio/transcriptions") {
		detected["transcription"] = true
	}
	if hasAnyEndpoint(endpoints, "image-generation", "/v1/images/generations", "image-edit", "image-edits", "/v1/images/edits") {
		detected["image"] = true
	}
	if hasAnyEndpoint(endpoints, "openai-video", "text-to-video", "/v1/videos", "/v1/video/generations", "image-to-video") {
		detected["video"] = true
	}
	if hasAnyEndpoint(endpoints, "openai", "anthropic", "openai-response", "gemini", "/v1/chat/completions", "/v1/responses", "/v1/messages") {
		detected["text"] = true
	}
	if hasAnyEndpoint(endpoints, "tts", "speech", "audio-speech", "/v1/audio/speech", "audio-generation", "music-generation") {
		detected["audio"] = true
	}
	if len(detected) == 0 {
		return []string{"other"}
	}
	return orderedCapabilityCategories(detected)
}

func ModelMatchesCapabilityLabels(metadata *Model, filterLabels []string) bool {
	if len(filterLabels) == 0 {
		return true
	}
	if metadata == nil {
		return false
	}
	categories := ResolveModelCapabilityCategories(metadata.Tags, metadata.SupportedEndpoints, metadata.Endpoints)
	for _, category := range categories {
		if slices.Contains(filterLabels, category) {
			return true
		}
	}
	return false
}

func orderedCapabilityCategories(selected map[string]bool) []string {
	result := make([]string, 0, len(selected))
	for _, category := range ModelCapabilityCategories {
		if selected[category] {
			result = append(result, category)
		}
	}
	return result
}

func hasAnyEndpoint(endpoints map[string]bool, keys ...string) bool {
	for _, key := range keys {
		if endpoints[key] {
			return true
		}
	}
	return false
}

func extractEndpointDisplayKeys(endpointsJSON string) []string {
	trimmed := strings.TrimSpace(endpointsJSON)
	if trimmed == "" {
		return nil
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal([]byte(trimmed), &obj); err == nil && obj != nil {
		keys := make([]string, 0, len(obj))
		for key := range obj {
			keys = append(keys, key)
		}
		return keys
	}
	var arr []any
	if err := json.Unmarshal([]byte(trimmed), &arr); err == nil && arr != nil {
		keys := make([]string, 0, len(arr))
		for _, item := range arr {
			keys = append(keys, fmt.Sprint(item))
		}
		return keys
	}
	return nil
}

func SplitCatalogTaskTags(tags string) (ordinary, declarations string) {
	var kept, local []string
	seenDecl := make(map[string]bool)
	seenTag := make(map[string]bool)
	for tag := range strings.SplitSeq(strings.ReplaceAll(tags, "，", ","), ",") {
		trimmed := strings.TrimSpace(tag)
		if trimmed == "" {
			continue
		}
		kind, value, _ := strings.Cut(trimmed, "=")
		if !isCatalogDeclaration(kind, value) {
			if !seenTag[trimmed] {
				kept = append(kept, trimmed)
				seenTag[trimmed] = true
			}
			continue
		}
		if !seenDecl[kind] {
			local = append(local, trimmed)
			seenDecl[kind] = true
		}
	}
	return strings.Join(kept, ","), strings.Join(local, ",")
}

func NormalizeModelTags(tags string) string {
	ordinary, declarations := SplitCatalogTaskTags(tags)
	if ordinary == "" {
		return declarations
	}
	if declarations == "" {
		return ordinary
	}
	return ordinary + "," + declarations
}

func isCatalogDeclaration(kind, value string) bool {
	if kind != "@mr:tasks:v1" && kind != "@mr:catalog:v1" {
		return false
	}
	if value == "none" || kind == "@mr:catalog:v1" && value == "auto" {
		return true
	}
	for code := range strings.SplitSeq(value, "+") {
		switch code {
		case "stt", "t2i", "i2i", "t2v", "i2v", "txt", "tts", "aud":
			if kind != "@mr:tasks:v1" {
				return false
			}
		case "text", "image", "video", "audio", "transcription", "other":
			if kind != "@mr:catalog:v1" {
				return false
			}
		default:
			return false
		}
	}
	return true
}
