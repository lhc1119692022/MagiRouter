package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGetNoticeIncludesImagesAndRevalidatesETag(t *testing.T) {
	gin.SetMode(gin.TestMode)

	common.OptionMapRWMutex.Lock()
	prevMap := common.OptionMap
	common.OptionMap = map[string]string{
		"Notice":       "Welcome to MagiRouter",
		"NoticeImages": "[]",
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = prevMap
		common.OptionMapRWMutex.Unlock()
	})

	requestNotice := func(ifNoneMatch string) *httptest.ResponseRecorder {
		router := gin.New()
		router.GET("/api/notice", GetNotice)
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/notice", nil)
		if ifNoneMatch != "" {
			req.Header.Set("If-None-Match", ifNoneMatch)
		}
		router.ServeHTTP(recorder, req)
		return recorder
	}

	first := requestNotice("")
	require.Equal(t, http.StatusOK, first.Code)
	var payload struct {
		Success bool     `json:"success"`
		Data    string   `json:"data"`
		Images  []string `json:"images"`
	}
	require.NoError(t, json.Unmarshal(first.Body.Bytes(), &payload))
	require.True(t, payload.Success)
	require.Equal(t, "Welcome to MagiRouter", payload.Data)
	require.Empty(t, payload.Images)

	etagWithoutImages := first.Header().Get("ETag")
	require.NotEmpty(t, etagWithoutImages)

	notModified := requestNotice(etagWithoutImages)
	require.Equal(t, http.StatusNotModified, notModified.Code)

	common.OptionMapRWMutex.Lock()
	common.OptionMap["NoticeImages"] = `["https://cdn.example.com/notice-qr.png"]`
	common.OptionMapRWMutex.Unlock()

	withImages := requestNotice(etagWithoutImages)
	require.Equal(t, http.StatusOK, withImages.Code)
	require.NotEqual(t, etagWithoutImages, withImages.Header().Get("ETag"))
	require.NoError(t, json.Unmarshal(withImages.Body.Bytes(), &payload))
	require.Equal(t, "Welcome to MagiRouter", payload.Data)
	require.Equal(t, []string{"https://cdn.example.com/notice-qr.png"}, payload.Images)
}
