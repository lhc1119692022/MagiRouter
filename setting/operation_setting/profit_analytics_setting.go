package operation_setting

import (
	"fmt"
	"maps"
	"math"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

const (
	DefaultProfitCostRatio = 0.5
	MaxProfitCostRatio     = 10.0
	MaxProfitFixedCost     = 100000000.0

	ProfitPricingModePercent   = "percent"
	ProfitPricingModeRatio     = "ratio"
	ProfitPricingModeUnitPrice = "unit_price"
)

type ProfitChannelCostConfig struct {
	CostRatio        *float64 `json:"cost_ratio,omitempty"`
	MonthlyFixedCost float64  `json:"monthly_fixed_cost"`
	Note             string   `json:"note"`
	PricingMode      string   `json:"pricing_mode,omitempty"`
	UpstreamValue    *float64 `json:"upstream_value,omitempty"`
	PlatformValue    *float64 `json:"platform_value,omitempty"`
}

type ProfitFixedCostItem struct {
	Id          string  `json:"id"`
	Name        string  `json:"name"`
	Category    string  `json:"category"`
	MonthlyCost float64 `json:"monthly_cost"`
	Enabled     bool    `json:"enabled"`
	Note        string  `json:"note"`
}

type ProfitAnalyticsSetting struct {
	ExcludeAdminUsers bool                               `json:"exclude_admin_users"`
	DefaultCostRatio  float64                            `json:"default_cost_ratio"`
	PaymentFeeRate    float64                            `json:"payment_fee_rate"`
	PaymentFeeRates   map[string]float64                 `json:"payment_fee_rates"`
	ChannelCosts      map[string]ProfitChannelCostConfig `json:"channel_costs"`
	ExtraFixedCosts   []ProfitFixedCostItem              `json:"extra_fixed_costs"`
}

var profitAnalyticsSetting = ProfitAnalyticsSetting{
	ExcludeAdminUsers: true,
	DefaultCostRatio:  DefaultProfitCostRatio,
	PaymentFeeRate:    0,
	PaymentFeeRates:   map[string]float64{},
	ChannelCosts:      map[string]ProfitChannelCostConfig{},
	ExtraFixedCosts:   []ProfitFixedCostItem{},
}

func init() {
	config.GlobalConfig.Register("profit_analytics_setting", &profitAnalyticsSetting)
}

func GetProfitAnalyticsSettingSnapshot() ProfitAnalyticsSetting {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	copied := profitAnalyticsSetting
	copied.PaymentFeeRates = maps.Clone(profitAnalyticsSetting.PaymentFeeRates)
	copied.ChannelCosts = cloneProfitChannelCostMap(profitAnalyticsSetting.ChannelCosts)
	copied.ExtraFixedCosts = slices.Clone(profitAnalyticsSetting.ExtraFixedCosts)
	return copied.Normalized()
}

func cloneProfitChannelCostMap(source map[string]ProfitChannelCostConfig) map[string]ProfitChannelCostConfig {
	result := make(map[string]ProfitChannelCostConfig, len(source))
	for key, item := range source {
		cloned := item
		if item.CostRatio != nil {
			val := *item.CostRatio
			cloned.CostRatio = &val
		}
		if item.UpstreamValue != nil {
			val := *item.UpstreamValue
			cloned.UpstreamValue = &val
		}
		if item.PlatformValue != nil {
			val := *item.PlatformValue
			cloned.PlatformValue = &val
		}
		result[key] = cloned
	}
	return result
}

func (setting ProfitAnalyticsSetting) Normalized() ProfitAnalyticsSetting {
	out := ProfitAnalyticsSetting{
		ExcludeAdminUsers: setting.ExcludeAdminUsers,
		DefaultCostRatio:  setting.DefaultCostRatio,
		PaymentFeeRate:    setting.PaymentFeeRate,
		PaymentFeeRates:   make(map[string]float64, len(setting.PaymentFeeRates)),
		ChannelCosts:      make(map[string]ProfitChannelCostConfig, len(setting.ChannelCosts)),
		ExtraFixedCosts:   make([]ProfitFixedCostItem, 0, len(setting.ExtraFixedCosts)),
	}
	if math.IsNaN(out.DefaultCostRatio) || math.IsInf(out.DefaultCostRatio, 0) || out.DefaultCostRatio < 0 {
		out.DefaultCostRatio = DefaultProfitCostRatio
	}
	if math.IsNaN(out.PaymentFeeRate) || math.IsInf(out.PaymentFeeRate, 0) || out.PaymentFeeRate < 0 {
		out.PaymentFeeRate = 0
	}
	for rawMethod, rate := range setting.PaymentFeeRates {
		method := strings.ToLower(strings.TrimSpace(rawMethod))
		if method == "" || math.IsNaN(rate) || math.IsInf(rate, 0) {
			continue
		}
		out.PaymentFeeRates[method] = rate
	}
	for rawChannelID, item := range setting.ChannelCosts {
		channelID := strings.TrimSpace(rawChannelID)
		if channelID == "" {
			continue
		}
		normalized := ProfitChannelCostConfig{
			MonthlyFixedCost: item.MonthlyFixedCost,
			Note:             strings.TrimSpace(item.Note),
		}
		if len(normalized.Note) > 255 {
			normalized.Note = normalized.Note[:255]
		}
		mode := strings.ToLower(strings.TrimSpace(item.PricingMode))
		if (mode == ProfitPricingModeRatio || mode == ProfitPricingModeUnitPrice) &&
			item.UpstreamValue != nil && item.PlatformValue != nil &&
			!math.IsNaN(*item.UpstreamValue) && !math.IsInf(*item.UpstreamValue, 0) && *item.UpstreamValue >= 0 &&
			!math.IsNaN(*item.PlatformValue) && !math.IsInf(*item.PlatformValue, 0) && *item.PlatformValue > 0 {
			upstream := math.Round(*item.UpstreamValue*1e6) / 1e6
			platform := math.Round(*item.PlatformValue*1e6) / 1e6
			derived := math.Round((upstream/platform)*1e6) / 1e6
			normalized.PricingMode = mode
			normalized.UpstreamValue = &upstream
			normalized.PlatformValue = &platform
			normalized.CostRatio = &derived
		} else {
			if mode == ProfitPricingModePercent {
				normalized.PricingMode = ""
			}
			if item.CostRatio != nil {
				ratio := *item.CostRatio
				normalized.CostRatio = &ratio
			}
		}
		if normalized.CostRatio == nil && normalized.MonthlyFixedCost == 0 && normalized.Note == "" {
			continue
		}
		out.ChannelCosts[channelID] = normalized
	}
	for idx, item := range setting.ExtraFixedCosts {
		name := strings.TrimSpace(item.Name)
		if name == "" {
			continue
		}
		if len(name) > 120 {
			name = name[:120]
		}
		id := strings.TrimSpace(item.Id)
		if id == "" {
			id = fmt.Sprintf("cost-%d", idx+1)
		}
		category := strings.ToLower(strings.TrimSpace(item.Category))
		switch category {
		case "server", "media", "account_pool", "other":
		default:
			category = "other"
		}
		note := strings.TrimSpace(item.Note)
		if len(note) > 255 {
			note = note[:255]
		}
		out.ExtraFixedCosts = append(out.ExtraFixedCosts, ProfitFixedCostItem{
			Id:          id,
			Name:        name,
			Category:    category,
			MonthlyCost: item.MonthlyCost,
			Enabled:     item.Enabled,
			Note:        note,
		})
	}
	return out
}

func (setting ProfitAnalyticsSetting) Validate() error {
	if math.IsNaN(setting.DefaultCostRatio) || math.IsInf(setting.DefaultCostRatio, 0) ||
		setting.DefaultCostRatio < 0 || setting.DefaultCostRatio > MaxProfitCostRatio {
		return common.NewMessage("Default upstream cost ratio must be between 0 and 10")
	}
	if math.IsNaN(setting.PaymentFeeRate) || math.IsInf(setting.PaymentFeeRate, 0) ||
		setting.PaymentFeeRate < 0 || setting.PaymentFeeRate > 1 {
		return common.NewMessage("Payment fee rate must be between 0 and 1")
	}
	for method, rate := range setting.PaymentFeeRates {
		if strings.TrimSpace(method) == "" {
			continue
		}
		if math.IsNaN(rate) || math.IsInf(rate, 0) || rate < 0 || rate > 1 {
			return common.NewMessage("Payment fee rate must be between 0 and 1")
		}
	}
	for rawChannelID, item := range setting.ChannelCosts {
		channelID := strings.TrimSpace(rawChannelID)
		if channelID == "" {
			continue
		}
		if parsedID, err := strconv.Atoi(channelID); err != nil || parsedID <= 0 {
			return common.NewMessage("Invalid channel ID in cost configuration")
		}
		mode := strings.ToLower(strings.TrimSpace(item.PricingMode))
		switch mode {
		case "", ProfitPricingModePercent, ProfitPricingModeRatio, ProfitPricingModeUnitPrice:
		default:
			return common.NewMessage("Invalid pricing mode in cost configuration")
		}
		if mode == ProfitPricingModeRatio || mode == ProfitPricingModeUnitPrice {
			if item.UpstreamValue != nil || item.PlatformValue != nil {
				if item.UpstreamValue == nil || item.PlatformValue == nil {
					return common.NewMessage("Both upstream and platform values are required")
				}
				upstream := *item.UpstreamValue
				platform := *item.PlatformValue
				if math.IsNaN(upstream) || math.IsInf(upstream, 0) || upstream < 0 || upstream > MaxProfitFixedCost {
					return common.NewMessage("Upstream ratio or unit price must be non-negative")
				}
				if math.IsNaN(platform) || math.IsInf(platform, 0) || platform <= 0 || platform > MaxProfitFixedCost {
					return common.NewMessage("Platform ratio or unit price must be greater than 0")
				}
				derived := upstream / platform
				if math.IsNaN(derived) || math.IsInf(derived, 0) || derived < 0 || derived > MaxProfitCostRatio {
					return common.NewMessage("Channel cost ratio must be between 0 and 10")
				}
			}
		}
		if item.CostRatio != nil {
			ratio := *item.CostRatio
			if math.IsNaN(ratio) || math.IsInf(ratio, 0) || ratio < 0 || ratio > MaxProfitCostRatio {
				return common.NewMessage("Channel cost ratio must be between 0 and 10")
			}
		}
		if math.IsNaN(item.MonthlyFixedCost) || math.IsInf(item.MonthlyFixedCost, 0) ||
			item.MonthlyFixedCost < 0 || item.MonthlyFixedCost > MaxProfitFixedCost {
			return common.NewMessage("Monthly fixed cost must be non-negative")
		}
	}
	for _, item := range setting.ExtraFixedCosts {
		if strings.TrimSpace(item.Name) == "" {
			continue
		}
		if math.IsNaN(item.MonthlyCost) || math.IsInf(item.MonthlyCost, 0) ||
			item.MonthlyCost < 0 || item.MonthlyCost > MaxProfitFixedCost {
			return common.NewMessage("Monthly fixed cost must be non-negative")
		}
	}
	return nil
}

func (setting ProfitAnalyticsSetting) EffectiveChannelCostRatio(channelID int) (ratio float64, custom bool) {
	if cfg, ok := setting.ChannelCosts[strconv.Itoa(channelID)]; ok && cfg.CostRatio != nil {
		return *cfg.CostRatio, true
	}
	return setting.DefaultCostRatio, false
}

func (setting ProfitAnalyticsSetting) EffectivePaymentFeeRate(method string) float64 {
	normalized := strings.ToLower(strings.TrimSpace(method))
	if normalized == "balance" {
		return 0
	}
	if rate, ok := setting.PaymentFeeRates[normalized]; ok {
		return rate
	}
	return setting.PaymentFeeRate
}

func (setting ProfitAnalyticsSetting) ToOptionMap() (map[string]string, error) {
	cfg := setting.Normalized()
	feeRatesRaw, err := common.Marshal(cfg.PaymentFeeRates)
	if err != nil {
		return nil, err
	}
	channelCostsRaw, err := common.Marshal(cfg.ChannelCosts)
	if err != nil {
		return nil, err
	}
	fixedCostsRaw, err := common.Marshal(cfg.ExtraFixedCosts)
	if err != nil {
		return nil, err
	}
	return map[string]string{
		"profit_analytics_setting.exclude_admin_users": strconv.FormatBool(cfg.ExcludeAdminUsers),
		"profit_analytics_setting.default_cost_ratio":  strconv.FormatFloat(cfg.DefaultCostRatio, 'f', -1, 64),
		"profit_analytics_setting.payment_fee_rate":    strconv.FormatFloat(cfg.PaymentFeeRate, 'f', -1, 64),
		"profit_analytics_setting.payment_fee_rates":   string(feeRatesRaw),
		"profit_analytics_setting.channel_costs":       string(channelCostsRaw),
		"profit_analytics_setting.extra_fixed_costs":   string(fixedCostsRaw),
	}, nil
}
