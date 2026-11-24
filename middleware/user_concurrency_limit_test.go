package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func resetUserConcurrencyTestState(t *testing.T) {
	t.Helper()
	require.NoError(t, i18n.Init())
	prevEnabled := setting.IsUserConcurrencyLimitEnabled()
	prevDefault := setting.GetUserConcurrencyLimitDefault()
	prevGroup := setting.UserConcurrencyLimitGroup2JSONString()
	prevWait := setting.GetUserConcurrencyLimitWaitTimeoutSeconds()
	prevExtra := setting.GetUserConcurrencyLimitMaxWaitExtra()
	prevTTL := setting.GetUserConcurrencyLimitSlotTTLSeconds()
	prevRedis := common.RedisEnabled
	prevRDB := common.RDB

	inMemoryUserConcurrency.reset()
	t.Cleanup(func() {
		setting.SetUserConcurrencyLimitEnabled(prevEnabled)
		setting.SetUserConcurrencyLimitDefault(prevDefault)
		_ = setting.UpdateUserConcurrencyLimitGroupByJSONString(prevGroup)
		setting.SetUserConcurrencyLimitWaitTimeoutSeconds(prevWait)
		setting.SetUserConcurrencyLimitMaxWaitExtra(prevExtra)
		setting.SetUserConcurrencyLimitSlotTTLSeconds(prevTTL)
		common.RedisEnabled = prevRedis
		common.RDB = prevRDB
		inMemoryUserConcurrency.reset()
	})
}

func buildConcurrencyTestRouter(userID int, userMax int, tokenGroup string, userGroup string, handler gin.HandlerFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/v1/chat/completions", func(c *gin.Context) {
		c.Set("id", userID)
		common.SetContextKey(c, constant.ContextKeyUserMaxConcurrency, userMax)
		common.SetContextKey(c, constant.ContextKeyTokenGroup, tokenGroup)
		common.SetContextKey(c, constant.ContextKeyUserGroup, userGroup)
		c.Next()
	}, UserConcurrencyLimit(), handler)
	return router
}

func TestUserConcurrencyLimitEnforceAndReleaseBothModes(t *testing.T) {
	for _, useRedis := range []bool{false, true} {
		name := "memory"
		if useRedis {
			name = "redis"
		}
		t.Run(name, func(t *testing.T) {
			resetUserConcurrencyTestState(t)
			if useRedis {
				useRateLimitMiniRedis(t)
			} else {
				common.RedisEnabled = false
			}

			setting.SetUserConcurrencyLimitEnabled(true)
			setting.SetUserConcurrencyLimitDefault(1)
			setting.SetUserConcurrencyLimitWaitTimeoutSeconds(0)
			setting.SetUserConcurrencyLimitSlotTTLSeconds(60)

			started := make(chan struct{}, 2)
			release := make(chan struct{})
			router := buildConcurrencyTestRouter(101, 0, "default", "default", func(c *gin.Context) {
				started <- struct{}{}
				<-release
				c.Status(http.StatusOK)
			})

			firstDone := make(chan int, 1)
			go func() {
				resp := performRateLimitRequest(router, "/v1/chat/completions", "127.0.0.1:1001")
				firstDone <- resp.Code
			}()
			<-started

			// Second concurrent request for same user is rejected immediately with 429.
			second := performRateLimitRequest(router, "/v1/chat/completions", "127.0.0.1:1002")
			assert.Equal(t, http.StatusTooManyRequests, second.Code)

			// Different user is completely isolated and succeeds.
			otherRouter := buildConcurrencyTestRouter(202, 0, "default", "default", func(c *gin.Context) {
				c.Status(http.StatusOK)
			})
			otherResp := performRateLimitRequest(otherRouter, "/v1/chat/completions", "127.0.0.1:1003")
			assert.Equal(t, http.StatusOK, otherResp.Code)

			// Release first request; slot should be freed and third request must succeed.
			close(release)
			assert.Equal(t, http.StatusOK, <-firstDone)

			third := performRateLimitRequest(router, "/v1/chat/completions", "127.0.0.1:1004")
			assert.Equal(t, http.StatusOK, third.Code)
		})
	}
}

func TestUserConcurrencyLimitWaitQueueAndTimeoutBothModes(t *testing.T) {
	for _, useRedis := range []bool{false, true} {
		name := "memory"
		if useRedis {
			name = "redis"
		}
		t.Run(name, func(t *testing.T) {
			resetUserConcurrencyTestState(t)
			if useRedis {
				useRateLimitMiniRedis(t)
			} else {
				common.RedisEnabled = false
			}

			setting.SetUserConcurrencyLimitEnabled(true)
			setting.SetUserConcurrencyLimitDefault(1)
			setting.SetUserConcurrencyLimitWaitTimeoutSeconds(2)
			setting.SetUserConcurrencyLimitMaxWaitExtra(0) // maxWait = 1
			setting.SetUserConcurrencyLimitSlotTTLSeconds(60)

			started := make(chan struct{}, 2)
			releaseFirst := make(chan struct{})
			var calls atomic.Int32
			router := buildConcurrencyTestRouter(301, 0, "default", "default", func(c *gin.Context) {
				if calls.Add(1) == 1 {
					started <- struct{}{}
					<-releaseFirst
				}
				c.Status(http.StatusOK)
			})

			firstDone := make(chan int, 1)
			go func() {
				firstDone <- performRateLimitRequest(router, "/v1/chat/completions", "127.0.0.1:2001").Code
			}()
			<-started

			// Second request enters wait queue (maxWait = 1) and succeeds once first finishes.
			secondDone := make(chan int, 1)
			go func() {
				secondDone <- performRateLimitRequest(router, "/v1/chat/completions", "127.0.0.1:2002").Code
			}()

			// Give second goroutine a brief moment to enter the wait queue.
			time.Sleep(120 * time.Millisecond)

			// Third request finds queue full (maxWait = 1) and gets 429 immediately.
			third := performRateLimitRequest(router, "/v1/chat/completions", "127.0.0.1:2003")
			assert.Equal(t, http.StatusTooManyRequests, third.Code)

			close(releaseFirst)
			assert.Equal(t, http.StatusOK, <-firstDone)
			assert.Equal(t, http.StatusOK, <-secondDone)
		})
	}
}

