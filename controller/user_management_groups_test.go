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
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func configureUserManagementGroupControllerTest(t *testing.T) {
	t.Helper()
	originalUsable := setting.UserUsableGroups2JSONString()
	originalRatios := ratio_setting.GroupRatio2JSONString()
	originalGroupGroup := ratio_setting.GroupGroupRatio2JSONString()
	originalUserManaged := ratio_setting.UserManagementGroups2JSONString()
	originalSpecial := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.ReadAll()

	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"standard":1,"fast":1.5}`))
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"standard":"Standard line","fast":"Fast line"}`))
	require.NoError(t, ratio_setting.UpdateUserManagementGroupsByJSONString(`{"default":"Default user tier","vip":"VIP user tier"}`))
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{"vip":{"standard":0.8}}`))
	special := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
	special.Clear()

	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsable))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
		require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(originalGroupGroup))
		require.NoError(t, ratio_setting.UpdateUserManagementGroupsByJSONString(originalUserManaged))
		specialMap := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
		specialMap.Clear()
		specialMap.AddAll(originalSpecial)
	})
}

func TestGetGroupsScopesBillingVsAll(t *testing.T) {
	configureUserManagementGroupControllerTest(t)
	gin.SetMode(gin.TestMode)

	// Default /api/group/ returns billing + user-management-only groups (for Users / Subscriptions).
	allRecorder := httptest.NewRecorder()
	allCtx, _ := gin.CreateTestContext(allRecorder)
	allCtx.Request = httptest.NewRequest(http.MethodGet, "/api/group/", nil)
	GetGroups(allCtx)
	require.Equal(t, http.StatusOK, allRecorder.Code)

	var allResp struct {
		Success bool     `json:"success"`
		Data    []string `json:"data"`
	}
	require.NoError(t, json.Unmarshal(allRecorder.Body.Bytes(), &allResp))
	assert.True(t, allResp.Success)
	assert.Equal(t, []string{"default", "fast", "standard", "vip"}, allResp.Data)

	// /api/group/?scope=billing returns billing groups only (for Channels).
	billingRecorder := httptest.NewRecorder()
	billingCtx, _ := gin.CreateTestContext(billingRecorder)
	billingCtx.Request = httptest.NewRequest(http.MethodGet, "/api/group/?scope=billing", nil)
	GetGroups(billingCtx)
	require.Equal(t, http.StatusOK, billingRecorder.Code)

	var billingResp struct {
		Success bool     `json:"success"`
		Data    []string `json:"data"`
	}
	require.NoError(t, json.Unmarshal(billingRecorder.Body.Bytes(), &billingResp))
	assert.True(t, billingResp.Success)
	assert.Equal(t, []string{"fast", "standard"}, billingResp.Data)
}

func TestGetUserGroupsExcludesUserManagementGroupsAndFlagsExplicitSelection(t *testing.T) {
	configureUserManagementGroupControllerTest(t)
	db := setupTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.AuditLog{}))
	require.NoError(t, model.InitLogDB())

	managedUser := &model.User{Id: 301, Username: "managed-user", Password: "password", Group: "default", AffCode: "aff301", Status: common.UserStatusEnabled}
	billingUser := &model.User{Id: 302, Username: "billing-user", Password: "password", Group: "standard", AffCode: "aff302", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(managedUser).Error)
	require.NoError(t, db.Create(billingUser).Error)

	// User in user-management-only group ("default")
	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/user/self/groups", nil)
	ctx.Set("id", managedUser.Id)
	GetUserGroups(ctx)
	require.Equal(t, http.StatusOK, rec.Code)

	var managedResp struct {
		Success              bool                      `json:"success"`
		Data                 map[string]map[string]any `json:"data"`
		UserGroup            string                    `json:"user_group"`
		RequireExplicitGroup bool                      `json:"require_explicit_group"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &managedResp))
	assert.True(t, managedResp.Success)
	assert.Equal(t, "default", managedResp.UserGroup)
	assert.True(t, managedResp.RequireExplicitGroup)
	assert.NotContains(t, managedResp.Data, "default")
	assert.NotContains(t, managedResp.Data, "vip")
	assert.Contains(t, managedResp.Data, "standard")
	assert.Contains(t, managedResp.Data, "fast")

	// User in ordinary billing group ("standard")
	rec2 := httptest.NewRecorder()
	ctx2, _ := gin.CreateTestContext(rec2)
	ctx2.Request = httptest.NewRequest(http.MethodGet, "/api/user/self/groups", nil)
	ctx2.Set("id", billingUser.Id)
	GetUserGroups(ctx2)
	require.Equal(t, http.StatusOK, rec2.Code)

	var billingResp struct {
		Success              bool `json:"success"`
		RequireExplicitGroup bool `json:"require_explicit_group"`
	}
	require.NoError(t, json.Unmarshal(rec2.Body.Bytes(), &billingResp))
	assert.True(t, billingResp.Success)
	assert.False(t, billingResp.RequireExplicitGroup)
}

