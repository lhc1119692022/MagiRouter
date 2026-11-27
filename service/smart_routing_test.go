package service

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func ptrFloat(val float64) *float64 {
	return &val
}

func TestRankSmartRoutingCandidatesCostFirst(t *testing.T) {
	cfg := setting.DefaultSmartRoutingConfig()
	now := int64(1_700_000_000)

	inputs := []SmartRoutingCandidateInput{
		{
			Group:          "expensive-stable",
			EffectiveRatio: 2.0,
			ShortModel:     &perfmetrics.RoutingMetric{RequestCount: 40, SuccessCount: 40, SuccessRate: 100, AvgTtftMs: 400, AvgTps: 70},
			NowUnix:        now,
		},
		{
			Group:          "cheap-healthy",
			EffectiveRatio: 0.4,
			ShortModel:     &perfmetrics.RoutingMetric{RequestCount: 30, SuccessCount: 29, SuccessRate: 96.67, AvgTtftMs: 900, AvgTps: 45},
			NowUnix:        now,
		},
		{
			Group:          "cheapest-outage",
			EffectiveRatio: 0.2,
			ShortModel:     &perfmetrics.RoutingMetric{RequestCount: 20, SuccessCount: 6, SuccessRate: 30, AvgTtftMs: 1200, AvgTps: 20},
			NowUnix:        now,
		},
		{
			Group:          "mid-degraded",
			EffectiveRatio: 0.6,
			ShortModel:     &perfmetrics.RoutingMetric{RequestCount: 20, SuccessCount: 17, SuccessRate: 85, AvgTtftMs: 700, AvgTps: 50},
			NowUnix:        now,
		},
	}

	ranked := RankSmartRoutingCandidates(model.TokenRoutePolicyCostFirst, cfg, inputs)
	require.Len(t, ranked, 4)
	assert.Equal(t, []string{"cheap-healthy", "expensive-stable", "mid-degraded", "cheapest-outage"}, []string{
		ranked[0].Group, ranked[1].Group, ranked[2].Group, ranked[3].Group,
	})
	assert.Equal(t, "healthy", ranked[0].Tier)
	assert.Equal(t, "degraded", ranked[2].Tier)
	assert.Equal(t, "outage", ranked[3].Tier)

	// Cost ceiling caps fallback ratio relative to primary group.
	cfgWithCap := cfg
	cfgWithCap.CostMaxFallbackRatio = 2.0
	capped := RankSmartRoutingCandidates(model.TokenRoutePolicyCostFirst, cfgWithCap, inputs)
	require.Len(t, capped, 3)
	assert.Equal(t, []string{"cheap-healthy", "mid-degraded", "cheapest-outage"}, []string{
		capped[0].Group, capped[1].Group, capped[2].Group,
	})

	// Disallowing outage fallback removes outage candidates when non-outage exist.
	cfgNoOutage := cfg
	cfgNoOutage.AllowOutageFallback = false
	noOutage := RankSmartRoutingCandidates(model.TokenRoutePolicyCostFirst, cfgNoOutage, inputs)
	require.Len(t, noOutage, 3)
	for _, item := range noOutage {
		assert.NotEqual(t, "outage", item.Tier)
	}
}

func TestRankSmartRoutingCandidatesStabilityFirstAndProbeRecovery(t *testing.T) {
	cfg := setting.DefaultSmartRoutingConfig()
	now := int64(1_700_000_000)

	inputs := []SmartRoutingCandidateInput{
		{
			Group:          "cheap-slow",
			EffectiveRatio: 0.3,
			ShortModel:     &perfmetrics.RoutingMetric{RequestCount: 50, SuccessCount: 48, SuccessRate: 96, AvgTtftMs: 2800, AvgTps: 22, CacheHitRate: ptrFloat(10)},
			NowUnix:        now,
		},
		{
			Group:          "premium-fast",
			EffectiveRatio: 1.5,
			ShortModel:     &perfmetrics.RoutingMetric{RequestCount: 80, SuccessCount: 80, SuccessRate: 100, AvgTtftMs: 420, AvgTps: 85, CacheHitRate: ptrFloat(65)},
			NowUnix:        now,
		},
		{
			Group:          "recovered-by-probe",
			EffectiveRatio: 0.8,
			LongModel:      &perfmetrics.RoutingMetric{RequestCount: 40, SuccessCount: 16, SuccessRate: 40, AvgTtftMs: 600, AvgTps: 60},
			Probe: &perfmetrics.GroupProbeSummary{
				LastTestedAt:      now - 120,
				Success:           true,
				RecentSamples:     5,
				RecentSuccessRate: 100,
			},
			NowUnix: now,
		},
	}

	ranked := RankSmartRoutingCandidates(model.TokenRoutePolicyStabilityFirst, cfg, inputs)
	require.Len(t, ranked, 3)
	assert.Equal(t, "premium-fast", ranked[0].Group)

	var recovered SmartRoutingRankedCandidate
	for _, item := range ranked {
		if item.Group == "recovered-by-probe" {
			recovered = item
		}
	}
	assert.Equal(t, "healthy", recovered.Tier, "fresh successful probes should clear outage demotion when short-window traffic paused")
}

