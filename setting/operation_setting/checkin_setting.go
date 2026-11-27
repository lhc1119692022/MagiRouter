package operation_setting

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/shopspring/decimal"
)

const (
	CheckinMinQuotaOptionKey          = "checkin_setting.min_quota"
	CheckinMaxQuotaOptionKey          = "checkin_setting.max_quota"
	CheckinAllowedGroupsOptionKey     = "checkin_setting.allowed_groups"
	CheckinTopUpUpgradeRulesOptionKey = "checkin_setting.topup_upgrade_rules"

	MaxCheckinAllowedGroups     = 100
	MaxCheckinTopUpUpgradeRules = 50
	MaxTopUpUpgradeThreshold    = 1_000_000_000.0

	GroupUpgradeMatchModeAll = "all"
	GroupUpgradeMatchModeAny = "any"
)

// TopUpGroupUpgradeRule 累计充值自动升级用户分组规则
type TopUpGroupUpgradeRule struct {
	ThresholdAmount     float64 `json:"threshold_amount,omitempty"`
	UsageThresholdQuota int64   `json:"usage_threshold_quota,omitempty"`
	MatchMode           string  `json:"match_mode,omitempty"`
	TargetGroup         string  `json:"target_group"`
}

func (r TopUpGroupUpgradeRule) HasTopUpCondition() bool {
	return r.ThresholdAmount > 0
}

func (r TopUpGroupUpgradeRule) HasUsageCondition() bool {
	return r.UsageThresholdQuota > 0
}

func (r TopUpGroupUpgradeRule) EffectiveMatchMode() string {
	if strings.EqualFold(strings.TrimSpace(r.MatchMode), GroupUpgradeMatchModeAny) {
		return GroupUpgradeMatchModeAny
	}
	return GroupUpgradeMatchModeAll
}

func (r TopUpGroupUpgradeRule) Matches(totalPaid decimal.Decimal, usedQuota int64) bool {
	hasTopUp := r.HasTopUpCondition()
	hasUsage := r.HasUsageCondition()
	if !hasTopUp && !hasUsage {
		return false
	}
	topUpMatched := hasTopUp && totalPaid.Cmp(decimal.NewFromFloat(r.ThresholdAmount).Round(2)) >= 0
	usageMatched := hasUsage && usedQuota >= r.UsageThresholdQuota
	if hasTopUp && hasUsage {
		if r.EffectiveMatchMode() == GroupUpgradeMatchModeAny {
			return topUpMatched || usageMatched
		}
		return topUpMatched && usageMatched
	}
	if hasTopUp {
		return topUpMatched
	}
	return usageMatched
}

// CheckinSetting 签到功能配置
type CheckinSetting struct {
	Enabled             bool                    `json:"enabled"`               // 是否启用签到功能
	MinQuota            int                     `json:"min_quota"`             // 签到最小额度奖励
	MaxQuota            int                     `json:"max_quota"`             // 签到最大额度奖励
	AllowedGroups       []string                `json:"allowed_groups"`        // 允许签到的用户分组（空表示不限制）
	TopUpUpgradeEnabled bool                    `json:"topup_upgrade_enabled"` // 累计充值达标后是否自动更新用户分组
	TopUpUpgradeRules   []TopUpGroupUpgradeRule `json:"topup_upgrade_rules"`   // 累计充值自动升级分组规则
}

// 默认配置
var checkinSetting = CheckinSetting{
	Enabled:             false, // 默认关闭
	MinQuota:            1000,  // 默认最小额度 1000 (约 0.002 USD)
	MaxQuota:            10000, // 默认最大额度 10000 (约 0.02 USD)
	AllowedGroups:       []string{},
	TopUpUpgradeEnabled: false,
	TopUpUpgradeRules:   []TopUpGroupUpgradeRule{},
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("checkin_setting", &checkinSetting)
}

// GetCheckinSetting 获取签到配置
func GetCheckinSetting() *CheckinSetting {
	return &checkinSetting
}

