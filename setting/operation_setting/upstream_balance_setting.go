package operation_setting

import (
	"fmt"
	"math"
	"net/mail"
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

const (
	UpstreamBalanceOptionPrefix   = "upstream_balance_setting."
	UpstreamBalanceStateOptionKey = "upstream_balance_monitor.state"

	UpstreamBalanceProviderAuto    = "auto"
	UpstreamBalanceProviderNewAPI  = "new_api"
	UpstreamBalanceProviderSub2API = "sub2api"
	UpstreamBalanceProviderIgnore  = "ignore"

	DefaultUpstreamCheckIntervalMinutes = 30
	MinUpstreamCheckIntervalMinutes     = 5
	MaxUpstreamCheckIntervalMinutes     = 1440

	DefaultUpstreamAlertCooldownMinutes = 1440
	MaxUpstreamAlertCooldownMinutes     = 43200

	MaxUpstreamCNYThreshold = 100000000.0
	MaxUpstreamCNYRate      = 1000.0
)

type UpstreamBalanceSiteConfig struct {
	Name              string   `json:"name"`
	ProviderType      string   `json:"provider_type"`
	CNYRate           *float64 `json:"cny_rate,omitempty"`
	ReferenceTotalCNY *float64 `json:"reference_total_cny,omitempty"`
	AlertEnabled      *bool    `json:"alert_enabled,omitempty"`
	MinBalanceCNY     *float64 `json:"min_balance_cny,omitempty"`
	MinPercent        *float64 `json:"min_percent,omitempty"`
	AccessToken       string   `json:"access_token,omitempty"`
	ClearAccessToken  bool     `json:"clear_access_token,omitempty"`
	HasAccessToken    bool     `json:"has_access_token,omitempty"`
	UserID            string   `json:"user_id,omitempty"`
	Note              string   `json:"note,omitempty"`
}

type UpstreamBalanceChannelConfig struct {
	ProviderOverride  string   `json:"provider_override,omitempty"`
	AlertEnabled      *bool    `json:"alert_enabled,omitempty"`
	MinBalanceCNY     *float64 `json:"min_balance_cny,omitempty"`
	MinPercent        *float64 `json:"min_percent,omitempty"`
	ReferenceTotalCNY *float64 `json:"reference_total_cny,omitempty"`
	Note              string   `json:"note,omitempty"`
}

type UpstreamBalanceSetting struct {
	Enabled              bool                                    `json:"enabled"`
	CheckIntervalMinutes int                                     `json:"check_interval_minutes"`
	AlertCooldownMinutes int                                     `json:"alert_cooldown_minutes"`
	NotifyEmails         string                                  `json:"notify_emails"`
	DefaultMinBalanceCNY *float64                                `json:"default_min_balance_cny"`
	DefaultMinPercent    *float64                                `json:"default_min_percent"`
	Sites                map[string]UpstreamBalanceSiteConfig    `json:"sites"`
	Channels             map[string]UpstreamBalanceChannelConfig `json:"channels"`
}

var upstreamBalanceSetting = UpstreamBalanceSetting{
	Enabled:              false,
	CheckIntervalMinutes: DefaultUpstreamCheckIntervalMinutes,
	AlertCooldownMinutes: DefaultUpstreamAlertCooldownMinutes,
	NotifyEmails:         "",
	DefaultMinBalanceCNY: nil,
	DefaultMinPercent:    nil,
	Sites:                map[string]UpstreamBalanceSiteConfig{},
	Channels:             map[string]UpstreamBalanceChannelConfig{},
}

func init() {
	config.GlobalConfig.Register("upstream_balance_setting", &upstreamBalanceSetting)
}

func GetUpstreamBalanceSettingSnapshot() UpstreamBalanceSetting {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	copied := upstreamBalanceSetting
	if upstreamBalanceSetting.DefaultMinBalanceCNY != nil {
		val := *upstreamBalanceSetting.DefaultMinBalanceCNY
		copied.DefaultMinBalanceCNY = &val
	}
	if upstreamBalanceSetting.DefaultMinPercent != nil {
		val := *upstreamBalanceSetting.DefaultMinPercent
		copied.DefaultMinPercent = &val
	}
	copied.Sites = cloneUpstreamBalanceSiteMap(upstreamBalanceSetting.Sites)
	copied.Channels = cloneUpstreamBalanceChannelMap(upstreamBalanceSetting.Channels)
	return copied.Normalized()
}

func EffectiveUSDExchangeRate() float64 {
	common.OptionMapRWMutex.RLock()
	rate := USDExchangeRate
	common.OptionMapRWMutex.RUnlock()
	if math.IsNaN(rate) || math.IsInf(rate, 0) || rate <= 0 {
		return 7.3
	}
	return rate
}

func NormalizeUpstreamSiteKey(rawURL string) string {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return ""
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return strings.TrimRight(trimmed, "/")
	}
	scheme := strings.ToLower(parsed.Scheme)
	host := strings.ToLower(parsed.Host)
	cleanPath := strings.TrimRight(parsed.Path, "/")
	for _, suffix := range []string{"/v1beta", "/v1"} {
		if strings.HasSuffix(strings.ToLower(cleanPath), suffix) {
			cleanPath = strings.TrimRight(cleanPath[:len(cleanPath)-len(suffix)], "/")
			break
		}
	}
	if cleanPath == "" {
		return scheme + "://" + host
	}
	return scheme + "://" + host + cleanPath
}

