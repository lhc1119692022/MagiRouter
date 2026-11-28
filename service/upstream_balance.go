package service

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"html"
	"io"
	"math"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

const (
	upstreamBalanceRequestTimeout = 20 * time.Second
	upstreamBalanceMaxResponse    = 512 << 10
	upstreamBalanceConcurrency    = 4
	upstreamBalanceMaxErrorRunes  = 320

	UpstreamBalanceStatusOK           = "ok"
	UpstreamBalanceStatusLow          = "low"
	UpstreamBalanceStatusError        = "error"
	UpstreamBalanceStatusUnconfigured = "unconfigured"
	UpstreamBalanceStatusIgnored      = "ignored"
	UpstreamBalanceStatusUnlimited    = "unlimited"
	UpstreamBalanceStatusFollowsSite  = "follows_site"

	UpstreamPercentSourceReferenceTotal    = "reference_total"
	UpstreamPercentSourceAccountTotal      = "account_total"
	UpstreamPercentSourceTokenTotal        = "token_total"
	UpstreamPercentSourceSubscriptionLimit = "subscription_limit"

	UpstreamBalanceSourceUserSelf         = "user_self"
	UpstreamBalanceSourceTokenUserQuota   = "token_user_quota"
	UpstreamBalanceSourceTokenQuota       = "token_quota"
	UpstreamBalanceSourceSub2APIWallet    = "sub2api_wallet"
	UpstreamBalanceSourceSub2APIRemaining = "sub2api_remaining"
)

var upstreamBalanceStateMu sync.Mutex

type UpstreamBalanceWindow struct {
	Period       string   `json:"period"`
	LimitUSD     float64  `json:"limit_usd"`
	UsedUSD      *float64 `json:"used_usd,omitempty"`
	RemainingUSD *float64 `json:"remaining_usd,omitempty"`
	LimitCNY     float64  `json:"limit_cny"`
	UsedCNY      *float64 `json:"used_cny,omitempty"`
	RemainingCNY *float64 `json:"remaining_cny,omitempty"`
	RemainPct    *float64 `json:"remaining_percent,omitempty"`
}

type UpstreamBalanceSiteSnapshot struct {
	SiteKey          string   `json:"site_key"`
	ProviderType     string   `json:"provider_type"`
	Status           string   `json:"status"`
	Error            string   `json:"error,omitempty"`
	BalanceSource    string   `json:"balance_source,omitempty"`
	BalanceUSD       *float64 `json:"balance_usd,omitempty"`
	UsedUSD          *float64 `json:"used_usd,omitempty"`
	TotalUSD         *float64 `json:"total_usd,omitempty"`
	BalanceCNY       *float64 `json:"balance_cny,omitempty"`
	TotalCNY         *float64 `json:"total_cny,omitempty"`
	RemainingPercent *float64 `json:"remaining_percent,omitempty"`
	PercentSource    string   `json:"percent_source,omitempty"`
	CurrencyRate     float64  `json:"currency_rate"`
	Unlimited        bool     `json:"unlimited,omitempty"`
	CheckedAt        int64    `json:"checked_at,omitempty"`
	AlertActive      bool     `json:"alert_active,omitempty"`
	AlertReasons     []string `json:"alert_reasons,omitempty"`
	LastAlertAt      int64    `json:"last_alert_at,omitempty"`
	LastAlertError   string   `json:"last_alert_error,omitempty"`
}

type UpstreamBalanceChannelSnapshot struct {
	ChannelID           int                     `json:"channel_id"`
	SiteKey             string                  `json:"site_key"`
	ProviderType        string                  `json:"provider_type"`
	Status              string                  `json:"status"`
	Error               string                  `json:"error,omitempty"`
	HasIndependentLimit bool                    `json:"has_independent_limit"`
	FollowsSiteBalance  bool                    `json:"follows_site_balance"`
	Unlimited           bool                    `json:"unlimited,omitempty"`
	BalanceUSD          *float64                `json:"balance_usd,omitempty"`
	UsedUSD             *float64                `json:"used_usd,omitempty"`
	TotalUSD            *float64                `json:"total_usd,omitempty"`
	BalanceCNY          *float64                `json:"balance_cny,omitempty"`
	TotalCNY            *float64                `json:"total_cny,omitempty"`
	EffectiveBalanceUSD *float64                `json:"effective_balance_usd,omitempty"`
	EffectiveBalanceCNY *float64                `json:"effective_balance_cny,omitempty"`
	RemainingPercent    *float64                `json:"remaining_percent,omitempty"`
	PercentSource       string                  `json:"percent_source,omitempty"`
	ExpiresAt           int64                   `json:"expires_at,omitempty"`
	Windows             []UpstreamBalanceWindow `json:"windows,omitempty"`
	CheckedAt           int64                   `json:"checked_at,omitempty"`
	AlertActive         bool                    `json:"alert_active,omitempty"`
	AlertReasons        []string                `json:"alert_reasons,omitempty"`
	LastAlertAt         int64                   `json:"last_alert_at,omitempty"`
	LastAlertError      string                  `json:"last_alert_error,omitempty"`
}

type UpstreamBalanceState struct {
	LastCheckedAt int64                                     `json:"last_checked_at"`
	Sites         map[string]UpstreamBalanceSiteSnapshot    `json:"sites"`
	Channels      map[string]UpstreamBalanceChannelSnapshot `json:"channels"`
}

type UpstreamBalanceMeta struct {
	DefaultUSDExchangeRate float64 `json:"default_usd_exchange_rate"`
	EmailConfigured        bool    `json:"email_configured"`
	ServerAddress          string  `json:"server_address"`
	LastCheckedAt          int64   `json:"last_checked_at"`
	SkippedChannelsCount   int     `json:"skipped_channels_count"`
}

type UpstreamBalanceSummary struct {
	TotalSites        int     `json:"total_sites"`
	MonitoredSites    int     `json:"monitored_sites"`
	LowSites          int     `json:"low_sites"`
	ErrorSites        int     `json:"error_sites"`
	UnconfiguredSites int     `json:"unconfigured_sites"`
	IgnoredSites      int     `json:"ignored_sites"`
	TotalChannels     int     `json:"total_channels"`
	LimitedChannels   int     `json:"limited_channels"`
	LowChannels       int     `json:"low_channels"`
	TotalBalanceCNY   float64 `json:"total_balance_cny"`
	TotalBalanceUSD   float64 `json:"total_balance_usd"`
}

type UpstreamBalanceChannelView struct {
	ChannelID              int                                            `json:"channel_id"`
	ChannelName            string                                         `json:"channel_name"`
	ChannelType            int                                            `json:"channel_type"`
	ChannelTypeName        string                                         `json:"channel_type_name"`
	ChannelStatus          int                                            `json:"channel_status"`
	Group                  string                                         `json:"group"`
	Tag                    string                                         `json:"tag"`
	BaseURL                string                                         `json:"base_url"`
	IsMultiKey             bool                                           `json:"is_multi_key"`
	KeyCount               int                                            `json:"key_count"`
	EffectiveProvider      string                                         `json:"effective_provider"`
	Config                 operation_setting.UpstreamBalanceChannelConfig `json:"config"`
	EffectiveAlertEnabled  bool                                           `json:"effective_alert_enabled"`
	EffectiveMinBalanceCNY *float64                                       `json:"effective_min_balance_cny,omitempty"`
	EffectiveMinPercent    *float64                                       `json:"effective_min_percent,omitempty"`
	Snapshot               UpstreamBalanceChannelSnapshot                 `json:"snapshot"`
}

type UpstreamBalanceSiteView struct {
	SiteKey                string                                      `json:"site_key"`
	DisplayName            string                                      `json:"display_name"`
	EffectiveProvider      string                                      `json:"effective_provider"`
	InferredProvider       string                                      `json:"inferred_provider"`
	EffectiveCNYRate       float64                                     `json:"effective_cny_rate"`
	CustomCNYRate          bool                                        `json:"custom_cny_rate"`
	Config                 operation_setting.UpstreamBalanceSiteConfig `json:"config"`
	EffectiveAlertEnabled  bool                                        `json:"effective_alert_enabled"`
	EffectiveMinBalanceCNY *float64                                    `json:"effective_min_balance_cny,omitempty"`
	EffectiveMinPercent    *float64                                    `json:"effective_min_percent,omitempty"`
	EnabledChannelCount    int                                         `json:"enabled_channel_count"`
	LimitedChannelCount    int                                         `json:"limited_channel_count"`
	LowChannelCount        int                                         `json:"low_channel_count"`
	Snapshot               UpstreamBalanceSiteSnapshot                 `json:"snapshot"`
	Channels               []UpstreamBalanceChannelView                `json:"channels"`
}

type UpstreamBalanceOverview struct {
	Settings operation_setting.UpstreamBalanceSetting `json:"settings"`
	Meta     UpstreamBalanceMeta                      `json:"meta"`
	Summary  UpstreamBalanceSummary                   `json:"summary"`
	Sites    []UpstreamBalanceSiteView                `json:"sites"`
}

type UpstreamBalanceRefreshOptions struct {
	SiteKey    string
	ChannelID  int
	SendAlerts bool
}

type UpstreamBalanceRefreshSummary struct {
	RefreshedSites    int      `json:"refreshed_sites"`
	RefreshedChannels int      `json:"refreshed_channels"`
	AlertsTriggered   int      `json:"alerts_triggered"`
	AlertEmailSent    bool     `json:"alert_email_sent"`
	AlertEmailError   string   `json:"alert_email_error,omitempty"`
	TriggeredItems    []string `json:"triggered_items,omitempty"`
}

type upstreamAlertItem struct {
	Kind             string // "site" | "channel"
	SiteKey          string
	SiteName         string
	ChannelID        int
	ChannelName      string
	ProviderType     string
	BalanceCNY       *float64
	BalanceUSD       *float64
	TotalCNY         *float64
	RemainingPercent *float64
	MinBalanceCNY    *float64
	MinPercent       *float64
	Reasons          []string
}

type siteChannelGroup struct {
	siteKey  string
	channels []*model.Channel
}

func IsEmailDeliveryConfigured() bool {
	common.OptionMapRWMutex.RLock()
	provider := strings.ToLower(strings.TrimSpace(common.OptionMap["EmailProvider"]))
	resendKey := strings.TrimSpace(common.OptionMap["ResendApiKey"])
	smtpServer := strings.TrimSpace(common.SMTPServer)
	smtpAccount := strings.TrimSpace(common.SMTPAccount)
	common.OptionMapRWMutex.RUnlock()

	switch provider {
	case "resend":
		return resendKey != ""
	case "", "smtp":
		return smtpServer != "" || smtpAccount != ""
	default:
		return false
	}
}

