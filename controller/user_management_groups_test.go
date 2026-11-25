package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
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

func sendGroupOptionRequest(t *testing.T, handler gin.HandlerFunc, path string, payload any) (int, map[string]any) {
	t.Helper()
	raw, err := common.Marshal(payload)
	require.NoError(t, err)
	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Request = httptest.NewRequest(http.MethodPut, path, bytes.NewReader(raw))
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("id", 1)
	ctx.Set("username", "root")
	ctx.Set("role", common.RoleRootUser)
	handler(ctx)

	var resp map[string]any
	require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &resp))
	return rec.Code, resp
}

func resetGroupOptionRows(t *testing.T, db *gorm.DB, rows map[string]string) {
	t.Helper()
	require.NoError(t, db.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&model.Option{}).Error)
	for key, value := range rows {
		require.NoError(t, db.Create(&model.Option{Key: key, Value: value}).Error)
	}
}

func readGroupOptionValueMap(t *testing.T, db *gorm.DB) map[string]string {
	t.Helper()
	var options []model.Option
	require.NoError(t, db.Find(&options).Error)
	result := make(map[string]string, len(options))
	for _, option := range options {
		result[option.Key] = option.Value
	}
	return result
}

func TestUpdateGroupSettingsPermissions(t *testing.T) {
	admin, _ := setupAccessTokenAudit(t)
	_, adminSession := createAccessTokenTestSession(t, admin.Id, "group-settings-admin")
	root := &model.User{Username: "group-settings-root", Role: common.RoleRootUser, Status: common.UserStatusEnabled, AuthVersion: 1, AffCode: "grp-root"}
	require.NoError(t, model.DB.Create(root).Error)
	_, rootSession := createAccessTokenTestSession(t, root.Id, "group-settings-root")
	reader, _ := createScopedAccessToken(t, root.Id, 0, "option:read")
	writer, _ := createScopedAccessToken(t, root.Id, 0, "option:write")
	router := gin.New()
	const path = "/api/option/group_settings"
	router.PUT(path, middleware.RootAuth(), UpdateGroupSettings)
	for _, tc := range []struct {
		name, credential string
		status           int
	}{
		{"anonymous", "", http.StatusUnauthorized},
		{"non-root administrator", adminSession, http.StatusForbidden},
		{"root read-only grant", reader, http.StatusForbidden},
		{"root browser session reaches handler", rootSession, http.StatusBadRequest},
		{"root write grant reaches handler", writer, http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			response := accessTokenRequest(router, http.MethodPut, path, tc.credential, "", `{}`)
			require.Equal(t, tc.status, response.Code, response.Body.String())
		})
	}
}

