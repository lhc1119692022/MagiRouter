package controller

import (
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSiteOverviewPermissionsAndRuntimeVisibility(t *testing.T) {
	gin.SetMode(gin.TestMode)
	admin, _ := setupAccessTokenAudit(t)
	require.NoError(t, model.DB.AutoMigrate(
		&model.Option{},
		&model.TopUp{},
		&model.SubscriptionOrder{},
		&model.QuotaData{},
		&model.Channel{},
		&model.PerfMetric{},
	))

	_, adminSession := createAccessTokenTestSession(t, admin.Id, "overview-admin")
	root := &model.User{
		Username:    "overview-root",
		Role:        common.RoleRootUser,
		Status:      common.UserStatusEnabled,
		AuthVersion: 1,
		AffCode:     "ov-root",
	}
	require.NoError(t, model.DB.Create(root).Error)
	_, rootSession := createAccessTokenTestSession(t, root.Id, "overview-root")

	normalUser := &model.User{
		Username:    "overview-user",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		AuthVersion: 1,
		AffCode:     "ov-user",
	}
	require.NoError(t, model.DB.Create(normalUser).Error)
	_, userSession := createAccessTokenTestSession(t, normalUser.Id, "overview-user")

	logReader, _ := createScopedAccessToken(t, admin.Id, 0, "log:read")
	usageReader, _ := createScopedAccessToken(t, admin.Id, 0, "usage:read")

	router := gin.New()
	router.GET("/api/data/site-overview", middleware.AdminAuth(), GetSiteOverview)

	for _, tc := range []struct {
		name, path, credential string
		status                 int
	}{
		{"anonymous rejected", "/api/data/site-overview", "", http.StatusUnauthorized},
		{"normal user forbidden", "/api/data/site-overview", userSession, http.StatusForbidden},
		{"usage:read PAT forbidden", "/api/data/site-overview", usageReader, http.StatusForbidden},
		{"admin session allowed", "/api/data/site-overview", adminSession, http.StatusOK},
		{"log:read PAT allowed", "/api/data/site-overview", logReader, http.StatusOK},
		{"root session allowed", "/api/data/site-overview", rootSession, http.StatusOK},
		{"invalid exclude_admins rejected", "/api/data/site-overview?exclude_admins=maybe", adminSession, http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resp := accessTokenRequest(router, http.MethodGet, tc.path, tc.credential, "", "")
			require.Equal(t, tc.status, resp.Code, resp.Body.String())
		})
	}

	t.Run("runtime snapshot exposed only to root", func(t *testing.T) {
		adminResp := accessTokenRequest(router, http.MethodGet, "/api/data/site-overview?range=24h", adminSession, "", "")
		require.Equal(t, http.StatusOK, adminResp.Code)
		var adminBody struct {
			Success bool                 `json:"success"`
			Data    SiteOverviewResponse `json:"data"`
		}
		require.NoError(t, common.Unmarshal(adminResp.Body.Bytes(), &adminBody))
		assert.True(t, adminBody.Success)
		assert.Nil(t, adminBody.Data.Runtime)

		rootResp := accessTokenRequest(router, http.MethodGet, "/api/data/site-overview?range=24h", rootSession, "", "")
		require.Equal(t, http.StatusOK, rootResp.Code)
		var rootBody struct {
			Success bool                 `json:"success"`
			Data    SiteOverviewResponse `json:"data"`
		}
		require.NoError(t, common.Unmarshal(rootResp.Body.Bytes(), &rootBody))
		assert.True(t, rootBody.Success)
		require.NotNil(t, rootBody.Data.Runtime)
		assert.Greater(t, rootBody.Data.Runtime.NumGoroutine, 0)
	})
}