func loadUpstreamBalanceState() UpstreamBalanceState {
	empty := UpstreamBalanceState{
		Sites:    map[string]UpstreamBalanceSiteSnapshot{},
		Channels: map[string]UpstreamBalanceChannelSnapshot{},
	}
	if model.DB == nil {
		return empty
	}
	var option model.Option
	err := model.DB.Where(&model.Option{Key: operation_setting.UpstreamBalanceStateOptionKey}).First(&option).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			common.SysError(common.LogText("failed to load upstream balance state: %s", err.Error()))
		}
		return empty
	}
	if strings.TrimSpace(option.Value) == "" {
		return empty
	}
	var parsed UpstreamBalanceState
	if err := common.UnmarshalJsonStr(option.Value, &parsed); err != nil {
		common.SysError(common.LogText("failed to decode upstream balance state: %s", err.Error()))
		return empty
	}
	if parsed.Sites == nil {
		parsed.Sites = map[string]UpstreamBalanceSiteSnapshot{}
	}
	if parsed.Channels == nil {
		parsed.Channels = map[string]UpstreamBalanceChannelSnapshot{}
	}
	return parsed
}

func saveUpstreamBalanceState(state UpstreamBalanceState) error {
	if state.Sites == nil {
		state.Sites = map[string]UpstreamBalanceSiteSnapshot{}
	}
	if state.Channels == nil {
		state.Channels = map[string]UpstreamBalanceChannelSnapshot{}
	}
	encoded, err := common.Marshal(state)
	if err != nil {
		return err
	}
	return model.UpdateOption(operation_setting.UpstreamBalanceStateOptionKey, string(encoded))
}

func groupChannelsByUpstreamSite(channels []*model.Channel) ([]siteChannelGroup, int) {
	bySite := make(map[string][]*model.Channel)
	skipped := 0
	for _, channel := range channels {
		if channel == nil {
			continue
		}
		rawURL := ""
		if channel.BaseURL != nil {
			rawURL = strings.TrimSpace(*channel.BaseURL)
		}
		if rawURL == "" {
			skipped++
			continue
		}
		siteKey := operation_setting.NormalizeUpstreamSiteKey(rawURL)
		if siteKey == "" {
			skipped++
			continue
		}
		bySite[siteKey] = append(bySite[siteKey], channel)
	}

	groups := make([]siteChannelGroup, 0, len(bySite))
	for siteKey, list := range bySite {
		slices.SortFunc(list, func(a, b *model.Channel) int {
			return cmp.Compare(a.Id, b.Id)
		})
		groups = append(groups, siteChannelGroup{siteKey: siteKey, channels: list})
	}
	slices.SortFunc(groups, func(a, b siteChannelGroup) int {
		return cmp.Compare(a.siteKey, b.siteKey)
	})
	return groups, skipped
}

func inferSiteProviderType(channels []*model.Channel) string {
	hasNewAPI := false
	hasSub2API := false
	for _, channel := range channels {
		switch channel.Type {
		case constant.ChannelTypeNewAPI:
			hasNewAPI = true
		case constant.ChannelTypeSub2API:
			hasSub2API = true
		}
	}
	if hasNewAPI && !hasSub2API {
		return operation_setting.UpstreamBalanceProviderNewAPI
	}
	if hasSub2API && !hasNewAPI {
		return operation_setting.UpstreamBalanceProviderSub2API
	}
	if hasNewAPI {
		return operation_setting.UpstreamBalanceProviderNewAPI
	}
	return ""
}

func resolveSiteProvider(siteCfg operation_setting.UpstreamBalanceSiteConfig, channels []*model.Channel) (effective string, inferred string) {
	inferred = inferSiteProviderType(channels)
	switch siteCfg.ProviderType {
	case operation_setting.UpstreamBalanceProviderNewAPI,
		operation_setting.UpstreamBalanceProviderSub2API,
		operation_setting.UpstreamBalanceProviderIgnore:
		return siteCfg.ProviderType, inferred
	default:
		return inferred, inferred
	}
}

func resolveChannelProvider(channelCfg operation_setting.UpstreamBalanceChannelConfig, siteProvider string, channelType int) string {
	switch channelCfg.ProviderOverride {
	case operation_setting.UpstreamBalanceProviderNewAPI,
		operation_setting.UpstreamBalanceProviderSub2API,
		operation_setting.UpstreamBalanceProviderIgnore:
		return channelCfg.ProviderOverride
	}
	if siteProvider != "" {
		return siteProvider
	}
	switch channelType {
	case constant.ChannelTypeNewAPI:
		return operation_setting.UpstreamBalanceProviderNewAPI
	case constant.ChannelTypeSub2API:
		return operation_setting.UpstreamBalanceProviderSub2API
	default:
		return ""
	}
}

func defaultSiteDisplayName(siteKey string) string {
	parsed, err := url.Parse(siteKey)
	if err == nil && parsed.Host != "" {
		if parsed.Path != "" && parsed.Path != "/" {
			return parsed.Host + parsed.Path
		}
		return parsed.Host
	}
	return siteKey
}

func resolveEffectiveCNYRate(siteCfg operation_setting.UpstreamBalanceSiteConfig, defaultRate float64) (float64, bool) {
	if siteCfg.CNYRate != nil && *siteCfg.CNYRate > 0 {
		return *siteCfg.CNYRate, true
	}
	return defaultRate, false
}

func resolveEffectiveAlertEnabled(override *bool) bool {
	if override != nil {
		return *override
	}
	return true
}

func resolveEffectiveThreshold(override *float64, fallback *float64) *float64 {
	if override != nil {
		if *override <= 0 {
			return nil
		}
		val := *override
		return &val
	}
	if fallback != nil && *fallback > 0 {
		val := *fallback
		return &val
	}
	return nil
}

func roundMoney(val float64) float64 {
	if math.IsNaN(val) || math.IsInf(val, 0) {
		return 0
	}
	return math.Round(val*10000) / 10000
}

func roundPercent(val float64) float64 {
	if math.IsNaN(val) || math.IsInf(val, 0) {
		return 0
	}
	clamped := max(0.0, min(100.0, val))
	return math.Round(clamped*100) / 100
}

func floatPtr(val float64) *float64 {
	v := val
	return &v
}

func firstActiveChannelKey(channel *model.Channel) (string, int) {
	if channel == nil {
		return "", 0
	}
	if !channel.ChannelInfo.IsMultiKey {
		key := strings.TrimSpace(channel.Key)
		if key == "" {
			return "", 0
		}
		return key, 1
	}
	keys := channel.GetKeys()
	count := 0
	firstAny := ""
	for index, raw := range keys {
		key := strings.TrimSpace(raw)
		if key == "" {
			continue
		}
		count++
		if firstAny == "" {
			firstAny = key
		}
		status, exists := channel.ChannelInfo.MultiKeyStatusList[index]
		if !exists || status == common.ChannelStatusEnabled {
			return key, len(keys)
		}
	}
	return firstAny, count
}

func sanitizeUpstreamError(err error, secrets ...string) string {
	if err == nil {
		return ""
	}
	msg := strings.TrimSpace(err.Error())
	for _, secret := range secrets {
		trimmed := strings.TrimSpace(secret)
		if trimmed == "" {
			continue
		}
		msg = strings.ReplaceAll(msg, trimmed, "[REDACTED]")
		msg = strings.ReplaceAll(msg, url.QueryEscape(trimmed), "[REDACTED]")
	}
	if runes := []rune(msg); len(runes) > upstreamBalanceMaxErrorRunes {
		msg = string(runes[:upstreamBalanceMaxErrorRunes]) + "..."
	}
	return msg
}

func doUpstreamBalanceGET(ctx context.Context, targetURL string, channel *model.Channel, headers http.Header) ([]byte, error) {
	reqCtx, cancel := context.WithTimeout(ctx, upstreamBalanceRequestTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, err
	}
	for name, values := range headers {
		for _, value := range values {
			req.Header.Add(name, value)
		}
	}

	var client *http.Client
	if channel != nil {
		setting := channel.GetSetting()
		client, err = GetHttpClientWithProxySettings(setting.Proxy, setting)
	} else {
		client, err = GetHttpClientWithProxySettings("", dto.ChannelSettings{})
	}
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, upstreamBalanceMaxResponse+1))
	if err != nil {
		return nil, err
	}
	if len(body) > upstreamBalanceMaxResponse {
		return nil, fmt.Errorf("upstream balance response exceeds %d bytes", upstreamBalanceMaxResponse)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, &upstreamHTTPStatusError{StatusCode: resp.StatusCode}
	}
	return body, nil
}

type upstreamHTTPStatusError struct {
	StatusCode int
}

func (e *upstreamHTTPStatusError) Error() string {
	return fmt.Sprintf("HTTP %d", e.StatusCode)
}

func isUpstreamHTTPStatus(err error, codes ...int) bool {
	var statusErr *upstreamHTTPStatusError
	if !errors.As(err, &statusErr) {
		return false
	}
	return slices.Contains(codes, statusErr.StatusCode)
}

type newAPITokenProbeResult struct {
	HasTokenQuota  bool
	UnlimitedQuota bool
	TokenAvailUSD  float64
	TokenUsedUSD   float64
	TokenTotalUSD  float64
	ExpiresAt      int64
	HasUserQuota   bool
	UserAvailUSD   float64
	UserUsedUSD    float64
	UserTotalUSD   float64
	Err            error
}

type sub2apiKeyProbeResult struct {
	HasBalance   bool
	BalanceUSD   float64
	HasRemaining bool
	RemainingUSD float64
	Unlimited    bool
	ExpiresAt    int64
	Windows      []UpstreamBalanceWindow
	Err          error
}

func fetchNewAPIQuotaPerUnit(ctx context.Context, siteKey string, proxyChannel *model.Channel, authTokens []string) (float64, error) {
	body, err := doUpstreamBalanceGET(ctx, siteKey+"/api/status", proxyChannel, nil)
	if err != nil && isUpstreamHTTPStatus(err, http.StatusUnauthorized, http.StatusForbidden) {
		seen := make(map[string]struct{}, len(authTokens))
		for _, rawToken := range authTokens {
			token := strings.TrimSpace(rawToken)
			if token == "" {
				continue
			}
			if _, exists := seen[token]; exists {
				continue
			}
			seen[token] = struct{}{}
			headers := http.Header{}
			headers.Set("Authorization", "Bearer "+token)
			if authBody, authErr := doUpstreamBalanceGET(ctx, siteKey+"/api/status", proxyChannel, headers); authErr == nil {
				body = authBody
				err = nil
				break
			}
		}
	}
	if err != nil {
		return 0, fmt.Errorf("query /api/status failed: %w", err)
	}
	var status struct {
		Success *bool `json:"success"`
		Data    struct {
			QuotaPerUnit float64 `json:"quota_per_unit"`
		} `json:"data"`
	}
	if err := common.Unmarshal(body, &status); err != nil {
		return 0, fmt.Errorf("invalid /api/status JSON: %w", err)
	}
	if status.Data.QuotaPerUnit <= 0 {
		return 0, errors.New("New API /api/status response is missing quota_per_unit")
	}
	return status.Data.QuotaPerUnit, nil
}

