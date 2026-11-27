package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestSortGroupChannelStatusItems(t *testing.T) {
	makeItems := func() []groupChannelStatusItem {
		return []groupChannelStatusItem{
			{Group: "beta", RequestCount: 10},
			{Group: "alpha", RequestCount: 200},
			{Group: "default", RequestCount: 5},
			{Group: "gamma", RequestCount: 200},
		}
	}

	defaultOrdered := makeItems()
	sortGroupChannelStatusItems(defaultOrdered, nil)
	require.Equal(t, []string{"default", "alpha", "gamma", "beta"}, []string{
		defaultOrdered[0].Group,
		defaultOrdered[1].Group,
		defaultOrdered[2].Group,
		defaultOrdered[3].Group,
	})

	customOrdered := makeItems()
	sortGroupChannelStatusItems(customOrdered, []string{"gamma", "nonexistent", "beta"})
	require.Equal(t, []string{"gamma", "beta", "default", "alpha"}, []string{
		customOrdered[0].Group,
		customOrdered[1].Group,
		customOrdered[2].Group,
		customOrdered[3].Group,
	})
}

func TestUpdatePerfMetricsGroupOrderPermissionsAndPersistence(t *testing.T) {
	previousConfig := console_setting.GetConsoleSetting().ChannelStatusGroupOrder
	common.OptionMapRWMutex.Lock()
	previousOptionMap := common.OptionMap
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		console_setting.GetConsoleSetting().ChannelStatusGroupOrder = previousConfig
		common.OptionMap = previousOptionMap
		common.OptionMapRWMutex.Unlock()
	})

	admin, _ := setupAccessTokenAudit(t)
	require.NoError(t, model.DB.AutoMigrate(&model.SystemTask{}))
	_, adminSession := createAccessTokenTestSession(t, admin.Id, "group-order-admin")

	member := &model.User{
		Username:    "group-order-member",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		AuthVersion: 1,
		AffCode:     "group-order-member",
	}
	require.NoError(t, model.DB.Create(member).Error)
	_, memberSession := createAccessTokenTestSession(t, member.Id, "group-order-member")

	root := &model.User{
		Username:    "group-order-root",
		Role:        common.RoleRootUser,
		Status:      common.UserStatusEnabled,
		AuthVersion: 1,
		AffCode:     "group-order-root",
	}
	require.NoError(t, model.DB.Create(root).Error)
	_, rootSession := createAccessTokenTestSession(t, root.Id, "group-order-root")

	readOnlyToken, _ := createScopedAccessToken(t, admin.Id, 0, "group:read")
	writeToken, _ := createScopedAccessToken(t, admin.Id, 0, "group:write")

	router := gin.New()
	const path = "/api/perf-metrics/groups/order"
	router.PUT(path, middleware.AdminAuth(), UpdatePerfMetricsGroupOrder)
	router.PUT("/api/option/", middleware.RootAuth(), UpdateOption)

	for _, testCase := range []struct {
		name       string
		credential string
		body       string
		status     int
	}{
		{"anonymous", "", `{"groups":["vip","default"]}`, http.StatusUnauthorized},
		{"common user", memberSession, `{"groups":["vip","default"]}`, http.StatusForbidden},
		{"admin read-only token", readOnlyToken, `{"groups":["vip","default"]}`, http.StatusForbidden},
		{"admin invalid payload", adminSession, `{"groups":[""]}`, http.StatusBadRequest},
		{"admin session saves order", adminSession, `{"groups":[" vip ","default","vip"]}`, http.StatusOK},
		{"admin write token saves order", writeToken, `{"groups":["media-studio","default"]}`, http.StatusOK},
		{"root session resets order", rootSession, `{"groups":[]}`, http.StatusOK},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			response := accessTokenRequest(router, http.MethodPut, path, testCase.credential, "", testCase.body)
			require.Equal(t, testCase.status, response.Code, response.Body.String())
		})
	}

	require.Empty(t, console_setting.GetChannelStatusGroupOrder())

	saveResp := accessTokenRequest(router, http.MethodPut, path, adminSession, "", `{"groups":["vip","media-studio","default"]}`)
	require.Equal(t, http.StatusOK, saveResp.Code, saveResp.Body.String())
	require.True(t, slices.Equal([]string{"vip", "media-studio", "default"}, console_setting.GetChannelStatusGroupOrder()))

	var saved model.Option
	require.NoError(t, model.DB.Where(&model.Option{Key: console_setting.ChannelStatusGroupOrderOption}).Take(&saved).Error)
	require.Equal(t, `["vip","media-studio","default"]`, saved.Value)

	badOptionResp := accessTokenRequest(router, http.MethodPut, "/api/option/", rootSession, "", `{"key":"console_setting.channel_status_group_order","value":"[\"\"]"}`)
	require.Equal(t, http.StatusBadRequest, badOptionResp.Code, badOptionResp.Body.String())

	optionResp := accessTokenRequest(router, http.MethodPut, "/api/option/", rootSession, "", `{"key":"console_setting.channel_status_group_order","value":"[\" alpha \",\"beta\",\"alpha\"]"}`)
	require.Equal(t, http.StatusOK, optionResp.Code, optionResp.Body.String())
	require.True(t, slices.Equal([]string{"alpha", "beta"}, console_setting.GetChannelStatusGroupOrder()))
}

