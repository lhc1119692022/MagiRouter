package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWrapUnversionedV1HandlerRewritesAndPreservesRoutes(t *testing.T) {
	tests := []struct {
		name           string
		method         string
		target         string
		headers        map[string]string
		wantPath       string
		wantRawPath    string
		wantRequestURI string
	}{
		{
			name:           "responses POST",
			method:         http.MethodPost,
			target:         "/responses",
			wantPath:       "/v1/responses",
			wantRequestURI: "/v1/responses",
		},
		{
			name:           "responses trailing slash POST",
			method:         http.MethodPost,
			target:         "/responses/?stream=true",
			wantPath:       "/v1/responses",
			wantRequestURI: "/v1/responses?stream=true",
		},
		{
			name:           "responses WebSocket GET",
			method:         http.MethodGet,
			target:         "/responses",
			headers:        map[string]string{"Upgrade": "websocket", "Connection": "Upgrade"},
			wantPath:       "/v1/responses",
			wantRequestURI: "/v1/responses",
		},
		{
			name:           "responses compact POST",
			method:         http.MethodPost,
			target:         "/responses/compact",
			wantPath:       "/v1/responses/compact",
			wantRequestURI: "/v1/responses/compact",
		},
		{
			name:           "responses compact trailing slash POST",
			method:         http.MethodPost,
			target:         "/responses/compact/",
			wantPath:       "/v1/responses/compact",
			wantRequestURI: "/v1/responses/compact",
		},
		{
			name:           "responses retrieve GET",
			method:         http.MethodGet,
			target:         "/responses/resp_123",
			wantPath:       "/v1/responses/resp_123",
			wantRequestURI: "/v1/responses/resp_123",
		},
		{
			name:           "chat completions POST",
			method:         http.MethodPost,
			target:         "/chat/completions",
			wantPath:       "/v1/chat/completions",
			wantRequestURI: "/v1/chat/completions",
		},
		{
			name:           "chat completions trailing slash POST",
			method:         http.MethodPost,
			target:         "/chat/completions/",
			wantPath:       "/v1/chat/completions",
			wantRequestURI: "/v1/chat/completions",
		},
		{
			name:           "chat SPA GET stays unrewritten",
			method:         http.MethodGet,
			target:         "/chat/completions",
			wantPath:       "/chat/completions",
			wantRequestURI: "/chat/completions",
		},
		{
			name:           "messages POST",
			method:         http.MethodPost,
			target:         "/messages",
			wantPath:       "/v1/messages",
			wantRequestURI: "/v1/messages",
		},
		{
			name:           "messages subpath POST",
			method:         http.MethodPost,
			target:         "/messages/count_tokens",
			wantPath:       "/v1/messages/count_tokens",
			wantRequestURI: "/v1/messages/count_tokens",
		},
		{
			name:           "realtime WebSocket GET preserves query",
			method:         http.MethodGet,
			target:         "/realtime?model=gpt-realtime",
			wantPath:       "/v1/realtime",
			wantRequestURI: "/v1/realtime?model=gpt-realtime",
		},
		{
			name:           "engines embeddings POST",
			method:         http.MethodPost,
			target:         "/engines/text-embedding-3-small/embeddings",
			wantPath:       "/v1/engines/text-embedding-3-small/embeddings",
			wantRequestURI: "/v1/engines/text-embedding-3-small/embeddings",
		},
		{
			name:           "gemini generateContent POST preserves encoded colon and query",
			method:         http.MethodPost,
			target:         "/models/gemini-2.5-pro%3AstreamGenerateContent?alt=sse&key=sk-test",
			wantPath:       "/v1/models/gemini-2.5-pro:streamGenerateContent",
			wantRawPath:    "/v1/models/gemini-2.5-pro%3AstreamGenerateContent",
			wantRequestURI: "/v1/models/gemini-2.5-pro%3AstreamGenerateContent?alt=sse&key=sk-test",
		},
		{
			name:           "models GET with bearer token",
			method:         http.MethodGet,
			target:         "/models?client_version=0.172.0",
			headers:        map[string]string{"Authorization": "Bearer sk-test", "Accept": "text/html"},
			wantPath:       "/v1/models",
			wantRequestURI: "/v1/models?client_version=0.172.0",
		},
		{
			name:           "models GET trailing slash with API client accept",
			method:         http.MethodGet,
			target:         "/models/",
			headers:        map[string]string{"Accept": "*/*"},
			wantPath:       "/v1/models",
			wantRequestURI: "/v1/models",
		},
		{
			name:           "models GET with encoded slash preserves RawPath",
			method:         http.MethodGet,
			target:         "/models/openai%2Fgpt-5",
			headers:        map[string]string{"Authorization": "Bearer sk-test"},
			wantPath:       "/v1/models/openai/gpt-5",
			wantRawPath:    "/v1/models/openai%2Fgpt-5",
			wantRequestURI: "/v1/models/openai%2Fgpt-5",
		},
		{
			name:           "models GET from browser navigation stays SPA",
			method:         http.MethodGet,
			target:         "/models",
			headers:        map[string]string{"Accept": "text/html,application/xhtml+xml", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document"},
			wantPath:       "/models",
			wantRequestURI: "/models",
		},
		{
			name:           "models section GET from browser without Sec-Fetch stays SPA",
			method:         http.MethodGet,
			target:         "/models/overview",
			headers:        map[string]string{"Accept": "text/html,application/xhtml+xml"},
			wantPath:       "/models/overview",
			wantRequestURI: "/models/overview",
		},
		{
			name:           "models OPTIONS preflight rewrites for CORS",
			method:         http.MethodOptions,
			target:         "/models",
			wantPath:       "/v1/models",
			wantRequestURI: "/v1/models",
		},
		{
			name:           "videos content HEAD",
			method:         http.MethodHead,
			target:         "/videos/vid_123/content",
			wantPath:       "/v1/videos/vid_123/content",
			wantRequestURI: "/v1/videos/vid_123/content",
		},
		{
			name:           "tasks artifact content GET",
			method:         http.MethodGet,
			target:         "/tasks/task_123/artifacts/video/content",
			wantPath:       "/v1/tasks/task_123/artifacts/video/content",
			wantRequestURI: "/v1/tasks/task_123/artifacts/video/content",
		},
		{
			name:           "kling root tasks GET stays unrewritten",
			method:         http.MethodGet,
			target:         "/tasks?task_ids=123",
			wantPath:       "/tasks",
			wantRequestURI: "/tasks?task_ids=123",
		},
		{
			name:           "already versioned v1 stays unrewritten",
			method:         http.MethodPost,
			target:         "/v1/responses",
			wantPath:       "/v1/responses",
			wantRequestURI: "/v1/responses",
		},
		{
			name:           "v1beta stays unrewritten",
			method:         http.MethodPost,
			target:         "/v1beta/models/gemini-2.5-pro:generateContent",
			wantPath:       "/v1beta/models/gemini-2.5-pro:generateContent",
			wantRequestURI: "/v1beta/models/gemini-2.5-pro:generateContent",
		},
		{
			name:           "management api stays unrewritten",
			method:         http.MethodGet,
			target:         "/api/status",
			wantPath:       "/api/status",
			wantRequestURI: "/api/status",
		},
		{
			name:           "dot traversal segment is never rewritten",
			method:         http.MethodPost,
			target:         "/responses/../api/user/login",
			wantPath:       "/responses/../api/user/login",
			wantRequestURI: "/responses/../api/user/login",
		},
		{
			name:           "encoded dot traversal segment is never rewritten",
			method:         http.MethodGet,
			target:         "/models/%2e%2e/api/status",
			headers:        map[string]string{"Authorization": "Bearer sk-test"},
			wantPath:       "/models/../api/status",
			wantRawPath:    "/models/%2e%2e/api/status",
			wantRequestURI: "/models/%2e%2e/api/status",
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			var capturedPath string
			var capturedRawPath string
			var capturedRequestURI string

			handler := WrapUnversionedV1Handler(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				capturedPath = request.URL.Path
				capturedRawPath = request.URL.RawPath
				capturedRequestURI = request.RequestURI
				writer.WriteHeader(http.StatusOK)
			}))

			request := httptest.NewRequest(testCase.method, testCase.target, nil)
			for headerKey, headerValue := range testCase.headers {
				request.Header.Set(headerKey, headerValue)
			}
			originalPath := request.URL.Path
			originalRequestURI := request.RequestURI

			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)

			require.Equal(t, http.StatusOK, recorder.Code)
			assert.Equal(t, testCase.wantPath, capturedPath)
			assert.Equal(t, testCase.wantRawPath, capturedRawPath)
			assert.Equal(t, testCase.wantRequestURI, capturedRequestURI)
			assert.Equal(t, originalPath, request.URL.Path, "caller request URL should not be mutated")
			assert.Equal(t, originalRequestURI, request.RequestURI, "caller RequestURI should not be mutated")
		})
	}
}

