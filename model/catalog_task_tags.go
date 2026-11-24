package model

import "strings"

func SplitCatalogTaskTags(tags string) (ordinary, declarations string) {
	var kept, local []string
	seen := make(map[string]bool)
	for tag := range strings.SplitSeq(tags, ",") {
		trimmed := strings.TrimSpace(tag)
		kind, value, _ := strings.Cut(trimmed, "=")
		if !isCatalogDeclaration(kind, value) {
			kept = append(kept, tag)
			continue
		}
		if !seen[kind] {
			local = append(local, trimmed)
			seen[kind] = true
		}
	}
	return strings.Join(kept, ","), strings.Join(local, ",")
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
