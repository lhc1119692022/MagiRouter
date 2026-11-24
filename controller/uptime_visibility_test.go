package controller

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDisabledMonitorPublicationDoesNotContactSource(t *testing.T) {
	var calls atomic.Int32
	monitor := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(monitor.Close)
	settings := console_setting.GetConsoleSetting()
	previous := *settings
	t.Cleanup(func() { *settings = previous })
	settings.UptimeKumaEnabled = false
	settings.UptimeKumaGroups = `[{"categoryName":"Private origin","url":"` + monitor.URL + `","slug":"test"}]`
	response := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(response)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/uptime/status", nil)
	GetUptimeKumaStatus(ctx)
	assert.Equal(t, int32(0), calls.Load())
	assert.JSONEq(t, `{"success":true,"message":"","data":[]}`, response.Body.String())
}

func TestPublicMonitorProjectionUsesLatestSamplesAndOmitsUnmeasuredMetrics(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/api/status-page/heartbeat/sample" {
			_, _ = w.Write([]byte(`{"heartbeatList":{"1":[{"time":"2026-11-21 23:00:00","status":0,"ping":98},{"time":"2026-11-22 00:00:00","status":1,"ping":0}]},"uptimeList":{"1_24":0}}`))
			return
		}
		_, _ = w.Write([]byte(`{"publicGroupList":[{"id":8,"name":"Region","monitorList":[{"id":1,"name":"Active"},{"id":2,"name":"No heartbeat"}]}]}`))
	}))
	t.Cleanup(server.Close)
	got := fetchGroupData(t.Context(), server.Client(), map[string]any{"url": server.URL, "slug": "sample", "categoryName": "Published"})
	data, err := common.Marshal(got)
	require.NoError(t, err)
	assert.JSONEq(t, `{"categoryName":"Published","monitors":[{"name":"Active","group":"Region","status":1,"uptime":0,"uptimeKnown":true,"latencyMs":0},{"name":"No heartbeat","group":"Region","status":-1,"uptime":0,"uptimeKnown":false}]}`, string(data))
}