func TestWrapUnversionedV1HandlerNilNextReturnsNotFound(t *testing.T) {
	handler := WrapUnversionedV1Handler(nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/responses", nil))
	assert.Equal(t, http.StatusNotFound, recorder.Code)
}

func TestUnversionedV1CompatRoutesThroughFullRelayAndWebFallback(t *testing.T) {
	setupRelayRouterTestDB(t)
	require.NoError(t, i18n.Init())

	user := model.User{
		Username: "unversioned-user",
		Status:   common.UserStatusEnabled,
		Group:    "default",
		Quota:    100,
	}
	require.NoError(t, model.DB.Create(&user).Error)
	require.NoError(t, model.DB.Create(&model.Token{
		UserId:         user.Id,
		Key:            "unversionedkey",
		Status:         common.TokenStatusEnabled,
		ExpiredTime:    -1,
		UnlimitedQuota: true,
	}).Error)

	engine := gin.New()
	SetRelayRouter(engine)
	SetTaskPluginProtocolRouter(engine)
	SetVideoRouter(engine)
	SetTaskRouter(engine)
	engine.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
			controller.RelayNotFound(c)
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte("<!doctype html><title>MagiRouter</title>"))
	})
	handler := WrapUnversionedV1Handler(engine)

	t.Run("unauthenticated relay endpoints return JSON 401 instead of HTML", func(t *testing.T) {
		endpoints := []struct {
			method  string
			path    string
			headers map[string]string
		}{
			{method: http.MethodPost, path: "/responses"},
			{method: http.MethodGet, path: "/responses", headers: map[string]string{"Upgrade": "websocket", "Connection": "Upgrade"}},
			{method: http.MethodPost, path: "/responses/compact"},
			{method: http.MethodGet, path: "/responses/resp_123"},
			{method: http.MethodPost, path: "/chat/completions"},
			{method: http.MethodPost, path: "/completions"},
			{method: http.MethodPost, path: "/messages"},
			{method: http.MethodPost, path: "/embeddings"},
			{method: http.MethodPost, path: "/rerank"},
			{method: http.MethodPost, path: "/moderations"},
			{method: http.MethodPost, path: "/images/generations"},
			{method: http.MethodPost, path: "/images/edits"},
			{method: http.MethodPost, path: "/audio/speech"},
			{method: http.MethodPost, path: "/models/gemini-2.5-pro:generateContent"},
			{method: http.MethodPost, path: "/videos"},
			{method: http.MethodGet, path: "/videos/task_123"},
			{method: http.MethodGet, path: "/tasks/task_123"},
			{method: http.MethodGet, path: "/realtime"},
			{method: http.MethodGet, path: "/models", headers: map[string]string{"Accept": "*/*"}},
		}

		for _, endpoint := range endpoints {
			t.Run(endpoint.method+" "+endpoint.path, func(t *testing.T) {
				recorder := httptest.NewRecorder()
				request := httptest.NewRequest(endpoint.method, endpoint.path, strings.NewReader(`{}`))
				for headerKey, headerValue := range endpoint.headers {
					request.Header.Set(headerKey, headerValue)
				}
				handler.ServeHTTP(recorder, request)

				assert.Equal(t, http.StatusUnauthorized, recorder.Code)
				assert.Contains(t, recorder.Header().Get("Content-Type"), "application/json")
				assert.NotContains(t, recorder.Body.String(), "<title>MagiRouter</title>")
			})
		}
	})

	t.Run("authenticated GET /models works for OpenAI, Anthropic, and Gemini headers", func(t *testing.T) {
		cases := []struct {
			name          string
			target        string
			headers       map[string]string
			expectedField string
		}{
			{
				name:          "OpenAI bearer",
				target:        "/models",
				headers:       map[string]string{"Authorization": "Bearer sk-unversionedkey"},
				expectedField: "data",
			},
			{
				name:          "OpenAI bearer with trailing slash",
				target:        "/models/?client_version=0.172.0",
				headers:       map[string]string{"Authorization": "Bearer sk-unversionedkey"},
				expectedField: "data",
			},
			{
				name:          "Anthropic headers",
				target:        "/models",
				headers:       map[string]string{"x-api-key": "sk-unversionedkey", "anthropic-version": "2023-06-01"},
				expectedField: "data",
			},
			{
				name:          "Gemini header",
				target:        "/models",
				headers:       map[string]string{"x-goog-api-key": "sk-unversionedkey"},
				expectedField: "models",
			},
			{
				name:          "Gemini query key",
				target:        "/models?key=sk-unversionedkey",
				expectedField: "models",
			},
		}

		for _, testCase := range cases {
			t.Run(testCase.name, func(t *testing.T) {
				recorder := httptest.NewRecorder()
				request := httptest.NewRequest(http.MethodGet, testCase.target, nil)
				for headerKey, headerValue := range testCase.headers {
					request.Header.Set(headerKey, headerValue)
				}
				handler.ServeHTTP(recorder, request)

				require.Equal(t, http.StatusOK, recorder.Code)
				var payload map[string]any
				require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
				assert.Contains(t, payload, testCase.expectedField)
				assert.NotContains(t, payload, "error")
			})
		}
	})

	t.Run("authenticated POST /responses and /chat/completions pass TokenAuth into relay distribution", func(t *testing.T) {
		cases := []struct {
			path string
			body string
		}{
			{path: "/responses", body: `{"model":"gpt-5","input":"ping"}`},
			{path: "/chat/completions", body: `{"model":"gpt-5","messages":[{"role":"user","content":"ping"}]}`},
		}
		for _, testCase := range cases {
			t.Run(testCase.path, func(t *testing.T) {
				recorder := httptest.NewRecorder()
				request := httptest.NewRequest(http.MethodPost, testCase.path, strings.NewReader(testCase.body))
				request.Header.Set("Authorization", "Bearer sk-unversionedkey")
				request.Header.Set("Content-Type", "application/json")
				handler.ServeHTTP(recorder, request)

				assert.Equal(t, http.StatusServiceUnavailable, recorder.Code)
				assert.Contains(t, recorder.Header().Get("Content-Type"), "application/json")
				var payload map[string]any
				require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
				assert.Contains(t, payload, "error")
				assert.Contains(t, recorder.Body.String(), "gpt-5")
			})
		}
	})

	t.Run("browser SPA navigation to /models and /models/overview still returns HTML", func(t *testing.T) {
		for _, path := range []string{"/models", "/models/overview", "/dashboard/overview"} {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, path, nil)
			request.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
			request.Header.Set("Sec-Fetch-Mode", "navigate")
			request.Header.Set("Sec-Fetch-Dest", "document")
			handler.ServeHTTP(recorder, request)

			assert.Equal(t, http.StatusOK, recorder.Code)
			assert.Contains(t, recorder.Header().Get("Content-Type"), "text/html")
			assert.Contains(t, recorder.Body.String(), "<title>MagiRouter</title>")
		}
	})

	t.Run("unimplemented unversioned subpaths return JSON 404 instead of HTML", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/messages/count_tokens", strings.NewReader(`{}`))
		handler.ServeHTTP(recorder, request)

		assert.Equal(t, http.StatusNotFound, recorder.Code)
		assert.Contains(t, recorder.Header().Get("Content-Type"), "application/json")
	})

	t.Run("CORS preflight OPTIONS succeeds on unversioned API paths", func(t *testing.T) {
		for _, path := range []string{"/responses", "/chat/completions", "/models"} {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodOptions, path, nil)
			request.Header.Set("Origin", "https://client.example")
			request.Header.Set("Access-Control-Request-Method", http.MethodPost)
			handler.ServeHTTP(recorder, request)

			assert.Equal(t, http.StatusNoContent, recorder.Code)
			assert.Equal(t, "*", recorder.Header().Get("Access-Control-Allow-Origin"))
		}
	})
}
