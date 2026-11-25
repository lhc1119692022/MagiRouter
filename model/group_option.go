package model

import (
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm"
)

const (
	GroupRatioOptionKey            = "GroupRatio"
	GroupRatioSettingGroupRatioKey = "group_ratio_setting.group_ratio"
	UserUsableGroupsOptionKey      = "UserUsableGroups"
	UserManagementGroupsOptionKey  = "group_ratio_setting.user_management_groups"
)

var groupSettingsOptionMutex sync.Mutex

func IsGroupSettingsOption(key string) bool {
	switch key {
	case GroupRatioOptionKey, GroupRatioSettingGroupRatioKey, UserManagementGroupsOptionKey:
		return true
	default:
		return false
	}
}

func hasGroupSettingsOption(values map[string]string) bool {
	for key := range values {
		if IsGroupSettingsOption(key) {
			return true
		}
	}
	return false
}

func validateGroupSettingsOptions(values map[string]string) error {
	if !hasGroupSettingsOption(values) {
		return nil
	}

	var userManagementGroups map[string]string
	if raw, ok := values[UserManagementGroupsOptionKey]; ok {
		parsed, err := ratio_setting.ParseUserManagementGroups(raw)
		if err != nil {
			return err
		}
		userManagementGroups = parsed
	} else {
		userManagementGroups = ratio_setting.GetUserManagementGroupsCopy()
	}

	ratioKeys := make([]string, 0, 2)
	for _, key := range []string{GroupRatioOptionKey, GroupRatioSettingGroupRatioKey} {
		if _, ok := values[key]; ok {
			ratioKeys = append(ratioKeys, key)
		}
	}
	if len(ratioKeys) == 0 {
		return ratio_setting.ValidateGroupSettings(ratio_setting.GetGroupRatioCopy(), userManagementGroups)
	}
	for _, key := range ratioKeys {
		parsed, err := ratio_setting.ParseGroupRatio(values[key])
		if err != nil {
			return err
		}
		if err := ratio_setting.ValidateGroupSettings(parsed, userManagementGroups); err != nil {
			return err
		}
	}
	return nil
}

