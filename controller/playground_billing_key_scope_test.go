package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGetUserModelsBillingKeyScope(t *testing.T) {
	originalGroups := setting.UserUsableGroups2JSONString()
	originalAuto := setting.AutoGroups2JsonString()
	originalRatios := ratio_setting.GroupRatio2JSONString()
	specialGroups := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
	originalSpecial := specialGroups.ReadAll()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalGroups))
		require.NoError(t, setting.UpdateAutoGroupsByJsonString(originalAuto))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
		specialGroups.Clear()
		specialGroups.AddAll(originalSpecial)
	})
	specialGroups.Clear()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","vip":"VIP","aliases":"Aliases","stale":"Stale","auto":"Automatic"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":2,"aliases":1}`))
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["default","vip"]`))

	for _, dialect := range []struct{ name, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.name, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}
			db := modelManagementDB(t, dialect.name, os.Getenv(dialect.env))
			require.NoError(t, db.AutoMigrate(&model.Token{}))
			owner := model.User{Username: "scope-owner", AffCode: "scope1", Group: "default", Status: common.UserStatusEnabled}
			other := model.User{Username: "scope-other", AffCode: "scope2", Group: "vip", Status: common.UserStatusEnabled}
			require.NoError(t, db.Create(&owner).Error)
			require.NoError(t, db.Create(&other).Error)
			route := model.Channel{Name: "fixture", Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled,
				ModelMapping: common.GetPointer(`{"scope-chat":"gpt-4.1","scope-other-chat":"hidden-mapping-target"}`)}
			require.NoError(t, db.Create(&route).Error)
			require.NoError(t, db.Create(&[]model.Ability{
				{Group: "default", Model: "scope-chat", ChannelId: route.Id, Enabled: true},
				{Group: "default", Model: "scope-other-chat", ChannelId: route.Id, Enabled: true},
				{Group: "vip", Model: "scope-vip", ChannelId: route.Id, Enabled: true},
				{Group: "default", Model: "scope-disabled", ChannelId: route.Id, Enabled: false},
				{Group: "aliases", Model: "gpt-4-gizmo-demo", ChannelId: route.Id, Enabled: true},
				{Group: "aliases", Model: "qwen3-max@thinking:on", ChannelId: route.Id, Enabled: true},
				{Group: "aliases", Model: "scope-denied@thinking:on", ChannelId: route.Id, Enabled: true},
			}).Error)
			newKey := func(name string, token model.Token) int {
				t.Helper()
				if token.UserId == 0 {
					token.UserId = owner.Id
				}
				token.Key = "scope-test-" + name
				token.Name = name
				require.NoError(t, db.Create(&token).Error)
				return token.Id
			}
			limited := newKey("limited", model.Token{RemainQuota: 3, ModelLimitsEnabled: true, ModelLimits: "scope-chat"})
			aliases := newKey("aliases", model.Token{Group: "aliases", UnlimitedQuota: true, ModelLimitsEnabled: true, ModelLimits: "gpt-4-gizmo-*,qwen3-max"})
			foreign := newKey("foreign", model.Token{UserId: other.Id, UnlimitedQuota: true})
			auto := newKey("auto", model.Token{Group: "auto", AutoGroups: `["revoked","vip","vip"]`, UnlimitedQuota: true})
			globalAuto := newKey("global-auto", model.Token{Group: "auto", UnlimitedQuota: true})
			emptyAuto := newKey("empty-auto", model.Token{Group: "auto", AutoGroups: `["revoked"]`, UnlimitedQuota: true})
			emptyLimit := newKey("empty-limit", model.Token{ModelLimitsEnabled: true, UnlimitedQuota: true})
			badAuto := newKey("bad-auto", model.Token{Group: "auto", AutoGroups: "[invalid", UnlimitedQuota: true})
			staleGroup := newKey("stale-group", model.Token{Group: "stale", UnlimitedQuota: true})
			expired := newKey("expired", model.Token{ExpiredTime: common.GetTimestamp() - 1, UnlimitedQuota: true})
			disabled := newKey("disabled", model.Token{Status: common.TokenStatusDisabled, UnlimitedQuota: true})
			exhausted := newKey("exhausted", model.Token{})
			otherNetwork := "192.0.2.0/24"
			ipRestricted := newKey("ip-restricted", model.Token{AllowIps: &otherNetwork, UnlimitedQuota: true})
			deleted := newKey("deleted", model.Token{UnlimitedQuota: true})
			require.NoError(t, db.Delete(&model.Token{}, deleted).Error)
			projection, err := model.GetOwnedTokenModelScope(owner.Id, limited)
			require.NoError(t, err)
			require.Equal(t, limited, projection.Id)
			require.Empty(t, projection.Key)
			require.Empty(t, projection.Name)

			type result struct {
				Success  bool                                    `json:"success"`
				Group    string                                  `json:"group"`
				KeyID    *int                                    `json:"billing_key_id"`
				Data     []string                                `json:"data"`
				Aliases  map[string][]string                     `json:"model_limit_names"`
				Controls map[string]model.PlaygroundChatControls `json:"chat_controls"`
			}
			read := func(query, target string) result {
				t.Helper()
				recorder := httptest.NewRecorder()
				ctx, _ := gin.CreateTestContext(recorder)
				ctx.Request = httptest.NewRequest(http.MethodGet, "/api/user/models?include_chat_controls=true&"+query, nil)
				ctx.Request.RemoteAddr = "127.0.0.1:12345"
				ctx.Set("id", owner.Id)
				if target != "" {
					ctx.Params = gin.Params{{Key: "id", Value: target}}
					ctx.Set("role", common.RoleRootUser)
				}
				GetUserModels(ctx)
				require.Equal(t, http.StatusOK, recorder.Code)
				require.Equal(t, "no-store", recorder.Header().Get("Cache-Control"))
				require.NotContains(t, recorder.Body.String(), "scope-test-")
				require.NotContains(t, recorder.Body.String(), "hidden-mapping-target")
				var response result
				require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
				return response
			}
			keyQuery := func(id int) string { return fmt.Sprintf("billing_key_id=%d", id) }
			for _, allowed := range []struct {
				id     int
				group  string
				models []string
			}{
				{limited, "default", []string{"scope-chat"}},
				{aliases, "aliases", []string{"gpt-4-gizmo-demo", "qwen3-max@thinking:on"}},
				{auto, "auto", []string{"scope-vip"}},
				{globalAuto, "auto", []string{"scope-chat", "scope-other-chat", "scope-vip"}},
				{emptyAuto, "auto", []string{}},
				{emptyLimit, "default", []string{}},
			} {
				response := read(keyQuery(allowed.id), "")
				require.True(t, response.Success)
				require.NotNil(t, response.KeyID)
				require.Equal(t, allowed.id, *response.KeyID)
				require.Equal(t, allowed.group, response.Group)
				require.NotNil(t, response.Data)
				require.ElementsMatch(t, allowed.models, response.Data)
				require.NotNil(t, response.Controls)
				require.NotNil(t, response.Aliases)
				for publicName := range response.Controls {
					require.Contains(t, allowed.models, publicName)
				}
			}
			confirmed := read(keyQuery(limited)+"&group=default", strconv.Itoa(owner.Id))
			require.True(t, confirmed.Success)
			require.Equal(t, "always", confirmed.Controls["scope-chat"].Sampling)
			matchingNames := read(keyQuery(aliases), "").Aliases
			require.Equal(t, map[string][]string{"gpt-4-gizmo-demo": {"gpt-4-gizmo-*"}, "qwen3-max@thinking:on": {"qwen3-max"}}, matchingNames)
			require.Contains(t, read("group=aliases", "").Aliases, "scope-denied@thinking:on")
			account := read("group=auto", "")
			require.True(t, account.Success)
			require.Nil(t, account.KeyID)
			require.ElementsMatch(t, []string{"scope-chat", "scope-other-chat", "scope-vip"}, account.Data)
			denied := []struct{ query, target string }{
				{keyQuery(limited) + "&group=vip", ""}, {keyQuery(limited), strconv.Itoa(other.Id)}, {keyQuery(foreign), strconv.Itoa(other.Id)}, {keyQuery(limited), "invalid"},
				{"billing_key_id=", ""}, {"billing_key_id=0", ""}, {"billing_key_id=-2", ""}, {"billing_key_id=x", ""}, {"billing_key_id=%zz", ""},
				{keyQuery(limited) + "&" + keyQuery(foreign), ""}, {keyQuery(limited) + "&group=default&group=vip", ""},
			}
			for _, id := range []int{foreign, badAuto, staleGroup, expired, disabled, exhausted, ipRestricted, deleted, deleted + 100000} {
				denied = append(denied, struct{ query, target string }{keyQuery(id), ""})
			}
			for _, request := range denied {
				response := read(request.query, request.target)
				require.False(t, response.Success, request)
				require.Nil(t, response.KeyID)
				require.Empty(t, response.Group)
				require.Nil(t, response.Data)
				require.Nil(t, response.Aliases)
				require.Nil(t, response.Controls)
			}
		})
	}
}
