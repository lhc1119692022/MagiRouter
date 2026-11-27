package perfmetrics

import (
	"cmp"
	"math"
	"slices"
	"time"

	"github.com/QuantumNous/new-api/model"
)

type SiteOverviewPerfSummary struct {
	TotalRequests    int64    `json:"total_requests"`
	SuccessRequests  int64    `json:"success_requests"`
	FailedRequests   int64    `json:"failed_requests"`
	SuccessRate      float64  `json:"success_rate"`
	PrevSuccessRate  *float64 `json:"prev_success_rate,omitempty"`
	SuccessRateDelta *float64 `json:"success_rate_delta,omitempty"`
	AvgLatencyMs     int64    `json:"avg_latency_ms"`
	PrevAvgLatencyMs *int64   `json:"prev_avg_latency_ms,omitempty"`
	LatencyChangePct *float64 `json:"latency_change_pct,omitempty"`
	AvgTtftMs        int64    `json:"avg_ttft_ms"`
	PrevAvgTtftMs    *int64   `json:"prev_avg_ttft_ms,omitempty"`
	TtftChangePct    *float64 `json:"ttft_change_pct,omitempty"`
	AvgTps           float64  `json:"avg_tps"`
	PrevAvgTps       *float64 `json:"prev_avg_tps,omitempty"`
	TpsInsufficient  bool     `json:"tps_insufficient,omitempty"`
	CacheHitRate     *float64 `json:"cache_hit_rate,omitempty"`
	HasData          bool     `json:"has_data"`
}

type SiteOverviewPerfBucket struct {
	RequestCount int64   `json:"request_count"`
	SuccessCount int64   `json:"success_count"`
	SuccessRate  float64 `json:"success_rate"`
	AvgLatencyMs int64   `json:"avg_latency_ms"`
	AvgTtftMs    int64   `json:"avg_ttft_ms"`
	AvgTps       float64 `json:"avg_tps"`
}

type SiteOverviewPerfModel struct {
	ModelName       string   `json:"model_name"`
	ModelKind       string   `json:"model_kind"`
	RequestCount    int64    `json:"request_count"`
	SuccessCount    int64    `json:"success_count"`
	SuccessRate     float64  `json:"success_rate"`
	AvgLatencyMs    int64    `json:"avg_latency_ms"`
	AvgTtftMs       int64    `json:"avg_ttft_ms"`
	AvgTps          float64  `json:"avg_tps"`
	TpsInsufficient bool     `json:"tps_insufficient,omitempty"`
	CacheHitRate    *float64 `json:"cache_hit_rate,omitempty"`
}

type SiteOverviewPerfGroup struct {
	Group           string   `json:"group"`
	RequestCount    int64    `json:"request_count"`
	SuccessCount    int64    `json:"success_count"`
	SuccessRate     float64  `json:"success_rate"`
	AvgLatencyMs    int64    `json:"avg_latency_ms"`
	AvgTtftMs       int64    `json:"avg_ttft_ms"`
	AvgTps          float64  `json:"avg_tps"`
	TpsInsufficient bool     `json:"tps_insufficient,omitempty"`
	CacheHitRate    *float64 `json:"cache_hit_rate,omitempty"`
}

type SiteOverviewPerfResult struct {
	Summary    SiteOverviewPerfSummary
	Buckets    map[string]SiteOverviewPerfBucket
	Models     map[string]SiteOverviewPerfModel
	PerfAlerts []SiteOverviewPerfModel
	Groups     map[string]SiteOverviewPerfGroup
}

func roundPerf2(value float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return math.Round(value*100) / 100
}

func perfPctChange(current float64, previous float64) *float64 {
	if previous <= 0 {
		return nil
	}
	delta := roundPerf2((current - previous) / previous * 100)
	return &delta
}

func perfBucketLabel(ts int64, bucketUnit string, loc *time.Location) string {
	tm := time.Unix(ts, 0).In(loc)
	if bucketUnit == "hour" {
		return tm.Format("2006-01-02 15:00")
	}
	return tm.Format("2006-01-02")
}

