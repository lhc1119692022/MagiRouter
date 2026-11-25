package service

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestShouldCopyUpstreamHeaderWhitelist(t *testing.T) {
	gin.SetMode(gin.TestMode)

	allowed := []string{
		"Content-Type",
		"content-type",
		"Content-Encoding",
		"Content-Disposition",
		"Content-Language",
		"Content-Range",
		"Accept-Ranges",
		"Cache-Control",
		"ETag",
		"Last-Modified",
		"Vary",
		"Retry-After",
		"X-Reasoning-Included",
		"X-Codex-Turn-State",
	}
	for _, header := range allowed {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		assert.True(t, ShouldCopyUpstreamHeader(ctx, header, []string{"value"}), "expected %s to be allowed", header)
	}

	blocked := []string{
		"Content-Length",
		"Server",
		"Via",
		"CF-Ray",
		"X-Powered-By",
		"X-Request-Id",
		"Request-Id",
		"Openai-Organization",
		"Openai-Processing-Ms",
		"Anthropic-Organization-Id",
		"X-Amzn-Requestid",
		"X-New-Api-Version",
		"X-Upstream-Relay",
		"Set-Cookie",
		"Location",
		"Access-Control-Allow-Origin",
	}
	for _, header := range blocked {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		assert.False(t, ShouldCopyUpstreamHeader(ctx, header, []string{"value"}), "expected %s to be blocked", header)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	assert.False(t, ShouldCopyUpstreamHeader(ctx, common.RequestIdKey, []string{"upstream-req-123"}))
	assert.Equal(t, "upstream-req-123", ctx.GetString(common.UpstreamRequestIdKey))
}

func TestIOCopyBytesGracefullyFiltersUpstreamHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	upstreamResp := &http.Response{
		StatusCode: http.StatusOK,
		Header: http.Header{
			"Content-Type":        {"application/json; charset=utf-8"},
			"Cache-Control":       {"no-cache"},
			"Server":              {"cloudflare"},
			"Via":                 {"1.1 upstream-relay"},
			"Cf-Ray":              {"abc123-SJC"},
			"X-Request-Id":        {"req_upstream_secret"},
			common.RequestIdKey:   {"oneapi-upstream-456"},
			"Openai-Organization": {"org-upstream"},
			"X-New-Api-Version":   {"v0.9.0"},
			"X-Codex-Turn-State":  {"turn-state-1"},
		},
	}

	IOCopyBytesGracefully(ctx, upstreamResp, []byte(`{"ok":true}`))

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, `{"ok":true}`, recorder.Body.String())
	assert.Equal(t, "application/json; charset=utf-8", recorder.Header().Get("Content-Type"))
	assert.Equal(t, "no-cache", recorder.Header().Get("Cache-Control"))
	assert.Equal(t, "turn-state-1", recorder.Header().Get("X-Codex-Turn-State"))
	assert.Equal(t, "11", recorder.Header().Get("Content-Length"))
	assert.Equal(t, "oneapi-upstream-456", ctx.GetString(common.UpstreamRequestIdKey))

	for _, forbidden := range []string{
		"Server",
		"Via",
		"Cf-Ray",
		"X-Request-Id",
		common.RequestIdKey,
		"Openai-Organization",
		"X-New-Api-Version",
	} {
		assert.Empty(t, recorder.Header().Get(forbidden), "header %s must not be copied", forbidden)
	}
}
