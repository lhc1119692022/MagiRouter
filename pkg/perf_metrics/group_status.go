package perfmetrics

import (
	"math"
	"sort"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/perf_metrics_setting"
)

const maxTopModelsPerGroup = 50

type GroupBucketPoint struct {
	Ts           int64   `json:"ts"`
	RequestCount int64   `json:"request_count"`
	SuccessCount int64   `json:"success_count"`
	SuccessRate  float64 `json:"success_rate"`
	AvgLatencyMs int64   `json:"avg_latency_ms"`
	AvgTtftMs    int64   `json:"avg_ttft_ms"`
	AvgTps       float64 `json:"avg_tps"`
}

type GroupModelMetric struct {
	ModelName    string   `json:"model_name"`
	ModelKind    string   `json:"model_kind"`
	MetricFocus  string   `json:"metric_focus"`
	RequestCount int64    `json:"request_count"`
	SuccessCount int64    `json:"success_count"`
	SuccessRate  float64  `json:"success_rate"`
	AvgLatencyMs int64    `json:"avg_latency_ms"`
	AvgTtftMs    int64    `json:"avg_ttft_ms"`
	AvgTps       float64  `json:"avg_tps"`
	CacheHitRate *float64 `json:"cache_hit_rate,omitempty"`
}

type GroupMetricsSnapshot struct {
	Group        string             `json:"group"`
	RequestCount int64              `json:"request_count"`
	SuccessCount int64              `json:"success_count"`
	SuccessRate  float64            `json:"success_rate"`
	AvgLatencyMs int64              `json:"avg_latency_ms"`
	AvgTtftMs    int64              `json:"avg_ttft_ms"`
	AvgTps       float64            `json:"avg_tps"`
	CacheHitRate *float64           `json:"cache_hit_rate,omitempty"`
	Series       []GroupBucketPoint `json:"series"`
	TopModels    []GroupModelMetric `json:"top_models"`
}

type GroupStatusQueryResult struct {
	WindowHours   int                             `json:"window_hours"`
	WindowStart   int64                           `json:"window_start"`
	WindowEnd     int64                           `json:"window_end"`
	BucketSeconds int64                           `json:"bucket_seconds"`
	Total         counters                        `json:"-"`
	Groups        map[string]GroupMetricsSnapshot `json:"groups"`
}

func addCounters(dst counters, src counters) counters {
	dst.requestCount += src.requestCount
	dst.successCount += src.successCount
	dst.totalLatencyMs += src.totalLatencyMs
	dst.ttftSumMs += src.ttftSumMs
	dst.ttftCount += src.ttftCount
	dst.outputTokens += src.outputTokens
	dst.generationMs += src.generationMs
	dst.promptTokens += src.promptTokens
	dst.cachedTokens += src.cachedTokens
	return dst
}

