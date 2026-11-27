package model

import (
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// PerfMetric stores aggregated relay performance metrics for the model square.
type PerfMetric struct {
	Id             int    `json:"id" gorm:"primaryKey"`
	ModelName      string `json:"model_name" gorm:"size:128;uniqueIndex:idx_perf_model_group_bucket,priority:1"`
	Group          string `json:"group" gorm:"column:group;size:64;uniqueIndex:idx_perf_model_group_bucket,priority:2"`
	BucketTs       int64  `json:"bucket_ts" gorm:"uniqueIndex:idx_perf_model_group_bucket,priority:3;index:idx_perf_bucket_ts"`
	RequestCount   int64  `json:"-" gorm:"default:0"`
	SuccessCount   int64  `json:"-" gorm:"default:0"`
	TotalLatencyMs int64  `json:"-" gorm:"default:0"`
	TtftSumMs      int64  `json:"-" gorm:"default:0"`
	TtftCount      int64  `json:"-" gorm:"default:0"`
	OutputTokens   int64  `json:"-" gorm:"default:0"`
	GenerationMs   int64  `json:"-" gorm:"default:0"`
	TpsCount       int64  `json:"-" gorm:"default:0"`
	PromptTokens   int64  `json:"-" gorm:"default:0"`
	CachedTokens   int64  `json:"-" gorm:"default:0"`
}

func (PerfMetric) TableName() string {
	return "perf_metrics"
}

func UpsertPerfMetric(metric *PerfMetric) error {
	if metric == nil || metric.RequestCount == 0 {
		return nil
	}
	return DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "model_name"},
			{Name: "group"},
			{Name: "bucket_ts"},
		},
		DoUpdates: clause.Assignments(map[string]any{
			"request_count":    gorm.Expr("perf_metrics.request_count + ?", metric.RequestCount),
			"success_count":    gorm.Expr("perf_metrics.success_count + ?", metric.SuccessCount),
			"total_latency_ms": gorm.Expr("perf_metrics.total_latency_ms + ?", metric.TotalLatencyMs),
			"ttft_sum_ms":      gorm.Expr("perf_metrics.ttft_sum_ms + ?", metric.TtftSumMs),
			"ttft_count":       gorm.Expr("perf_metrics.ttft_count + ?", metric.TtftCount),
			"output_tokens":    gorm.Expr("perf_metrics.output_tokens + ?", metric.OutputTokens),
			"generation_ms":    gorm.Expr("perf_metrics.generation_ms + ?", metric.GenerationMs),
			"tps_count":        gorm.Expr("perf_metrics.tps_count + ?", metric.TpsCount),
			"prompt_tokens":    gorm.Expr("perf_metrics.prompt_tokens + ?", metric.PromptTokens),
			"cached_tokens":    gorm.Expr("perf_metrics.cached_tokens + ?", metric.CachedTokens),
		}),
	}).Create(metric).Error
}

func GetPerfMetrics(modelName string, group string, startTs int64, endTs int64) ([]PerfMetric, error) {
	var metrics []PerfMetric
	query := DB.Model(&PerfMetric{}).
		Where("model_name = ? AND bucket_ts >= ? AND bucket_ts <= ?", modelName, startTs, endTs)
	if group != "" {
		query = query.Where(commonGroupCol+" = ?", group)
	}
	err := query.Order("bucket_ts ASC").Find(&metrics).Error
	return metrics, err
}

type PerfMetricSummary struct {
	ModelName      string `json:"model_name"`
	RequestCount   int64  `json:"request_count"`
	SuccessCount   int64  `json:"success_count"`
	TotalLatencyMs int64  `json:"total_latency_ms"`
	OutputTokens   int64  `json:"output_tokens"`
	GenerationMs   int64  `json:"generation_ms"`
	TpsCount       int64  `json:"tps_count"`
	PromptTokens   int64  `json:"prompt_tokens"`
	CachedTokens   int64  `json:"cached_tokens"`
}

