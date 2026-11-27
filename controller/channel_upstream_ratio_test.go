package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFetchChannelUpstreamRatios(t *testing.T) {
	gin.SetMode(gin.TestMode)

	pricingServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pricing" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"success": true,
			"group_ratio": {"vip": 0.8, "default": 1, "claude": 1.25, "auto": 1, "invalid": -0.5},
			"usable_group": {"default": "Default", "vip": "VIP Tier", "claude": "Claude Route"}
		}`))
	}))
	defer pricingServer.Close()

	t.Run("fetches and sorts upstream group ratios when base_url ends with /v1", func(t *testing.T) {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = httptest.NewRequest(
			http.MethodPost,
			"/api/channel/fetch_upstream_ratios",
			bytes.NewBufferString(`{"type":1,"base_url":"`+pricingServer.URL+`/v1"}`),
		)
		ctx.Request.Header.Set("Content-Type", "application/json")

		FetchChannelUpstreamRatios(ctx)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

		var resp struct {
			Success bool                               `json:"success"`
			Data    fetchChannelUpstreamRatiosResponse `json:"data"`
		}
		require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &resp))
		require.True(t, resp.Success)
		assert.True(t, resp.Data.Supported)
		assert.Equal(t, pricingServer.URL+"/api/pricing", resp.Data.Source)
		require.Len(t, resp.Data.Groups, 3)
		assert.Equal(t, UpstreamGroupRatioOption{Group: "default", Ratio: 1, Description: "Default"}, resp.Data.Groups[0])
		assert.Equal(t, UpstreamGroupRatioOption{Group: "claude", Ratio: 1.25, Description: "Claude Route"}, resp.Data.Groups[1])
		assert.Equal(t, UpstreamGroupRatioOption{Group: "vip", Ratio: 0.8, Description: "VIP Tier"}, resp.Data.Groups[2])
	})

	t.Run("returns supported=false cleanly for non-pricing upstream", func(t *testing.T) {
		plainServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
		}))
		defer plainServer.Close()

		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = httptest.NewRequest(
			http.MethodPost,
			"/api/channel/fetch_upstream_ratios",
			bytes.NewBufferString(`{"type":1,"base_url":"`+plainServer.URL+`"}`),
		)
		ctx.Request.Header.Set("Content-Type", "application/json")

		FetchChannelUpstreamRatios(ctx)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

		var resp struct {
			Success bool                               `json:"success"`
			Data    fetchChannelUpstreamRatiosResponse `json:"data"`
		}
		require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &resp))
		require.True(t, resp.Success)
		assert.False(t, resp.Data.Supported)
		assert.Empty(t, resp.Data.Groups)
	})
}

func TestChannelUpstreamRatioValidation(t *testing.T) {
	validZero := `{"upstream_group_ratio":0,"upstream_group_name":"free"}`
	require.NoError(t, (&model.Channel{Setting: &validZero}).ValidateSettings())

	validDecimal := `{"upstream_group_ratio":0.75,"upstream_group_name":"vip"}`
	require.NoError(t, (&model.Channel{Setting: &validDecimal}).ValidateSettings())

	invalidNeg := `{"upstream_group_ratio":-0.1}`
	require.Error(t, (&model.Channel{Setting: &invalidNeg}).ValidateSettings())

	invalidTooBig := `{"upstream_group_ratio":10001}`
	require.Error(t, (&model.Channel{Setting: &invalidTooBig}).ValidateSettings())
}

func TestProfitAnalyticsAndSiteOverviewAutoChannelUpstreamRatio(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupAccessTokenAudit(t)
	previousOptionMap := common.OptionMap
	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = make(map[string]string)
	}
	common.OptionMapRWMutex.Unlock()
	previousProfitCfg := operation_setting.GetProfitAnalyticsSettingSnapshot()
	previousGroupRatio := ratio_setting.GroupRatio2JSONString()
	previousDisplayType := operation_setting.GetQuotaDisplayType()
	previousExchangeRate := operation_setting.USDExchangeRate

	t.Cleanup(func() {
		if optionMap, err := previousProfitCfg.ToOptionMap(); err == nil && model.DB != nil {
			_ = model.UpdateOptionsBulk(optionMap)
		}
		_ = ratio_setting.UpdateGroupRatioByJSONString(previousGroupRatio)
		operation_setting.GetGeneralSetting().QuotaDisplayType = previousDisplayType
		operation_setting.USDExchangeRate = previousExchangeRate
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptionMap
		common.OptionMapRWMutex.Unlock()
	})

	require.NoError(t, model.DB.AutoMigrate(
		&model.Option{},
		&model.SystemTask{},
		&model.Channel{},
		&model.QuotaData{},
		&model.TopUp{},
		&model.SubscriptionPlan{},
		&model.SubscriptionOrder{},
		&model.UserSubscription{},
		&model.Redemption{},
		&model.Checkin{},
	))

	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	operation_setting.USDExchangeRate = 1
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1.5,"vip":1.2}`))

	chAutoSetting := `{"upstream_group_ratio":0.6,"upstream_group_name":"upstream_vip"}`
	chAuto := &model.Channel{
		Name:    "Auto Ratio Relay",
		Type:    1,
		Key:     "sk-auto",
		Group:   "default,vip",
		Models:  "gpt-4o",
		Status:  common.ChannelStatusEnabled,
		Setting: &chAutoSetting,
	}
	require.NoError(t, model.DB.Create(chAuto).Error)

	chOverrideSetting := `{"upstream_group_ratio":0.9}`
	chOverride := &model.Channel{
		Name:    "Overridden Relay",
		Type:    1,
		Key:     "sk-override",
		Group:   "default",
		Models:  "gpt-4o",
		Status:  common.ChannelStatusEnabled,
		Setting: &chOverrideSetting,
	}
	require.NoError(t, model.DB.Create(chOverride).Error)

	chLegacy := &model.Channel{
		Name:   "Legacy Relay",
		Type:   1,
		Key:    "sk-legacy",
		Group:  "default",
		Models: "gpt-4o",
		Status: common.ChannelStatusEnabled,
	}
	require.NoError(t, model.DB.Create(chLegacy).Error)

	overrideVal := 0.25
	cfg := operation_setting.ProfitAnalyticsSetting{
		ExcludeAdminUsers: false,
		DefaultCostRatio:  0.5,
		ChannelCosts: map[string]operation_setting.ProfitChannelCostConfig{
			strconv.Itoa(chOverride.Id): {
				CostRatio: &overrideVal,
			},
		},
	}
	optionMap, err := cfg.ToOptionMap()
	require.NoError(t, err)
	require.NoError(t, model.UpdateOptionsBulk(optionMap))

	now := time.Now().Truncate(time.Hour)
	bucket := now.Unix()
	// 1 USD = 500,000 quota
	// chAuto on default (platform 1.5, upstream 0.6 -> 40%): billed $15 -> cost $6
	// chAuto on vip (platform 1.2, upstream 0.6 -> 50%): billed $12 -> cost $6
	// chOverride (manual override 25% beats channel 0.9): billed $10 -> cost $2.5
	// chLegacy (fallback default 50%): billed $10 -> cost $5
	// Total billed = $47, total upstream variable cost = $19.5
	require.NoError(t, model.DB.Create(&model.QuotaData{
		UserID: 1001, Username: "alice", ModelName: "gpt-4o", CreatedAt: bucket,
		Count: 1, Quota: 15 * 500_000, TokenUsed: 1000, ChannelID: chAuto.Id, UseGroup: "default",
	}).Error)
	require.NoError(t, model.DB.Create(&model.QuotaData{
		UserID: 1002, Username: "bob", ModelName: "gpt-4o", CreatedAt: bucket,
		Count: 1, Quota: 12 * 500_000, TokenUsed: 1000, ChannelID: chAuto.Id, UseGroup: "vip",
	}).Error)
	require.NoError(t, model.DB.Create(&model.QuotaData{
		UserID: 1003, Username: "carol", ModelName: "gpt-4o", CreatedAt: bucket,
		Count: 1, Quota: 10 * 500_000, TokenUsed: 1000, ChannelID: chOverride.Id, UseGroup: "default",
	}).Error)
	require.NoError(t, model.DB.Create(&model.QuotaData{
		UserID: 1004, Username: "dave", ModelName: "gpt-4o", CreatedAt: bucket,
		Count: 1, Quota: 10 * 500_000, TokenUsed: 1000, ChannelID: chLegacy.Id, UseGroup: "default",
	}).Error)

	report, err := model.GetProfitAnalytics(bucket-3600, bucket+3600, model.ProfitAnalyticsOptions{})
	require.NoError(t, err)
	assert.InDelta(t, 47.0, report.Summary.BilledLocal, 0.01)
	assert.InDelta(t, 19.5, report.Summary.UpstreamVariableCost, 0.01)

	byID := make(map[int]model.ProfitChannelBreakdown, len(report.Channels))
	for _, item := range report.Channels {
		byID[item.ChannelId] = item
	}

	autoRow := byID[chAuto.Id]
	assert.Equal(t, model.ProfitCostSourceChannel, autoRow.CostSource)
	assert.False(t, autoRow.CustomCostRatio)
	require.NotNil(t, autoRow.ChannelUpstreamRatio)
	assert.InDelta(t, 0.6, *autoRow.ChannelUpstreamRatio, 1e-6)
	assert.Equal(t, "upstream_vip", autoRow.ChannelUpstreamGroup)
	assert.InDelta(t, 12.0, autoRow.VariableCost, 0.01)
	assert.InDelta(t, 12.0/27.0, autoRow.CostRatio, 0.0001)

	overrideRow := byID[chOverride.Id]
	assert.Equal(t, model.ProfitCostSourceOverride, overrideRow.CostSource)
	assert.True(t, overrideRow.CustomCostRatio)
	assert.InDelta(t, 2.5, overrideRow.VariableCost, 0.01)

	legacyRow := byID[chLegacy.Id]
	assert.Equal(t, model.ProfitCostSourceDefault, legacyRow.CostSource)
	assert.False(t, legacyRow.CustomCostRatio)
	assert.InDelta(t, 5.0, legacyRow.VariableCost, 0.01)

	overview, err := model.GetSiteOverviewBase(model.SiteOverviewOptions{
		Range: "24h",
		Now:   now.Add(10 * time.Minute),
	})
	require.NoError(t, err)
	assert.InDelta(t, 19.5, overview.Finance.UpstreamVariableCost, 0.01)
}