func QuerySiteOverviewMetrics(
	startTs int64,
	endTs int64,
	prevStartTs int64,
	prevEndTs int64,
	bucketUnit string,
	loc *time.Location,
) (SiteOverviewPerfResult, error) {
	if loc == nil {
		loc = time.Local
	}
	if bucketUnit != "hour" {
		bucketUnit = "day"
	}

	bucketCounters := make(map[string]counters)
	groupCounters := make(map[string]counters)
	modelCounters := make(map[string]counters)
	var currentTotal counters
	var prevTotal counters

	currentBuckets, err := model.GetPerfMetricsGroupBuckets(startTs, endTs, nil)
	if err != nil {
		return SiteOverviewPerfResult{}, err
	}
	for _, row := range currentBuckets {
		val := counters{
			requestCount:   row.RequestCount,
			successCount:   row.SuccessCount,
			totalLatencyMs: row.TotalLatencyMs,
			ttftSumMs:      row.TtftSumMs,
			ttftCount:      row.TtftCount,
			outputTokens:   row.OutputTokens,
			generationMs:   row.GenerationMs,
			tpsCount:       row.TpsCount,
			promptTokens:   row.PromptTokens,
			cachedTokens:   row.CachedTokens,
		}
		if val.requestCount <= 0 {
			continue
		}
		currentTotal = addCounters(currentTotal, val)
		label := perfBucketLabel(row.BucketTs, bucketUnit, loc)
		bucketCounters[label] = addCounters(bucketCounters[label], val)
		if row.Group != "" {
			groupCounters[row.Group] = addCounters(groupCounters[row.Group], val)
		}
	}

	currentModelRows, err := model.GetPerfMetricsGroupModelSummaries(startTs, endTs, nil)
	if err != nil {
		return SiteOverviewPerfResult{}, err
	}
	for _, row := range currentModelRows {
		if row.ModelName == "" || row.RequestCount <= 0 {
			continue
		}
		val := counters{
			requestCount:   row.RequestCount,
			successCount:   row.SuccessCount,
			totalLatencyMs: row.TotalLatencyMs,
			ttftSumMs:      row.TtftSumMs,
			ttftCount:      row.TtftCount,
			outputTokens:   row.OutputTokens,
			generationMs:   row.GenerationMs,
			tpsCount:       row.TpsCount,
			promptTokens:   row.PromptTokens,
			cachedTokens:   row.CachedTokens,
		}
		modelCounters[row.ModelName] = addCounters(modelCounters[row.ModelName], val)
	}

	if prevStartTs > 0 && prevEndTs >= prevStartTs {
		prevBuckets, prevErr := model.GetPerfMetricsGroupBuckets(prevStartTs, prevEndTs, nil)
		if prevErr != nil {
			return SiteOverviewPerfResult{}, prevErr
		}
		for _, row := range prevBuckets {
			if row.RequestCount <= 0 {
				continue
			}
			prevTotal = addCounters(prevTotal, counters{
				requestCount:   row.RequestCount,
				successCount:   row.SuccessCount,
				totalLatencyMs: row.TotalLatencyMs,
				ttftSumMs:      row.TtftSumMs,
				ttftCount:      row.TtftCount,
				outputTokens:   row.OutputTokens,
				generationMs:   row.GenerationMs,
				tpsCount:       row.TpsCount,
				promptTokens:   row.PromptTokens,
				cachedTokens:   row.CachedTokens,
			})
		}
	}

	hotBuckets.Range(func(key, value any) bool {
		bucket := key.(bucketKey)
		snap := value.(*atomicBucket).snapshot()
		if snap.requestCount <= 0 {
			return true
		}
		if bucket.bucketTs >= startTs && bucket.bucketTs <= endTs {
			currentTotal = addCounters(currentTotal, snap)
			label := perfBucketLabel(bucket.bucketTs, bucketUnit, loc)
			bucketCounters[label] = addCounters(bucketCounters[label], snap)
			if bucket.group != "" {
				groupCounters[bucket.group] = addCounters(groupCounters[bucket.group], snap)
			}
			if bucket.model != "" {
				modelCounters[bucket.model] = addCounters(modelCounters[bucket.model], snap)
			}
		} else if prevStartTs > 0 && bucket.bucketTs >= prevStartTs && bucket.bucketTs <= prevEndTs {
			prevTotal = addCounters(prevTotal, snap)
		}
		return true
	})

	summary := SiteOverviewPerfSummary{
		TotalRequests:   currentTotal.requestCount,
		SuccessRequests: currentTotal.successCount,
		FailedRequests:  max(int64(0), currentTotal.requestCount-currentTotal.successCount),
		HasData:         currentTotal.requestCount > 0,
	}
	if currentTotal.requestCount > 0 {
		summary.SuccessRate = roundPerf2(successRate(currentTotal))
		summary.AvgLatencyMs = avg(currentTotal.totalLatencyMs, currentTotal.requestCount)
		summary.AvgTtftMs = avg(currentTotal.ttftSumMs, currentTotal.ttftCount)
		summary.AvgTps = roundPerf2(avgTps(currentTotal))
		summary.TpsInsufficient = isThroughputInsufficient(currentTotal, "")
		summary.CacheHitRate = cacheHitRate(currentTotal)
	}
	if prevTotal.requestCount > 0 {
		prevRate := roundPerf2(successRate(prevTotal))
		summary.PrevSuccessRate = &prevRate
		if currentTotal.requestCount > 0 {
			rateDelta := roundPerf2(summary.SuccessRate - prevRate)
			summary.SuccessRateDelta = &rateDelta
		}
		prevLatency := avg(prevTotal.totalLatencyMs, prevTotal.requestCount)
		summary.PrevAvgLatencyMs = &prevLatency
		if currentTotal.requestCount > 0 {
			summary.LatencyChangePct = perfPctChange(float64(summary.AvgLatencyMs), float64(prevLatency))
		}
		if prevTotal.ttftCount > 0 {
			prevTtft := avg(prevTotal.ttftSumMs, prevTotal.ttftCount)
			summary.PrevAvgTtftMs = &prevTtft
			if currentTotal.ttftCount > 0 {
				summary.TtftChangePct = perfPctChange(float64(summary.AvgTtftMs), float64(prevTtft))
			}
		}
		if !isThroughputInsufficient(prevTotal, "") {
			prevTps := roundPerf2(avgTps(prevTotal))
			summary.PrevAvgTps = &prevTps
		}
	}

	buckets := make(map[string]SiteOverviewPerfBucket, len(bucketCounters))
	for label, val := range bucketCounters {
		buckets[label] = SiteOverviewPerfBucket{
			RequestCount: val.requestCount,
			SuccessCount: val.successCount,
			SuccessRate:  roundPerf2(successRate(val)),
			AvgLatencyMs: avg(val.totalLatencyMs, val.requestCount),
			AvgTtftMs:    avg(val.ttftSumMs, val.ttftCount),
			AvgTps:       roundPerf2(avgTps(val)),
		}
	}

	models := make(map[string]SiteOverviewPerfModel, len(modelCounters))
	alerts := make([]SiteOverviewPerfModel, 0, len(modelCounters))
	for modelName, val := range modelCounters {
		item := SiteOverviewPerfModel{
			ModelName:       modelName,
			ModelKind:       ClassifyModelKind(modelName),
			RequestCount:    val.requestCount,
			SuccessCount:    val.successCount,
			SuccessRate:     roundPerf2(successRate(val)),
			AvgLatencyMs:    avg(val.totalLatencyMs, val.requestCount),
			AvgTtftMs:       avg(val.ttftSumMs, val.ttftCount),
			AvgTps:          roundPerf2(avgTps(val)),
			TpsInsufficient: isThroughputInsufficient(val, modelName),
			CacheHitRate:    cacheHitRate(val),
		}
		models[modelName] = item
		alerts = append(alerts, item)
	}
	slices.SortFunc(alerts, func(left, right SiteOverviewPerfModel) int {
		leftDegraded := left.SuccessRate < 98
		rightDegraded := right.SuccessRate < 98
		if leftDegraded != rightDegraded {
			if leftDegraded {
				return -1
			}
			return 1
		}
		if leftDegraded && left.SuccessRate != right.SuccessRate {
			return cmp.Compare(left.SuccessRate, right.SuccessRate)
		}
		if left.AvgLatencyMs != right.AvgLatencyMs {
			return cmp.Compare(right.AvgLatencyMs, left.AvgLatencyMs)
		}
		return cmp.Compare(right.RequestCount, left.RequestCount)
	})
	if len(alerts) > 12 {
		alerts = alerts[:12]
	}

	groups := make(map[string]SiteOverviewPerfGroup, len(groupCounters))
	for groupName, val := range groupCounters {
		groups[groupName] = SiteOverviewPerfGroup{
			Group:           groupName,
			RequestCount:    val.requestCount,
			SuccessCount:    val.successCount,
			SuccessRate:     roundPerf2(successRate(val)),
			AvgLatencyMs:    avg(val.totalLatencyMs, val.requestCount),
			AvgTtftMs:       avg(val.ttftSumMs, val.ttftCount),
			AvgTps:          roundPerf2(avgTps(val)),
			TpsInsufficient: isThroughputInsufficient(val, ""),
			CacheHitRate:    cacheHitRate(val),
		}
	}

	return SiteOverviewPerfResult{
		Summary:    summary,
		Buckets:    buckets,
		Models:     models,
		PerfAlerts: alerts,
		Groups:     groups,
	}, nil
}
