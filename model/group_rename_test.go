package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupGroupRenameTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:group_rename_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&Option{},
		&Channel{},
		&Ability{},
		&User{},
		&Token{},
		&SubscriptionPlan{},
		&UserSubscription{},
		&SystemTask{},
		&Model{},
		&Vendor{},
	))

	origDB := DB
	origOptionMap := common.OptionMap
	origMemCache := common.MemoryCacheEnabled
	origGroupRatio := ratio_setting.GroupRatio2JSONString()
	origGroupGroup := ratio_setting.GroupGroupRatio2JSONString()
	origUserMgmt := ratio_setting.UserManagementGroups2JSONString()
	origSpecial := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.ReadAll()
	origUsable := setting.UserUsableGroups2JSONString()
	origTopup := common.TopupGroupRatio2JSONString()
	origAuto := setting.AutoGroups2JsonString()
	origSmart := setting.SmartRoutingConfig2JSONString()
	origConcurrency := setting.UserConcurrencyLimitGroup2JSONString()
	origGroupBillingExpr := billing_setting.GetGroupBillingExprCopy()
	origCheckinAllowed := operation_setting.GetCheckinSetting().NormalizedAllowedGroups()
	origCheckinRules := operation_setting.GetCheckinSetting().NormalizedTopUpUpgradeRules()
	origMediaBonus := operation_setting.GetMediaRelaySettingSnapshot().GroupDailyBonusMB
	origPricingOrder := console_setting.GetConsoleSetting().PricingFilterOrder
	origStatusOrder := console_setting.GetConsoleSetting().ChannelStatusGroupOrder

	DB = db
	common.MemoryCacheEnabled = false
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()

	t.Cleanup(func() {
		_ = ratio_setting.UpdateGroupRatioByJSONString(origGroupRatio)
		_ = ratio_setting.UpdateGroupGroupRatioByJSONString(origGroupGroup)
		_ = ratio_setting.UpdateUserManagementGroupsByJSONString(origUserMgmt)
		special := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
		special.Clear()
		special.AddAll(origSpecial)
		_ = setting.UpdateUserUsableGroupsByJSONString(origUsable)
		_ = common.UpdateTopupGroupRatioByJSONString(origTopup)
		_ = setting.UpdateAutoGroupsByJsonString(origAuto)
		_ = setting.UpdateSmartRoutingConfigByJSONString(origSmart)
		_ = setting.UpdateUserConcurrencyLimitGroupByJSONString(origConcurrency)
		if encoded, err := common.Marshal(origGroupBillingExpr); err == nil {
			_ = updateOptionMap(billing_setting.GroupBillingExprOption, string(encoded))
		}
		if encoded, err := common.Marshal(origCheckinAllowed); err == nil {
			_ = updateOptionMap(operation_setting.CheckinAllowedGroupsOptionKey, string(encoded))
		}
		if encoded, err := common.Marshal(origCheckinRules); err == nil {
			_ = updateOptionMap(operation_setting.CheckinTopUpUpgradeRulesOptionKey, string(encoded))
		}
		if encoded, err := common.Marshal(origMediaBonus); err == nil {
			_ = updateOptionMap(mediaRelayGroupDailyBonusKey, string(encoded))
		}
		_ = updateOptionMap(console_setting.PricingFilterOrderOption, origPricingOrder)
		_ = updateOptionMap(console_setting.ChannelStatusGroupOrderOption, origStatusOrder)
		DB = origDB
		common.MemoryCacheEnabled = origMemCache
		common.OptionMapRWMutex.Lock()
		common.OptionMap = origOptionMap
		common.OptionMapRWMutex.Unlock()
		InvalidatePricingCache()
		ratio_setting.InvalidateExposedDataCache()
	})
	return db
}

