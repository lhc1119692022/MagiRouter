package setting

import (
	"maps"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

const DefaultGroupDescription = "Default group"

// The default descriptions are English source keys that the web console
// translates; descriptions an administrator saves are shown as written.
var defaultUserUsableGroups = map[string]string{
	"default": DefaultGroupDescription,
	"vip":     "VIP group",
}

var userUsableGroups = maps.Clone(defaultUserUsableGroups)
var userUsableGroupsMutex sync.RWMutex

func DefaultUserUsableGroupsCopy() map[string]string {
	return maps.Clone(defaultUserUsableGroups)
}

func GetUserUsableGroupsCopy() map[string]string {
	userUsableGroupsMutex.RLock()
	defer userUsableGroupsMutex.RUnlock()

	copyUserUsableGroups := make(map[string]string)
	maps.Copy(copyUserUsableGroups, userUsableGroups)
	return copyUserUsableGroups
}

func UserUsableGroups2JSONString() string {
	userUsableGroupsMutex.RLock()
	defer userUsableGroupsMutex.RUnlock()

	jsonBytes, err := common.Marshal(userUsableGroups)
	if err != nil {
		common.SysLog(common.LogText("error marshalling user groups: %s", err.Error()))
	}
	return string(jsonBytes)
}

func UpdateUserUsableGroupsByJSONString(jsonStr string) error {
	userUsableGroupsMutex.Lock()
	defer userUsableGroupsMutex.Unlock()

	userUsableGroups = make(map[string]string)
	return common.UnmarshalJsonStr(jsonStr, &userUsableGroups)
}

func GetUsableGroupDescription(groupName string) string {
	userUsableGroupsMutex.RLock()
	defer userUsableGroupsMutex.RUnlock()

	if desc, ok := userUsableGroups[groupName]; ok {
		return desc
	}
	return groupName
}
