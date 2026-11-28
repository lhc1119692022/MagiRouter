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
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRenameGroupAndBillingGroupsEndpoint(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file:ctrl_group_rename?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.Option{},
		&model.Channel{},
		&model.Ability{},
		&model.User{},
		&model.Token{},
		&model.SubscriptionPlan{},
		&model.UserSubscription{},
		&model.SystemTask{},
		&model.Model{},
		&model.Vendor{},
		&model.Log{},
		&model.AuditLog{},
	))

	origDB := model.DB
	origLogDB := model.LOG_DB
	origRedis := common.RedisEnabled
	origOptionMap := common.OptionMap
	origRatios := ratio_setting.GroupRatio2JSONString()
	origUsable := setting.UserUsableGroups2JSONString()
	origUserMgmt := ratio_setting.UserManagementGroups2JSONString()
	origGroupExpr := billing_setting.GetGroupBillingExprCopy()
	model.DB = db
	model.LOG_DB = db
	common.RedisEnabled = false
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		_ = ratio_setting.UpdateGroupRatioByJSONString(origRatios)
		_ = setting.UpdateUserUsableGroupsByJSONString(origUsable)
		_ = ratio_setting.UpdateUserManagementGroupsByJSONString(origUserMgmt)
		if encoded, err := common.Marshal(origGroupExpr); err == nil {
			_ = model.UpdateOptionsBulk(map[string]string{billing_setting.GroupBillingExprOption: string(encoded)})
		}
		model.DB = origDB
		model.LOG_DB = origLogDB
		common.RedisEnabled = origRedis
		common.OptionMapRWMutex.Lock()
		common.OptionMap = origOptionMap
		common.OptionMapRWMutex.Unlock()
	})

	require.NoError(t, model.UpdateOptionsBulk(map[string]string{
		model.GroupRatioOptionKey:              `{"default":1,"alpha":0.75}`,
		model.UserUsableGroupsOptionKey:        `{"default":"Default"}`,
		model.UserManagementGroupsOptionKey:    `{"tier1":"User tier only"}`,
		billing_setting.GroupBillingExprOption: `{"alpha::gpt-5":"tier(\"base\", p * 1.5 + c * 3)"}`,
	}))
	ch := &model.Channel{Name: "alpha-ch", Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, Models: "gpt-5", Group: "alpha"}
	require.NoError(t, db.Create(ch).Error)
	require.NoError(t, ch.AddAbilities(db))

	// GET /api/group/?scope=billing returns billing groups AND real admin group_ratio (including non-user-usable billing group alpha).
	r := gin.New()
	r.GET("/api/group/", GetGroups)
	r.POST("/api/option/group_settings/rename", RenameGroup)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/group/?scope=billing", nil)
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)
	var groupsResp struct {
		Success    bool               `json:"success"`
		Data       []string           `json:"data"`
		GroupRatio map[string]float64 `json:"group_ratio"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &groupsResp))
	assert.True(t, groupsResp.Success)
	assert.Equal(t, []string{"alpha", "default"}, groupsResp.Data)
	assert.InDelta(t, 0.75, groupsResp.GroupRatio["alpha"], 1e-9)
	assert.NotContains(t, groupsResp.GroupRatio, "tier1")

	// POST /api/option/group_settings/rename migrates alpha -> beta atomically.
	body, _ := json.Marshal(map[string]any{"old_name": "alpha", "new_name": "beta", "dry_run": false})
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/option/group_settings/rename", bytes.NewReader(body))
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)
	var renameResp struct {
		Success bool                    `json:"success"`
		Data    model.GroupRenameImpact `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &renameResp))
	assert.True(t, renameResp.Success)
	assert.Equal(t, 1, renameResp.Data.Channels)
	assert.Equal(t, 1, renameResp.Data.ModelGroupPrices)

	// Verify GET /api/group/?scope=billing now exposes beta with ratio 0.75.
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/group/?scope=billing", nil)
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)
	groupsResp = struct {
		Success    bool               `json:"success"`
		Data       []string           `json:"data"`
		GroupRatio map[string]float64 `json:"group_ratio"`
	}{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &groupsResp))
	assert.Equal(t, []string{"beta", "default"}, groupsResp.Data)
	assert.InDelta(t, 0.75, groupsResp.GroupRatio["beta"], 1e-9)
}
