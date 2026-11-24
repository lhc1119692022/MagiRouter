package console_setting

import (
	"net/url"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
)

const HomeShowcaseOption = "console_setting.home_showcase"

type HomeShowcaseItem struct {
	Eyebrow      string   `json:"eyebrow,omitempty"`
	Title        string   `json:"title,omitempty"`
	Description  string   `json:"description,omitempty"`
	MediaURL     string   `json:"media_url,omitempty"`
	MediaType    string   `json:"media_type,omitempty"`
	PosterURL    string   `json:"poster_url,omitempty"`
	Models       []string `json:"models,omitempty"`
	ExploreLabel string   `json:"explore_label,omitempty"`
}

var allowedHomeShowcaseTabs = map[string]struct{}{
	"text":  {},
	"image": {},
	"video": {},
	"audio": {},
}

var homeShowcaseCache struct {
	sync.Mutex
	raw   string
	items map[string]HomeShowcaseItem
}

func isValidHomeShowcaseURL(raw string) bool {
	if raw == "" {
		return true
	}
	if len(raw) > 2048 || strings.Contains(raw, "\\") || strings.IndexFunc(raw, unicode.IsSpace) >= 0 || strings.IndexFunc(raw, unicode.IsControl) >= 0 {
		return false
	}
	if strings.HasPrefix(raw, "/") {
		return !strings.HasPrefix(raw, "//")
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.User != nil || parsed.Hostname() == "" {
		return false
	}
	return parsed.Scheme == "https" || parsed.Scheme == "http"
}

func ParseHomeShowcase(raw string) (map[string]HomeShowcaseItem, error) {
	invalid := common.NewMessage("Invalid home showcase configuration.")
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "{}" {
		return map[string]HomeShowcaseItem{}, nil
	}
	if len(raw) > 64*1024 {
		return nil, invalid
	}
	var entries map[string]HomeShowcaseItem
	if common.UnmarshalJsonStr(raw, &entries) != nil || entries == nil {
		return nil, invalid
	}
	result := make(map[string]HomeShowcaseItem, len(entries))
	for key, item := range entries {
		if _, ok := allowedHomeShowcaseTabs[key]; !ok {
			return nil, invalid
		}
		item.Eyebrow = strings.TrimSpace(item.Eyebrow)
		item.Title = strings.TrimSpace(item.Title)
		item.Description = strings.TrimSpace(item.Description)
		item.MediaURL = strings.TrimSpace(item.MediaURL)
		item.MediaType = strings.TrimSpace(item.MediaType)
		item.PosterURL = strings.TrimSpace(item.PosterURL)
		item.ExploreLabel = strings.TrimSpace(item.ExploreLabel)
		if utf8.RuneCountInString(item.Eyebrow) > 80 ||
			utf8.RuneCountInString(item.Title) > 120 ||
			utf8.RuneCountInString(item.Description) > 400 ||
			utf8.RuneCountInString(item.ExploreLabel) > 40 {
			return nil, invalid
		}
		if item.MediaType != "" && item.MediaType != "auto" && item.MediaType != "image" && item.MediaType != "video" {
			return nil, invalid
		}
		if !isValidHomeShowcaseURL(item.MediaURL) || !isValidHomeShowcaseURL(item.PosterURL) {
			return nil, invalid
		}
		if len(item.Models) > 8 {
			return nil, invalid
		}
		cleanModels := make([]string, 0, len(item.Models))
		seen := make(map[string]struct{}, len(item.Models))
		for _, modelName := range item.Models {
			trimmedModel := strings.TrimSpace(modelName)
			if trimmedModel == "" {
				continue
			}
			if utf8.RuneCountInString(trimmedModel) > 256 || strings.IndexFunc(trimmedModel, unicode.IsControl) >= 0 {
				return nil, invalid
			}
			if _, exists := seen[trimmedModel]; exists {
				continue
			}
			seen[trimmedModel] = struct{}{}
			cleanModels = append(cleanModels, trimmedModel)
		}
		item.Models = cleanModels
		result[key] = item
	}
	return result, nil
}

func GetHomeShowcase() map[string]HomeShowcaseItem {
	common.OptionMapRWMutex.RLock()
	raw := GetConsoleSetting().HomeShowcase
	common.OptionMapRWMutex.RUnlock()
	homeShowcaseCache.Lock()
	defer homeShowcaseCache.Unlock()
	if raw != homeShowcaseCache.raw {
		parsed, err := ParseHomeShowcase(raw)
		if err != nil {
			parsed = map[string]HomeShowcaseItem{}
		}
		homeShowcaseCache.items = parsed
		homeShowcaseCache.raw = raw
	}
	return homeShowcaseCache.items
}