func TestAddAndUpdateTokenEnforceExplicitBillingGroup(t *testing.T) {
	configureUserManagementGroupControllerTest(t)
	db := setupTokenControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	user := &model.User{Id: 401, Username: "token-umg-user", Password: "password", Group: "default", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(user).Error)

	sendAddToken := func(group string) tokenAPIResponse {
		body := map[string]any{
			"name":            "key-" + group,
			"expired_time":    -1,
			"remain_quota":    0,
			"unlimited_quota": true,
			"group":           group,
		}
		ctx, rec := newAuthenticatedContext(t, http.MethodPost, "/api/token/", body, user.Id)
		common.SetContextKey(ctx, constant.ContextKeyUserGroup, user.Group)
		AddToken(ctx)
		var resp tokenAPIResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		return resp
	}

	// Empty group must be rejected when account group is user-management-only.
	emptyResp := sendAddToken("")
	assert.False(t, emptyResp.Success)
	assert.Contains(t, emptyResp.Message, "user management only")

	// Explicitly picking a user-management-only group must be rejected.
	umgResp := sendAddToken("default")
	assert.False(t, umgResp.Success)
	assert.Contains(t, umgResp.Message, "user management only")

	// Explicitly picking an authorized billing group succeeds.
	okResp := sendAddToken("standard")
	assert.True(t, okResp.Success)

	var created struct {
		ID int `json:"id"`
	}
	require.NoError(t, json.Unmarshal(okResp.Data, &created))
	require.Greater(t, created.ID, 0)

	// Updating the token back to empty group or user-management-only group must be rejected.
	updateBody := map[string]any{
		"id":              created.ID,
		"name":            "key-updated",
		"expired_time":    -1,
		"remain_quota":    0,
		"unlimited_quota": true,
		"group":           "",
	}
	uCtx, uRec := newAuthenticatedContext(t, http.MethodPut, "/api/token/", updateBody, user.Id)
	common.SetContextKey(uCtx, constant.ContextKeyUserGroup, user.Group)
	UpdateToken(uCtx)
	var uResp tokenAPIResponse
	require.NoError(t, json.Unmarshal(uRec.Body.Bytes(), &uResp))
	assert.False(t, uResp.Success)

	// Playground billing key scope rejects legacy empty-group token under user-management-only account group.
	_, _, allowedLegacy := playgroundBillingKeyGroups(&model.Token{Group: ""}, "default", "")
	assert.False(t, allowedLegacy)
	group, groups, allowedBilling := playgroundBillingKeyGroups(&model.Token{Group: "standard"}, "default", "")
	assert.True(t, allowedBilling)
	assert.Equal(t, "standard", group)
	assert.Equal(t, []string{"standard"}, groups)
}

func TestAddChannelRejectsUserManagementOnlyGroup(t *testing.T) {
	configureUserManagementGroupControllerTest(t)
	gin.SetMode(gin.TestMode)

	payload := map[string]any{
		"mode": "single",
		"channel": map[string]any{
			"name":   "test-ch",
			"type":   1,
			"key":    "sk-test",
			"models": "gpt-4o",
			"group":  "default,standard",
		},
	}
	raw, err := json.Marshal(payload)
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/channel/", bytes.NewReader(raw))
	ctx.Request.Header.Set("Content-Type", "application/json")
	AddChannel(ctx)

	var resp struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.False(t, resp.Success)
	assert.Contains(t, resp.Message, "user management only")
}

func TestPricingFilteringExcludesUserManagementOnlyGroups(t *testing.T) {
	configureUserManagementGroupControllerTest(t)

	models := []model.Pricing{
		{ModelName: "only-default", EnableGroup: []string{"default"}},
		{ModelName: "mixed-model", EnableGroup: []string{"default", "standard"}},
	}

	// Logged-in user in user-management-only "default" group
	usable := service.GetUserUsableGroups("default")
	filtered := filterPricingByUsableGroups(models, usable)
	require.Len(t, filtered, 1)
	assert.Equal(t, "mixed-model", filtered[0].ModelName)
	assert.Equal(t, []string{"standard"}, filtered[0].EnableGroup)

	// Anonymous visitor
	anonUsable := service.GetUserUsableGroups("")
	anonFiltered := filterPricingByUsableGroups(models, anonUsable)
	require.Len(t, anonFiltered, 1)
	assert.Equal(t, "mixed-model", anonFiltered[0].ModelName)
	assert.Equal(t, []string{"standard"}, anonFiltered[0].EnableGroup)
}