func probeNewAPIToken(ctx context.Context, siteKey string, apiKey string, quotaPerUnit float64, channel *model.Channel) newAPITokenProbeResult {
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+apiKey)
	body, err := doUpstreamBalanceGET(ctx, siteKey+"/api/usage/token/", channel, headers)
	if err != nil {
		return newAPITokenProbeResult{Err: fmt.Errorf("query /api/usage/token/ failed: %w", err)}
	}
	var resp struct {
		Code    bool   `json:"code"`
		Message string `json:"message"`
		Data    struct {
			TotalGranted   float64 `json:"total_granted"`
			TotalUsed      float64 `json:"total_used"`
			TotalAvailable float64 `json:"total_available"`
			UnlimitedQuota bool    `json:"unlimited_quota"`
			ExpiresAt      int64   `json:"expires_at"`
			UserQuota      *struct {
				TotalAvailable float64 `json:"total_available"`
				TotalUsed      float64 `json:"total_used"`
			} `json:"user_quota"`
		} `json:"data"`
	}
	if err := common.Unmarshal(body, &resp); err != nil {
		return newAPITokenProbeResult{Err: fmt.Errorf("invalid /api/usage/token/ JSON: %w", err)}
	}
	if !resp.Code {
		msg := strings.TrimSpace(resp.Message)
		if msg == "" {
			msg = "unknown error"
		}
		return newAPITokenProbeResult{Err: fmt.Errorf("New API usage query failed: %s", msg)}
	}
	out := newAPITokenProbeResult{
		UnlimitedQuota: resp.Data.UnlimitedQuota,
		ExpiresAt:      resp.Data.ExpiresAt,
	}
	if !resp.Data.UnlimitedQuota {
		out.HasTokenQuota = true
		out.TokenAvailUSD = resp.Data.TotalAvailable / quotaPerUnit
		out.TokenUsedUSD = resp.Data.TotalUsed / quotaPerUnit
		totalQuota := resp.Data.TotalGranted
		if totalQuota <= 0 {
			totalQuota = resp.Data.TotalAvailable + resp.Data.TotalUsed
		}
		out.TokenTotalUSD = totalQuota / quotaPerUnit
	}
	if resp.Data.UserQuota != nil {
		out.HasUserQuota = true
		out.UserAvailUSD = resp.Data.UserQuota.TotalAvailable / quotaPerUnit
		out.UserUsedUSD = resp.Data.UserQuota.TotalUsed / quotaPerUnit
		out.UserTotalUSD = (resp.Data.UserQuota.TotalAvailable + resp.Data.UserQuota.TotalUsed) / quotaPerUnit
	}
	return out
}

func probeNewAPIUserSelf(ctx context.Context, siteKey string, accessToken string, userID string, quotaPerUnit float64, channel *model.Channel) (availUSD, usedUSD, totalUSD float64, err error) {
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+accessToken)
	if strings.TrimSpace(userID) != "" {
		headers.Set("New-Api-User", strings.TrimSpace(userID))
	}
	body, err := doUpstreamBalanceGET(ctx, siteKey+"/api/user/self", channel, headers)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("query /api/user/self failed: %w", err)
	}
	var resp struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
		Data    *struct {
			Quota     float64 `json:"quota"`
			UsedQuota float64 `json:"used_quota"`
		} `json:"data"`
	}
	if err := common.Unmarshal(body, &resp); err != nil {
		return 0, 0, 0, fmt.Errorf("invalid /api/user/self JSON: %w", err)
	}
	if !resp.Success || resp.Data == nil {
		msg := strings.TrimSpace(resp.Message)
		if msg == "" {
			msg = "unauthorized or empty response"
		}
		return 0, 0, 0, fmt.Errorf("New API /api/user/self failed: %s", msg)
	}
	availUSD = resp.Data.Quota / quotaPerUnit
	usedUSD = resp.Data.UsedQuota / quotaPerUnit
	totalUSD = (resp.Data.Quota + resp.Data.UsedQuota) / quotaPerUnit
	return availUSD, usedUSD, totalUSD, nil
}

func parseSub2APIExpiry(raw string) int64 {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return 0
	}
	if unixVal, err := strconv.ParseInt(trimmed, 10, 64); err == nil && unixVal > 0 {
		return unixVal
	}
	for _, layout := range []string{time.RFC3339, time.RFC3339Nano, "2006-01-02 15:04:05", "2006-01-02"} {
		if parsed, err := time.Parse(layout, trimmed); err == nil {
			return parsed.Unix()
		}
	}
	return 0
}

func probeSub2APIKey(ctx context.Context, siteKey string, apiKey string, cnyRate float64, channel *model.Channel) sub2apiKeyProbeResult {
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+apiKey)
	body, err := doUpstreamBalanceGET(ctx, siteKey+"/v1/usage", channel, headers)
	if err != nil {
		return sub2apiKeyProbeResult{Err: fmt.Errorf("query /v1/usage failed: %w", err)}
	}
	var usage struct {
		Balance      *float64 `json:"balance"`
		Remaining    *float64 `json:"remaining"`
		IsValid      *bool    `json:"isValid"`
		Subscription *struct {
			DailyLimitUSD   *float64 `json:"daily_limit_usd"`
			WeeklyLimitUSD  *float64 `json:"weekly_limit_usd"`
			MonthlyLimitUSD *float64 `json:"monthly_limit_usd"`
			DailyUsedUSD    *float64 `json:"daily_used_usd"`
			WeeklyUsedUSD   *float64 `json:"weekly_used_usd"`
			MonthlyUsedUSD  *float64 `json:"monthly_used_usd"`
			ExpiresAt       string   `json:"expires_at"`
		} `json:"subscription"`
	}
	if err := common.Unmarshal(body, &usage); err != nil {
		return sub2apiKeyProbeResult{Err: fmt.Errorf("invalid /v1/usage JSON: %w", err)}
	}
	if usage.IsValid != nil && !*usage.IsValid {
		return sub2apiKeyProbeResult{Err: errors.New("Sub2API key is invalid (isValid=false)")}
	}

	out := sub2apiKeyProbeResult{}
	if usage.Balance != nil && !math.IsNaN(*usage.Balance) && !math.IsInf(*usage.Balance, 0) {
		out.HasBalance = true
		out.BalanceUSD = *usage.Balance
	}
	if usage.Subscription != nil {
		out.ExpiresAt = parseSub2APIExpiry(usage.Subscription.ExpiresAt)
		addWindow := func(period string, limitPtr, usedPtr *float64) {
			if limitPtr == nil || math.IsNaN(*limitPtr) || math.IsInf(*limitPtr, 0) || *limitPtr <= 0 {
				return
			}
			limitUSD := *limitPtr
			window := UpstreamBalanceWindow{
				Period:   period,
				LimitUSD: roundMoney(limitUSD),
				LimitCNY: roundMoney(limitUSD * cnyRate),
			}
			if usedPtr != nil && !math.IsNaN(*usedPtr) && !math.IsInf(*usedPtr, 0) && *usedPtr >= 0 {
				usedUSD := *usedPtr
				remainUSD := max(0.0, limitUSD-usedUSD)
				window.UsedUSD = floatPtr(roundMoney(usedUSD))
				window.UsedCNY = floatPtr(roundMoney(usedUSD * cnyRate))
				window.RemainingUSD = floatPtr(roundMoney(remainUSD))
				window.RemainingCNY = floatPtr(roundMoney(remainUSD * cnyRate))
				window.RemainPct = floatPtr(roundPercent((remainUSD / limitUSD) * 100))
			}
			out.Windows = append(out.Windows, window)
		}
		addWindow("daily", usage.Subscription.DailyLimitUSD, usage.Subscription.DailyUsedUSD)
		addWindow("weekly", usage.Subscription.WeeklyLimitUSD, usage.Subscription.WeeklyUsedUSD)
		addWindow("monthly", usage.Subscription.MonthlyLimitUSD, usage.Subscription.MonthlyUsedUSD)

		if len(out.Windows) == 0 && (usage.Remaining == nil || *usage.Remaining < 0) && !out.HasBalance {
			out.Unlimited = true
		}
	}
	if !out.Unlimited && usage.Remaining != nil && !math.IsNaN(*usage.Remaining) && !math.IsInf(*usage.Remaining, 0) {
		if usage.Subscription != nil && len(out.Windows) == 0 && *usage.Remaining < 0 {
			out.Unlimited = true
		} else {
			out.HasRemaining = true
			out.RemainingUSD = *usage.Remaining
		}
	}
	if !out.HasBalance && !out.HasRemaining && !out.Unlimited && len(out.Windows) == 0 {
		return sub2apiKeyProbeResult{Err: errors.New("Sub2API /v1/usage response is missing balance and remaining fields")}
	}
	return out
}

func computeBalanceMetrics(
	balanceUSD *float64,
	totalUSD *float64,
	cnyRate float64,
	referenceTotalCNY *float64,
	upstreamPercentSource string,
) (balanceCNY *float64, totalCNY *float64, remainingPct *float64, percentSource string) {
	if balanceUSD == nil {
		return nil, nil, nil, ""
	}
	balCNY := roundMoney(*balanceUSD * cnyRate)
	balanceCNY = &balCNY

	if referenceTotalCNY != nil && *referenceTotalCNY > 0 {
		refTotal := roundMoney(*referenceTotalCNY)
		totalCNY = &refTotal
		pct := roundPercent((balCNY / refTotal) * 100)
		remainingPct = &pct
		return balanceCNY, totalCNY, remainingPct, UpstreamPercentSourceReferenceTotal
	}
	if totalUSD != nil && *totalUSD > 0 {
		totCNY := roundMoney(*totalUSD * cnyRate)
		totalCNY = &totCNY
		pct := roundPercent((*balanceUSD / *totalUSD) * 100)
		remainingPct = &pct
		return balanceCNY, totalCNY, remainingPct, upstreamPercentSource
	}
	return balanceCNY, nil, nil, ""
}

func evaluateLowBalanceReasons(
	alertEnabled bool,
	balanceCNY *float64,
	remainingPct *float64,
	minBalanceCNY *float64,
	minPercent *float64,
) []string {
	if !alertEnabled {
		return nil
	}
	var reasons []string
	if minBalanceCNY != nil && *minBalanceCNY > 0 && balanceCNY != nil && *balanceCNY < *minBalanceCNY {
		reasons = append(reasons, "amount")
	}
	if minPercent != nil && *minPercent > 0 && remainingPct != nil && *remainingPct < *minPercent {
		reasons = append(reasons, "percent")
	}
	return reasons
}

func shouldSendAlert(prevActive bool, prevLastAlertAt int64, now int64, cooldownMinutes int) bool {
	if !prevActive {
		return true
	}
	if cooldownMinutes <= 0 {
		return false
	}
	return now-prevLastAlertAt >= int64(cooldownMinutes)*60
}

func pickProxyChannel(channels []*model.Channel) *model.Channel {
	for _, channel := range channels {
		if channel.Status == common.ChannelStatusEnabled {
			return channel
		}
	}
	if len(channels) > 0 {
		return channels[0]
	}
	return nil
}

