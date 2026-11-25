package console_setting

import (
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"

	"github.com/MoeForge/moego/regexp"
	"github.com/QuantumNous/new-api/common"
)

const (
	SitePopupsOption   = "console_setting.site_popups"
	MaxSitePopupsBytes = 64 * 1024
	maxSitePopups      = 12
)

var (
	sitePopupIDRegex     = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`)
	allowedPopupTriggers = map[string]struct{}{
		"sign_up": {},
		"console": {},
		"sign_in": {},
		"home":    {},
	}
	allowedPopupTones = map[string]struct{}{
		"info":    {},
		"warning": {},
		"notice":  {},
	}
	allowedPopupFrequencies = map[string]struct{}{
		"once":    {},
		"daily":   {},
		"session": {},
		"always":  {},
	}
)

type SitePopupItem struct {
	ID             string `json:"id"`
	Enabled        bool   `json:"enabled"`
	Trigger        string `json:"trigger"`
	Title          string `json:"title"`
	Content        string `json:"content"`
	Tone           string `json:"tone,omitempty"`
	ConfirmText    string `json:"confirm_text,omitempty"`
	Frequency      string `json:"frequency,omitempty"`
	RequireConfirm bool   `json:"require_confirm,omitempty"`
	CheckboxLabel  string `json:"checkbox_label,omitempty"`
	Version        int    `json:"version,omitempty"`
}

var sitePopupsCache struct {
	sync.Mutex
	raw     string
	enabled []SitePopupItem
}

func isValidPopupSingleLine(value string, maxRunes int) bool {
	return utf8.RuneCountInString(value) <= maxRunes && strings.IndexFunc(value, unicode.IsControl) < 0
}

func ParseSitePopups(raw string) ([]SitePopupItem, error) {
	invalid := common.NewMessage("Invalid site popup configuration.")
	if len(raw) > MaxSitePopupsBytes {
		return nil, invalid
	}
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "[]" {
		return []SitePopupItem{}, nil
	}
	if !strings.HasPrefix(trimmed, "[") {
		return nil, invalid
	}
	var entries []SitePopupItem
	if common.UnmarshalJsonStr(raw, &entries) != nil || entries == nil || len(entries) > maxSitePopups {
		return nil, invalid
	}
	result := make([]SitePopupItem, 0, len(entries))
	seen := make(map[string]struct{}, len(entries))
	for _, item := range entries {
		item.ID = strings.TrimSpace(item.ID)
		item.Trigger = strings.TrimSpace(item.Trigger)
		item.Title = strings.TrimSpace(item.Title)
		item.Content = strings.TrimSpace(item.Content)
		item.Tone = strings.TrimSpace(item.Tone)
		item.ConfirmText = strings.TrimSpace(item.ConfirmText)
		item.Frequency = strings.TrimSpace(item.Frequency)
		item.CheckboxLabel = strings.TrimSpace(item.CheckboxLabel)

		if !sitePopupIDRegex.MatchString(item.ID) {
			return nil, invalid
		}
		if _, duplicate := seen[item.ID]; duplicate {
			return nil, invalid
		}
		seen[item.ID] = struct{}{}

		if _, ok := allowedPopupTriggers[item.Trigger]; !ok {
			return nil, invalid
		}
		if item.Title == "" || !isValidPopupSingleLine(item.Title, 120) {
			return nil, invalid
		}
		if item.Content == "" || utf8.RuneCountInString(item.Content) > 8000 {
			return nil, invalid
		}
		if item.Tone == "" {
			item.Tone = "info"
		} else if _, ok := allowedPopupTones[item.Tone]; !ok {
			return nil, invalid
		}
		if !isValidPopupSingleLine(item.ConfirmText, 40) {
			return nil, invalid
		}
		if item.Frequency == "" {
			item.Frequency = "once"
		} else if _, ok := allowedPopupFrequencies[item.Frequency]; !ok {
			return nil, invalid
		}
		if !isValidPopupSingleLine(item.CheckboxLabel, 160) {
			return nil, invalid
		}
		if item.Version < 0 || item.Version > 100000 {
			return nil, invalid
		}
		if item.Version == 0 {
			item.Version = 1
		}
		result = append(result, item)
	}
	return result, nil
}

func GetEnabledSitePopups() []SitePopupItem {
	common.OptionMapRWMutex.RLock()
	raw := GetConsoleSetting().SitePopups
	common.OptionMapRWMutex.RUnlock()

	sitePopupsCache.Lock()
	defer sitePopupsCache.Unlock()
	if raw != sitePopupsCache.raw {
		parsed, err := ParseSitePopups(raw)
		if err != nil {
			parsed = []SitePopupItem{}
		}
		enabled := make([]SitePopupItem, 0, len(parsed))
		for _, item := range parsed {
			if item.Enabled {
				enabled = append(enabled, item)
			}
		}
		sitePopupsCache.enabled = enabled
		sitePopupsCache.raw = raw
	}
	return sitePopupsCache.enabled
}
