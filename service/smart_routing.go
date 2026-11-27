package service

import (
	"cmp"
	"math"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

const (
	smartRoutingSnapshotTTL = 15 * time.Second
	smartRoutingPriorTotal  = 10.0
	smartRoutingPriorRate   = 94.0
	smartRoutingAdminBoost  = 0.08
)

var smartRoutingNonReasoningPathHints = []string{
	"/images/",
	"/videos",
	"/audio/",
	"/embeddings",
	"/rerank",
	"/moderations",
	"/mj/",
	"/suno/",
	"/kling/",
	"/vidu/",
	"/jimeng/",
	"/luma/",
	"/runway/",
}

type smartRoutingTelemetryCache struct {
	mu                   sync.RWMutex
	expiresAt            time.Time
	shortHours           int
	longHours            int
	shortSnap            perfmetrics.RoutingMetricsSnapshot
	longSnap             perfmetrics.RoutingMetricsSnapshot
	enabledModelsByGroup map[string][]string
	capabilityHints      map[string]model.ModelCapabilityHint
}

var smartTelemetryCache = &smartRoutingTelemetryCache{}

func init() {
	setting.RegisterSmartRoutingChangeHook(InvalidateSmartRoutingCache)
}

func InvalidateSmartRoutingCache() {
	smartTelemetryCache.mu.Lock()
	smartTelemetryCache.expiresAt = time.Time{}
	smartTelemetryCache.mu.Unlock()
}

type SmartRoutingCandidateInput struct {
	Group          string
	EffectiveRatio float64
	ShortModel     *perfmetrics.RoutingMetric
	ShortGroup     *perfmetrics.RoutingMetric
	LongModel      *perfmetrics.RoutingMetric
	LongGroup      *perfmetrics.RoutingMetric
	Probe          *perfmetrics.GroupProbeSummary
	NowUnix        int64
}

type SmartRoutingRankedCandidate struct {
	Group               string   `json:"group"`
	EffectiveRatio      float64  `json:"effective_ratio"`
	Tier                string   `json:"tier"`
	Score               float64  `json:"score"`
	EffectiveSuccess    float64  `json:"effective_success_rate"`
	SmoothedReliability float64  `json:"smoothed_reliability"`
	EffectiveSamples    int64    `json:"effective_samples"`
	AvgTtftMs           int64    `json:"avg_ttft_ms"`
	AvgTps              float64  `json:"avg_tps"`
	CacheHitRate        *float64 `json:"cache_hit_rate,omitempty"`
	IsIdle              bool     `json:"is_idle,omitempty"`
	tierRank            int
	adminOrder          int
}

type SmartRoutingSampleRoute struct {
	Model  string  `json:"model"`
	Group  string  `json:"group"`
	Ratio  float64 `json:"ratio"`
	Status string  `json:"status"`
}

type SmartRoutingPolicySummary struct {
	ID                 string                    `json:"id"`
	Available          bool                      `json:"available"`
	ReasoningOnly      bool                      `json:"reasoning_only"`
	MinRatio           *float64                  `json:"min_ratio,omitempty"`
	MaxRatio           *float64                  `json:"max_ratio,omitempty"`
	EligibleGroupCount int                       `json:"eligible_group_count"`
	ModelCount         int                       `json:"model_count"`
	SampleRoutes       []SmartRoutingSampleRoute `json:"sample_routes,omitempty"`
}

type SmartRoutingPoliciesResponse struct {
	Enabled  bool                        `json:"enabled"`
	Policies []SmartRoutingPolicySummary `json:"policies"`
}

type SmartRoutingModelPreview struct {
	Model          string                        `json:"model"`
	CostFirst      []SmartRoutingRankedCandidate `json:"cost_first"`
	StabilityFirst []SmartRoutingRankedCandidate `json:"stability_first"`
}

type SmartRoutingPreviewResponse struct {
	Config SmartRoutingConfigPreviewMeta `json:"meta"`
	Models []SmartRoutingModelPreview    `json:"models"`
}

type SmartRoutingConfigPreviewMeta struct {
	ShortWindowHours   int `json:"short_window_hours"`
	LongWindowHours    int `json:"long_window_hours"`
	EligibleGroupCount int `json:"eligible_group_count"`
	ModelCount         int `json:"model_count"`
}

func IsNonReasoningRequestPath(requestPath string) bool {
	lower := strings.ToLower(strings.TrimSpace(requestPath))
	if lower == "" {
		return false
	}
	for _, hint := range smartRoutingNonReasoningPathHints {
		if strings.Contains(lower, hint) {
			return true
		}
	}
	return false
}

// IsReasoningModelForSmartPolicy checks whether a model belongs to reasoning/text
// generation capabilities using the Model Plaza capability classifier.
func IsReasoningModelForSmartPolicy(modelName string, requestPath string) bool {
	if IsNonReasoningRequestPath(requestPath) {
		return false
	}
	trimmed := strings.TrimSpace(modelName)
	if trimmed == "" {
		return true
	}
	_, _, _, hints := getSmartRoutingTelemetry(setting.GetSmartRoutingConfig())
	return isModelReasoningWithHints(trimmed, hints)
}

func isModelReasoningWithHints(modelName string, hints map[string]model.ModelCapabilityHint) bool {
	trimmed := strings.TrimSpace(modelName)
	if trimmed == "" {
		return false
	}
	hint, ok := hints[trimmed]
	if !ok {
		if normalized := ratio_setting.RoutingMatchModelName(trimmed); normalized != "" && normalized != trimmed {
			hint = hints[normalized]
		}
	}
	caps := perfmetrics.ClassifyModelCapabilities(trimmed, hint.Tags, hint.Endpoints)
	return slices.Contains(caps, perfmetrics.ModelKindText)
}

func getSmartRoutingTelemetry(cfg setting.SmartRoutingConfig) (
	perfmetrics.RoutingMetricsSnapshot,
	perfmetrics.RoutingMetricsSnapshot,
	map[string][]string,
	map[string]model.ModelCapabilityHint,
) {
	now := time.Now()
	smartTelemetryCache.mu.RLock()
	if now.Before(smartTelemetryCache.expiresAt) &&
		smartTelemetryCache.shortHours == cfg.ShortWindowHours &&
		smartTelemetryCache.longHours == cfg.LongWindowHours {
		shortSnap := smartTelemetryCache.shortSnap
		longSnap := smartTelemetryCache.longSnap
		modelsByGroup := smartTelemetryCache.enabledModelsByGroup
		hints := smartTelemetryCache.capabilityHints
		smartTelemetryCache.mu.RUnlock()
		return shortSnap, longSnap, modelsByGroup, hints
	}
	smartTelemetryCache.mu.RUnlock()

	billingGroups := ratio_setting.GetBillingGroupNames()
	shortSnap, _ := perfmetrics.QueryRoutingMetrics(cfg.ShortWindowHours, billingGroups)
	longSnap, _ := perfmetrics.QueryRoutingMetrics(cfg.LongWindowHours, billingGroups)
	modelsByGroup, err := model.GetEnabledModelsByGroup(billingGroups)
	if err != nil {
		modelsByGroup = map[string][]string{}
	}
	modelNameSet := make(map[string]struct{})
	for _, models := range modelsByGroup {
		for _, modelName := range models {
			if modelName != "" {
				modelNameSet[modelName] = struct{}{}
			}
		}
	}
	allModelNames := make([]string, 0, len(modelNameSet))
	for name := range modelNameSet {
		allModelNames = append(allModelNames, name)
	}
	hints := model.GetModelCapabilityHintsByNames(allModelNames)

	smartTelemetryCache.mu.Lock()
	smartTelemetryCache.shortHours = cfg.ShortWindowHours
	smartTelemetryCache.longHours = cfg.LongWindowHours
	smartTelemetryCache.shortSnap = shortSnap
	smartTelemetryCache.longSnap = longSnap
	smartTelemetryCache.enabledModelsByGroup = modelsByGroup
	smartTelemetryCache.capabilityHints = hints
	smartTelemetryCache.expiresAt = now.Add(smartRoutingSnapshotTTL)
	smartTelemetryCache.mu.Unlock()

	return shortSnap, longSnap, modelsByGroup, hints
}

type blendedWindowMetric struct {
	samples      int64
	successRate  float64
	avgTtftMs    int64
	avgTps       float64
	cacheHitRate *float64
}

func blendModelAndGroupMetric(modelMetric, groupMetric *perfmetrics.RoutingMetric) blendedWindowMetric {
	hasModel := modelMetric != nil && modelMetric.RequestCount > 0
	hasGroup := groupMetric != nil && groupMetric.RequestCount > 0
	if !hasModel && !hasGroup {
		return blendedWindowMetric{}
	}
	if hasModel && !hasGroup {
		tps := 0.0
		if !modelMetric.TpsInsufficient {
			tps = modelMetric.AvgTps
		}
		return blendedWindowMetric{
			samples:      modelMetric.RequestCount,
			successRate:  modelMetric.SuccessRate,
			avgTtftMs:    modelMetric.AvgTtftMs,
			avgTps:       tps,
			cacheHitRate: modelMetric.CacheHitRate,
		}
	}
	if !hasModel && hasGroup {
		tps := 0.0
		if !groupMetric.TpsInsufficient {
			tps = groupMetric.AvgTps
		}
		return blendedWindowMetric{
			samples:      min(groupMetric.RequestCount, 20),
			successRate:  groupMetric.SuccessRate,
			avgTtftMs:    groupMetric.AvgTtftMs,
			avgTps:       tps,
			cacheHitRate: groupMetric.CacheHitRate,
		}
	}

	weight := math.Min(float64(modelMetric.RequestCount)/20.0, 1.0)
	rate := weight*modelMetric.SuccessRate + (1-weight)*groupMetric.SuccessRate

	ttft := modelMetric.AvgTtftMs
	if ttft <= 0 {
		ttft = groupMetric.AvgTtftMs
	} else if groupMetric.AvgTtftMs > 0 {
		ttft = int64(math.Round(weight*float64(modelMetric.AvgTtftMs) + (1-weight)*float64(groupMetric.AvgTtftMs)))
	}

	modelTps := 0.0
	if !modelMetric.TpsInsufficient {
		modelTps = modelMetric.AvgTps
	}
	groupTps := 0.0
	if !groupMetric.TpsInsufficient {
		groupTps = groupMetric.AvgTps
	}
	tps := modelTps
	if tps <= 0 {
		tps = groupTps
	} else if groupTps > 0 {
		tps = weight*modelTps + (1-weight)*groupTps
	}

	var cacheRate *float64
	if modelMetric.CacheHitRate != nil && groupMetric.CacheHitRate != nil {
		val := weight*(*modelMetric.CacheHitRate) + (1-weight)*(*groupMetric.CacheHitRate)
		cacheRate = &val
	} else if modelMetric.CacheHitRate != nil {
		val := *modelMetric.CacheHitRate
		cacheRate = &val
	} else if groupMetric.CacheHitRate != nil {
		val := *groupMetric.CacheHitRate
		cacheRate = &val
	}

	samples := modelMetric.RequestCount
	if samples < 5 {
		samples = max(samples, min(groupMetric.RequestCount, 10))
	}
	return blendedWindowMetric{
		samples:      samples,
		successRate:  rate,
		avgTtftMs:    ttft,
		avgTps:       tps,
		cacheHitRate: cacheRate,
	}
}

// RankSmartRoutingCandidates scores and sorts eligible groups for one model
// according to the requested built-in policy ("cost_first" or "stability_first").
func RankSmartRoutingCandidates(
	policy string,
	cfg setting.SmartRoutingConfig,
	inputs []SmartRoutingCandidateInput,
) []SmartRoutingRankedCandidate {
	if len(inputs) == 0 {
		return nil
	}

	pinnedSet := make(map[string]struct{}, len(cfg.PinnedGroups))
	for _, g := range cfg.PinnedGroups {
		pinnedSet[g] = struct{}{}
	}
	demotedSet := make(map[string]struct{}, len(cfg.DemotedGroups))
	for _, g := range cfg.DemotedGroups {
		demotedSet[g] = struct{}{}
	}

	ranked := make([]SmartRoutingRankedCandidate, 0, len(inputs))
	shortWindowSec := int64(max(cfg.ShortWindowHours, 1)) * 3600

	for _, input := range inputs {
		shortMetric := blendModelAndGroupMetric(input.ShortModel, input.ShortGroup)
		longMetric := blendModelAndGroupMetric(input.LongModel, input.LongGroup)

		nowUnix := input.NowUnix
		if nowUnix <= 0 {
			nowUnix = time.Now().Unix()
		}
		probeFresh := input.Probe != nil && input.Probe.RecentSamples > 0 &&
			(input.Probe.LastTestedAt <= 0 || nowUnix-input.Probe.LastTestedAt <= shortWindowSec)

		var (
			effectiveSuccess float64
			effectiveSamples int64
			avgTtftMs        int64
			avgTps           float64
			cacheHitRate     *float64
			isIdle           bool
		)

		if shortMetric.samples >= 3 {
			effectiveSamples = max(shortMetric.samples, longMetric.samples)
			if shortMetric.successRate < cfg.DegradedSuccessRate {
				if longMetric.samples > 0 {
					effectiveSuccess = math.Min(shortMetric.successRate, 0.75*shortMetric.successRate+0.25*longMetric.successRate)
				} else {
					effectiveSuccess = shortMetric.successRate
				}
			} else if longMetric.samples > 0 {
				effectiveSuccess = 0.65*shortMetric.successRate + 0.35*longMetric.successRate
			} else {
				effectiveSuccess = shortMetric.successRate
			}
		} else if shortMetric.samples == 0 && probeFresh {
			// Silent probe breaks outage-demotion starvation when real traffic paused.
			if input.Probe.Success && input.Probe.RecentSuccessRate >= cfg.HealthySuccessRate {
				effectiveSuccess = input.Probe.RecentSuccessRate
				effectiveSamples = int64(input.Probe.RecentSamples)
			} else if !input.Probe.Success {
				effectiveSuccess = input.Probe.RecentSuccessRate
				effectiveSamples = int64(input.Probe.RecentSamples)
			} else if longMetric.samples > 0 {
				effectiveSuccess = longMetric.successRate
				effectiveSamples = longMetric.samples
			} else {
				effectiveSuccess = input.Probe.RecentSuccessRate
				effectiveSamples = int64(input.Probe.RecentSamples)
			}
		} else if longMetric.samples > 0 {
			effectiveSuccess = longMetric.successRate
			effectiveSamples = longMetric.samples
		} else if shortMetric.samples > 0 {
			effectiveSuccess = shortMetric.successRate
			effectiveSamples = shortMetric.samples
		} else {
			isIdle = true
			effectiveSuccess = 100
			effectiveSamples = 0
		}

		avgTtftMs = shortMetric.avgTtftMs
		if avgTtftMs <= 0 {
			avgTtftMs = longMetric.avgTtftMs
		} else if longMetric.avgTtftMs > 0 {
			avgTtftMs = int64(math.Round(0.5*float64(shortMetric.avgTtftMs) + 0.5*float64(longMetric.avgTtftMs)))
		}

		avgTps = shortMetric.avgTps
		if avgTps <= 0 {
			avgTps = longMetric.avgTps
		} else if longMetric.avgTps > 0 {
			avgTps = 0.5*shortMetric.avgTps + 0.5*longMetric.avgTps
		}

		if shortMetric.cacheHitRate != nil {
			cacheHitRate = shortMetric.cacheHitRate
		} else {
			cacheHitRate = longMetric.cacheHitRate
		}

		tierRank := 0
		tierName := "healthy"
		if !isIdle {
			if effectiveSuccess < cfg.DegradedSuccessRate {
				tierRank = 2
				tierName = "outage"
			} else if effectiveSuccess < cfg.HealthySuccessRate {
				tierRank = 1
				tierName = "degraded"
			}
		}

		priorSuccess := smartRoutingPriorTotal * (smartRoutingPriorRate / 100.0)
		smoothed := (float64(effectiveSamples)*(effectiveSuccess/100.0) + priorSuccess) /
			(float64(effectiveSamples) + smartRoutingPriorTotal)
		smoothedPct := smoothed * 100.0

		adminOrder := 0
		if _, pinned := pinnedSet[input.Group]; pinned {
			adminOrder = -1
		} else if _, demoted := demotedSet[input.Group]; demoted {
			adminOrder = 1
		}

		ranked = append(ranked, SmartRoutingRankedCandidate{
			Group:               input.Group,
			EffectiveRatio:      input.EffectiveRatio,
			Tier:                tierName,
			EffectiveSuccess:    math.Round(effectiveSuccess*100) / 100,
			SmoothedReliability: math.Round(smoothedPct*100) / 100,
			EffectiveSamples:    effectiveSamples,
			AvgTtftMs:           avgTtftMs,
			AvgTps:              math.Round(avgTps*100) / 100,
			CacheHitRate:        cacheHitRate,
			IsIdle:              isIdle,
			tierRank:            tierRank,
			adminOrder:          adminOrder,
		})
	}

	if !cfg.AllowOutageFallback {
		nonOutage := make([]SmartRoutingRankedCandidate, 0, len(ranked))
		for _, item := range ranked {
			if item.tierRank < 2 {
				nonOutage = append(nonOutage, item)
			}
		}
		if len(nonOutage) > 0 {
			ranked = nonOutage
		}
	}

	if policy == model.TokenRoutePolicyCostFirst {
		for i := range ranked {
			// Score is informative for preview: higher is better.
			tierBase := 1.0
			if ranked[i].tierRank == 1 {
				tierBase = 0.6
			} else if ranked[i].tierRank == 2 {
				tierBase = 0.2
			}
			ratioFactor := 1.0 / (1.0 + math.Max(ranked[i].EffectiveRatio, 0))
			ranked[i].Score = math.Round((tierBase*0.7+ratioFactor*0.3)*1000) / 1000
		}
		slices.SortFunc(ranked, func(a, b SmartRoutingRankedCandidate) int {
			if a.tierRank != b.tierRank {
				return cmp.Compare(a.tierRank, b.tierRank)
			}
			if a.tierRank == 2 {
				if a.SmoothedReliability != b.SmoothedReliability {
					return cmp.Compare(b.SmoothedReliability, a.SmoothedReliability)
				}
				if math.Abs(a.EffectiveRatio-b.EffectiveRatio) > 1e-9 {
					return cmp.Compare(a.EffectiveRatio, b.EffectiveRatio)
				}
				return cmp.Compare(a.Group, b.Group)
			}
			if math.Abs(a.EffectiveRatio-b.EffectiveRatio) > 1e-9 {
				return cmp.Compare(a.EffectiveRatio, b.EffectiveRatio)
			}
			if a.adminOrder != b.adminOrder {
				return cmp.Compare(a.adminOrder, b.adminOrder)
			}
			if a.SmoothedReliability != b.SmoothedReliability {
				return cmp.Compare(b.SmoothedReliability, a.SmoothedReliability)
			}
			if a.AvgTtftMs > 0 && b.AvgTtftMs > 0 && a.AvgTtftMs != b.AvgTtftMs {
				return cmp.Compare(a.AvgTtftMs, b.AvgTtftMs)
			}
			return cmp.Compare(a.Group, b.Group)
		})
		if cfg.CostMaxFallbackRatio > 0 && len(ranked) > 1 && ranked[0].EffectiveRatio > 0 {
			ceiling := ranked[0].EffectiveRatio * cfg.CostMaxFallbackRatio
			capped := make([]SmartRoutingRankedCandidate, 0, len(ranked))
			capped = append(capped, ranked[0])
			for _, item := range ranked[1:] {
				if item.EffectiveRatio <= ceiling+1e-9 {
					capped = append(capped, item)
				}
			}
			ranked = capped
		}
		return ranked
	}

	// stability_first scoring across candidates
	minTtft := int64(0)
	maxTps := 0.0
	minRatio := 0.0
	anyCacheReported := false
	for _, item := range ranked {
		if item.tierRank < 2 {
			if item.AvgTtftMs > 0 && (minTtft == 0 || item.AvgTtftMs < minTtft) {
				minTtft = item.AvgTtftMs
			}
			if item.AvgTps > maxTps {
				maxTps = item.AvgTps
			}
			if item.EffectiveRatio > 0 && (minRatio == 0 || item.EffectiveRatio < minRatio) {
				minRatio = item.EffectiveRatio
			}
			if item.CacheHitRate != nil && *item.CacheHitRate > 0 {
				anyCacheReported = true
			}
		}
	}
	if minRatio == 0 {
		for _, item := range ranked {
			if item.EffectiveRatio > 0 && (minRatio == 0 || item.EffectiveRatio < minRatio) {
				minRatio = item.EffectiveRatio
			}
		}
	}

	weights := cfg.StabilityWeights
	weightSum := weights.SuccessRate + weights.Speed + weights.CacheHit + weights.PriceTieBreak
	if weightSum <= 0 {
		weightSum = 1
	}
	bandSpan := math.Max(100.0-cfg.DegradedSuccessRate, 1.0)

	for i := range ranked {
		item := &ranked[i]
		successScore := math.Max(0, math.Min(1, (item.SmoothedReliability-cfg.DegradedSuccessRate)/bandSpan))
		if item.tierRank == 1 {
			successScore = math.Max(0, successScore-0.25)
		} else if item.tierRank == 2 {
			successScore = 0
		}

		ttftScore := -1.0
		if item.AvgTtftMs > 0 && minTtft > 0 {
			ttftScore = math.Min(1.0, float64(minTtft)/float64(item.AvgTtftMs))
		}
		tpsScore := -1.0
		if item.AvgTps > 0 && maxTps > 0 {
			tpsScore = math.Min(1.0, item.AvgTps/maxTps)
		}
		speedScore := 0.5
		switch {
		case ttftScore >= 0 && tpsScore >= 0:
			speedScore = 0.65*ttftScore + 0.35*tpsScore
		case ttftScore >= 0:
			speedScore = ttftScore
		case tpsScore >= 0:
			speedScore = tpsScore
		}

		cacheScore := 0.5
		if anyCacheReported {
			if item.CacheHitRate != nil {
				cacheScore = math.Max(0, math.Min(1, *item.CacheHitRate/100.0))
			} else {
				cacheScore = 0
			}
		}

		priceScore := 0.5
		if minRatio > 0 && item.EffectiveRatio > 0 {
			priceScore = math.Min(1.0, minRatio/item.EffectiveRatio)
		} else if item.EffectiveRatio == 0 {
			priceScore = 1.0
		}

		score := (weights.SuccessRate*successScore +
			weights.Speed*speedScore +
			weights.CacheHit*cacheScore +
			weights.PriceTieBreak*priceScore) / weightSum
		if item.adminOrder < 0 {
			score += smartRoutingAdminBoost
		} else if item.adminOrder > 0 {
			score -= smartRoutingAdminBoost
		}
		if item.tierRank == 2 {
			score = math.Max(0, item.SmoothedReliability/1000.0)
		}
		item.Score = math.Round(score*1000) / 1000
	}

	slices.SortFunc(ranked, func(a, b SmartRoutingRankedCandidate) int {
		aOutage := a.tierRank == 2
		bOutage := b.tierRank == 2
		if aOutage != bOutage {
			if aOutage {
				return 1
			}
			return -1
		}
		if a.Score != b.Score {
			return cmp.Compare(b.Score, a.Score)
		}
		if math.Abs(a.EffectiveRatio-b.EffectiveRatio) > 1e-9 {
			return cmp.Compare(a.EffectiveRatio, b.EffectiveRatio)
		}
		return cmp.Compare(a.Group, b.Group)
	})
	return ranked
}

func buildCandidatesForModel(
	userGroup string,
	modelName string,
	candidateGroups []string,
	shortSnap perfmetrics.RoutingMetricsSnapshot,
	longSnap perfmetrics.RoutingMetricsSnapshot,
	nowUnix int64,
) []SmartRoutingCandidateInput {
	inputs := make([]SmartRoutingCandidateInput, 0, len(candidateGroups))
	for _, group := range candidateGroups {
		var shortModel, shortGroup, longModel, longGroup *perfmetrics.RoutingMetric
		if gm, ok := shortSnap.Groups[group]; ok {
			val := gm
			shortGroup = &val
		}
		if mmMap, ok := shortSnap.GroupModels[group]; ok {
			if mm, exists := mmMap[modelName]; exists {
				val := mm
				shortModel = &val
			}
		}
		if gm, ok := longSnap.Groups[group]; ok {
			val := gm
			longGroup = &val
		}
		if mmMap, ok := longSnap.GroupModels[group]; ok {
			if mm, exists := mmMap[modelName]; exists {
				val := mm
				longModel = &val
			}
		}
		inputs = append(inputs, SmartRoutingCandidateInput{
			Group:          group,
			EffectiveRatio: GetUserGroupRatio(userGroup, group),
			ShortModel:     shortModel,
			ShortGroup:     shortGroup,
			LongModel:      longModel,
			LongGroup:      longGroup,
			Probe:          perfmetrics.GetGroupProbeSummary(group),
			NowUnix:        nowUnix,
		})
	}
	return inputs
}

func filterEligibleReasoningGroups(
	userGroup string,
	cfg setting.SmartRoutingConfig,
	modelsByGroup map[string][]string,
	hints map[string]model.ModelCapabilityHint,
) (map[string][]string, []string) {
	excluded := make(map[string]struct{}, len(cfg.ExcludedGroups))
	for _, g := range cfg.ExcludedGroups {
		excluded[g] = struct{}{}
	}
	reasoningByGroup := make(map[string][]string)
	eligibleGroups := make([]string, 0)
	for group, models := range modelsByGroup {
		if !IsUserSelectableGroup(userGroup, group) {
			continue
		}
		if _, isExcluded := excluded[group]; isExcluded {
			continue
		}
		reasoningModels := make([]string, 0, len(models))
		for _, modelName := range models {
			if isModelReasoningWithHints(modelName, hints) {
				reasoningModels = append(reasoningModels, modelName)
			}
		}
		if len(reasoningModels) == 0 {
			continue
		}
		reasoningByGroup[group] = reasoningModels
		eligibleGroups = append(eligibleGroups, group)
	}
	sort.Strings(eligibleGroups)
	return reasoningByGroup, eligibleGroups
}

// GetSmartRoutingEligibleGroups returns all active reasoning-capable billing groups
// accessible to userGroup under the active smart routing config.
func GetSmartRoutingEligibleGroups(userGroup string) []string {
	cfg := setting.GetSmartRoutingConfig()
	if !cfg.Enabled {
		return nil
	}
	_, _, modelsByGroup, hints := getSmartRoutingTelemetry(cfg)
	_, eligible := filterEligibleReasoningGroups(userGroup, cfg, modelsByGroup, hints)
	return eligible
}

// ResolveSmartRoutingGroups returns the dynamically ranked candidate groups for
// one reasoning model request under a built-in smart routing policy.
func ResolveSmartRoutingGroups(userGroup string, modelName string, policy string) []string {
	cfg := setting.GetSmartRoutingConfig()
	if !cfg.Enabled || !model.IsBuiltinTokenRoutePolicy(policy) {
		return nil
	}
	shortSnap, longSnap, modelsByGroup, hints := getSmartRoutingTelemetry(cfg)
	excluded := make(map[string]struct{}, len(cfg.ExcludedGroups))
	for _, g := range cfg.ExcludedGroups {
		excluded[g] = struct{}{}
	}

	enabledForModel, err := model.GetEnabledGroupsForModel(modelName)
	if err != nil || len(enabledForModel) == 0 {
		// Fall back to cached snapshot lookup if DB query returned empty.
		normalized := ratio_setting.RoutingMatchModelName(modelName)
		for group, models := range modelsByGroup {
			for _, m := range models {
				if m == modelName || (normalized != "" && m == normalized) {
					enabledForModel = append(enabledForModel, group)
					break
				}
			}
		}
	}

	candidates := make([]string, 0, len(enabledForModel))
	seen := make(map[string]struct{}, len(enabledForModel))
	for _, group := range enabledForModel {
		if _, ok := seen[group]; ok {
			continue
		}
		if !IsUserSelectableGroup(userGroup, group) {
			continue
		}
		if _, isExcluded := excluded[group]; isExcluded {
			continue
		}
		if _, hasCachedModels := modelsByGroup[group]; hasCachedModels {
			if !isModelReasoningWithHints(modelName, hints) {
				continue
			}
		}
		seen[group] = struct{}{}
		candidates = append(candidates, group)
	}
	if len(candidates) == 0 {
		return nil
	}
	inputs := buildCandidatesForModel(userGroup, modelName, candidates, shortSnap, longSnap, time.Now().Unix())
	ranked := RankSmartRoutingCandidates(policy, cfg, inputs)
	groups := make([]string, 0, len(ranked))
	for _, item := range ranked {
		groups = append(groups, item.Group)
	}
	return groups
}

func BuildSmartRoutingPolicySummaries(userGroup string) SmartRoutingPoliciesResponse {
	cfg := setting.GetSmartRoutingConfig()
	resp := SmartRoutingPoliciesResponse{
		Enabled:  cfg.Enabled,
		Policies: make([]SmartRoutingPolicySummary, 0, 2),
	}
	if !cfg.Enabled {
		return resp
	}

	shortSnap, longSnap, modelsByGroup, hints := getSmartRoutingTelemetry(cfg)
	reasoningByGroup, eligibleGroups := filterEligibleReasoningGroups(userGroup, cfg, modelsByGroup, hints)

	modelGroups := make(map[string][]string)
	for _, group := range eligibleGroups {
		for _, modelName := range reasoningByGroup[group] {
			modelGroups[modelName] = append(modelGroups[modelName], group)
		}
	}

	modelNames := make([]string, 0, len(modelGroups))
	for modelName := range modelGroups {
		modelNames = append(modelNames, modelName)
	}
	// Sort models by 24h request volume descending so sample routes highlight popular models.
	modelTraffic := make(map[string]int64, len(modelNames))
	for _, mMap := range longSnap.GroupModels {
		for modelName, metric := range mMap {
			modelTraffic[modelName] += metric.RequestCount
		}
	}
	sort.Slice(modelNames, func(i, j int) bool {
		if modelTraffic[modelNames[i]] != modelTraffic[modelNames[j]] {
			return modelTraffic[modelNames[i]] > modelTraffic[modelNames[j]]
		}
		return modelNames[i] < modelNames[j]
	})

	nowUnix := time.Now().Unix()
	for _, policy := range []string{model.TokenRoutePolicyCostFirst, model.TokenRoutePolicyStabilityFirst} {
		var minRatio, maxRatio *float64
		sampleRoutes := make([]SmartRoutingSampleRoute, 0, 8)
		for _, modelName := range modelNames {
			inputs := buildCandidatesForModel(userGroup, modelName, modelGroups[modelName], shortSnap, longSnap, nowUnix)
			ranked := RankSmartRoutingCandidates(policy, cfg, inputs)
			if len(ranked) == 0 {
				continue
			}
			top := ranked[0]
			if minRatio == nil || top.EffectiveRatio < *minRatio {
				v := top.EffectiveRatio
				minRatio = &v
			}
			if maxRatio == nil || top.EffectiveRatio > *maxRatio {
				v := top.EffectiveRatio
				maxRatio = &v
			}
			if len(sampleRoutes) < 8 {
				sampleRoutes = append(sampleRoutes, SmartRoutingSampleRoute{
					Model:  modelName,
					Group:  top.Group,
					Ratio:  top.EffectiveRatio,
					Status: top.Tier,
				})
			}
		}
		resp.Policies = append(resp.Policies, SmartRoutingPolicySummary{
			ID:                 policy,
			Available:          len(modelNames) > 0 && len(eligibleGroups) > 0,
			ReasoningOnly:      true,
			MinRatio:           minRatio,
			MaxRatio:           maxRatio,
			EligibleGroupCount: len(eligibleGroups),
			ModelCount:         len(modelNames),
			SampleRoutes:       sampleRoutes,
		})
	}
	return resp
}

func BuildSmartRoutingPreview(userGroup string, cfg setting.SmartRoutingConfig) SmartRoutingPreviewResponse {
	shortSnap, longSnap, modelsByGroup, hints := getSmartRoutingTelemetry(cfg)
	reasoningByGroup, eligibleGroups := filterEligibleReasoningGroups(userGroup, cfg, modelsByGroup, hints)

	modelGroups := make(map[string][]string)
	for _, group := range eligibleGroups {
		for _, modelName := range reasoningByGroup[group] {
			modelGroups[modelName] = append(modelGroups[modelName], group)
		}
	}

	modelNames := make([]string, 0, len(modelGroups))
	for modelName := range modelGroups {
		modelNames = append(modelNames, modelName)
	}
	modelTraffic := make(map[string]int64, len(modelNames))
	for _, mMap := range longSnap.GroupModels {
		for modelName, metric := range mMap {
			modelTraffic[modelName] += metric.RequestCount
		}
	}
	sort.Slice(modelNames, func(i, j int) bool {
		if modelTraffic[modelNames[i]] != modelTraffic[modelNames[j]] {
			return modelTraffic[modelNames[i]] > modelTraffic[modelNames[j]]
		}
		return modelNames[i] < modelNames[j]
	})

	nowUnix := time.Now().Unix()
	previews := make([]SmartRoutingModelPreview, 0, len(modelNames))
	for _, modelName := range modelNames {
		inputs := buildCandidatesForModel(userGroup, modelName, modelGroups[modelName], shortSnap, longSnap, nowUnix)
		previews = append(previews, SmartRoutingModelPreview{
			Model:          modelName,
			CostFirst:      RankSmartRoutingCandidates(model.TokenRoutePolicyCostFirst, cfg, inputs),
			StabilityFirst: RankSmartRoutingCandidates(model.TokenRoutePolicyStabilityFirst, cfg, inputs),
		})
	}
	return SmartRoutingPreviewResponse{
		Config: SmartRoutingConfigPreviewMeta{
			ShortWindowHours:   cfg.ShortWindowHours,
			LongWindowHours:    cfg.LongWindowHours,
			EligibleGroupCount: len(eligibleGroups),
			ModelCount:         len(modelNames),
		},
		Models: previews,
	}
}
