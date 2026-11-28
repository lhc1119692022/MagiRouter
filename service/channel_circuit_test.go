package service

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestIsConsecutiveDisableEligibleError(t *testing.T) {
	tests := []struct {
		name string
		err  *types.NewAPIError
		want bool
	}{
		{
			name: "upstream 502 bad gateway",
			err:  types.NewOpenAIError(errors.New("Upstream service is temporarily unavailable"), types.ErrorCodeBadResponseStatusCode, http.StatusBadGateway),
			want: true,
		},
		{
			name: "upstream 503 service unavailable",
			err:  types.NewOpenAIError(errors.New("Service unavailable"), types.ErrorCodeBadResponseStatusCode, http.StatusServiceUnavailable),
			want: true,
		},
		{
			name: "upstream 504 gateway timeout",
			err:  types.NewOpenAIError(errors.New("Gateway timeout"), types.ErrorCodeBadResponseStatusCode, http.StatusGatewayTimeout),
			want: true,
		},
		{
			name: "upstream 524 cloudflare timeout",
			err:  types.NewOpenAIError(errors.New("A timeout occurred"), types.ErrorCodeBadResponseStatusCode, 524),
			want: true,
		},
		{
			name: "transport do request failed",
			err:  types.NewOpenAIError(errors.New("dial tcp timeout"), types.ErrorCodeDoRequestFailed, http.StatusInternalServerError),
			want: true,
		},
		{
			name: "transport deadline exceeded",
			err:  types.NewOpenAIError(context.DeadlineExceeded, types.ErrorCodeDoRequestFailed, http.StatusInternalServerError),
			want: true,
		},
		{
			name: "transport client canceled excluded",
			err:  types.NewOpenAIError(context.Canceled, types.ErrorCodeDoRequestFailed, http.StatusInternalServerError),
			want: false,
		},
		{
			name: "upstream 400 bad request excluded",
			err:  types.NewOpenAIError(errors.New("invalid_request"), types.ErrorCodeBadResponseStatusCode, http.StatusBadRequest),
			want: false,
		},
		{
			name: "upstream 429 rate limit excluded",
			err:  types.NewOpenAIError(errors.New("rate limited"), types.ErrorCodeBadResponseStatusCode, http.StatusTooManyRequests),
			want: false,
		},
		{
			name: "local error excluded",
			err:  types.NewErrorWithStatusCode(errors.New("bad input"), types.ErrorCodeConvertRequestFailed, http.StatusInternalServerError),
			want: false,
		},
		{
			name: "skip retry error excluded",
			err:  types.NewOpenAIError(errors.New("violation"), types.ErrorCodeBadResponseStatusCode, http.StatusBadGateway, types.ErrOptionWithSkipRetry()),
			want: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, IsConsecutiveDisableEligibleError(tc.err))
		})
	}
}

func TestChannelFailureStreakStalenessAndMultiKeyIsolation(t *testing.T) {
	ResetAllChannelFailureCountsForTest()
	now := time.Date(2026, 11, 27, 9, 0, 0, 0, time.UTC)
	prevNow := channelCircuitNow
	channelCircuitNow = func() time.Time { return now }
	t.Cleanup(func() {
		channelCircuitNow = prevNow
		ResetAllChannelFailureCountsForTest()
	})

	assert.Equal(t, 1, RecordChannelFailure(34, false, "k1"))
	now = now.Add(time.Hour)
	assert.Equal(t, 2, RecordChannelFailure(34, false, "k1"))
	now = now.Add(7 * time.Hour)
	assert.Equal(t, 1, RecordChannelFailure(34, false, "k1"), "stale failure streak resets after window")

	assert.Equal(t, 1, RecordChannelFailure(50, true, "key-a"))
	assert.Equal(t, 1, RecordChannelFailure(50, true, "key-b"))
	assert.Equal(t, 2, RecordChannelFailure(50, true, "key-a"))
	ResetChannelFailureCount(50, "key-a")
	assert.Equal(t, 0, GetChannelFailureCount(50, true, "key-a"))
	assert.Equal(t, 1, GetChannelFailureCount(50, true, "key-b"))

	ResetChannelFailureCount(50, "")
	assert.Equal(t, 0, GetChannelFailureCount(50, true, "key-b"))
}

