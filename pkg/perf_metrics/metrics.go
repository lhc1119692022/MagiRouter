package perfmetrics

import (
	"cmp"
	"context"
	"fmt"
	"math"
	"sort"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/perf_metrics_setting"

	"github.com/bytedance/gopkg/util/gopool"
)

var hotBuckets sync.Map

// seriesSchema is a stable client cache/schema marker. Do not change it when
// hiding fields or making response-only privacy hardening changes.
const seriesSchema = "dbcd0a3c01b55203"

// MaxRecentModels bounds the historical lookups made by one summary request.
const MaxRecentModels = 50
const recentSuccessSampleLimit = 24
const recentSuccessHistoryHours = 7 * 24

const (
	// MinThroughputOutputTokens excludes tiny test/probe/greeting outputs whose
	// framing overhead dominates decode time.
	MinThroughputOutputTokens int64 = 64
	// MinThroughputGenerationMs excludes sub-200ms burst frames from TPS math.
	MinThroughputGenerationMs int64 = 200
	// MinThroughputSamples is the minimum qualified sustained-generation sample
	// count required before publishing an average throughput number.
	MinThroughputSamples int64 = 5
)

func Init() {
	go flushLoop()
}

// RecordRelayResult samples one finished relay exactly once, at the request
// boundary, regardless of how many channel attempts it took.
func RecordRelayResult(ctx context.Context, info *relaycommon.RelayInfo, apiErr *types.NewAPIError) {
	if info == nil {
		return
	}
	outcome := ClassifyRelayOutcome(ctx, info, apiErr)
	if outcome == OutcomeIgnored {
		return
	}
	now := time.Now()
	attemptStart := info.EffectiveAttemptStartTime()
	hasTtft := info.IsStream && info.HasSendResponse()
	ttftMs := int64(0)
	if hasTtft && !attemptStart.IsZero() {
		ttftMs = max(int64(0), info.FirstResponseTime.Sub(attemptStart).Milliseconds())
	}
	latencyMs := int64(0)
	if !attemptStart.IsZero() {
		latencyMs = max(int64(0), now.Sub(attemptStart).Milliseconds())
	}
	var outputTokens, generationMs int64
	if outcome == OutcomeSuccess && info.IsStream && info.PerformanceOutputTokens >= MinThroughputOutputTokens {
		var decodeMs int64
		if info.StreamOutputChunks >= 2 && info.StreamLastTokenTime.After(info.StreamFirstTokenTime) {
			decodeMs = info.StreamLastTokenTime.Sub(info.StreamFirstTokenTime).Milliseconds()
		} else if info.StreamOutputChunks == 0 && hasTtft && info.LastResponseTime.After(info.FirstResponseTime) {
			decodeMs = info.LastResponseTime.Sub(info.FirstResponseTime).Milliseconds()
		}
		if decodeMs >= MinThroughputGenerationMs {
			outputTokens = info.PerformanceOutputTokens
			generationMs = decodeMs
		}
	}
	if outcome == OutcomeSuccess && info.HasChannelMeta() && info.ChannelId > 0 {
		RecordChannelTraffic(info.ChannelId, now.Unix())
	}
	Record(Sample{
		Model:        info.OriginModelName,
		Group:        info.UsingGroup,
		LatencyMs:    latencyMs,
		TtftMs:       ttftMs,
		HasTtft:      hasTtft,
		Success:      outcome == OutcomeSuccess,
		OutputTokens: outputTokens,
		GenerationMs: generationMs,
		PromptTokens: info.PerformancePromptTokens,
		CachedTokens: info.PerformanceCachedTokens,
	})
}

// RecordTaskResult samples one async task exactly once, at its terminal
// transition, after the polling status CAS is won. Latency is the end-to-end
// task duration (second resolution, unlike the ms-resolution relay samples);
// throughput is only present when the provider reports tokens.
func RecordTaskResult(task *model.Task, result *relaycommon.TaskInfo) {
	if task == nil {
		return
	}
	modelName := task.Properties.OriginModelName
	if bc := task.PrivateData.BillingContext; bc != nil && bc.OriginModelName != "" {
		modelName = bc.OriginModelName
	}
	endTs := task.FinishTime
	if endTs <= 0 {
		endTs = time.Now().Unix()
	}
	sample := Sample{
		Model:   modelName,
		Group:   task.Group,
		Success: task.Status == model.TaskStatusSuccess,
	}
	if task.SubmitTime > 0 && endTs > task.SubmitTime {
		sample.LatencyMs = (endTs - task.SubmitTime) * 1000
	}
	if sample.Success && result != nil {
		tokens := int64(cmp.Or(result.TotalTokens, result.CompletionTokens))
		genStart := cmp.Or(task.StartTime, task.SubmitTime)
		if tokens > 0 && genStart > 0 && endTs > genStart {
			sample.OutputTokens = tokens
			sample.GenerationMs = (endTs - genStart) * 1000
		}
	}
	if sample.Success && task.ChannelId > 0 {
		RecordChannelTraffic(task.ChannelId, endTs)
	}
	Record(sample)
}

