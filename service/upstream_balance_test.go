package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupUpstreamBalanceServiceTest(t *testing.T) {
	t.Helper()
	dsn := fmt.Sprintf("file:upstream_balance_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.Channel{}, &model.User{}, &model.SystemTask{}))

	origDB := model.DB
	origOptionMap := common.OptionMap
	origExchangeRate := operation_setting.USDExchangeRate
	origSetting := operation_setting.GetUpstreamBalanceSettingSnapshot()

	model.DB = db
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{
		"EmailProvider": "resend",
		"ResendApiKey":  "",
		"ResendFrom":    "alerts@example.com",
	}
	operation_setting.USDExchangeRate = 7.0
	common.OptionMapRWMutex.Unlock()

	t.Cleanup(func() {
		if optionMap, mapErr := origSetting.ToOptionMap(); mapErr == nil {
			_ = model.UpdateOptionsBulk(optionMap)
		}
		model.DB = origDB
		common.OptionMapRWMutex.Lock()
		common.OptionMap = origOptionMap
		operation_setting.USDExchangeRate = origExchangeRate
		common.OptionMapRWMutex.Unlock()
	})
}

func saveTestUpstreamSetting(t *testing.T, cfg operation_setting.UpstreamBalanceSetting) {
	t.Helper()
	optionMap, err := cfg.ToOptionMap()
	require.NoError(t, err)
	require.NoError(t, model.UpdateOptionsBulk(optionMap))
}

func TestUpstreamBalanceNewAPIAndSub2APIDualLayer(t *testing.T) {
	setupUpstreamBalanceServiceTest(t)

	// Upstream 1: New API site serving both a generic OpenAI channel (unlimited key)
	// and a generic Anthropic channel (independently limited key).
	newAPIServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/status":
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota_per_unit":500000}}`))
		case "/api/usage/token/":
			switch r.Header.Get("Authorization") {
			case "Bearer sk-unlimited":
				// Site account has $100 remaining, $400 used ($500 total -> 20% remaining).
				_, _ = w.Write([]byte(`{"code":true,"message":"ok","data":{"total_granted":0,"total_used":0,"total_available":0,"unlimited_quota":true,"user_quota":{"total_available":50000000,"total_used":200000000}}}`))
			case "Bearer sk-limited":
				// Token has $5 remaining of $50 granted (10% remaining).
				_, _ = w.Write([]byte(`{"code":true,"message":"ok","data":{"total_granted":25000000,"total_used":22500000,"total_available":2500000,"unlimited_quota":false,"user_quota":{"total_available":50000000,"total_used":200000000}}}`))
			default:
				w.WriteHeader(http.StatusUnauthorized)
			}
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer newAPIServer.Close()

	// Upstream 2: Sub2API site with wallet balance ($100) + subscription channel ($8 remaining of $50 daily).
	sub2APIServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path != "/v1/usage" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_, _ = w.Write([]byte(`{
			"balance": 100.0,
			"remaining": 8.0,
			"isValid": true,
			"subscription": {
				"daily_limit_usd": 50.0,
				"daily_used_usd": 42.0
			}
		}`))
	}))
	defer sub2APIServer.Close()

	// Generic OpenAI channel with /v1 suffix and generic Claude channel without /v1 suffix
	// MUST normalize to the same New API site.
	newAPIURLWithV1 := newAPIServer.URL + "/v1"
	newAPIURLRaw := newAPIServer.URL
	sub2URL := sub2APIServer.URL
	emptyURL := ""

	chOpenAI := &model.Channel{Name: "NewAPI OpenAI", Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, BaseURL: &newAPIURLWithV1, Key: "sk-unlimited", Group: "default"}
	chClaude := &model.Channel{Name: "NewAPI Claude Limited", Type: constant.ChannelTypeAnthropic, Status: common.ChannelStatusEnabled, BaseURL: &newAPIURLRaw, Key: "sk-limited", Group: "default"}
	chSub2 := &model.Channel{Name: "Sub2API Claude", Type: constant.ChannelTypeAnthropic, Status: common.ChannelStatusEnabled, BaseURL: &sub2URL, Key: "sk-sub2", Group: "default"}
	chOfficial := &model.Channel{Name: "Official OpenAI", Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, BaseURL: &emptyURL, Key: "sk-official", Group: "default"}
	for _, ch := range []*model.Channel{chOpenAI, chClaude, chSub2, chOfficial} {
		require.NoError(t, model.DB.Create(ch).Error)
	}

	customRate := 2.0 // 1 USD = ¥2 for New API relay
	refTotalCNY := 1000.0
	defaultMinCNY := 30.0
	defaultMinPct := 18.0
	saveTestUpstreamSetting(t, operation_setting.UpstreamBalanceSetting{
		Enabled:              true,
		CheckIntervalMinutes: 30,
		AlertCooldownMinutes: 1440,
		DefaultMinBalanceCNY: &defaultMinCNY,
		DefaultMinPercent:    &defaultMinPct,
		Sites: map[string]operation_setting.UpstreamBalanceSiteConfig{
			newAPIServer.URL: {
				Name:         "Relay NewAPI",
				ProviderType: operation_setting.UpstreamBalanceProviderNewAPI,
				CNYRate:      &customRate,
			},
			sub2APIServer.URL: {
				Name:              "Relay Sub2API",
				ProviderType:      operation_setting.UpstreamBalanceProviderSub2API,
				ReferenceTotalCNY: &refTotalCNY,
			},
		},
		Channels: map[string]operation_setting.UpstreamBalanceChannelConfig{},
	})

	summary, err := RefreshUpstreamBalances(context.Background(), UpstreamBalanceRefreshOptions{SendAlerts: false})
	require.NoError(t, err)
	assert.Equal(t, 2, summary.RefreshedSites)
	assert.Equal(t, 3, summary.RefreshedChannels)

	overview, err := BuildUpstreamBalanceOverview()
	require.NoError(t, err)
	assert.Equal(t, 1, overview.Meta.SkippedChannelsCount)
	require.Len(t, overview.Sites, 2)

	bySite := map[string]UpstreamBalanceSiteView{}
	for _, site := range overview.Sites {
		bySite[site.SiteKey] = site
	}

	// New API site: $100 * ¥2 = ¥200, 20% remaining (>= ¥30 and >= 18% -> OK).
	newSite := bySite[newAPIServer.URL]
	assert.Equal(t, "Relay NewAPI", newSite.DisplayName)
	assert.Equal(t, UpstreamBalanceStatusOK, newSite.Snapshot.Status)
	assert.Equal(t, UpstreamBalanceSourceTokenUserQuota, newSite.Snapshot.BalanceSource)
	require.NotNil(t, newSite.Snapshot.BalanceCNY)
	assert.InDelta(t, 200.0, *newSite.Snapshot.BalanceCNY, 1e-6)
	require.NotNil(t, newSite.Snapshot.RemainingPercent)
	assert.InDelta(t, 20.0, *newSite.Snapshot.RemainingPercent, 1e-6)
	require.Len(t, newSite.Channels, 2)

	// Unlimited key follows site; limited Claude key ($5 * ¥2 = ¥10, 10% remaining) is LOW on both amount and percent.
	var unlimitedView, limitedView UpstreamBalanceChannelView
	for _, ch := range newSite.Channels {
		if ch.ChannelID == chOpenAI.Id {
			unlimitedView = ch
		} else if ch.ChannelID == chClaude.Id {
			limitedView = ch
		}
	}
	assert.True(t, unlimitedView.Snapshot.FollowsSiteBalance)
	assert.False(t, unlimitedView.Snapshot.HasIndependentLimit)
	assert.Equal(t, UpstreamBalanceStatusFollowsSite, unlimitedView.Snapshot.Status)

	assert.True(t, limitedView.Snapshot.HasIndependentLimit)
	assert.Equal(t, UpstreamBalanceStatusLow, limitedView.Snapshot.Status)
	require.NotNil(t, limitedView.Snapshot.BalanceCNY)
	assert.InDelta(t, 10.0, *limitedView.Snapshot.BalanceCNY, 1e-6)
	require.NotNil(t, limitedView.Snapshot.RemainingPercent)
	assert.InDelta(t, 10.0, *limitedView.Snapshot.RemainingPercent, 1e-6)
	assert.ElementsMatch(t, []string{"amount", "percent"}, limitedView.Snapshot.AlertReasons)

	// Sub2API site: $100 * ¥7 (default rate) = ¥700, 70% of ¥1000 reference total -> OK.
	// Sub2API channel: $8 remaining of $50 daily -> ¥56 (>= ¥30) but 16% (< 18%) -> LOW on percent!
	subSite := bySite[sub2APIServer.URL]
	assert.Equal(t, UpstreamBalanceStatusOK, subSite.Snapshot.Status)
	require.NotNil(t, subSite.Snapshot.BalanceCNY)
	assert.InDelta(t, 700.0, *subSite.Snapshot.BalanceCNY, 1e-6)
	require.NotNil(t, subSite.Snapshot.RemainingPercent)
	assert.InDelta(t, 70.0, *subSite.Snapshot.RemainingPercent, 1e-6)
	assert.Equal(t, UpstreamPercentSourceReferenceTotal, subSite.Snapshot.PercentSource)
	require.Len(t, subSite.Channels, 1)
	subCh := subSite.Channels[0]
	assert.True(t, subCh.Snapshot.HasIndependentLimit)
	assert.Equal(t, UpstreamBalanceStatusLow, subCh.Snapshot.Status)
	assert.Equal(t, []string{"percent"}, subCh.Snapshot.AlertReasons)
	require.Len(t, subCh.Snapshot.Windows, 1)
	assert.Equal(t, "daily", subCh.Snapshot.Windows[0].Period)
}

