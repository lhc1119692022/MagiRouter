package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func withCheckinTestConfig(t *testing.T, cfg operation_setting.CheckinSetting) {
	t.Helper()
	target := operation_setting.GetCheckinSetting()
	old := *target
	oldGroups := append([]string(nil), target.AllowedGroups...)
	oldRules := append([]operation_setting.TopUpGroupUpgradeRule(nil), target.TopUpUpgradeRules...)

	common.OptionMapRWMutex.Lock()
	*target = cfg
	common.OptionMapRWMutex.Unlock()

	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		*target = old
		target.AllowedGroups = oldGroups
		target.TopUpUpgradeRules = oldRules
		common.OptionMapRWMutex.Unlock()
	})
}

func TestEvaluateCumulativeTopUpGroupUpgradeAndCheckinEligibility(t *testing.T) {
	truncateTables(t)
	require.NoError(t, DB.AutoMigrate(&Checkin{}))
	require.NoError(t, DB.Where("1 = 1").Delete(&Checkin{}).Error)
	withCheckinTestConfig(t, operation_setting.CheckinSetting{
		Enabled:             true,
		MinQuota:            5000,
		MaxQuota:            10000,
		AllowedGroups:       []string{"vip", "svip"},
		TopUpUpgradeEnabled: true,
		TopUpUpgradeRules: []operation_setting.TopUpGroupUpgradeRule{
			{ThresholdAmount: 50, TargetGroup: "vip"},
			{ThresholdAmount: 200, TargetGroup: "svip"},
		},
	})

	user := &User{Id: 501, Username: "upgrade_user", Group: "default", AffCode: "UPG501", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(user).Error)

	// Default group cannot check in before upgrade.
	_, err := UserCheckin(user.Id)
	require.Error(t, err)

	// First top-up of 30 is below threshold 50.
	require.NoError(t, DB.Create(&TopUp{
		UserId: user.Id, Amount: 30, Money: 30, TradeNo: "up-1",
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		Status: common.TopUpStatusSuccess,
	}).Error)
	upgraded, _, _, err := EvaluateCumulativeTopUpGroupUpgrade(user.Id)
	require.NoError(t, err)
	assert.False(t, upgraded)

	// Second top-up of 25 brings total to 55 -> upgrades default -> vip.
	require.NoError(t, DB.Create(&TopUp{
		UserId: user.Id, Amount: 25, Money: 25, TradeNo: "up-2",
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		Status: common.TopUpStatusSuccess,
	}).Error)
	upgraded, oldGroup, newGroup, err := EvaluateCumulativeTopUpGroupUpgrade(user.Id)
	require.NoError(t, err)
	assert.True(t, upgraded)
	assert.Equal(t, "default", oldGroup)
	assert.Equal(t, "vip", newGroup)

	// Now user in vip group can check in!
	checkin, err := UserCheckin(user.Id)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, checkin.QuotaAwarded, 5000)
	assert.LessOrEqual(t, checkin.QuotaAwarded, 10000)

	// Third top-up brings total to 205 -> upgrades vip -> svip.
	require.NoError(t, DB.Create(&TopUp{
		UserId: user.Id, Amount: 150, Money: 150, TradeNo: "up-3",
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		Status: common.TopUpStatusSuccess,
	}).Error)
	upgraded, oldGroup, newGroup, err = EvaluateCumulativeTopUpGroupUpgrade(user.Id)
	require.NoError(t, err)
	assert.True(t, upgraded)
	assert.Equal(t, "vip", oldGroup)
	assert.Equal(t, "svip", newGroup)

	// Manually assigned special group should not be overwritten by cumulative top-up rules.
	enterprise := &User{Id: 502, Username: "enterprise_user", Group: "enterprise", AffCode: "ENT502", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(enterprise).Error)
	require.NoError(t, DB.Create(&TopUp{
		UserId: enterprise.Id, Amount: 500, Money: 500, TradeNo: "up-ent-1",
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		Status: common.TopUpStatusSuccess,
	}).Error)
	upgraded, _, _, err = EvaluateCumulativeTopUpGroupUpgrade(enterprise.Id)
	require.NoError(t, err)
	assert.False(t, upgraded)
	groupNow, err := GetUserGroup(enterprise.Id, true)
	require.NoError(t, err)
	assert.Equal(t, "enterprise", groupNow)
}