func ParseUpstreamNotifyEmails(raw string) ([]string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}
	normalized := strings.NewReplacer(",", ";", "\n", ";", "\r", ";").Replace(trimmed)
	seen := make(map[string]struct{})
	result := make([]string, 0, 4)
	for part := range strings.SplitSeq(normalized, ";") {
		candidate := strings.TrimSpace(part)
		if candidate == "" {
			continue
		}
		parsed, err := mail.ParseAddress(candidate)
		if err != nil || strings.TrimSpace(parsed.Address) == "" || parsed.Address != candidate {
			return nil, common.NewMessage("Invalid notification email address: {{email}}", map[string]any{"email": candidate})
		}
		lower := strings.ToLower(candidate)
		if _, exists := seen[lower]; exists {
			continue
		}
		seen[lower] = struct{}{}
		result = append(result, candidate)
	}
	return result, nil
}

func cloneFloatPtr(source *float64) *float64 {
	if source == nil {
		return nil
	}
	val := *source
	return &val
}

func cloneBoolPtr(source *bool) *bool {
	if source == nil {
		return nil
	}
	val := *source
	return &val
}

func cloneUpstreamBalanceSiteMap(source map[string]UpstreamBalanceSiteConfig) map[string]UpstreamBalanceSiteConfig {
	result := make(map[string]UpstreamBalanceSiteConfig, len(source))
	for key, item := range source {
		result[key] = UpstreamBalanceSiteConfig{
			Name:              item.Name,
			ProviderType:      item.ProviderType,
			CNYRate:           cloneFloatPtr(item.CNYRate),
			ReferenceTotalCNY: cloneFloatPtr(item.ReferenceTotalCNY),
			AlertEnabled:      cloneBoolPtr(item.AlertEnabled),
			MinBalanceCNY:     cloneFloatPtr(item.MinBalanceCNY),
			MinPercent:        cloneFloatPtr(item.MinPercent),
			AccessToken:       item.AccessToken,
			ClearAccessToken:  item.ClearAccessToken,
			HasAccessToken:    item.HasAccessToken,
			UserID:            item.UserID,
			Note:              item.Note,
		}
	}
	return result
}

func cloneUpstreamBalanceChannelMap(source map[string]UpstreamBalanceChannelConfig) map[string]UpstreamBalanceChannelConfig {
	result := make(map[string]UpstreamBalanceChannelConfig, len(source))
	for key, item := range source {
		result[key] = UpstreamBalanceChannelConfig{
			ProviderOverride:  item.ProviderOverride,
			AlertEnabled:      cloneBoolPtr(item.AlertEnabled),
			MinBalanceCNY:     cloneFloatPtr(item.MinBalanceCNY),
			MinPercent:        cloneFloatPtr(item.MinPercent),
			ReferenceTotalCNY: cloneFloatPtr(item.ReferenceTotalCNY),
			Note:              item.Note,
		}
	}
	return result
}