func TestDefaultGroupProtectionAndRepairDatabaseMatrix(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("parse and validation invariants", func(t *testing.T) {
		parsed, err := ratio_setting.ParseGroupRatio(`{"default":1,"vip":0.8}`)
		require.NoError(t, err)
		assert.Equal(t, map[string]float64{"default": 1, "vip": 0.8}, parsed)

		for _, invalid := range []string{"", "null", "[]", `{"":1}`, `{"default":-0.5}`} {
			_, parseErr := ratio_setting.ParseGroupRatio(invalid)
			assert.Error(t, parseErr, "expected error for %q", invalid)
		}

		require.NoError(t, ratio_setting.ValidateGroupSettings(map[string]float64{"default": 1}, map[string]string{}))
		require.NoError(t, ratio_setting.ValidateGroupSettings(map[string]float64{"vip": 0.8}, map[string]string{"default": "Member"}))

		for _, tc := range []struct {
			name   string
			ratios map[string]float64
			umg    map[string]string
			want   string
		}{
			{"missing default with other billing", map[string]float64{"vip": 0.8}, map[string]string{}, "The default group cannot be deleted"},
			{"all empty", map[string]float64{}, map[string]string{}, "The default group cannot be deleted"},
			{"default in UMG without billing group", map[string]float64{}, map[string]string{"default": "Member"}, "At least one billing group must be kept"},
			{"auto alone does not count as billing", map[string]float64{"auto": 1}, map[string]string{"default": "Member"}, "At least one billing group must be kept"},
			{"default in both maps leaves zero billing", map[string]float64{"default": 1}, map[string]string{"default": "Member"}, "At least one billing group must be kept"},
		} {
			t.Run(tc.name, func(t *testing.T) {
				validationErr := ratio_setting.ValidateGroupSettings(tc.ratios, tc.umg)
				require.Error(t, validationErr)
				assert.Equal(t, tc.want, validationErr.Error())
			})
		}
	})

	for _, dialect := range []struct{ kind, env string }{
		{"sqlite", ""},
		{"mysql", "TEST_MYSQL_DSN"},
		{"postgres", "TEST_POSTGRES_DSN"},
	} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}
			originalUsable := setting.UserUsableGroups2JSONString()
			originalRatios := ratio_setting.GroupRatio2JSONString()
			originalUMG := ratio_setting.UserManagementGroups2JSONString()
			t.Cleanup(func() {
				require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsable))
				require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
				require.NoError(t, ratio_setting.UpdateUserManagementGroupsByJSONString(originalUMG))
			})

			db := modelManagementDB(t, dialect.kind, os.Getenv(dialect.env))
			require.NoError(t, db.AutoMigrate(&model.SystemTask{}))

			t.Run("startup repair restores deleted default idempotently", func(t *testing.T) {
				// Fresh database without group rows is untouched.
				resetGroupOptionRows(t, db, nil)
				require.NoError(t, model.EnsureDefaultGroupOptions())
				assert.Empty(t, readGroupOptionValueMap(t, db))

				// All groups deleted -> restores default billing + usable group idempotently.
				resetGroupOptionRows(t, db, map[string]string{
					model.GroupRatioOptionKey:           "{}",
					model.UserUsableGroupsOptionKey:     "{}",
					model.UserManagementGroupsOptionKey: "{}",
				})
				require.NoError(t, model.EnsureDefaultGroupOptions())
				require.NoError(t, model.EnsureDefaultGroupOptions())

				stored := readGroupOptionValueMap(t, db)
				ratios, err := ratio_setting.ParseGroupRatio(stored[model.GroupRatioOptionKey])
				require.NoError(t, err)
				assert.Equal(t, map[string]float64{"default": 1}, ratios)
				var usable map[string]string
				require.NoError(t, common.UnmarshalJsonStr(stored[model.UserUsableGroupsOptionKey], &usable))
				assert.Equal(t, map[string]string{"default": setting.DefaultGroupDescription}, usable)
				model.InitOptionMap()
				assert.Equal(t, map[string]float64{"default": 1}, ratio_setting.GetGroupRatioCopy())
				assert.Equal(t, map[string]string{"default": setting.DefaultGroupDescription}, setting.GetUserUsableGroupsCopy())

				// Only default deleted -> restores default while keeping remaining groups.
				resetGroupOptionRows(t, db, map[string]string{
					model.GroupRatioOptionKey:       `{"vip":0.8}`,
					model.UserUsableGroupsOptionKey: `{"vip":"VIP"}`,
				})
				require.NoError(t, model.EnsureDefaultGroupOptions())
				stored = readGroupOptionValueMap(t, db)
				ratios, err = ratio_setting.ParseGroupRatio(stored[model.GroupRatioOptionKey])
				require.NoError(t, err)
				assert.Equal(t, map[string]float64{"default": 1, "vip": 0.8}, ratios)
				usable = nil
				require.NoError(t, common.UnmarshalJsonStr(stored[model.UserUsableGroupsOptionKey], &usable))
				assert.Equal(t, map[string]string{"default": setting.DefaultGroupDescription, "vip": "VIP"}, usable)

				// Default in UMG with zero billing groups -> restores default to billing preserving description.
				resetGroupOptionRows(t, db, map[string]string{
					model.GroupRatioOptionKey:           "{}",
					model.UserUsableGroupsOptionKey:     "{}",
					model.UserManagementGroupsOptionKey: `{"default":"Standard member"}`,
				})
				require.NoError(t, model.EnsureDefaultGroupOptions())
				stored = readGroupOptionValueMap(t, db)
				ratios, err = ratio_setting.ParseGroupRatio(stored[model.GroupRatioOptionKey])
				require.NoError(t, err)
				assert.Equal(t, map[string]float64{"default": 1}, ratios)
				umg, err := ratio_setting.ParseUserManagementGroups(stored[model.UserManagementGroupsOptionKey])
				require.NoError(t, err)
				assert.Empty(t, umg)
				usable = nil
				require.NoError(t, common.UnmarshalJsonStr(stored[model.UserUsableGroupsOptionKey], &usable))
				assert.Equal(t, map[string]string{"default": "Standard member"}, usable)

				// Healthy non-selectable default and healthy UMG default stay untouched.
				resetGroupOptionRows(t, db, map[string]string{
					model.GroupRatioOptionKey:       `{"default":1,"vip":0.8}`,
					model.UserUsableGroupsOptionKey: `{"vip":"VIP"}`,
				})
				require.NoError(t, model.EnsureDefaultGroupOptions())
				stored = readGroupOptionValueMap(t, db)
				assert.Equal(t, `{"vip":"VIP"}`, stored[model.UserUsableGroupsOptionKey])

				resetGroupOptionRows(t, db, map[string]string{
					model.GroupRatioOptionKey:           `{"standard":1}`,
					model.UserUsableGroupsOptionKey:     `{"standard":"Standard"}`,
					model.UserManagementGroupsOptionKey: `{"default":"Member"}`,
				})
				require.NoError(t, model.EnsureDefaultGroupOptions())
				stored = readGroupOptionValueMap(t, db)
				assert.Equal(t, `{"standard":1}`, stored[model.GroupRatioOptionKey])
				assert.Equal(t, `{"default":"Member"}`, stored[model.UserManagementGroupsOptionKey])

				// Both GroupRatio and group_ratio_setting.group_ratio emptied -> both repaired.
				resetGroupOptionRows(t, db, map[string]string{
					model.GroupRatioOptionKey:            "{}",
					model.GroupRatioSettingGroupRatioKey: "{}",
					model.UserUsableGroupsOptionKey:      "{}",
				})
				require.NoError(t, model.EnsureDefaultGroupOptions())
				stored = readGroupOptionValueMap(t, db)
				for _, key := range []string{model.GroupRatioOptionKey, model.GroupRatioSettingGroupRatioKey} {
					repairedRatios, parseErr := ratio_setting.ParseGroupRatio(stored[key])
					require.NoError(t, parseErr)
					assert.Equal(t, map[string]float64{"default": 1}, repairedRatios)
				}
			})

			t.Run("option endpoints enforce invariants and atomic transitions", func(t *testing.T) {
				resetGroupOptionRows(t, db, nil)
				require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1}`))
				require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default group"}`))
				require.NoError(t, ratio_setting.UpdateUserManagementGroupsByJSONString(`{}`))

				// Single-key PUT /api/option/ rejects deleting default or leaving zero billing groups.
				_, resp := sendGroupOptionRequest(t, UpdateOption, "/api/option/", map[string]any{
					"key":   model.GroupRatioOptionKey,
					"value": "{}",
				})
				assert.Equal(t, false, resp["success"])
				assert.Equal(t, "The default group cannot be deleted", resp["message"])

				_, resp = sendGroupOptionRequest(t, UpdateOption, "/api/option/", map[string]any{
					"key":   model.GroupRatioSettingGroupRatioKey,
					"value": `{"vip":0.8}`,
				})
				assert.Equal(t, false, resp["success"])
				assert.Equal(t, "The default group cannot be deleted", resp["message"])

				_, resp = sendGroupOptionRequest(t, UpdateOption, "/api/option/", map[string]any{
					"key":   model.UserManagementGroupsOptionKey,
					"value": `{"default":"Member"}`,
				})
				assert.Equal(t, false, resp["success"])
				assert.Equal(t, "At least one billing group must be kept", resp["message"])

				// Atomic endpoint rejects keys outside allowlist.
				code, resp := sendGroupOptionRequest(t, UpdateGroupSettings, "/api/option/group_settings", map[string]any{
					"options": map[string]any{"ServerAddress": "https://evil.example"},
				})
				assert.Equal(t, http.StatusBadRequest, code)
				assert.Equal(t, false, resp["success"])

				// Atomic endpoint rejects deleting default.
				_, resp = sendGroupOptionRequest(t, UpdateGroupSettings, "/api/option/group_settings", map[string]any{
					"options": map[string]any{
						model.GroupRatioOptionKey:           `{"vip":0.8}`,
						model.UserManagementGroupsOptionKey: `{}`,
					},
				})
				assert.Equal(t, false, resp["success"])
				assert.Equal(t, "The default group cannot be deleted", resp["message"])

				// Atomic move: default -> UMG while adding vip billing group.
				code, resp = sendGroupOptionRequest(t, UpdateGroupSettings, "/api/option/group_settings", map[string]any{
					"options": map[string]any{
						model.GroupRatioOptionKey:           `{"vip":0.8}`,
						model.UserUsableGroupsOptionKey:     `{"vip":"VIP"}`,
						model.UserManagementGroupsOptionKey: `{"default":"Member"}`,
					},
				})
				assert.Equal(t, http.StatusOK, code)
				assert.Equal(t, true, resp["success"])
				assert.Equal(t, map[string]float64{"vip": 0.8}, ratio_setting.GetGroupRatioCopy())
				assert.Equal(t, map[string]string{"default": "Member"}, ratio_setting.GetUserManagementGroupsCopy())

				// Single-key attempt to delete default from UMG while absent from GroupRatio fails.
				_, resp = sendGroupOptionRequest(t, UpdateOption, "/api/option/", map[string]any{
					"key":   model.UserManagementGroupsOptionKey,
					"value": `{}`,
				})
				assert.Equal(t, false, resp["success"])
				assert.Equal(t, "The default group cannot be deleted", resp["message"])

				// Atomic reverse transition: move default back to billing while removing vip.
				code, resp = sendGroupOptionRequest(t, UpdateGroupSettings, "/api/option/group_settings", map[string]any{
					"options": map[string]any{
						model.GroupRatioOptionKey:           `{"default":1}`,
						model.UserUsableGroupsOptionKey:     `{"default":"Default group"}`,
						model.UserManagementGroupsOptionKey: `{}`,
					},
				})
				assert.Equal(t, http.StatusOK, code)
				assert.Equal(t, true, resp["success"])
				assert.Equal(t, map[string]float64{"default": 1}, ratio_setting.GetGroupRatioCopy())
				assert.Empty(t, ratio_setting.GetUserManagementGroupsCopy())
			})
		})
	}
}
