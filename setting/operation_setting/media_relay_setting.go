package operation_setting

import (
	"encoding/json"
	"maps"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

const (
	MediaRelayProviderAliyunOSS = "aliyun-oss"
	MediaRelayProviderS3        = "s3"

	DefaultMediaRelayProvider        = MediaRelayProviderAliyunOSS
	DefaultMediaRelayEndpoint        = "https://oss-cn-hongkong.aliyuncs.com"
	DefaultMediaRelayRegion          = "oss-cn-hongkong"
	DefaultMediaRelayKeyPrefix       = "magicanva/media"
	DefaultMediaRelayPresignTTL      = 600
	DefaultMediaRelayRetentionDays   = 3
	DefaultMediaRelayMaxFileSizeMB   = 200
	DefaultMediaRelayDailyTrafficMB  = 500
	MaxMediaRelayPresignTTL          = 3600
	MinMediaRelayPresignTTL          = 60
	MaxMediaRelayRetentionDays       = 365
	MaxMediaRelayFileSizeMB          = 2048
	MaxMediaRelayDailyTrafficMB      = 1024 * 1024
	BytesPerMiB                      = int64(1024 * 1024)
)

var mediaRelayTrafficLocation = loadMediaRelayLocation()

func loadMediaRelayLocation() *time.Location {
	if loc, err := time.LoadLocation("Asia/Shanghai"); err == nil && loc != nil {
		return loc
	}
	return time.FixedZone("CST", 8*3600)
}

// MediaRelaySetting 画布云端媒体中转（默认阿里云中国站·中国香港 OSS）与每日流量配额配置
type MediaRelaySetting struct {
	Enabled               bool           `json:"enabled"`
	Provider              string         `json:"provider"`
	Endpoint              string         `json:"endpoint"`
	Region                string         `json:"region"`
	Bucket                string         `json:"bucket"`
	PublicBaseURL         string         `json:"public_base_url"`
	KeyPrefix             string         `json:"key_prefix"`
	AccessKeyId           string         `json:"access_key_id"`
	AccessKeySecret       string         `json:"access_key_secret"`
	ForcePathStyle        bool           `json:"force_path_style"`
	PresignTTLSeconds     int            `json:"presign_ttl_seconds"`
	RetentionDays         int            `json:"retention_days"`
	MaxFileSizeMB         int            `json:"max_file_size_mb"`
	DefaultDailyTrafficMB int            `json:"default_daily_traffic_mb"`
	GroupDailyBonusMB     map[string]int `json:"group_daily_bonus_mb"`
	TempGlobalBonusMB     int            `json:"temp_global_bonus_mb"`
	TempGlobalExpiresAt   int64          `json:"temp_global_expires_at"`
	TempGlobalNote        string         `json:"temp_global_note"`
}

var mediaRelaySetting = MediaRelaySetting{
	Enabled:               false,
	Provider:              DefaultMediaRelayProvider,
	Endpoint:              DefaultMediaRelayEndpoint,
	Region:                DefaultMediaRelayRegion,
	Bucket:                "",
	PublicBaseURL:         "",
	KeyPrefix:             DefaultMediaRelayKeyPrefix,
	AccessKeyId:           "",
	AccessKeySecret:       "",
	ForcePathStyle:        false,
	PresignTTLSeconds:     DefaultMediaRelayPresignTTL,
	RetentionDays:         DefaultMediaRelayRetentionDays,
	MaxFileSizeMB:         DefaultMediaRelayMaxFileSizeMB,
	DefaultDailyTrafficMB: DefaultMediaRelayDailyTrafficMB,
	GroupDailyBonusMB:     map[string]int{},
	TempGlobalBonusMB:     0,
	TempGlobalExpiresAt:   0,
	TempGlobalNote:        "",
}

func init() {
	config.GlobalConfig.Register("media_relay_setting", &mediaRelaySetting)
}

// GetMediaRelaySetting 返回配置指针（仅用于内部及测试，常规读取请使用 GetMediaRelaySettingSnapshot）
func GetMediaRelaySetting() *MediaRelaySetting {
	return &mediaRelaySetting
}

// GetMediaRelaySettingSnapshot 返回并发安全的配置副本
func GetMediaRelaySettingSnapshot() MediaRelaySetting {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	copied := mediaRelaySetting
	copied.GroupDailyBonusMB = cloneGroupBonusMap(mediaRelaySetting.GroupDailyBonusMB)
	return copied.Normalized()
}

func cloneGroupBonusMap(source map[string]int) map[string]int {
	result := make(map[string]int, len(source))
	maps.Copy(result, source)
	return result
}

// Normalized 规范化字段并填充合理默认值
func (s MediaRelaySetting) Normalized() MediaRelaySetting {
	out := s
	out.Provider = strings.ToLower(strings.TrimSpace(out.Provider))
	if out.Provider != MediaRelayProviderS3 {
		out.Provider = MediaRelayProviderAliyunOSS
	}
	out.Endpoint = strings.TrimRight(strings.TrimSpace(out.Endpoint), "/")
	if out.Endpoint == "" && out.Provider == MediaRelayProviderAliyunOSS {
		out.Endpoint = DefaultMediaRelayEndpoint
	}
	out.Region = strings.TrimSpace(out.Region)
	if out.Region == "" && out.Provider == MediaRelayProviderAliyunOSS {
		out.Region = DefaultMediaRelayRegion
	}
	out.Bucket = strings.TrimSpace(out.Bucket)
	out.PublicBaseURL = strings.TrimRight(strings.TrimSpace(out.PublicBaseURL), "/")
	out.KeyPrefix = strings.Trim(strings.TrimSpace(out.KeyPrefix), "/")
	if out.KeyPrefix == "" {
		out.KeyPrefix = DefaultMediaRelayKeyPrefix
	}
	out.AccessKeyId = strings.TrimSpace(out.AccessKeyId)
	out.AccessKeySecret = strings.TrimSpace(out.AccessKeySecret)
	if out.PresignTTLSeconds <= 0 {
		out.PresignTTLSeconds = DefaultMediaRelayPresignTTL
	}
	if out.RetentionDays <= 0 {
		out.RetentionDays = DefaultMediaRelayRetentionDays
	}
	if out.MaxFileSizeMB <= 0 {
		out.MaxFileSizeMB = DefaultMediaRelayMaxFileSizeMB
	}
	if out.DefaultDailyTrafficMB < 0 {
		out.DefaultDailyTrafficMB = DefaultMediaRelayDailyTrafficMB
	}
	if out.TempGlobalBonusMB < 0 {
		out.TempGlobalBonusMB = 0
	}
	if out.TempGlobalExpiresAt < 0 {
		out.TempGlobalExpiresAt = 0
	}
	out.TempGlobalNote = strings.TrimSpace(out.TempGlobalNote)

	normalizedGroups := make(map[string]int)
	for rawGroup, bonus := range out.GroupDailyBonusMB {
		group := strings.TrimSpace(rawGroup)
		if group == "" || bonus <= 0 {
			continue
		}
		normalizedGroups[group] = bonus
	}
	out.GroupDailyBonusMB = normalizedGroups
	return out
}

// Validate 校验画布媒体中转与每日流量配置
func (s MediaRelaySetting) Validate() error {
	cfg := s.Normalized()
	if cfg.Provider != MediaRelayProviderAliyunOSS && cfg.Provider != MediaRelayProviderS3 {
		return common.NewMessage("Unsupported media storage provider")
	}
	if cfg.PresignTTLSeconds < MinMediaRelayPresignTTL || cfg.PresignTTLSeconds > MaxMediaRelayPresignTTL {
		return common.NewMessage("Presign URL TTL must be between 60 and 3600 seconds")
	}
	if cfg.RetentionDays < 1 || cfg.RetentionDays > MaxMediaRelayRetentionDays {
		return common.NewMessage("Retention days must be between 1 and 365")
	}
	if cfg.MaxFileSizeMB < 1 || cfg.MaxFileSizeMB > MaxMediaRelayFileSizeMB {
		return common.NewMessage("Max file size must be between 1 and 2048 MB")
	}
	if cfg.DefaultDailyTrafficMB < 0 || cfg.DefaultDailyTrafficMB > MaxMediaRelayDailyTrafficMB {
		return common.NewMessage("Default daily traffic must be between 0 and 1048576 MB")
	}
	if cfg.TempGlobalBonusMB < 0 || cfg.TempGlobalBonusMB > MaxMediaRelayDailyTrafficMB {
		return common.NewMessage("Temporary global daily traffic bonus must be between 0 and 1048576 MB")
	}
	if len(cfg.TempGlobalNote) > 255 {
		return common.NewMessage("Temporary global boost note cannot exceed 255 characters")
	}
	if strings.Contains(cfg.KeyPrefix, "..") || strings.Contains(cfg.KeyPrefix, "\\") {
		return common.NewMessage("Object key prefix cannot contain '..' or backslashes")
	}
	for group, bonus := range cfg.GroupDailyBonusMB {
		if len(group) > 64 || bonus < 0 || bonus > MaxMediaRelayDailyTrafficMB {
			return common.NewMessage("Group daily traffic bonus is invalid")
		}
	}
	if cfg.Endpoint != "" {
		if err := validateMediaRelayHTTPURL(cfg.Endpoint, true); err != nil {
			return err
		}
	}
	if cfg.PublicBaseURL != "" {
		if err := validateMediaRelayHTTPURL(cfg.PublicBaseURL, false); err != nil {
			return err
		}
	}
	if cfg.Enabled {
		if cfg.Endpoint == "" {
			return common.NewMessage("Storage endpoint is required when media relay is enabled")
		}
		if cfg.Bucket == "" {
			return common.NewMessage("Storage bucket is required when media relay is enabled")
		}
		if cfg.Region == "" {
			return common.NewMessage("Storage region is required when media relay is enabled")
		}
		if cfg.AccessKeyId == "" || cfg.AccessKeySecret == "" {
			return common.NewMessage("AccessKey ID and AccessKey Secret are required when media relay is enabled")
		}
	}
	return nil
}

func validateMediaRelayHTTPURL(raw string, isEndpoint bool) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed == nil || parsed.Host == "" || parsed.User != nil {
		if isEndpoint {
			return common.NewMessage("Storage endpoint must be a valid HTTP/HTTPS URL")
		}
		return common.NewMessage("Public base URL must be a valid HTTP/HTTPS URL")
	}
	if parsed.Scheme != "https" && parsed.Scheme != "http" {
		if isEndpoint {
			return common.NewMessage("Storage endpoint must use http or https")
		}
		return common.NewMessage("Public base URL must use http or https")
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		if isEndpoint {
			return common.NewMessage("Storage endpoint must not include query parameters or fragments")
		}
		return common.NewMessage("Public base URL must not include query parameters or fragments")
	}
	return nil
}