func normalizeUpstreamProviderType(raw string, allowEmpty bool) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case UpstreamBalanceProviderNewAPI:
		return UpstreamBalanceProviderNewAPI
	case UpstreamBalanceProviderSub2API:
		return UpstreamBalanceProviderSub2API
	case UpstreamBalanceProviderIgnore:
		return UpstreamBalanceProviderIgnore
	case UpstreamBalanceProviderAuto:
		if allowEmpty {
			return ""
		}
		return UpstreamBalanceProviderAuto
	case "":
		if allowEmpty {
			return ""
		}
		return UpstreamBalanceProviderAuto
	default:
		return strings.ToLower(strings.TrimSpace(raw))
	}
}

func isValidUpstreamProviderType(raw string, allowEmpty bool) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case UpstreamBalanceProviderNewAPI, UpstreamBalanceProviderSub2API, UpstreamBalanceProviderIgnore:
		return true
	case UpstreamBalanceProviderAuto:
		return !allowEmpty
	case "":
		return true
	default:
		return false
	}
}

func (setting UpstreamBalanceSetting) Validate() error {
	if setting.CheckIntervalMinutes != 0 && (setting.CheckIntervalMinutes < MinUpstreamCheckIntervalMinutes || setting.CheckIntervalMinutes > MaxUpstreamCheckIntervalMinutes) {
		return common.NewMessage("Check interval must be between 5 and 1440 minutes")
	}
	if setting.AlertCooldownMinutes < 0 || setting.AlertCooldownMinutes > MaxUpstreamAlertCooldownMinutes {
		return common.NewMessage("Alert cooldown must be between 0 and 43200 minutes")
	}
	if _, err := ParseUpstreamNotifyEmails(setting.NotifyEmails); err != nil {
		return err
	}
	if err := validateOptionalAmount(setting.DefaultMinBalanceCNY, MaxUpstreamCNYThreshold, "Default minimum balance threshold must be between 0 and 100000000"); err != nil {
		return err
	}
	if err := validateOptionalPercent(setting.DefaultMinPercent, "Default minimum remaining percentage must be between 0 and 100"); err != nil {
		return err
	}
	for rawKey, site := range setting.Sites {
		if NormalizeUpstreamSiteKey(rawKey) == "" {
			return common.NewMessage("Site URL key cannot be empty")
		}
		if !isValidUpstreamProviderType(site.ProviderType, false) {
			return common.NewMessage("Invalid upstream provider type")
		}
		if site.CNYRate != nil && (math.IsNaN(*site.CNYRate) || math.IsInf(*site.CNYRate, 0) || *site.CNYRate <= 0 || *site.CNYRate > MaxUpstreamCNYRate) {
			return common.NewMessage("CNY exchange rate must be greater than 0 and no more than 1000")
		}
		if err := validateOptionalAmount(site.ReferenceTotalCNY, MaxUpstreamCNYThreshold, "Reference total must be between 0 and 100000000"); err != nil {
			return err
		}
		if err := validateOptionalAmount(site.MinBalanceCNY, MaxUpstreamCNYThreshold, "Minimum balance threshold must be between 0 and 100000000"); err != nil {
			return err
		}
		if err := validateOptionalPercent(site.MinPercent, "Minimum remaining percentage must be between 0 and 100"); err != nil {
			return err
		}
	}
	for rawID, channel := range setting.Channels {
		channelID, err := strconv.Atoi(strings.TrimSpace(rawID))
		if err != nil || channelID <= 0 {
			return common.NewMessage("Invalid channel ID")
		}
		if !isValidUpstreamProviderType(channel.ProviderOverride, true) {
			return common.NewMessage("Invalid upstream provider type")
		}
		if err := validateOptionalAmount(channel.ReferenceTotalCNY, MaxUpstreamCNYThreshold, "Reference total must be between 0 and 100000000"); err != nil {
			return err
		}
		if err := validateOptionalAmount(channel.MinBalanceCNY, MaxUpstreamCNYThreshold, "Minimum balance threshold must be between 0 and 100000000"); err != nil {
			return err
		}
		if err := validateOptionalPercent(channel.MinPercent, "Minimum remaining percentage must be between 0 and 100"); err != nil {
			return err
		}
	}
	return nil
}

