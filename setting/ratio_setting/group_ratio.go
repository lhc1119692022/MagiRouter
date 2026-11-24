package ratio_setting

import (
	"encoding/json"
	"errors"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/types"
)

var defaultGroupRatio = map[string]float64{
	"default": 1,
	"vip":     1,
	"svip":    1,
}

var groupRatioMap = types.NewRWMap[string, float64]()

var defaultGroupGroupRatio = map[string]map[string]float64{
	"vip": {
		"edit_this": 0.9,
	},
}

var groupGroupRatioMap = types.NewRWMap[string, map[string]float64]()

var defaultGroupSpecialUsableGroup = map[string]map[string]string{}

var defaultUserManagementGroups = map[string]string{}

type GroupRatioSetting struct {
	GroupRatio              *types.RWMap[string, float64]            `json:"group_ratio"`
	GroupGroupRatio         *types.RWMap[string, map[string]float64] `json:"group_group_ratio"`
	GroupSpecialUsableGroup *types.RWMap[string, map[string]string]  `json:"group_special_usable_group"`
	UserManagementGroups    *types.RWMap[string, string]             `json:"user_management_groups"`
}

var groupRatioSetting GroupRatioSetting

func init() {
	groupSpecialUsableGroup := types.NewRWMap[string, map[string]string]()
	groupSpecialUsableGroup.AddAll(defaultGroupSpecialUsableGroup)

	userManagementGroups := types.NewRWMap[string, string]()
	userManagementGroups.AddAll(defaultUserManagementGroups)

	groupRatioMap.AddAll(defaultGroupRatio)
	groupGroupRatioMap.AddAll(defaultGroupGroupRatio)

	groupRatioSetting = GroupRatioSetting{
		GroupSpecialUsableGroup: groupSpecialUsableGroup,
		UserManagementGroups:    userManagementGroups,
		GroupRatio:              groupRatioMap,
		GroupGroupRatio:         groupGroupRatioMap,
	}

	config.GlobalConfig.Register("group_ratio_setting", &groupRatioSetting)
}

func GetGroupRatioSetting() *GroupRatioSetting {
	if groupRatioSetting.GroupSpecialUsableGroup == nil {
		groupRatioSetting.GroupSpecialUsableGroup = types.NewRWMap[string, map[string]string]()
		groupRatioSetting.GroupSpecialUsableGroup.AddAll(defaultGroupSpecialUsableGroup)
	}
	if groupRatioSetting.UserManagementGroups == nil {
		groupRatioSetting.UserManagementGroups = types.NewRWMap[string, string]()
		groupRatioSetting.UserManagementGroups.AddAll(defaultUserManagementGroups)
	}
	return &groupRatioSetting
}

func GetGroupRatioCopy() map[string]float64 {
	return groupRatioMap.ReadAll()
}

func ContainsGroupRatio(name string) bool {
	_, ok := groupRatioMap.Get(name)
	return ok
}

func GroupRatio2JSONString() string {
	return groupRatioMap.MarshalJSONString()
}

func UpdateGroupRatioByJSONString(jsonStr string) error {
	return types.LoadFromJsonString(groupRatioMap, jsonStr)
}

func GetGroupRatio(name string) float64 {
	ratio, ok := groupRatioMap.Get(name)
	if !ok {
		common.SysLog(common.LogText("group ratio not found: %s", name))
		return 1
	}
	return ratio
}

func GetGroupGroupRatio(userGroup, usingGroup string) (float64, bool) {
	gp, ok := groupGroupRatioMap.Get(userGroup)
	if !ok {
		return -1, false
	}
	ratio, ok := gp[usingGroup]
	if !ok {
		return -1, false
	}
	return ratio, true
}

func GroupGroupRatio2JSONString() string {
	return groupGroupRatioMap.MarshalJSONString()
}

func UpdateGroupGroupRatioByJSONString(jsonStr string) error {
	return types.LoadFromJsonString(groupGroupRatioMap, jsonStr)
}

func CheckGroupRatio(jsonStr string) error {
	checkGroupRatio := make(map[string]float64)
	err := json.Unmarshal([]byte(jsonStr), &checkGroupRatio)
	if err != nil {
		return err
	}
	for name, ratio := range checkGroupRatio {
		if ratio < 0 {
			return errors.New("group ratio must be not less than 0: " + name)
		}
	}
	return nil
}

func GetUserManagementGroupsCopy() map[string]string {
	return GetGroupRatioSetting().UserManagementGroups.ReadAll()
}

func HasUserManagementGroups() bool {
	return GetGroupRatioSetting().UserManagementGroups.Len() > 0
}

func IsUserManagementGroup(name string) bool {
	if name == "" {
		return false
	}
	_, ok := GetGroupRatioSetting().UserManagementGroups.Get(name)
	return ok
}

func IsBillingGroup(name string) bool {
	if name == "" || name == "auto" {
		return false
	}
	return ContainsGroupRatio(name) && !IsUserManagementGroup(name)
}

func UserManagementGroups2JSONString() string {
	return GetGroupRatioSetting().UserManagementGroups.MarshalJSONString()
}

func UpdateUserManagementGroupsByJSONString(jsonStr string) error {
	parsed, err := parseUserManagementGroups(jsonStr)
	if err != nil {
		return err
	}
	GetGroupRatioSetting().UserManagementGroups.Clear()
	GetGroupRatioSetting().UserManagementGroups.AddAll(parsed)
	return nil
}

func CheckUserManagementGroups(jsonStr string) error {
	_, err := parseUserManagementGroups(jsonStr)
	return err
}

func parseUserManagementGroups(jsonStr string) (map[string]string, error) {
	trimmed := strings.TrimSpace(jsonStr)
	if trimmed == "" {
		return map[string]string{}, nil
	}
	var parsed map[string]string
	if err := json.Unmarshal([]byte(trimmed), &parsed); err != nil {
		return nil, err
	}
	if parsed == nil {
		return map[string]string{}, nil
	}
	cleaned := make(map[string]string, len(parsed))
	for rawName, desc := range parsed {
		name := strings.TrimSpace(rawName)
		if name == "" {
			return nil, errors.New("user management group name cannot be empty")
		}
		if name == "auto" || name == "all" {
			return nil, errors.New("reserved group name cannot be marked as user management only: " + name)
		}
		cleaned[name] = desc
	}
	return cleaned, nil
}

func GetBillingGroupNames() []string {
	ratios := GetGroupRatioCopy()
	names := make([]string, 0, len(ratios))
	for groupName := range ratios {
		if IsUserManagementGroup(groupName) {
			continue
		}
		names = append(names, groupName)
	}
	slices.Sort(names)
	return names
}

func GetAllGroupNames() []string {
	ratios := GetGroupRatioCopy()
	userManaged := GetUserManagementGroupsCopy()
	seen := make(map[string]struct{}, len(ratios)+len(userManaged))
	names := make([]string, 0, len(ratios)+len(userManaged))
	for groupName := range ratios {
		seen[groupName] = struct{}{}
		names = append(names, groupName)
	}
	for groupName := range userManaged {
		if _, ok := seen[groupName]; ok {
			continue
		}
		seen[groupName] = struct{}{}
		names = append(names, groupName)
	}
	slices.Sort(names)
	return names
}