// Immediate failures are submit failures, which are not health samples.
func RecordImmediateTaskResult(info *relaycommon.RelayInfo, result *relaycommon.TaskInfo) {
	if info == nil || result == nil || result.Status != model.TaskStatusSuccess {
		return
	}
	sample := Sample{
		Model:     info.OriginModelName,
		Group:     info.UsingGroup,
		LatencyMs: time.Since(info.StartTime).Milliseconds(),
		Success:   true,
	}
	if tokens := int64(cmp.Or(result.TotalTokens, result.CompletionTokens)); tokens > 0 {
		sample.OutputTokens = tokens
		sample.GenerationMs = sample.LatencyMs
	}
	if info.HasChannelMeta() && info.ChannelId > 0 {
		RecordChannelTraffic(info.ChannelId, time.Now().Unix())
	}
	Record(sample)
}

func Record(sample Sample) {
	setting := perf_metrics_setting.GetSetting()
	if !setting.Enabled || sample.Model == "" {
		return
	}
	if sample.Group == "" {
		sample.Group = "default"
	}
	if sample.LatencyMs < 0 {
		sample.LatencyMs = 0
	}

	key := bucketKey{
		model:    sample.Model,
		group:    sample.Group,
		bucketTs: bucketStart(time.Now().Unix()),
	}
	actual, _ := hotBuckets.LoadOrStore(key, &atomicBucket{})
	actual.(*atomicBucket).add(sample)
	gopool.Go(func() {
		recordRedis(key, sample)
	})
}

// queryWindow covers the current partial hour plus the preceding complete
// hours, so every reader shares the same hourly buckets.
func queryWindow(now time.Time, hours int) (int64, int64) {
	if hours <= 0 {
		hours = 24
	}
	hours = min(hours, 24*30)
	endTs := now.Unix()
	return endTs - endTs%3600 - int64(hours-1)*3600, endTs
}

