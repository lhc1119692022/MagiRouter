package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func saveAndRestoreConcurrencySettings(t *testing.T) {
	t.Helper()
	prevEnabled := setting.IsUserConcurrencyLimitEnabled()
	prevDefault := setting.GetUserConcurrencyLimitDefault()
	prevGroupJSON := setting.UserConcurrencyLimitGroup2JSONString()
	t.Cleanup(func() {
		setting.SetUserConcurrencyLimitEnabled(prevEnabled)
		setting.SetUserConcurrencyLimitDefault(prevDefault)
		_ = setting.UpdateUserConcurrencyLimitGroupByJSONString(prevGroupJSON)
	})
}

func TestGetSelfAndUsersIncludeConcurrencySummary(t *testing.T) {
	db := setupManageUserTestDB(t)
	saveAndRestoreConcurrencySettings(t)

	user := &model.User{
		Username:       "conc-member",
		DisplayName:    "Concurrency Member",
		Role:           common.RoleCommonUser,
		Status:         common.UserStatusEnabled,
		Group:          "vip",
		MaxConcurrency: 0,
		Quota:          1000,
		AffCode:        "aff-conc-member",
	}
	require.NoError(t, db.Create(user).Error)

	callSelf := func() map[string]any {
		gin.SetMode(gin.TestMode)
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		c.Request = httptest.NewRequest(http.MethodGet, "/api/user/self", nil)
		c.Set("id", user.Id)
		c.Set("role", user.Role)
		GetSelf(c)
		require.Equal(t, http.StatusOK, recorder.Code)
		var payload struct {
			Success bool           `json:"success"`
			Data    map[string]any `json:"data"`
		}
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &payload))
		require.True(t, payload.Success)
		return payload.Data
	}

	setting.SetUserConcurrencyLimitEnabled(false)
	setting.SetUserConcurrencyLimitDefault(5)
	require.NoError(t, setting.UpdateUserConcurrencyLimitGroupByJSONString(`{"vip":15}`))

	disabledSelf := callSelf()
	disabledSummary := disabledSelf["concurrency_limit"].(map[string]any)
	assert.Equal(t, false, disabledSummary["enabled"])
	assert.Equal(t, "disabled", disabledSummary["source"])
	assert.Equal(t, float64(0), disabledSummary["effective_limit"])

	setting.SetUserConcurrencyLimitEnabled(true)
	groupSelf := callSelf()
	groupSummary := groupSelf["concurrency_limit"].(map[string]any)
	assert.Equal(t, true, groupSummary["enabled"])
	assert.Equal(t, "group", groupSummary["source"])
	assert.Equal(t, float64(15), groupSummary["effective_limit"])

	require.NoError(t, setting.UpdateUserConcurrencyLimitGroupByJSONString(`{}`))
	defaultSelf := callSelf()
	defaultSummary := defaultSelf["concurrency_limit"].(map[string]any)
	assert.Equal(t, "default", defaultSummary["source"])
	assert.Equal(t, float64(5), defaultSummary["effective_limit"])

	require.NoError(t, db.Model(&model.User{}).Where("id = ?", user.Id).Update("max_concurrency", 25).Error)
	overrideSelf := callSelf()
	assert.Equal(t, float64(25), overrideSelf["max_concurrency"])
	overrideSummary := overrideSelf["concurrency_limit"].(map[string]any)
	assert.Equal(t, "user", overrideSummary["source"])
	assert.Equal(t, float64(25), overrideSummary["effective_limit"])
	assert.Equal(t, float64(25), overrideSummary["user_override"])

	gin.SetMode(gin.TestMode)
	listRecorder := httptest.NewRecorder()
	listCtx, _ := gin.CreateTestContext(listRecorder)
	listCtx.Request = httptest.NewRequest(http.MethodGet, "/api/user/?p=1&page_size=10", nil)
	GetAllUsers(listCtx)
	require.Equal(t, http.StatusOK, listRecorder.Code)
	var listPayload struct {
		Success bool `json:"success"`
		Data    struct {
			Items []model.User `json:"items"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(listRecorder.Body.Bytes(), &listPayload))
	require.True(t, listPayload.Success)
	require.Len(t, listPayload.Data.Items, 1)
	require.NotNil(t, listPayload.Data.Items[0].ConcurrencyLimit)
	assert.Equal(t, 25, listPayload.Data.Items[0].MaxConcurrency)
	assert.Equal(t, "user", listPayload.Data.Items[0].ConcurrencyLimit.Source)
	assert.Equal(t, 25, listPayload.Data.Items[0].ConcurrencyLimit.EffectiveLimit)
}

func TestManageUserSetConcurrencyPreservesGroupAndAudits(t *testing.T) {
	db := setupManageUserTestDB(t)
	saveAndRestoreConcurrencySettings(t)
	setting.SetUserConcurrencyLimitEnabled(true)
	setting.SetUserConcurrencyLimitDefault(4)
	require.NoError(t, setting.UpdateUserConcurrencyLimitGroupByJSONString(`{"vip":12}`))

	target := &model.User{
		Username:       "target-user",
		DisplayName:    "Target User",
		Role:           common.RoleCommonUser,
		Status:         common.UserStatusEnabled,
		Group:          "vip",
		Quota:          2000,
		MaxConcurrency: 0,
		AffCode:        "aff-target-user",
	}
	require.NoError(t, db.Create(target).Error)

	otherAdmin := &model.User{
		Username:       "other-admin",
		DisplayName:    "Other Admin",
		Role:           common.RoleAdminUser,
		Status:         common.UserStatusEnabled,
		Group:          "default",
		MaxConcurrency: 0,
		AffCode:        "aff-other-admin",
	}
	require.NoError(t, db.Create(otherAdmin).Error)

	body := fmt.Sprintf(`{"id":%d,"action":"set_concurrency","value":30}`, target.Id)
	recorder := performManageUserRequest(t, body)
	require.Equal(t, http.StatusOK, recorder.Code)

	var resp struct {
		Success bool `json:"success"`
		Data    struct {
			ID               int                            `json:"id"`
			MaxConcurrency   int                            `json:"max_concurrency"`
			ConcurrencyLimit setting.UserConcurrencySummary `json:"concurrency_limit"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &resp))
	require.True(t, resp.Success)
	assert.Equal(t, target.Id, resp.Data.ID)
	assert.Equal(t, 30, resp.Data.MaxConcurrency)
	assert.Equal(t, "user", resp.Data.ConcurrencyLimit.Source)
	assert.Equal(t, 30, resp.Data.ConcurrencyLimit.EffectiveLimit)

	var reloaded model.User
	require.NoError(t, db.First(&reloaded, target.Id).Error)
	assert.Equal(t, 30, reloaded.MaxConcurrency)
	assert.Equal(t, "vip", reloaded.Group)
	assert.Equal(t, 2000, reloaded.Quota)

	var auditLog model.AuditLog
	require.NoError(t, model.LOG_DB.Where("action = ?", "user.concurrency_update").Order("id DESC").First(&auditLog).Error)
	assert.Contains(t, auditLog.Content, "from 0 to 30")

	resetRecorder := performManageUserRequest(t, fmt.Sprintf(`{"id":%d,"action":"set_concurrency","value":0}`, target.Id))
	require.Equal(t, http.StatusOK, resetRecorder.Code)
	require.NoError(t, db.First(&reloaded, target.Id).Error)
	assert.Equal(t, 0, reloaded.MaxConcurrency)
	assert.Equal(t, "vip", reloaded.Group)

	invalidRecorder := performManageUserRequest(t, fmt.Sprintf(`{"id":%d,"action":"set_concurrency","value":100001}`, target.Id))
	var invalidResp struct {
		Success bool `json:"success"`
	}
	require.NoError(t, json.Unmarshal(invalidRecorder.Body.Bytes(), &invalidResp))
	assert.False(t, invalidResp.Success)

	gin.SetMode(gin.TestMode)
	deniedRecorder := httptest.NewRecorder()
	deniedCtx, _ := gin.CreateTestContext(deniedRecorder)
	deniedCtx.Request = httptest.NewRequest(http.MethodPost, "/api/user/manage", strings.NewReader(
		fmt.Sprintf(`{"id":%d,"action":"set_concurrency","value":10}`, otherAdmin.Id),
	))
	deniedCtx.Request.Header.Set("Content-Type", "application/json")
	deniedCtx.Set("id", 777)
	deniedCtx.Set("role", common.RoleAdminUser)
	deniedCtx.Set("username", "regular-admin")
	ManageUser(deniedCtx)
	var deniedResp struct {
		Success bool `json:"success"`
	}
	require.NoError(t, json.Unmarshal(deniedRecorder.Body.Bytes(), &deniedResp))
	assert.False(t, deniedResp.Success)
}