func TestUserConcurrencyLimitWaitTimeoutAndClientCancel(t *testing.T) {
	resetUserConcurrencyTestState(t)
	common.RedisEnabled = false
	setting.SetUserConcurrencyLimitEnabled(true)
	setting.SetUserConcurrencyLimitDefault(1)
	setting.SetUserConcurrencyLimitWaitTimeoutSeconds(1)
	setting.SetUserConcurrencyLimitMaxWaitExtra(2)

	started := make(chan struct{}, 1)
	releaseFirst := make(chan struct{})
	router := buildConcurrencyTestRouter(401, 0, "default", "default", func(c *gin.Context) {
		select {
		case started <- struct{}{}:
		default:
		}
		<-releaseFirst
		c.Status(http.StatusOK)
	})

	firstDone := make(chan int, 1)
	go func() {
		firstDone <- performRateLimitRequest(router, "/v1/chat/completions", "127.0.0.1:3001").Code
	}()
	<-started

	// Client disconnects while waiting in queue.
	reqCtx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest(http.MethodGet, "/v1/chat/completions", nil).WithContext(reqCtx)
	req.RemoteAddr = "127.0.0.1:3002"
	canceledDone := make(chan struct{})
	go func() {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		close(canceledDone)
	}()
	time.Sleep(80 * time.Millisecond)
	cancel()
	select {
	case <-canceledDone:
	case <-time.After(time.Second):
		t.Fatal("queued request did not abort on client cancellation")
	}

	// Another request waits until timeout (1s) and receives 429.
	timedOut := performRateLimitRequest(router, "/v1/chat/completions", "127.0.0.1:3003")
	assert.Equal(t, http.StatusTooManyRequests, timedOut.Code)

	close(releaseFirst)
	assert.Equal(t, http.StatusOK, <-firstDone)
	assert.Equal(t, 0, inMemoryUserConcurrency.activeCount(401))
}

func TestUserConcurrencyLimitResolutionPriorityAndValidation(t *testing.T) {
	resetUserConcurrencyTestState(t)
	setting.SetUserConcurrencyLimitDefault(5)
	require.NoError(t, setting.UpdateUserConcurrencyLimitGroupByJSONString(`{"vip_tier": 20, "video_heavy": 2, "unlimited_group": 0}`))

	// Per-user override wins over everything.
	assert.Equal(t, 12, setting.ResolveUserConcurrencyLimit(12, "video_heavy", "vip_tier"))
	// Token group wins over user group.
	assert.Equal(t, 2, setting.ResolveUserConcurrencyLimit(0, "video_heavy", "vip_tier"))
	// Explicit 0 in group map means unlimited for that group (overrides global default).
	assert.Equal(t, 0, setting.ResolveUserConcurrencyLimit(0, "unlimited_group", "vip_tier"))
	// Pure user-management group applies when token group is not configured.
	assert.Equal(t, 20, setting.ResolveUserConcurrencyLimit(0, "standard_billing", "vip_tier"))
	// Falls back to global default when neither group matches.
	assert.Equal(t, 5, setting.ResolveUserConcurrencyLimit(0, "standard_billing", "regular"))

	// Validation checks.
	assert.NoError(t, setting.CheckUserConcurrencyLimitGroup(""))
	assert.NoError(t, setting.CheckUserConcurrencyLimitGroup(`{"default": 10, "vip": 0}`))
	assert.Error(t, setting.CheckUserConcurrencyLimitGroup(`{"default": -1}`))
	assert.Error(t, setting.CheckUserConcurrencyLimitGroup(`{"": 5}`))
	assert.Error(t, setting.CheckUserConcurrencyLimitGroup(`not-json`))
	assert.Error(t, setting.ValidateUserConcurrencySlotTTL(10))
	assert.NoError(t, setting.ValidateUserConcurrencySlotTTL(900))
}

func TestMemoryUserConcurrencyEvictsExpiredSlots(t *testing.T) {
	limiter := newMemoryUserConcurrencyLimiter()
	assert.True(t, limiter.acquire(999, 1, 50*time.Millisecond, "req-1"))
	assert.False(t, limiter.acquire(999, 1, 50*time.Millisecond, "req-2"))
	time.Sleep(70 * time.Millisecond)
	assert.True(t, limiter.acquire(999, 1, 50*time.Millisecond, "req-2"))
	limiter.release(999, "req-2")
	assert.Equal(t, 0, limiter.activeCount(999))
}