func Query(params QueryParams) (QueryResult, error) {
	startTs, endTs := queryWindow(time.Now(), params.Hours)
	allowedGroups := allowedGroupSet(params.AllowedGroups)

	merged := map[bucketKey]counters{}
	rows, err := model.GetPerfMetrics(params.Model, params.Group, startTs, endTs)
	if err != nil {
		return QueryResult{}, err
	}
	for _, row := range rows {
		if allowedGroups != nil {
			if _, ok := allowedGroups[row.Group]; !ok {
				continue
			}
		}
		mergeCounters(merged, bucketKey{
			model:    row.ModelName,
			group:    row.Group,
			bucketTs: row.BucketTs,
		}, counters{
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
		k := key.(bucketKey)
		if k.model != params.Model || k.bucketTs < startTs || k.bucketTs > endTs {
			return true
		}
		if params.Group != "" && k.group != params.Group {
			return true
		}
		if allowedGroups != nil {
			if _, ok := allowedGroups[k.group]; !ok {
				return true
			}
		}
		mergeCounters(merged, k, value.(*atomicBucket).snapshot())
		return true
	})

	result := buildQueryResult(params.Model, merged)
	result.WindowStart, result.WindowEnd = startTs, endTs
	return result, nil
}

func QuerySummaryAll(hours int, groups []string, recentModels ...string) (SummaryAllResult, error) {
	if len(recentModels) > MaxRecentModels {
		return SummaryAllResult{}, common.NewMessage("Invalid parameters")
	}
	now := time.Now()
	startTs, endTs := queryWindow(now, hours)
	recentStartTs, _ := queryWindow(now, recentSuccessHistoryHours)
	allowedGroups := allowedGroupSet(groups)
	queryStartTs := startTs

	recentBuckets := make(map[string]map[int64]counters, len(recentModels))
	for _, name := range recentModels {
		if name == "" {
			continue
		}
		if _, exists := recentBuckets[name]; exists {
			continue
		}
		recentBuckets[name] = map[int64]counters{}
		buckets, err := model.GetRecentPerfMetricSuccessBuckets(name, recentStartTs, endTs, groups, recentSuccessSampleLimit)
		if err != nil {
			return SummaryAllResult{}, err
		}
		for _, bucket := range buckets {
			queryStartTs = min(queryStartTs, bucket.BucketTs)
			mergeModelBucket(recentBuckets, name, bucket.BucketTs, counters{
				requestCount: bucket.RequestCount,
				successCount: bucket.SuccessCount,
			})
		}
	}

	rows, err := model.GetPerfMetricsSummaryBucketsAll(queryStartTs, endTs, groups)
	if err != nil {
		return SummaryAllResult{}, err
	}

	modelBuckets := map[string]map[int64]counters{}
	for _, row := range rows {
		value := counters{
			requestCount:   row.RequestCount,
			successCount:   row.SuccessCount,
			totalLatencyMs: row.TotalLatencyMs,
			outputTokens:   row.OutputTokens,
			generationMs:   row.GenerationMs,
			tpsCount:       row.TpsCount,
			promptTokens:   row.PromptTokens,
			cachedTokens:   row.CachedTokens,
		}
		mergeModelBucket(modelBuckets, row.ModelName, row.BucketTs, value)
	}

	hotBuckets.Range(func(key, value any) bool {
		k := key.(bucketKey)
		if k.bucketTs > endTs {
			return true
		}
		if allowedGroups != nil {
			if _, ok := allowedGroups[k.group]; !ok {
				return true
			}
		}
		snap := value.(*atomicBucket).snapshot()
		if snap.requestCount == 0 {
			return true
		}
		if _, requested := recentBuckets[k.model]; requested && k.bucketTs >= recentStartTs {
			mergeModelBucket(recentBuckets, k.model, k.bucketTs, snap)
		}
		if k.bucketTs < queryStartTs {
			return true
		}
		mergeModelBucket(modelBuckets, k.model, k.bucketTs, snap)
		return true
	})

	recentSeries := make(map[string][]SuccessRatePoint, len(recentBuckets))
	for name, buckets := range recentBuckets {
		points := recentSuccessSeries(buckets)
		if len(points) == 0 {
			continue
		}
		recentSeries[name] = points[max(0, len(points)-recentSuccessSampleLimit):]
	}

	// Requested models are summarized over the same hours as their status samples.
	totals := map[string]counters{}
	for name, buckets := range modelBuckets {
		fromTs := startTs
		if points, ok := recentSeries[name]; ok {
			fromTs = points[0].Ts
		}
		for bucketTs, value := range buckets {
			if bucketTs < fromTs {
				delete(buckets, bucketTs)
				continue
			}
			mergeModelTotals(totals, name, value)
		}
	}

	all := counters{}
	models := make([]ModelSummary, 0, len(totals))
	for name, total := range totals {
		if total.requestCount == 0 {
			continue
		}
		all.requestCount += total.requestCount
		all.successCount += total.successCount
		all.totalLatencyMs += total.totalLatencyMs
		all.outputTokens += total.outputTokens
		all.generationMs += total.generationMs
		all.tpsCount += total.tpsCount
		all.promptTokens += total.promptTokens
		all.cachedTokens += total.cachedTokens
		avgLatency := total.totalLatencyMs / total.requestCount
		models = append(models, ModelSummary{
			ModelName:           name,
			AvgLatencyMs:        avgLatency,
			SuccessRate:         math.Round(successRate(total)*100) / 100,
			AvgTps:              math.Round(avgTps(total)*100) / 100,
			TpsInsufficient:     isThroughputInsufficient(total, name),
			CacheHitRate:        cacheHitRate(total),
			RecentSuccessSeries: recentSuccessSeries(modelBuckets[name]),
			RequestCount:        total.requestCount,
		})
	}
	sort.Slice(models, func(i, j int) bool {
		return models[i].RequestCount > models[j].RequestCount
	})

	return SummaryAllResult{
		Summary: summarize(all, ""), WindowStart: startTs, WindowEnd: endTs,
		Models: models, RecentSuccessSeries: recentSeries,
	}, nil
}

// QuerySummaryAllBestGroup summarizes each model using the visible group with
// the highest availability in the window so a degraded route does not mask
// healthy routes in the Model Square.
func QuerySummaryAllBestGroup(hours int, groups []string, recentModels ...string) (SummaryAllResult, error) {
	if len(recentModels) > MaxRecentModels {
		return SummaryAllResult{}, common.NewMessage("Invalid parameters")
	}
	now := time.Now()
	startTs, endTs := queryWindow(now, hours)
	recentStartTs, _ := queryWindow(now, recentSuccessHistoryHours)
	allowedGroups := allowedGroupSet(groups)
	queryStartTs := startTs

	recentGroupBuckets := make(map[string]map[string]map[int64]counters, len(recentModels))
	for _, name := range recentModels {
		if name == "" {
			continue
		}
		if _, exists := recentGroupBuckets[name]; exists {
			continue
		}
		recentGroupBuckets[name] = map[string]map[int64]counters{}
		buckets, err := model.GetRecentPerfMetricSuccessGroupBuckets(name, recentStartTs, endTs, groups)
		if err != nil {
			return SummaryAllResult{}, err
		}
		for _, bucket := range buckets {
			if bucket.Group == "" || bucket.RequestCount <= 0 {
				continue
			}
			if _, ok := recentGroupBuckets[name][bucket.Group]; !ok {
				recentGroupBuckets[name][bucket.Group] = map[int64]counters{}
			}
			mergeBucketCounter(recentGroupBuckets[name][bucket.Group], bucket.BucketTs, counters{
				requestCount: bucket.RequestCount,
				successCount: bucket.SuccessCount,
			})
		}
	}

	for _, byGroup := range recentGroupBuckets {
		for _, buckets := range byGroup {
			points := recentSuccessSeries(buckets)
			if len(points) == 0 {
				continue
			}
			trimmed := points[max(0, len(points)-recentSuccessSampleLimit):]
			queryStartTs = min(queryStartTs, trimmed[0].Ts)
		}
	}

	rows, err := model.GetPerfMetricsSummaryGroupBucketsAll(queryStartTs, endTs, groups)
	if err != nil {
		return SummaryAllResult{}, err
	}

	modelGroupBuckets := map[string]map[string]map[int64]counters{}
	addGroupBucket := func(modelName, group string, bucketTs int64, value counters) {
		if modelName == "" || group == "" || value.requestCount == 0 {
			return
		}
		if _, ok := modelGroupBuckets[modelName]; !ok {
			modelGroupBuckets[modelName] = map[string]map[int64]counters{}
		}
		if _, ok := modelGroupBuckets[modelName][group]; !ok {
			modelGroupBuckets[modelName][group] = map[int64]counters{}
		}
		mergeBucketCounter(modelGroupBuckets[modelName][group], bucketTs, value)
	}

	for _, row := range rows {
		addGroupBucket(row.ModelName, row.Group, row.BucketTs, counters{
			requestCount:   row.RequestCount,
			successCount:   row.SuccessCount,
			totalLatencyMs: row.TotalLatencyMs,
			outputTokens:   row.OutputTokens,
			generationMs:   row.GenerationMs,
			tpsCount:       row.TpsCount,
			promptTokens:   row.PromptTokens,
			cachedTokens:   row.CachedTokens,
		})
	}

	hotBuckets.Range(func(key, value any) bool {
		k := key.(bucketKey)
		if k.bucketTs > endTs {
			return true
		}
		if allowedGroups != nil {
			if _, ok := allowedGroups[k.group]; !ok {
				return true
			}
		}
		snap := value.(*atomicBucket).snapshot()
		if snap.requestCount == 0 {
			return true
		}
		if byGroup, requested := recentGroupBuckets[k.model]; requested && k.bucketTs >= recentStartTs {
			if _, ok := byGroup[k.group]; !ok {
				byGroup[k.group] = map[int64]counters{}
			}
			mergeBucketCounter(byGroup[k.group], k.bucketTs, snap)
		}
		if k.bucketTs < queryStartTs {
			return true
		}
		addGroupBucket(k.model, k.group, k.bucketTs, snap)
		return true
	})

	recentGroupSeries := make(map[string]map[string][]SuccessRatePoint, len(recentGroupBuckets))
	for name, byGroup := range recentGroupBuckets {
		for group, buckets := range byGroup {
			points := recentSuccessSeries(buckets)
			if len(points) == 0 {
				continue
			}
			if _, ok := recentGroupSeries[name]; !ok {
				recentGroupSeries[name] = map[string][]SuccessRatePoint{}
			}
			recentGroupSeries[name][group] = points[max(0, len(points)-recentSuccessSampleLimit):]
		}
	}

	all := counters{}
	models := make([]ModelSummary, 0, len(modelGroupBuckets))
	recentSeries := make(map[string][]SuccessRatePoint, len(recentGroupSeries))

	for name, byGroup := range modelGroupBuckets {
		var (
			hasBest       bool
			bestGroup     string
			bestTotal     counters
			bestSeries    []SuccessRatePoint
			modelRequests int64
		)

		for group, buckets := range byGroup {
			fromTs := startTs
			if byModelRecent, ok := recentGroupSeries[name]; ok {
				if points, hasPoints := byModelRecent[group]; hasPoints && len(points) > 0 {
					fromTs = points[0].Ts
				}
			}
			total := counters{}
			filtered := make(map[int64]counters, len(buckets))
			for bucketTs, value := range buckets {
				if bucketTs < fromTs {
					continue
				}
				filtered[bucketTs] = value
				total = addCounters(total, value)
			}
			if total.requestCount == 0 {
				continue
			}
			modelRequests += total.requestCount
			all = addCounters(all, total)

			series := recentSuccessSeries(filtered)
			if !hasBest || isBetterAvailabilityGroup(group, total, len(series), bestGroup, bestTotal, len(bestSeries)) {
				hasBest = true
				bestGroup = group
				bestTotal = total
				bestSeries = series
			}
		}

		if !hasBest {
			continue
		}

		if _, requested := recentGroupBuckets[name]; requested && len(bestSeries) > 0 {
			recentSeries[name] = bestSeries[max(0, len(bestSeries)-recentSuccessSampleLimit):]
		}

		models = append(models, ModelSummary{
			ModelName:           name,
			BestGroup:           bestGroup,
			AvgLatencyMs:        avg(bestTotal.totalLatencyMs, bestTotal.requestCount),
			SuccessRate:         math.Round(successRate(bestTotal)*100) / 100,
			AvgTps:              math.Round(avgTps(bestTotal)*100) / 100,
			TpsInsufficient:     isThroughputInsufficient(bestTotal, name),
			CacheHitRate:        cacheHitRate(bestTotal),
			RecentSuccessSeries: bestSeries,
			RequestCount:        modelRequests,
		})
	}

	for name, byGroup := range recentGroupSeries {
		if _, already := recentSeries[name]; already {
			continue
		}
		var (
			hasBest    bool
			bestGroup  string
			bestTotal  counters
			bestSeries []SuccessRatePoint
		)
		for group, points := range byGroup {
			if len(points) == 0 {
				continue
			}
			fromTs := points[0].Ts
			total := counters{}
			for ts, val := range recentGroupBuckets[name][group] {
				if ts >= fromTs {
					total = addCounters(total, val)
				}
			}
			if total.requestCount == 0 {
				continue
			}
			if !hasBest || isBetterAvailabilityGroup(group, total, len(points), bestGroup, bestTotal, len(bestSeries)) {
				hasBest = true
				bestGroup = group
				bestTotal = total
				bestSeries = points
			}
		}
		if hasBest {
			recentSeries[name] = bestSeries
		}
	}

	sort.Slice(models, func(i, j int) bool {
		if models[i].RequestCount != models[j].RequestCount {
			return models[i].RequestCount > models[j].RequestCount
		}
		return models[i].ModelName < models[j].ModelName
	})

	return SummaryAllResult{
		Summary:             summarize(all, ""),
		WindowStart:         startTs,
		WindowEnd:           endTs,
		Models:              models,
		RecentSuccessSeries: recentSeries,
	}, nil
}

func isBetterAvailabilityGroup(
	candidateGroup string,
	candidate counters,
	candidateHours int,
	currentGroup string,
	current counters,
	currentHours int,
) bool {
	candidateRate := successRate(candidate)
	currentRate := successRate(current)
	const rateEpsilon = 1e-9
	if candidateRate > currentRate+rateEpsilon {
		return true
	}
	if currentRate > candidateRate+rateEpsilon {
		return false
	}
	if candidateHours != currentHours {
		return candidateHours > currentHours
	}
	if candidate.requestCount != current.requestCount {
		return candidate.requestCount > current.requestCount
	}
	if candidate.tpsCount != current.tpsCount {
		return candidate.tpsCount > current.tpsCount
	}
	return candidateGroup < currentGroup
}

func mergeBucketCounter(buckets map[int64]counters, bucketTs int64, value counters) {
	if value.requestCount == 0 {
		return
	}
	buckets[bucketTs] = addCounters(buckets[bucketTs], value)
}

func QueryModelGroupRequestCounts(hours int, allowedGroups []string) (map[string]map[string]int64, map[string]int64, error) {
	startTs, endTs := queryWindow(time.Now(), hours)
	allowedSet := allowedGroupSet(allowedGroups)

	byModelGroup := make(map[string]map[string]int64)
	byGroup := make(map[string]int64)

	addCount := func(modelName string, group string, count int64) {
		if modelName == "" || group == "" || count <= 0 {
			return
		}
		if allowedSet != nil {
			if _, ok := allowedSet[group]; !ok {
				return
			}
		}
		modelCounts, exists := byModelGroup[modelName]
		if !exists {
			modelCounts = make(map[string]int64)
			byModelGroup[modelName] = modelCounts
		}
		modelCounts[group] += count
		byGroup[group] += count
	}

	rows, err := model.GetPerfMetricsModelGroupCounts(startTs, endTs, allowedGroups)
	if err != nil {
		return byModelGroup, byGroup, err
	}
	for _, row := range rows {
		addCount(row.ModelName, row.Group, row.RequestCount)
	}

	hotBuckets.Range(func(key, value any) bool {
		bucket := key.(bucketKey)
		if bucket.bucketTs < startTs || bucket.bucketTs > endTs {
			return true
		}
		snap := value.(*atomicBucket).snapshot()
		if snap.requestCount > 0 {
			addCount(bucket.model, bucket.group, snap.requestCount)
		}
		return true
	})

	return byModelGroup, byGroup, nil
}

func mergeModelTotals(totals map[string]counters, modelName string, value counters) {
	if value.requestCount == 0 {
		return
	}
	current := totals[modelName]
	current.requestCount += value.requestCount
	current.successCount += value.successCount
	current.totalLatencyMs += value.totalLatencyMs
	current.ttftSumMs += value.ttftSumMs
	current.ttftCount += value.ttftCount
	current.outputTokens += value.outputTokens
	current.generationMs += value.generationMs
	current.tpsCount += value.tpsCount
	current.promptTokens += value.promptTokens
	current.cachedTokens += value.cachedTokens
	totals[modelName] = current
}

func mergeModelBucket(modelBuckets map[string]map[int64]counters, modelName string, bucketTs int64, value counters) {
	if value.requestCount == 0 {
		return
	}
	if _, ok := modelBuckets[modelName]; !ok {
		modelBuckets[modelName] = map[int64]counters{}
	}
	current := modelBuckets[modelName][bucketTs]
	current.requestCount += value.requestCount
	current.successCount += value.successCount
	current.totalLatencyMs += value.totalLatencyMs
	current.ttftSumMs += value.ttftSumMs
	current.ttftCount += value.ttftCount
	current.outputTokens += value.outputTokens
	current.generationMs += value.generationMs
	current.tpsCount += value.tpsCount
	current.promptTokens += value.promptTokens
	current.cachedTokens += value.cachedTokens
	modelBuckets[modelName][bucketTs] = current
}

func recentSuccessSeries(buckets map[int64]counters) []SuccessRatePoint {
	if len(buckets) == 0 {
		return nil
	}
	hourly := map[int64]counters{}
	for ts, value := range buckets {
		hourTs := ts - ts%3600
		merged := hourly[hourTs]
		merged.requestCount += value.requestCount
		merged.successCount += value.successCount
		hourly[hourTs] = merged
	}
	timestamps := make([]int64, 0, len(hourly))
	for hourTs, value := range hourly {
		if value.requestCount == 0 {
			continue
		}
		timestamps = append(timestamps, hourTs)
	}
	if len(timestamps) == 0 {
		return nil
	}
	sort.Slice(timestamps, func(i, j int) bool {
		return timestamps[i] < timestamps[j]
	})
	points := make([]SuccessRatePoint, 0, len(timestamps))
	for _, hourTs := range timestamps {
		points = append(points, SuccessRatePoint{
			Ts:          hourTs,
			SuccessRate: math.Round(successRate(hourly[hourTs])*100) / 100,
		})
	}
	return points
}

func allowedGroupSet(groups []string) map[string]struct{} {
	if groups == nil {
		return nil
	}
	allowed := make(map[string]struct{}, len(groups))
	for _, group := range groups {
		allowed[group] = struct{}{}
	}
	return allowed
}

func bucketStart(ts int64) int64 {
	bucketSeconds := perf_metrics_setting.GetBucketSeconds()
	if bucketSeconds <= 0 {
		bucketSeconds = 3600
	}
	return ts - (ts % bucketSeconds)
}

func mergeCounters(merged map[bucketKey]counters, key bucketKey, value counters) {
	if value.requestCount == 0 {
		return
	}
	current := merged[key]
	current.requestCount += value.requestCount
	current.successCount += value.successCount
	current.totalLatencyMs += value.totalLatencyMs
	current.ttftSumMs += value.ttftSumMs
	current.ttftCount += value.ttftCount
	current.outputTokens += value.outputTokens
	current.generationMs += value.generationMs
	current.tpsCount += value.tpsCount
	current.promptTokens += value.promptTokens
	current.cachedTokens += value.cachedTokens
	merged[key] = current
}

func buildQueryResult(modelName string, merged map[bucketKey]counters) QueryResult {
	groupBuckets := map[string]map[int64]counters{}
	modelBuckets := map[string]map[int64]counters{}
	for key, value := range merged {
		if value.requestCount == 0 {
			continue
		}
		if _, ok := groupBuckets[key.group]; !ok {
			groupBuckets[key.group] = map[int64]counters{}
		}
		groupBuckets[key.group][key.bucketTs] = value
		mergeModelBucket(modelBuckets, modelName, key.bucketTs, value)
	}

	groups := make([]string, 0, len(groupBuckets))
	for group := range groupBuckets {
		groups = append(groups, group)
	}
	sort.Strings(groups)

	all := counters{}
	results := make([]GroupResult, 0, len(groups))
	for _, group := range groups {
		buckets := groupBuckets[group]
		timestamps := make([]int64, 0, len(buckets))
		for ts := range buckets {
			timestamps = append(timestamps, ts)
		}
		sort.Slice(timestamps, func(i, j int) bool {
			return timestamps[i] < timestamps[j]
		})

		total := counters{}
		series := make([]BucketPoint, 0, len(timestamps))
		for _, ts := range timestamps {
			value := buckets[ts]
			total.requestCount += value.requestCount
			total.successCount += value.successCount
			total.totalLatencyMs += value.totalLatencyMs
			total.ttftSumMs += value.ttftSumMs
			total.ttftCount += value.ttftCount
			total.outputTokens += value.outputTokens
			total.generationMs += value.generationMs
			total.tpsCount += value.tpsCount
			total.promptTokens += value.promptTokens
			total.cachedTokens += value.cachedTokens
			series = append(series, bucketPoint(ts, value))
		}
		all.requestCount += total.requestCount
		all.successCount += total.successCount
		all.totalLatencyMs += total.totalLatencyMs
		all.outputTokens += total.outputTokens
		all.generationMs += total.generationMs
		all.tpsCount += total.tpsCount
		all.promptTokens += total.promptTokens
		all.cachedTokens += total.cachedTokens

		results = append(results, GroupResult{
			Group:           group,
			AvgTtftMs:       avg(total.ttftSumMs, total.ttftCount),
			AvgLatencyMs:    avg(total.totalLatencyMs, total.requestCount),
			SuccessRate:     successRate(total),
			AvgTps:          avgTps(total),
			TpsInsufficient: isThroughputInsufficient(total, modelName),
			CacheHitRate:    cacheHitRate(total),
			Series:          series,
		})
	}

	modelSeries := make([]BucketPoint, 0, len(modelBuckets[modelName]))
	for ts, value := range modelBuckets[modelName] {
		modelSeries = append(modelSeries, bucketPoint(ts, value))
	}
	sort.Slice(modelSeries, func(i, j int) bool {
		return modelSeries[i].Ts < modelSeries[j].Ts
	})

	return QueryResult{
		ModelName:    modelName,
		SeriesSchema: seriesSchema,
		Summary:      summarize(all, modelName),
		Series:       modelSeries,
		Groups:       results,
	}
}

// summarize returns nil when nothing was sampled, so clients can show
// "no data" instead of a fabricated 0% success rate.
func summarize(total counters, modelName string) *Summary {
	if total.requestCount <= 0 {
		return nil
	}
	return &Summary{
		AvgLatencyMs:    avg(total.totalLatencyMs, total.requestCount),
		SuccessRate:     math.Round(successRate(total)*100) / 100,
		AvgTps:          math.Round(avgTps(total)*100) / 100,
		TpsInsufficient: isThroughputInsufficient(total, modelName),
		CacheHitRate:    cacheHitRate(total),
	}
}

func bucketPoint(ts int64, value counters) BucketPoint {
	return BucketPoint{
		Ts:           ts,
		AvgTtftMs:    avg(value.ttftSumMs, value.ttftCount),
		AvgLatencyMs: avg(value.totalLatencyMs, value.requestCount),
		SuccessRate:  successRate(value),
		AvgTps:       avgTps(value),
		CacheHitRate: cacheHitRate(value),
	}
}

func avg(sum int64, count int64) int64 {
	if count <= 0 {
		return 0
	}
	return sum / count
}

func successRate(value counters) float64 {
	if value.requestCount <= 0 {
		return 0
	}
	return float64(value.successCount) / float64(value.requestCount) * 100
}

func hasSufficientThroughputSamples(value counters) bool {
	return value.tpsCount >= MinThroughputSamples && value.outputTokens > 0 && value.generationMs > 0
}

func avgTps(value counters) float64 {
	if !hasSufficientThroughputSamples(value) {
		return 0
	}
	return float64(value.outputTokens) / (float64(value.generationMs) / 1000)
}

func isThroughputInsufficient(value counters, modelName string) bool {
	if value.requestCount <= 0 || hasSufficientThroughputSamples(value) {
		return false
	}
	if value.tpsCount > 0 {
		return true
	}
	if modelName == "" {
		return true
	}
	return ClassifyModelKind(modelName) == ModelKindText
}

func cacheHitRate(value counters) *float64 {
	if value.promptTokens <= 0 {
		return nil
	}
	cached := min(max(value.cachedTokens, 0), value.promptTokens)
	rate := math.Round(float64(cached)/float64(value.promptTokens)*10000) / 100
	return &rate
}

func recordRedis(key bucketKey, sample Sample) {
	if !common.RedisEnabled || common.RDB == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	redisKey := redisBucketKey(key)
	pipe := common.RDB.TxPipeline()
	pipe.HIncrBy(ctx, redisKey, "req", 1)
	if sample.Success {
		pipe.HIncrBy(ctx, redisKey, "ok", 1)
	}
	if sample.LatencyMs > 0 {
		pipe.HIncrBy(ctx, redisKey, "lat", sample.LatencyMs)
	}
	if sample.HasTtft && sample.TtftMs >= 0 {
		pipe.HIncrBy(ctx, redisKey, "ttft", sample.TtftMs)
		pipe.HIncrBy(ctx, redisKey, "ttft_n", 1)
	}
	if sample.OutputTokens > 0 && sample.GenerationMs > 0 {
		pipe.HIncrBy(ctx, redisKey, "out", sample.OutputTokens)
		pipe.HIncrBy(ctx, redisKey, "gen_ms", sample.GenerationMs)
		pipe.HIncrBy(ctx, redisKey, "tps_n", 1)
	}
	if sample.PromptTokens > 0 {
		cached := min(max(sample.CachedTokens, 0), sample.PromptTokens)
		pipe.HIncrBy(ctx, redisKey, "in", sample.PromptTokens)
		if cached > 0 {
			pipe.HIncrBy(ctx, redisKey, "cache_in", cached)
		}
	}
	pipe.Expire(ctx, redisKey, time.Hour)
	_, _ = pipe.Exec(ctx)
}

func mergeRedisActiveBuckets(merged map[bucketKey]counters, params QueryParams, startTs int64, endTs int64) {
	if !common.RedisEnabled || common.RDB == nil || params.Model == "" || params.Group == "" {
		return
	}
	active := bucketStart(time.Now().Unix())
	if active < startTs || active > endTs {
		return
	}
	key := bucketKey{model: params.Model, group: params.Group, bucketTs: active}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	values, err := common.RDB.HGetAll(ctx, redisBucketKey(key)).Result()
	if err != nil || len(values) == 0 {
		return
	}
	mergeCounters(merged, key, redisCounters(values))
}

func redisBucketKey(key bucketKey) string {
	return fmt.Sprintf("perf:%s:%s:%d", key.model, key.group, key.bucketTs)
}