func TestIsReasoningModelForSmartPolicyFiltersMediaAndNonReasoningPaths(t *testing.T) {
	InvalidateSmartRoutingCache()
	assert.True(t, IsReasoningModelForSmartPolicy("gpt-5.2", "/v1/chat/completions"))
	assert.True(t, IsReasoningModelForSmartPolicy("claude-sonnet-4-5", "/v1/messages"))
	assert.False(t, IsReasoningModelForSmartPolicy("gpt-5.2", "/v1/images/generations"))
	assert.False(t, IsReasoningModelForSmartPolicy("gpt-image-1", "/v1/chat/completions"))
	assert.False(t, IsReasoningModelForSmartPolicy("sora-2", "/v1/videos"))
	assert.False(t, IsReasoningModelForSmartPolicy("text-embedding-3-large", "/v1/embeddings"))
	assert.False(t, IsReasoningModelForSmartPolicy("whisper-1", "/v1/audio/transcriptions"))
}

func TestSmartRoutingChannelSelectAndAntiStickyFallback(t *testing.T) {
	db := setupChannelSelectAutoGroupsTest(t)
	originalSmartCfg := setting.SmartRoutingConfig2JSONString()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateSmartRoutingConfigByJSONString(originalSmartCfg))
		InvalidateSmartRoutingCache()
	})

	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"cheap":"Cheap","stable":"Stable"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"cheap":0.5,"stable":1.5}`))
	require.NoError(t, setting.UpdateSmartRoutingConfigByJSONString(`{"enabled":true,"short_window_hours":1,"long_window_hours":24}`))

	createChannelSelectAutoGroupsChannel(t, db, 11, "cheap", "gpt-5.2")
	createChannelSelectAutoGroupsChannel(t, db, 12, "stable", "gpt-5.2")
	model.InitChannelCache()
	InvalidateSmartRoutingCache()

	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "cheap")
	common.SetContextKey(ctx, constant.ContextKeyTokenGroup, "auto")
	common.SetContextKey(ctx, constant.ContextKeyTokenRoutePolicy, model.TokenRoutePolicyCostFirst)
	common.SetContextKey(ctx, constant.ContextKeyTokenCrossGroupRetry, true)

	retry := 0
	channel, selectedGroup, err := CacheGetRandomSatisfiedChannel(&RetryParam{
		Ctx:         ctx,
		TokenGroup:  "auto",
		ModelName:   "gpt-5.2",
		RequestPath: "/v1/chat/completions",
		Retry:       &retry,
	})
	require.NoError(t, err)
	require.NotNil(t, channel)
	assert.Equal(t, "cheap", selectedGroup)
	assert.Equal(t, "cheap", common.GetContextKeyString(ctx, constant.ContextKeyRoutePrimaryGroup))
	assert.Empty(t, common.GetContextKeyString(ctx, constant.ContextKeyRouteFallbackFrom))

	// Non-reasoning model should be rejected for smart routing tokens.
	_, _, err = CacheGetRandomSatisfiedChannel(&RetryParam{
		Ctx:         ctx,
		TokenGroup:  "auto",
		ModelName:   "gpt-image-1",
		RequestPath: "/v1/images/generations",
		Retry:       &retry,
	})
	assert.Error(t, err)
}
