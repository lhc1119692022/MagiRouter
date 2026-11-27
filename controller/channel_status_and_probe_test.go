package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestSelectChannelTestModelFixedAndRandom(t *testing.T) {
	pinned := "gpt-4o-mini"
	channel := &model.Channel{
		TestModel: &pinned,
		Models:    "gpt-4o-mini,claude-sonnet-4-5,claude-opus-4-1,sora-2,flux-pro,whisper-1,gemini-2.5-flash",
	}

	assert.Equal(t, "explicit-model", selectChannelTestModel(channel, "explicit-model", operation_setting.ChannelTestModelStrategyRandom, "explicit"))
	assert.Equal(t, "gpt-4o-mini", selectChannelTestModel(channel, "", operation_setting.ChannelTestModelStrategyFixed, ""))

	allowed := map[string]bool{
		"gpt-4o-mini":       true,
		"claude-sonnet-4-5": true,
		"gemini-2.5-flash":  true,
	}
	seen := map[string]bool{}
	for range 80 {
		chosen := selectChannelTestModel(channel, "", operation_setting.ChannelTestModelStrategyRandom, "opus")
		require.True(t, allowed[chosen], "unexpected model chosen: %s", chosen)
		seen[chosen] = true
	}
	assert.GreaterOrEqual(t, len(seen), 2, "random strategy should rotate across multiple eligible models")

	mediaOnly := &model.Channel{
		Models: "sora-2,flux-pro",
	}
	assert.Equal(t, "sora-2", selectChannelTestModel(mediaOnly, "", operation_setting.ChannelTestModelStrategyRandom, ""))
}

func TestSampleChannelsForScheduledTest(t *testing.T) {
	channels := make([]*model.Channel, 10)
	for i := range 10 {
		channels[i] = &model.Channel{Id: i + 1}
	}

	all := sampleChannelsForScheduledTest(channels, 100)
	assert.Len(t, all, 10)

	sampled := sampleChannelsForScheduledTest(channels, 30)
	assert.Len(t, sampled, 3)
	seen := map[int]bool{}
	for _, ch := range sampled {
		assert.False(t, seen[ch.Id], "duplicate channel id %d", ch.Id)
		seen[ch.Id] = true
	}

	minimal := sampleChannelsForScheduledTest(channels[:2], 1)
	assert.Len(t, minimal, 1)
}

func TestChannelTestCooldownAndInFlightCooperation(t *testing.T) {
	now := int64(1_764_100_000)
	channels := []*model.Channel{
		{Id: 1, Status: common.ChannelStatusEnabled, TestTime: now - 120},      // recently tested in Channel Management -> skip
		{Id: 2, Status: common.ChannelStatusEnabled, TestTime: now - 2000},     // stale -> include
		{Id: 3, Status: common.ChannelStatusAutoDisabled, TestTime: now - 120}, // awaiting recovery -> include
	}

	filtered := filterChannelsByScheduledCooldown(channels, operation_setting.ChannelTestModeScheduledAll, 30, now)
	require.Len(t, filtered, 2)
	assert.Equal(t, 2, filtered[0].Id)
	assert.Equal(t, 3, filtered[1].Id)

	passive := filterChannelsByScheduledCooldown(channels, operation_setting.ChannelTestModePassiveRecovery, 30, now)
	assert.Len(t, passive, 3)

	require.True(t, tryAcquireChannelTestSlot(9999))
	assert.False(t, tryAcquireChannelTestSlot(9999))
	releaseChannelTestSlot(9999)
	assert.True(t, tryAcquireChannelTestSlot(9999))
	releaseChannelTestSlot(9999)
}

func setupChannelStatusTestDB(t *testing.T) {
	t.Helper()
	prevDB := model.DB
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.PerfMetric{}, &model.Ability{}))
	model.DB = db
	t.Cleanup(func() {
		model.DB = prevDB
		perfmetrics.ResetChannelProbesForTest()
	})
}

