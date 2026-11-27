package controller

import (
	"net/http"
	"runtime"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/gin-gonic/gin"
)

type SiteOverviewRuntimeSnapshot struct {
	AllocBytes         uint64  `json:"alloc_bytes"`
	SysBytes           uint64  `json:"sys_bytes"`
	NumGC              uint32  `json:"num_gc"`
	NumGoroutine       int     `json:"num_goroutine"`
	DiskCacheEnabled   bool    `json:"disk_cache_enabled"`
	DiskCacheSizeBytes int64   `json:"disk_cache_size_bytes"`
	DiskCacheFiles     int64   `json:"disk_cache_files"`
	CPUUsage           float64 `json:"cpu_usage"`
	MemoryUsage        float64 `json:"memory_usage"`
	DiskUsage          float64 `json:"disk_usage"`
	MonitorSampled     bool    `json:"monitor_sampled"`
}

type SiteOverviewResponse struct {
	Meta        model.SiteOverviewMeta              `json:"meta"`
	Usage       model.SiteOverviewUsageSummary      `json:"usage"`
	Finance     model.SiteOverviewFinanceSummary    `json:"finance"`
	Performance perfmetrics.SiteOverviewPerfSummary `json:"performance"`
	Users       model.SiteOverviewUsersSummary      `json:"users"`
	Channels    model.SiteOverviewChannelsSummary   `json:"channels"`
	Trend       []model.SiteOverviewTrendPoint      `json:"trend"`
	TopModels   []model.SiteOverviewModelItem       `json:"top_models"`
	PerfAlerts  []perfmetrics.SiteOverviewPerfModel `json:"perf_alerts"`
	Groups      []model.SiteOverviewGroupItem       `json:"groups"`
	TopUsers    []model.SiteOverviewUserItem        `json:"top_users"`
	Runtime     *SiteOverviewRuntimeSnapshot        `json:"runtime,omitempty"`
}

func parseSiteOverviewExcludeAdmins(c *gin.Context) (*bool, bool) {
	raw := strings.TrimSpace(c.Query("exclude_admins"))
	if raw == "" {
		return nil, true
	}
	parsed, err := strconv.ParseBool(raw)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return nil, false
	}
	return &parsed, true
}

func buildSiteOverviewRuntimeSnapshot() *SiteOverviewRuntimeSnapshot {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	diskConfig := common.GetDiskCacheConfig()
	cacheStats := common.GetDiskCacheStats()
	sysStatus := common.GetSystemStatus()
	diskUsage := sysStatus.DiskUsage
	if diskUsage <= 0 {
		diskUsage = common.GetDiskSpaceInfo().UsedPercent
	}

	return &SiteOverviewRuntimeSnapshot{
		AllocBytes:         memStats.Alloc,
		SysBytes:           memStats.Sys,
		NumGC:              memStats.NumGC,
		NumGoroutine:       runtime.NumGoroutine(),
		DiskCacheEnabled:   diskConfig.Enabled,
		DiskCacheSizeBytes: cacheStats.CurrentDiskUsageBytes,
		DiskCacheFiles:     cacheStats.ActiveDiskFiles,
		CPUUsage:           sysStatus.CPUUsage,
		MemoryUsage:        sysStatus.MemoryUsage,
		DiskUsage:          diskUsage,
		MonitorSampled:     !sysStatus.SampledAt.IsZero(),
	}
}

func GetSiteOverview(c *gin.Context) {
	excludeAdmins, ok := parseSiteOverviewExcludeAdmins(c)
	if !ok {
		return
	}

	base, err := model.GetSiteOverviewBase(model.SiteOverviewOptions{
		Range:             c.Query("range"),
		ExcludeAdminUsers: excludeAdmins,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}

	perfResult, err := perfmetrics.QuerySiteOverviewMetrics(
		base.Meta.StartTime,
		base.Meta.EndTime,
		base.Meta.PrevStartTime,
		base.Meta.PrevEndTime,
		base.Meta.BucketUnit,
		base.Location,
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	for idx := range base.Trend {
		if bucket, exists := perfResult.Buckets[base.Trend[idx].Label]; exists {
			base.Trend[idx].PerfRequests = bucket.RequestCount
			base.Trend[idx].SuccessRate = bucket.SuccessRate
			base.Trend[idx].AvgLatencyMs = bucket.AvgLatencyMs
			base.Trend[idx].AvgTtftMs = bucket.AvgTtftMs
			base.Trend[idx].AvgTps = bucket.AvgTps
		}
	}

	for idx := range base.TopModels {
		if metric, exists := perfResult.Models[base.TopModels[idx].ModelName]; exists {
			rate := metric.SuccessRate
			latency := metric.AvgLatencyMs
			ttft := metric.AvgTtftMs
			tps := metric.AvgTps
			base.TopModels[idx].SuccessRate = &rate
			base.TopModels[idx].AvgLatencyMs = &latency
			if ttft > 0 {
				base.TopModels[idx].AvgTtftMs = &ttft
			}
			if !metric.TpsInsufficient {
				base.TopModels[idx].AvgTps = &tps
			}
			base.TopModels[idx].TpsInsufficient = metric.TpsInsufficient
		}
	}

	for idx := range base.Groups {
		if metric, exists := perfResult.Groups[base.Groups[idx].Group]; exists {
			rate := metric.SuccessRate
			latency := metric.AvgLatencyMs
			ttft := metric.AvgTtftMs
			tps := metric.AvgTps
			base.Groups[idx].SuccessRate = &rate
			base.Groups[idx].AvgLatencyMs = &latency
			if ttft > 0 {
				base.Groups[idx].AvgTtftMs = &ttft
			}
			if !metric.TpsInsufficient {
				base.Groups[idx].AvgTps = &tps
			}
			base.Groups[idx].TpsInsufficient = metric.TpsInsufficient
		}
	}

	resp := SiteOverviewResponse{
		Meta:        base.Meta,
		Usage:       base.Usage,
		Finance:     base.Finance,
		Performance: perfResult.Summary,
		Users:       base.Users,
		Channels:    base.Channels,
		Trend:       base.Trend,
		TopModels:   base.TopModels,
		PerfAlerts:  perfResult.PerfAlerts,
		Groups:      base.Groups,
		TopUsers:    base.TopUsers,
	}
	if c.GetInt("role") >= common.RoleRootUser {
		resp.Runtime = buildSiteOverviewRuntimeSnapshot()
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    resp,
	})
}