// IsCheckinEnabled 是否启用签到功能
func IsCheckinEnabled() bool {
	return checkinSetting.Enabled
}

// GetCheckinQuotaRange 获取签到额度范围
func GetCheckinQuotaRange() (min, max int) {
	return checkinSetting.MinQuota, checkinSetting.MaxQuota
}

// NormalizedAllowedGroups 返回去重并裁剪后的允许签到分组列表
func (s *CheckinSetting) NormalizedAllowedGroups() []string {
	if s == nil || len(s.AllowedGroups) == 0 {
		return []string{}
	}
	result := make([]string, 0, len(s.AllowedGroups))
	seen := make(map[string]struct{}, len(s.AllowedGroups))
	for _, raw := range s.AllowedGroups {
		group := strings.TrimSpace(raw)
		if group == "" {
			continue
		}
		if _, exists := seen[group]; exists {
			continue
		}
		seen[group] = struct{}{}
		result = append(result, group)
	}
	return result
}

// IsGroupAllowed 判断指定用户分组是否允许签到（未配置限制时全部允许）
func (s *CheckinSetting) IsGroupAllowed(group string) bool {
	allowed := s.NormalizedAllowedGroups()
	if len(allowed) == 0 {
		return true
	}
	normalizedGroup := strings.TrimSpace(group)
	if normalizedGroup == "" {
		normalizedGroup = "default"
	}
	for _, item := range allowed {
		if item == normalizedGroup {
			return true
		}
	}
	return false
}

// NormalizedTopUpUpgradeRules 返回有效且按阈值升序排列的充值升级规则
func (s *CheckinSetting) NormalizedTopUpUpgradeRules() []TopUpGroupUpgradeRule {
	if s == nil || len(s.TopUpUpgradeRules) == 0 {
		return []TopUpGroupUpgradeRule{}
	}
	result := make([]TopUpGroupUpgradeRule, 0, len(s.TopUpUpgradeRules))
	allTopUpOnly := true
	allUsageOnly := true
	for _, rule := range s.TopUpUpgradeRules {
		target := strings.TrimSpace(rule.TargetGroup)
		if target == "" {
			continue
		}
		var roundedTopUp float64
		if !math.IsNaN(rule.ThresholdAmount) && !math.IsInf(rule.ThresholdAmount, 0) && rule.ThresholdAmount > 0 {
			roundedTopUp = decimal.NewFromFloat(rule.ThresholdAmount).Round(2).InexactFloat64()
			if roundedTopUp < 0 {
				roundedTopUp = 0
			}
		}
		usageQuota := rule.UsageThresholdQuota
		if usageQuota < 0 {
			usageQuota = 0
		}
		if roundedTopUp <= 0 && usageQuota <= 0 {
			continue
		}
		matchMode := ""
		if roundedTopUp > 0 && usageQuota > 0 {
			matchMode = rule.EffectiveMatchMode()
			allTopUpOnly = false
			allUsageOnly = false
		} else if roundedTopUp > 0 {
			allUsageOnly = false
		} else {
			allTopUpOnly = false
		}
		result = append(result, TopUpGroupUpgradeRule{
			ThresholdAmount:     roundedTopUp,
			UsageThresholdQuota: usageQuota,
			MatchMode:           matchMode,
			TargetGroup:         target,
		})
	}
	if allTopUpOnly {
		sort.SliceStable(result, func(i, j int) bool {
			return result[i].ThresholdAmount < result[j].ThresholdAmount
		})
	} else if allUsageOnly {
		sort.SliceStable(result, func(i, j int) bool {
			return result[i].UsageThresholdQuota < result[j].UsageThresholdQuota
		})
	}
	return result
}

func (s *CheckinSetting) HasUsageUpgradeRules() bool {
	if s == nil || !s.TopUpUpgradeEnabled || len(s.TopUpUpgradeRules) == 0 {
		return false
	}
	for _, rule := range s.TopUpUpgradeRules {
		if strings.TrimSpace(rule.TargetGroup) != "" && rule.UsageThresholdQuota > 0 {
			return true
		}
	}
	return false
}

