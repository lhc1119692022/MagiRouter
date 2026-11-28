package service

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChannelAffinityPreservesMultiKeyIndex(t *testing.T) {
	gin.SetMode(gin.TestMode)
	affinity := operation_setting.GetChannelAffinitySetting()
	prev := *affinity
	t.Cleanup(func() {
		*affinity = prev
		ClearChannelAffinityCacheAll()
	})

	*affinity = operation_setting.ChannelAffinitySetting{
		Enabled:           true,
		DefaultTTLSeconds: 120,
		MaxEntries:        100,
		Rules: []operation_setting.ChannelAffinityRule{{
			Name:        "multi-key-pin-rule",
			ModelRegex:  []string{"^gpt-mk$"},
			SessionMode: "prefer",
			KeySources:  []operation_setting.ChannelAffinityKeySource{{Type: "request_header", Key: "X-Session-ID"}},
		}},
	}

	// Turn 1: miss -> record channel 88 + multi-key index 2.
	c1, _ := gin.CreateTestContext(httptest.NewRecorder())
	c1.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c1.Request.Header.Set("X-Session-ID", "sess-mk-1")
	_, found := GetPreferredChannelByAffinity(c1, "gpt-mk", "default")
	require.False(t, found)
	common.SetContextKey(c1, constant.ContextKeyChannelIsMultiKey, true)
	common.SetContextKey(c1, constant.ContextKeyChannelMultiKeyIndex, 2)
	RecordChannelAffinity(c1, 88)

	// Turn 2: hit -> returns both channel 88 and preferred key index 2.
	c2, _ := gin.CreateTestContext(httptest.NewRecorder())
	c2.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c2.Request.Header.Set("X-Session-ID", "sess-mk-1")
	chID, found := GetPreferredChannelByAffinity(c2, "gpt-mk", "default")
	require.True(t, found)
	assert.Equal(t, 88, chID)
	keyIdx, keyOK := GetPreferredMultiKeyIndexByAffinity(c2, 88)
	require.True(t, keyOK)
	assert.Equal(t, 2, keyIdx)

	// Mismatched channel ID must not receive another channel's key index.
	_, wrongOK := GetPreferredMultiKeyIndexByAffinity(c2, 99)
	assert.False(t, wrongOK)

	// Clearing affinity clears key index too.
	require.True(t, ClearCurrentChannelAffinityCache(c2))
	_, clearedOK := GetPreferredMultiKeyIndexByAffinity(c2, 88)
	assert.False(t, clearedOK)
}