func TestUpstreamBalanceNewAPIUserSelfFallbackAndAlertCooldown(t *testing.T) {
	setupUpstreamBalanceServiceTest(t)

	var currentQuota atomic.Int64
	currentQuota.Store(2000000) // $4 -> ¥28 at default rate 7.0
	var userSelfCalls atomic.Int32

	upstreamServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/status":
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota_per_unit":500000}}`))
		case "/api/usage/token/":
			// Older New API without user_quota
			_, _ = w.Write([]byte(`{"code":true,"message":"ok","data":{"total_granted":0,"total_used":0,"total_available":0,"unlimited_quota":true}}`))
		case "/api/user/self":
			userSelfCalls.Add(1)
			assert.Equal(t, "Bearer pat-secret-token", r.Header.Get("Authorization"))
			assert.Equal(t, "99", r.Header.Get("New-Api-User"))
			_, _ = w.Write([]byte(fmt.Sprintf(`{"success":true,"data":{"quota":%d,"used_quota":8000000}}`, currentQuota.Load())))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer upstreamServer.Close()

	// Intercept outbound Resend email requests via http.DefaultTransport while
	// forwarding local httptest requests to the real transport.
	var emailCount atomic.Int32
	origTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.String() == "https://api.resend.com/emails" {
			emailCount.Add(1)
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(`{"id":"email_123"}`)),
			}, nil
		}
		return origTransport.RoundTrip(req)
	})
	t.Cleanup(func() { http.DefaultTransport = origTransport })
	common.OptionMapRWMutex.Lock()
	common.OptionMap["EmailProvider"] = "resend"
	common.OptionMap["ResendApiKey"] = "re_test_123"
	common.OptionMap["ResendFrom"] = "alerts@example.com"
	common.OptionMapRWMutex.Unlock()

	baseURL := upstreamServer.URL
	ch := &model.Channel{Name: "Legacy NewAPI", Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, BaseURL: &baseURL, Key: "sk-legacy", Group: "default"}
	require.NoError(t, model.DB.Create(ch).Error)

	minCNY := 50.0
	saveTestUpstreamSetting(t, operation_setting.UpstreamBalanceSetting{
		Enabled:              true,
		CheckIntervalMinutes: 15,
		AlertCooldownMinutes: 1440,
		NotifyEmails:         "admin@example.com",
		DefaultMinBalanceCNY: &minCNY,
		Sites: map[string]operation_setting.UpstreamBalanceSiteConfig{
			upstreamServer.URL: {
				Name:         "Legacy Site",
				ProviderType: operation_setting.UpstreamBalanceProviderNewAPI,
				AccessToken:  "pat-secret-token",
				UserID:       "99",
			},
		},
		Channels: map[string]operation_setting.UpstreamBalanceChannelConfig{},
	})

	// 1st run: ¥28 < ¥50 -> sends 1 email.
	res1, err := RefreshUpstreamBalances(context.Background(), UpstreamBalanceRefreshOptions{SendAlerts: true})
	require.NoError(t, err)
	assert.Equal(t, 1, res1.AlertsTriggered)
	assert.True(t, res1.AlertEmailSent)
	assert.Equal(t, int32(1), emailCount.Load())
	assert.Equal(t, int32(1), userSelfCalls.Load())

	// 2nd run immediately after while still ¥28: suppressed by cooldown.
	res2, err := RefreshUpstreamBalances(context.Background(), UpstreamBalanceRefreshOptions{SendAlerts: true})
	require.NoError(t, err)
	assert.Equal(t, 0, res2.AlertsTriggered)
	assert.Equal(t, int32(1), emailCount.Load())

	// Top up to $20 (¥140 >= ¥50) -> resets alert active state.
	currentQuota.Store(10000000)
	res3, err := RefreshUpstreamBalances(context.Background(), UpstreamBalanceRefreshOptions{SendAlerts: true})
	require.NoError(t, err)
	assert.Equal(t, 0, res3.AlertsTriggered)
	assert.Equal(t, int32(1), emailCount.Load())

	// Drop back below threshold ($3 = ¥21 < ¥50) -> re-armed, sends 2nd email!
	currentQuota.Store(1500000)
	res4, err := RefreshUpstreamBalances(context.Background(), UpstreamBalanceRefreshOptions{SendAlerts: true})
	require.NoError(t, err)
	assert.Equal(t, 1, res4.AlertsTriggered)
	assert.True(t, res4.AlertEmailSent)
	assert.Equal(t, int32(2), emailCount.Load())
}

