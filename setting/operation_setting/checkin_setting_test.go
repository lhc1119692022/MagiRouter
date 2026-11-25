package operation_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCheckinSettingGroupAccess(t *testing.T) {
	openSetting := &CheckinSetting{Enabled: true, AllowedGroups: nil}
	assert.True(t, openSetting.IsGroupAllowed("default"))
	assert.True(t, openSetting.IsGroupAllowed("vip"))
	assert.Empty(t, openSetting.NormalizedAllowedGroups())

	restricted := &CheckinSetting{
		Enabled:       true,
		AllowedGroups: []string{" vip ", "gold", "vip", ""},
	}
	assert.Equal(t, []string{"vip", "gold"}, restricted.NormalizedAllowedGroups())
	assert.True(t, restricted.IsGroupAllowed("vip"))
	assert.True(t, restricted.IsGroupAllowed("gold"))
	assert.False(t, restricted.IsGroupAllowed("default"))
	assert.False(t, restricted.IsGroupAllowed(""))
}

func TestCheckinSettingUpgradeRulesAndValidation(t *testing.T) {
	cfg := &CheckinSetting{
		TopUpUpgradeEnabled: true,
		TopUpUpgradeRules: []TopUpGroupUpgradeRule{
			{ThresholdAmount: 200, TargetGroup: "gold"},
			{ThresholdAmount: 50.555, TargetGroup: " silver "},
			{ThresholdAmount: 0, TargetGroup: "invalid"},
		},
	}
	normalized := cfg.NormalizedTopUpUpgradeRules()
	require.Len(t, normalized, 2)
	assert.Equal(t, 50.56, normalized[0].ThresholdAmount)
	assert.Equal(t, "silver", normalized[0].TargetGroup)
	assert.Equal(t, 200.0, normalized[1].ThresholdAmount)
	assert.Equal(t, "gold", normalized[1].TargetGroup)

	require.NoError(t, ValidateCheckinOption(CheckinMinQuotaOptionKey, "0"))
	require.NoError(t, ValidateCheckinOption(CheckinMaxQuotaOptionKey, "50000"))
	require.Error(t, ValidateCheckinOption(CheckinMinQuotaOptionKey, "-1"))
	require.Error(t, ValidateCheckinOption(CheckinMaxQuotaOptionKey, "abc"))

	require.NoError(t, ValidateCheckinOption(CheckinAllowedGroupsOptionKey, `["vip","active"]`))
	require.NoError(t, ValidateCheckinOption(CheckinAllowedGroupsOptionKey, `[]`))
	require.Error(t, ValidateCheckinOption(CheckinAllowedGroupsOptionKey, `[""]`))
	require.Error(t, ValidateCheckinOption(CheckinAllowedGroupsOptionKey, `not-json`))

	require.NoError(t, ValidateCheckinOption(CheckinTopUpUpgradeRulesOptionKey, `[{"threshold_amount":50,"target_group":"vip"},{"threshold_amount":200,"target_group":"svip"}]`))
	require.Error(t, ValidateCheckinOption(CheckinTopUpUpgradeRulesOptionKey, `[{"threshold_amount":0,"target_group":"vip"}]`))
	require.Error(t, ValidateCheckinOption(CheckinTopUpUpgradeRulesOptionKey, `[{"threshold_amount":50,"target_group":""}]`))
	require.Error(t, ValidateCheckinOption(CheckinTopUpUpgradeRulesOptionKey, `[{"threshold_amount":50,"target_group":"a"},{"threshold_amount":50,"target_group":"b"}]`))
}
