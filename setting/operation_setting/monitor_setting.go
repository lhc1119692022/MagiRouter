package operation_setting

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

type MonitorSetting struct {
	AutoTestChannelEnabled   bool    `json:"auto_test_channel_enabled"`
	AutoTestChannelMinutes   float64 `json:"auto_test_channel_minutes"`
	ChannelTestMode          string  `json:"channel_test_mode"`
	ChannelTestConcurrency   int     `json:"channel_test_concurrency"`
	ChannelTestModelStrategy string  `json:"channel_test_model_strategy"`
	ChannelTestSamplePercent int     `json:"channel_test_sample_percent"`
	ChannelTestExcludeModels string  `json:"channel_test_exclude_models"`
	ChannelTestIdleMinutes   int     `json:"channel_test_idle_minutes"`
}

const (
	ChannelTestModeScheduledAll    = "scheduled_all"
	ChannelTestModeAutoBanOnly     = "auto_ban_only"
	ChannelTestModePassiveRecovery = "passive_recovery"

	ChannelTestModelStrategyFixed  = "fixed"
	ChannelTestModelStrategyRandom = "random"

	ChannelTestConcurrencyOptionKey = "monitor_setting.channel_test_concurrency"
	DefaultChannelTestConcurrency   = 1
	MaxChannelTestConcurrency       = 32

	DefaultChannelTestSamplePercent = 100
	MinChannelTestSamplePercent     = 1
	MaxChannelTestSamplePercent     = 100

	DefaultChannelTestIdleMinutes = 30
	MinChannelTestIdleMinutes     = 0
	MaxChannelTestIdleMinutes     = 1440
)

// 默认配置
var monitorSetting = MonitorSetting{
	AutoTestChannelEnabled:   false,
	AutoTestChannelMinutes:   10,
	ChannelTestMode:          ChannelTestModeScheduledAll,
	ChannelTestConcurrency:   DefaultChannelTestConcurrency,
	ChannelTestModelStrategy: ChannelTestModelStrategyFixed,
	ChannelTestSamplePercent: DefaultChannelTestSamplePercent,
	ChannelTestExcludeModels: "",
	ChannelTestIdleMinutes:   DefaultChannelTestIdleMinutes,
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("monitor_setting", &monitorSetting)
}

func GetMonitorSetting() *MonitorSetting {
	if os.Getenv("CHANNEL_TEST_FREQUENCY") != "" {
		frequency, err := strconv.Atoi(os.Getenv("CHANNEL_TEST_FREQUENCY"))
		if err == nil && frequency > 0 {
			monitorSetting.AutoTestChannelEnabled = true
			monitorSetting.AutoTestChannelMinutes = float64(frequency)
			monitorSetting.ChannelTestMode = ChannelTestModeScheduledAll
		}
	}
	if enabled, ok := os.LookupEnv("CHANNEL_TEST_ENABLED"); ok {
		parsed, err := strconv.ParseBool(enabled)
		if err == nil {
			monitorSetting.AutoTestChannelEnabled = parsed
		}
	}
	switch monitorSetting.ChannelTestMode {
	case ChannelTestModeAutoBanOnly, ChannelTestModePassiveRecovery:
	default:
		monitorSetting.ChannelTestMode = ChannelTestModeScheduledAll
	}
	monitorSetting.ChannelTestConcurrency = NormalizeChannelTestConcurrency(monitorSetting.ChannelTestConcurrency)
	monitorSetting.ChannelTestModelStrategy = NormalizeChannelTestModelStrategy(monitorSetting.ChannelTestModelStrategy)
	monitorSetting.ChannelTestSamplePercent = NormalizeChannelTestSamplePercent(monitorSetting.ChannelTestSamplePercent)
	monitorSetting.ChannelTestIdleMinutes = NormalizeChannelTestIdleMinutes(monitorSetting.ChannelTestIdleMinutes)
	return &monitorSetting
}

func NormalizeChannelTestConcurrency(concurrency int) int {
	if concurrency < 1 {
		return DefaultChannelTestConcurrency
	}
	if concurrency > MaxChannelTestConcurrency {
		return MaxChannelTestConcurrency
	}
	return concurrency
}

func ValidateChannelTestConcurrency(value string) error {
	concurrency, err := strconv.Atoi(value)
	if err != nil || concurrency < 1 || concurrency > MaxChannelTestConcurrency {
		return fmt.Errorf("channel test concurrency must be between 1 and %d", MaxChannelTestConcurrency)
	}
	return nil
}

func NormalizeChannelTestModelStrategy(strategy string) string {
	switch strings.TrimSpace(strategy) {
	case ChannelTestModelStrategyRandom:
		return ChannelTestModelStrategyRandom
	default:
		return ChannelTestModelStrategyFixed
	}
}

func ValidateChannelTestModelStrategy(value string) error {
	switch strings.TrimSpace(value) {
	case ChannelTestModelStrategyFixed, ChannelTestModelStrategyRandom:
		return nil
	default:
		return fmt.Errorf("invalid channel test model strategy")
	}
}

func NormalizeChannelTestSamplePercent(percent int) int {
	if percent < MinChannelTestSamplePercent {
		return DefaultChannelTestSamplePercent
	}
	if percent > MaxChannelTestSamplePercent {
		return MaxChannelTestSamplePercent
	}
	return percent
}

func ValidateChannelTestSamplePercent(value string) error {
	percent, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || percent < MinChannelTestSamplePercent || percent > MaxChannelTestSamplePercent {
		return fmt.Errorf("channel test sample percent must be between %d and %d", MinChannelTestSamplePercent, MaxChannelTestSamplePercent)
	}
	return nil
}

func NormalizeChannelTestIdleMinutes(minutes int) int {
	if minutes < MinChannelTestIdleMinutes {
		return MinChannelTestIdleMinutes
	}
	if minutes > MaxChannelTestIdleMinutes {
		return MaxChannelTestIdleMinutes
	}
	return minutes
}

func ValidateChannelTestIdleMinutes(value string) error {
	minutes, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || minutes < MinChannelTestIdleMinutes || minutes > MaxChannelTestIdleMinutes {
		return fmt.Errorf("channel test idle minutes must be between %d and %d", MinChannelTestIdleMinutes, MaxChannelTestIdleMinutes)
	}
	return nil
}

func ParseChannelTestExcludeKeywords(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	fields := strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == '\n' || r == '\r' || r == ';'
	})
	keywords := make([]string, 0, len(fields))
	for _, field := range fields {
		trimmed := strings.ToLower(strings.TrimSpace(field))
		if trimmed != "" {
			keywords = append(keywords, trimmed)
		}
	}
	return keywords
}
