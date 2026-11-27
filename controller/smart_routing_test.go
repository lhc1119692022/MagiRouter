package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetUserGroupsKeepsAutoDisabledGroupVisibleAsBackup(t *testing.T) {
	initModelListColumnNames(t)
	configureUserManagementGroupControllerTest(t)
	originalAutoGroups := setting.AutoGroups2JsonString()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateAutoGroupsByJsonString(originalAutoGroups))
	})
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"auto":"Auto","standard":"Standard line","fast":"Fast line"}`))
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["fast"]`))

	db := setupTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Channel{}, &model.Ability{}))

	user := &model.User{Id: 901, Username: "backup-user", Password: "password", Group: "default", AffCode: "aff901", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(user).Error)

	autoDisabledChannel := &model.Channel{Id: 21, Name: "auto-disabled-ch", Status: common.ChannelStatusAutoDisabled}
	manuallyDisabledChannel := &model.Channel{Id: 22, Name: "manual-disabled-ch", Status: common.ChannelStatusManuallyDisabled}
	require.NoError(t, db.Create(autoDisabledChannel).Error)
	require.NoError(t, db.Create(manuallyDisabledChannel).Error)
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: "fast", Model: "glm-4.5", ChannelId: autoDisabledChannel.Id, Enabled: false},
		{Group: "standard", Model: "gpt-4o", ChannelId: manuallyDisabledChannel.Id, Enabled: true},
	}).Error)

	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/user/self/groups", nil)
	ctx.Set("id", user.Id)
	GetUserGroups(ctx)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		Success             bool                      `json:"success"`
		Data                map[string]map[string]any `json:"data"`
		SmartRoutingEnabled bool                      `json:"smart_routing_enabled"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.True(t, resp.Success)

	assert.Equal(t, true, resp.Data["fast"]["has_models"])
	assert.Equal(t, false, resp.Data["fast"]["has_active_channels"])
	assert.Equal(t, false, resp.Data["standard"]["has_models"])
	assert.Equal(t, true, resp.Data["auto"]["has_models"])
	assert.Equal(t, false, resp.Data["auto"]["has_active_channels"])
}

func TestTokenAddUpdateAndListModelsWithSmartRoutePolicy(t *testing.T) {
	initModelListColumnNames(t)
	configureUserManagementGroupControllerTest(t)
	originalSmartCfg := setting.SmartRoutingConfig2JSONString()
	originalSelfUse := operation_setting.SelfUseModeEnabled
	operation_setting.SelfUseModeEnabled = true
	t.Cleanup(func() {
		operation_setting.SelfUseModeEnabled = originalSelfUse
		require.NoError(t, setting.UpdateSmartRoutingConfigByJSONString(originalSmartCfg))
		service.InvalidateSmartRoutingCache()
	})
	require.NoError(t, setting.UpdateSmartRoutingConfigByJSONString(`{"enabled":true,"short_window_hours":1,"long_window_hours":24}`))

	db := setupTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Channel{}, &model.Ability{}, &model.AuditLog{}))
	origLogDB := model.LOG_DB
	model.LOG_DB = db
	t.Cleanup(func() {
		model.LOG_DB = origLogDB
	})

	user := &model.User{Id: 902, Username: "smart-user", Password: "password", Group: "default", AffCode: "aff902", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(user).Error)

	enabledCh := &model.Channel{Id: 31, Name: "enabled-ch", Status: common.ChannelStatusEnabled}
	require.NoError(t, db.Create(enabledCh).Error)
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: "standard", Model: "gpt-5.2", ChannelId: enabledCh.Id, Enabled: true},
		{Group: "standard", Model: "gpt-image-1", ChannelId: enabledCh.Id, Enabled: true},
		{Group: "fast", Model: "claude-sonnet-4-5", ChannelId: enabledCh.Id, Enabled: true},
	}).Error)
	service.InvalidateSmartRoutingCache()

	// Create token with built-in route_policy even when "auto" is not in UserUsableGroups.
	addBody, _ := json.Marshal(map[string]any{
		"name":            "smart-cost-key",
		"expired_time":    -1,
		"unlimited_quota": true,
		"group":           "auto",
		"route_policy":    model.TokenRoutePolicyCostFirst,
	})
	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/token/", bytes.NewReader(addBody))
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("id", user.Id)
	AddToken(ctx)
	require.Equal(t, http.StatusOK, rec.Code)

	var created model.Token
	require.NoError(t, db.Where("user_id = ? AND name = ?", user.Id, "smart-cost-key").First(&created).Error)
	assert.Equal(t, "auto", created.Group)
	assert.Equal(t, model.TokenRoutePolicyCostFirst, created.GetRoutePolicy())
	assert.True(t, created.CrossGroupRetry)
	autoGroups, err := created.GetAutoGroups()
	require.NoError(t, err)
	assert.Nil(t, autoGroups)

	// GET /api/token/:id exposes route_policy cleanly without leaking sentinel string in auto_groups.
	getRec := httptest.NewRecorder()
	getCtx, _ := gin.CreateTestContext(getRec)
	getCtx.Request = httptest.NewRequest(http.MethodGet, "/api/token/1", nil)
	getCtx.Params = gin.Params{{Key: "id", Value: "1"}}
	getCtx.Set("id", user.Id)
	GetToken(getCtx)
	require.Equal(t, http.StatusOK, getRec.Code)
	var getResp struct {
		Success bool `json:"success"`
		Data    struct {
			Group       string   `json:"group"`
			RoutePolicy string   `json:"route_policy"`
			AutoGroups  []string `json:"auto_groups"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(getRec.Body.Bytes(), &getResp))
	require.True(t, getResp.Success)
	assert.Equal(t, model.TokenRoutePolicyCostFirst, getResp.Data.RoutePolicy)
	assert.Empty(t, getResp.Data.AutoGroups)

	// ListModels for a smart-policy token returns only reasoning models.
	modelRec := httptest.NewRecorder()
	modelCtx, _ := gin.CreateTestContext(modelRec)
	modelCtx.Request = httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	modelCtx.Set("id", user.Id)
	common.SetContextKey(modelCtx, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(modelCtx, constant.ContextKeyTokenGroup, "auto")
	common.SetContextKey(modelCtx, constant.ContextKeyTokenRoutePolicy, model.TokenRoutePolicyCostFirst)
	ListModels(modelCtx, constant.ChannelTypeOpenAI)
	require.Equal(t, http.StatusOK, modelRec.Code)
	var modelResp struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(modelRec.Body.Bytes(), &modelResp))
	ids := make([]string, 0, len(modelResp.Data))
	for _, item := range modelResp.Data {
		ids = append(ids, item.ID)
	}
	assert.Contains(t, ids, "gpt-5.2")
	assert.Contains(t, ids, "claude-sonnet-4-5")
	assert.NotContains(t, ids, "gpt-image-1")

	// Playground billing-key model scoping resolves smart-policy eligible groups and rejects when disabled.
	pgGroup, pgGroups, pgAllowed := playgroundBillingKeyGroups(&created, "default", "")
	assert.True(t, pgAllowed)
	assert.Equal(t, "auto", pgGroup)
	assert.ElementsMatch(t, []string{"standard", "fast"}, pgGroups)

	require.NoError(t, setting.UpdateSmartRoutingConfigByJSONString(`{"enabled":false,"short_window_hours":1,"long_window_hours":24}`))
	_, _, pgAllowedDisabled := playgroundBillingKeyGroups(&created, "default", "")
	assert.False(t, pgAllowedDisabled)
	require.NoError(t, setting.UpdateSmartRoutingConfigByJSONString(`{"enabled":true,"short_window_hours":1,"long_window_hours":24}`))

	// PreviewSmartRouting returns ranked candidates for both policies.
	previewBody := `{"enabled":true,"short_window_hours":1,"long_window_hours":24,"excluded_groups":["fast"]}`
	previewRec := httptest.NewRecorder()
	previewCtx, _ := gin.CreateTestContext(previewRec)
	previewCtx.Request = httptest.NewRequest(http.MethodPost, "/api/option/smart_routing/preview", bytes.NewBufferString(previewBody))
	previewCtx.Set("id", user.Id)
	PreviewSmartRouting(previewCtx)
	require.Equal(t, http.StatusOK, previewRec.Code)
	var previewResp struct {
		Success bool                                `json:"success"`
		Data    service.SmartRoutingPreviewResponse `json:"data"`
	}
	require.NoError(t, json.Unmarshal(previewRec.Body.Bytes(), &previewResp))
	require.True(t, previewResp.Success)
	assert.Equal(t, 1, previewResp.Data.Config.EligibleGroupCount)
	require.Len(t, previewResp.Data.Models, 1)
	assert.Equal(t, "gpt-5.2", previewResp.Data.Models[0].Model)
}
