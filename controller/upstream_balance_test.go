package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupUpstreamBalanceControllerTest(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dsn := fmt.Sprintf("file:upstream_ctrl_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.Channel{}, &model.User{}, &model.AuditLog{}, &model.SystemTask{}))

	origDB := model.DB
	origLogDB := model.LOG_DB
	origRedisEnabled := common.RedisEnabled
	origOptionMap := common.OptionMap
	origSetting := operation_setting.GetUpstreamBalanceSettingSnapshot()

	model.DB = db
	model.LOG_DB = db
	common.RedisEnabled = false
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()

	t.Cleanup(func() {
		if optionMap, mapErr := origSetting.ToOptionMap(); mapErr == nil {
			_ = model.UpdateOptionsBulk(optionMap)
		}
		model.DB = origDB
		model.LOG_DB = origLogDB
		common.RedisEnabled = origRedisEnabled
		common.OptionMapRWMutex.Lock()
		common.OptionMap = origOptionMap
		common.OptionMapRWMutex.Unlock()
	})
}

func TestUpdateUpstreamBalanceSettingsRedactsAndPreservesSecret(t *testing.T) {
	setupUpstreamBalanceControllerTest(t)

	baseURL := "https://upstream.example.com"
	ch := &model.Channel{Name: "Test Channel", Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, BaseURL: &baseURL, Key: "sk-key", Group: "default"}
	require.NoError(t, model.DB.Create(ch).Error)

	payload1 := `{
		"enabled": true,
		"check_interval_minutes": 20,
		"alert_cooldown_minutes": 720,
		"notify_emails": "ops@example.com",
		"default_min_balance_cny": 60,
		"default_min_percent": 15,
		"sites": {
			"https://upstream.example.com": {
				"name": "My Upstream",
				"provider_type": "new_api",
				"cny_rate": 2.5,
				"access_token": "super-secret-token",
				"user_id": "12"
			}
		},
		"channels": {}
	}`

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPut, "/api/option/upstream_balance", bytes.NewBufferString(payload1))
	c.Request.Header.Set("Content-Type", "application/json")
	UpdateUpstreamBalanceSettings(c)
	require.Equal(t, http.StatusOK, w.Code)
	assert.NotContains(t, w.Body.String(), "super-secret-token")

	var resp struct {
		Success bool                            `json:"success"`
		Data    service.UpstreamBalanceOverview `json:"data"`
	}
	require.NoError(t, common.Unmarshal(w.Body.Bytes(), &resp))
	require.True(t, resp.Success)
	assert.True(t, resp.Data.Settings.Sites["https://upstream.example.com"].HasAccessToken)
	assert.Empty(t, resp.Data.Settings.Sites["https://upstream.example.com"].AccessToken)
	assert.Equal(t, "super-secret-token", operation_setting.GetUpstreamBalanceSettingSnapshot().Sites["https://upstream.example.com"].AccessToken)

	// Generic GET /api/option/ must NOT expose upstream balance secrets or state.
	wOpt := httptest.NewRecorder()
	cOpt, _ := gin.CreateTestContext(wOpt)
	cOpt.Request = httptest.NewRequest(http.MethodGet, "/api/option/", nil)
	GetOptions(cOpt)
	require.Equal(t, http.StatusOK, wOpt.Code)
	assert.NotContains(t, wOpt.Body.String(), "super-secret-token")
	assert.NotContains(t, wOpt.Body.String(), "upstream_balance_setting.")
}