type PerfMetricSummaryBucket struct {
	ModelName      string `json:"model_name"`
	BucketTs       int64  `json:"bucket_ts"`
	RequestCount   int64  `json:"request_count"`
	SuccessCount   int64  `json:"success_count"`
	TotalLatencyMs int64  `json:"total_latency_ms"`
	OutputTokens   int64  `json:"output_tokens"`
	GenerationMs   int64  `json:"generation_ms"`
	TpsCount       int64  `json:"tps_count"`
	PromptTokens   int64  `json:"prompt_tokens"`
	CachedTokens   int64  `json:"cached_tokens"`
}

type PerfMetricSummaryGroupBucket struct {
	ModelName      string `gorm:"column:model_name" json:"model_name"`
	Group          string `gorm:"column:group_name" json:"group"`
	BucketTs       int64  `gorm:"column:bucket_ts" json:"bucket_ts"`
	RequestCount   int64  `gorm:"column:request_count" json:"request_count"`
	SuccessCount   int64  `gorm:"column:success_count" json:"success_count"`
	TotalLatencyMs int64  `gorm:"column:total_latency_ms" json:"total_latency_ms"`
	OutputTokens   int64  `gorm:"column:output_tokens" json:"output_tokens"`
	GenerationMs   int64  `gorm:"column:generation_ms" json:"generation_ms"`
	TpsCount       int64  `gorm:"column:tps_count" json:"tps_count"`
	PromptTokens   int64  `json:"prompt_tokens"`
	CachedTokens   int64  `json:"cached_tokens"`
}

type PerfMetricModelGroupCount struct {
	ModelName    string `gorm:"column:model_name" json:"model_name"`
	Group        string `gorm:"column:group_name" json:"group"`
	RequestCount int64  `gorm:"column:request_count" json:"request_count"`
}

func GetPerfMetricsModelGroupCounts(startTs int64, endTs int64, groups []string) ([]PerfMetricModelGroupCount, error) {
	var counts []PerfMetricModelGroupCount
	if DB == nil {
		return counts, nil
	}
	query := DB.Model(&PerfMetric{}).
		Select("model_name, "+commonGroupCol+" AS group_name, SUM(request_count) AS request_count").
		Where("bucket_ts >= ? AND bucket_ts <= ?", startTs, endTs)
	if groups != nil {
		if len(groups) == 0 {
			return counts, nil
		}
		query = query.Where(commonGroupCol+" IN ?", groups)
	}
	err := query.
		Group("model_name, " + commonGroupCol).
		Having("SUM(request_count) > 0").
		Find(&counts).Error
	return counts, err
}

type PerfMetricGroupBucket struct {
	Group          string `gorm:"column:group_name" json:"group"`
	BucketTs       int64  `gorm:"column:bucket_ts" json:"bucket_ts"`
	RequestCount   int64  `gorm:"column:request_count" json:"request_count"`
	SuccessCount   int64  `gorm:"column:success_count" json:"success_count"`
	TotalLatencyMs int64  `gorm:"column:total_latency_ms" json:"total_latency_ms"`
	TtftSumMs      int64  `gorm:"column:ttft_sum_ms" json:"ttft_sum_ms"`
	TtftCount      int64  `gorm:"column:ttft_count" json:"ttft_count"`
	OutputTokens   int64  `gorm:"column:output_tokens" json:"output_tokens"`
	GenerationMs   int64  `gorm:"column:generation_ms" json:"generation_ms"`
	TpsCount       int64  `gorm:"column:tps_count" json:"tps_count"`
	PromptTokens   int64  `gorm:"column:prompt_tokens" json:"prompt_tokens"`
	CachedTokens   int64  `gorm:"column:cached_tokens" json:"cached_tokens"`
}

func perfMetricGroupCol() string {
	if commonGroupCol != "" {
		return commonGroupCol
	}
	if DB != nil && DB.Dialector != nil && DB.Dialector.Name() == "postgres" {
		return `"group"`
	}
	return "`group`"
}