func validateOptionalAmount(value *float64, maxValue float64, message string) error {
	if value == nil {
		return nil
	}
	if math.IsNaN(*value) || math.IsInf(*value, 0) || *value < 0 || *value > maxValue {
		return common.NewMessage(message)
	}
	return nil
}

func validateOptionalPercent(value *float64, message string) error {
	if value == nil {
		return nil
	}
	if math.IsNaN(*value) || math.IsInf(*value, 0) || *value < 0 || *value > 100 {
		return common.NewMessage(message)
	}
	return nil
}

func (setting UpstreamBalanceSetting) MergeSecrets(existing UpstreamBalanceSetting) UpstreamBalanceSetting {
	merged := setting
	merged.Sites = cloneUpstreamBalanceSiteMap(setting.Sites)
	for rawKey, site := range merged.Sites {
		siteKey := NormalizeUpstreamSiteKey(rawKey)
		if siteKey == "" {
			continue
		}
		if site.ClearAccessToken {
			site.AccessToken = ""
		} else if strings.TrimSpace(site.AccessToken) == "" {
			if prev, ok := existing.Sites[siteKey]; ok {
				site.AccessToken = prev.AccessToken
			}
		}
		site.ClearAccessToken = false
		site.HasAccessToken = strings.TrimSpace(site.AccessToken) != ""
		merged.Sites[rawKey] = site
	}
	return merged
}

func (setting UpstreamBalanceSetting) Normalized() UpstreamBalanceSetting {
	out := UpstreamBalanceSetting{
		Enabled:              setting.Enabled,
		CheckIntervalMinutes: setting.CheckIntervalMinutes,
		AlertCooldownMinutes: setting.AlertCooldownMinutes,
		NotifyEmails:         strings.TrimSpace(setting.NotifyEmails),
		DefaultMinBalanceCNY: sanitizeOptionalFloat(setting.DefaultMinBalanceCNY, 0, MaxUpstreamCNYThreshold),
		DefaultMinPercent:    sanitizeOptionalFloat(setting.DefaultMinPercent, 0, 100),
		Sites:                make(map[string]UpstreamBalanceSiteConfig, len(setting.Sites)),
		Channels:             make(map[string]UpstreamBalanceChannelConfig, len(setting.Channels)),
	}
	if out.CheckIntervalMinutes < MinUpstreamCheckIntervalMinutes || out.CheckIntervalMinutes > MaxUpstreamCheckIntervalMinutes {
		out.CheckIntervalMinutes = DefaultUpstreamCheckIntervalMinutes
	}
	if out.AlertCooldownMinutes < 0 || out.AlertCooldownMinutes > MaxUpstreamAlertCooldownMinutes {
		out.AlertCooldownMinutes = DefaultUpstreamAlertCooldownMinutes
	}
	if emails, err := ParseUpstreamNotifyEmails(out.NotifyEmails); err == nil {
		out.NotifyEmails = strings.Join(emails, "; ")
	}
	for rawKey, site := range setting.Sites {
		siteKey := NormalizeUpstreamSiteKey(rawKey)
		if siteKey == "" {
			continue
		}
		normalizedSite := UpstreamBalanceSiteConfig{
			Name:              strings.TrimSpace(site.Name),
			ProviderType:      normalizeUpstreamProviderType(site.ProviderType, false),
			CNYRate:           sanitizePositiveFloat(site.CNYRate, MaxUpstreamCNYRate),
			ReferenceTotalCNY: sanitizePositiveFloat(site.ReferenceTotalCNY, MaxUpstreamCNYThreshold),
			AlertEnabled:      cloneBoolPtr(site.AlertEnabled),
			MinBalanceCNY:     sanitizeOptionalFloat(site.MinBalanceCNY, 0, MaxUpstreamCNYThreshold),
			MinPercent:        sanitizeOptionalFloat(site.MinPercent, 0, 100),
			AccessToken:       strings.TrimSpace(site.AccessToken),
			ClearAccessToken:  false,
			HasAccessToken:    strings.TrimSpace(site.AccessToken) != "",
			UserID:            strings.TrimSpace(site.UserID),
			Note:              strings.TrimSpace(site.Note),
		}
		if !isValidUpstreamProviderType(normalizedSite.ProviderType, false) {
			normalizedSite.ProviderType = UpstreamBalanceProviderAuto
		}
		out.Sites[siteKey] = normalizedSite
	}
	for rawID, channel := range setting.Channels {
		channelID, err := strconv.Atoi(strings.TrimSpace(rawID))
		if err != nil || channelID <= 0 {
			continue
		}
		normalizedChannel := UpstreamBalanceChannelConfig{
			ProviderOverride:  normalizeUpstreamProviderType(channel.ProviderOverride, true),
			AlertEnabled:      cloneBoolPtr(channel.AlertEnabled),
			MinBalanceCNY:     sanitizeOptionalFloat(channel.MinBalanceCNY, 0, MaxUpstreamCNYThreshold),
			MinPercent:        sanitizeOptionalFloat(channel.MinPercent, 0, 100),
			ReferenceTotalCNY: sanitizePositiveFloat(channel.ReferenceTotalCNY, MaxUpstreamCNYThreshold),
			Note:              strings.TrimSpace(channel.Note),
		}
		if !isValidUpstreamProviderType(normalizedChannel.ProviderOverride, true) {
			normalizedChannel.ProviderOverride = ""
		}
		out.Channels[strconv.Itoa(channelID)] = normalizedChannel
	}
	return out
}

