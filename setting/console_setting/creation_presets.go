package console_setting

import (
	"errors"
	"math"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
)

const CreationPresetsOption = "console_setting.creation_presets"
const MaxCreationPresetsBytes = 256 * 1024
const MaxCreationPresets = 100

var presetID = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`)
var ErrInvalidCreationPreset = errors.New("Invalid creation preset configuration.")

type parameterRule func(any) bool

func textParameter(limit int) parameterRule {
	return func(value any) bool {
		text, ok := value.(string)
		return ok && utf8.RuneCountInString(text) <= limit
	}
}

func enumParameter(values ...string) parameterRule {
	return func(value any) bool {
		text, ok := value.(string)
		return ok && slices.Contains(values, text)
	}
}

func numberParameter(low, high float64, integer bool) parameterRule {
	return func(value any) bool {
		number, ok := value.(float64)
		return ok && number >= low && number <= high && (!integer || math.Trunc(number) == number)
	}
}

func boolParameter(value any) bool { _, ok := value.(bool); return ok }

var creationParameters = map[string]map[string]parameterRule{
	"chat": {
		"reasoning_effort":  enumParameter("none", "minimal", "low", "medium", "high", "xhigh", "max"),
		"temperature":       numberParameter(0, 2, false),
		"top_p":             numberParameter(0, 1, false),
		"max_tokens":        numberParameter(1, 200000, true),
		"frequency_penalty": numberParameter(-2, 2, false),
		"presence_penalty":  numberParameter(-2, 2, false),
		"seed":              numberParameter(0, 2147483647, true),
	},
	"image": {"imageTask": enumParameter("generate", "edit"), "imageSize": enumParameter("1024x1024", "1024x1536", "1536x1024"), "quality": enumParameter("auto", "low", "medium", "high"), "imageFormat": enumParameter("png", "jpeg", "webp"), "imageCount": func(value any) bool { return value == 1.0 || value == 2.0 || value == 4.0 }},
	"video": {"videoTask": enumParameter("t2v", "i2v", "ref2v"), "resolution": enumParameter("480p", "720p", "1080p"), "aspectRatio": enumParameter("16:9", "9:16", "1:1", "4:3", "3:4", "21:9"), "duration": numberParameter(4, 15, true), "nativeAudio": boolParameter, "cameraFixed": boolParameter},
	"audio": {"voice": enumParameter("marin", "cedar", "alloy", "ash", "coral", "nova", "sage"), "audioFormat": enumParameter("mp3", "wav", "opus", "aac", "flac"), "speed": numberParameter(0.5, 2, false), "instructions": textParameter(2000)},
}

func ParseCreationPresets(raw string) ([]map[string]any, error) {
	var presets []map[string]any
	if len(raw) > MaxCreationPresetsBytes || common.UnmarshalJsonStr(raw, &presets) != nil || presets == nil || len(presets) > MaxCreationPresets {
		return nil, ErrInvalidCreationPreset
	}
	seen := make(map[string]bool, len(presets))
	for _, preset := range presets {
		if err := ValidateCreationPreset(preset); err != nil {
			return nil, err
		}
		id, _ := preset["id"].(string)
		if seen[id] {
			return nil, ErrInvalidCreationPreset
		}
		seen[id] = true
	}
	return presets, nil
}

func ValidateCreationPreset(preset map[string]any) error {
	id, _ := preset["id"].(string)
	mode, _ := preset["mode"].(string)
	rules := creationParameters[mode]
	if !presetID.MatchString(id) || rules == nil {
		return ErrInvalidCreationPreset
	}
	for field, limit := range map[string]int{"title": 120, "model": 256, "prompt": 8000} {
		text, ok := preset[field].(string)
		if !ok || strings.TrimSpace(text) == "" || utf8.RuneCountInString(text) > limit || (field == "model" && text != strings.TrimSpace(text)) {
			return ErrInvalidCreationPreset
		}
	}
	for field, value := range preset {
		switch field {
		case "id", "mode", "title", "model", "prompt":
		case "description":
			if !textParameter(500)(value) {
				return ErrInvalidCreationPreset
			}
		case "category":
			if !textParameter(80)(value) {
				return ErrInvalidCreationPreset
			}
		case "tags":
			tags, ok := value.([]any)
			if !ok || len(tags) > 12 {
				return ErrInvalidCreationPreset
			}
			seen := make(map[string]bool, len(tags))
			for _, entry := range tags {
				tag, ok := entry.(string)
				if !ok || tag == "" || strings.TrimSpace(tag) != tag || utf8.RuneCountInString(tag) > 32 || seen[tag] {
					return ErrInvalidCreationPreset
				}
				seen[tag] = true
			}
		case "cover_url":
			cover, ok := value.(string)
			if !ok || len(cover) > 2048 || strings.ContainsAny(cover, "\\ \t\r\n#") || !strings.HasPrefix(cover, "https://") {
				return ErrInvalidCreationPreset
			}
			address, err := url.ParseRequestURI(cover)
			if err != nil || address.Hostname() == "" || address.User != nil {
				return ErrInvalidCreationPreset
			}
		case "featured", "published":
			if !boolParameter(value) {
				return ErrInvalidCreationPreset
			}
		case "parameters":
			parameters, ok := value.(map[string]any)
			if !ok {
				return ErrInvalidCreationPreset
			}
			for name, parameter := range parameters {
				if valid := rules[name]; valid == nil || !valid(parameter) {
					return ErrInvalidCreationPreset
				}
			}
		default:
			return ErrInvalidCreationPreset
		}
	}
	return nil
}

func PublishedCreationPresets(raw string) ([]map[string]any, error) {
	presets, err := ParseCreationPresets(raw)
	if err != nil {
		return nil, err
	}
	return slices.DeleteFunc(presets, func(preset map[string]any) bool {
		return preset["published"] == false
	}), nil
}