// ValidateCheckinOption 校验签到与累计充值分组升级配置项
func ValidateCheckinOption(key, value string) error {
	switch key {
	case CheckinMinQuotaOptionKey, CheckinMaxQuotaOptionKey:
		trimmed := strings.TrimSpace(value)
		parsedFloat, err := strconv.ParseFloat(trimmed, 64)
		if err != nil || math.IsNaN(parsedFloat) || math.IsInf(parsedFloat, 0) || parsedFloat < 0 || parsedFloat > float64(common.MaxWalletQuota) {
			return common.NewMessage("Check-in quota must be a non-negative number")
		}
	case CheckinAllowedGroupsOptionKey:
		var groups []string
		if err := common.UnmarshalJsonStr(value, &groups); err != nil {
			return common.NewMessage("Allowed check-in groups must be a valid JSON string array")
		}
		if len(groups) > MaxCheckinAllowedGroups {
			return common.NewMessage("Allowed check-in groups cannot exceed {{max}} entries", map[string]any{"max": MaxCheckinAllowedGroups})
		}
		for _, raw := range groups {
			group := strings.TrimSpace(raw)
			if group == "" || utf8.RuneCountInString(group) > 64 {
				return common.NewMessage("Allowed check-in group name is invalid")
			}
		}
	case CheckinTopUpUpgradeRulesOptionKey:
		var rules []TopUpGroupUpgradeRule
		if err := common.UnmarshalJsonStr(value, &rules); err != nil {
			return common.NewMessage("Top-up group upgrade rules must be a valid JSON array")
		}
		if len(rules) > MaxCheckinTopUpUpgradeRules {
			return common.NewMessage("Top-up group upgrade rules cannot exceed {{max}} entries", map[string]any{"max": MaxCheckinTopUpUpgradeRules})
		}
		seenConditions := make(map[string]struct{}, len(rules))
		for _, rule := range rules {
			if math.IsNaN(rule.ThresholdAmount) || math.IsInf(rule.ThresholdAmount, 0) || rule.ThresholdAmount < 0 || rule.ThresholdAmount > MaxTopUpUpgradeThreshold {
				return common.NewMessage("Top-up group upgrade threshold must be greater than 0")
			}
			if rule.UsageThresholdQuota < 0 || rule.UsageThresholdQuota > int64(common.MaxWalletQuota) {
				return common.NewMessage("Usage group upgrade threshold is invalid")
			}
			var roundedTopUp float64
			if rule.ThresholdAmount > 0 {
				roundedTopUp = decimal.NewFromFloat(rule.ThresholdAmount).Round(2).InexactFloat64()
			}
			if roundedTopUp <= 0 && rule.UsageThresholdQuota <= 0 {
				return common.NewMessage("Each group upgrade rule must set a top-up or usage threshold greater than 0")
			}
			trimmedMode := strings.ToLower(strings.TrimSpace(rule.MatchMode))
			if trimmedMode != "" && trimmedMode != GroupUpgradeMatchModeAll && trimmedMode != GroupUpgradeMatchModeAny {
				return common.NewMessage("Group upgrade rule match mode is invalid")
			}
			target := strings.TrimSpace(rule.TargetGroup)
			if target == "" || utf8.RuneCountInString(target) > 64 {
				return common.NewMessage("Top-up group upgrade target group is invalid")
			}
			effectiveMode := ""
			if roundedTopUp > 0 && rule.UsageThresholdQuota > 0 {
				effectiveMode = rule.EffectiveMatchMode()
			}
			conditionKey := fmt.Sprintf("%s|%d|%s", decimal.NewFromFloat(roundedTopUp).Round(2).StringFixed(2), rule.UsageThresholdQuota, effectiveMode)
			if _, exists := seenConditions[conditionKey]; exists {
				return common.NewMessage("Group upgrade rule conditions must be unique")
			}
			seenConditions[conditionKey] = struct{}{}
		}
	}
	return nil
}
