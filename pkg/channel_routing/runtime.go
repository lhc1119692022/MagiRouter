package channelrouting

import (
	"math"
	"math/rand/v2"
	"slices"
	"sync"
	"sync/atomic"
	"time"
)

const (
	ewmaAlpha                = 0.30
	errRateAlpha             = 0.25
	staleTelemetryWindow     = 15 * time.Minute
	recentSampleRingSize     = 32
	minSamplesForSlowRatio   = 3
	slowAbsoluteFloorMs      = 5000
	slowHardCeilingMs        = 15000
	slowPeerRatioThreshold   = 3.0
	slowConsecutiveThreshold = 3
	baseSoftDemoteCooldown   = 30 * time.Second
	maxSoftDemoteCooldown    = 5 * time.Minute
	explorationProbability   = 0.05
	defaultColdBaselineMs    = 1000.0
	minScoreLatencyMs        = 50.0
)

type Candidate struct {
	ChannelID int
	Weight    int
}

type AttemptSample struct {
	TtftMs       int64
	LatencyMs    int64
	Success      bool
	IsTimeout    bool
	PeerMedianMs int64
}

type RuntimeSnapshot struct {
	ChannelID        int     `json:"channel_id"`
	EwmaTtftMs       int64   `json:"ewma_ttft_ms"`
	EwmaLatencyMs    int64   `json:"ewma_latency_ms"`
	P50TtftMs        int64   `json:"p50_ttft_ms"`
	P95TtftMs        int64   `json:"p95_ttft_ms"`
	InFlight         int64   `json:"in_flight"`
	SampleCount      int64   `json:"sample_count"`
	ErrorRate        float64 `json:"error_rate"`
	SoftDemoted      bool    `json:"soft_demoted"`
	SoftDemotedUntil int64   `json:"soft_demoted_until,omitempty"`
	LastUpdated      int64   `json:"last_updated,omitempty"`
}

type channelTelemetrySnapshot struct {
	ewmaTtftMs       float64
	ewmaErrRate      float64
	sampleCount      int64
	softDemotedUntil time.Time
	lastUpdated      time.Time
}

type channelState struct {
	inFlight  atomic.Int64
	telemetry atomic.Pointer[channelTelemetrySnapshot]

	mu               sync.Mutex
	ewmaTtftMs       float64
	ewmaLatencyMs    float64
	ewmaErrRate      float64
	sampleCount      int64
	ring             [recentSampleRingSize]int64
	ringLen          int
	ringNext         int
	consecutiveSlow  int
	slowDemoteStreak int
	softDemotedUntil time.Time
	lastUpdated      time.Time
}

type candidateView struct {
	index       int
	channelID   int
	weight      int
	hasFresh    bool
	ewmaMs      float64
	errRate     float64
	inFlight    int64
	sampleCount int64
	softDemoted bool
}

var (
	channelStates sync.Map // map[int]*channelState
	nowFunc       = time.Now
)

func getOrCreateState(channelID int) *channelState {
	if existing, ok := channelStates.Load(channelID); ok {
		return existing.(*channelState)
	}
	created := &channelState{}
	actual, _ := channelStates.LoadOrStore(channelID, created)
	return actual.(*channelState)
}

func loadState(channelID int) (*channelState, bool) {
	existing, ok := channelStates.Load(channelID)
	if !ok {
		return nil, false
	}
	return existing.(*channelState), true
}

// AcquireInFlight tracks an active upstream attempt for channelID and returns
// an idempotent release function.
func AcquireInFlight(channelID int) func() {
	if channelID <= 0 {
		return func() {}
	}
	state := getOrCreateState(channelID)
	state.inFlight.Add(1)
	var once sync.Once
	return func() {
		once.Do(func() {
			for {
				current := state.inFlight.Load()
				if current <= 0 {
					return
				}
				if state.inFlight.CompareAndSwap(current, current-1) {
					return
				}
			}
		})
	}
}

