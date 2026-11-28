package perfmetrics

import (
	"math"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const maxGroupProbeHistory = 60

type ProbeSample struct {
	Timestamp int64  `json:"timestamp"`
	Model     string `json:"model"`
	Success   bool   `json:"success"`
	LatencyMs int64  `json:"latency_ms"`
}

type GroupProbeSummary struct {
	LastTestedAt      int64    `json:"last_tested_at"`
	TestedModel       string   `json:"tested_model"`
	Success           bool     `json:"success"`
	LatencyMs         int64    `json:"latency_ms"`
	MedianLatencyMs   int64    `json:"median_latency_ms,omitempty"`
	RecentSamples     int      `json:"recent_samples"`
	RecentSuccessRate float64  `json:"recent_success_rate"`
	RecentModels      []string `json:"recent_models,omitempty"`
}

var (
	channelProbeMu      sync.RWMutex
	channelProbeHistory = map[string][]ProbeSample{}

	// channelLastTraffic tracks the latest Unix timestamp of a successful real
	// user request per channel ID so scheduled active probes can stay silent
	// while real user traffic is already verifying the channel.
	channelLastTraffic sync.Map
)

func RecordChannelTraffic(channelID int, timestamp int64) {
	if channelID <= 0 {
		return
	}
	if timestamp <= 0 {
		timestamp = time.Now().Unix()
	}
	entry, _ := channelLastTraffic.LoadOrStore(channelID, &atomic.Int64{})
	counter := entry.(*atomic.Int64)
	for {
		prev := counter.Load()
		if timestamp <= prev {
			return
		}
		if counter.CompareAndSwap(prev, timestamp) {
			return
		}
	}
}

func GetChannelLastTrafficTime(channelID int) int64 {
	if channelID <= 0 {
		return 0
	}
	entry, ok := channelLastTraffic.Load(channelID)
	if !ok {
		return 0
	}
	return entry.(*atomic.Int64).Load()
}

func ResetChannelTrafficForTest() {
	channelLastTraffic.Range(func(key, _ any) bool {
		channelLastTraffic.Delete(key)
		return true
	})
}

func RecordChannelProbe(groups []string, sample ProbeSample) {
	if len(groups) == 0 {
		return
	}
	if sample.Timestamp <= 0 {
		sample.Timestamp = time.Now().Unix()
	}
	if sample.LatencyMs < 0 {
		sample.LatencyMs = 0
	}
	sample.Model = strings.TrimSpace(sample.Model)

	channelProbeMu.Lock()
	defer channelProbeMu.Unlock()

	seen := make(map[string]struct{}, len(groups))
	for _, rawGroup := range groups {
		group := strings.TrimSpace(rawGroup)
		if group == "" {
			continue
		}
		if _, exists := seen[group]; exists {
			continue
		}
		seen[group] = struct{}{}

		history := append(channelProbeHistory[group], sample)
		if len(history) > maxGroupProbeHistory {
			history = append([]ProbeSample(nil), history[len(history)-maxGroupProbeHistory:]...)
		}
		channelProbeHistory[group] = history
	}
}

func GetGroupProbeSummary(group string) *GroupProbeSummary {
	return summarizeGroupProbe(group, nil)
}

func GetGroupProbeSummaryForModels(group string, allowedModels []string) *GroupProbeSummary {
	allowedSet := make(map[string]struct{}, len(allowedModels))
	for _, modelName := range allowedModels {
		trimmed := strings.TrimSpace(modelName)
		if trimmed != "" {
			allowedSet[trimmed] = struct{}{}
		}
	}
	if len(allowedSet) == 0 {
		return nil
	}
	return summarizeGroupProbe(group, allowedSet)
}

func summarizeGroupProbe(group string, allowedModels map[string]struct{}) *GroupProbeSummary {
	channelProbeMu.RLock()
	history := channelProbeHistory[strings.TrimSpace(group)]
	if len(history) == 0 {
		channelProbeMu.RUnlock()
		return nil
	}
	snapshot := append([]ProbeSample(nil), history...)
	channelProbeMu.RUnlock()

	if allowedModels != nil {
		filtered := make([]ProbeSample, 0, len(snapshot))
		for _, entry := range snapshot {
			if _, ok := allowedModels[entry.Model]; ok {
				filtered = append(filtered, entry)
			}
		}
		if len(filtered) == 0 {
			return nil
		}
		snapshot = filtered
	}

	latest := snapshot[len(snapshot)-1]
	successCount := 0
	successLatencies := make([]int64, 0, len(snapshot))
	recentModels := make([]string, 0, 6)
	for i := len(snapshot) - 1; i >= 0; i-- {
		entry := snapshot[i]
		if entry.Success {
			successCount++
			if entry.LatencyMs > 0 {
				successLatencies = append(successLatencies, entry.LatencyMs)
			}
		}
		if entry.Model != "" && len(recentModels) < 6 && !slices.Contains(recentModels, entry.Model) {
			recentModels = append(recentModels, entry.Model)
		}
	}
	var medianLatencyMs int64
	if len(successLatencies) > 0 {
		slices.Sort(successLatencies)
		mid := len(successLatencies) / 2
		if len(successLatencies)%2 == 1 {
			medianLatencyMs = successLatencies[mid]
		} else {
			medianLatencyMs = (successLatencies[mid-1] + successLatencies[mid]) / 2
		}
	}
	rate := float64(successCount) / float64(len(snapshot)) * 100
	return &GroupProbeSummary{
		LastTestedAt:      latest.Timestamp,
		TestedModel:       latest.Model,
		Success:           latest.Success,
		LatencyMs:         latest.LatencyMs,
		MedianLatencyMs:   medianLatencyMs,
		RecentSamples:     len(snapshot),
		RecentSuccessRate: math.Round(rate*100) / 100,
		RecentModels:      recentModels,
	}
}

func ResetChannelProbesForTest() {
	channelProbeMu.Lock()
	defer channelProbeMu.Unlock()
	channelProbeHistory = map[string][]ProbeSample{}
}
