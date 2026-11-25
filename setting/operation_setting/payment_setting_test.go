package operation_setting

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefaultDailyTopUpLimitIs200(t *testing.T) {
	assert.Equal(t, 200.0, DefaultDailyTopUpLimit)
	assert.Equal(t, 200.0, GetPaymentSetting().DailyTopUpLimit)
}

func TestDailyTopUpLimitConfigIsUserExempt(t *testing.T) {
	cfg := DailyTopUpLimitConfig{
		Limit:       200,
		ExemptUsers: []string{" 42 ", "#77", "Alice", "vip@example.com"},
	}

	assert.True(t, cfg.IsUserExempt(42, "someone", ""))
	assert.True(t, cfg.IsUserExempt(77, "someone", ""))
	assert.True(t, cfg.IsUserExempt(99, "alice", ""))
	assert.True(t, cfg.IsUserExempt(99, "bob", "VIP@EXAMPLE.COM"))
	assert.False(t, cfg.IsUserExempt(99, "42", ""), "numeric entry must match user id only, not username spoofing")
	assert.False(t, cfg.IsUserExempt(99, "charlie", "charlie@example.com"))
}

func TestValidateDailyTopUpOption(t *testing.T) {
	require.NoError(t, ValidateDailyTopUpOption(DailyTopUpLimitOptionKey, "0"))
	require.NoError(t, ValidateDailyTopUpOption(DailyTopUpLimitOptionKey, "200"))
	require.NoError(t, ValidateDailyTopUpOption(DailyTopUpLimitOptionKey, "199.50"))
	require.Error(t, ValidateDailyTopUpOption(DailyTopUpLimitOptionKey, "-1"))
	require.Error(t, ValidateDailyTopUpOption(DailyTopUpLimitOptionKey, "NaN"))
	require.Error(t, ValidateDailyTopUpOption(DailyTopUpLimitOptionKey, "invalid"))

	require.NoError(t, ValidateDailyTopUpOption(DailyTopUpExemptUsersOptionKey, `["42","alice"]`))
	require.NoError(t, ValidateDailyTopUpOption(DailyTopUpExemptUsersOptionKey, `[]`))
	require.Error(t, ValidateDailyTopUpOption(DailyTopUpExemptUsersOptionKey, `{"id":42}`))
	require.Error(t, ValidateDailyTopUpOption(DailyTopUpExemptUsersOptionKey, `not-json`))

	validPNGDataURL := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+8X8AAAAASUVORK5CYII="
	require.NoError(t, ValidateDailyTopUpOption(DailyTopUpContactWeChatQRCodeOptionKey, ""))
	require.NoError(t, ValidateDailyTopUpOption(DailyTopUpContactWeChatQRCodeOptionKey, "https://cdn.example.com/wechat-qr.png"))
	require.NoError(t, ValidateDailyTopUpOption(DailyTopUpContactWeChatQRCodeOptionKey, "/images/wechat-qr.png"))
	require.NoError(t, ValidateDailyTopUpOption(DailyTopUpContactWeChatQRCodeOptionKey, validPNGDataURL))
	require.Error(t, ValidateDailyTopUpOption(DailyTopUpContactWeChatQRCodeOptionKey, "javascript:alert(1)"))
	require.Error(t, ValidateDailyTopUpOption(DailyTopUpContactWeChatQRCodeOptionKey, "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="))
	require.Error(t, ValidateDailyTopUpOption(DailyTopUpContactWeChatQRCodeOptionKey, "//evil.example.com/qr.png"))
	require.Error(t, ValidateDailyTopUpOption(DailyTopUpContactWeChatQRCodeOptionKey, "data:image/png;base64,"+strings.Repeat("A", MaxDailyTopUpQRCodeLength)))

	require.NoError(t, ValidateDailyTopUpOption(DailyTopUpContactNoteOptionKey, "Scan WeChat QR code for large top-ups"))
	require.Error(t, ValidateDailyTopUpOption(DailyTopUpContactNoteOptionKey, strings.Repeat("a", MaxDailyTopUpContactNoteRunes+1)))
}
