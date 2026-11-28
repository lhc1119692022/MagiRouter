package channelrouting

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSelectCandidatePrefersFasterChannelUnderPeakEWMA(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	base := time.Date(2026, 11, 28, 12, 0, 0, 0, time.UTC)
	nowFunc = func() time.Time { return base }

	RecordAttempt(10, AttemptSample{TtftMs: 700, LatencyMs: 1200, Success: true})
	RecordAttempt(10, AttemptSample{TtftMs: 800, LatencyMs: 1300, Success: true})
	RecordAttempt(20, AttemptSample{TtftMs: 4200, LatencyMs: 5000, Success: true})
	RecordAttempt(20, AttemptSample{TtftMs: 4500, LatencyMs: 5200, Success: true})

	candidates := []Candidate{
		{ChannelID: 10, Weight: 100},
		{ChannelID: 20, Weight: 100},
	}
	// Always skip exploration branch (rngFloat64 = 0.99); P2C compares both candidates.
	for range 20 {
		idx := selectCandidateWithRNG(candidates, func(n int) int { return 0 }, func() float64 { return 0.99 })
		assert.Equal(t, 0, idx, "faster channel should win P2C comparison")
	}
}

func TestSelectCandidateAccountsForInFlightLoad(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	base := time.Date(2026, 11, 28, 12, 0, 0, 0, time.UTC)
	nowFunc = func() time.Time { return base }

	RecordAttempt(10, AttemptSample{TtftMs: 1000, LatencyMs: 1200, Success: true})
	RecordAttempt(20, AttemptSample{TtftMs: 1200, LatencyMs: 1400, Success: true})

	release1 := AcquireInFlight(10)
	release2 := AcquireInFlight(10)
	defer release1()
	defer release2()

	candidates := []Candidate{
		{ChannelID: 10, Weight: 100},
		{ChannelID: 20, Weight: 100},
	}
	idx := selectCandidateWithRNG(candidates, func(n int) int { return 0 }, func() float64 { return 0.99 })
	assert.Equal(t, 1, idx, "channel with fewer in-flight requests should win")
}

func TestSoftDemotionAndRecovery(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	current := time.Date(2026, 11, 28, 12, 0, 0, 0, time.UTC)
	nowFunc = func() time.Time { return current }

	RecordAttempt(10, AttemptSample{TtftMs: 800, LatencyMs: 1000, Success: true})
	peerMedian := PeerMedianTtftMs([]int{10, 20})
	require.Equal(t, int64(800), peerMedian)

	// Three consecutive slow attempts (>3x peer median and >=5000ms) trigger soft demotion.
	for range 3 {
		RecordAttempt(20, AttemptSample{TtftMs: 9000, LatencyMs: 9500, Success: true, PeerMedianMs: peerMedian})
	}

	snap, ok := GetSnapshot(20)
	require.True(t, ok)
	assert.True(t, snap.SoftDemoted)
	assert.Equal(t, int64(9000), snap.P50TtftMs)
	assert.Equal(t, int64(9000), snap.P95TtftMs)

	candidates := []Candidate{
		{ChannelID: 10, Weight: 100},
		{ChannelID: 20, Weight: 100},
	}
	// Normal traffic avoids soft-demoted channel.
	assert.Equal(t, 0, selectCandidateWithRNG(candidates, func(n int) int { return 0 }, func() float64 { return 0.50 }))
	// Exploration branch (<0.05) still probes the demoted channel.
	assert.Equal(t, 1, selectCandidateWithRNG(candidates, func(n int) int { return 0 }, func() float64 { return 0.01 }))

	// Fast recovery attempt immediately clears soft demotion.
	RecordAttempt(20, AttemptSample{TtftMs: 900, LatencyMs: 1100, Success: true, PeerMedianMs: peerMedian})
	snap, ok = GetSnapshot(20)
	require.True(t, ok)
	assert.False(t, snap.SoftDemoted)
}

func TestTimeoutTriggersSoftDemotionFaster(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	base := time.Date(2026, 11, 28, 12, 0, 0, 0, time.UTC)
	nowFunc = func() time.Time { return base }

	RecordAttempt(30, AttemptSample{TtftMs: 0, LatencyMs: 30000, Success: false, IsTimeout: true})
	snap, ok := GetSnapshot(30)
	require.True(t, ok)
	assert.False(t, snap.SoftDemoted)

	RecordAttempt(30, AttemptSample{TtftMs: 0, LatencyMs: 30000, Success: false, IsTimeout: true})
	snap, ok = GetSnapshot(30)
	require.True(t, ok)
	assert.True(t, snap.SoftDemoted)
	assert.Greater(t, snap.ErrorRate, 0.5)
}

func TestColdFallbackPreservesWeightedRandom(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	candidates := []Candidate{
		{ChannelID: 10, Weight: 10},
		{ChannelID: 20, Weight: 90},
	}
	assert.Equal(t, 0, selectCandidateWithRNG(candidates, func(n int) int { return 5 }, func() float64 { return 0.5 }))
	assert.Equal(t, 1, selectCandidateWithRNG(candidates, func(n int) int { return 50 }, func() float64 { return 0.5 }))
}

func TestChannelRoutingConcurrentSelectAndRecordRaceFree(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	candidates := []Candidate{
		{ChannelID: 101, Weight: 100},
		{ChannelID: 102, Weight: 100},
		{ChannelID: 103, Weight: 100},
	}
	peerIDs := []int{101, 102, 103}

	var workers sync.WaitGroup
	for workerIdx := range 16 {
		workers.Add(1)
		go func(id int) {
			defer workers.Done()
			for step := range 100 {
				selected := SelectCandidate(candidates)
				assert.GreaterOrEqual(t, selected, 0)
				assert.Less(t, selected, len(candidates))

				channelID := candidates[selected].ChannelID
				release := AcquireInFlight(channelID)
				peerMedian := PeerMedianTtftMs(peerIDs)
				RecordAttempt(channelID, AttemptSample{
					TtftMs:       int64(200 + (id+step)%400),
					LatencyMs:    int64(500 + (id+step)%800),
					Success:      step%7 != 0,
					IsTimeout:    step%19 == 0,
					PeerMedianMs: peerMedian,
				})
				release()
				release()
				_, _ = GetSnapshot(channelID)
			}
		}(workerIdx)
	}
	workers.Wait()

	for _, channelID := range peerIDs {
		snap, ok := GetSnapshot(channelID)
		require.True(t, ok)
		assert.Equal(t, int64(0), snap.InFlight)
		assert.Greater(t, snap.SampleCount, int64(0))
	}
}
