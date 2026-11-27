package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestComputeRecoveryBackoffDelaySeconds(t *testing.T) {
	// Default cadence 10m with 240m cap -> 10m, 30m, 1h, 2h, 4h, 4h.
	assert.Equal(t, int64(10*60), computeRecoveryBackoffDelaySeconds(0, 10, 240))
	assert.Equal(t, int64(30*60), computeRecoveryBackoffDelaySeconds(1, 10, 240))
	assert.Equal(t, int64(60*60), computeRecoveryBackoffDelaySeconds(2, 10, 240))
	assert.Equal(t, int64(120*60), computeRecoveryBackoffDelaySeconds(3, 10, 240))
	assert.Equal(t, int64(240*60), computeRecoveryBackoffDelaySeconds(4, 10, 240))
	assert.Equal(t, int64(240*60), computeRecoveryBackoffDelaySeconds(8, 10, 240))

	// Backoff disabled when maxMinutes <= 0.
	assert.Equal(t, int64(0), computeRecoveryBackoffDelaySeconds(2, 10, 0))
	// maxMinutes smaller than baseMinutes clamps to baseMinutes.
	assert.Equal(t, int64(10*60), computeRecoveryBackoffDelaySeconds(2, 10, 5))
}

func TestFilterChannelsByRecoveryBackoff(t *testing.T) {
	now := int64(1764000000)

	justDisabled := &model.Channel{Id: 1, Status: common.ChannelStatusAutoDisabled}
	justDisabled.SetOtherInfo(map[string]any{"status_time": now - 5*60})

	firstProbeDue := &model.Channel{Id: 2, Status: common.ChannelStatusAutoDisabled}
	firstProbeDue.SetOtherInfo(map[string]any{"status_time": now - 10*60})

	backedOffNotDue := &model.Channel{Id: 3, Status: common.ChannelStatusAutoDisabled, TestTime: now - 15*60}
	backedOffNotDue.SetOtherInfo(map[string]any{
		model.ChannelOtherInfoRecoveryFailCount:  1,
		model.ChannelOtherInfoRecoveryNextTestAt: now + 15*60,
	})

	backedOffDue := &model.Channel{Id: 4, Status: common.ChannelStatusAutoDisabled, TestTime: now - 35*60}
	backedOffDue.SetOtherInfo(map[string]any{
		model.ChannelOtherInfoRecoveryFailCount:  1,
		model.ChannelOtherInfoRecoveryNextTestAt: now - 5*60,
	})

	clampedWhenCapLowered := &model.Channel{Id: 5, Status: common.ChannelStatusAutoDisabled, TestTime: now - 35*60}
	clampedWhenCapLowered.SetOtherInfo(map[string]any{
		model.ChannelOtherInfoRecoveryFailCount:  4,
		model.ChannelOtherInfoRecoveryNextTestAt: now + 200*60,
	})

	enabledCh := &model.Channel{Id: 6, Status: common.ChannelStatusEnabled}
	manualCh := &model.Channel{Id: 7, Status: common.ChannelStatusManuallyDisabled}

	all := []*model.Channel{justDisabled, firstProbeDue, backedOffNotDue, backedOffDue, clampedWhenCapLowered, enabledCh, manualCh}

	filtered := filterChannelsByRecoveryBackoff(all, 10, 240, now)
	ids := make([]int, 0, len(filtered))
	for _, ch := range filtered {
		ids = append(ids, ch.Id)
	}
	assert.Equal(t, []int{2, 4, 6, 7}, ids)

	// Lowering maxMinutes to 30 clamps channel #5 (last tested 35m ago) so it becomes due.
	filteredLowCap := filterChannelsByRecoveryBackoff(all, 10, 30, now)
	idsLowCap := make([]int, 0, len(filteredLowCap))
	for _, ch := range filteredLowCap {
		idsLowCap = append(idsLowCap, ch.Id)
	}
	assert.Equal(t, []int{2, 4, 5, 6, 7}, idsLowCap)

	// maxMinutes=0 disables backoff throttling.
	assert.Len(t, filterChannelsByRecoveryBackoff(all, 10, 0, now), len(all))
}