func probeSiteGroup(
	ctx context.Context,
	group siteChannelGroup,
	cfg operation_setting.UpstreamBalanceSetting,
	defaultRate float64,
	now int64,
	onlyChannelID int,
	prevState UpstreamBalanceState,
) (UpstreamBalanceSiteSnapshot, map[string]UpstreamBalanceChannelSnapshot) {
	siteKey := group.siteKey
	siteCfg := cfg.Sites[siteKey]
	siteProvider, _ := resolveSiteProvider(siteCfg, group.channels)
	cnyRate, _ := resolveEffectiveCNYRate(siteCfg, defaultRate)

	prevSite := prevState.Sites[siteKey]
	channelResults := make(map[string]UpstreamBalanceChannelSnapshot, len(group.channels))

	if siteProvider == operation_setting.UpstreamBalanceProviderIgnore {
		siteSnap := UpstreamBalanceSiteSnapshot{
			SiteKey:      siteKey,
			ProviderType: siteProvider,
			Status:       UpstreamBalanceStatusIgnored,
			CurrencyRate: cnyRate,
			CheckedAt:    now,
		}
		for _, channel := range group.channels {
			idKey := strconv.Itoa(channel.Id)
			channelResults[idKey] = UpstreamBalanceChannelSnapshot{
				ChannelID:    channel.Id,
				SiteKey:      siteKey,
				ProviderType: operation_setting.UpstreamBalanceProviderIgnore,
				Status:       UpstreamBalanceStatusIgnored,
				CheckedAt:    now,
			}
		}
		return siteSnap, channelResults
	}

	// Check if site is unconfigured AND none of its channels has an explicit override.
	hasAnyConfiguredChannel := false
	for _, channel := range group.channels {
		chCfg := cfg.Channels[strconv.Itoa(channel.Id)]
		chProvider := resolveChannelProvider(chCfg, siteProvider, channel.Type)
		if chProvider == operation_setting.UpstreamBalanceProviderNewAPI || chProvider == operation_setting.UpstreamBalanceProviderSub2API {
			hasAnyConfiguredChannel = true
			break
		}
	}
	if !hasAnyConfiguredChannel && siteProvider == "" {
		siteSnap := UpstreamBalanceSiteSnapshot{
			SiteKey:      siteKey,
			ProviderType: "",
			Status:       UpstreamBalanceStatusUnconfigured,
			CurrencyRate: cnyRate,
			CheckedAt:    now,
		}
		for _, channel := range group.channels {
			idKey := strconv.Itoa(channel.Id)
			channelResults[idKey] = UpstreamBalanceChannelSnapshot{
				ChannelID:    channel.Id,
				SiteKey:      siteKey,
				ProviderType: "",
				Status:       UpstreamBalanceStatusUnconfigured,
				CheckedAt:    now,
			}
		}
		return siteSnap, channelResults
	}

	proxyChannel := pickProxyChannel(group.channels)

	// Cache /api/status quota_per_unit if New API probing is needed.
	needsNewAPI := siteProvider == operation_setting.UpstreamBalanceProviderNewAPI
	if !needsNewAPI {
		for _, channel := range group.channels {
			chCfg := cfg.Channels[strconv.Itoa(channel.Id)]
			if resolveChannelProvider(chCfg, siteProvider, channel.Type) == operation_setting.UpstreamBalanceProviderNewAPI {
				needsNewAPI = true
				break
			}
		}
	}

	var newAPIQuotaPerUnit float64
	var newAPIStatusErr error
	if needsNewAPI {
		statusAuthTokens := make([]string, 0, len(group.channels)+1)
		for _, channel := range group.channels {
			if apiKey, _ := firstActiveChannelKey(channel); apiKey != "" {
				statusAuthTokens = append(statusAuthTokens, apiKey)
			}
		}
		if token := strings.TrimSpace(siteCfg.AccessToken); token != "" {
			statusAuthTokens = append(statusAuthTokens, token)
		}
		newAPIQuotaPerUnit, newAPIStatusErr = fetchNewAPIQuotaPerUnit(ctx, siteKey, proxyChannel, statusAuthTokens)
	}

	newAPIKeyCache := make(map[string]newAPITokenProbeResult)
	sub2apiKeyCache := make(map[string]sub2apiKeyProbeResult)

	// Track site-level candidates discovered across channels.
	var newAPIUserQuotaFound bool
	var newAPIUserAvailUSD, newAPIUserUsedUSD, newAPIUserTotalUSD float64

	finiteNewAPIKeys := make(map[string]newAPITokenProbeResult)
	newAPIProbedCount := 0
	newAPIUnlimitedCount := 0
	var firstNewAPIError string

	var sub2apiWalletFound bool
	var sub2apiWalletUSD float64
	var sub2apiRemainingFound bool
	var sub2apiRemainingUSD float64
	var sub2apiUnlimitedFound bool
	var firstSub2APIError string

	for _, channel := range group.channels {
		idKey := strconv.Itoa(channel.Id)
		if onlyChannelID > 0 && channel.Id != onlyChannelID {
			if existing, ok := prevState.Channels[idKey]; ok {
				channelResults[idKey] = existing
			}
			continue
		}

		chCfg := cfg.Channels[idKey]
		chProvider := resolveChannelProvider(chCfg, siteProvider, channel.Type)
		prevCh := prevState.Channels[idKey]

		if chProvider == operation_setting.UpstreamBalanceProviderIgnore {
			channelResults[idKey] = UpstreamBalanceChannelSnapshot{
				ChannelID:    channel.Id,
				SiteKey:      siteKey,
				ProviderType: operation_setting.UpstreamBalanceProviderIgnore,
				Status:       UpstreamBalanceStatusIgnored,
				CheckedAt:    now,
			}
			continue
		}
		if chProvider == "" {
			channelResults[idKey] = UpstreamBalanceChannelSnapshot{
				ChannelID:    channel.Id,
				SiteKey:      siteKey,
				ProviderType: "",
				Status:       UpstreamBalanceStatusUnconfigured,
				CheckedAt:    now,
			}
			continue
		}

		apiKey, _ := firstActiveChannelKey(channel)
		if apiKey == "" {
			channelResults[idKey] = UpstreamBalanceChannelSnapshot{
				ChannelID:      channel.Id,
				SiteKey:        siteKey,
				ProviderType:   chProvider,
				Status:         UpstreamBalanceStatusError,
				Error:          "Channel has no API key",
				CheckedAt:      now,
				AlertActive:    prevCh.AlertActive,
				LastAlertAt:    prevCh.LastAlertAt,
				LastAlertError: prevCh.LastAlertError,
			}
			continue
		}

		switch chProvider {
		case operation_setting.UpstreamBalanceProviderNewAPI:
			if newAPIStatusErr != nil {
				errText := sanitizeUpstreamError(newAPIStatusErr, apiKey)
				if firstNewAPIError == "" {
					firstNewAPIError = errText
				}
				channelResults[idKey] = UpstreamBalanceChannelSnapshot{
					ChannelID:      channel.Id,
					SiteKey:        siteKey,
					ProviderType:   chProvider,
					Status:         UpstreamBalanceStatusError,
					Error:          errText,
					CheckedAt:      now,
					AlertActive:    prevCh.AlertActive,
					LastAlertAt:    prevCh.LastAlertAt,
					LastAlertError: prevCh.LastAlertError,
				}
				continue
			}
			probe, cached := newAPIKeyCache[apiKey]
			if !cached {
				probe = probeNewAPIToken(ctx, siteKey, apiKey, newAPIQuotaPerUnit, channel)
				newAPIKeyCache[apiKey] = probe
			}
			if probe.Err != nil {
				errText := sanitizeUpstreamError(probe.Err, apiKey)
				if firstNewAPIError == "" {
					firstNewAPIError = errText
				}
				channelResults[idKey] = UpstreamBalanceChannelSnapshot{
					ChannelID:      channel.Id,
					SiteKey:        siteKey,
					ProviderType:   chProvider,
					Status:         UpstreamBalanceStatusError,
					Error:          errText,
					CheckedAt:      now,
					AlertActive:    prevCh.AlertActive,
					LastAlertAt:    prevCh.LastAlertAt,
					LastAlertError: prevCh.LastAlertError,
				}
				continue
			}
			newAPIProbedCount++
			if probe.HasUserQuota && !newAPIUserQuotaFound {
				newAPIUserQuotaFound = true
				newAPIUserAvailUSD = probe.UserAvailUSD
				newAPIUserUsedUSD = probe.UserUsedUSD
				newAPIUserTotalUSD = probe.UserTotalUSD
			}
			if probe.UnlimitedQuota {
				newAPIUnlimitedCount++
				channelResults[idKey] = UpstreamBalanceChannelSnapshot{
					ChannelID:          channel.Id,
					SiteKey:            siteKey,
					ProviderType:       chProvider,
					Status:             UpstreamBalanceStatusFollowsSite,
					FollowsSiteBalance: true,
					Unlimited:          true,
					ExpiresAt:          probe.ExpiresAt,
					CheckedAt:          now,
				}
				continue
			}
			finiteNewAPIKeys[apiKey] = probe
			balUSD := roundMoney(probe.TokenAvailUSD)
			usedUSD := roundMoney(probe.TokenUsedUSD)
			totalUSD := roundMoney(probe.TokenTotalUSD)
			balCNY, totalCNY, remPct, pctSource := computeBalanceMetrics(
				&balUSD,
				&totalUSD,
				cnyRate,
				chCfg.ReferenceTotalCNY,
				UpstreamPercentSourceTokenTotal,
			)
			channelResults[idKey] = UpstreamBalanceChannelSnapshot{
				ChannelID:           channel.Id,
				SiteKey:             siteKey,
				ProviderType:        chProvider,
				Status:              UpstreamBalanceStatusOK,
				HasIndependentLimit: true,
				FollowsSiteBalance:  false,
				BalanceUSD:          &balUSD,
				UsedUSD:             &usedUSD,
				TotalUSD:            &totalUSD,
				BalanceCNY:          balCNY,
				TotalCNY:            totalCNY,
				RemainingPercent:    remPct,
				PercentSource:       pctSource,
				ExpiresAt:           probe.ExpiresAt,
				CheckedAt:           now,
				AlertActive:         prevCh.AlertActive,
				LastAlertAt:         prevCh.LastAlertAt,
				LastAlertError:      prevCh.LastAlertError,
			}

		case operation_setting.UpstreamBalanceProviderSub2API:
			probe, cached := sub2apiKeyCache[apiKey]
			if !cached {
				probe = probeSub2APIKey(ctx, siteKey, apiKey, cnyRate, channel)
				sub2apiKeyCache[apiKey] = probe
			}
			if probe.Err != nil {
				errText := sanitizeUpstreamError(probe.Err, apiKey)
				if firstSub2APIError == "" {
					firstSub2APIError = errText
				}
				channelResults[idKey] = UpstreamBalanceChannelSnapshot{
					ChannelID:      channel.Id,
					SiteKey:        siteKey,
					ProviderType:   chProvider,
					Status:         UpstreamBalanceStatusError,
					Error:          errText,
					CheckedAt:      now,
					AlertActive:    prevCh.AlertActive,
					LastAlertAt:    prevCh.LastAlertAt,
					LastAlertError: prevCh.LastAlertError,
				}
				continue
			}
			if probe.HasBalance && !sub2apiWalletFound {
				sub2apiWalletFound = true
				sub2apiWalletUSD = probe.BalanceUSD
			}
			if probe.HasRemaining && !sub2apiRemainingFound {
				sub2apiRemainingFound = true
				sub2apiRemainingUSD = probe.RemainingUSD
			}
			if probe.Unlimited {
				sub2apiUnlimitedFound = true
				channelResults[idKey] = UpstreamBalanceChannelSnapshot{
					ChannelID:    channel.Id,
					SiteKey:      siteKey,
					ProviderType: chProvider,
					Status:       UpstreamBalanceStatusUnlimited,
					Unlimited:    true,
					ExpiresAt:    probe.ExpiresAt,
					CheckedAt:    now,
				}
				continue
			}

			hasDistinctRemaining := probe.HasRemaining && probe.HasBalance && math.Abs(probe.RemainingUSD-probe.BalanceUSD) > 1e-6
			hasSubWindows := len(probe.Windows) > 0
			if hasSubWindows || hasDistinctRemaining {
				var chBalUSD *float64
				if probe.HasRemaining {
					v := roundMoney(probe.RemainingUSD)
					chBalUSD = &v
				} else {
					var minWinRemain *float64
					for _, window := range probe.Windows {
						if window.RemainingUSD != nil {
							if minWinRemain == nil || *window.RemainingUSD < *minWinRemain {
								v := *window.RemainingUSD
								minWinRemain = &v
							}
						}
					}
					chBalUSD = minWinRemain
				}

				var tightestLimitUSD *float64
				var tightestWindowPct *float64
				for _, window := range probe.Windows {
					if window.LimitUSD > 0 {
						if tightestLimitUSD == nil || window.LimitUSD < *tightestLimitUSD {
							v := window.LimitUSD
							tightestLimitUSD = &v
						}
					}
					if window.RemainPct != nil {
						if tightestWindowPct == nil || *window.RemainPct < *tightestWindowPct {
							v := *window.RemainPct
							tightestWindowPct = &v
						}
					}
				}

				balCNY, totalCNY, remPct, pctSource := computeBalanceMetrics(
					chBalUSD,
					tightestLimitUSD,
					cnyRate,
					chCfg.ReferenceTotalCNY,
					UpstreamPercentSourceSubscriptionLimit,
				)
				if chCfg.ReferenceTotalCNY == nil && tightestWindowPct != nil {
					remPct = tightestWindowPct
					pctSource = UpstreamPercentSourceSubscriptionLimit
				}
				channelResults[idKey] = UpstreamBalanceChannelSnapshot{
					ChannelID:           channel.Id,
					SiteKey:             siteKey,
					ProviderType:        chProvider,
					Status:              UpstreamBalanceStatusOK,
					HasIndependentLimit: true,
					FollowsSiteBalance:  false,
					BalanceUSD:          chBalUSD,
					TotalUSD:            tightestLimitUSD,
					BalanceCNY:          balCNY,
					TotalCNY:            totalCNY,
					RemainingPercent:    remPct,
					PercentSource:       pctSource,
					ExpiresAt:           probe.ExpiresAt,
					Windows:             probe.Windows,
					CheckedAt:           now,
					AlertActive:         prevCh.AlertActive,
					LastAlertAt:         prevCh.LastAlertAt,
					LastAlertError:      prevCh.LastAlertError,
				}
				continue
			}

			channelResults[idKey] = UpstreamBalanceChannelSnapshot{
				ChannelID:          channel.Id,
				SiteKey:            siteKey,
				ProviderType:       chProvider,
				Status:             UpstreamBalanceStatusFollowsSite,
				FollowsSiteBalance: true,
				ExpiresAt:          probe.ExpiresAt,
				CheckedAt:          now,
			}
		}
	}

	// When refreshing a single channel only, keep existing site snapshot unless none exists.
	if onlyChannelID > 0 && prevSite.SiteKey != "" {
		recomputeChannelEffectiveBalances(prevSite, channelResults, cnyRate)
		return prevSite, channelResults
	}

	// Build site-level snapshot.
	siteSnap := UpstreamBalanceSiteSnapshot{
		SiteKey:        siteKey,
		ProviderType:   siteProvider,
		CurrencyRate:   cnyRate,
		CheckedAt:      now,
		AlertActive:    prevSite.AlertActive,
		LastAlertAt:    prevSite.LastAlertAt,
		LastAlertError: prevSite.LastAlertError,
	}

	effectiveSiteProvider := siteProvider
	if effectiveSiteProvider == "" {
		for _, chSnap := range channelResults {
			if chSnap.ProviderType == operation_setting.UpstreamBalanceProviderNewAPI || chSnap.ProviderType == operation_setting.UpstreamBalanceProviderSub2API {
				effectiveSiteProvider = chSnap.ProviderType
				break
			}
		}
		siteSnap.ProviderType = effectiveSiteProvider
	}

	switch effectiveSiteProvider {
	case operation_setting.UpstreamBalanceProviderNewAPI:
		if newAPIStatusErr != nil {
			siteSnap.Status = UpstreamBalanceStatusError
			siteSnap.Error = sanitizeUpstreamError(newAPIStatusErr, siteCfg.AccessToken)
		} else {
			var userSelfErr error
			resolved := false
			if strings.TrimSpace(siteCfg.AccessToken) != "" {
				availUSD, usedUSD, totalUSD, err := probeNewAPIUserSelf(ctx, siteKey, siteCfg.AccessToken, siteCfg.UserID, newAPIQuotaPerUnit, proxyChannel)
				if err == nil {
					balUSD := roundMoney(availUSD)
					uUSD := roundMoney(usedUSD)
					tUSD := roundMoney(totalUSD)
					balCNY, totCNY, remPct, pctSrc := computeBalanceMetrics(&balUSD, &tUSD, cnyRate, siteCfg.ReferenceTotalCNY, UpstreamPercentSourceAccountTotal)
					siteSnap.Status = UpstreamBalanceStatusOK
					siteSnap.BalanceSource = UpstreamBalanceSourceUserSelf
					siteSnap.BalanceUSD = &balUSD
					siteSnap.UsedUSD = &uUSD
					siteSnap.TotalUSD = &tUSD
					siteSnap.BalanceCNY = balCNY
					siteSnap.TotalCNY = totCNY
					siteSnap.RemainingPercent = remPct
					siteSnap.PercentSource = pctSrc
					resolved = true
				} else {
					userSelfErr = err
				}
			}
			if !resolved {
				canFallbackFromUserSelf := userSelfErr == nil || isUpstreamHTTPStatus(userSelfErr, http.StatusForbidden)
				if canFallbackFromUserSelf && newAPIUserQuotaFound {
					balUSD := roundMoney(newAPIUserAvailUSD)
					uUSD := roundMoney(newAPIUserUsedUSD)
					tUSD := roundMoney(newAPIUserTotalUSD)
					balCNY, totCNY, remPct, pctSrc := computeBalanceMetrics(&balUSD, &tUSD, cnyRate, siteCfg.ReferenceTotalCNY, UpstreamPercentSourceAccountTotal)
					siteSnap.Status = UpstreamBalanceStatusOK
					siteSnap.BalanceSource = UpstreamBalanceSourceTokenUserQuota
					siteSnap.BalanceUSD = &balUSD
					siteSnap.UsedUSD = &uUSD
					siteSnap.TotalUSD = &tUSD
					siteSnap.BalanceCNY = balCNY
					siteSnap.TotalCNY = totCNY
					siteSnap.RemainingPercent = remPct
					siteSnap.PercentSource = pctSrc
				} else if canFallbackFromUserSelf && len(finiteNewAPIKeys) > 0 {
					var sumAvail, sumUsed, sumTotal float64
					for _, item := range finiteNewAPIKeys {
						sumAvail += item.TokenAvailUSD
						sumUsed += item.TokenUsedUSD
						sumTotal += item.TokenTotalUSD
					}
					balUSD := roundMoney(sumAvail)
					uUSD := roundMoney(sumUsed)
					tUSD := roundMoney(sumTotal)
					balCNY, totCNY, remPct, pctSrc := computeBalanceMetrics(&balUSD, &tUSD, cnyRate, siteCfg.ReferenceTotalCNY, UpstreamPercentSourceTokenTotal)
					siteSnap.Status = UpstreamBalanceStatusOK
					siteSnap.BalanceSource = UpstreamBalanceSourceTokenQuota
					siteSnap.BalanceUSD = &balUSD
					siteSnap.UsedUSD = &uUSD
					siteSnap.TotalUSD = &tUSD
					siteSnap.BalanceCNY = balCNY
					siteSnap.TotalCNY = totCNY
					siteSnap.RemainingPercent = remPct
					siteSnap.PercentSource = pctSrc
				} else if userSelfErr != nil {
					siteSnap.Status = UpstreamBalanceStatusError
					siteSnap.Error = sanitizeUpstreamError(userSelfErr, siteCfg.AccessToken)
				} else if newAPIProbedCount > 0 && newAPIUnlimitedCount == newAPIProbedCount {
					siteSnap.Status = UpstreamBalanceStatusError
					siteSnap.Error = `Upstream token has unlimited quota without user_quota. Enable "Allow querying user quota" on upstream or configure System Access Token for this site.`
				} else if firstNewAPIError != "" {
					siteSnap.Status = UpstreamBalanceStatusError
					siteSnap.Error = firstNewAPIError
				} else {
					siteSnap.Status = UpstreamBalanceStatusUnconfigured
				}
			}
		}

	case operation_setting.UpstreamBalanceProviderSub2API:
		if sub2apiWalletFound {
			balUSD := roundMoney(sub2apiWalletUSD)
			balCNY, totCNY, remPct, pctSrc := computeBalanceMetrics(&balUSD, nil, cnyRate, siteCfg.ReferenceTotalCNY, "")
			siteSnap.Status = UpstreamBalanceStatusOK
			siteSnap.BalanceSource = UpstreamBalanceSourceSub2APIWallet
			siteSnap.BalanceUSD = &balUSD
			siteSnap.BalanceCNY = balCNY
			siteSnap.TotalCNY = totCNY
			siteSnap.RemainingPercent = remPct
			siteSnap.PercentSource = pctSrc
		} else if sub2apiRemainingFound {
			balUSD := roundMoney(sub2apiRemainingUSD)
			balCNY, totCNY, remPct, pctSrc := computeBalanceMetrics(&balUSD, nil, cnyRate, siteCfg.ReferenceTotalCNY, "")
			siteSnap.Status = UpstreamBalanceStatusOK
			siteSnap.BalanceSource = UpstreamBalanceSourceSub2APIRemaining
			siteSnap.BalanceUSD = &balUSD
			siteSnap.BalanceCNY = balCNY
			siteSnap.TotalCNY = totCNY
			siteSnap.RemainingPercent = remPct
			siteSnap.PercentSource = pctSrc
		} else if sub2apiUnlimitedFound {
			siteSnap.Status = UpstreamBalanceStatusUnlimited
			siteSnap.Unlimited = true
		} else if firstSub2APIError != "" {
			siteSnap.Status = UpstreamBalanceStatusError
			siteSnap.Error = firstSub2APIError
		} else {
			siteSnap.Status = UpstreamBalanceStatusUnconfigured
		}
	default:
		siteSnap.Status = UpstreamBalanceStatusUnconfigured
	}

	recomputeChannelEffectiveBalances(siteSnap, channelResults, cnyRate)
	return siteSnap, channelResults
}

