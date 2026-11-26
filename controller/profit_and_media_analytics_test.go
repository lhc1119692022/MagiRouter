package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestProfitAndMediaAnalyticsPermissions(t *testing.T) {
	gin.SetMode(gin.TestMode)
	admin, _ := setupAccessTokenAudit(t)
	previousOptionMap := common.OptionMap
	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = make(map[string]string)
	}
	common.OptionMapRWMutex.Unlock()
	previousProfitCfg := operation_setting.GetProfitAnalyticsSettingSnapshot()
	t.Cleanup(func() {
		if optionMap, err := previousProfitCfg.ToOptionMap(); err == nil && model.DB != nil {
			_ = model.UpdateOptionsBulk(optionMap)
		}
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptionMap
		common.OptionMapRWMutex.Unlock()
	})
	require.NoError(t, model.DB.AutoMigrate(
		&model.Option{},
		&model.SystemTask{},
		&model.TopUp{},
		&model.SubscriptionPlan{},
		&model.SubscriptionOrder{},
		&model.UserSubscription{},
		&model.QuotaData{},
		&model.Channel{},
		&model.Redemption{},
		&model.Checkin{},
		&model.MediaDailyTraffic{},
		&model.MediaTrafficOverride{},
		&model.MediaRelayObject{},
	))
	_, adminSession := createAccessTokenTestSession(t, admin.Id, "analytics-admin")
	root := &model.User{Username: "analytics-root", Role: common.RoleRootUser, Status: common.UserStatusEnabled, AuthVersion: 1, AffCode: "ana-root"}
	require.NoError(t, model.DB.Create(root).Error)
	_, rootSession := createAccessTokenTestSession(t, root.Id, "analytics-root")
	normalUser := &model.User{Username: "analytics-user", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AuthVersion: 1, AffCode: "ana-user"}
	require.NoError(t, model.DB.Create(normalUser).Error)
	_, userSession := createAccessTokenTestSession(t, normalUser.Id, "analytics-user")

	logReader, _ := createScopedAccessToken(t, admin.Id, 0, "log:read")
	optReader, _ := createScopedAccessToken(t, root.Id, 0, "option:read")
	optWriter, _ := createScopedAccessToken(t, root.Id, 0, "option:write")

	router := gin.New()
	router.GET("/api/data/profit", middleware.AdminAuth(), GetProfitAnalytics)
	router.GET("/api/data/media_traffic", middleware.AdminAuth(), GetAdminMediaTrafficAnalytics)
	router.GET("/api/data/media_traffic/objects", middleware.AdminAuth(), ListAdminMediaTrafficObjects)
	router.GET("/api/data/media_traffic/overrides", middleware.AdminAuth(), ListAdminMediaTrafficOverrides)
	router.GET("/api/option/profit_analytics", middleware.RootAuth(), GetProfitAnalyticsSettings)
	router.PUT("/api/option/profit_analytics", middleware.RootAuth(), UpdateProfitAnalyticsSettings)

	for _, tc := range []struct {
		name, method, path, credential, body string
		status                               int
	}{
		{"profit anonymous", http.MethodGet, "/api/data/profit", "", "", http.StatusUnauthorized},
		{"profit normal user", http.MethodGet, "/api/data/profit", userSession, "", http.StatusForbidden},
		{"profit admin session", http.MethodGet, "/api/data/profit", adminSession, "", http.StatusOK},
		{"profit log:read PAT", http.MethodGet, "/api/data/profit", logReader, "", http.StatusOK},
		{"media traffic admin session", http.MethodGet, "/api/data/media_traffic", adminSession, "", http.StatusOK},
		{"media objects admin session", http.MethodGet, "/api/data/media_traffic/objects", adminSession, "", http.StatusOK},
		{"media overrides admin session", http.MethodGet, "/api/data/media_traffic/overrides", adminSession, "", http.StatusOK},
		{"profit settings non-root admin", http.MethodGet, "/api/option/profit_analytics", adminSession, "", http.StatusForbidden},
		{"profit settings root option:read PAT", http.MethodGet, "/api/option/profit_analytics", optReader, "", http.StatusOK},
		{"profit settings write with read PAT", http.MethodPut, "/api/option/profit_analytics", optReader, `{"default_cost_ratio":0.4}`, http.StatusForbidden},
		{"profit settings write with root session", http.MethodPut, "/api/option/profit_analytics", rootSession, `{"default_cost_ratio":0.4}`, http.StatusOK},
		{"profit settings write with write PAT", http.MethodPut, "/api/option/profit_analytics", optWriter, `{"default_cost_ratio":0.45}`, http.StatusOK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resp := accessTokenRequest(router, tc.method, tc.path, tc.credential, "", tc.body)
			require.Equal(t, tc.status, resp.Code, resp.Body.String())
		})
	}
}

