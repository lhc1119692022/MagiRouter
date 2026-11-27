package perfmetrics

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRecordChannelProbeAndSummary(t *testing.T) {
	ResetChannelProbesForTest()
	t.Cleanup(ResetChannelProbesForTest)

	now := time.Now().Unix()
	RecordChannelProbe([]string{"default", "default", "vip"}, ProbeSample{
		Timestamp: now - 120,
		Model:     "gpt-4o-mini",
		Success:   true,
		LatencyMs: 310,
	})
	RecordChannelProbe([]string{"default"}, ProbeSample{
		Timestamp: now - 60,
		Model:     "claude-sonnet-4-5",
		Success:   false,
		LatencyMs: 2400,
	})
	RecordChannelProbe([]string{"default"}, ProbeSample{
		Timestamp: now,
		Model:     "gemini-2.5-flash",
		Success:   true,
		LatencyMs: 280,
	})

	summary := GetGroupProbeSummary("default")
	require.NotNil(t, summary)
	assert.Equal(t, now, summary.LastTestedAt)
	assert.Equal(t, "gemini-2.5-flash", summary.TestedModel)
	assert.True(t, summary.Success)
	assert.Equal(t, int64(280), summary.LatencyMs)
	assert.Equal(t, 3, summary.RecentSamples)
	assert.InDelta(t, 66.67, summary.RecentSuccessRate, 0.01)
	assert.Equal(t, []string{"gemini-2.5-flash", "claude-sonnet-4-5", "gpt-4o-mini"}, summary.RecentModels)

	vipSummary := GetGroupProbeSummary("vip")
	require.NotNil(t, vipSummary)
	assert.Equal(t, 1, vipSummary.RecentSamples)
	assert.Equal(t, float64(100), vipSummary.RecentSuccessRate)
	assert.Nil(t, GetGroupProbeSummary("unknown"))

	filtered := GetGroupProbeSummaryForModels("default", []string{"gpt-4o-mini", "gemini-2.5-flash"})
	require.NotNil(t, filtered)
	assert.Equal(t, 2, filtered.RecentSamples)
	assert.Equal(t, float64(100), filtered.RecentSuccessRate)
	assert.Equal(t, []string{"gemini-2.5-flash", "gpt-4o-mini"}, filtered.RecentModels)

	assert.Nil(t, GetGroupProbeSummaryForModels("default", []string{"non-existent-model"}))
	assert.Nil(t, GetGroupProbeSummaryForModels("default", []string{}))
}

func TestClassifyModelCapabilities(t *testing.T) {
	assert.Equal(t, []string{ModelKindText}, ClassifyModelCapabilities("claude-sonnet-4-5", "", nil))
	assert.Equal(t, []string{ModelKindImage}, ClassifyModelCapabilities("gpt-image-1", "", nil))
	assert.Equal(t, []string{ModelKindVideo}, ClassifyModelCapabilities("sora-2", "", nil))
	assert.Equal(t, []string{ModelKindAudio}, ClassifyModelCapabilities("tts-1-hd", "", nil))
	assert.Equal(t, []string{ModelKindTranscription}, ClassifyModelCapabilities("whisper-1", "", nil))
	assert.Equal(t, []string{ModelKindOther}, ClassifyModelCapabilities("text-embedding-3-large", "", nil))

	// Explicit Model Management catalog tag takes precedence over name heuristic
	assert.Equal(
		t,
		[]string{ModelKindImage, ModelKindVideo},
		ClassifyModelCapabilities("custom-studio-v2", "featured,@mr:catalog:v1=video+image", nil),
	)
	// Legacy task tag also maps cleanly
	assert.Equal(
		t,
		[]string{ModelKindTranscription},
		ClassifyModelCapabilities("custom-asr", "@mr:tasks:v1=stt", nil),
	)
	// Endpoint hint enriches models with generic names
	assert.Equal(
		t,
		[]string{ModelKindVideo},
		ClassifyModelCapabilities("custom-gen-v1", "", []string{"openai-video"}),
	)
	assert.True(t, IsRandomTestExcludedByDefault("whisper-1"))
}
