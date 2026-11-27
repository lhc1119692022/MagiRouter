package setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseSmartRoutingConfigJSONValidationAndNormalization(t *testing.T) {
	cfg, err := ParseSmartRoutingConfigJSON("")
	require.NoError(t, err)
	assert.Equal(t, DefaultSmartRoutingConfig(), cfg)

	parsed, err := ParseSmartRoutingConfigJSON(`{
		"enabled": true,
		"short_window_hours": 2,
		"long_window_hours": 48,
		"healthy_success_rate": 96,
		"degraded_success_rate": 75,
		"allow_outage_fallback": false,
		"cost_max_fallback_ratio": 2.5,
		"excluded_groups": ["  media ", "auto", "media", ""],
		"pinned_groups": ["vip", "auto", "vip"],
		"demoted_groups": ["cheap"]
	}`)
	require.NoError(t, err)
	assert.Equal(t, []string{"media"}, parsed.ExcludedGroups)
	assert.Equal(t, []string{"vip"}, parsed.PinnedGroups)
	assert.Equal(t, []string{"cheap"}, parsed.DemotedGroups)
	assert.Equal(t, 2.5, parsed.CostMaxFallbackRatio)
	assert.False(t, parsed.AllowOutageFallback)

	_, err = ParseSmartRoutingConfigJSON(`{"short_window_hours": 0}`)
	assert.Error(t, err)

	_, err = ParseSmartRoutingConfigJSON(`{"short_window_hours": 12, "long_window_hours": 6}`)
	assert.Error(t, err)

	_, err = ParseSmartRoutingConfigJSON(`{"healthy_success_rate": 80, "degraded_success_rate": 90}`)
	assert.Error(t, err)

	_, err = ParseSmartRoutingConfigJSON(`{"cost_max_fallback_ratio": -1}`)
	assert.Error(t, err)

	_, err = ParseSmartRoutingConfigJSON(`{"stability_weights": {"success_rate": 0, "speed": 0, "cache_hit": 0, "price_tie_break": 0}}`)
	assert.Error(t, err)
}

func TestUpdateSmartRoutingConfigInvokesChangeHooks(t *testing.T) {
	original := SmartRoutingConfig2JSONString()
	t.Cleanup(func() {
		require.NoError(t, UpdateSmartRoutingConfigByJSONString(original))
	})

	called := 0
	RegisterSmartRoutingChangeHook(func() {
		called++
	})

	require.NoError(t, UpdateSmartRoutingConfigByJSONString(`{"enabled": false, "short_window_hours": 3, "long_window_hours": 24}`))
	assert.GreaterOrEqual(t, called, 1)
	assert.False(t, GetSmartRoutingConfig().Enabled)
	assert.Equal(t, 3, GetSmartRoutingConfig().ShortWindowHours)
}
