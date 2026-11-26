package controller

import (
	"math"
	"net/http"
	"sort"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
)

func usablePerfMetricGroups(c *gin.Context) []string {
	userGroup := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
	usableGroups := service.GetUserUsableGroups(userGroup)
	// A non-nil empty list restricts the metrics query to zero groups.
	groups := make([]string, 0, len(usableGroups))
	for group := range usableGroups {
		if group == "auto" || ratio_setting.ContainsGroupRatio(group) {
			groups = append(groups, group)
		}
	}
	return groups
}

func GetPerfMetricsSummary(c *gin.Context) {
	getPerfMetricsSummary(c, usablePerfMetricGroups(c))
}

func GetDashboardPerfMetricsSummary(c *gin.Context) {
	getPerfMetricsSummary(c, append(lo.Keys(ratio_setting.GetGroupRatioCopy()), "auto"))
}

func getPerfMetricsSummary(c *gin.Context, groups []string) {
	hours := 24
	if rawHours := c.Query("hours"); rawHours != "" {
		if parsed, err := strconv.Atoi(rawHours); err == nil {
			hours = parsed
		}
	}

	recentModels := c.QueryArray("recent_model")
	if len(recentModels) > perfmetrics.MaxRecentModels {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	result, err := perfmetrics.QuerySummaryAll(hours, groups, recentModels...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

type groupChannelStatusSummary struct {
	TotalGroups       int     `json:"total_groups"`
	OperationalGroups int     `json:"operational_groups"`
	DegradedGroups    int     `json:"degraded_groups"`
	OutageGroups      int     `json:"outage_groups"`
	IdleGroups        int     `json:"idle_groups"`
	TotalRequests     int64   `json:"total_requests"`
	SuccessRate       float64 `json:"success_rate"`
	AvgLatencyMs      int64   `json:"avg_latency_ms"`
	AvgTtftMs         int64   `json:"avg_ttft_ms"`
	AvgTps            float64 `json:"avg_tps"`
}

type groupChannelStatusItem struct {
	Group             string                         `json:"group"`
	Description       string                         `json:"description"`
	Ratio             float64                        `json:"ratio"`
	IsAuto            bool                           `json:"is_auto,omitempty"`
	Status            string                         `json:"status"`
	Capabilities      []string                       `json:"capabilities"`
	MediaOnly         bool                           `json:"media_only,omitempty"`
	MetricFocus       string                         `json:"metric_focus"`
	EnabledModels     int                            `json:"enabled_models"`
	HasActiveChannels bool                           `json:"has_active_channels"`
	RequestCount      int64                          `json:"request_count"`
	SuccessCount      int64                          `json:"success_count"`
	SuccessRate       float64                        `json:"success_rate"`
	AvgLatencyMs      int64                          `json:"avg_latency_ms"`
	AvgTtftMs         int64                          `json:"avg_ttft_ms"`
	AvgTps            float64                        `json:"avg_tps"`
	CacheHitRate      *float64                       `json:"cache_hit_rate,omitempty"`
	Series            []perfmetrics.GroupBucketPoint `json:"series"`
	TopModels         []perfmetrics.GroupModelMetric `json:"top_models"`
	RecentProbe       *perfmetrics.GroupProbeSummary `json:"recent_probe,omitempty"`
}

type groupChannelStatusResponse struct {
	WindowHours   int                       `json:"window_hours"`
	WindowStart   int64                     `json:"window_start"`
	WindowEnd     int64                     `json:"window_end"`
	BucketSeconds int64                     `json:"bucket_seconds"`
	Summary       groupChannelStatusSummary `json:"summary"`
	Groups        []groupChannelStatusItem  `json:"groups"`
}

func classifyGroupChannelStatus(hasActiveChannels bool, requestCount int64, successRate float64, probe *perfmetrics.GroupProbeSummary) string {
	if requestCount > 0 {
		if successRate < 80 {
			return "outage"
		}
		if successRate < 98 {
			return "degraded"
		}
		return "operational"
	}
	if probe != nil && probe.RecentSamples > 0 {
		if probe.Success && probe.RecentSuccessRate >= 90 {
			return "operational"
		}
		if probe.RecentSuccessRate > 0 {
			return "degraded"
		}
		return "outage"
	}
	if !hasActiveChannels {
		return "outage"
	}
	return "idle"
}

func GetPerfMetricsGroups(c *gin.Context) {
	hours := 24
	if rawHours := c.Query("hours"); rawHours != "" {
		if parsed, err := strconv.Atoi(rawHours); err == nil && parsed > 0 {
			hours = min(parsed, 24*30)
		}
	}

	userGroup := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
	if userGroup == "" {
		if userID := c.GetInt("id"); userID > 0 {
			userGroup, _ = model.GetUserGroup(userID, false)
		}
	}
	usableGroups := service.GetUserUsableGroups(userGroup)
	groupRatios := ratio_setting.GetGroupRatioCopy()

	visibleGroups := make([]string, 0, len(usableGroups))
	for groupName := range usableGroups {
		if ratio_setting.IsUserManagementGroup(groupName) {
			continue
		}
		if groupName == "auto" {
			visibleGroups = append(visibleGroups, groupName)
			continue
		}
		if _, ok := groupRatios[groupName]; ok {
			visibleGroups = append(visibleGroups, groupName)
		}
	}

	metricsResult, err := perfmetrics.QueryGroupStatus(hours, visibleGroups)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	enabledCounts, err := model.GetEnabledModelCountsByGroup(visibleGroups)
	if err != nil {
		enabledCounts = map[string]int{}
	}
	enabledModelsByGroup, err := model.GetEnabledModelsByGroup(visibleGroups)
	if err != nil {
		enabledModelsByGroup = map[string][]string{}
	}

	totalEnabledModels := 0
	allModelNameSet := make(map[string]struct{})
	for groupName, count := range enabledCounts {
		if groupName != "auto" {
			totalEnabledModels += count
		}
	}
	for _, models := range enabledModelsByGroup {
		for _, modelName := range models {
			if modelName != "" {
				allModelNameSet[modelName] = struct{}{}
			}
		}
	}
	for _, snap := range metricsResult.Groups {
		for _, topModel := range snap.TopModels {
			if topModel.ModelName != "" {
				allModelNameSet[topModel.ModelName] = struct{}{}
			}
		}
	}
	allModelNames := make([]string, 0, len(allModelNameSet))
	for modelName := range allModelNameSet {
		allModelNames = append(allModelNames, modelName)
	}
	capabilityHints := model.GetModelCapabilityHintsByNames(allModelNames)

	items := make([]groupChannelStatusItem, 0, len(visibleGroups))
	summary := groupChannelStatusSummary{}
	var weightedLatency int64
	var weightedTtft int64
	var ttftWeight int64
	var tpsWeighted float64
	var tpsWeight int64
	var totalSuccess int64

	for _, groupName := range visibleGroups {
		snap, hasSnap := metricsResult.Groups[groupName]
		enabledModels := enabledCounts[groupName]
		isAuto := groupName == "auto"
		if isAuto {
			if enabledModels == 0 {
				enabledModels = totalEnabledModels
			}
			if !hasSnap && enabledModels == 0 {
				continue
			}
		}
		hasActiveChannels := enabledModels > 0
		probe := perfmetrics.GetGroupProbeSummary(groupName)
		if !hasActiveChannels && snap.RequestCount == 0 && probe == nil {
			continue
		}

		desc := usableGroups[groupName]
		if desc == "" && isAuto {
			desc = setting.GetUsableGroupDescription("auto")
		}
		ratio := 0.0
		if !isAuto {
			ratio = service.GetUserGroupRatio(userGroup, groupName)
		}
		status := classifyGroupChannelStatus(hasActiveChannels, snap.RequestCount, snap.SuccessRate, probe)

		series := snap.Series
		if series == nil {
			series = []perfmetrics.GroupBucketPoint{}
		}
		topModels := snap.TopModels
		if topModels == nil {
			topModels = []perfmetrics.GroupModelMetric{}
		}

		groupEnabledModels := enabledModelsByGroup[groupName]
		if isAuto && len(groupEnabledModels) == 0 {
			groupEnabledModels = allModelNames
		}
		capabilities := collectGroupCapabilities(groupEnabledModels, topModels, capabilityHints)
		mediaOnly := isGroupMediaOnly(capabilities, groupEnabledModels, topModels)
		metricFocus := perfmetrics.MetricFocusCacheRate
		if mediaOnly {
			metricFocus = perfmetrics.MetricFocusDuration
		} else if snap.RequestCount > 0 && snap.CacheHitRate == nil {
			metricFocus = perfmetrics.MetricFocusDuration
		}

		items = append(items, groupChannelStatusItem{
			Group:             groupName,
			Description:       desc,
			Ratio:             ratio,
			IsAuto:            isAuto,
			Status:            status,
			Capabilities:      capabilities,
			MediaOnly:         mediaOnly,
			MetricFocus:       metricFocus,
			EnabledModels:     enabledModels,
			HasActiveChannels: hasActiveChannels,
			RequestCount:      snap.RequestCount,
			SuccessCount:      snap.SuccessCount,
			SuccessRate:       snap.SuccessRate,
			AvgLatencyMs:      snap.AvgLatencyMs,
			AvgTtftMs:         snap.AvgTtftMs,
			AvgTps:            snap.AvgTps,
			CacheHitRate:      snap.CacheHitRate,
			Series:            series,
			TopModels:         topModels,
			RecentProbe:       probe,
		})

		summary.TotalGroups++
		switch status {
		case "operational":
			summary.OperationalGroups++
		case "degraded":
			summary.DegradedGroups++
		case "outage":
			summary.OutageGroups++
		default:
			summary.IdleGroups++
		}

		if snap.RequestCount > 0 {
			summary.TotalRequests += snap.RequestCount
			totalSuccess += snap.SuccessCount
			weightedLatency += snap.AvgLatencyMs * snap.RequestCount
			if snap.AvgTtftMs > 0 {
				weightedTtft += snap.AvgTtftMs * snap.RequestCount
				ttftWeight += snap.RequestCount
			}
			if snap.AvgTps > 0 {
				tpsWeighted += snap.AvgTps * float64(snap.RequestCount)
				tpsWeight += snap.RequestCount
			}
		}
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Group == "default" && items[j].Group != "default" {
			return true
		}
		if items[j].Group == "default" && items[i].Group != "default" {
			return false
		}
		if items[i].RequestCount != items[j].RequestCount {
			return items[i].RequestCount > items[j].RequestCount
		}
		return items[i].Group < items[j].Group
	})

	if summary.TotalRequests > 0 {
		summary.SuccessRate = math.Round(float64(totalSuccess)/float64(summary.TotalRequests)*10000) / 100
		summary.AvgLatencyMs = weightedLatency / summary.TotalRequests
	}
	if ttftWeight > 0 {
		summary.AvgTtftMs = weightedTtft / ttftWeight
	}
	if tpsWeight > 0 {
		summary.AvgTps = math.Round(tpsWeighted/float64(tpsWeight)*100) / 100
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": groupChannelStatusResponse{
			WindowHours:   metricsResult.WindowHours,
			WindowStart:   metricsResult.WindowStart,
			WindowEnd:     metricsResult.WindowEnd,
			BucketSeconds: metricsResult.BucketSeconds,
			Summary:       summary,
			Groups:        items,
		},
	})
}