// RecordAttempt records a completed relay attempt's timing and health outcome
// into the channel's rolling EWMA, percentile window, and soft-demotion state.
func RecordAttempt(channelID int, sample AttemptSample) {
	if channelID <= 0 {
		return
	}
	now := nowFunc()
	state := getOrCreateState(channelID)

	observedMs := sample.TtftMs
	if observedMs <= 0 {
		observedMs = sample.LatencyMs
	}
	if observedMs < 0 {
		observedMs = 0
	}
	latencyMs := sample.LatencyMs
	if latencyMs < 0 {
		latencyMs = 0
	}

	state.mu.Lock()
	defer state.mu.Unlock()

	if !state.lastUpdated.IsZero() && now.Sub(state.lastUpdated) > staleTelemetryWindow {
		state.ewmaTtftMs = 0
		state.ewmaLatencyMs = 0
		state.ewmaErrRate = 0
		state.ringLen = 0
		state.ringNext = 0
		state.consecutiveSlow = 0
		state.slowDemoteStreak = 0
		state.softDemotedUntil = time.Time{}
	}

	if observedMs > 0 {
		if state.ewmaTtftMs <= 0 {
			state.ewmaTtftMs = float64(observedMs)
		} else {
			state.ewmaTtftMs = ewmaAlpha*float64(observedMs) + (1-ewmaAlpha)*state.ewmaTtftMs
		}
		state.ring[state.ringNext] = observedMs
		state.ringNext = (state.ringNext + 1) % recentSampleRingSize
		if state.ringLen < recentSampleRingSize {
			state.ringLen++
		}
	}
	if latencyMs > 0 {
		if state.ewmaLatencyMs <= 0 {
			state.ewmaLatencyMs = float64(latencyMs)
		} else {
			state.ewmaLatencyMs = ewmaAlpha*float64(latencyMs) + (1-ewmaAlpha)*state.ewmaLatencyMs
		}
	}

	errValue := 0.0
	if !sample.Success {
		errValue = 1.0
	}
	if state.sampleCount == 0 {
		state.ewmaErrRate = errValue
	} else {
		state.ewmaErrRate = errRateAlpha*errValue + (1-errRateAlpha)*state.ewmaErrRate
	}
	state.sampleCount++
	state.lastUpdated = now

	slowRelative := sample.PeerMedianMs > 0 &&
		observedMs >= slowAbsoluteFloorMs &&
		float64(observedMs) >= float64(sample.PeerMedianMs)*slowPeerRatioThreshold
	slowAbsolute := observedMs >= slowHardCeilingMs

	switch {
	case sample.IsTimeout:
		state.consecutiveSlow += 2
		if state.consecutiveSlow >= slowConsecutiveThreshold {
			applySoftDemotionLocked(state, now)
		}
	case slowRelative || slowAbsolute:
		state.consecutiveSlow++
		if state.consecutiveSlow >= slowConsecutiveThreshold {
			applySoftDemotionLocked(state, now)
		}
	case sample.Success:
		isFastRecovery := observedMs == 0 ||
			(observedMs < slowAbsoluteFloorMs && (sample.PeerMedianMs <= 0 || float64(observedMs) < float64(sample.PeerMedianMs)*2.0))
		if isFastRecovery {
			state.consecutiveSlow = 0
			state.slowDemoteStreak = 0
			state.softDemotedUntil = time.Time{}
		} else if state.consecutiveSlow > 0 {
			state.consecutiveSlow--
		}
	}

	state.telemetry.Store(&channelTelemetrySnapshot{
		ewmaTtftMs:       state.ewmaTtftMs,
		ewmaErrRate:      state.ewmaErrRate,
		sampleCount:      state.sampleCount,
		softDemotedUntil: state.softDemotedUntil,
		lastUpdated:      state.lastUpdated,
	})
}

func applySoftDemotionLocked(state *channelState, now time.Time) {
	state.slowDemoteStreak++
	shift := min(state.slowDemoteStreak-1, 4)
	cooldown := min(baseSoftDemoteCooldown<<shift, maxSoftDemoteCooldown)
	state.softDemotedUntil = now.Add(cooldown)
}

