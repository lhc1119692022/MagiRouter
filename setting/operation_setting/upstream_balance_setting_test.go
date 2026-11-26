package operation_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeUpstreamSiteKey(t *testing.T) {
	assert.Equal(t, "https://api.example.com", NormalizeUpstreamSiteKey("https://API.Example.com/"))
	assert.Equal(t, "https://api.example.com", NormalizeUpstreamSiteKey("https://api.example.com/v1"))
	assert.Equal(t, "https://api.example.com", NormalizeUpstreamSiteKey("https://api.example.com/v1/"))
	assert.Equal(t, "https://api.example.com", NormalizeUpstreamSiteKey("https://api.example.com/v1beta/"))
	assert.Equal(t, "https://api.example.com/proxy", NormalizeUpstreamSiteKey("https://api.example.com/proxy/v1"))
	assert.Equal(t, "", NormalizeUpstreamSiteKey("   "))
}

func TestUpstreamBalanceSettingValidationAndSecrets(t *testing.T) {
	minCNY := 50.0
	minPct := 20.0
	rate := 2.0
	existing := UpstreamBalanceSetting{
		Enabled:              true,
		CheckIntervalMinutes: 30,
		AlertCooldownMinutes: 720,
		NotifyEmails:         "ops@example.com",
		DefaultMinBalanceCNY: &minCNY,
		DefaultMinPercent:    &minPct,
		Sites: map[string]UpstreamBalanceSiteConfig{
			"https://relay.example.com": {
				Name:         "Relay A",
				ProviderType: UpstreamBalanceProviderNewAPI,
				CNYRate:      &rate,
				AccessToken:  "secret-pat-123",
				UserID:       "42",
			},
		},
		Channels: map[string]UpstreamBalanceChannelConfig{},
	}
	require.NoError(t, existing.Validate())

	// Redacted removes AccessToken but marks HasAccessToken.
	redacted := existing.Redacted()
	assert.Empty(t, redacted.Sites["https://relay.example.com"].AccessToken)
	assert.True(t, redacted.Sites["https://relay.example.com"].HasAccessToken)

	// Merging without a new AccessToken preserves the existing secret.
	incoming := redacted
	incoming.Sites["https://relay.example.com"] = UpstreamBalanceSiteConfig{
		Name:         "Relay A Renamed",
		ProviderType: UpstreamBalanceProviderNewAPI,
		CNYRate:      &rate,
		UserID:       "42",
	}
	merged := incoming.MergeSecrets(existing).Normalized()
	assert.Equal(t, "secret-pat-123", merged.Sites["https://relay.example.com"].AccessToken)
	assert.True(t, merged.Sites["https://relay.example.com"].HasAccessToken)

	// ClearAccessToken wipes the stored secret.
	clearReq := incoming
	site := clearReq.Sites["https://relay.example.com"]
	site.ClearAccessToken = true
	clearReq.Sites["https://relay.example.com"] = site
	cleared := clearReq.MergeSecrets(existing).Normalized()
	assert.Empty(t, cleared.Sites["https://relay.example.com"].AccessToken)
	assert.False(t, cleared.Sites["https://relay.example.com"].HasAccessToken)

	// Invalid fields fail validation.
	badEmail := existing
	badEmail.NotifyEmails = "not-an-email"
	require.Error(t, badEmail.Validate())

	badInterval := existing
	badInterval.CheckIntervalMinutes = 2
	require.Error(t, badInterval.Validate())

	badPctVal := 120.0
	badPct := existing
	badPct.DefaultMinPercent = &badPctVal
	require.Error(t, badPct.Validate())
}
