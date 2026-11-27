package perfmetrics

import (
	"math"
	"time"

	"github.com/QuantumNous/new-api/model"
)

type RoutingMetric struct {
	RequestCount    int64
	SuccessCount    int64
	SuccessRate     float64
	AvgLatencyMs    int64
	AvgTtftMs       int64
	AvgTps          float64
	TpsInsufficient bool
	CacheHitRate    *float64
}

type RoutingMetricsSnapshot struct {
	WindowHours int
	WindowStart int64
	WindowEnd   int64
	Groups      map[string]RoutingMetric
	GroupModels map[string]map[string]RoutingMetric
}

func countersToRoutingMetric(val counters, modelName string) RoutingMetric {
	return RoutingMetric{
		RequestCount:    val.requestCount,
		SuccessCount:    val.successCount,
		SuccessRate:     math.Round(successRate(val)*100) / 100,
		AvgLatencyMs:    avg(val.totalLatencyMs, val.requestCount),
		AvgTtftMs:       avg(val.ttftSumMs, val.ttftCount),
		AvgTps:          math.Round(avgTps(val)*100) / 100,
		TpsInsufficient: isThroughputInsufficient(val, modelName),
		CacheHitRate:    cacheHitRate(val),
	}
}

// QueryRoutingMetrics returns full (un-truncated) per-group and per-(group, model)
// metrics over the requested trailing window, combining persisted DB rows and
// in-memory hot buckets.
func QueryRoutingMetrics(hours int, allowedGroups []string) (RoutingMetricsSnapshot, error) {
	if hours <= 0 {
		hours = 24
	}
	hours = min(hours, 24*30)
	startTs, endTs := queryWindow(time.Now(), hours)
	allowedSet := allowedGroupSet(allowedGroups)

	groupTotals := map[string]counters{}
	groupModels := map[string]map[string]counters{}

	addSample := func(group string, modelName string, val counters) {
		if group == "" || val.requestCount <= 0 {
			return
		}
		if allowedSet != nil {
			if _, ok := allowedSet[group]; !ok {
				return
			}
		}
		groupTotals[group] = addCounters(groupTotals[group], val)
		if modelName == "" {
			return
		}
		if _, exists := groupModels[group]; !exists {
			groupModels[group] = map[string]counters{}
		}
		groupModels[group][modelName] = addCounters(groupModels[group][modelName], val)
	}

	modelRows, err := model.GetPerfMetricsGroupModelSummaries(startTs, endTs, allowedGroups)
	if err != nil {
		return RoutingMetricsSnapshot{}, err
	}
	for _, row := range modelRows {
		addSample(row.Group, row.ModelName, counters{
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

	hotBuckets.Range(func(key, value any) bool {
		bucket := key.(bucketKey)
		if bucket.bucketTs < startTs || bucket.bucketTs > endTs {
			return true
		}
		snap := value.(*atomicBucket).snapshot()
		if snap.requestCount <= 0 {
			return true
		}
		addSample(bucket.group, bucket.model, snap)
		return true
	})

	out := RoutingMetricsSnapshot{
		WindowHours: hours,
		WindowStart: startTs,
		WindowEnd:   endTs,
		Groups:      make(map[string]RoutingMetric, len(groupTotals)),
		GroupModels: make(map[string]map[string]RoutingMetric, len(groupModels)),
	}
	for group, total := range groupTotals {
		out.Groups[group] = countersToRoutingMetric(total, "")
	}
	for group, models := range groupModels {
		modelOut := make(map[string]RoutingMetric, len(models))
		for modelName, val := range models {
			modelOut[modelName] = countersToRoutingMetric(val, modelName)
		}
		out.GroupModels[group] = modelOut
	}
	return out, nil
}