func QueryGroupStatus(hours int, allowedGroups []string) (GroupStatusQueryResult, error) {
	if hours <= 0 {
		hours = 24
	}
	hours = min(hours, 24*30)
	startTs, endTs := queryWindow(time.Now(), hours)
	allowedSet := allowedGroupSet(allowedGroups)

	bucketSeconds := perf_metrics_setting.GetBucketSeconds()
	if bucketSeconds <= 0 {
		bucketSeconds = 3600
	}

	groupBuckets := map[string]map[int64]counters{}
	groupModels := map[string]map[string]counters{}

	addGroupBucket := func(group string, ts int64, value counters) {
		if group == "" || value.requestCount <= 0 {
			return
		}
		if allowedSet != nil {
			if _, ok := allowedSet[group]; !ok {
				return
			}
		}
		if _, exists := groupBuckets[group]; !exists {
			groupBuckets[group] = map[int64]counters{}
		}
		groupBuckets[group][ts] = addCounters(groupBuckets[group][ts], value)
	}

	addGroupModel := func(group string, modelName string, value counters) {
		if group == "" || modelName == "" || value.requestCount <= 0 {
			return
		}
		if allowedSet != nil {
			if _, ok := allowedSet[group]; !ok {
				return
			}
		}
		if _, exists := groupModels[group]; !exists {
			groupModels[group] = map[string]counters{}
		}
		groupModels[group][modelName] = addCounters(groupModels[group][modelName], value)
	}

	bucketRows, err := model.GetPerfMetricsGroupBuckets(startTs, endTs, allowedGroups)
	if err != nil {
		return GroupStatusQueryResult{}, err
	}
	for _, row := range bucketRows {
		addGroupBucket(row.Group, row.BucketTs, counters{
			requestCount:   row.RequestCount,
			successCount:   row.SuccessCount,
			totalLatencyMs: row.TotalLatencyMs,
			ttftSumMs:      row.TtftSumMs,
			ttftCount:      row.TtftCount,
			outputTokens:   row.OutputTokens,
			generationMs:   row.GenerationMs,
			promptTokens:   row.PromptTokens,
			cachedTokens:   row.CachedTokens,
		})
	}

	modelRows, err := model.GetPerfMetricsGroupModelSummaries(startTs, endTs, allowedGroups)
	if err != nil {
		return GroupStatusQueryResult{}, err
	}
	for _, row := range modelRows {
		addGroupModel(row.Group, row.ModelName, counters{
			requestCount:   row.RequestCount,
			successCount:   row.SuccessCount,
			totalLatencyMs: row.TotalLatencyMs,
			ttftSumMs:      row.TtftSumMs,
			ttftCount:      row.TtftCount,
			outputTokens:   row.OutputTokens,
			generationMs:   row.GenerationMs,
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
		addGroupBucket(bucket.group, bucket.bucketTs, snap)
		addGroupModel(bucket.group, bucket.model, snap)
		return true
	})

	result := GroupStatusQueryResult{
		WindowHours:   hours,
		WindowStart:   startTs,
		WindowEnd:     endTs,
		BucketSeconds: bucketSeconds,
		Groups:        make(map[string]GroupMetricsSnapshot, len(groupBuckets)),
	}

	for group, buckets := range groupBuckets {
		timestamps := make([]int64, 0, len(buckets))
		for ts := range buckets {
			timestamps = append(timestamps, ts)
		}
		sort.Slice(timestamps, func(i, j int) bool {
			return timestamps[i] < timestamps[j]
		})

		total := counters{}
		series := make([]GroupBucketPoint, 0, len(timestamps))
		for _, ts := range timestamps {
			val := buckets[ts]
			total = addCounters(total, val)
			series = append(series, GroupBucketPoint{
				Ts:           ts,
				RequestCount: val.requestCount,
				SuccessCount: val.successCount,
				SuccessRate:  math.Round(successRate(val)*100) / 100,
				AvgLatencyMs: avg(val.totalLatencyMs, val.requestCount),
				AvgTtftMs:    avg(val.ttftSumMs, val.ttftCount),
				AvgTps:       math.Round(avgTps(val)*100) / 100,
			})
		}

		result.Total = addCounters(result.Total, total)

		modelsMap := groupModels[group]
		topModels := make([]GroupModelMetric, 0, len(modelsMap))
		for modelName, val := range modelsMap {
			kind := ClassifyModelKind(modelName)
			hitRate := cacheHitRate(val)
			focus := MetricFocusDuration
			if kind == ModelKindText && hitRate != nil {
				focus = MetricFocusCacheRate
			}
			topModels = append(topModels, GroupModelMetric{
				ModelName:    modelName,
				ModelKind:    kind,
				MetricFocus:  focus,
				RequestCount: val.requestCount,
				SuccessCount: val.successCount,
				SuccessRate:  math.Round(successRate(val)*100) / 100,
				AvgLatencyMs: avg(val.totalLatencyMs, val.requestCount),
				AvgTtftMs:    avg(val.ttftSumMs, val.ttftCount),
				AvgTps:       math.Round(avgTps(val)*100) / 100,
				CacheHitRate: hitRate,
			})
		}
		sort.Slice(topModels, func(i, j int) bool {
			if topModels[i].RequestCount != topModels[j].RequestCount {
				return topModels[i].RequestCount > topModels[j].RequestCount
			}
			return topModels[i].ModelName < topModels[j].ModelName
		})
		if len(topModels) > maxTopModelsPerGroup {
			topModels = topModels[:maxTopModelsPerGroup]
		}

		result.Groups[group] = GroupMetricsSnapshot{
			Group:        group,
			RequestCount: total.requestCount,
			SuccessCount: total.successCount,
			SuccessRate:  math.Round(successRate(total)*100) / 100,
			AvgLatencyMs: avg(total.totalLatencyMs, total.requestCount),
			AvgTtftMs:    avg(total.ttftSumMs, total.ttftCount),
			AvgTps:       math.Round(avgTps(total)*100) / 100,
			CacheHitRate: cacheHitRate(total),
			Series:       series,
			TopModels:    topModels,
		}
	}

	return result, nil
}
