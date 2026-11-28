package model

import (
	"maps"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	groupSpecialUsableGroupOptionKey = "group_ratio_setting.group_special_usable_group"
	mediaRelayGroupDailyBonusKey     = "media_relay_setting.group_daily_bonus_mb"
	maxGroupNameRunes                = 64
)

type GroupRenameImpact struct {
	OldName          string   `json:"old_name"`
	NewName          string   `json:"new_name"`
	DryRun           bool     `json:"dry_run"`
	Channels         int      `json:"channels"`
	Users            int64    `json:"users"`
	Tokens           int64    `json:"tokens"`
	Subscriptions    int64    `json:"subscriptions"`
	ModelGroupPrices int      `json:"model_group_prices"`
	UpdatedOptions   []string `json:"updated_options"`
}

func isReservedGroupName(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	return lower == ratio_setting.DefaultGroupName || lower == "auto" || lower == "all"
}

func validateTargetGroupName(name string) error {
	if name == "" {
		return common.NewMessage("Group name cannot be empty")
	}
	if utf8.RuneCountInString(name) > maxGroupNameRunes {
		return common.NewMessage("Group name must be 64 characters or fewer")
	}
	if strings.Contains(name, ",") || strings.Contains(name, "::") {
		return common.NewMessage("Group name cannot contain commas or '::'")
	}
	for _, r := range name {
		if unicode.IsControl(r) {
			return common.NewMessage("Group name contains invalid control characters")
		}
	}
	return nil
}

func renameCommaSeparatedGroups(raw, oldName, newName string) (string, bool) {
	parts := strings.Split(raw, ",")
	changed := false
	result := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, rawPart := range parts {
		part := strings.TrimSpace(rawPart)
		if part == "" {
			continue
		}
		if part == oldName {
			part = newName
			changed = true
		}
		if _, exists := seen[part]; exists {
			continue
		}
		seen[part] = struct{}{}
		result = append(result, part)
	}
	if !changed {
		return raw, false
	}
	return strings.Join(result, ","), true
}

