package operation_setting

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMediaRelaySettingDefaultsAndValidation(t *testing.T) {
	defaultCfg := GetMediaRelaySettingSnapshot()
	assert.Equal(t, DefaultMediaRelayDailyTrafficMB, defaultCfg.DefaultDailyTrafficMB)

	cfg := MediaRelaySetting{DefaultDailyTrafficMB: -1}.Normalized()
	assert.Equal(t, MediaRelayProviderAliyunOSS, cfg.Provider)
	assert.Equal(t, DefaultMediaRelayEndpoint, cfg.Endpoint)
	assert.Equal(t, DefaultMediaRelayRegion, cfg.Region)
	assert.Equal(t, DefaultMediaRelayDailyTrafficMB, cfg.DefaultDailyTrafficMB)
	assert.Equal(t, 0, MediaRelaySetting{}.Normalized().DefaultDailyTrafficMB)
	assert.False(t, cfg.IsReady())
	require.NoError(t, cfg.Validate())

	cfg.Enabled = true
	assert.Error(t, cfg.Validate())

	cfg.Bucket = "magirouter-media-hk"
	cfg.AccessKeyId = "LTAI5tTestKey"
	cfg.AccessKeySecret = "secret-value"
	cfg.PublicBaseURL = "https://media-hk.magirouter.com/"
	require.NoError(t, cfg.Validate())
	assert.True(t, cfg.IsReady())
	assert.Equal(t, "https://media-hk.magirouter.com", cfg.Normalized().PublicBaseURL)
}

func TestMediaRelayTempGlobalBonusAndGroupBonus(t *testing.T) {
	now := time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)
	cfg := MediaRelaySetting{
		DefaultDailyTrafficMB: 200,
		GroupDailyBonusMB: map[string]int{
			"vip":  800,
			"svip": 1800,
		},
		TempGlobalBonusMB:   300,
		TempGlobalExpiresAt: now.Add(2 * time.Hour).Unix(),
		TempGlobalNote:      "event boost",
	}.Normalized()

	assert.Equal(t, int64(800)*BytesPerMiB, cfg.GroupBonusBytes("vip"))
	assert.Equal(t, int64(0), cfg.GroupBonusBytes("default"))

	activeBytes, expiresAt, note := cfg.ActiveGlobalTempBonusBytes(now)
	assert.Equal(t, int64(300)*BytesPerMiB, activeBytes)
	assert.Equal(t, now.Add(2*time.Hour).Unix(), expiresAt)
	assert.Equal(t, "event boost", note)

	expiredBytes, _, _ := cfg.ActiveGlobalTempBonusBytes(now.Add(3 * time.Hour))
	assert.Equal(t, int64(0), expiredBytes)
}