func GetPerfMetricsGroupBuckets(startTs int64, endTs int64, groups []string) ([]PerfMetricGroupBucket, error) {
	var rows []PerfMetricGroupBucket
	if DB == nil {
		return rows, nil
	}
	groupCol := perfMetricGroupCol()
	query := DB.Model(&PerfMetric{}).
		Select(groupCol+" AS group_name, bucket_ts, SUM(request_count) AS request_count, SUM(success_count) AS success_count, SUM(total_latency_ms) AS total_latency_ms, SUM(ttft_sum_ms) AS ttft_sum_ms, SUM(ttft_count) AS ttft_count, SUM(output_tokens) AS output_tokens, SUM(generation_ms) AS generation_ms, SUM(tps_count) AS tps_count, SUM(prompt_tokens) AS prompt_tokens, SUM(cached_tokens) AS cached_tokens").
		Where("bucket_ts >= ? AND bucket_ts <= ?", startTs, endTs)
	if groups != nil {
		if len(groups) == 0 {
			return rows, nil
		}
		query = query.Where(groupCol+" IN ?", groups)
	}
	err := query.
		Group(groupCol + ", bucket_ts").
		Having("SUM(request_count) > 0").
		Order("bucket_ts ASC").
		Find(&rows).Error
	return rows, err
}

type PerfMetricGroupModelSummary struct {
	Group          string `gorm:"column:group_name" json:"group"`
	ModelName      string `gorm:"column:model_name" json:"model_name"`
	RequestCount   int64  `gorm:"column:request_count" json:"request_count"`
	SuccessCount   int64  `gorm:"column:success_count" json:"success_count"`
	TotalLatencyMs int64  `gorm:"column:total_latency_ms" json:"total_latency_ms"`
	TtftSumMs      int64  `gorm:"column:ttft_sum_ms" json:"ttft_sum_ms"`
	TtftCount      int64  `gorm:"column:ttft_count" json:"ttft_count"`
	OutputTokens   int64  `gorm:"column:output_tokens" json:"output_tokens"`
	GenerationMs   int64  `gorm:"column:generation_ms" json:"generation_ms"`
	TpsCount       int64  `gorm:"column:tps_count" json:"tps_count"`
	PromptTokens   int64  `gorm:"column:prompt_tokens" json:"prompt_tokens"`
	CachedTokens   int64  `gorm:"column:cached_tokens" json:"cached_tokens"`
}

func GetPerfMetricsGroupModelSummaries(startTs int64, endTs int64, groups []string) ([]PerfMetricGroupModelSummary, error) {
	var rows []PerfMetricGroupModelSummary
	if DB == nil {
		return rows, nil
	}
	groupCol := perfMetricGroupCol()
	query := DB.Model(&PerfMetric{}).
		Select(groupCol+" AS group_name, model_name, SUM(request_count) AS request_count, SUM(success_count) AS success_count, SUM(total_latency_ms) AS total_latency_ms, SUM(ttft_sum_ms) AS ttft_sum_ms, SUM(ttft_count) AS ttft_count, SUM(output_tokens) AS output_tokens, SUM(generation_ms) AS generation_ms, SUM(tps_count) AS tps_count, SUM(prompt_tokens) AS prompt_tokens, SUM(cached_tokens) AS cached_tokens").
		Where("bucket_ts >= ? AND bucket_ts <= ?", startTs, endTs)
	if groups != nil {
		if len(groups) == 0 {
			return rows, nil
		}
		query = query.Where(groupCol+" IN ?", groups)
	}
	err := query.
		Group(groupCol + ", model_name").
		Having("SUM(request_count) > 0").
		Find(&rows).Error
	return rows, err
}

type groupEnabledModelCountRow struct {
	Group      string `gorm:"column:group_name"`
	ModelCount int    `gorm:"column:model_count"`
}

func GetEnabledModelCountsByGroup(groups []string) (map[string]int, error) {
	result := make(map[string]int)
	if DB == nil {
		return result, nil
	}
	groupCol := perfMetricGroupCol()
	query := DB.Model(&Ability{}).
		Select(groupCol+" AS group_name, COUNT(DISTINCT model) AS model_count").
		Where("enabled = ?", true)
	if groups != nil {
		if len(groups) == 0 {
			return result, nil
		}
		query = query.Where(groupCol+" IN ?", groups)
	}
	var rows []groupEnabledModelCountRow
	if err := query.Group(groupCol).Find(&rows).Error; err != nil {
		return result, err
	}
	for _, row := range rows {
		result[row.Group] = row.ModelCount
	}
	return result, nil
}