func TestRenameGroupAtomicCascadeAndDryRun(t *testing.T) {
	db := setupGroupRenameTestDB(t)

	seedOptions := map[string]string{
		GroupRatioOptionKey:                               `{"default":1,"vip":0.8,"vip_pro":0.6}`,
		"TopupGroupRatio":                                 `{"vip":0.9}`,
		UserUsableGroupsOptionKey:                         `{"default":"Default","vip":"VIP Line","vip_pro":"VIP Pro"}`,
		UserManagementGroupsOptionKey:                     `{}`,
		"GroupGroupRatio":                                 `{"vip":{"vip":0.7,"default":0.95},"default":{"vip":0.85}}`,
		groupSpecialUsableGroupOptionKey:                  `{"vip":{"vip":"VIP Self","default":"Default"},"default":{"vip":"VIP Access"}}`,
		"AutoGroups":                                      `["vip","vip_pro","default"]`,
		setting.SmartRoutingConfigOptionKey:               `{"enabled":true,"short_window_hours":1,"long_window_hours":24,"healthy_success_rate":95,"degraded_success_rate":80,"allow_outage_fallback":true,"cost_max_fallback_ratio":0,"excluded_groups":["vip"],"pinned_groups":["vip","default"],"demoted_groups":["vip_pro"]}`,
		billing_setting.GroupBillingExprOption:            `{"vip::gpt-5":"tier(\"base\", p * 2 + c * 4)","vip::claude-4":"tier(\"base\", p * 3 + c * 6)","vip_pro::gpt-5":"tier(\"base\", p * 1 + c * 2)"}`,
		"UserConcurrencyLimitGroup":                       `{"vip":12,"vip_pro":24}`,
		operation_setting.CheckinAllowedGroupsOptionKey:   `["vip","vip_pro"]`,
		operation_setting.CheckinTopUpUpgradeRulesOptionKey: `[{"threshold_amount":50,"target_group":"vip"},{"threshold_amount":200,"target_group":"vip_pro"}]`,
		mediaRelayGroupDailyBonusKey:                      `{"vip":512}`,
		console_setting.PricingFilterOrderOption:          `{"groups":["vip","vip_pro","default"]}`,
		console_setting.ChannelStatusGroupOrderOption:     `["vip","default"]`,
	}
	require.NoError(t, UpdateOptionsBulk(seedOptions))

	ch1 := &Channel{Name: "ch-vip-multi", Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, Models: "gpt-5,claude-4", Group: "vip,vip_pro,default"}
	ch2 := &Channel{Name: "ch-vip-only", Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, Models: "gpt-5", Group: "vip"}
	ch3 := &Channel{Name: "ch-vip-pro-only", Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, Models: "gpt-5", Group: "vip_pro"}
	for _, ch := range []*Channel{ch1, ch2, ch3} {
		require.NoError(t, db.Create(ch).Error)
		require.NoError(t, ch.AddAbilities(db))
	}

	user1 := &User{Username: "alice", DisplayName: "Alice", Group: "vip", AffCode: "aff1"}
	user2 := &User{Username: "bob", DisplayName: "Bob", Group: "vip_pro", AffCode: "aff2"}
	require.NoError(t, db.Create(user1).Error)
	require.NoError(t, db.Create(user2).Error)

	tok1 := &Token{UserId: user1.Id, Key: "key-1", Name: "t1", Group: "vip"}
	tok2 := &Token{UserId: user1.Id, Key: "key-2", Name: "t2", Group: "auto"}
	require.NoError(t, tok2.SetAutoGroups([]string{"vip", "vip_pro"}))
	tok3 := &Token{UserId: user2.Id, Key: "key-3", Name: "t3", Group: "vip_pro"}
	for _, tok := range []*Token{tok1, tok2, tok3} {
		require.NoError(t, db.Create(tok).Error)
	}

	plan := &SubscriptionPlan{Title: "VIP Plan", UpgradeGroup: "vip", DowngradeGroup: "default"}
	require.NoError(t, db.Create(plan).Error)
	userSub := &UserSubscription{UserId: user1.Id, PlanId: plan.Id, UpgradeGroup: "vip", PrevUserGroup: "vip", DowngradeGroup: "default"}
	require.NoError(t, db.Create(userSub).Error)

	// 1. Dry-run returns exact impact without mutating anything.
	dryImpact, err := RenameGroup("vip", "gold", true)
	require.NoError(t, err)
	assert.True(t, dryImpact.DryRun)
	assert.Equal(t, 2, dryImpact.Channels)
	assert.Equal(t, int64(1), dryImpact.Users)
	assert.Equal(t, int64(2), dryImpact.Tokens)
	assert.Equal(t, int64(2), dryImpact.Subscriptions)
	assert.Equal(t, 2, dryImpact.ModelGroupPrices)
	assert.Contains(t, dryImpact.UpdatedOptions, GroupRatioOptionKey)
	assert.Contains(t, dryImpact.UpdatedOptions, billing_setting.GroupBillingExprOption)

	var ch1Before Channel
	require.NoError(t, db.First(&ch1Before, ch1.Id).Error)
	assert.Equal(t, "vip,vip_pro,default", ch1Before.Group)
	assert.True(t, ratio_setting.ContainsGroupRatio("vip"))
	assert.False(t, ratio_setting.ContainsGroupRatio("gold"))

	// 2. Actual rename cascades everywhere atomically.
	impact, err := RenameGroup("vip", "gold", false)
	require.NoError(t, err)
	assert.False(t, impact.DryRun)
	assert.Equal(t, 2, impact.Channels)
	assert.Equal(t, int64(1), impact.Users)
	assert.Equal(t, int64(2), impact.Tokens)
	assert.Equal(t, int64(2), impact.Subscriptions)
	assert.Equal(t, 2, impact.ModelGroupPrices)

	// Channels & abilities updated without touching vip_pro.
	var reloadedCh1, reloadedCh2, reloadedCh3 Channel
	require.NoError(t, db.First(&reloadedCh1, ch1.Id).Error)
	require.NoError(t, db.First(&reloadedCh2, ch2.Id).Error)
	require.NoError(t, db.First(&reloadedCh3, ch3.Id).Error)
	assert.Equal(t, "gold,vip_pro,default", reloadedCh1.Group)
	assert.Equal(t, "gold", reloadedCh2.Group)
	assert.Equal(t, "vip_pro", reloadedCh3.Group)

	var oldAbilityCount, newAbilityCount, proAbilityCount int64
	require.NoError(t, db.Model(&Ability{}).Where("`group` = ?", "vip").Count(&oldAbilityCount).Error)
	require.NoError(t, db.Model(&Ability{}).Where("`group` = ?", "gold").Count(&newAbilityCount).Error)
	require.NoError(t, db.Model(&Ability{}).Where("`group` = ?", "vip_pro").Count(&proAbilityCount).Error)
	assert.Equal(t, int64(0), oldAbilityCount)
	assert.Equal(t, int64(3), newAbilityCount) // ch1 (2 models) + ch2 (1 model)
	assert.Equal(t, int64(3), proAbilityCount) // ch1 (2 models) + ch3 (1 model)

	// Users & tokens updated.
	var reloadedUser1, reloadedUser2 User
	require.NoError(t, db.First(&reloadedUser1, user1.Id).Error)
	require.NoError(t, db.First(&reloadedUser2, user2.Id).Error)
	assert.Equal(t, "gold", reloadedUser1.Group)
	assert.Equal(t, "vip_pro", reloadedUser2.Group)

	var reloadedTok1, reloadedTok2, reloadedTok3 Token
	require.NoError(t, db.First(&reloadedTok1, tok1.Id).Error)
	require.NoError(t, db.First(&reloadedTok2, tok2.Id).Error)
	require.NoError(t, db.First(&reloadedTok3, tok3.Id).Error)
	assert.Equal(t, "gold", reloadedTok1.Group)
	reloadedAuto, err := reloadedTok2.GetAutoGroups()
	require.NoError(t, err)
	assert.Equal(t, []string{"gold", "vip_pro"}, reloadedAuto)
	assert.Equal(t, "vip_pro", reloadedTok3.Group)

	// Subscriptions updated.
	var reloadedPlan SubscriptionPlan
	var reloadedSub UserSubscription
	require.NoError(t, db.First(&reloadedPlan, plan.Id).Error)
	require.NoError(t, db.First(&reloadedSub, userSub.Id).Error)
	assert.Equal(t, "gold", reloadedPlan.UpgradeGroup)
	assert.Equal(t, "gold", reloadedSub.UpgradeGroup)
	assert.Equal(t, "gold", reloadedSub.PrevUserGroup)

	// In-memory options & per-group model pricing updated immediately.
	assert.False(t, ratio_setting.ContainsGroupRatio("vip"))
	assert.InDelta(t, 0.8, ratio_setting.GetGroupRatio("gold"), 1e-9)
	assert.InDelta(t, 0.6, ratio_setting.GetGroupRatio("vip_pro"), 1e-9)
	assert.Equal(t, "VIP Line", setting.GetUserUsableGroupsCopy()["gold"])
	assert.NotContains(t, setting.GetUserUsableGroupsCopy(), "vip")

	ggr, ok := ratio_setting.GetGroupGroupRatio("gold", "gold")
	require.True(t, ok)
	assert.InDelta(t, 0.7, ggr, 1e-9)
	ggr2, ok := ratio_setting.GetGroupGroupRatio("default", "gold")
	require.True(t, ok)
	assert.InDelta(t, 0.85, ggr2, 1e-9)

	assert.Equal(t, []string{"gold", "vip_pro", "default"}, setting.GetAutoGroups())
	smart := setting.GetSmartRoutingConfig()
	assert.Equal(t, []string{"gold"}, smart.ExcludedGroups)
	assert.Equal(t, []string{"gold", "default"}, smart.PinnedGroups)
	assert.Equal(t, []string{"vip_pro"}, smart.DemotedGroups)

	expr, found := billing_setting.GetGroupBillingExpr("gold", "gpt-5")
	require.True(t, found)
	assert.Equal(t, `tier("base", p * 2 + c * 4)`, expr)
	_, oldFound := billing_setting.GetGroupBillingExpr("vip", "gpt-5")
	assert.False(t, oldFound)
	proExpr, proFound := billing_setting.GetGroupBillingExpr("vip_pro", "gpt-5")
	require.True(t, proFound)
	assert.Equal(t, `tier("base", p * 1 + c * 2)`, proExpr)

	assert.Equal(t, 12, setting.GetUserConcurrencyLimitGroupCopy()["gold"])
	assert.Equal(t, []string{"gold", "vip_pro"}, operation_setting.GetCheckinSetting().NormalizedAllowedGroups())
	rules := operation_setting.GetCheckinSetting().NormalizedTopUpUpgradeRules()
	require.Len(t, rules, 2)
	assert.Equal(t, "gold", rules[0].TargetGroup)
	assert.Equal(t, "vip_pro", rules[1].TargetGroup)
	assert.Equal(t, 512, operation_setting.GetMediaRelaySettingSnapshot().GroupDailyBonusMB["gold"])
	assert.Equal(t, []string{"gold", "vip_pro", "default"}, console_setting.GetPricingFilterOrder().Groups)
	assert.Equal(t, []string{"gold", "default"}, console_setting.GetChannelStatusGroupOrder())
}

func TestRenameGroupValidation(t *testing.T) {
	_ = setupGroupRenameTestDB(t)
	require.NoError(t, UpdateOptionsBulk(map[string]string{
		GroupRatioOptionKey:       `{"default":1,"vip":0.8,"svip":0.6}`,
		UserUsableGroupsOptionKey: `{"default":"Default","vip":"VIP","svip":"SVIP"}`,
	}))

	_, err := RenameGroup("default", "base", true)
	require.Error(t, err)
	_, err = RenameGroup("vip", "auto", true)
	require.Error(t, err)
	_, err = RenameGroup("vip", "svip", true)
	require.Error(t, err)
	_, err = RenameGroup("missing", "gold", true)
	require.Error(t, err)
	_, err = RenameGroup("vip", "a,b", true)
	require.Error(t, err)
	_, err = RenameGroup("vip", "a::b", true)
	require.Error(t, err)
	_, err = RenameGroup("vip", "vip", true)
	require.Error(t, err)
}