func renameStringSlice(items []string, oldName, newName string) ([]string, bool) {
	changed := false
	result := make([]string, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, raw := range items {
		item := strings.TrimSpace(raw)
		if item == "" {
			continue
		}
		if item == oldName {
			item = newName
			changed = true
		}
		if _, exists := seen[item]; exists {
			continue
		}
		seen[item] = struct{}{}
		result = append(result, item)
	}
	if !changed {
		return items, false
	}
	return result, true
}

func renameMapKey[V any](source map[string]V, oldName, newName string) (map[string]V, bool) {
	value, exists := source[oldName]
	if !exists {
		return source, false
	}
	updated := maps.Clone(source)
	delete(updated, oldName)
	if _, targetExists := updated[newName]; !targetExists {
		updated[newName] = value
	}
	return updated, true
}

func renameNestedMapKeys[V any](source map[string]map[string]V, oldName, newName string) (map[string]map[string]V, bool) {
	changed := false
	updated := make(map[string]map[string]V, len(source))
	for outerKey, innerMap := range source {
		nextOuter := outerKey
		if outerKey == oldName {
			nextOuter = newName
			changed = true
		}
		nextInner := make(map[string]V, len(innerMap))
		for innerKey, val := range innerMap {
			nextInnerKey := innerKey
			if innerKey == oldName {
				nextInnerKey = newName
				changed = true
			}
			if _, exists := nextInner[nextInnerKey]; !exists {
				nextInner[nextInnerKey] = val
			}
		}
		if existing, exists := updated[nextOuter]; exists {
			for innerKey, val := range nextInner {
				if _, dup := existing[innerKey]; !dup {
					existing[innerKey] = val
				}
			}
		} else {
			updated[nextOuter] = nextInner
		}
	}
	if !changed {
		return source, false
	}
	return updated, true
}

func loadOptionMapForGroupRename(tx *gorm.DB) (map[string]string, error) {
	keys := []string{
		GroupRatioOptionKey,
		GroupRatioSettingGroupRatioKey,
		"TopupGroupRatio",
		UserUsableGroupsOptionKey,
		UserManagementGroupsOptionKey,
		"GroupGroupRatio",
		groupSpecialUsableGroupOptionKey,
		"AutoGroups",
		setting.SmartRoutingConfigOptionKey,
		billing_setting.GroupBillingExprOption,
		"UserConcurrencyLimitGroup",
		operation_setting.CheckinAllowedGroupsOptionKey,
		operation_setting.CheckinTopUpUpgradeRulesOptionKey,
		mediaRelayGroupDailyBonusKey,
		console_setting.PricingFilterOrderOption,
		console_setting.ChannelStatusGroupOrderOption,
	}
	var rows []Option
	if tx.Migrator().HasTable(&Option{}) {
		if err := tx.Where(clause.IN{Column: clause.Column{Name: "key"}, Values: toAnySlice(keys)}).Find(&rows).Error; err != nil {
			return nil, err
		}
	}
	result := make(map[string]string, len(rows))
	for _, row := range rows {
		result[row.Key] = row.Value
	}
	return result, nil
}

func toAnySlice(items []string) []any {
	values := make([]any, len(items))
	for index, item := range items {
		values[index] = item
	}
	return values
}

func computeGroupRenameOptionUpdates(stored map[string]string, oldName, newName string) (map[string]string, int, bool, bool, error) {
	updates := make(map[string]string)
	oldExists := false
	newExists := false

	groupRatio := ratio_setting.GetGroupRatioCopy()
	if raw, ok := stored[GroupRatioOptionKey]; ok && strings.TrimSpace(raw) != "" {
		parsed, err := ratio_setting.ParseGroupRatio(raw)
		if err != nil {
			return nil, 0, false, false, err
		}
		groupRatio = parsed
	} else if raw, ok := stored[GroupRatioSettingGroupRatioKey]; ok && strings.TrimSpace(raw) != "" {
		parsed, err := ratio_setting.ParseGroupRatio(raw)
		if err != nil {
			return nil, 0, false, false, err
		}
		groupRatio = parsed
	}
	if _, ok := groupRatio[oldName]; ok {
		oldExists = true
	}
	if _, ok := groupRatio[newName]; ok {
		newExists = true
	}
	if next, changed := renameMapKey(groupRatio, oldName, newName); changed {
		encoded, err := common.Marshal(next)
		if err != nil {
			return nil, 0, false, false, err
		}
		updates[GroupRatioOptionKey] = string(encoded)
		if _, hasLegacy := stored[GroupRatioSettingGroupRatioKey]; hasLegacy {
			updates[GroupRatioSettingGroupRatioKey] = string(encoded)
		}
	}

	userMgmt := ratio_setting.GetUserManagementGroupsCopy()
	if raw, ok := stored[UserManagementGroupsOptionKey]; ok && strings.TrimSpace(raw) != "" {
		parsed, err := ratio_setting.ParseUserManagementGroups(raw)
		if err != nil {
			return nil, 0, false, false, err
		}
		userMgmt = parsed
	}
	if _, ok := userMgmt[oldName]; ok {
		oldExists = true
	}
	if _, ok := userMgmt[newName]; ok {
		newExists = true
	}
	if next, changed := renameMapKey(userMgmt, oldName, newName); changed {
		encoded, err := common.Marshal(next)
		if err != nil {
			return nil, 0, false, false, err
		}
		updates[UserManagementGroupsOptionKey] = string(encoded)
	}

	usableGroups := setting.GetUserUsableGroupsCopy()
	if raw, ok := stored[UserUsableGroupsOptionKey]; ok && strings.TrimSpace(raw) != "" {
		var parsed map[string]string
		if err := common.UnmarshalJsonStr(raw, &parsed); err != nil {
			return nil, 0, false, false, err
		}
		if parsed != nil {
			usableGroups = parsed
		}
	}
	if _, ok := usableGroups[oldName]; ok {
		oldExists = true
	}
	if _, ok := usableGroups[newName]; ok {
		newExists = true
	}
	if next, changed := renameMapKey(usableGroups, oldName, newName); changed {
		encoded, err := common.Marshal(next)
		if err != nil {
			return nil, 0, false, false, err
		}
		updates[UserUsableGroupsOptionKey] = string(encoded)
	}

	var topupRatio map[string]float64
	rawTopup := stored["TopupGroupRatio"]
	if strings.TrimSpace(rawTopup) == "" {
		rawTopup = common.TopupGroupRatio2JSONString()
	}
	if strings.TrimSpace(rawTopup) != "" {
		if err := common.UnmarshalJsonStr(rawTopup, &topupRatio); err != nil {
			return nil, 0, false, false, err
		}
	}
	if topupRatio != nil {
		if _, ok := topupRatio[oldName]; ok {
			oldExists = true
		}
		if _, ok := topupRatio[newName]; ok {
			newExists = true
		}
		if next, changed := renameMapKey(topupRatio, oldName, newName); changed {
			encoded, err := common.Marshal(next)
			if err != nil {
				return nil, 0, false, false, err
			}
			updates["TopupGroupRatio"] = string(encoded)
		}
	}

	var groupGroupRatio map[string]map[string]float64
	rawGGR := stored["GroupGroupRatio"]
	if strings.TrimSpace(rawGGR) == "" {
		rawGGR = ratio_setting.GroupGroupRatio2JSONString()
	}
	if strings.TrimSpace(rawGGR) != "" {
		if err := common.UnmarshalJsonStr(rawGGR, &groupGroupRatio); err != nil {
			return nil, 0, false, false, err
		}
	}
	if len(groupGroupRatio) > 0 {
		if next, changed := renameNestedMapKeys(groupGroupRatio, oldName, newName); changed {
			encoded, err := common.Marshal(next)
			if err != nil {
				return nil, 0, false, false, err
			}
			updates["GroupGroupRatio"] = string(encoded)
		}
	}

	var specialUsable map[string]map[string]string
	if raw, ok := stored[groupSpecialUsableGroupOptionKey]; ok && strings.TrimSpace(raw) != "" {
		if err := common.UnmarshalJsonStr(raw, &specialUsable); err != nil {
			return nil, 0, false, false, err
		}
	} else {
		specialUsable = ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.ReadAll()
	}
	if len(specialUsable) > 0 {
		if next, changed := renameNestedMapKeys(specialUsable, oldName, newName); changed {
			encoded, err := common.Marshal(next)
			if err != nil {
				return nil, 0, false, false, err
			}
			updates[groupSpecialUsableGroupOptionKey] = string(encoded)
		}
	}

	autoGroups := setting.GetAutoGroups()
	if raw, ok := stored["AutoGroups"]; ok && strings.TrimSpace(raw) != "" {
		var parsed []string
		if err := common.UnmarshalJsonStr(raw, &parsed); err != nil {
			return nil, 0, false, false, err
		}
		autoGroups = parsed
	}
	if next, changed := renameStringSlice(autoGroups, oldName, newName); changed {
		encoded, err := common.Marshal(next)
		if err != nil {
			return nil, 0, false, false, err
		}
		updates["AutoGroups"] = string(encoded)
	}

	smartCfg := setting.GetSmartRoutingConfig()
	if raw, ok := stored[setting.SmartRoutingConfigOptionKey]; ok && strings.TrimSpace(raw) != "" {
		parsed, err := setting.ParseSmartRoutingConfigJSON(raw)
		if err != nil {
			return nil, 0, false, false, err
		}
		smartCfg = parsed
	}
	nextExcluded, changedEx := renameStringSlice(smartCfg.ExcludedGroups, oldName, newName)
	nextPinned, changedPin := renameStringSlice(smartCfg.PinnedGroups, oldName, newName)
	nextDemoted, changedDem := renameStringSlice(smartCfg.DemotedGroups, oldName, newName)
	if changedEx || changedPin || changedDem {
		smartCfg.ExcludedGroups = nextExcluded
		smartCfg.PinnedGroups = nextPinned
		smartCfg.DemotedGroups = nextDemoted
		encoded, err := common.Marshal(smartCfg)
		if err != nil {
			return nil, 0, false, false, err
		}
		updates[setting.SmartRoutingConfigOptionKey] = string(encoded)
	}

	groupBillingExprs := billing_setting.GetGroupBillingExprCopy()
	if raw, ok := stored[billing_setting.GroupBillingExprOption]; ok && strings.TrimSpace(raw) != "" {
		var parsed map[string]string
		if err := common.UnmarshalJsonStr(raw, &parsed); err != nil {
			return nil, 0, false, false, err
		}
		groupBillingExprs = parsed
	}
	modelGroupPriceCount := 0
	if len(groupBillingExprs) > 0 {
		nextExprs := make(map[string]string, len(groupBillingExprs))
		for key, expr := range groupBillingExprs {
			group, modelName, valid := billing_setting.SplitGroupBillingExprKey(key)
			if valid && group == oldName {
				targetKey := billing_setting.GroupBillingExprKey(newName, modelName)
				if _, exists := nextExprs[targetKey]; !exists {
					nextExprs[targetKey] = expr
				}
				modelGroupPriceCount++
				continue
			}
			nextExprs[key] = expr
		}
		if modelGroupPriceCount > 0 {
			encoded, err := common.Marshal(nextExprs)
			if err != nil {
				return nil, 0, false, false, err
			}
			updates[billing_setting.GroupBillingExprOption] = string(encoded)
		}
	}

	concurrencyLimits := setting.GetUserConcurrencyLimitGroupCopy()
	if raw, ok := stored["UserConcurrencyLimitGroup"]; ok && strings.TrimSpace(raw) != "" {
		var parsed map[string]int
		if err := common.UnmarshalJsonStr(raw, &parsed); err != nil {
			return nil, 0, false, false, err
		}
		concurrencyLimits = parsed
	}
	if next, changed := renameMapKey(concurrencyLimits, oldName, newName); changed {
		encoded, err := common.Marshal(next)
		if err != nil {
			return nil, 0, false, false, err
		}
		updates["UserConcurrencyLimitGroup"] = string(encoded)
	}

	checkinAllowed := operation_setting.GetCheckinSetting().NormalizedAllowedGroups()
	if raw, ok := stored[operation_setting.CheckinAllowedGroupsOptionKey]; ok && strings.TrimSpace(raw) != "" {
		var parsed []string
		if err := common.UnmarshalJsonStr(raw, &parsed); err != nil {
			return nil, 0, false, false, err
		}
		checkinAllowed = parsed
	}
	if next, changed := renameStringSlice(checkinAllowed, oldName, newName); changed {
		encoded, err := common.Marshal(next)
		if err != nil {
			return nil, 0, false, false, err
		}
		updates[operation_setting.CheckinAllowedGroupsOptionKey] = string(encoded)
	}

	upgradeRules := operation_setting.GetCheckinSetting().NormalizedTopUpUpgradeRules()
	if raw, ok := stored[operation_setting.CheckinTopUpUpgradeRulesOptionKey]; ok && strings.TrimSpace(raw) != "" {
		var parsed []operation_setting.TopUpGroupUpgradeRule
		if err := common.UnmarshalJsonStr(raw, &parsed); err != nil {
			return nil, 0, false, false, err
		}
		upgradeRules = parsed
	}
	if len(upgradeRules) > 0 {
		rulesChanged := false
		nextRules := make([]operation_setting.TopUpGroupUpgradeRule, len(upgradeRules))
		copy(nextRules, upgradeRules)
		for idx := range nextRules {
			if strings.TrimSpace(nextRules[idx].TargetGroup) == oldName {
				nextRules[idx].TargetGroup = newName
				rulesChanged = true
			}
		}
		if rulesChanged {
			encoded, err := common.Marshal(nextRules)
			if err != nil {
				return nil, 0, false, false, err
			}
			updates[operation_setting.CheckinTopUpUpgradeRulesOptionKey] = string(encoded)
		}
	}

	mediaBonus := operation_setting.GetMediaRelaySettingSnapshot().GroupDailyBonusMB
	if raw, ok := stored[mediaRelayGroupDailyBonusKey]; ok && strings.TrimSpace(raw) != "" {
		var parsed map[string]int
		if err := common.UnmarshalJsonStr(raw, &parsed); err != nil {
			return nil, 0, false, false, err
		}
		mediaBonus = parsed
	}
	if next, changed := renameMapKey(mediaBonus, oldName, newName); changed {
		encoded, err := common.Marshal(next)
		if err != nil {
			return nil, 0, false, false, err
		}
		updates[mediaRelayGroupDailyBonusKey] = string(encoded)
	}

	pricingFilterOrder := console_setting.GetPricingFilterOrder()
	if raw, ok := stored[console_setting.PricingFilterOrderOption]; ok && strings.TrimSpace(raw) != "" {
		var parsed console_setting.PricingFilterOrder
		if err := common.UnmarshalJsonStr(raw, &parsed); err != nil {
			return nil, 0, false, false, err
		}
		pricingFilterOrder = parsed
	}
	if nextGroups, changed := renameStringSlice(pricingFilterOrder.Groups, oldName, newName); changed {
		pricingFilterOrder.Groups = nextGroups
		encoded, err := common.Marshal(pricingFilterOrder)
		if err != nil {
			return nil, 0, false, false, err
		}
		updates[console_setting.PricingFilterOrderOption] = string(encoded)
	}

	statusGroupOrder := console_setting.GetChannelStatusGroupOrder()
	if raw, ok := stored[console_setting.ChannelStatusGroupOrderOption]; ok && strings.TrimSpace(raw) != "" {
		var parsed []string
		if err := common.UnmarshalJsonStr(raw, &parsed); err != nil {
			return nil, 0, false, false, err
		}
		statusGroupOrder = parsed
	}
	if nextOrder, changed := renameStringSlice(statusGroupOrder, oldName, newName); changed {
		encoded, err := common.Marshal(nextOrder)
		if err != nil {
			return nil, 0, false, false, err
		}
		updates[console_setting.ChannelStatusGroupOrderOption] = string(encoded)
	}

	return updates, modelGroupPriceCount, oldExists, newExists, nil
}

// RenameGroup atomically renames a group across database tables, options, and in-memory caches.
// When dryRun is true, no data is modified and only the impact summary is returned.
func RenameGroup(oldName, newName string, dryRun bool) (GroupRenameImpact, error) {
	oldName = strings.TrimSpace(oldName)
	newName = strings.TrimSpace(newName)

	if oldName == "" || newName == "" {
		return GroupRenameImpact{}, common.NewMessage("Group name cannot be empty")
	}
	if oldName == newName {
		return GroupRenameImpact{}, common.NewMessage("New group name must be different from the current name")
	}
	if isReservedGroupName(oldName) || isReservedGroupName(newName) {
		return GroupRenameImpact{}, common.NewMessage("Reserved group name cannot be renamed")
	}
	if err := validateTargetGroupName(newName); err != nil {
		return GroupRenameImpact{}, err
	}

	groupSettingsOptionMutex.Lock()
	defer groupSettingsOptionMutex.Unlock()
	modelPricingMutationMu.Lock()
	defer modelPricingMutationMu.Unlock()

	impact := GroupRenameImpact{
		OldName: oldName,
		NewName: newName,
		DryRun:  dryRun,
	}

	var optionUpdates map[string]string
	var affectedUserIDs []int
	var affectedTokenKeys []string
	var subscriptionsTouched bool
	var channelsTouched bool

	run := func(tx *gorm.DB) error {
		storedOptions, err := loadOptionMapForGroupRename(tx)
		if err != nil {
			return err
		}
		updates, modelPriceCount, oldExists, newExists, err := computeGroupRenameOptionUpdates(storedOptions, oldName, newName)
		if err != nil {
			return err
		}
		if !oldExists {
			return common.NewMessage("Group does not exist")
		}
		if newExists {
			return common.NewMessage("Target group name already exists")
		}
		if err := validateGroupSettingsOptions(updates); err != nil {
			return err
		}
		impact.ModelGroupPrices = modelPriceCount
		optionKeys := make([]string, 0, len(updates))
		for key := range updates {
			optionKeys = append(optionKeys, key)
		}
		slices.Sort(optionKeys)
		impact.UpdatedOptions = optionKeys
		optionUpdates = updates

		var affectedChannels []*Channel
		if tx.Migrator().HasTable(&Channel{}) {
			var allChannels []*Channel
			if err := tx.Find(&allChannels).Error; err != nil {
				return err
			}
			for _, channel := range allChannels {
				if nextGroup, changed := renameCommaSeparatedGroups(channel.Group, oldName, newName); changed {
					channel.Group = nextGroup
					affectedChannels = append(affectedChannels, channel)
				}
			}
		}
		impact.Channels = len(affectedChannels)

		if tx.Migrator().HasTable(&User{}) {
			if err := tx.Model(&User{}).
				Where(clause.Eq{Column: clause.Column{Name: "group"}, Value: oldName}).
				Pluck("id", &affectedUserIDs).Error; err != nil {
				return err
			}
			impact.Users = int64(len(affectedUserIDs))
		}

		var directTokens []Token
		var autoGroupTokens []Token
		tokenKeySet := make(map[string]struct{})
		if tx.Migrator().HasTable(&Token{}) {
			if err := tx.Select("id", "key", "group", "auto_groups").
				Where(clause.Eq{Column: clause.Column{Name: "group"}, Value: oldName}).
				Find(&directTokens).Error; err != nil {
				return err
			}
			for _, tok := range directTokens {
				tokenKeySet[tok.Key] = struct{}{}
			}

			var candidates []Token
			if err := tx.Select("id", "key", "group", "auto_groups").
				Where("auto_groups <> '' AND auto_groups LIKE ?", "%"+oldName+"%").
				Find(&candidates).Error; err != nil {
				return err
			}
			for _, tok := range candidates {
				parsed, parseErr := tok.GetAutoGroups()
				if parseErr != nil || len(parsed) == 0 {
					continue
				}
				if nextAuto, changed := renameStringSlice(parsed, oldName, newName); changed {
					if setErr := tok.SetAutoGroups(nextAuto); setErr != nil {
						return setErr
					}
					autoGroupTokens = append(autoGroupTokens, tok)
					tokenKeySet[tok.Key] = struct{}{}
				}
			}
		}
		impact.Tokens = int64(len(tokenKeySet))
		for key := range tokenKeySet {
			affectedTokenKeys = append(affectedTokenKeys, key)
		}

		var planCount, userSubCount int64
		hasSubPlan := tx.Migrator().HasTable(&SubscriptionPlan{})
		if hasSubPlan {
			if err := tx.Model(&SubscriptionPlan{}).
				Where("upgrade_group = ? OR downgrade_group = ?", oldName, oldName).
				Count(&planCount).Error; err != nil {
				return err
			}
		}
		hasUserSub := tx.Migrator().HasTable(&UserSubscription{})
		if hasUserSub {
			if err := tx.Model(&UserSubscription{}).
				Where("upgrade_group = ? OR downgrade_group = ? OR prev_user_group = ?", oldName, oldName, oldName).
				Count(&userSubCount).Error; err != nil {
				return err
			}
		}
		impact.Subscriptions = planCount + userSubCount

		if dryRun {
			return nil
		}

		hasAbilities := tx.Migrator().HasTable(&Ability{})
		for _, channel := range affectedChannels {
			if err := tx.Model(&Channel{}).Where("id = ?", channel.Id).Update("group", channel.Group).Error; err != nil {
				return err
			}
			if hasAbilities {
				if err := channel.UpdateAbilities(tx); err != nil {
					return err
				}
			}
			channelsTouched = true
		}
		if hasAbilities {
			var residual []Ability
			if err := tx.Where(clause.Eq{Column: clause.Column{Name: "group"}, Value: oldName}).Find(&residual).Error; err != nil {
				return err
			}
			if len(residual) > 0 {
				if err := tx.Where(clause.Eq{Column: clause.Column{Name: "group"}, Value: oldName}).Delete(&Ability{}).Error; err != nil {
					return err
				}
				for idx := range residual {
					residual[idx].Group = newName
				}
				if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&residual).Error; err != nil {
					return err
				}
				channelsTouched = true
			}
		}

		if len(affectedUserIDs) > 0 {
			if err := tx.Model(&User{}).
				Where(clause.Eq{Column: clause.Column{Name: "group"}, Value: oldName}).
				Update("group", newName).Error; err != nil {
				return err
			}
		}

		if len(directTokens) > 0 {
			if err := tx.Model(&Token{}).
				Where(clause.Eq{Column: clause.Column{Name: "group"}, Value: oldName}).
				Update("group", newName).Error; err != nil {
				return err
			}
		}
		for _, tok := range autoGroupTokens {
			if err := tx.Model(&Token{}).Where("id = ?", tok.Id).Update("auto_groups", tok.AutoGroups).Error; err != nil {
				return err
			}
		}

		if hasSubPlan && planCount > 0 {
			if err := tx.Model(&SubscriptionPlan{}).Where("upgrade_group = ?", oldName).Update("upgrade_group", newName).Error; err != nil {
				return err
			}
			if err := tx.Model(&SubscriptionPlan{}).Where("downgrade_group = ?", oldName).Update("downgrade_group", newName).Error; err != nil {
				return err
			}
			subscriptionsTouched = true
		}
		if hasUserSub && userSubCount > 0 {
			if err := tx.Model(&UserSubscription{}).Where("upgrade_group = ?", oldName).Update("upgrade_group", newName).Error; err != nil {
				return err
			}
			if err := tx.Model(&UserSubscription{}).Where("downgrade_group = ?", oldName).Update("downgrade_group", newName).Error; err != nil {
				return err
			}
			if err := tx.Model(&UserSubscription{}).Where("prev_user_group = ?", oldName).Update("prev_user_group", newName).Error; err != nil {
				return err
			}
			subscriptionsTouched = true
		}

		for key, value := range updates {
			option := Option{Key: key}
			if err := tx.FirstOrCreate(&option, Option{Key: key}).Error; err != nil {
				return err
			}
			option.Value = value
			if err := tx.Save(&option).Error; err != nil {
				return err
			}
		}
		return nil
	}

	if dryRun {
		if err := run(DB); err != nil {
			return GroupRenameImpact{}, err
		}
		return impact, nil
	}

	if err := DB.Transaction(run); err != nil {
		return GroupRenameImpact{}, err
	}

	for key, value := range optionUpdates {
		_ = updateOptionMap(key, value)
	}
	BumpSyncTopic(SyncTopicOptions)
	if channelsTouched {
		BumpSyncTopic(SyncTopicChannels)
	}
	if subscriptionsTouched {
		BumpSyncTopic(SyncTopicSubscriptionPlans)
	}
	InitChannelCache()
	RefreshPricing()
	InvalidatePricingCache()
	ratio_setting.InvalidateExposedDataCache()
	for _, userID := range affectedUserIDs {
		_ = RefreshUserGroupCache(userID)
	}
	for _, tokenKey := range affectedTokenKeys {
		_ = invalidateTokenCacheForMutation(tokenKey)
	}
	return impact, nil
}