// PeerMedianTtftMs returns the median fresh EWMA TTFT across the given sibling
// channels, or 0 if no sibling has fresh latency data.
func PeerMedianTtftMs(channelIDs []int) int64 {
	if len(channelIDs) == 0 {
		return 0
	}
	now := nowFunc()
	values := make([]float64, 0, len(channelIDs))
	for _, channelID := range channelIDs {
		state, ok := loadState(channelID)
		if !ok {
			continue
		}
		snap := state.telemetry.Load()
		if snap != nil && !snap.lastUpdated.IsZero() && now.Sub(snap.lastUpdated) <= staleTelemetryWindow && snap.ewmaTtftMs > 0 {
			values = append(values, snap.ewmaTtftMs)
		}
	}
	return int64(math.Round(medianFloat64InPlace(values)))
}

// SelectCandidate picks one candidate index from candidates using static
// weights when no fresh runtime telemetry exists, or Peak-EWMA + P2C with
// slow-channel soft demotion once live traffic observations are present.
func SelectCandidate(candidates []Candidate) int {
	return selectCandidateWithRNG(candidates, rand.IntN, rand.Float64)
}

func selectCandidateWithRNG(
	candidates []Candidate,
	rngIntN func(int) int,
	rngFloat64 func() float64,
) int {
	if len(candidates) <= 1 {
		return 0
	}
	now := nowFunc()
	views := make([]candidateView, len(candidates))
	hasAnyTelemetry := false
	freshLatencies := make([]float64, 0, len(candidates))

	for i, candidate := range candidates {
		weight := max(candidate.Weight, 0)
		view := candidateView{
			index:     i,
			channelID: candidate.ChannelID,
			weight:    weight,
		}
		if state, ok := loadState(candidate.ChannelID); ok {
			view.inFlight = state.inFlight.Load()
			if snap := state.telemetry.Load(); snap != nil && !snap.lastUpdated.IsZero() && now.Sub(snap.lastUpdated) <= staleTelemetryWindow {
				view.hasFresh = snap.ewmaTtftMs > 0 || snap.sampleCount > 0
				view.ewmaMs = snap.ewmaTtftMs
				view.errRate = snap.ewmaErrRate
				view.sampleCount = snap.sampleCount
				view.softDemoted = !snap.softDemotedUntil.IsZero() && now.Before(snap.softDemotedUntil)
			}
			if view.hasFresh || view.inFlight > 0 || view.softDemoted {
				hasAnyTelemetry = true
			}
			if view.hasFresh && view.ewmaMs > 0 {
				freshLatencies = append(freshLatencies, view.ewmaMs)
			}
		}
		views[i] = view
	}

	if !hasAnyTelemetry {
		return weightedPickView(views, rngIntN).index
	}

	peerMedianMs := medianFloat64InPlace(freshLatencies)
	baselineMs := peerMedianMs
	if baselineMs <= 0 {
		baselineMs = defaultColdBaselineMs
	}

	preferred := make([]candidateView, 0, len(views))
	demoted := make([]candidateView, 0, len(views))
	for _, view := range views {
		ratioSlow := peerMedianMs > 0 &&
			view.sampleCount >= minSamplesForSlowRatio &&
			view.ewmaMs >= slowAbsoluteFloorMs &&
			view.ewmaMs >= peerMedianMs*slowPeerRatioThreshold
		if view.softDemoted || ratioSlow {
			demoted = append(demoted, view)
		} else {
			preferred = append(preferred, view)
		}
	}

	pool := views
	if len(preferred) > 0 && len(demoted) > 0 {
		if rngFloat64() < explorationProbability {
			pool = demoted
		} else {
			pool = preferred
		}
	}

	if len(pool) == 1 {
		return pool[0].index
	}

	if rngFloat64() < explorationProbability {
		return weightedPickView(pool, rngIntN).index
	}

	first := weightedPickView(pool, rngIntN)
	second, ok := weightedPickDistinctView(pool, first.index, rngIntN)
	if !ok {
		return first.index
	}

	if candidateCost(second, baselineMs) < candidateCost(first, baselineMs) {
		return second.index
	}
	return first.index
}

func candidateCost(view candidateView, baselineMs float64) float64 {
	latency := view.ewmaMs
	if latency <= 0 {
		latency = baselineMs
	}
	latency = max(latency, minScoreLatencyMs)
	errMultiplier := 1.0 + 4.0*math.Max(0, min(view.errRate, 1.0))
	return latency * float64(view.inFlight+1) * errMultiplier
}