type groupEnabledModelRow struct {
	Group string `gorm:"column:group_name"`
	Model string `gorm:"column:model"`
}

func GetEnabledModelsByGroup(groups []string) (map[string][]string, error) {
	result := make(map[string][]string)
	if DB == nil {
		return result, nil
	}
	groupCol := perfMetricGroupCol()
	query := DB.Model(&Ability{}).
		Select(groupCol+" AS group_name, model").
		Where("enabled = ?", true)
	if groups != nil {
		if len(groups) == 0 {
			return result, nil
		}
		query = query.Where(groupCol+" IN ?", groups)
	}
	var rows []groupEnabledModelRow
	if err := query.Group(groupCol + ", model").Find(&rows).Error; err != nil {
		return result, err
	}
	for _, row := range rows {
		result[row.Group] = append(result[row.Group], row.Model)
	}
	return result, nil
}

type ModelCapabilityHint struct {
	Tags      string
	Endpoints []string
}

// GetModelCapabilityHintsByNames resolves optional Model metadata tags and
// declared endpoints for the requested model names, matching Model Plaza rules.
func GetModelCapabilityHintsByNames(names []string) map[string]ModelCapabilityHint {
	hints := make(map[string]ModelCapabilityHint)
	if DB == nil || len(names) == 0 || !DB.Migrator().HasTable(&Model{}) {
		return hints
	}
	var allMeta []Model
	if err := DB.Select("id", "model_name", "tags", "endpoints", "name_rule", "status").Find(&allMeta).Error; err != nil || len(allMeta) == 0 {
		return hints
	}
	resolved := resolveModelMetadata(allMeta, names)
	for modelName, meta := range resolved {
		if meta == nil {
			continue
		}
		endpoints, _ := declaredEndpointNames(meta.Endpoints)
		hints[modelName] = ModelCapabilityHint{
			Tags:      meta.Tags,
			Endpoints: endpoints,
		}
	}
	return hints
}

func GetPerfMetricsSummaryAll(startTs int64, endTs int64, groups []string) ([]PerfMetricSummary, error) {
	var summaries []PerfMetricSummary
	query := DB.Model(&PerfMetric{}).
		Select("model_name, SUM(request_count) as request_count, SUM(success_count) as success_count, SUM(total_latency_ms) as total_latency_ms, SUM(output_tokens) as output_tokens, SUM(generation_ms) as generation_ms, SUM(tps_count) as tps_count, SUM(prompt_tokens) as prompt_tokens, SUM(cached_tokens) as cached_tokens").
		Where("bucket_ts >= ? AND bucket_ts <= ?", startTs, endTs)
	if groups != nil {
		if len(groups) == 0 {
			return summaries, nil
		}
		query = query.Where(commonGroupCol+" IN ?", groups)
	}
	err := query.
		Group("model_name").
		Having("SUM(request_count) > 0").
		Find(&summaries).Error
	return summaries, err
}

func GetPerfMetricsSummaryBucketsAll(startTs int64, endTs int64, groups []string) ([]PerfMetricSummaryBucket, error) {
	var summaries []PerfMetricSummaryBucket
	query := DB.Model(&PerfMetric{}).
		Select("model_name, bucket_ts, SUM(request_count) as request_count, SUM(success_count) as success_count, SUM(total_latency_ms) as total_latency_ms, SUM(output_tokens) as output_tokens, SUM(generation_ms) as generation_ms, SUM(tps_count) as tps_count, SUM(prompt_tokens) as prompt_tokens, SUM(cached_tokens) as cached_tokens").
		Where("bucket_ts >= ? AND bucket_ts <= ?", startTs, endTs)
	if groups != nil {
		if len(groups) == 0 {
			return summaries, nil
		}
		query = query.Where(commonGroupCol+" IN ?", groups)
	}
	err := query.
		Group("model_name, bucket_ts").
		Having("SUM(request_count) > 0").
		Order("bucket_ts ASC").
		Find(&summaries).Error
	return summaries, err
}

