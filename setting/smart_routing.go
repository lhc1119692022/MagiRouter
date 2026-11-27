package setting

import (
	"fmt"
	"math"
	"slices"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

const SmartRoutingConfigOptionKey = "SmartRoutingConfig"

type SmartRoutingStabilityWeights struct {
	SuccessRate   float64 `json:"success_rate"`
	Speed         float64 `json:"speed"`
	CacheHit      float64 `json:"cache_hit"`
	PriceTieBreak float64 `json:"price_tie_break"`
}

type SmartRoutingConfig struct {
	Enabled              bool                         `json:"enabled"`
	ShortWindowHours     int                          `json:"short_window_hours"`
	LongWindowHours      int                          `json:"long_window_hours"`
	HealthySuccessRate   float64                      `json:"healthy_success_rate"`
	DegradedSuccessRate  float64                      `json:"degraded_success_rate"`
	AllowOutageFallback  bool                         `json:"allow_outage_fallback"`
	CostMaxFallbackRatio float64                      `json:"cost_max_fallback_ratio"`
	ExcludedGroups       []string                     `json:"excluded_groups"`
	PinnedGroups         []string                     `json:"pinned_groups"`
	DemotedGroups        []string                     `json:"demoted_groups"`
	StabilityWeights     SmartRoutingStabilityWeights `json:"stability_weights"`
}

func DefaultSmartRoutingConfig() SmartRoutingConfig {
	return SmartRoutingConfig{
		Enabled:              true,
		ShortWindowHours:     1,
		LongWindowHours:      24,
		HealthySuccessRate:   95,
		DegradedSuccessRate:  80,
		AllowOutageFallback:  true,
		CostMaxFallbackRatio: 0,
		ExcludedGroups:       []string{},
		PinnedGroups:         []string{},
		DemotedGroups:        []string{},
		StabilityWeights: SmartRoutingStabilityWeights{
			SuccessRate:   0.58,
			Speed:         0.26,
			CacheHit:      0.12,
			PriceTieBreak: 0.04,
		},
	}
}

var (
	smartRoutingMu      sync.RWMutex
	smartRoutingConfig  = DefaultSmartRoutingConfig()
	smartRoutingHooksMu sync.RWMutex
	smartRoutingHooks   []func()
)

func RegisterSmartRoutingChangeHook(fn func()) {
	if fn == nil {
		return
	}
	smartRoutingHooksMu.Lock()
	defer smartRoutingHooksMu.Unlock()
	smartRoutingHooks = append(smartRoutingHooks, fn)
}

func notifySmartRoutingChanged() {
	smartRoutingHooksMu.RLock()
	hooks := slices.Clone(smartRoutingHooks)
	smartRoutingHooksMu.RUnlock()
	for _, hook := range hooks {
		hook()
	}
}

func cloneSmartRoutingConfig(cfg SmartRoutingConfig) SmartRoutingConfig {
	cfg.ExcludedGroups = slices.Clone(cfg.ExcludedGroups)
	cfg.PinnedGroups = slices.Clone(cfg.PinnedGroups)
	cfg.DemotedGroups = slices.Clone(cfg.DemotedGroups)
	if cfg.ExcludedGroups == nil {
		cfg.ExcludedGroups = []string{}
	}
	if cfg.PinnedGroups == nil {
		cfg.PinnedGroups = []string{}
	}
	if cfg.DemotedGroups == nil {
		cfg.DemotedGroups = []string{}
	}
	return cfg
}

func normalizeGroupNameList(groups []string) []string {
	if len(groups) == 0 {
		return []string{}
	}
	seen := make(map[string]struct{}, len(groups))
	out := make([]string, 0, len(groups))
	for _, raw := range groups {
		name := strings.TrimSpace(raw)
		if name == "" || name == "auto" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		out = append(out, name)
	}
	return out
}

func ValidateAndNormalizeSmartRoutingConfig(cfg SmartRoutingConfig) (SmartRoutingConfig, error) {
	if cfg.ShortWindowHours < 1 || cfg.ShortWindowHours > 24*7 {
		return SmartRoutingConfig{}, fmt.Errorf("short_window_hours must be between 1 and 168")
	}
	if cfg.LongWindowHours < cfg.ShortWindowHours || cfg.LongWindowHours > 24*30 {
		return SmartRoutingConfig{}, fmt.Errorf("long_window_hours must be between short_window_hours and 720")
	}
	if math.IsNaN(cfg.HealthySuccessRate) || math.IsInf(cfg.HealthySuccessRate, 0) || cfg.HealthySuccessRate < 50 || cfg.HealthySuccessRate > 100 {
		return SmartRoutingConfig{}, fmt.Errorf("healthy_success_rate must be between 50 and 100")
	}
	if math.IsNaN(cfg.DegradedSuccessRate) || math.IsInf(cfg.DegradedSuccessRate, 0) || cfg.DegradedSuccessRate < 0 || cfg.DegradedSuccessRate > cfg.HealthySuccessRate {
		return SmartRoutingConfig{}, fmt.Errorf("degraded_success_rate must be between 0 and healthy_success_rate")
	}
	if math.IsNaN(cfg.CostMaxFallbackRatio) || math.IsInf(cfg.CostMaxFallbackRatio, 0) || cfg.CostMaxFallbackRatio < 0 {
		return SmartRoutingConfig{}, fmt.Errorf("cost_max_fallback_ratio must be non-negative")
	}
	weights := cfg.StabilityWeights
	for _, weight := range []float64{weights.SuccessRate, weights.Speed, weights.CacheHit, weights.PriceTieBreak} {
		if math.IsNaN(weight) || math.IsInf(weight, 0) || weight < 0 {
			return SmartRoutingConfig{}, fmt.Errorf("stability weights must be non-negative finite numbers")
		}
	}
	weightSum := weights.SuccessRate + weights.Speed + weights.CacheHit + weights.PriceTieBreak
	if weightSum <= 0 {
		return SmartRoutingConfig{}, fmt.Errorf("stability weights sum must be greater than 0")
	}
	cfg.ExcludedGroups = normalizeGroupNameList(cfg.ExcludedGroups)
	cfg.PinnedGroups = normalizeGroupNameList(cfg.PinnedGroups)
	cfg.DemotedGroups = normalizeGroupNameList(cfg.DemotedGroups)
	return cloneSmartRoutingConfig(cfg), nil
}

func ParseSmartRoutingConfigJSON(jsonString string) (SmartRoutingConfig, error) {
	trimmed := strings.TrimSpace(jsonString)
	if trimmed == "" {
		return DefaultSmartRoutingConfig(), nil
	}
	cfg := DefaultSmartRoutingConfig()
	if err := common.Unmarshal([]byte(trimmed), &cfg); err != nil {
		return SmartRoutingConfig{}, err
	}
	return ValidateAndNormalizeSmartRoutingConfig(cfg)
}

func ValidateSmartRoutingConfigJSON(jsonString string) error {
	_, err := ParseSmartRoutingConfigJSON(jsonString)
	return err
}

func UpdateSmartRoutingConfigByJSONString(jsonString string) error {
	cfg, err := ParseSmartRoutingConfigJSON(jsonString)
	if err != nil {
		return err
	}
	smartRoutingMu.Lock()
	smartRoutingConfig = cfg
	smartRoutingMu.Unlock()
	notifySmartRoutingChanged()
	return nil
}

func GetSmartRoutingConfig() SmartRoutingConfig {
	smartRoutingMu.RLock()
	defer smartRoutingMu.RUnlock()
	return cloneSmartRoutingConfig(smartRoutingConfig)
}

func SmartRoutingConfig2JSONString() string {
	cfg := GetSmartRoutingConfig()
	data, err := common.Marshal(cfg)
	if err != nil {
		return "{}"
	}
	return string(data)
}
