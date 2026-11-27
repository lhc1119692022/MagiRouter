package operation_setting

import (
	"testing"

	"github.com/shopspring/decimal"
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

	require.NoError(t, ValidateCheckinOption(CheckinTopUpUpgradeRulesOptionKey, `[{"threshold_amount":10,"target_group":"paid"},{"usage_threshold_quota":25000000,"target_group":"vip"},{"threshold_amount":10,"usage_threshold_quota":100000000,"match_mode":"all","target_group":"svip"}]`))
	require.NoError(t, ValidateCheckinOption(CheckinTopUpUpgradeRulesOptionKey, `[{"threshold_amount":50,"usage_threshold_quota":25000000,"match_mode":"any","target_group":"vip"}]`))
	require.Error(t, ValidateCheckinOption(CheckinTopUpUpgradeRulesOptionKey, `[{"threshold_amount":-1,"usage_threshold_quota":500000,"target_group":"vip"}]`))
	require.Error(t, ValidateCheckinOption(CheckinTopUpUpgradeRulesOptionKey, `[{"usage_threshold_quota":-10,"target_group":"vip"}]`))
	require.Error(t, ValidateCheckinOption(CheckinTopUpUpgradeRulesOptionKey, `[{"threshold_amount":10,"usage_threshold_quota":500000,"match_mode":"invalid","target_group":"vip"}]`))
	require.Error(t, ValidateCheckinOption(CheckinTopUpUpgradeRulesOptionKey, `[{"usage_threshold_quota":500000,"target_group":"a"},{"usage_threshold_quota":500000,"target_group":"b"}]`))
}

func TestCheckinSettingUsageAndMixedUpgradeRules(t *testing.T) {
	usageOnly := &CheckinSetting{
		TopUpUpgradeEnabled: true,
		TopUpUpgradeRules: []TopUpGroupUpgradeRule{
			{UsageThresholdQuota: 50_000_000, TargetGroup: "svip"},
			{UsageThresholdQuota: 10_000_000, TargetGroup: "vip"},
		},
	}
	assert.True(t, usageOnly.HasUsageUpgradeRules())
	normalizedUsage := usageOnly.NormalizedTopUpUpgradeRules()
	require.Len(t, normalizedUsage, 2)
	assert.Equal(t, int64(10_000_000), normalizedUsage[0].UsageThresholdQuota)
	assert.Equal(t, "vip", normalizedUsage[0].TargetGroup)
	assert.Equal(t, int64(50_000_000), normalizedUsage[1].UsageThresholdQuota)
	assert.Equal(t, "svip", normalizedUsage[1].TargetGroup)

	mixed := &CheckinSetting{
		TopUpUpgradeEnabled: true,
		TopUpUpgradeRules: []TopUpGroupUpgradeRule{
			{ThresholdAmount: 10, TargetGroup: "paid"},
			{UsageThresholdQuota: 25_000_000, TargetGroup: "vip"},
			{ThresholdAmount: 10, UsageThresholdQuota: 100_000_000, MatchMode: "ANY", TargetGroup: "svip"},
		},
	}
	normalizedMixed := mixed.NormalizedTopUpUpgradeRules()
	require.Len(t, normalizedMixed, 3)
	assert.Equal(t, "paid", normalizedMixed[0].TargetGroup)
	assert.Equal(t, "", normalizedMixed[0].MatchMode)
	assert.Equal(t, "vip", normalizedMixed[1].TargetGroup)
	assert.Equal(t, "", normalizedMixed[1].MatchMode)
	assert.Equal(t, "svip", normalizedMixed[2].TargetGroup)
	assert.Equal(t, GroupUpgradeMatchModeAny, normalizedMixed[2].MatchMode)

	andRule := TopUpGroupUpgradeRule{ThresholdAmount: 10, UsageThresholdQuota: 1_000_000, MatchMode: GroupUpgradeMatchModeAll, TargetGroup: "vip"}
	assert.False(t, andRule.Matches(decimal.NewFromInt(10), 999_999))
	assert.False(t, andRule.Matches(decimal.NewFromInt(9), 1_000_000))
	assert.True(t, andRule.Matches(decimal.NewFromInt(10), 1_000_000))

	orRule := TopUpGroupUpgradeRule{ThresholdAmount: 100, UsageThresholdQuota: 1_000_000, MatchMode: GroupUpgradeMatchModeAny, TargetGroup: "vip"}
	assert.False(t, orRule.Matches(decimal.NewFromInt(99), 999_999))
	assert.True(t, orRule.Matches(decimal.NewFromInt(100), 0))
	assert.True(t, orRule.Matches(decimal.NewFromInt(0), 1_000_000))
}