func TestChannelRecoveryBackoffPersistenceAndReset(t *testing.T) {
	prevDB := model.DB
	prevCache := common.MemoryCacheEnabled
	db, err := gorm.Open(sqlite.Open("file:channel_recovery_backoff_persist?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}))

	model.DB = db
	common.MemoryCacheEnabled = false
	t.Cleanup(func() {
		model.DB = prevDB
		common.MemoryCacheEnabled = prevCache
	})

	ch := &model.Channel{
		Name:   "auto-disabled-ch",
		Status: common.ChannelStatusAutoDisabled,
		Models: "gpt-4o-mini",
		Group:  "default",
		Key:    "sk-test",
	}
	require.NoError(t, db.Create(ch).Error)

	nextAt := int64(1764003600)
	require.NoError(t, model.RecordChannelRecoveryProbeFailure(ch.Id, 2, nextAt))

	var stored model.Channel
	require.NoError(t, db.First(&stored, ch.Id).Error)
	assert.Equal(t, int64(2), otherInfoInt64(stored.GetOtherInfo(), model.ChannelOtherInfoRecoveryFailCount))
	assert.Equal(t, nextAt, otherInfoInt64(stored.GetOtherInfo(), model.ChannelOtherInfoRecoveryNextTestAt))

	require.NoError(t, model.ClearChannelRecoveryBackoff(ch.Id))
	require.NoError(t, db.First(&stored, ch.Id).Error)
	assert.Equal(t, int64(0), otherInfoInt64(stored.GetOtherInfo(), model.ChannelOtherInfoRecoveryFailCount))
	assert.Equal(t, int64(0), otherInfoInt64(stored.GetOtherInfo(), model.ChannelOtherInfoRecoveryNextTestAt))

	// Recording again then re-enabling via UpdateChannelStatus also clears backoff keys.
	require.NoError(t, model.RecordChannelRecoveryProbeFailure(ch.Id, 3, nextAt+7200))
	require.True(t, model.UpdateChannelStatus(ch.Id, "", common.ChannelStatusEnabled, ""))
	require.NoError(t, db.First(&stored, ch.Id).Error)
	assert.Equal(t, common.ChannelStatusEnabled, stored.Status)
	assert.Equal(t, int64(0), otherInfoInt64(stored.GetOtherInfo(), model.ChannelOtherInfoRecoveryFailCount))
	assert.Equal(t, int64(0), otherInfoInt64(stored.GetOtherInfo(), model.ChannelOtherInfoRecoveryNextTestAt))
}

func TestHealthCheckRecoverySlowProbeBackoffAndConsecutiveDisable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())
	service.ResetAllChannelFailureCountsForTest()
	perfmetrics.ResetChannelProbesForTest()

	prevDB := model.DB
	prevLogDB := model.LOG_DB
	prevCache := common.MemoryCacheEnabled
	prevAutoDisable := common.AutomaticDisableChannelEnabled
	prevAutoEnable := common.AutomaticEnableChannelEnabled
	prevMonitor := *operation_setting.GetMonitorSetting()
	prevModelRatio := ratio_setting.ModelRatio2JSONString()

	db := setupModelListControllerTestDB(t)
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"gpt-4o-mini":0.075}`))

	common.MemoryCacheEnabled = false
	common.AutomaticDisableChannelEnabled = true
	common.AutomaticEnableChannelEnabled = true
	monitor := operation_setting.GetMonitorSetting()
	monitor.AutoTestChannelMinutes = 10
	monitor.RecoveryBackoffMaxMinutes = 240
	monitor.ConsecutiveFailureDisableThreshold = 3
	monitor.ChannelTestModelStrategy = operation_setting.ChannelTestModelStrategyFixed
	monitor.ChannelTestExcludeModels = ""

	t.Cleanup(func() {
		model.DB = prevDB
		model.LOG_DB = prevLogDB
		common.MemoryCacheEnabled = prevCache
		common.AutomaticDisableChannelEnabled = prevAutoDisable
		common.AutomaticEnableChannelEnabled = prevAutoEnable
		*operation_setting.GetMonitorSetting() = prevMonitor
		_ = ratio_setting.UpdateModelRatioByJSONString(prevModelRatio)
		service.ResetAllChannelFailureCountsForTest()
		perfmetrics.ResetChannelProbesForTest()
	})

	testUser := &model.User{
		Username: "probe-root",
		Password: "x",
		Group:    "default",
		Status:   common.UserStatusEnabled,
		Role:     common.RoleRootUser,
	}
	require.NoError(t, db.Create(testUser).Error)

	var serverMode atomic.Int32 // 0 = 502, 1 = slow 200
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if serverMode.Load() == 0 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(`{"error":{"message":"bad gateway","type":"server_error"}}`))
			return
		}
		time.Sleep(40 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"chatcmpl-test","object":"chat.completion","created":1764000000,"model":"gpt-4o-mini","choices":[{"index":0,"message":{"role":"assistant","content":"hi"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}`))
	}))
	t.Cleanup(upstream.Close)

	baseURL := upstream.URL

	// 1) Auto-disabled channel failing recovery probe records backoff and does NOT pollute healthy group probe.
	perfmetrics.RecordChannelProbe([]string{"default"}, perfmetrics.ProbeSample{
		Timestamp: time.Now().Unix(),
		Model:     "gpt-4o-mini",
		Success:   true,
		LatencyMs: 120,
	})
	isolatedCh := &model.Channel{
		Type:    constant.ChannelTypeOpenAI,
		Name:    "isolated-upstream",
		Status:  common.ChannelStatusAutoDisabled,
		Models:  "gpt-4o-mini",
		Group:   "default",
		Key:     "sk-test",
		BaseURL: &baseURL,
		AutoBan: common.GetPointer(1),
	}
	require.NoError(t, db.Create(isolatedCh).Error)

	serverMode.Store(0)
	failSummary := testChannelForHealthCheck(context.Background(), isolatedCh, testUser.Id, false, true, 15)
	assert.Equal(t, 1, failSummary.Tested)
	assert.Equal(t, 1, failSummary.Failed)
	assert.Equal(t, 0, failSummary.Enabled)

	var storedIsolated model.Channel
	require.NoError(t, db.First(&storedIsolated, isolatedCh.Id).Error)
	assert.Equal(t, common.ChannelStatusAutoDisabled, storedIsolated.Status)
	assert.Equal(t, int64(1), otherInfoInt64(storedIsolated.GetOtherInfo(), model.ChannelOtherInfoRecoveryFailCount))
	assert.Greater(t, otherInfoInt64(storedIsolated.GetOtherInfo(), model.ChannelOtherInfoRecoveryNextTestAt), time.Now().Unix()+25*60)

	probe := perfmetrics.GetGroupProbeSummary("default")
	require.NotNil(t, probe)
	assert.True(t, probe.Success, "failed recovery probe of auto-disabled channel must not overwrite healthy group probe")
	assert.Equal(t, 1, probe.RecentSamples)

	// 2) Slow recovery probe (> disableThreshold=15ms) still recovers auto-disabled channel and clears backoff.
	serverMode.Store(1)
	recoverSummary := testChannelForHealthCheck(context.Background(), &storedIsolated, testUser.Id, false, true, 15)
	assert.Equal(t, 1, recoverSummary.Tested)
	assert.Equal(t, 1, recoverSummary.Succeeded)
	assert.Equal(t, 1, recoverSummary.Enabled)

	require.NoError(t, db.First(&storedIsolated, isolatedCh.Id).Error)
	assert.Equal(t, common.ChannelStatusEnabled, storedIsolated.Status)
	assert.Equal(t, int64(0), otherInfoInt64(storedIsolated.GetOtherInfo(), model.ChannelOtherInfoRecoveryFailCount))
	assert.Equal(t, int64(0), otherInfoInt64(storedIsolated.GetOtherInfo(), model.ChannelOtherInfoRecoveryNextTestAt))

	// 3) Enabled channel in allowDisable=true mode trips consecutive-failure isolation on 3rd 502.
	enabledCh := &model.Channel{
		Type:    constant.ChannelTypeOpenAI,
		Name:    "enabled-flaky",
		Status:  common.ChannelStatusEnabled,
		Models:  "gpt-4o-mini",
		Group:   "default",
		Key:     "sk-test",
		BaseURL: &baseURL,
		AutoBan: common.GetPointer(1),
	}
	require.NoError(t, db.Create(enabledCh).Error)

	serverMode.Store(0)
	s1 := testChannelForHealthCheck(context.Background(), enabledCh, testUser.Id, true, false, 5000)
	s2 := testChannelForHealthCheck(context.Background(), enabledCh, testUser.Id, true, false, 5000)
	assert.Equal(t, 0, s1.Disabled)
	assert.Equal(t, 0, s2.Disabled)
	s3 := testChannelForHealthCheck(context.Background(), enabledCh, testUser.Id, true, false, 5000)
	assert.Equal(t, 1, s3.Disabled)

	require.Eventually(t, func() bool {
		var stored model.Channel
		if err := db.First(&stored, enabledCh.Id).Error; err != nil {
			return false
		}
		return stored.Status == common.ChannelStatusAutoDisabled
	}, 2*time.Second, 20*time.Millisecond)
}
