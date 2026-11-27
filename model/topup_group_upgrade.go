package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type userUpgradeSnapshot struct {
	Group     string `gorm:"column:group"`
	UsedQuota int64  `gorm:"column:used_quota"`
}

func queryUserCumulativeTopUpMoneyTx(tx *gorm.DB, userId int) (decimal.Decimal, error) {
	var rows []TopUp
	err := tx.Select("amount", "money", "payment_method", "payment_provider", "status").
		Where("user_id = ? AND amount > 0 AND status = ?", userId, common.TopUpStatusSuccess).
		Find(&rows).Error
	if err != nil {
		return decimal.Zero, err
	}

	total := decimal.Zero
	for _, row := range rows {
		amount := topUpRecordedPayMoney(row)
		if amount.IsPositive() {
			total = total.Add(amount)
		}
	}
	return total.Round(2), nil
}

func queryUserUpgradeSnapshotTx(tx *gorm.DB, userId int, lock bool) (userUpgradeSnapshot, bool, error) {
	query := tx
	if lock {
		query = lockForUpdate(tx)
	}
	var snapshot userUpgradeSnapshot
	res := query.Model(&User{}).Where("id = ?", userId).Select(commonGroupCol + ", used_quota").Limit(1).Find(&snapshot)
	if res.Error != nil {
		return userUpgradeSnapshot{}, false, res.Error
	}
	if res.RowsAffected == 0 {
		return userUpgradeSnapshot{}, false, nil
	}
	return snapshot, true, nil
}

func normalizeUpgradeGroupName(group string) string {
	trimmed := strings.TrimSpace(group)
	if trimmed == "" {
		return "default"
	}
	return trimmed
}

func resolveUpgradeTierStart(rules []operation_setting.TopUpGroupUpgradeRule, currentGroup string) (int, bool) {
	trimmedCurrent := normalizeUpgradeGroupName(currentGroup)
	if trimmedCurrent == "default" {
		return 0, true
	}
	for idx, rule := range rules {
		if rule.TargetGroup == trimmedCurrent {
			if idx+1 >= len(rules) {
				return 0, false
			}
			return idx + 1, true
		}
	}
	return 0, false
}

func hasUpgradeCandidateFromSnapshot(
	rules []operation_setting.TopUpGroupUpgradeRule,
	currentGroup string,
	usedQuota int64,
	usageTriggerOnly bool,
) bool {
	minUpgradeIdx, eligible := resolveUpgradeTierStart(rules, currentGroup)
	if !eligible {
		return false
	}
	trimmedCurrent := normalizeUpgradeGroupName(currentGroup)
	for idx := minUpgradeIdx; idx < len(rules); idx++ {
		rule := rules[idx]
		if rule.TargetGroup == trimmedCurrent {
			continue
		}
		if usageTriggerOnly && !rule.HasUsageCondition() {
			continue
		}
		if !rule.HasTopUpCondition() {
			if usedQuota >= rule.UsageThresholdQuota {
				return true
			}
			continue
		}
		if !rule.HasUsageCondition() {
			return true
		}
		if rule.EffectiveMatchMode() == operation_setting.GroupUpgradeMatchModeAny {
			if usedQuota >= rule.UsageThresholdQuota || !usageTriggerOnly {
				return true
			}
			continue
		}
		if usedQuota >= rule.UsageThresholdQuota {
			return true
		}
	}
	return false
}

// EvaluateCumulativeTopUpGroupUpgrade checks whether a user's cumulative
// completed top-up and/or usage totals qualify them for an automatic group upgrade.
// It only upgrades from ""/"default" or a lower-threshold tier group so
// manually assigned special groups (or higher tiers) are never downgraded.
func EvaluateCumulativeTopUpGroupUpgrade(userId int) (upgraded bool, oldGroup string, newGroup string, err error) {
	return evaluateUserGroupUpgrade(userId, false)
}

// EvaluateUsageGroupUpgrade checks whether a user's updated cumulative usage
// qualifies them for an automatic group upgrade when usage-based rules exist.
func EvaluateUsageGroupUpgrade(userId int) (upgraded bool, oldGroup string, newGroup string, err error) {
	return evaluateUserGroupUpgrade(userId, true)
}