func TestProfitAndMediaAnalyticsDatabaseMatrix(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, dialect := range []struct{ kind, env string }{
		{"sqlite", ""},
		{"mysql", "TEST_MYSQL_DSN"},
		{"postgres", "TEST_POSTGRES_DSN"},
	} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}

			previousProfitCfg := operation_setting.GetProfitAnalyticsSettingSnapshot()
			previousQuotaPerUnit := common.QuotaPerUnit
			previousDisplayType := operation_setting.GetQuotaDisplayType()
			previousExchangeRate := operation_setting.USDExchangeRate
			previousPrice := operation_setting.Price
			previousGroupRatios, _ := common.Marshal(ratio_setting.GetGroupRatioCopy())
			previousModelPrices, _ := common.Marshal(ratio_setting.GetModelPriceCopy())
			t.Cleanup(func() {
				common.QuotaPerUnit = previousQuotaPerUnit
				operation_setting.USDExchangeRate = previousExchangeRate
				operation_setting.Price = previousPrice
				operation_setting.GetGeneralSetting().QuotaDisplayType = previousDisplayType
				if len(previousGroupRatios) > 0 {
					_ = ratio_setting.UpdateGroupRatioByJSONString(string(previousGroupRatios))
				}
				if len(previousModelPrices) > 0 {
					_ = ratio_setting.UpdateModelPriceByJSONString(string(previousModelPrices))
				}
				if optionMap, err := previousProfitCfg.ToOptionMap(); err == nil && model.DB != nil {
					_ = model.UpdateOptionsBulk(optionMap)
				}
			})

			db := modelManagementDB(t, dialect.kind, os.Getenv(dialect.env))
			require.NoError(t, db.AutoMigrate(
				&model.SystemTask{},
				&model.TopUp{},
				&model.SubscriptionPlan{},
				&model.SubscriptionOrder{},
				&model.UserSubscription{},
				&model.QuotaData{},
				&model.Redemption{},
				&model.Checkin{},
				&model.MediaDailyTraffic{},
				&model.MediaTrafficOverride{},
				&model.MediaRelayObject{},
			))

			common.QuotaPerUnit = 500000
			operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeCNY
			operation_setting.USDExchangeRate = 7.0
			operation_setting.Price = 7.0
			require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":1.2}`))
			require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"flux-pro-test":0.01}`))

			now := time.Now()
			todayDate, _ := operation_setting.MediaTrafficDayWindow(now)
			yesterdayDate, _ := operation_setting.MediaTrafficDayWindow(now.AddDate(0, 0, -1))

			// Seed users, channels, plan, orders, quota_data, liability, and media traffic.
			userA := &model.User{Username: "alice", DisplayName: "Alice", Role: common.RoleCommonUser, Group: "vip", Quota: 1000000, Status: common.UserStatusEnabled, AffCode: "alice-aff"}
			userB := &model.User{Username: "bob", DisplayName: "Bob", Role: common.RoleCommonUser, Group: "default", Quota: 500000, Status: common.UserStatusEnabled, AffCode: "bob-aff"}
			adminTester := &model.User{Username: "admin_tester", DisplayName: "Admin Tester", Role: common.RoleAdminUser, Group: "vip", Quota: 9000000, Status: common.UserStatusEnabled, AffCode: "adm-aff"}
			rootTester := &model.User{Username: "root_tester", DisplayName: "Root Tester", Role: common.RoleRootUser, Group: "default", Quota: 5000000, Status: common.UserStatusEnabled, AffCode: "root-aff"}
			require.NoError(t, db.Create(userA).Error)
			require.NoError(t, db.Create(userB).Error)
			require.NoError(t, db.Create(adminTester).Error)
			require.NoError(t, db.Create(rootTester).Error)

			chRelay := &model.Channel{Name: "OpenAI Relay", Type: 1, Key: "sk-1", Group: "vip", Status: common.ChannelStatusEnabled, Models: "gpt-4o"}
			chPool := &model.Channel{Name: "Pro Pool", Type: 1, Key: "sk-2", Group: "default", Status: common.ChannelStatusEnabled, Models: "gpt-5"}
			chImage := &model.Channel{Name: "Flux Per-Image", Type: 1, Key: "sk-3", Group: "default", Status: common.ChannelStatusEnabled, Models: "flux-pro-test"}
			require.NoError(t, db.Create(chRelay).Error)
			require.NoError(t, db.Create(chPool).Error)
			require.NoError(t, db.Create(chImage).Error)

			plan := &model.SubscriptionPlan{Title: "Pro Monthly", PriceAmount: 70, Currency: "CNY", DurationUnit: "month", DurationValue: 1, TotalAmount: 2000000, Enabled: true}
			require.NoError(t, db.Create(plan).Error)

			nowUnix := now.Unix()
			hourBucket := nowUnix - (nowUnix % 3600)

			// Wallet top-up (100 CNY via alipay) + mirrored subscription TopUp (70 CNY) + direct subscription order (70 CNY via wxpay) + balance-paid subscription (70 CNY, excluded from cash).
			require.NoError(t, db.Create(&model.TopUp{
				UserId: userA.Id, Amount: 14, Money: 100, TradeNo: "TOPUP-1", PaymentMethod: "alipay", PaymentProvider: "epay",
				CreateTime: nowUnix - 120, CompleteTime: nowUnix - 60, Status: common.TopUpStatusSuccess,
			}).Error)
			require.NoError(t, db.Create(&model.TopUp{
				UserId: userB.Id, Amount: 0, Money: 70, TradeNo: "SUB-DIRECT-1", PaymentMethod: "wxpay", PaymentProvider: "epay",
				CreateTime: nowUnix - 120, CompleteTime: nowUnix - 30, Status: common.TopUpStatusSuccess,
			}).Error)
			require.NoError(t, db.Create(&model.SubscriptionOrder{
				UserId: userB.Id, PlanId: plan.Id, Money: 70, TradeNo: "SUB-DIRECT-1", PaymentMethod: "wxpay", PaymentProvider: "epay",
				CreateTime: nowUnix - 120, CompleteTime: nowUnix - 30, Status: common.TopUpStatusSuccess,
			}).Error)
			require.NoError(t, db.Create(&model.SubscriptionOrder{
				UserId: userA.Id, PlanId: plan.Id, Money: 70, TradeNo: "SUB-BAL-1", PaymentMethod: model.PaymentMethodBalance, PaymentProvider: model.PaymentProviderBalance,
				CreateTime: nowUnix - 100, CompleteTime: nowUnix - 20, Status: common.TopUpStatusSuccess,
			}).Error)
			// Admin test orders & subscriptions (must be excluded when exclude_admins=true).
			require.NoError(t, db.Create(&model.TopUp{
				UserId: adminTester.Id, Amount: 28, Money: 200, TradeNo: "ADMIN-TOPUP-1", PaymentMethod: "alipay", PaymentProvider: "epay",
				CreateTime: nowUnix - 90, CompleteTime: nowUnix - 15, Status: common.TopUpStatusSuccess,
			}).Error)
			require.NoError(t, db.Create(&model.SubscriptionOrder{
				UserId: rootTester.Id, PlanId: plan.Id, Money: 140, TradeNo: "ROOT-SUB-1", PaymentMethod: "wxpay", PaymentProvider: "epay",
				CreateTime: nowUnix - 80, CompleteTime: nowUnix - 10, Status: common.TopUpStatusSuccess,
			}).Error)

			// Active subscription remaining quota (1.5M) + redeemed code (500k) + checkin (100k).
			require.NoError(t, db.Create(&model.UserSubscription{
				UserId: userB.Id, PlanId: plan.Id, AmountTotal: 2000000, AmountUsed: 500000,
				StartTime: nowUnix - 3600, EndTime: nowUnix + 86400, Status: "active",
			}).Error)
			require.NoError(t, db.Create(&model.UserSubscription{
				UserId: adminTester.Id, PlanId: plan.Id, AmountTotal: 4000000, AmountUsed: 0,
				StartTime: nowUnix - 3600, EndTime: nowUnix + 86400, Status: "active",
			}).Error)
			// Redemption created by adminTester but redeemed by normal userA (must be KEPT).
			require.NoError(t, db.Create(&model.Redemption{
				UserId: adminTester.Id, Key: "12345678901234567890123456789012", Status: common.RedemptionCodeStatusUsed,
				Name: "Promo", Quota: 500000, CreatedTime: nowUnix - 500, RedeemedTime: nowUnix - 50, UsedUserId: userA.Id,
			}).Error)
			// Redemption redeemed by adminTester (must be EXCLUDED when exclude_admins=true).
			require.NoError(t, db.Create(&model.Redemption{
				UserId: rootTester.Id, Key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Status: common.RedemptionCodeStatusUsed,
				Name: "Admin Test Code", Quota: 750000, CreatedTime: nowUnix - 400, RedeemedTime: nowUnix - 45, UsedUserId: adminTester.Id,
			}).Error)
			require.NoError(t, db.Create(&model.Checkin{
				UserId: userB.Id, CheckinDate: todayDate, QuotaAwarded: 100000, CreatedAt: nowUnix - 40,
			}).Error)
			require.NoError(t, db.Create(&model.Checkin{
				UserId: adminTester.Id, CheckinDate: todayDate, QuotaAwarded: 300000, CreatedAt: nowUnix - 35,
			}).Error)

			// QuotaData: chRelay billed 5,000,000 quota ($10 = 70 CNY); chPool billed 2,500,000 quota ($5 = 35 CNY).
			require.NoError(t, db.Create(&model.QuotaData{
				UserID: userA.Id, Username: userA.Username, ModelName: "gpt-4o", CreatedAt: hourBucket,
				UseGroup: "vip", ChannelID: chRelay.Id, Count: 20, Quota: 5000000, TokenUsed: 12000,
			}).Error)
			require.NoError(t, db.Create(&model.QuotaData{
				UserID: userB.Id, Username: userB.Username, ModelName: "gpt-5", CreatedAt: hourBucket,
				UseGroup: "default", ChannelID: chPool.Id, Count: 10, Quota: 2500000, TokenUsed: 8000,
			}).Error)
			// Admin test QuotaData (must be excluded when exclude_admins=true).
			require.NoError(t, db.Create(&model.QuotaData{
				UserID: adminTester.Id, Username: adminTester.Username, ModelName: "gpt-4o", CreatedAt: hourBucket,
				UseGroup: "vip", ChannelID: chRelay.Id, Count: 50, Quota: 10000000, TokenUsed: 40000,
			}).Error)

			// Update profit cost settings via controller:
			// chRelay uses quick ratio mode (upstream 0.72 / platform 1.2 => derived cost_ratio=0.6),
			// chImage uses unit_price mode (upstream 0.056 / platform 0.07 => derived cost_ratio=0.8),
			// chPool ratio=0 & fixed=300/mo, default fee=1%, extra server=300/mo, exclude_admin_users=true.
			zeroRatio := 0.0
			relayUpstream := 0.72
			relayPlatform := 1.2
			imageUpstream := 0.056
			imagePlatform := 0.07
			cfgPayload := operation_setting.ProfitAnalyticsSetting{
				ExcludeAdminUsers: true,
				DefaultCostRatio:  0.5,
				PaymentFeeRate:    0.01,
				PaymentFeeRates:   map[string]float64{"alipay": 0.02},
				ChannelCosts: map[string]operation_setting.ProfitChannelCostConfig{
					strconv.Itoa(chRelay.Id): {
						PricingMode:      operation_setting.ProfitPricingModeRatio,
						UpstreamValue:    &relayUpstream,
						PlatformValue:    &relayPlatform,
						MonthlyFixedCost: 0,
						Note:             "API relay",
					},
					strconv.Itoa(chPool.Id): {CostRatio: &zeroRatio, MonthlyFixedCost: 300, Note: "Pro pool monthly"},
					strconv.Itoa(chImage.Id): {
						PricingMode:      operation_setting.ProfitPricingModeUnitPrice,
						UpstreamValue:    &imageUpstream,
						PlatformValue:    &imagePlatform,
						MonthlyFixedCost: 0,
						Note:             "Per-image markup",
					},
				},
				ExtraFixedCosts: []operation_setting.ProfitFixedCostItem{
					{Id: "srv-1", Name: "US+HK Servers", Category: "server", MonthlyCost: 300, Enabled: true},
				},
			}
			rawCfg, err := common.Marshal(cfgPayload)
			require.NoError(t, err)
			rec := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(rec)
			ctx.Request = httptest.NewRequest(http.MethodPut, "/api/option/profit_analytics", bytes.NewReader(rawCfg))
			ctx.Request.Header.Set("Content-Type", "application/json")
			ctx.Set("id", 1)
			ctx.Set("username", "root")
			ctx.Set("role", common.RoleRootUser)
			UpdateProfitAnalyticsSettings(ctx)
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

			// Query 30-day profit analytics (rangeDays=30 -> amortizeFactor=1.0 -> fixed=300+300=600).
			rec = httptest.NewRecorder()
			ctx, _ = gin.CreateTestContext(rec)
			ctx.Request = httptest.NewRequest(http.MethodGet, "/api/data/profit?days=30", nil)
			GetProfitAnalytics(ctx)
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

			var profitResp struct {
				Success bool                        `json:"success"`
				Data    model.ProfitAnalyticsReport `json:"data"`
			}
			require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &profitResp))
			require.True(t, profitResp.Success)

			report := profitResp.Data
			assert.Equal(t, 30, report.Summary.RangeDays)
			assert.True(t, report.Summary.ExcludeAdminUsers)
			assert.Equal(t, 2, report.Summary.ExcludedAdminCount)
			assert.InDelta(t, 1.0, report.PricingRef.DefaultGroupRatio, 0.0001)
			assert.InDelta(t, 1.2, report.PricingRef.GroupRatios["vip"], 0.0001)
			// Cash revenue = 100 (wallet topup) + 70 (direct subscription) = 170; mirrored topup NOT double-counted; balance sub = 70 reported separately.
			assert.InDelta(t, 170.0, report.Summary.CashRevenue, 0.01)
			assert.InDelta(t, 100.0, report.Summary.WalletTopUpMoney, 0.01)
			assert.Equal(t, 1, report.Summary.WalletTopUpOrders)
			assert.InDelta(t, 70.0, report.Summary.SubscriptionDirectMoney, 0.01)
			assert.Equal(t, 1, report.Summary.SubscriptionDirectOrders)
			assert.InDelta(t, 70.0, report.Summary.SubscriptionBalanceMoney, 0.01)
			assert.Equal(t, 1, report.Summary.SubscriptionBalanceCount)
			// Payment fee = 100*2% (alipay) + 70*1% (wxpay default) = 2.70.
			assert.InDelta(t, 2.70, report.Summary.PaymentFeeCost, 0.01)
			// Billed = (5M + 2.5M)/500k = $15 = 105 CNY. Upstream variable cost = 70*0.6 + 35*0 = 42 CNY.
			assert.InDelta(t, 15.0, report.Summary.BilledUSD, 0.01)
			assert.InDelta(t, 105.0, report.Summary.BilledLocal, 0.01)
			assert.InDelta(t, 42.0, report.Summary.UpstreamVariableCost, 0.01)
			assert.InDelta(t, 300.0, report.Summary.ChannelFixedCost, 0.01)
			assert.InDelta(t, 300.0, report.Summary.PlatformFixedCost, 0.01)
			assert.InDelta(t, 63.0, report.Summary.BilledGrossProfit, 0.01)
			assert.Equal(t, int64(1500000), report.Liability.UserRemainingQuota)
			assert.Equal(t, int64(1500000), report.Liability.SubscriptionRemainingQuota)
			assert.Equal(t, int64(500000), report.Liability.RedeemedQuota)
			assert.Equal(t, int64(100000), report.Liability.CheckinQuota)
			assert.Len(t, report.DailyTrend, 30)
			assert.Len(t, report.Models, 2)
			assert.Len(t, report.Groups, 2)
			assert.Len(t, report.RecentOrders, 3)
			assert.Equal(t, 2, report.Summary.ActiveUsers)
			assert.Equal(t, 2, report.Summary.PayingUsers)

			// Verify per-channel pricing_mode derivation and auto-fill suggestions.
			chByID := make(map[int]model.ProfitChannelBreakdown, len(report.Channels))
			for _, ch := range report.Channels {
				chByID[ch.ChannelId] = ch
			}
			require.Contains(t, chByID, chRelay.Id)
			assert.Equal(t, operation_setting.ProfitPricingModeRatio, chByID[chRelay.Id].PricingMode)
			assert.InDelta(t, 0.6, chByID[chRelay.Id].CostRatio, 0.0001)
			assert.InDelta(t, 1.2, chByID[chRelay.Id].SuggestedGroupRatio, 0.0001)
			require.NotNil(t, chByID[chRelay.Id].UpstreamValue)
			require.NotNil(t, chByID[chRelay.Id].PlatformValue)
			assert.InDelta(t, 0.72, *chByID[chRelay.Id].UpstreamValue, 0.0001)
			assert.InDelta(t, 1.2, *chByID[chRelay.Id].PlatformValue, 0.0001)

			require.Contains(t, chByID, chImage.Id)
			assert.Equal(t, operation_setting.ProfitPricingModeUnitPrice, chByID[chImage.Id].PricingMode)
			assert.InDelta(t, 0.8, chByID[chImage.Id].CostRatio, 0.0001)
			assert.InDelta(t, 0.07, chByID[chImage.Id].SuggestedUnitPrice, 0.0001)
			assert.Equal(t, "flux-pro-test", chByID[chImage.Id].SuggestedUnitPriceModel)

			// Query with exclude_admins=false -> admin & root test data are included.
			rec = httptest.NewRecorder()
			ctx, _ = gin.CreateTestContext(rec)
			ctx.Request = httptest.NewRequest(http.MethodGet, "/api/data/profit?days=30&exclude_admins=false", nil)
			GetProfitAnalytics(ctx)
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
			var includeAdminResp struct {
				Success bool                        `json:"success"`
				Data    model.ProfitAnalyticsReport `json:"data"`
			}
			require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &includeAdminResp))
			require.True(t, includeAdminResp.Success)
			assert.False(t, includeAdminResp.Data.Summary.ExcludeAdminUsers)
			assert.Equal(t, 0, includeAdminResp.Data.Summary.ExcludedAdminCount)
			assert.InDelta(t, 510.0, includeAdminResp.Data.Summary.CashRevenue, 0.01)
			assert.InDelta(t, 245.0, includeAdminResp.Data.Summary.BilledLocal, 0.01)
			assert.Equal(t, 3, includeAdminResp.Data.Summary.ActiveUsers)
			assert.Equal(t, 4, includeAdminResp.Data.Summary.PayingUsers)
			assert.Equal(t, int64(15500000), includeAdminResp.Data.Liability.UserRemainingQuota)
			assert.Equal(t, int64(5500000), includeAdminResp.Data.Liability.SubscriptionRemainingQuota)
			assert.Equal(t, int64(1250000), includeAdminResp.Data.Liability.RedeemedQuota)
			assert.Equal(t, int64(400000), includeAdminResp.Data.Liability.CheckinQuota)
			assert.Len(t, includeAdminResp.Data.RecentOrders, 5)

			// Invalid exclude_admins parameter returns 400.
			rec = httptest.NewRecorder()
			ctx, _ = gin.CreateTestContext(rec)
			ctx.Request = httptest.NewRequest(http.MethodGet, "/api/data/profit?days=30&exclude_admins=invalid", nil)
			GetProfitAnalytics(ctx)
			assert.Equal(t, http.StatusBadRequest, rec.Code)

			// Invalid quick-calc setting (platform_value <= 0) returns 400.
			badPlatform := 0.0
			badCfg := operation_setting.ProfitAnalyticsSetting{
				DefaultCostRatio: 0.5,
				ChannelCosts: map[string]operation_setting.ProfitChannelCostConfig{
					strconv.Itoa(chRelay.Id): {
						PricingMode:   operation_setting.ProfitPricingModeRatio,
						UpstreamValue: &relayUpstream,
						PlatformValue: &badPlatform,
					},
				},
			}
			rawBadCfg, err := common.Marshal(badCfg)
			require.NoError(t, err)
			rec = httptest.NewRecorder()
			ctx, _ = gin.CreateTestContext(rec)
			ctx.Request = httptest.NewRequest(http.MethodPut, "/api/option/profit_analytics", bytes.NewReader(rawBadCfg))
			ctx.Request.Header.Set("Content-Type", "application/json")
			UpdateProfitAnalyticsSettings(ctx)
			assert.Equal(t, http.StatusBadRequest, rec.Code)

			// Seed media traffic & objects for Media Traffic analytics verification.
			require.NoError(t, db.Create(&model.MediaDailyTraffic{
				UserId: userA.Id, TrafficDate: todayDate, UsedBytes: 450 * operation_setting.BytesPerMiB, UploadCount: 4, UpdatedAt: nowUnix,
			}).Error)
			require.NoError(t, db.Create(&model.MediaDailyTraffic{
				UserId: userB.Id, TrafficDate: yesterdayDate, UsedBytes: 100 * operation_setting.BytesPerMiB, UploadCount: 2, UpdatedAt: nowUnix - 86400,
			}).Error)
			require.NoError(t, db.Create(&model.MediaTrafficOverride{
				UserId: userA.Id, ExtraDailyBytes: 500 * operation_setting.BytesPerMiB, ExpiresAt: nowUnix + 86400, Note: "VIP boost", UpdatedAt: nowUnix,
			}).Error)
			require.NoError(t, db.Create(&model.MediaRelayObject{
				UserId: userA.Id, ObjectKey: "media/a1.png", SHA256: "a1", SizeBytes: 20 * operation_setting.BytesPerMiB,
				ContentType: "image/png", FileName: "hero.png", PublicURL: "https://cdn.example/a1.png",
				Status: model.MediaRelayObjectStatusReady, TrafficDate: todayDate, ExpiresAt: nowUnix + 86400, CreatedAt: nowUnix,
			}).Error)
			require.NoError(t, db.Create(&model.MediaRelayObject{
				UserId: userA.Id, ObjectKey: "media/a2.mp4", SHA256: "a2", SizeBytes: 80 * operation_setting.BytesPerMiB,
				ContentType: "video/mp4", FileName: "clip.mp4", PublicURL: "https://cdn.example/a2.mp4",
				Status: model.MediaRelayObjectStatusReady, TrafficDate: todayDate, ExpiresAt: nowUnix - 10, CreatedAt: nowUnix - 100,
			}).Error)
			require.NoError(t, db.Create(&model.MediaRelayObject{
				UserId: userB.Id, ObjectKey: "media/b1.pdf", SHA256: "b1", SizeBytes: 10 * operation_setting.BytesPerMiB,
				ContentType: "application/pdf", FileName: "spec.pdf", PublicURL: "https://cdn.example/b1.pdf",
				Status: model.MediaRelayObjectStatusAborted, TrafficDate: yesterdayDate, ExpiresAt: nowUnix + 86400, CreatedAt: nowUnix - 86400,
			}).Error)

			rec = httptest.NewRecorder()
			ctx, _ = gin.CreateTestContext(rec)
			ctx.Request = httptest.NewRequest(http.MethodGet, "/api/data/media_traffic?days=7", nil)
			GetAdminMediaTrafficAnalytics(ctx)
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

			var mediaResp struct {
				Success bool                              `json:"success"`
				Data    model.MediaTrafficAnalyticsReport `json:"data"`
			}
			require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &mediaResp))
			require.True(t, mediaResp.Success)
			assert.Equal(t, 450*operation_setting.BytesPerMiB, mediaResp.Data.Summary.TodayUsedBytes)
			assert.Equal(t, 100*operation_setting.BytesPerMiB, mediaResp.Data.Summary.YesterdayUsedBytes)
			assert.Equal(t, 550*operation_setting.BytesPerMiB, mediaResp.Data.Summary.RangeUsedBytes)
			assert.Equal(t, int64(1), mediaResp.Data.Summary.ActiveObjectsCount)
			assert.Equal(t, 20*operation_setting.BytesPerMiB, mediaResp.Data.Summary.ActiveObjectsBytes)
			assert.Equal(t, int64(2), mediaResp.Data.Summary.ReadyObjectsCount)
			assert.Equal(t, int64(1), mediaResp.Data.Summary.AbortedObjectsCount)
			assert.Equal(t, 1, mediaResp.Data.Summary.ActiveOverridesCount)
			assert.Len(t, mediaResp.Data.DailyTrend, 7)
			assert.Len(t, mediaResp.Data.TopUsers, 2)
			assert.Equal(t, "alice", mediaResp.Data.TopUsers[0].Username)

			// Filterable paginated media objects endpoint.
			rec = httptest.NewRecorder()
			ctx, _ = gin.CreateTestContext(rec)
			ctx.Request = httptest.NewRequest(http.MethodGet, "/api/data/media_traffic/objects?status=ready&category=image&keyword=hero", nil)
			ListAdminMediaTrafficObjects(ctx)
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

			var objResp struct {
				Success bool `json:"success"`
				Data    struct {
					Items []model.MediaRelayObjectAdminView `json:"items"`
					Total int64                             `json:"total"`
				} `json:"data"`
			}
			require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &objResp))
			require.True(t, objResp.Success)
			assert.Equal(t, int64(1), objResp.Data.Total)
			require.Len(t, objResp.Data.Items, 1)
			assert.Equal(t, "hero.png", objResp.Data.Items[0].FileName)
			assert.Equal(t, "alice", objResp.Data.Items[0].Username)
			assert.False(t, objResp.Data.Items[0].Expired)
		})
	}
}