func TestUpstreamBalanceNewAPIRetriesStatusWithChannelKeyAndFallsBackOnForbiddenUserSelf(t *testing.T) {
	setupUpstreamBalanceServiceTest(t)

	var unauthStatusHits atomic.Int32
	var authStatusHits atomic.Int32
	var userSelfHits atomic.Int32
	upstreamServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/status":
			if r.Header.Get("Authorization") != "Bearer sk-cdn-key" {
				unauthStatusHits.Add(1)
				http.Error(w, "403 Forbidden", http.StatusForbidden)
				return
			}
			authStatusHits.Add(1)
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota_per_unit":1000000}}`))
		case "/api/user/self":
			userSelfHits.Add(1)
			http.Error(w, "403 Forbidden", http.StatusForbidden)
		case "/api/usage/token/":
			if r.Header.Get("Authorization") != "Bearer sk-cdn-key" {
				http.Error(w, "403 Forbidden", http.StatusForbidden)
				return
			}
			_, _ = w.Write([]byte(`{"code":true,"data":{"total_available":25000000,"total_granted":30000000,"total_used":5000000,"unlimited_quota":false}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstreamServer.Close()

	siteURL := upstreamServer.URL
	ch := &model.Channel{
		Name:    "CDN Protected New API",
		Type:    constant.ChannelTypeNewAPI,
		Status:  common.ChannelStatusEnabled,
		BaseURL: &siteURL,
		Key:     "sk-cdn-key",
		Group:   "default",
	}
	require.NoError(t, model.DB.Create(ch).Error)

	saveTestUpstreamSetting(t, operation_setting.UpstreamBalanceSetting{
		Enabled:              true,
		CheckIntervalMinutes: 15,
		AlertCooldownMinutes: 1440,
		Sites: map[string]operation_setting.UpstreamBalanceSiteConfig{
			upstreamServer.URL: {
				Name:         "CDN Site",
				ProviderType: operation_setting.UpstreamBalanceProviderNewAPI,
				AccessToken:  "legacy-access-token",
				UserID:       "2565",
			},
		},
		Channels: map[string]operation_setting.UpstreamBalanceChannelConfig{},
	})

	summary, err := RefreshUpstreamBalances(context.Background(), UpstreamBalanceRefreshOptions{SendAlerts: false})
	require.NoError(t, err)
	assert.Equal(t, 1, summary.RefreshedSites)
	assert.GreaterOrEqual(t, unauthStatusHits.Load(), int32(1))
	assert.Equal(t, int32(1), authStatusHits.Load())
	assert.Equal(t, int32(1), userSelfHits.Load())

	overview, err := BuildUpstreamBalanceOverview()
	require.NoError(t, err)
	require.Len(t, overview.Sites, 1)
	site := overview.Sites[0]
	assert.Equal(t, UpstreamBalanceStatusOK, site.Snapshot.Status)
	assert.Equal(t, UpstreamBalanceSourceTokenQuota, site.Snapshot.BalanceSource)
	require.NotNil(t, site.Snapshot.BalanceUSD)
	assert.InDelta(t, 25.0, *site.Snapshot.BalanceUSD, 1e-6)
	require.NotNil(t, site.Snapshot.BalanceCNY)
	assert.InDelta(t, 175.0, *site.Snapshot.BalanceCNY, 1e-6)
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}