func TestGetPerfMetricsGroupsAndUptimeHealth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupChannelStatusTestDB(t)
	perfmetrics.ResetChannelProbesForTest()

	prevGroupRatio := ratio_setting.GetGroupRatioCopy()
	prevUserUsable := setting.GetUserUsableGroupsCopy()
	t.Cleanup(func() {
		if raw, err := common.Marshal(prevGroupRatio); err == nil {
			_ = ratio_setting.UpdateGroupRatioByJSONString(string(raw))
		}
		if raw, err := common.Marshal(prevUserUsable); err == nil {
			_ = setting.UpdateUserUsableGroupsByJSONString(string(raw))
		}
	})

	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1.0,"vip":1.5,"media":1.0}`))
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认分组","vip":"高速专线","media":"多模态生图视频"}`))

	nowTs := time.Now().Unix()
	bucketTs := nowTs - (nowTs % 3600)
	require.NoError(t, model.DB.Create(&model.Ability{Group: "default", Model: "gpt-4o-mini", ChannelId: 1, Enabled: true}).Error)
	require.NoError(t, model.DB.Create(&model.Ability{Group: "default", Model: "claude-sonnet-4-5", ChannelId: 1, Enabled: true}).Error)
	require.NoError(t, model.DB.Create(&model.Ability{Group: "vip", Model: "claude-opus-4-1", ChannelId: 2, Enabled: true}).Error)
	require.NoError(t, model.DB.Create(&model.Ability{Group: "media", Model: "gpt-image-1", ChannelId: 3, Enabled: true}).Error)
	require.NoError(t, model.DB.Create(&model.Ability{Group: "media", Model: "sora-2", ChannelId: 3, Enabled: true}).Error)

	require.NoError(t, model.UpsertPerfMetric(&model.PerfMetric{
		ModelName:      "claude-sonnet-4-5",
		Group:          "default",
		BucketTs:       bucketTs,
		RequestCount:   20,
		SuccessCount:   20,
		TotalLatencyMs: 24000,
		TtftSumMs:      9000,
		TtftCount:      20,
		OutputTokens:   12000,
		GenerationMs:   200000,
		PromptTokens:   40000,
		CachedTokens:   16000,
	}))
	require.NoError(t, model.UpsertPerfMetric(&model.PerfMetric{
		ModelName:      "claude-opus-4-1",
		Group:          "vip",
		BucketTs:       bucketTs,
		RequestCount:   10,
		SuccessCount:   7,
		TotalLatencyMs: 25000,
		TtftSumMs:      8000,
		TtftCount:      10,
	}))
	require.NoError(t, model.UpsertPerfMetric(&model.PerfMetric{
		ModelName:      "sora-2",
		Group:          "media",
		BucketTs:       bucketTs,
		RequestCount:   12,
		SuccessCount:   12,
		TotalLatencyMs: 216000,
	}))

	perfmetrics.RecordChannelProbe([]string{"default"}, perfmetrics.ProbeSample{
		Timestamp: nowTs,
		Model:     "gpt-4o-mini",
		Success:   true,
		LatencyMs: 320,
	})

	// 1. Group status API
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/perf-metrics/groups?hours=24", nil)
	GetPerfMetricsGroups(ctx)
	require.Equal(t, http.StatusOK, recorder.Code)

	var groupsPayload struct {
		Success bool                       `json:"success"`
		Data    groupChannelStatusResponse `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &groupsPayload))
	require.True(t, groupsPayload.Success)
	require.Len(t, groupsPayload.Data.Groups, 3)
	assert.Equal(t, "default", groupsPayload.Data.Groups[0].Group)
	assert.Equal(t, "operational", groupsPayload.Data.Groups[0].Status)
	assert.Equal(t, []string{perfmetrics.ModelKindText}, groupsPayload.Data.Groups[0].Capabilities)
	assert.Equal(t, perfmetrics.MetricFocusCacheRate, groupsPayload.Data.Groups[0].MetricFocus)
	assert.False(t, groupsPayload.Data.Groups[0].MediaOnly)
	require.NotNil(t, groupsPayload.Data.Groups[0].CacheHitRate)
	assert.InDelta(t, 40.0, *groupsPayload.Data.Groups[0].CacheHitRate, 0.01)
	assert.Equal(t, 2, groupsPayload.Data.Groups[0].EnabledModels)
	assert.Equal(t, float64(100), groupsPayload.Data.Groups[0].SuccessRate)
	require.NotNil(t, groupsPayload.Data.Groups[0].RecentProbe)
	assert.Equal(t, "gpt-4o-mini", groupsPayload.Data.Groups[0].RecentProbe.TestedModel)
	assert.Equal(t, "media", groupsPayload.Data.Groups[1].Group)
	assert.Equal(t, []string{perfmetrics.ModelKindImage, perfmetrics.ModelKindVideo}, groupsPayload.Data.Groups[1].Capabilities)
	assert.True(t, groupsPayload.Data.Groups[1].MediaOnly)
	assert.Equal(t, perfmetrics.MetricFocusDuration, groupsPayload.Data.Groups[1].MetricFocus)
	assert.Equal(t, int64(18000), groupsPayload.Data.Groups[1].AvgLatencyMs)
	assert.Equal(t, "vip", groupsPayload.Data.Groups[2].Group)
	assert.Equal(t, "degraded", groupsPayload.Data.Groups[2].Status)
	assert.Equal(t, float64(70), groupsPayload.Data.Groups[2].SuccessRate)

	// 2. Zero-token Uptime Health API: healthy group returns 200
	healthyRec := httptest.NewRecorder()
	healthyCtx, _ := gin.CreateTestContext(healthyRec)
	healthyCtx.Request = httptest.NewRequest(http.MethodGet, "/api/uptime/health?group=default&hours=1&min_success_rate=95&min_requests=5", nil)
	GetUptimeHealth(healthyCtx)
	assert.Equal(t, http.StatusOK, healthyRec.Code)

	// 3. Degraded group below threshold returns 503
	degradedRec := httptest.NewRecorder()
	degradedCtx, _ := gin.CreateTestContext(degradedRec)
	degradedCtx.Request = httptest.NewRequest(http.MethodGet, "/api/uptime/health?group=vip&hours=1&min_success_rate=85&min_requests=5", nil)
	GetUptimeHealth(degradedCtx)
	assert.Equal(t, http.StatusServiceUnavailable, degradedRec.Code)

	// 4. Group with no active channels returns 503
	emptyRec := httptest.NewRecorder()
	emptyCtx, _ := gin.CreateTestContext(emptyRec)
	emptyCtx.Request = httptest.NewRequest(http.MethodGet, "/api/uptime/health?group=nonexistent", nil)
	GetUptimeHealth(emptyCtx)
	assert.Equal(t, http.StatusServiceUnavailable, emptyRec.Code)
}

func TestFilterChannelsByIdleTraffic(t *testing.T) {
	perfmetrics.ResetChannelTrafficForTest()
	t.Cleanup(perfmetrics.ResetChannelTrafficForTest)

	now := int64(1764000000)
	perfmetrics.RecordChannelTraffic(101, now-10*60) // active 10m ago -> skip when idle=30m
	perfmetrics.RecordChannelTraffic(102, now-35*60) // idle 35m -> must probe
	perfmetrics.RecordChannelTraffic(104, now-2*60)  // auto-disabled -> never skip recovery probe

	channels := []*model.Channel{
		{Id: 101, Status: common.ChannelStatusEnabled},
		{Id: 102, Status: common.ChannelStatusEnabled},
		{Id: 103, Status: common.ChannelStatusEnabled}, // never had traffic -> must probe
		{Id: 104, Status: common.ChannelStatusAutoDisabled},
	}

	filtered := filterChannelsByIdleTraffic(channels, operation_setting.ChannelTestModeScheduledAll, 30, now)
	ids := make([]int, 0, len(filtered))
	for _, ch := range filtered {
		ids = append(ids, ch.Id)
	}
	assert.Equal(t, []int{102, 103, 104}, ids)

	// idleMinutes = 0 disables idle skipping
	allKept := filterChannelsByIdleTraffic(channels, operation_setting.ChannelTestModeScheduledAll, 0, now)
	assert.Len(t, allKept, 4)
}

func TestGetPerfMetricsGroupsFiltersOfflineModelsAndUsesRecentTrend(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupChannelStatusTestDB(t)
	perfmetrics.ResetChannelProbesForTest()

	prevGroupRatio := ratio_setting.GetGroupRatioCopy()
	prevUserUsable := setting.GetUserUsableGroupsCopy()
	t.Cleanup(func() {
		if raw, err := common.Marshal(prevGroupRatio); err == nil {
			_ = ratio_setting.UpdateGroupRatioByJSONString(string(raw))
		}
		if raw, err := common.Marshal(prevUserUsable); err == nil {
			_ = setting.UpdateUserUsableGroupsByJSONString(string(raw))
		}
	})

	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"promo":0.03,"aws":0.55}`))
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"promo":"限时特惠","aws":"Claude AWS"}`))

	nowTs := time.Now().Unix()
	curBucket := nowTs - (nowTs % 3600)
	oldBucket := curBucket - 4*3600

	require.NoError(t, model.DB.AutoMigrate(&model.Model{}))
	t.Cleanup(func() {
		_ = model.DB.Where("1 = 1").Delete(&model.Model{}).Error
	})

	// Group "promo": only 2 deepseek models remain enabled; 2 removed gpt models still have stale failing metrics and probe history.
	// A third model is still on an enabled channel but hidden (status=0) in Model Management and must also be excluded.
	require.NoError(t, model.DB.Create(&model.Ability{Group: "promo", Model: "deepseek-v4.1-flash", ChannelId: 10, Enabled: true}).Error)
	require.NoError(t, model.DB.Create(&model.Ability{Group: "promo", Model: "deepseek-v4.1-flash-1017", ChannelId: 10, Enabled: true}).Error)
	require.NoError(t, model.DB.Create(&model.Ability{Group: "promo", Model: "hidden-beta-model", ChannelId: 10, Enabled: true}).Error)
	hiddenMeta := model.Model{ModelName: "hidden-beta-model", Status: 1}
	require.NoError(t, model.DB.Create(&hiddenMeta).Error)
	require.NoError(t, model.DB.Model(&hiddenMeta).Update("status", 0).Error)
	require.NoError(t, model.UpsertPerfMetric(&model.PerfMetric{
		ModelName:      "deepseek-v4.1-flash",
		Group:          "promo",
		BucketTs:       curBucket,
		RequestCount:   18,
		SuccessCount:   18,
		TotalLatencyMs: 30000,
		TtftSumMs:      18000,
		TtftCount:      18,
	}))
	require.NoError(t, model.UpsertPerfMetric(&model.PerfMetric{
		ModelName:      "deepseek-v4.1-flash-1017",
		Group:          "promo",
		BucketTs:       curBucket,
		RequestCount:   20,
		SuccessCount:   19,
		TotalLatencyMs: 46000,
		TtftSumMs:      26000,
		TtftCount:      20,
	}))
	require.NoError(t, model.UpsertPerfMetric(&model.PerfMetric{
		ModelName:      "hidden-beta-model",
		Group:          "promo",
		BucketTs:       curBucket,
		RequestCount:   12,
		SuccessCount:   0,
		TotalLatencyMs: 240000,
	}))
	require.NoError(t, model.UpsertPerfMetric(&model.PerfMetric{
		ModelName:      "gpt-6-sol",
		Group:          "promo",
		BucketTs:       curBucket,
		RequestCount:   26,
		SuccessCount:   4,
		TotalLatencyMs: 520000,
	}))
	require.NoError(t, model.UpsertPerfMetric(&model.PerfMetric{
		ModelName:      "gpt-6-astra",
		Group:          "promo",
		BucketTs:       oldBucket,
		RequestCount:   26,
		SuccessCount:   4,
		TotalLatencyMs: 520000,
	}))
	perfmetrics.RecordChannelProbe([]string{"promo"}, perfmetrics.ProbeSample{
		Timestamp: nowTs - 120,
		Model:     "gpt-6-sol",
		Success:   false,
		LatencyMs: 9000,
	})
	perfmetrics.RecordChannelProbe([]string{"promo"}, perfmetrics.ProbeSample{
		Timestamp: nowTs - 30,
		Model:     "deepseek-v4.1-flash",
		Success:   true,
		LatencyMs: 420,
	})

	// Group "aws": degraded earlier in the 24h window (60%), but recent buckets are 100% healthy.
	require.NoError(t, model.DB.Create(&model.Ability{Group: "aws", Model: "claude-sonnet-5-5", ChannelId: 11, Enabled: true}).Error)
	require.NoError(t, model.UpsertPerfMetric(&model.PerfMetric{
		ModelName:      "claude-sonnet-5-5",
		Group:          "aws",
		BucketTs:       oldBucket,
		RequestCount:   60,
		SuccessCount:   38,
		TotalLatencyMs: 300000,
	}))
	require.NoError(t, model.UpsertPerfMetric(&model.PerfMetric{
		ModelName:      "claude-sonnet-5-5",
		Group:          "aws",
		BucketTs:       curBucket,
		RequestCount:   20,
		SuccessCount:   20,
		TotalLatencyMs: 80000,
	}))

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/perf-metrics/groups?hours=24", nil)
	GetPerfMetricsGroups(ctx)
	require.Equal(t, http.StatusOK, recorder.Code)

	var groupsPayload struct {
		Success bool                       `json:"success"`
		Data    groupChannelStatusResponse `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &groupsPayload))
	require.True(t, groupsPayload.Success)

	byGroup := make(map[string]groupChannelStatusItem, len(groupsPayload.Data.Groups))
	for _, item := range groupsPayload.Data.Groups {
		byGroup[item.Group] = item
	}

	promo, ok := byGroup["promo"]
	require.True(t, ok)
	assert.Equal(t, "operational", promo.Status)
	assert.Equal(t, 2, promo.EnabledModels)
	assert.Equal(t, int64(38), promo.RequestCount)
	assert.Len(t, promo.TopModels, 2)
	assert.InDelta(t, 97.37, promo.SuccessRate, 0.01)
	require.NotNil(t, promo.RecentProbe)
	assert.Equal(t, []string{"deepseek-v4.1-flash"}, promo.RecentProbe.RecentModels)
	assert.Equal(t, float64(100), promo.RecentProbe.RecentSuccessRate)

	aws, ok := byGroup["aws"]
	require.True(t, ok)
	assert.Equal(t, "operational", aws.Status)
	assert.InDelta(t, 72.5, aws.SuccessRate, 0.01)

	// Uptime health for promo must ignore removed gpt-6-sol failures and return 200.
	healthRec := httptest.NewRecorder()
	healthCtx, _ := gin.CreateTestContext(healthRec)
	healthCtx.Request = httptest.NewRequest(http.MethodGet, "/api/uptime/health?group=promo&hours=24&min_success_rate=95&min_requests=5", nil)
	GetUptimeHealth(healthCtx)
	assert.Equal(t, http.StatusOK, healthRec.Code)
}

