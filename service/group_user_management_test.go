package service

import (
	"testing"

	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func resetUserManagementGroupTestState(t *testing.T) {
	t.Helper()
	originalUsable := setting.UserUsableGroups2JSONString()
	originalRatios := ratio_setting.GroupRatio2JSONString()
	originalGroupGroup := ratio_setting.GroupGroupRatio2JSONString()
	originalAuto := setting.AutoGroups2JsonString()
	originalSpecial := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.ReadAll()
	originalUserManaged := ratio_setting.UserManagementGroups2JSONString()

	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsable))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
		require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(originalGroupGroup))
		require.NoError(t, setting.UpdateAutoGroupsByJsonString(originalAuto))
		specialMap := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
		specialMap.Clear()
		specialMap.AddAll(originalSpecial)
		require.NoError(t, ratio_setting.UpdateUserManagementGroupsByJSONString(originalUserManaged))
	})
}

func TestCheckUserManagementGroupsValidation(t *testing.T) {
	require.NoError(t, ratio_setting.CheckUserManagementGroups(""))
	require.NoError(t, ratio_setting.CheckUserManagementGroups(`{}`))
	require.NoError(t, ratio_setting.CheckUserManagementGroups(`{"default":"Default user tier","vip":"VIP tier"}`))

	assert.Error(t, ratio_setting.CheckUserManagementGroups(`["default"]`))
	assert.Error(t, ratio_setting.CheckUserManagementGroups(`{"":"Empty"}`))
	assert.Error(t, ratio_setting.CheckUserManagementGroups(`{"auto":"Reserved"}`))
	assert.Error(t, ratio_setting.CheckUserManagementGroups(`{"all":"Reserved"}`))
}

func TestUserManagementGroupsExcludedFromUsableAndAutoGroups(t *testing.T) {
	resetUserManagementGroupTestState(t)

	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"standard":1,"fast":1.5,"vip_line":0.8}`))
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Legacy default","standard":"Standard","fast":"Fast"}`))
	require.NoError(t, ratio_setting.UpdateUserManagementGroupsByJSONString(`{"default":"Default user tier","vip":"VIP tier"}`))
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["default","standard","vip","fast"]`))
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{"vip":{"standard":0.75}}`))

	special := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
	special.Clear()
	special.AddAll(map[string]map[string]string{
		"vip": {
			"+:vip_line": "VIP Fast Line",
			"-:fast":     "remove",
		},
	})

	// Default user group is user-management-only: never auto-injected and stripped even if present in UserUsableGroups.
	defaultUsable := GetUserUsableGroups("default")
	assert.NotContains(t, defaultUsable, "default")
	assert.NotContains(t, defaultUsable, "vip")
	assert.Contains(t, defaultUsable, "standard")
	assert.Contains(t, defaultUsable, "fast")

	// Anonymous caller also does not see user-management-only groups.
	anonUsable := GetUserUsableGroups("")
	assert.NotContains(t, anonUsable, "default")
	assert.Contains(t, anonUsable, "standard")

	// VIP user-management-only group still works as outer key for GroupSpecialUsableGroup and GroupGroupRatio.
	vipUsable := GetUserUsableGroups("vip")
	assert.NotContains(t, vipUsable, "vip")
	assert.NotContains(t, vipUsable, "default")
	assert.NotContains(t, vipUsable, "fast")
	assert.Contains(t, vipUsable, "standard")
	assert.Contains(t, vipUsable, "vip_line")
	assert.Equal(t, 0.75, GetUserGroupRatio("vip", "standard"))

	// Selectability and Auto groups strictly exclude user-management-only groups.
	assert.False(t, IsUserSelectableGroup("default", "default"))
	assert.False(t, IsUserSelectableGroup("vip", "vip"))
	assert.True(t, IsUserSelectableGroup("default", "standard"))
	assert.Equal(t, []string{"standard", "fast"}, GetUserAutoGroup("default"))

	// Billing vs All group name listings.
	assert.Equal(t, []string{"fast", "standard", "vip_line"}, ratio_setting.GetBillingGroupNames())
	assert.Equal(t, []string{"default", "fast", "standard", "vip", "vip_line"}, ratio_setting.GetAllGroupNames())
}