func evaluateUserGroupUpgrade(userId int, usageTriggerOnly bool) (upgraded bool, oldGroup string, newGroup string, err error) {
	if userId <= 0 || DB == nil {
		return false, "", "", nil
	}

	setting := operation_setting.GetCheckinSetting()
	common.OptionMapRWMutex.RLock()
	enabled := setting.TopUpUpgradeEnabled
	hasUsageRules := setting.HasUsageUpgradeRules()
	rules := setting.NormalizedTopUpUpgradeRules()
	common.OptionMapRWMutex.RUnlock()

	if !enabled || len(rules) == 0 {
		return false, "", "", nil
	}
	if usageTriggerOnly && !hasUsageRules {
		return false, "", "", nil
	}

	preSnapshot, exists, preErr := queryUserUpgradeSnapshotTx(DB, userId, false)
	if preErr != nil {
		common.SysError(common.LogText("user group upgrade pre-check failed for user %d: %s", userId, preErr.Error()))
		return false, "", "", preErr
	}
	if !exists || !hasUpgradeCandidateFromSnapshot(rules, preSnapshot.Group, preSnapshot.UsedQuota, usageTriggerOnly) {
		return false, "", "", nil
	}

	var matchedTotal decimal.Decimal
	var matchedUsedQuota int64
	var matchedRule operation_setting.TopUpGroupUpgradeRule
	err = DB.Transaction(func(tx *gorm.DB) error {
		snapshot, found, qErr := queryUserUpgradeSnapshotTx(tx, userId, true)
		if qErr != nil {
			return qErr
		}
		if !found {
			return nil
		}
		trimmedCurrent := normalizeUpgradeGroupName(snapshot.Group)
		minUpgradeIdx, eligible := resolveUpgradeTierStart(rules, trimmedCurrent)
		if !eligible {
			return nil
		}

		needTopUp := false
		for idx := minUpgradeIdx; idx < len(rules); idx++ {
			rule := rules[idx]
			if rule.TargetGroup == trimmedCurrent || !rule.HasTopUpCondition() {
				continue
			}
			if !rule.HasUsageCondition() ||
				rule.EffectiveMatchMode() == operation_setting.GroupUpgradeMatchModeAny ||
				snapshot.UsedQuota >= rule.UsageThresholdQuota {
				needTopUp = true
				break
			}
		}

		totalPaid := decimal.Zero
		if needTopUp {
			totalPaid, qErr = queryUserCumulativeTopUpMoneyTx(tx, userId)
			if qErr != nil {
				return qErr
			}
		}
		matchedTotal = totalPaid
		matchedUsedQuota = snapshot.UsedQuota

		matchedIdx := -1
		for idx := minUpgradeIdx; idx < len(rules); idx++ {
			rule := rules[idx]
			if rule.TargetGroup == trimmedCurrent {
				continue
			}
			if rule.Matches(totalPaid, snapshot.UsedQuota) {
				matchedIdx = idx
			}
		}
		if matchedIdx < 0 {
			return nil
		}
		targetRule := rules[matchedIdx]

		updateRes := tx.Model(&User{}).
			Where("id = ? AND "+commonGroupCol+" = ?", userId, snapshot.Group).
			Update("group", targetRule.TargetGroup)
		if updateRes.Error != nil {
			return updateRes.Error
		}
		if updateRes.RowsAffected == 0 {
			return nil
		}
		upgraded = true
		oldGroup = trimmedCurrent
		newGroup = targetRule.TargetGroup
		matchedRule = targetRule
		return nil
	})
	if err != nil {
		common.SysError(common.LogText("auto user group upgrade failed for user %d: %s", userId, err.Error()))
		return false, "", "", err
	}
	if !upgraded {
		return false, "", "", nil
	}

	if cacheErr := RefreshUserGroupCache(userId); cacheErr != nil {
		common.SysError(common.LogText("failed to refresh user group cache after auto upgrade for user %d: %s", userId, cacheErr.Error()))
	}

	topUpMatched := matchedRule.HasTopUpCondition() && matchedTotal.Cmp(decimal.NewFromFloat(matchedRule.ThresholdAmount).Round(2)) >= 0
	usageMatched := matchedRule.HasUsageCondition() && matchedUsedQuota >= matchedRule.UsageThresholdQuota
	switch {
	case topUpMatched && usageMatched:
		RecordLog(userId, LogTypeSystem, common.NewMessage("Cumulative top-up reached {{amount}} and usage reached {{usage}}, user group upgraded from {{old_group}} to {{new_group}}", map[string]any{
			"amount":    matchedTotal.StringFixed(2),
			"usage":     logger.FormatQuota(int(matchedUsedQuota)),
			"old_group": oldGroup,
			"new_group": newGroup,
		}))
	case usageMatched:
		RecordLog(userId, LogTypeSystem, common.NewMessage("Cumulative usage reached {{usage}}, user group upgraded from {{old_group}} to {{new_group}}", map[string]any{
			"usage":     logger.FormatQuota(int(matchedUsedQuota)),
			"old_group": oldGroup,
			"new_group": newGroup,
		}))
	default:
		RecordLog(userId, LogTypeSystem, common.NewMessage("Cumulative top-up reached {{amount}}, user group upgraded from {{old_group}} to {{new_group}}", map[string]any{
			"amount":    matchedTotal.StringFixed(2),
			"old_group": oldGroup,
			"new_group": newGroup,
		}))
	}
	return true, oldGroup, newGroup, nil
}
