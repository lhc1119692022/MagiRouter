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
	channelProbeMu.RLock()
	history := channelProbeHistory[strings.TrimSpace(group)]
	if len(history) == 0 {
		channelProbeMu.RUnlock()
		return nil
	}
	snapshot := append([]ProbeSample(nil), history...)
	channelProbeMu.RUnlock()

	latest := snapshot[len(snapshot)-1]
	successCount := 0
	recentModels := make([]string, 0, 6)
	for i := len(snapshot) - 1; i >= 0; i-- {
		entry := snapshot[i]
		if entry.Success {
			successCount++
		}
		if entry.Model != "" && len(recentModels) < 6 && !slices.Contains(recentModels, entry.Model) {
			recentModels = append(recentModels, entry.Model)
		}
	}
	rate := float64(successCount) / float64(len(snapshot)) * 100
	return &GroupProbeSummary{
		LastTestedAt:      latest.Timestamp,
		TestedModel:       latest.Model,
		Success:           latest.Success,
		LatencyMs:         latest.LatencyMs,
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