// IsReady 判断当前是否已启用且核心存储凭证完整
func (s MediaRelaySetting) IsReady() bool {
	cfg := s.Normalized()
	return cfg.Enabled &&
		cfg.Endpoint != "" &&
		cfg.Bucket != "" &&
		cfg.Region != "" &&
		cfg.AccessKeyId != "" &&
		cfg.AccessKeySecret != ""
}

// ActiveGlobalTempBonusBytes 返回当前时刻有效的全站临时每日流量增量（字节）
func (s MediaRelaySetting) ActiveGlobalTempBonusBytes(now time.Time) (int64, int64, string) {
	if s.TempGlobalBonusMB <= 0 {
		return 0, 0, ""
	}
	if s.TempGlobalExpiresAt > 0 && now.Unix() >= s.TempGlobalExpiresAt {
		return 0, 0, ""
	}
	return int64(s.TempGlobalBonusMB) * BytesPerMiB, s.TempGlobalExpiresAt, s.TempGlobalNote
}

// GroupBonusBytes 返回指定用户组对应的每日流量增量（字节）
func (s MediaRelaySetting) GroupBonusBytes(group string) int64 {
	normalized := strings.TrimSpace(group)
	if normalized == "" {
		normalized = "default"
	}
	bonusMB, ok := s.GroupDailyBonusMB[normalized]
	if !ok || bonusMB <= 0 {
		return 0
	}
	return int64(bonusMB) * BytesPerMiB
}