func TestEvaluateUsageAndCombinedGroupUpgrade(t *testing.T) {
	truncateTables(t)
	oldBatch := common.BatchUpdateEnabled
	common.BatchUpdateEnabled = false
	t.Cleanup(func() {
		common.BatchUpdateEnabled = oldBatch
	})

	withCheckinTestConfig(t, operation_setting.CheckinSetting{
		TopUpUpgradeEnabled: true,
		TopUpUpgradeRules: []operation_setting.TopUpGroupUpgradeRule{
			{ThresholdAmount: 10, TargetGroup: "paid"},
			{ThresholdAmount: 10, UsageThresholdQuota: 25_000_000, MatchMode: operation_setting.GroupUpgradeMatchModeAll, TargetGroup: "vip"},
			{ThresholdAmount: 500, UsageThresholdQuota: 100_000_000, MatchMode: operation_setting.GroupUpgradeMatchModeAny, TargetGroup: "svip"},
		},
	})

	// User 1: tops up 10 -> paid, consumes to 25M quota -> vip, consumes to 100M -> svip.
	u1 := &User{Id: 601, Username: "active_user", Group: "default", AffCode: "ACT601", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(u1).Error)

	require.NoError(t, DB.Create(&TopUp{
		UserId: u1.Id, Amount: 10, Money: 10, TradeNo: "u601-1",
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		Status: common.TopUpStatusSuccess,
	}).Error)
	upgraded, oldGroup, newGroup, err := EvaluateCumulativeTopUpGroupUpgrade(u1.Id)
	require.NoError(t, err)
	assert.True(t, upgraded)
	assert.Equal(t, "default", oldGroup)
	assert.Equal(t, "paid", newGroup)

	// Consumption below 25M keeps user in paid.
	UpdateUserUsedQuotaAndRequestCount(u1.Id, 10_000_000)
	groupNow, err := GetUserGroup(u1.Id, true)
	require.NoError(t, err)
	assert.Equal(t, "paid", groupNow)

	// Crossing 25M upgrades paid -> vip via UpdateUserUsedQuotaAndRequestCount.
	UpdateUserUsedQuotaAndRequestCount(u1.Id, 15_000_000)
	groupNow, err = GetUserGroup(u1.Id, true)
	require.NoError(t, err)
	assert.Equal(t, "vip", groupNow)

	// Crossing 100M via batch flush upgrades vip -> svip (OR rule matched by usage).
	updateUserQuotaUsedQuotaAndRequestCount(u1.Id, 0, 75_000_000, 1)
	groupNow, err = GetUserGroup(u1.Id, true)
	require.NoError(t, err)
	assert.Equal(t, "svip", groupNow)

	// Refund never downgrades svip.
	UpdateUserUsedQuota(u1.Id, -90_000_000)
	groupNow, err = GetUserGroup(u1.Id, true)
	require.NoError(t, err)
	assert.Equal(t, "svip", groupNow)

	// User 2: consumes 30M without topping up -> does not satisfy AND rule for vip.
	u2 := &User{Id: 602, Username: "free_heavy", Group: "default", AffCode: "FR602", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(u2).Error)
	UpdateUserUsedQuota(u2.Id, 30_000_000)
	groupNow, err = GetUserGroup(u2.Id, true)
	require.NoError(t, err)
	assert.Equal(t, "default", groupNow)

	// Once User 2 tops up 10, both top-up and usage are satisfied -> upgrades straight to vip.
	require.NoError(t, DB.Create(&TopUp{
		UserId: u2.Id, Amount: 10, Money: 10, TradeNo: "u602-1",
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		Status: common.TopUpStatusSuccess,
	}).Error)
	upgraded, oldGroup, newGroup, err = EvaluateCumulativeTopUpGroupUpgrade(u2.Id)
	require.NoError(t, err)
	assert.True(t, upgraded)
	assert.Equal(t, "default", oldGroup)
	assert.Equal(t, "vip", newGroup)

	// User 3: manually assigned special group is never upgraded by usage.
	special := &User{Id: 603, Username: "special_usage", Group: "partner", AffCode: "SP603", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(special).Error)
	UpdateUserUsedQuotaAndRequestCount(special.Id, 200_000_000)
	groupNow, err = GetUserGroup(special.Id, true)
	require.NoError(t, err)
	assert.Equal(t, "partner", groupNow)
}