func TestSiteOverviewAggregationDatabaseMatrix(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, dialect := range []struct{ kind, env string }{
		{"sqlite", ""},
		{"mysql", "TEST_MYSQL_DSN"},
		{"postgres", "TEST_POSTGRES_DSN"},
	} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}

			db := modelManagementDB(t, dialect.kind, os.Getenv(dialect.env))
			require.NoError(t, db.AutoMigrate(
				&model.UserSession{},
				&model.TopUp{},
				&model.SubscriptionOrder{},
				&model.QuotaData{},
				&model.PerfMetric{},
			))

			admin := &model.User{
				Username:    "overview-admin",
				Role:        common.RoleAdminUser,
				Status:      common.UserStatusEnabled,
				Group:       "default",
				AuthVersion: 1,
				AffCode:     "ov-admin",
			}
			require.NoError(t, db.Create(admin).Error)

			now := time.Now()
			todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
			currentBucket := now.Unix() - (now.Unix() % 3600)
			prevWindowBucket := todayStart.AddDate(0, 0, -9).Unix()
			prevWindowBucket -= prevWindowBucket % 3600

			oldUser := &model.User{
				Username:    "alice",
				DisplayName: "Alice",
				Role:        common.RoleCommonUser,
				Status:      common.UserStatusEnabled,
				Group:       "vip",
				Quota:       2_000_000,
				CreatedAt:   todayStart.AddDate(0, 0, -20).Unix(),
				LastLoginAt: now.Add(-2 * time.Hour).Unix(),
				AuthVersion: 1,
				AffCode:     "ov-alice",
			}
			require.NoError(t, db.Create(oldUser).Error)

			newUser := &model.User{
				Username:    "bob",
				DisplayName: "Bob",
				Role:        common.RoleCommonUser,
				Status:      common.UserStatusEnabled,
				Group:       "default",
				Quota:       500_000,
				CreatedAt:   todayStart.Add(30 * time.Minute).Unix(),
				LastLoginAt: now.Add(-30 * time.Minute).Unix(),
				AuthVersion: 1,
				AffCode:     "ov-bob",
			}
			require.NoError(t, db.Create(newUser).Error)

			disabledUser := &model.User{
				Username:    "charlie",
				Role:        common.RoleCommonUser,
				Status:      common.UserStatusDisabled,
				Group:       "default",
				Quota:       100_000,
				CreatedAt:   todayStart.AddDate(0, 0, -10).Unix(),
				AuthVersion: 1,
				AffCode:     "ov-charlie",
			}
			require.NoError(t, db.Create(disabledUser).Error)

			deletedUser := &model.User{
				Username:    "deleted-dave",
				Role:        common.RoleCommonUser,
				Status:      common.UserStatusEnabled,
				Group:       "default",
				CreatedAt:   todayStart.AddDate(0, 0, -15).Unix(),
				AuthVersion: 1,
				AffCode:     "ov-dave",
			}
			require.NoError(t, db.Create(deletedUser).Error)
			require.NoError(t, db.Delete(deletedUser).Error)

			quotaRows := []model.QuotaData{
				{
					UserID:              oldUser.Id,
					Username:            oldUser.Username,
					ModelName:           "gpt-4o",
					UseGroup:            "vip",
					CreatedAt:           currentBucket,
					Count:               20,
					Quota:               1_000_000,
					TokenUsed:           100_000,
					CacheReadTokens:     25_000,
					CacheCreationTokens: 5_000,
				},
				{
					UserID:    newUser.Id,
					Username:  newUser.Username,
					ModelName: "claude-sonnet",
					UseGroup:  "default",
					CreatedAt: currentBucket,
					Count:     10,
					Quota:     500_000,
					TokenUsed: 50_000,
				},
				{
					UserID:    admin.Id,
					Username:  admin.Username,
					ModelName: "gpt-4o",
					UseGroup:  "default",
					CreatedAt: currentBucket,
					Count:     50,
					Quota:     5_000_000,
					TokenUsed: 500_000,
				},
				{
					UserID:    oldUser.Id,
					Username:  oldUser.Username,
					ModelName: "gpt-4o",
					UseGroup:  "vip",
					CreatedAt: prevWindowBucket,
					Count:     10,
					Quota:     500_000,
					TokenUsed: 50_000,
				},
			}
			for idx := range quotaRows {
				require.NoError(t, db.Create(&quotaRows[idx]).Error)
			}

			require.NoError(t, db.Create(&model.TopUp{
				UserId:       oldUser.Id,
				TradeNo:      "ov-topup-1-" + dialect.kind,
				Money:        50,
				Amount:       10,
				Status:       common.TopUpStatusSuccess,
				CreateTime:   now.Add(-1 * time.Hour).Unix(),
				CompleteTime: now.Add(-1 * time.Hour).Unix(),
			}).Error)

			perfRows := []model.PerfMetric{
				{
					ModelName:      "gpt-4o",
					Group:          "vip",
					BucketTs:       currentBucket,
					RequestCount:   20,
					SuccessCount:   19,
					TotalLatencyMs: 24_000,
					TtftSumMs:      6_000,
					TtftCount:      20,
					OutputTokens:   10_000,
					GenerationMs:   200_000,
					TpsCount:       20,
				},
				{
					ModelName:      "claude-sonnet",
					Group:          "default",
					BucketTs:       currentBucket,
					RequestCount:   10,
					SuccessCount:   10,
					TotalLatencyMs: 20_000,
					TtftSumMs:      4_000,
					TtftCount:      10,
					OutputTokens:   4_000,
					GenerationMs:   100_000,
					TpsCount:       10,
				},
				{
					ModelName:      "gpt-4o",
					Group:          "vip",
					BucketTs:       prevWindowBucket,
					RequestCount:   10,
					SuccessCount:   10,
					TotalLatencyMs: 10_000,
					TtftSumMs:      2_000,
					TtftCount:      10,
				},
			}
			for idx := range perfRows {
				require.NoError(t, db.Create(&perfRows[idx]).Error)
			}

			priority := int64(5)
			channels := []model.Channel{
				{Name: "primary-openai", Type: 1, Key: "k1", Status: common.ChannelStatusEnabled, Group: "vip", Priority: &priority},
				{Name: "broken-claude", Type: 14, Key: "k2", Status: common.ChannelStatusAutoDisabled, Group: "default", ResponseTime: 5200, Priority: &priority},
				{Name: "paused-backup", Type: 1, Key: "k3", Status: common.ChannelStatusManuallyDisabled, Group: "default", Priority: &priority},
			}
			for idx := range channels {
				require.NoError(t, db.Create(&channels[idx]).Error)
			}

			_, adminSession := createAccessTokenTestSession(t, admin.Id, "overview-admin-"+dialect.kind)
			router := gin.New()
			router.GET("/api/data/site-overview", middleware.AdminAuth(), GetSiteOverview)

			resp := accessTokenRequest(router, http.MethodGet, "/api/data/site-overview?range=7d&exclude_admins=true", adminSession, "", "")
			require.Equal(t, http.StatusOK, resp.Code, resp.Body.String())

			var body struct {
				Success bool                 `json:"success"`
				Data    SiteOverviewResponse `json:"data"`
			}
			require.NoError(t, common.Unmarshal(resp.Body.Bytes(), &body))
			require.True(t, body.Success)

			data := body.Data
			assert.Equal(t, "7d", data.Meta.Range)
			assert.Equal(t, "day", data.Meta.BucketUnit)
			assert.True(t, data.Meta.ExcludeAdminUsers)
			assert.GreaterOrEqual(t, data.Meta.ExcludedAdminCount, 1)

			assert.Equal(t, int64(30), data.Usage.TotalRequests)
			assert.Equal(t, int64(10), data.Usage.PrevRequests)
			require.NotNil(t, data.Usage.RequestsChangePct)
			assert.InDelta(t, 200.0, *data.Usage.RequestsChangePct, 0.1)
			assert.Equal(t, int64(1_500_000), data.Usage.TotalQuota)
			assert.Equal(t, int64(150_000), data.Usage.TotalTokens)
			assert.Equal(t, int64(25_000), data.Usage.CacheReadTokens)

			assert.Equal(t, int64(3), data.Users.TotalUsers)
			assert.Equal(t, int64(2), data.Users.EnabledUsers)
			assert.Equal(t, int64(1), data.Users.DisabledUsers)
			assert.Equal(t, int64(1), data.Users.NewUsers)
			assert.Equal(t, int64(1), data.Users.TodayNewUsers)
			assert.Equal(t, int64(1), data.Users.DeletedUsers)
			assert.Equal(t, int64(0), data.Users.NetUserChange)
			assert.Equal(t, int64(2), data.Users.ActiveUsers)
			assert.Equal(t, int64(1), data.Users.PrevActiveUsers)
			assert.Equal(t, int64(2), data.Users.DAU)
			assert.Equal(t, int64(2), data.Users.WAU)
			assert.Equal(t, int64(2), data.Users.MAU)
			assert.Equal(t, int64(2), data.Users.LoginActiveUsers)
			assert.Equal(t, int64(1), data.Users.PayingUsers)
			assert.Len(t, data.Trend, 7)
			assert.Equal(t, int64(1), data.Trend[len(data.Trend)-1].DeletedUsers)
			assert.Equal(t, int64(3), data.Trend[len(data.Trend)-1].CumulativeUsers)

			assert.True(t, data.Performance.HasData)
			assert.Equal(t, int64(30), data.Performance.TotalRequests)
			assert.Equal(t, int64(29), data.Performance.SuccessRequests)
			assert.Equal(t, int64(1), data.Performance.FailedRequests)
			assert.InDelta(t, 96.67, data.Performance.SuccessRate, 0.05)
			assert.Equal(t, int64(1466), data.Performance.AvgLatencyMs)
			assert.Equal(t, int64(333), data.Performance.AvgTtftMs)
			require.NotNil(t, data.Performance.PrevAvgLatencyMs)
			assert.Equal(t, int64(1000), *data.Performance.PrevAvgLatencyMs)

			assert.Equal(t, int64(3), data.Channels.Total)
			assert.Equal(t, int64(1), data.Channels.Enabled)
			assert.Equal(t, int64(1), data.Channels.AutoDisabled)
			assert.Equal(t, int64(1), data.Channels.ManuallyDisabled)
			assert.Len(t, data.Channels.DisabledChannels, 2)
			assert.Equal(t, "broken-claude", data.Channels.DisabledChannels[0].Name)

			require.Len(t, data.TopModels, 2)
			assert.Equal(t, "gpt-4o", data.TopModels[0].ModelName)
			require.NotNil(t, data.TopModels[0].AvgLatencyMs)
			assert.Equal(t, int64(1200), *data.TopModels[0].AvgLatencyMs)

			require.Len(t, data.TopUsers, 2)
			assert.Equal(t, "alice", data.TopUsers[0].Username)
			assert.Equal(t, "vip", data.TopUsers[0].Group)

			inclResp := accessTokenRequest(router, http.MethodGet, "/api/data/site-overview?range=24h&exclude_admins=false", adminSession, "", "")
			require.Equal(t, http.StatusOK, inclResp.Code, inclResp.Body.String())
			var inclBody struct {
				Success bool                 `json:"success"`
				Data    SiteOverviewResponse `json:"data"`
			}
			require.NoError(t, common.Unmarshal(inclResp.Body.Bytes(), &inclBody))
			assert.Equal(t, "24h", inclBody.Data.Meta.Range)
			assert.Equal(t, "hour", inclBody.Data.Meta.BucketUnit)
			assert.Len(t, inclBody.Data.Trend, 24)
			assert.Equal(t, int64(80), inclBody.Data.Usage.TotalRequests)
			assert.Equal(t, int64(3), inclBody.Data.Users.ActiveUsers)
		})
	}
}