func GetPerfMetricsSummaryGroupBucketsAll(startTs int64, endTs int64, groups []string) ([]PerfMetricSummaryGroupBucket, error) {
	var summaries []PerfMetricSummaryGroupBucket
	if DB == nil {
		return summaries, nil
	}
	groupCol := perfMetricGroupCol()
	query := DB.Model(&PerfMetric{}).
		Select("model_name, "+groupCol+" AS group_name, bucket_ts, SUM(request_count) as request_count, SUM(success_count) as success_count, SUM(total_latency_ms) as total_latency_ms, SUM(output_tokens) as output_tokens, SUM(generation_ms) as generation_ms, SUM(tps_count) as tps_count, SUM(prompt_tokens) as prompt_tokens, SUM(cached_tokens) as cached_tokens").
		Where("bucket_ts >= ? AND bucket_ts <= ?", startTs, endTs)
	if groups != nil {
		if len(groups) == 0 {
			return summaries, nil
		}
		query = query.Where(groupCol+" IN ?", groups)
	}
	err := query.
		Group("model_name, " + groupCol + ", bucket_ts").
		Having("SUM(request_count) > 0").
		Order("bucket_ts ASC").
		Find(&summaries).Error
	return summaries, err
}

func GetRecentPerfMetricSuccessGroupBuckets(modelName string, startTs int64, endTs int64, groups []string) ([]PerfMetricSummaryGroupBucket, error) {
	if DB == nil || modelName == "" || (groups != nil && len(groups) == 0) {
		return nil, nil
	}
	groupCol := perfMetricGroupCol()
	const hourBucket = "bucket_ts - (bucket_ts % 3600)"
	query := DB.Model(&PerfMetric{}).
		Select("model_name, "+groupCol+" AS group_name, "+hourBucket+" AS bucket_ts, SUM(request_count) AS request_count, SUM(success_count) AS success_count").
		Where("model_name = ? AND bucket_ts >= ? AND bucket_ts <= ? AND request_count > 0", modelName, startTs, endTs)
	if groups != nil {
		query = query.Where(groupCol+" IN ?", groups)
	}
	var buckets []PerfMetricSummaryGroupBucket
	err := query.Group("model_name, " + groupCol + ", " + hourBucket).
		Order("bucket_ts DESC").
		Find(&buckets).Error
	return buckets, err
}

// GetRecentPerfMetricSuccessBuckets reads the latest nonempty hours within
// the supplied history window, independently of the summary's reporting window.
func GetRecentPerfMetricSuccessBuckets(modelName string, startTs int64, endTs int64, groups []string, limit int) ([]PerfMetricSummaryBucket, error) {
	if modelName == "" || limit <= 0 || (groups != nil && len(groups) == 0) {
		return nil, nil
	}
	const hourBucket = "bucket_ts - (bucket_ts % 3600)"
	query := DB.Model(&PerfMetric{}).
		Select("model_name, "+hourBucket+" AS bucket_ts, SUM(request_count) AS request_count, SUM(success_count) AS success_count").
		Where("model_name = ? AND bucket_ts >= ? AND bucket_ts <= ? AND request_count > 0", modelName, startTs, endTs)
	if groups != nil {
		query = query.Where(commonGroupCol+" IN ?", groups)
	}
	var buckets []PerfMetricSummaryBucket
	err := query.Group("model_name, " + hourBucket).
		Order("bucket_ts DESC").Limit(limit).Find(&buckets).Error
	return buckets, err
}

func DeletePerfMetricsBefore(cutoffTs int64) error {
	if cutoffTs <= 0 {
		return nil
	}
	return DB.Where("bucket_ts < ?", cutoffTs).Delete(&PerfMetric{}).Error
}

func PerfMetricStartTime(hours int) int64 {
	if hours <= 0 {
		hours = 24
	}
	return time.Now().Add(-time.Duration(hours) * time.Hour).Unix()
}
