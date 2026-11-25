package controller

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestProcessChannelErrorUsesSnapshotWithoutLeakingChannelMetadata(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousRedisEnabled := common.RedisEnabled
	previousMainDatabaseType := common.MainDatabaseType()
	previousLogDatabaseType := common.LogDatabaseType()
	previousErrorLogEnabled := constant.ErrorLogEnabled

	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := database.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, database.AutoMigrate(&model.User{}, &model.Log{}))
	model.DB, model.LOG_DB = database, database
	common.RedisEnabled = false
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	constant.ErrorLogEnabled = true
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.RedisEnabled = previousRedisEnabled
		common.SetDatabaseTypes(previousMainDatabaseType, previousLogDatabaseType)
		constant.ErrorLogEnabled = previousErrorLogEnabled
		require.NoError(t, sqlDB.Close())
	})

	require.NoError(t, database.Create(&model.User{Id: 7, Username: "log-owner", Group: "default"}).Error)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	ctx.Set("id", 7)
	ctx.Set("username", "log-owner")
	ctx.Set("token_name", "test-token")
	ctx.Set("token_id", 11)
	ctx.Set("original_model", "gpt-test")
	ctx.Set("group", "default")
	ctx.Set("channel_id", 202)
	ctx.Set("channel_name", "mutable-context-channel")
	ctx.Set("channel_type", 9)
	ctx.Set("use_channel", []string{"101"})
	ctx.Set(common.RequestIdKey, "local-req-7")
	ctx.Set(common.UpstreamRequestIdKey, "upstream-req-secret-7")
	common.SetContextKey(ctx, constant.ContextKeyRequestStartTime, time.Now().Add(-time.Second))

	channelSnapshot := types.ChannelError{
		ChannelId:   101,
		ChannelType: 1,
		ChannelName: "snapshot-channel",
		AutoBan:     false,
	}
	apiErr := types.NewOpenAIError(errors.New("upstream https://secret-source.example.net failed"), types.ErrorCodeBadResponseStatusCode, http.StatusBadGateway)

	// Intermediate retry failure logs to server/auto-ban path only and must not write a user-visible DB row.
	service.HandleChannelError(ctx, channelSnapshot, apiErr)
	var countAfterRetryAttempt int64
	require.NoError(t, database.Model(&model.Log{}).Count(&countAfterRetryAttempt).Error)
	assert.Zero(t, countAfterRetryAttempt)

	processChannelError(ctx, channelSnapshot, apiErr, nil)

	var stored model.Log
	require.NoError(t, database.First(&stored).Error)
	assert.Equal(t, channelSnapshot.ChannelId, stored.ChannelId)
	assert.Equal(t, "upstream-req-secret-7", stored.UpstreamRequestId)
	assert.NotContains(t, stored.Content, "secret-source.example.net")
	assert.Contains(t, stored.Content, "status_code=502")
	storedOther, err := common.StrToMap(stored.Other)
	require.NoError(t, err)
	assert.Equal(t, float64(http.StatusBadGateway), storedOther["status_code"])
	assert.Equal(t, "upstream_error", storedOther["error_type"])
	assert.Equal(t, "upstream_error", storedOther["error_code"])
	for _, key := range []string{"channel_id", "channel_name", "channel_type"} {
		assert.NotContains(t, storedOther, key)
	}
	adminInfo, ok := storedOther["admin_info"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, []any{"101"}, adminInfo["use_channel"])
	assert.Contains(t, adminInfo["upstream_error"], "status_code=502")

	logs, total, err := model.GetUserLogs(7, model.LogFilter{Type: model.LogTypeError}, 0, 10)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Len(t, logs, 1)
	assert.Zero(t, logs[0].ChannelId)
	assert.Empty(t, logs[0].ChannelName)
	assert.Empty(t, logs[0].UpstreamRequestId)
	assert.Equal(t, "local-req-7", logs[0].RequestId)
	assert.NotContains(t, logs[0].Content, "secret-source.example.net")
	userOther, err := common.StrToMap(logs[0].Other)
	require.NoError(t, err)
	assert.NotContains(t, userOther, "admin_info")
	for _, key := range []string{"channel_id", "channel_name", "channel_type"} {
		assert.NotContains(t, userOther, key)
	}
}

func TestLogFilterFromQueryHidesUpstreamRequestIdForNonAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/log/self?request_id=local-1&upstream_request_id=up-secret&channel=9&username=alice", nil)

	userFilter := logFilterFromQuery(ctx, false)
	assert.Equal(t, "local-1", userFilter.RequestId)
	assert.Empty(t, userFilter.UpstreamRequestId)
	assert.Zero(t, userFilter.Channel)
	assert.Empty(t, userFilter.Username)

	adminFilter := logFilterFromQuery(ctx, true)
	assert.Equal(t, "local-1", adminFilter.RequestId)
	assert.Equal(t, "up-secret", adminFilter.UpstreamRequestId)
	assert.Equal(t, 9, adminFilter.Channel)
	assert.Equal(t, "alice", adminFilter.Username)
}