func recomputeChannelEffectiveBalances(siteSnap UpstreamBalanceSiteSnapshot, channelResults map[string]UpstreamBalanceChannelSnapshot, cnyRate float64) {
	for idKey, chSnap := range channelResults {
		if chSnap.BalanceUSD != nil {
			effUSD := *chSnap.BalanceUSD
			if siteSnap.BalanceUSD != nil && *siteSnap.BalanceUSD < effUSD {
				effUSD = *siteSnap.BalanceUSD
			}
			effUSDRounded := roundMoney(effUSD)
			effCNYRounded := roundMoney(effUSD * cnyRate)
			chSnap.EffectiveBalanceUSD = &effUSDRounded
			chSnap.EffectiveBalanceCNY = &effCNYRounded
			channelResults[idKey] = chSnap
		}
	}
}

func RefreshUpstreamBalances(ctx context.Context, opts UpstreamBalanceRefreshOptions) (UpstreamBalanceRefreshSummary, error) {
	channels, err := model.GetAllChannels(0, 0, true, false)
	if err != nil {
		return UpstreamBalanceRefreshSummary{}, err
	}
	cfg := operation_setting.GetUpstreamBalanceSettingSnapshot()
	defaultRate := operation_setting.EffectiveUSDExchangeRate()
	groups, _ := groupChannelsByUpstreamSite(channels)

	targetSiteKey := operation_setting.NormalizeUpstreamSiteKey(opts.SiteKey)
	targetGroups := make([]siteChannelGroup, 0, len(groups))
	for _, group := range groups {
		if targetSiteKey != "" && group.siteKey != targetSiteKey {
			continue
		}
		if opts.ChannelID > 0 {
			found := false
			for _, ch := range group.channels {
				if ch.Id == opts.ChannelID {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}
		targetGroups = append(targetGroups, group)
	}

	upstreamBalanceStateMu.Lock()
	prevState := loadUpstreamBalanceState()
	upstreamBalanceStateMu.Unlock()

	now := common.GetTimestamp()
	type probeOutcome struct {
		siteKey  string
		siteSnap UpstreamBalanceSiteSnapshot
		channels map[string]UpstreamBalanceChannelSnapshot
	}
	outcomes := make([]probeOutcome, len(targetGroups))

	sem := make(chan struct{}, upstreamBalanceConcurrency)
	var wg sync.WaitGroup
	for i := range targetGroups {
		group := targetGroups[i]
		wg.Go(func() {
			sem <- struct{}{}
			defer func() { <-sem }()
			siteSnap, chSnaps := probeSiteGroup(ctx, group, cfg, defaultRate, now, opts.ChannelID, prevState)
			outcomes[i] = probeOutcome{
				siteKey:  group.siteKey,
				siteSnap: siteSnap,
				channels: chSnaps,
			}
		})
	}
	wg.Wait()

	channelByID := make(map[int]*model.Channel, len(channels))
	for _, ch := range channels {
		if ch != nil {
			channelByID[ch.Id] = ch
		}
	}

	upstreamBalanceStateMu.Lock()
	state := loadUpstreamBalanceState()
	if targetSiteKey == "" && opts.ChannelID == 0 {
		state.LastCheckedAt = now
	} else if state.LastCheckedAt == 0 {
		state.LastCheckedAt = now
	}

	summary := UpstreamBalanceRefreshSummary{}
	var triggeredAlerts []upstreamAlertItem
	triggeredSiteKeys := make([]string, 0)
	triggeredChannelKeys := make([]string, 0)

	for _, outcome := range outcomes {
		siteKey := outcome.siteKey
		siteCfg := cfg.Sites[siteKey]
		siteSnap := outcome.siteSnap

		// Determine if this site has at least one non-manually-disabled channel.
		siteHasActiveChannel := false
		for idKey := range outcome.channels {
			id, _ := strconv.Atoi(idKey)
			if ch, ok := channelByID[id]; ok && ch.Status != common.ChannelStatusManuallyDisabled {
				siteHasActiveChannel = true
				break
			}
		}

		siteAlertEnabled := resolveEffectiveAlertEnabled(siteCfg.AlertEnabled) && siteHasActiveChannel
		siteMinCNY := resolveEffectiveThreshold(siteCfg.MinBalanceCNY, cfg.DefaultMinBalanceCNY)
		siteMinPct := resolveEffectiveThreshold(siteCfg.MinPercent, cfg.DefaultMinPercent)

		if siteSnap.Status == UpstreamBalanceStatusOK || siteSnap.Status == UpstreamBalanceStatusLow {
			reasons := evaluateLowBalanceReasons(siteAlertEnabled, siteSnap.BalanceCNY, siteSnap.RemainingPercent, siteMinCNY, siteMinPct)
			if len(reasons) > 0 {
				siteSnap.Status = UpstreamBalanceStatusLow
				siteSnap.AlertReasons = reasons
				if opts.SendAlerts && shouldSendAlert(siteSnap.AlertActive, siteSnap.LastAlertAt, now, cfg.AlertCooldownMinutes) {
					displayName := siteCfg.Name
					if displayName == "" {
						displayName = defaultSiteDisplayName(siteKey)
					}
					triggeredAlerts = append(triggeredAlerts, upstreamAlertItem{
						Kind:             "site",
						SiteKey:          siteKey,
						SiteName:         displayName,
						ProviderType:     siteSnap.ProviderType,
						BalanceCNY:       siteSnap.BalanceCNY,
						BalanceUSD:       siteSnap.BalanceUSD,
						TotalCNY:         siteSnap.TotalCNY,
						RemainingPercent: siteSnap.RemainingPercent,
						MinBalanceCNY:    siteMinCNY,
						MinPercent:       siteMinPct,
						Reasons:          reasons,
					})
					triggeredSiteKeys = append(triggeredSiteKeys, siteKey)
					summary.TriggeredItems = append(summary.TriggeredItems, displayName)
				}
			} else {
				siteSnap.Status = UpstreamBalanceStatusOK
				siteSnap.AlertActive = false
				siteSnap.AlertReasons = nil
				siteSnap.LastAlertError = ""
			}
		}
		state.Sites[siteKey] = siteSnap
		if siteSnap.Status != UpstreamBalanceStatusIgnored && siteSnap.Status != UpstreamBalanceStatusUnconfigured {
			summary.RefreshedSites++
		}

		for idKey, chSnap := range outcome.channels {
			chCfg := cfg.Channels[idKey]
			chModel := channelByID[chSnap.ChannelID]
			chActive := chModel != nil && chModel.Status != common.ChannelStatusManuallyDisabled
			chAlertEnabled := resolveEffectiveAlertEnabled(chCfg.AlertEnabled) && chActive && chSnap.HasIndependentLimit
			chMinCNY := resolveEffectiveThreshold(chCfg.MinBalanceCNY, cfg.DefaultMinBalanceCNY)
			chMinPct := resolveEffectiveThreshold(chCfg.MinPercent, cfg.DefaultMinPercent)

			if chSnap.HasIndependentLimit && (chSnap.Status == UpstreamBalanceStatusOK || chSnap.Status == UpstreamBalanceStatusLow) {
				reasons := evaluateLowBalanceReasons(chAlertEnabled, chSnap.BalanceCNY, chSnap.RemainingPercent, chMinCNY, chMinPct)
				if len(reasons) > 0 {
					chSnap.Status = UpstreamBalanceStatusLow
					chSnap.AlertReasons = reasons
					if opts.SendAlerts && shouldSendAlert(chSnap.AlertActive, chSnap.LastAlertAt, now, cfg.AlertCooldownMinutes) {
						siteName := siteCfg.Name
						if siteName == "" {
							siteName = defaultSiteDisplayName(siteKey)
						}
						chName := fmt.Sprintf("#%d", chSnap.ChannelID)
						if chModel != nil && strings.TrimSpace(chModel.Name) != "" {
							chName = chModel.Name
						}
						triggeredAlerts = append(triggeredAlerts, upstreamAlertItem{
							Kind:             "channel",
							SiteKey:          siteKey,
							SiteName:         siteName,
							ChannelID:        chSnap.ChannelID,
							ChannelName:      chName,
							ProviderType:     chSnap.ProviderType,
							BalanceCNY:       chSnap.BalanceCNY,
							BalanceUSD:       chSnap.BalanceUSD,
							TotalCNY:         chSnap.TotalCNY,
							RemainingPercent: chSnap.RemainingPercent,
							MinBalanceCNY:    chMinCNY,
							MinPercent:       chMinPct,
							Reasons:          reasons,
						})
						triggeredChannelKeys = append(triggeredChannelKeys, idKey)
						summary.TriggeredItems = append(summary.TriggeredItems, fmt.Sprintf("%s / %s", siteName, chName))
					}
				} else {
					chSnap.Status = UpstreamBalanceStatusOK
					chSnap.AlertActive = false
					chSnap.AlertReasons = nil
					chSnap.LastAlertError = ""
				}
			}
			state.Channels[idKey] = chSnap
			if chSnap.Status != UpstreamBalanceStatusIgnored && chSnap.Status != UpstreamBalanceStatusUnconfigured {
				summary.RefreshedChannels++
			}
		}
	}

	summary.AlertsTriggered = len(triggeredAlerts)
	if len(triggeredAlerts) > 0 {
		if emailErr := sendUpstreamBalanceAlertEmail(cfg, triggeredAlerts, now); emailErr != nil {
			summary.AlertEmailError = emailErr.Error()
			for _, key := range triggeredSiteKeys {
				snap := state.Sites[key]
				snap.LastAlertError = emailErr.Error()
				state.Sites[key] = snap
			}
			for _, key := range triggeredChannelKeys {
				snap := state.Channels[key]
				snap.LastAlertError = emailErr.Error()
				state.Channels[key] = snap
			}
		} else {
			summary.AlertEmailSent = true
			for _, key := range triggeredSiteKeys {
				snap := state.Sites[key]
				snap.AlertActive = true
				snap.LastAlertAt = now
				snap.LastAlertError = ""
				state.Sites[key] = snap
			}
			for _, key := range triggeredChannelKeys {
				snap := state.Channels[key]
				snap.AlertActive = true
				snap.LastAlertAt = now
				snap.LastAlertError = ""
				state.Channels[key] = snap
			}
		}
	}

	if targetSiteKey == "" && opts.ChannelID == 0 {
		activeSiteSet := make(map[string]struct{}, len(groups))
		for _, g := range groups {
			activeSiteSet[g.siteKey] = struct{}{}
		}
		for key := range state.Sites {
			if _, exists := activeSiteSet[key]; !exists {
				delete(state.Sites, key)
			}
		}
		for idKey := range state.Channels {
			id, _ := strconv.Atoi(idKey)
			if _, exists := channelByID[id]; !exists {
				delete(state.Channels, idKey)
			}
		}
	}

	saveErr := saveUpstreamBalanceState(state)
	upstreamBalanceStateMu.Unlock()
	if saveErr != nil {
		return summary, saveErr
	}
	return summary, nil
}

func BuildUpstreamBalanceOverview() (UpstreamBalanceOverview, error) {
	channels, err := model.GetAllChannels(0, 0, true, false)
	if err != nil {
		return UpstreamBalanceOverview{}, err
	}
	cfg := operation_setting.GetUpstreamBalanceSettingSnapshot()
	defaultRate := operation_setting.EffectiveUSDExchangeRate()
	groups, skipped := groupChannelsByUpstreamSite(channels)

	upstreamBalanceStateMu.Lock()
	state := loadUpstreamBalanceState()
	upstreamBalanceStateMu.Unlock()

	common.OptionMapRWMutex.RLock()
	serverAddress := strings.TrimSpace(common.OptionMap["ServerAddress"])
	common.OptionMapRWMutex.RUnlock()

	overview := UpstreamBalanceOverview{
		Settings: cfg.Redacted(),
		Meta: UpstreamBalanceMeta{
			DefaultUSDExchangeRate: defaultRate,
			EmailConfigured:        IsEmailDeliveryConfigured(),
			ServerAddress:          serverAddress,
			LastCheckedAt:          state.LastCheckedAt,
			SkippedChannelsCount:   skipped,
		},
		Sites: make([]UpstreamBalanceSiteView, 0, len(groups)),
	}

	for _, group := range groups {
		siteKey := group.siteKey
		siteCfg := cfg.Sites[siteKey]
		siteRedacted := siteCfg
		siteRedacted.HasAccessToken = strings.TrimSpace(siteCfg.AccessToken) != ""
		siteRedacted.AccessToken = ""
		siteRedacted.ClearAccessToken = false

		effectiveProvider, inferredProvider := resolveSiteProvider(siteCfg, group.channels)
		cnyRate, customRate := resolveEffectiveCNYRate(siteCfg, defaultRate)

		displayName := strings.TrimSpace(siteCfg.Name)
		if displayName == "" {
			displayName = defaultSiteDisplayName(siteKey)
		}

		siteAlertEnabled := resolveEffectiveAlertEnabled(siteCfg.AlertEnabled)
		siteMinCNY := resolveEffectiveThreshold(siteCfg.MinBalanceCNY, cfg.DefaultMinBalanceCNY)
		siteMinPct := resolveEffectiveThreshold(siteCfg.MinPercent, cfg.DefaultMinPercent)

		siteSnap, hasSiteSnap := state.Sites[siteKey]
		if !hasSiteSnap {
			status := UpstreamBalanceStatusUnconfigured
			if effectiveProvider == operation_setting.UpstreamBalanceProviderIgnore {
				status = UpstreamBalanceStatusIgnored
			} else if effectiveProvider != "" {
				status = UpstreamBalanceStatusOK
			}
			siteSnap = UpstreamBalanceSiteSnapshot{
				SiteKey:      siteKey,
				ProviderType: effectiveProvider,
				Status:       status,
				CurrencyRate: cnyRate,
			}
		} else {
			siteSnap.ProviderType = effectiveProvider
			siteSnap.CurrencyRate = cnyRate
			if effectiveProvider == operation_setting.UpstreamBalanceProviderIgnore {
				siteSnap.Status = UpstreamBalanceStatusIgnored
				siteSnap.AlertReasons = nil
			} else if effectiveProvider == "" {
				siteSnap.Status = UpstreamBalanceStatusUnconfigured
				siteSnap.AlertReasons = nil
			} else if siteSnap.BalanceUSD != nil {
				upstreamSrc := siteSnap.PercentSource
				if upstreamSrc == UpstreamPercentSourceReferenceTotal {
					switch siteSnap.BalanceSource {
					case UpstreamBalanceSourceUserSelf, UpstreamBalanceSourceTokenUserQuota:
						upstreamSrc = UpstreamPercentSourceAccountTotal
					case UpstreamBalanceSourceTokenQuota:
						upstreamSrc = UpstreamPercentSourceTokenTotal
					default:
						upstreamSrc = ""
					}
				}
				balCNY, totCNY, remPct, pctSrc := computeBalanceMetrics(siteSnap.BalanceUSD, siteSnap.TotalUSD, cnyRate, siteCfg.ReferenceTotalCNY, upstreamSrc)
				siteSnap.BalanceCNY = balCNY
				siteSnap.TotalCNY = totCNY
				siteSnap.RemainingPercent = remPct
				siteSnap.PercentSource = pctSrc
				if siteSnap.Status == UpstreamBalanceStatusOK || siteSnap.Status == UpstreamBalanceStatusLow {
					reasons := evaluateLowBalanceReasons(siteAlertEnabled, siteSnap.BalanceCNY, siteSnap.RemainingPercent, siteMinCNY, siteMinPct)
					siteSnap.AlertReasons = reasons
					if len(reasons) > 0 {
						siteSnap.Status = UpstreamBalanceStatusLow
					} else {
						siteSnap.Status = UpstreamBalanceStatusOK
					}
				}
			}
		}

		siteView := UpstreamBalanceSiteView{
			SiteKey:                siteKey,
			DisplayName:            displayName,
			EffectiveProvider:      effectiveProvider,
			InferredProvider:       inferredProvider,
			EffectiveCNYRate:       cnyRate,
			CustomCNYRate:          customRate,
			Config:                 siteRedacted,
			EffectiveAlertEnabled:  siteAlertEnabled,
			EffectiveMinBalanceCNY: siteMinCNY,
			EffectiveMinPercent:    siteMinPct,
			Snapshot:               siteSnap,
			Channels:               make([]UpstreamBalanceChannelView, 0, len(group.channels)),
		}

		for _, ch := range group.channels {
			idKey := strconv.Itoa(ch.Id)
			chCfg := cfg.Channels[idKey]
			chProvider := resolveChannelProvider(chCfg, effectiveProvider, ch.Type)
			chAlertEnabled := resolveEffectiveAlertEnabled(chCfg.AlertEnabled)
			chMinCNY := resolveEffectiveThreshold(chCfg.MinBalanceCNY, cfg.DefaultMinBalanceCNY)
			chMinPct := resolveEffectiveThreshold(chCfg.MinPercent, cfg.DefaultMinPercent)

			chSnap, hasChSnap := state.Channels[idKey]
			if !hasChSnap {
				status := UpstreamBalanceStatusUnconfigured
				if chProvider == operation_setting.UpstreamBalanceProviderIgnore {
					status = UpstreamBalanceStatusIgnored
				} else if chProvider != "" {
					status = UpstreamBalanceStatusOK
				}
				chSnap = UpstreamBalanceChannelSnapshot{
					ChannelID:    ch.Id,
					SiteKey:      siteKey,
					ProviderType: chProvider,
					Status:       status,
				}
			} else {
				chSnap.ProviderType = chProvider
				if chProvider == operation_setting.UpstreamBalanceProviderIgnore {
					chSnap.Status = UpstreamBalanceStatusIgnored
					chSnap.AlertReasons = nil
				} else if chProvider == "" {
					chSnap.Status = UpstreamBalanceStatusUnconfigured
					chSnap.AlertReasons = nil
				} else if chSnap.HasIndependentLimit && chSnap.BalanceUSD != nil {
					upstreamSrc := chSnap.PercentSource
					if upstreamSrc == UpstreamPercentSourceReferenceTotal {
						if chProvider == operation_setting.UpstreamBalanceProviderSub2API {
							upstreamSrc = UpstreamPercentSourceSubscriptionLimit
						} else {
							upstreamSrc = UpstreamPercentSourceTokenTotal
						}
					}
					balCNY, totCNY, remPct, pctSrc := computeBalanceMetrics(chSnap.BalanceUSD, chSnap.TotalUSD, cnyRate, chCfg.ReferenceTotalCNY, upstreamSrc)
					chSnap.BalanceCNY = balCNY
					chSnap.TotalCNY = totCNY
					if chCfg.ReferenceTotalCNY != nil || chSnap.RemainingPercent == nil || chProvider != operation_setting.UpstreamBalanceProviderSub2API {
						chSnap.RemainingPercent = remPct
						chSnap.PercentSource = pctSrc
					}
					for idx := range chSnap.Windows {
						w := chSnap.Windows[idx]
						w.LimitCNY = roundMoney(w.LimitUSD * cnyRate)
						if w.UsedUSD != nil {
							w.UsedCNY = floatPtr(roundMoney(*w.UsedUSD * cnyRate))
						}
						if w.RemainingUSD != nil {
							w.RemainingCNY = floatPtr(roundMoney(*w.RemainingUSD * cnyRate))
						}
						chSnap.Windows[idx] = w
					}
					effUSD := *chSnap.BalanceUSD
					if siteSnap.BalanceUSD != nil && *siteSnap.BalanceUSD < effUSD {
						effUSD = *siteSnap.BalanceUSD
					}
					chSnap.EffectiveBalanceUSD = floatPtr(roundMoney(effUSD))
					chSnap.EffectiveBalanceCNY = floatPtr(roundMoney(effUSD * cnyRate))
					if chSnap.Status == UpstreamBalanceStatusOK || chSnap.Status == UpstreamBalanceStatusLow {
						reasons := evaluateLowBalanceReasons(chAlertEnabled && ch.Status != common.ChannelStatusManuallyDisabled, chSnap.BalanceCNY, chSnap.RemainingPercent, chMinCNY, chMinPct)
						chSnap.AlertReasons = reasons
						if len(reasons) > 0 {
							chSnap.Status = UpstreamBalanceStatusLow
						} else {
							chSnap.Status = UpstreamBalanceStatusOK
						}
					}
				}
			}

			tag := ""
			if ch.Tag != nil {
				tag = *ch.Tag
			}
			_, keyCount := firstActiveChannelKey(ch)

			chView := UpstreamBalanceChannelView{
				ChannelID:              ch.Id,
				ChannelName:            ch.Name,
				ChannelType:            ch.Type,
				ChannelTypeName:        constant.GetChannelTypeName(ch.Type),
				ChannelStatus:          ch.Status,
				Group:                  ch.Group,
				Tag:                    tag,
				BaseURL:                strings.TrimSpace(ch.GetBaseURL()),
				IsMultiKey:             ch.ChannelInfo.IsMultiKey,
				KeyCount:               keyCount,
				EffectiveProvider:      chProvider,
				Config:                 chCfg,
				EffectiveAlertEnabled:  chAlertEnabled,
				EffectiveMinBalanceCNY: chMinCNY,
				EffectiveMinPercent:    chMinPct,
				Snapshot:               chSnap,
			}
			siteView.Channels = append(siteView.Channels, chView)
			overview.Summary.TotalChannels++
			if ch.Status == common.ChannelStatusEnabled {
				siteView.EnabledChannelCount++
			}
			if chSnap.HasIndependentLimit {
				siteView.LimitedChannelCount++
				overview.Summary.LimitedChannels++
			}
			if chSnap.Status == UpstreamBalanceStatusLow {
				siteView.LowChannelCount++
				overview.Summary.LowChannels++
			}
		}

		overview.Sites = append(overview.Sites, siteView)
		overview.Summary.TotalSites++
		switch siteSnap.Status {
		case UpstreamBalanceStatusIgnored:
			overview.Summary.IgnoredSites++
		case UpstreamBalanceStatusUnconfigured:
			overview.Summary.UnconfiguredSites++
		case UpstreamBalanceStatusLow:
			overview.Summary.MonitoredSites++
			overview.Summary.LowSites++
		case UpstreamBalanceStatusError:
			overview.Summary.MonitoredSites++
			overview.Summary.ErrorSites++
		default:
			overview.Summary.MonitoredSites++
		}
		if siteSnap.Status != UpstreamBalanceStatusIgnored && siteSnap.Status != UpstreamBalanceStatusUnconfigured {
			if siteSnap.BalanceCNY != nil {
				overview.Summary.TotalBalanceCNY = roundMoney(overview.Summary.TotalBalanceCNY + *siteSnap.BalanceCNY)
			}
			if siteSnap.BalanceUSD != nil {
				overview.Summary.TotalBalanceUSD = roundMoney(overview.Summary.TotalBalanceUSD + *siteSnap.BalanceUSD)
			}
		}
	}

	// Sort sites: low first, then error, then monitored ok/unlimited, then unconfigured, then ignored.
	sitePriority := func(view UpstreamBalanceSiteView) int {
		if view.Snapshot.Status == UpstreamBalanceStatusLow || view.LowChannelCount > 0 {
			return 0
		}
		switch view.Snapshot.Status {
		case UpstreamBalanceStatusError:
			return 1
		case UpstreamBalanceStatusOK, UpstreamBalanceStatusUnlimited:
			return 2
		case UpstreamBalanceStatusUnconfigured:
			return 3
		default:
			return 4
		}
	}
	slices.SortFunc(overview.Sites, func(a, b UpstreamBalanceSiteView) int {
		if pa, pb := sitePriority(a), sitePriority(b); pa != pb {
			return cmp.Compare(pa, pb)
		}
		return cmp.Compare(strings.ToLower(a.DisplayName), strings.ToLower(b.DisplayName))
	})

	return overview, nil
}

func formatAlertReasonsText(item upstreamAlertItem, zh bool) string {
	parts := make([]string, 0, len(item.Reasons))
	for _, reason := range item.Reasons {
		switch reason {
		case "amount":
			if item.MinBalanceCNY != nil {
				if zh {
					parts = append(parts, fmt.Sprintf("余额低于 ¥%.2f", *item.MinBalanceCNY))
				} else {
					parts = append(parts, fmt.Sprintf("Balance below ¥%.2f", *item.MinBalanceCNY))
				}
			}
		case "percent":
			if item.MinPercent != nil {
				if zh {
					parts = append(parts, fmt.Sprintf("剩余比例低于 %.1f%%", *item.MinPercent))
				} else {
					parts = append(parts, fmt.Sprintf("Remaining below %.1f%%", *item.MinPercent))
				}
			}
		}
	}
	return strings.Join(parts, " / ")
}

func renderUpstreamAlertEmail(lang string, items []upstreamAlertItem, checkedAt int64, isTest bool) (subject string, body string) {
	zh := strings.HasPrefix(strings.ToLower(strings.TrimSpace(lang)), "zh")
	if strings.TrimSpace(lang) == "" {
		zh = strings.HasPrefix(strings.ToLower(strings.TrimSpace(common.DefaultLanguage)), "zh")
	}
	systemName := common.SystemName
	if strings.TrimSpace(systemName) == "" {
		systemName = "MagiRouter"
	}

	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil || loc == nil {
		loc = time.Local
	}
	timeText := time.Unix(checkedAt, 0).In(loc).Format("2006-01-02 15:04:05 MST")

	common.OptionMapRWMutex.RLock()
	serverAddress := strings.TrimRight(strings.TrimSpace(common.OptionMap["ServerAddress"]), "/")
	common.OptionMapRWMutex.RUnlock()

	if isTest {
		if zh {
			subject = fmt.Sprintf("[%s] 上游余额预警测试邮件", systemName)
		} else {
			subject = fmt.Sprintf("[%s] Upstream Balance Alert Test Email", systemName)
		}
	} else if zh {
		subject = fmt.Sprintf("[%s] 上游余额预警（%d 项低于阈值）", systemName, len(items))
	} else {
		subject = fmt.Sprintf("[%s] Upstream Balance Alert (%d item(s) below threshold)", systemName, len(items))
	}

	var b strings.Builder
	b.WriteString(`<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:680px;margin:0 auto;color:#111827;line-height:1.6;">`)
	if zh {
		title := "上游余额低额预警"
		if isTest {
			title = "上游余额预警测试邮件"
		}
		b.WriteString(fmt.Sprintf(`<h2 style="margin:0 0 8px;">%s</h2>`, html.EscapeString(title)))
		if isTest {
			b.WriteString(`<p style="margin:0 0 16px;color:#4b5563;">这是一封测试邮件，说明您的邮件发送配置和接收地址均可正常工作。</p>`)
		} else {
			b.WriteString(fmt.Sprintf(`<p style="margin:0 0 16px;color:#4b5563;">系统在 <strong>%s</strong> 检查上游余额时，发现以下站点或渠道已低于您设置的预警阈值：</p>`, html.EscapeString(timeText)))
		}
	} else {
		title := "Upstream Low Balance Alert"
		if isTest {
			title = "Upstream Balance Alert Test Email"
		}
		b.WriteString(fmt.Sprintf(`<h2 style="margin:0 0 8px;">%s</h2>`, html.EscapeString(title)))
		if isTest {
			b.WriteString(`<p style="margin:0 0 16px;color:#4b5563;">This is a test email confirming your email delivery configuration works properly.</p>`)
		} else {
			b.WriteString(fmt.Sprintf(`<p style="margin:0 0 16px;color:#4b5563;">Checked at <strong>%s</strong>. The following upstream sites or channels are below your configured thresholds:</p>`, html.EscapeString(timeText)))
		}
	}

	if len(items) > 0 {
		b.WriteString(`<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">`)
		if zh {
			b.WriteString(`<thead><tr style="background:#f3f4f6;text-align:left;"><th style="padding:8px 10px;border:1px solid #e5e7eb;">对象</th><th style="padding:8px 10px;border:1px solid #e5e7eb;">类型</th><th style="padding:8px 10px;border:1px solid #e5e7eb;">当前余额</th><th style="padding:8px 10px;border:1px solid #e5e7eb;">剩余比例</th><th style="padding:8px 10px;border:1px solid #e5e7eb;">触发条件</th></tr></thead>`)
		} else {
			b.WriteString(`<thead><tr style="background:#f3f4f6;text-align:left;"><th style="padding:8px 10px;border:1px solid #e5e7eb;">Target</th><th style="padding:8px 10px;border:1px solid #e5e7eb;">Type</th><th style="padding:8px 10px;border:1px solid #e5e7eb;">Balance</th><th style="padding:8px 10px;border:1px solid #e5e7eb;">Remaining</th><th style="padding:8px 10px;border:1px solid #e5e7eb;">Rule</th></tr></thead>`)
		}
		b.WriteString(`<tbody>`)
		for _, item := range items {
			targetLabel := item.SiteName
			kindLabel := "Site"
			if zh {
				kindLabel = "上游网站"
			}
			if item.Kind == "channel" {
				targetLabel = fmt.Sprintf("%s / %s (#%d)", item.SiteName, item.ChannelName, item.ChannelID)
				if zh {
					kindLabel = "单渠道限额"
				} else {
					kindLabel = "Channel"
				}
			}
			balText := "-"
			if item.BalanceCNY != nil && item.BalanceUSD != nil {
				balText = fmt.Sprintf("¥%.2f ($%.2f)", *item.BalanceCNY, *item.BalanceUSD)
			} else if item.BalanceCNY != nil {
				balText = fmt.Sprintf("¥%.2f", *item.BalanceCNY)
			}
			pctText := "-"
			if item.RemainingPercent != nil {
				pctText = fmt.Sprintf("%.1f%%", *item.RemainingPercent)
			}
			reasonText := formatAlertReasonsText(item, zh)
			b.WriteString(fmt.Sprintf(
				`<tr><td style="padding:8px 10px;border:1px solid #e5e7eb;">%s</td><td style="padding:8px 10px;border:1px solid #e5e7eb;">%s</td><td style="padding:8px 10px;border:1px solid #e5e7eb;color:#dc2626;font-weight:600;">%s</td><td style="padding:8px 10px;border:1px solid #e5e7eb;">%s</td><td style="padding:8px 10px;border:1px solid #e5e7eb;">%s</td></tr>`,
				html.EscapeString(targetLabel),
				html.EscapeString(kindLabel),
				html.EscapeString(balText),
				html.EscapeString(pctText),
				html.EscapeString(reasonText),
			))
		}
		b.WriteString(`</tbody></table>`)
	}

	if serverAddress != "" {
		link := serverAddress + "/upstream-balance"
		if zh {
			b.WriteString(fmt.Sprintf(`<p style="margin:0;color:#4b5563;">查看详情：<a href="%s">%s</a></p>`, html.EscapeString(link), html.EscapeString(link)))
		} else {
			b.WriteString(fmt.Sprintf(`<p style="margin:0;color:#4b5563;">View details: <a href="%s">%s</a></p>`, html.EscapeString(link), html.EscapeString(link)))
		}
	}
	b.WriteString(`</div>`)
	return subject, b.String()
}

func sendUpstreamBalanceAlertEmail(cfg operation_setting.UpstreamBalanceSetting, items []upstreamAlertItem, now int64) error {
	emails, err := operation_setting.ParseUpstreamNotifyEmails(cfg.NotifyEmails)
	if err != nil {
		return err
	}
	if len(emails) > 0 {
		subject, content := renderUpstreamAlertEmail(common.DefaultLanguage, items, now, false)
		return common.SendEmail(subject, strings.Join(emails, ";"), content)
	}
	NotifyChannelWatchers(dto.NotifyTypeChannelUpdate, func(lang string) (string, string) {
		return renderUpstreamAlertEmail(lang, items, now, false)
	})
	return nil
}

func SendUpstreamBalanceTestEmail(rawNotifyEmails string, fallbackUserID int) error {
	emails, err := operation_setting.ParseUpstreamNotifyEmails(rawNotifyEmails)
	if err != nil {
		return err
	}
	if len(emails) == 0 && fallbackUserID > 0 {
		user, userErr := model.GetUserById(fallbackUserID, false)
		if userErr == nil && user != nil {
			setting := user.GetSetting()
			candidate := strings.TrimSpace(setting.NotificationEmail)
			if candidate == "" {
				candidate = strings.TrimSpace(user.Email)
			}
			if candidate != "" {
				emails = []string{candidate}
			}
		}
	}
	if len(emails) == 0 {
		return common.NewMessage("No recipient email configured. Enter alert emails or bind an email on your profile first.")
	}
	sampleBalanceCNY := 32.50
	sampleBalanceUSD := 4.45
	samplePct := 16.25
	sampleMinCNY := 50.0
	sampleMinPct := 20.0
	sample := []upstreamAlertItem{
		{
			Kind:             "site",
			SiteName:         "example-upstream.com",
			ProviderType:     operation_setting.UpstreamBalanceProviderNewAPI,
			BalanceCNY:       &sampleBalanceCNY,
			BalanceUSD:       &sampleBalanceUSD,
			RemainingPercent: &samplePct,
			MinBalanceCNY:    &sampleMinCNY,
			MinPercent:       &sampleMinPct,
			Reasons:          []string{"amount", "percent"},
		},
	}
	subject, content := renderUpstreamAlertEmail(common.DefaultLanguage, sample, common.GetTimestamp(), true)
	return common.SendEmail(subject, strings.Join(emails, ";"), content)
}
