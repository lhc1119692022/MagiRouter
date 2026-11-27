package controller

import (
	"context"
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/setting/console_setting"

	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

const (
	requestTimeout   = 30 * time.Second
	httpTimeout      = 10 * time.Second
	uptimeKeySuffix  = "_24"
	apiStatusPath    = "/api/status-page/"
	apiHeartbeatPath = "/api/status-page/heartbeat/"
)

type Monitor struct {
	Name        string   `json:"name"`
	Uptime      float64  `json:"uptime"`
	UptimeKnown bool     `json:"uptimeKnown"`
	LatencyMs   *float64 `json:"latencyMs,omitempty"`
	Status      int      `json:"status"`
	Group       string   `json:"group,omitempty"`
}

type UptimeGroupResult struct {
	CategoryName string    `json:"categoryName"`
	Monitors     []Monitor `json:"monitors"`
}

func getAndDecode(ctx context.Context, client *http.Client, url string, dest any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return errors.New("non-200 status")
	}

	return common.DecodeJson(resp.Body, dest)
}

func fetchGroupData(ctx context.Context, client *http.Client, groupConfig map[string]any) UptimeGroupResult {
	url, _ := groupConfig["url"].(string)
	slug, _ := groupConfig["slug"].(string)
	categoryName, _ := groupConfig["categoryName"].(string)

	result := UptimeGroupResult{
		CategoryName: categoryName,
		Monitors:     []Monitor{},
	}

	if url == "" || slug == "" {
		return result
	}

	baseURL := strings.TrimSuffix(url, "/")

	var statusData struct {
		PublicGroupList []struct {
			ID          int    `json:"id"`
			Name        string `json:"name"`
			MonitorList []struct {
				ID   int    `json:"id"`
				Name string `json:"name"`
			} `json:"monitorList"`
		} `json:"publicGroupList"`
	}

	var heartbeatData struct {
		HeartbeatList map[string][]struct {
			Time   string   `json:"time"`
			Status *int     `json:"status"`
			Ping   *float64 `json:"ping"`
		} `json:"heartbeatList"`
		UptimeList map[string]float64 `json:"uptimeList"`
	}

	g, gCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		return getAndDecode(gCtx, client, baseURL+apiStatusPath+slug, &statusData)
	})
	g.Go(func() error {
		return getAndDecode(gCtx, client, baseURL+apiHeartbeatPath+slug, &heartbeatData)
	})

	if g.Wait() != nil {
		return result
	}

	for _, pg := range statusData.PublicGroupList {
		if len(pg.MonitorList) == 0 {
			continue
		}

		for _, m := range pg.MonitorList {
			monitor := Monitor{
				Name:   m.Name,
				Group:  pg.Name,
				Status: -1,
			}

			monitorID := strconv.Itoa(m.ID)

			if uptime, exists := heartbeatData.UptimeList[monitorID+uptimeKeySuffix]; exists && uptime >= 0 && uptime <= 1 {
				monitor.Uptime = uptime
				monitor.UptimeKnown = true
			}

			if heartbeats, exists := heartbeatData.HeartbeatList[monitorID]; exists && len(heartbeats) > 0 {
				latest := heartbeats[0]
				for _, sample := range heartbeats[1:] {
					if sample.Time > latest.Time {
						latest = sample
					}
				}
				if latest.Status != nil {
					monitor.Status = *latest.Status
				}
				if latest.Ping != nil && *latest.Ping >= 0 {
					monitor.LatencyMs = latest.Ping
				}
			}

			result.Monitors = append(result.Monitors, monitor)
		}
	}

	return result
}

func GetUptimeKumaStatus(c *gin.Context) {
	var groups []map[string]any
	if console_setting.GetConsoleSetting().UptimeKumaEnabled {
		groups = console_setting.GetUptimeKumaGroups()
	}
	if len(groups) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": []UptimeGroupResult{}})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), requestTimeout)
	defer cancel()

	client := &http.Client{Timeout: httpTimeout}
	results := make([]UptimeGroupResult, len(groups))

	g, gCtx := errgroup.WithContext(ctx)
	for i, group := range groups {
		g.Go(func() error {
			results[i] = fetchGroupData(gCtx, client, group)
			return nil
		})
	}

	g.Wait()
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": results})
}

// GetUptimeHealth is a zero-token aggregate health endpoint designed for
// external probes such as Uptime Kuma. It evaluates active channel presence and
// recent real-request success rate without sending any upstream AI requests or
// exposing internal channel identifiers.
func GetUptimeHealth(c *gin.Context) {
	group := strings.TrimSpace(c.Query("group"))
	hours := 1
	if rawHours := c.Query("hours"); rawHours != "" {
		if parsed, err := strconv.Atoi(rawHours); err == nil && parsed > 0 {
			hours = min(parsed, 24)
		}
	}
	minSuccessRate := 85.0
	if rawRate := c.Query("min_success_rate"); rawRate != "" {
		if parsed, err := strconv.ParseFloat(rawRate, 64); err == nil && parsed >= 0 && parsed <= 100 {
			minSuccessRate = parsed
		}
	}
	minRequests := int64(5)
	if rawMinReq := c.Query("min_requests"); rawMinReq != "" {
		if parsed, err := strconv.ParseInt(rawMinReq, 10, 64); err == nil && parsed >= 0 {
			minRequests = parsed
		}
	}

	var filterGroups []string
	if group != "" {
		filterGroups = []string{group}
	}

	enabledModelsByGroup, err := model.GetEnabledModelsByGroup(filterGroups)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status": "outage",
			"reason": "database_unavailable",
		})
		return
	}
	enabledModelsByGroup, _ = filterHiddenModelsByGroup(enabledModelsByGroup)

	enabledModels := 0
	activeGroups := 0
	for _, models := range enabledModelsByGroup {
		if len(models) > 0 {
			enabledModels += len(models)
			activeGroups++
		}
	}

	metricsResult, err := perfmetrics.QueryGroupStatusForModels(hours, filterGroups, enabledModelsByGroup)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status": "outage",
			"reason": "metrics_unavailable",
		})
		return
	}

	var totalRequests int64
	var totalSuccess int64
	for _, snap := range metricsResult.Groups {
		totalRequests += snap.RequestCount
		totalSuccess += snap.SuccessCount
	}

	var successRate *float64
	if totalRequests > 0 {
		rate := math.Round(float64(totalSuccess)/float64(totalRequests)*10000) / 100
		successRate = &rate
	}

	status := "ok"
	reason := ""
	httpStatus := http.StatusOK

	if enabledModels == 0 {
		status = "outage"
		reason = "no_active_channels"
		httpStatus = http.StatusServiceUnavailable
	} else if totalRequests >= minRequests && successRate != nil && *successRate < minSuccessRate {
		status = "degraded"
		reason = "success_rate_below_threshold"
		httpStatus = http.StatusServiceUnavailable
	}

	c.JSON(httpStatus, gin.H{
		"status":           status,
		"reason":           reason,
		"group":            group,
		"window_hours":     hours,
		"active_groups":    activeGroups,
		"enabled_models":   enabledModels,
		"request_count":    totalRequests,
		"success_count":    totalSuccess,
		"success_rate":     successRate,
		"min_success_rate": minSuccessRate,
		"min_requests":     minRequests,
	})
}