func collectGroupCapabilities(enabledModels []string, topModels []perfmetrics.GroupModelMetric, hints map[string]model.ModelCapabilityHint) []string {
	seen := make(map[string]bool)
	addModel := func(modelName string) {
		if modelName == "" {
			return
		}
		hint := hints[modelName]
		for _, capName := range perfmetrics.ClassifyModelCapabilities(modelName, hint.Tags, hint.Endpoints) {
			seen[capName] = true
		}
	}
	for _, modelName := range enabledModels {
		addModel(modelName)
	}
	for _, item := range topModels {
		addModel(item.ModelName)
	}
	out := make([]string, 0, len(seen))
	for _, capName := range perfmetrics.CanonicalCapabilities {
		if seen[capName] {
			out = append(out, capName)
		}
	}
	return out
}

func isGroupMediaOnly(capabilities []string, enabledModels []string, topModels []perfmetrics.GroupModelMetric) bool {
	if len(capabilities) > 0 {
		for _, capName := range capabilities {
			if capName == perfmetrics.ModelKindText {
				return false
			}
		}
		return true
	}
	return len(enabledModels) == 0 && len(topModels) > 0
}

func GetPerfMetrics(c *gin.Context) {
	modelName := c.Query("model")
	if modelName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "model is required",
		})
		return
	}

	hours := 24
	if rawHours := c.Query("hours"); rawHours != "" {
		if parsed, err := strconv.Atoi(rawHours); err == nil {
			hours = parsed
		}
	}

	result, err := perfmetrics.Query(perfmetrics.QueryParams{
		Model:         modelName,
		Group:         c.Query("group"),
		Hours:         hours,
		AllowedGroups: usablePerfMetricGroups(c),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}
