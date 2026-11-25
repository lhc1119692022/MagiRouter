package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

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

// EvaluateCumulativeTopUpGroupUpgrade checks whether a user's cumulative
// completed top-up total qualifies them for an automatic group upgrade.
// It only upgrades from ""/"default" or a lower-threshold tier group so
// manually assigned special groups (or higher tiers) are never downgraded.
func EvaluateCumulativeTopUpGroupUpgrade(userId int) (upgraded bool, oldGroup string, newGroup string, err error) {
	if userId <= 0 {
		return false, "", "", nil
	}

	setting := operation_setting.GetCheckinSetting()
	common.OptionMapRWMutex.RLock()
	enabled := setting.TopUpUpgradeEnabled
	rules := setting.NormalizedTopUpUpgradeRules()
	common.OptionMapRWMutex.RUnlock()

	if !enabled || len(rules) == 0 {
		return false, "", "", nil
	}

	var matchedTotal decimal.Decimal
	err = DB.Transaction(func(tx *gorm.DB) error {
		totalPaid, qErr := queryUserCumulativeTopUpMoneyTx(tx, userId)
		if qErr != nil {
			return qErr
		}
		matchedTotal = totalPaid

		matchedIdx := -1
		for idx, rule := range rules {
			if totalPaid.Cmp(decimal.NewFromFloat(rule.ThresholdAmount).Round(2)) >= 0 {
				matchedIdx = idx
			}
		}
		if matchedIdx < 0 {
			return nil
		}
		targetRule := rules[matchedIdx]

		currentGroup, gErr := getUserGroupByIdTx(tx, userId)
		if gErr != nil {
			return gErr
		}
		trimmedCurrent := strings.TrimSpace(currentGroup)
		if trimmedCurrent == "" {
			trimmedCurrent = "default"
		}
		if trimmedCurrent == targetRule.TargetGroup {
			return nil
		}

		canUpgrade := trimmedCurrent == "default"
		if !canUpgrade {
			for idx := 0; idx < matchedIdx; idx++ {
				if rules[idx].TargetGroup == trimmedCurrent {
					canUpgrade = true
					break
				}
			}
		}
		if !canUpgrade {
			return nil
		}

		if uErr := tx.Model(&User{}).Where("id = ?", userId).Update("group", targetRule.TargetGroup).Error; uErr != nil {
			return uErr
		}
		upgraded = true
		oldGroup = trimmedCurrent
		newGroup = targetRule.TargetGroup
		return nil
	})
	if err != nil {
		common.SysError(common.LogText("cumulative top-up group upgrade failed for user %d: %s", userId, err.Error()))
		return false, "", "", err
	}
	if !upgraded {
		return false, "", "", nil
	}

	if cacheErr := RefreshUserGroupCache(userId); cacheErr != nil {
		common.SysError(common.LogText("failed to refresh user group cache after top-up upgrade for user %d: %s", userId, cacheErr.Error()))
	}

	RecordLog(userId, LogTypeSystem, common.NewMessage("Cumulative top-up reached {{amount}}, user group upgraded from {{old_group}} to {{new_group}}", map[string]any{
		"amount":    matchedTotal.StringFixed(2),
		"old_group": oldGroup,
		"new_group": newGroup,
	}))
	return true, oldGroup, newGroup, nil
}