func TestHandleChannelErrorDisablesAfterConsecutive5xxAndResetsOnSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ResetAllChannelFailureCountsForTest()

	prevDB := model.DB
	prevCache := common.MemoryCacheEnabled
	prevAutoDisable := common.AutomaticDisableChannelEnabled
	prevThreshold := operation_setting.GetMonitorSetting().ConsecutiveFailureDisableThreshold
	db, err := gorm.Open(sqlite.Open("file:channel_circuit_test?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}, &model.User{}))

	model.DB = db
	common.MemoryCacheEnabled = false
	common.AutomaticDisableChannelEnabled = true
	operation_setting.GetMonitorSetting().ConsecutiveFailureDisableThreshold = 3
	t.Cleanup(func() {
		model.DB = prevDB
		common.MemoryCacheEnabled = prevCache
		common.AutomaticDisableChannelEnabled = prevAutoDisable
		operation_setting.GetMonitorSetting().ConsecutiveFailureDisableThreshold = prevThreshold
		ResetAllChannelFailureCountsForTest()
	})

	channel := &model.Channel{
		Name:    "test-502-channel",
		Status:  common.ChannelStatusEnabled,
		Models:  "gpt-6-sol",
		Group:   "default",
		Key:     "sk-test",
		AutoBan: common.GetPointer(1),
	}
	require.NoError(t, db.Create(channel).Error)

	err502 := types.NewOpenAIError(errors.New("Upstream service is temporarily unavailable"), types.ErrorCodeBadResponseStatusCode, http.StatusBadGateway)
	err400 := types.NewOpenAIError(errors.New("invalid_request"), types.ErrorCodeBadResponseStatusCode, http.StatusBadRequest)
	chErr := types.ChannelError{ChannelId: channel.Id, ChannelName: channel.Name, AutoBan: true}

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	// 2 consecutive 502s should not disable yet; 400 does not count; success resets streak.
	HandleChannelError(c, chErr, err502)
	HandleChannelError(c, chErr, err502)
	HandleChannelError(c, chErr, err400)
	assert.Equal(t, 2, GetChannelFailureCount(channel.Id, false, ""))

	c.Set("channel_id", channel.Id)
	MarkRequestPolicySuccess(c, nil)
	assert.Equal(t, 0, GetChannelFailureCount(channel.Id, false, ""))

	// Client-canceled request should never increment streak.
	canceledCtx, cancel := context.WithCancel(context.Background())
	cancel()
	canceledGin, _ := gin.CreateTestContext(httptest.NewRecorder())
	canceledGin.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil).WithContext(canceledCtx)
	HandleChannelError(canceledGin, chErr, err502)
	assert.Equal(t, 0, GetChannelFailureCount(channel.Id, false, ""))

	// 3 consecutive 502s should transition channel to AutoDisabled (status=3).
	assert.False(t, HandleChannelErrorAndReportDisable(c, chErr, err502))
	assert.False(t, HandleChannelErrorAndReportDisable(c, chErr, err502))
	assert.True(t, HandleChannelErrorAndReportDisable(c, chErr, err502))

	require.Eventually(t, func() bool {
		var stored model.Channel
		if err := db.First(&stored, channel.Id).Error; err != nil {
			return false
		}
		return stored.Status == common.ChannelStatusAutoDisabled
	}, 2*time.Second, 20*time.Millisecond)

	var stored model.Channel
	require.NoError(t, db.First(&stored, channel.Id).Error)
	assert.Contains(t, stored.GetOtherInfo()["status_reason"], "consecutive upstream failures (3/3)")
	assert.Equal(t, 0, GetChannelFailureCount(channel.Id, false, ""))
}

func TestClassifyChannelAttemptOutcome(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	ignore, success, isTimeout := ClassifyChannelAttemptOutcome(c, nil)
	assert.False(t, ignore)
	assert.True(t, success)
	assert.False(t, isTimeout)

	badReq := types.NewOpenAIError(errors.New("invalid prompt"), types.ErrorCodeInvalidRequest, http.StatusBadRequest)
	ignore, success, isTimeout = ClassifyChannelAttemptOutcome(c, badReq)
	assert.True(t, ignore)
	assert.False(t, success)
	assert.False(t, isTimeout)

	timeoutErr := types.NewOpenAIError(context.DeadlineExceeded, types.ErrorCodeDoRequestFailed, http.StatusGatewayTimeout)
	ignore, success, isTimeout = ClassifyChannelAttemptOutcome(c, timeoutErr)
	assert.False(t, ignore)
	assert.False(t, success)
	assert.True(t, isTimeout)

	canceledCtx, cancel := context.WithCancel(context.Background())
	cancel()
	canceledGin, _ := gin.CreateTestContext(httptest.NewRecorder())
	canceledGin.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil).WithContext(canceledCtx)
	err502 := types.NewOpenAIError(errors.New("bad gateway"), types.ErrorCodeBadResponseStatusCode, http.StatusBadGateway)
	ignore, _, _ = ClassifyChannelAttemptOutcome(canceledGin, err502)
	assert.True(t, ignore)
}