// ToOptionMap 将配置转换为持久化到 options 表的键值对
func (s MediaRelaySetting) ToOptionMap() (map[string]string, error) {
	cfg := s.Normalized()
	groupBytes, err := json.Marshal(cfg.GroupDailyBonusMB)
	if err != nil {
		return nil, err
	}
	return map[string]string{
		"media_relay_setting.enabled":                  strconv.FormatBool(cfg.Enabled),
		"media_relay_setting.provider":                 cfg.Provider,
		"media_relay_setting.endpoint":                 cfg.Endpoint,
		"media_relay_setting.region":                   cfg.Region,
		"media_relay_setting.bucket":                   cfg.Bucket,
		"media_relay_setting.public_base_url":          cfg.PublicBaseURL,
		"media_relay_setting.key_prefix":               cfg.KeyPrefix,
		"media_relay_setting.access_key_id":            cfg.AccessKeyId,
		"media_relay_setting.access_key_secret":        cfg.AccessKeySecret,
		"media_relay_setting.force_path_style":         strconv.FormatBool(cfg.ForcePathStyle),
		"media_relay_setting.presign_ttl_seconds":      strconv.Itoa(cfg.PresignTTLSeconds),
		"media_relay_setting.retention_days":           strconv.Itoa(cfg.RetentionDays),
		"media_relay_setting.max_file_size_mb":         strconv.Itoa(cfg.MaxFileSizeMB),
		"media_relay_setting.default_daily_traffic_mb": strconv.Itoa(cfg.DefaultDailyTrafficMB),
		"media_relay_setting.group_daily_bonus_mb":     string(groupBytes),
		"media_relay_setting.temp_global_bonus_mb":     strconv.Itoa(cfg.TempGlobalBonusMB),
		"media_relay_setting.temp_global_expires_at":   strconv.FormatInt(cfg.TempGlobalExpiresAt, 10),
		"media_relay_setting.temp_global_note":         cfg.TempGlobalNote,
	}, nil
}

// MediaTrafficDayWindow 返回当日日期键（YYYY-MM-DD）及次日 0 点重置时间戳（Asia/Shanghai）
func MediaTrafficDayWindow(now time.Time) (dateKey string, nextResetAt int64) {
	local := now.In(mediaRelayTrafficLocation)
	dateKey = local.Format("2006-01-02")
	nextMidnight := time.Date(local.Year(), local.Month(), local.Day()+1, 0, 0, 0, 0, mediaRelayTrafficLocation)
	return dateKey, nextMidnight.Unix()
}
