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