func TestClassifyGroupChannelStatus(t *testing.T) {
	baseTs := int64(1_764_100_000)

	// No active channels is always an outage.
	assert.Equal(t, "outage", classifyGroupChannelStatus(false, 20, 100, []perfmetrics.GroupBucketPoint{
		{Ts: baseTs, RequestCount: 20, SuccessCount: 20, SuccessRate: 100},
	}, 3600, nil))

	// 76.4% active partial degradation is degraded, not outage.
	assert.Equal(t, "degraded", classifyGroupChannelStatus(true, 17, 76.47, []perfmetrics.GroupBucketPoint{
		{Ts: baseTs, RequestCount: 17, SuccessCount: 13, SuccessRate: 76.47},
	}, 3600, nil))

	// Historical outage followed by healthy latest bucket recovers to operational.
	assert.Equal(t, "operational", classifyGroupChannelStatus(true, 30, 50, []perfmetrics.GroupBucketPoint{
		{Ts: baseTs - 3600, RequestCount: 20, SuccessCount: 5, SuccessRate: 25},
		{Ts: baseTs, RequestCount: 10, SuccessCount: 10, SuccessRate: 100},
	}, 3600, nil))

	// Historical outage followed by 1 single successful request steps up to degraded (not outage).
	assert.Equal(t, "degraded", classifyGroupChannelStatus(true, 11, 9.09, []perfmetrics.GroupBucketPoint{
		{Ts: baseTs - 3600, RequestCount: 10, SuccessCount: 0, SuccessRate: 0},
		{Ts: baseTs, RequestCount: 1, SuccessCount: 1, SuccessRate: 100},
	}, 3600, nil))

	// Fresh sustained failure in latest bucket triggers outage even when older history was healthy.
	assert.Equal(t, "outage", classifyGroupChannelStatus(true, 55, 90.91, []perfmetrics.GroupBucketPoint{
		{Ts: baseTs - 3600, RequestCount: 50, SuccessCount: 50, SuccessRate: 100},
		{Ts: baseTs, RequestCount: 5, SuccessCount: 0, SuccessRate: 0},
	}, 3600, nil))

	// Single failed request without probe corroboration stays degraded to avoid noisy outage alerts.
	assert.Equal(t, "degraded", classifyGroupChannelStatus(true, 1, 0, []perfmetrics.GroupBucketPoint{
		{Ts: baseTs, RequestCount: 1, SuccessCount: 0, SuccessRate: 0},
	}, 3600, nil))

	// Single failed request corroborated by failing probe triggers outage.
	assert.Equal(t, "outage", classifyGroupChannelStatus(true, 1, 0, []perfmetrics.GroupBucketPoint{
		{Ts: baseTs, RequestCount: 1, SuccessCount: 0, SuccessRate: 0},
	}, 3600, &perfmetrics.GroupProbeSummary{
		LastTestedAt:      baseTs + 120,
		Success:           false,
		RecentSamples:     2,
		RecentSuccessRate: 0,
	}))

	// Stale outage traffic verified healthy by a newer active probe recovers to operational.
	assert.Equal(t, "operational", classifyGroupChannelStatus(true, 10, 10, []perfmetrics.GroupBucketPoint{
		{Ts: baseTs - 7200, RequestCount: 10, SuccessCount: 1, SuccessRate: 10},
	}, 3600, &perfmetrics.GroupProbeSummary{
		LastTestedAt:      baseTs,
		Success:           true,
		RecentSamples:     3,
		RecentSuccessRate: 100,
	}))
}