// EnsureDefaultGroupOptions repairs persisted group options when the default
// group has been deleted or no billing group remains. It runs on startup
// before InitOptionMap so previously emptied databases recover automatically.
func EnsureDefaultGroupOptions() error {
	if DB == nil {
		return errors.New("database is not initialized")
	}

	restored := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		readOption := func(key string) (string, bool, error) {
			var option Option
			err := tx.Where(&Option{Key: key}).First(&option).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return "", false, nil
			}
			if err != nil {
				return "", false, fmt.Errorf("read option %s: %w", key, err)
			}
			return option.Value, true, nil
		}

		groupRatioRaw, hasGroupRatio, err := readOption(GroupRatioOptionKey)
		if err != nil {
			return err
		}
		settingGroupRatioRaw, hasSettingGroupRatio, err := readOption(GroupRatioSettingGroupRatioKey)
		if err != nil {
			return err
		}
		umgRaw, hasUMG, err := readOption(UserManagementGroupsOptionKey)
		if err != nil {
			return err
		}
		if !hasGroupRatio && !hasSettingGroupRatio && !hasUMG {
			return nil
		}

		userManagementGroups := map[string]string{}
		if hasUMG && strings.TrimSpace(umgRaw) != "" {
			parsed, parseErr := ratio_setting.ParseUserManagementGroups(umgRaw)
			if parseErr != nil {
				common.SysError(common.LogText("failed to ensure default group options: %s", parseErr.Error()))
				return nil
			}
			userManagementGroups = parsed
		}

		type ratioTarget struct {
			key    string
			ratios map[string]float64
			dirty  bool
		}
		targets := make([]ratioTarget, 0, 2)
		for _, item := range []struct {
			key     string
			raw     string
			present bool
		}{
			{key: GroupRatioOptionKey, raw: groupRatioRaw, present: hasGroupRatio},
			{key: GroupRatioSettingGroupRatioKey, raw: settingGroupRatioRaw, present: hasSettingGroupRatio},
		} {
			if !item.present {
				continue
			}
			parsed := map[string]float64{}
			if strings.TrimSpace(item.raw) != "" {
				var parseErr error
				parsed, parseErr = ratio_setting.ParseGroupRatio(item.raw)
				if parseErr != nil {
					common.SysError(common.LogText("failed to ensure default group options: %s", parseErr.Error()))
					return nil
				}
			}
			targets = append(targets, ratioTarget{key: item.key, ratios: parsed})
		}
		if len(targets) == 0 {
			targets = append(targets, ratioTarget{
				key:    GroupRatioOptionKey,
				ratios: ratio_setting.DefaultGroupRatioCopy(),
			})
		}

		needsRepair := false
		for _, target := range targets {
			if ratio_setting.ValidateGroupSettings(target.ratios, userManagementGroups) != nil {
				needsRepair = true
				break
			}
		}
		if !needsRepair {
			return nil
		}

		usableRaw, hasUsable, err := readOption(UserUsableGroupsOptionKey)
		if err != nil {
			return err
		}
		userUsableGroups := setting.DefaultUserUsableGroupsCopy()
		if hasUsable {
			userUsableGroups = map[string]string{}
			if strings.TrimSpace(usableRaw) != "" {
				if parseErr := common.UnmarshalJsonStr(usableRaw, &userUsableGroups); parseErr != nil {
					common.SysError(common.LogText("failed to ensure default group options: %s", parseErr.Error()))
					return nil
				}
				if userUsableGroups == nil {
					userUsableGroups = map[string]string{}
				}
			}
		}

		defaultDesc := strings.TrimSpace(userManagementGroups[ratio_setting.DefaultGroupName])
		if defaultDesc == "" {
			defaultDesc = strings.TrimSpace(userUsableGroups[ratio_setting.DefaultGroupName])
		}
		if defaultDesc == "" {
			defaultDesc = setting.DefaultGroupDescription
		}

		umgDirty := false
		if _, inUMG := userManagementGroups[ratio_setting.DefaultGroupName]; inUMG {
			delete(userManagementGroups, ratio_setting.DefaultGroupName)
			umgDirty = true
		}

		for idx := range targets {
			if ratio_setting.ValidateGroupSettings(targets[idx].ratios, userManagementGroups) != nil {
				targets[idx].ratios[ratio_setting.DefaultGroupName] = 1
				targets[idx].dirty = true
			}
		}

		usableDirty := false
		if _, ok := userUsableGroups[ratio_setting.DefaultGroupName]; !ok {
			userUsableGroups[ratio_setting.DefaultGroupName] = defaultDesc
			usableDirty = true
		}

		saveOption := func(key string, value any) error {
			encoded, marshalErr := common.Marshal(value)
			if marshalErr != nil {
				return fmt.Errorf("marshal option %s: %w", key, marshalErr)
			}
			option := Option{Key: key}
			if err := tx.FirstOrCreate(&option, Option{Key: key}).Error; err != nil {
				return fmt.Errorf("create option %s: %w", key, err)
			}
			option.Value = string(encoded)
			if err := tx.Save(&option).Error; err != nil {
				return fmt.Errorf("save option %s: %w", key, err)
			}
			return nil
		}

		if umgDirty {
			if err := saveOption(UserManagementGroupsOptionKey, userManagementGroups); err != nil {
				return err
			}
		}
		for _, target := range targets {
			if !target.dirty {
				continue
			}
			if err := saveOption(target.key, target.ratios); err != nil {
				return err
			}
		}
		if usableDirty {
			if err := saveOption(UserUsableGroupsOptionKey, userUsableGroups); err != nil {
				return err
			}
		}

		restored = true
		return nil
	})
	if err != nil {
		return err
	}
	if restored {
		common.SysLog(common.LogText("restored missing default group in options"))
	}
	return nil
}
