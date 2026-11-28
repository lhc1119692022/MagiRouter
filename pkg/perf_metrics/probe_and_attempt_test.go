package perfmetrics

import (
	"context"
	"testing"
	"time"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGroupProbeSummaryComputesMedianLatencyOfSuccesses(t *testing.T) {
	ResetChannelProbesForTest()
	t.Cleanup(ResetChannelProbesForTest)

	RecordChannelProbe([]string{"fast"}, ProbeSample{Timestamp: 100, Model: "gpt-mini", Success: true, LatencyMs: 400})
	RecordChannelProbe([]string{"fast"}, ProbeSample{Timestamp: 101, Model: "gpt-mini", Success: true, LatencyMs: 500})
	RecordChannelProbe([]string{"fast"}, ProbeSample{Timestamp: 102, Model: "gpt-mini", Success: true, LatencyMs: 9000})
	RecordChannelProbe([]string{"fast"}, ProbeSample{Timestamp: 103, Model: "gpt-mini", Success: false, LatencyMs: 30000})

	summary := GetGroupProbeSummary("fast")
	require.NotNil(t, summary)
	assert.Equal(t, int64(30000), summary.LatencyMs)
	assert.Equal(t, int64(500), summary.MedianLatencyMs)
	assert.Equal(t, 4, summary.RecentSamples)
}

func TestRecordRelayResultUsesAttemptStartTime(t *testing.T) {
	now := time.Now()
	info := &relaycommon.RelayInfo{
		OriginModelName:   "gpt-attempt-timing-test",
		UsingGroup:        "fallback-group",
		IsStream:          true,
		StartTime:         now.Add(-20 * time.Second),
		AttemptStartTime:  now.Add(-500 * time.Millisecond),
		FirstResponseTime: now.Add(-300 * time.Millisecond),
	}

	RecordRelayResult(context.Background(), info, nil)

	bucketKeyMatch := bucketKey{
		model:    "gpt-attempt-timing-test",
		group:    "fallback-group",
		bucketTs: bucketStart(now.Unix()),
	}
	raw, ok := hotBuckets.Load(bucketKeyMatch)
	require.True(t, ok)
	snap := raw.(*atomicBucket).snapshot()
	t.Cleanup(func() { hotBuckets.Delete(bucketKeyMatch) })

	assert.Equal(t, int64(1), snap.requestCount)
	// Attempt TTFT is ~200ms (not 19.7s from the earlier failed attempt).
	assert.Less(t, snap.ttftSumMs, int64(2000))
	assert.Less(t, snap.totalLatencyMs, int64(2000))
}