func TestGetPerfMetricsSummaryBestGroupAndGroupScope(t *testing.T) {
	setupAccessTokenAudit(t)
	require.NoError(t, model.DB.AutoMigrate(&model.PerfMetric{}))

	originalUsable := setting.UserUsableGroups2JSONString()
	originalRatios := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"aws":"AWS","kiro":"Kiro"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"aws":0.55,"kiro":0.25,"hidden":1}`))
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsable))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
	})

	hour := time.Now().Unix() - time.Now().Unix()%3600 - 3600
	for _, row := range []model.PerfMetric{
		{ModelName: "claude-sonnet-5-5", Group: "aws", BucketTs: hour, RequestCount: 10, SuccessCount: 6, TotalLatencyMs: 90000},
		{ModelName: "claude-sonnet-5-5", Group: "kiro", BucketTs: hour, RequestCount: 10, SuccessCount: 10, TotalLatencyMs: 80000},
		{ModelName: "claude-sonnet-5-5", Group: "hidden", BucketTs: hour, RequestCount: 50, SuccessCount: 50, TotalLatencyMs: 100000},
	} {
		require.NoError(t, model.UpsertPerfMetric(&row))
	}

	querySummary := func(rawQuery string) perfmetrics.SummaryAllResult {
		t.Helper()
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/perf-metrics/summary"+rawQuery, nil)
		common.SetContextKey(ctx, constant.ContextKeyUserGroup, "aws")
		GetPerfMetricsSummary(ctx)
		require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
		var envelope struct {
			Success bool                         `json:"success"`
			Data    perfmetrics.SummaryAllResult `json:"data"`
		}
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &envelope))
		require.True(t, envelope.Success)
		return envelope.Data
	}

	unfiltered := querySummary("?hours=24")
	require.Len(t, unfiltered.Models, 1)
	require.Equal(t, "kiro", unfiltered.Models[0].BestGroup)
	require.Equal(t, 100.0, unfiltered.Models[0].SuccessRate)
	require.True(t, unfiltered.Models[0].TpsInsufficient)

	scopedAWS := querySummary("?hours=24&group=aws")
	require.Len(t, scopedAWS.Models, 1)
	require.Equal(t, "aws", scopedAWS.Models[0].BestGroup)
	require.Equal(t, 60.0, scopedAWS.Models[0].SuccessRate)

	scopedHidden := querySummary("?hours=24&group=hidden")
	require.Empty(t, scopedHidden.Models)
}