func effectiveWeight(views []candidateView) (int, int, int) {
	sumWeight := 0
	for _, view := range views {
		sumWeight += view.weight
	}
	smoothingFactor := 1
	smoothingAdjustment := 0
	if sumWeight == 0 {
		sumWeight = len(views) * 100
		smoothingAdjustment = 100
	} else if sumWeight/len(views) < 10 {
		smoothingFactor = 100
	}
	return sumWeight * smoothingFactor, smoothingFactor, smoothingAdjustment
}

func weightedPickView(views []candidateView, rngIntN func(int) int) candidateView {
	if len(views) == 1 {
		return views[0]
	}
	totalWeight, factor, adjustment := effectiveWeight(views)
	if totalWeight <= 0 {
		return views[0]
	}
	pick := rngIntN(totalWeight)
	for _, view := range views {
		pick -= view.weight*factor + adjustment
		if pick < 0 {
			return view
		}
	}
	return views[len(views)-1]
}

func weightedPickDistinctView(views []candidateView, excludeIndex int, rngIntN func(int) int) (candidateView, bool) {
	filtered := make([]candidateView, 0, len(views)-1)
	for _, view := range views {
		if view.index != excludeIndex {
			filtered = append(filtered, view)
		}
	}
	if len(filtered) == 0 {
		return candidateView{}, false
	}
	return weightedPickView(filtered, rngIntN), true
}

func GetSnapshot(channelID int) (RuntimeSnapshot, bool) {
	state, ok := loadState(channelID)
	if !ok {
		return RuntimeSnapshot{}, false
	}
	now := nowFunc()
	inFlight := state.inFlight.Load()

	state.mu.Lock()
	defer state.mu.Unlock()

	if state.lastUpdated.IsZero() || now.Sub(state.lastUpdated) > staleTelemetryWindow {
		if inFlight == 0 {
			return RuntimeSnapshot{}, false
		}
		return RuntimeSnapshot{
			ChannelID: channelID,
			InFlight:  inFlight,
		}, true
	}

	samples := make([]int64, state.ringLen)
	copy(samples, state.ring[:state.ringLen])
	slices.Sort(samples)

	softDemoted := !state.softDemotedUntil.IsZero() && now.Before(state.softDemotedUntil)
	var softDemotedUntil int64
	if softDemoted {
		softDemotedUntil = state.softDemotedUntil.Unix()
	}
	return RuntimeSnapshot{
		ChannelID:        channelID,
		EwmaTtftMs:       int64(math.Round(state.ewmaTtftMs)),
		EwmaLatencyMs:    int64(math.Round(state.ewmaLatencyMs)),
		P50TtftMs:        percentileInt64(samples, 0.50),
		P95TtftMs:        percentileInt64(samples, 0.95),
		InFlight:         inFlight,
		SampleCount:      state.sampleCount,
		ErrorRate:        math.Round(state.ewmaErrRate*10000) / 10000,
		SoftDemoted:      softDemoted,
		SoftDemotedUntil: softDemotedUntil,
		LastUpdated:      state.lastUpdated.Unix(),
	}, true
}

func GetSnapshots(channelIDs []int) map[int]RuntimeSnapshot {
	result := make(map[int]RuntimeSnapshot, len(channelIDs))
	for _, channelID := range channelIDs {
		if snap, ok := GetSnapshot(channelID); ok {
			result[channelID] = snap
		}
	}
	return result
}

func ResetForTest() {
	channelStates.Range(func(key, _ any) bool {
		channelStates.Delete(key)
		return true
	})
	nowFunc = time.Now
}

func medianFloat64InPlace(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	slices.Sort(values)
	mid := len(values) / 2
	if len(values)%2 == 1 {
		return values[mid]
	}
	return (values[mid-1] + values[mid]) / 2
}

func percentileInt64(sorted []int64, p float64) int64 {
	if len(sorted) == 0 {
		return 0
	}
	if p <= 0 {
		return sorted[0]
	}
	if p >= 1 {
		return sorted[len(sorted)-1]
	}
	idx := int(math.Ceil(p*float64(len(sorted)))) - 1
	idx = max(0, min(idx, len(sorted)-1))
	return sorted[idx]
}