func (setting UpstreamBalanceSetting) Redacted() UpstreamBalanceSetting {
	out := setting.Normalized()
	for key, site := range out.Sites {
		site.HasAccessToken = strings.TrimSpace(site.AccessToken) != ""
		site.AccessToken = ""
		site.ClearAccessToken = false
		out.Sites[key] = site
	}
	return out
}

func sanitizeOptionalFloat(value *float64, minValue, maxValue float64) *float64 {
	if value == nil || math.IsNaN(*value) || math.IsInf(*value, 0) || *value < minValue || *value > maxValue {
		return nil
	}
	v := *value
	return &v
}

func sanitizePositiveFloat(value *float64, maxValue float64) *float64 {
	if value == nil || math.IsNaN(*value) || math.IsInf(*value, 0) || *value <= 0 || *value > maxValue {
		return nil
	}
	v := *value
	return &v
}

func serializeFloatPtr(value *float64) string {
	if value == nil {
		return "null"
	}
	return strconv.FormatFloat(*value, 'f', -1, 64)
}

func (setting UpstreamBalanceSetting) ToOptionMap() (map[string]string, error) {
	cfg := setting.Normalized()
	sitesRaw, err := common.Marshal(cfg.Sites)
	if err != nil {
		return nil, fmt.Errorf("marshal upstream balance sites: %w", err)
	}
	channelsRaw, err := common.Marshal(cfg.Channels)
	if err != nil {
		return nil, fmt.Errorf("marshal upstream balance channels: %w", err)
	}
	return map[string]string{
		UpstreamBalanceOptionPrefix + "enabled":                 strconv.FormatBool(cfg.Enabled),
		UpstreamBalanceOptionPrefix + "check_interval_minutes":  strconv.Itoa(cfg.CheckIntervalMinutes),
		UpstreamBalanceOptionPrefix + "alert_cooldown_minutes":  strconv.Itoa(cfg.AlertCooldownMinutes),
		UpstreamBalanceOptionPrefix + "notify_emails":           cfg.NotifyEmails,
		UpstreamBalanceOptionPrefix + "default_min_balance_cny": serializeFloatPtr(cfg.DefaultMinBalanceCNY),
		UpstreamBalanceOptionPrefix + "default_min_percent":     serializeFloatPtr(cfg.DefaultMinPercent),
		UpstreamBalanceOptionPrefix + "sites":                   string(sitesRaw),
		UpstreamBalanceOptionPrefix + "channels":                string(channelsRaw),
	}, nil
}
