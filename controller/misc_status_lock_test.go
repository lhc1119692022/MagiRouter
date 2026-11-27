package controller

import (
	"net/http"
	"net/http/httptest"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetStatusConcurrentOptionWritesNoDeadlock(t *testing.T) {
	gin.SetMode(gin.TestMode)

	consoleCfg := console_setting.GetConsoleSetting()
	originalOptionMap := common.OptionMap
	originalHomeShowcase := consoleCfg.HomeShowcase
	originalPricingBanner := consoleCfg.PricingBanner
	originalPricingFilterOrder := consoleCfg.PricingFilterOrder
	originalSitePopups := consoleCfg.SitePopups
	done := make(chan struct{})
	completed := false
	t.Cleanup(func() {
		if !completed {
			return
		}
		common.OptionMapRWMutex.Lock()
		common.OptionMap = originalOptionMap
		consoleCfg.HomeShowcase = originalHomeShowcase
		consoleCfg.PricingBanner = originalPricingBanner
		consoleCfg.PricingFilterOrder = originalPricingFilterOrder
		consoleCfg.SitePopups = originalSitePopups
		common.OptionMapRWMutex.Unlock()
	})

	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{}
	consoleCfg.HomeShowcase = `{"text":{"title":"Featured"}}`
	consoleCfg.PricingBanner = `[{"title":"Promo","image_url":"https://example.com/banner.png"}]`
	consoleCfg.PricingFilterOrder = `{"vendors":["OpenAI"]}`
	consoleCfg.SitePopups = `[{"id":"p1","enabled":true,"trigger":"console","title":"Notice","content":"Hello"}]`
	common.OptionMapRWMutex.Unlock()

	stopWriters := make(chan struct{})

	var readers sync.WaitGroup
	for range 6 {
		readers.Go(func() {
			for range 400 {
				recorder := httptest.NewRecorder()
				ctx, _ := gin.CreateTestContext(recorder)
				ctx.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)
				GetStatus(ctx)
				runtime.Gosched()
			}
		})
	}

	var writers sync.WaitGroup
	for range 2 {
		writers.Go(func() {
			for {
				select {
				case <-stopWriters:
					return
				default:
				}
				common.OptionMapRWMutex.Lock()
				common.OptionMap["SystemName"] = "MagiRouter"
				common.OptionMapRWMutex.Unlock()
				runtime.Gosched()
			}
		})
	}

	go func() {
		readers.Wait()
		close(stopWriters)
		writers.Wait()
		close(done)
	}()

	select {
	case <-done:
		completed = true
	case <-time.After(5 * time.Second):
		t.Fatal("GetStatus deadlocked with concurrent OptionMapRWMutex writer")
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)
	GetStatus(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var payload struct {
		Success bool           `json:"success"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
	require.True(t, payload.Success)
	assert.Contains(t, payload.Data, "home_showcase")
	assert.Contains(t, payload.Data, "pricing_banner")
	assert.Contains(t, payload.Data, "pricing_filter_order")
	assert.Contains(t, payload.Data, "site_popups")
}
