package console_setting

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseSitePopupsValidAndInvalid(t *testing.T) {
	empty, err := ParseSitePopups("[]")
	require.NoError(t, err)
	assert.Empty(t, empty)

	valid := `[
		{
			"id": "sign-up-qq-only",
			"enabled": true,
			"trigger": "sign_up",
			"title": "新站启航 · 注册提示",
			"content": "目前仅支持 **QQ 邮箱**（@qq.com）注册。",
			"tone": "info",
			"confirm_text": "我知道了",
			"frequency": "session"
		},
		{
			"id": "console-disclaimer",
			"enabled": false,
			"trigger": "console",
			"title": "免责声明",
			"content": "请合规使用接口服务。",
			"tone": "warning",
			"require_confirm": true,
			"checkbox_label": "我已阅读并同意免责声明",
			"confirm_text": "同意并继续",
			"frequency": "once",
			"version": 2
		}
	]`
	parsed, err := ParseSitePopups(valid)
	require.NoError(t, err)
	require.Len(t, parsed, 2)
	assert.Equal(t, 1, parsed[0].Version)
	assert.Equal(t, "sign_up", parsed[0].Trigger)
	assert.True(t, parsed[1].RequireConfirm)
	assert.Equal(t, 2, parsed[1].Version)

	settings := GetConsoleSetting()
	previous := settings.SitePopups
	t.Cleanup(func() { settings.SitePopups = previous })
	settings.SitePopups = valid
	published := GetEnabledSitePopups()
	require.Len(t, published, 1)
	assert.Equal(t, "sign-up-qq-only", published[0].ID)

	invalidCases := []string{
		`not-json`,
		`{}`,
		`null`,
		`[{"id":"bad id","enabled":true,"trigger":"sign_up","title":"T","content":"C"}]`,
		`[{"id":"dup","enabled":true,"trigger":"sign_up","title":"T","content":"C"},{"id":"dup","enabled":true,"trigger":"console","title":"T","content":"C"}]`,
		`[{"id":"bad-trigger","enabled":true,"trigger":"pricing","title":"T","content":"C"}]`,
		`[{"id":"bad-tone","enabled":true,"trigger":"sign_up","title":"T","content":"C","tone":"danger"}]`,
		`[{"id":"bad-freq","enabled":true,"trigger":"sign_up","title":"T","content":"C","frequency":"weekly"}]`,
		`[{"id":"empty-title","enabled":true,"trigger":"sign_up","title":"   ","content":"C"}]`,
		`[{"id":"empty-content","enabled":true,"trigger":"sign_up","title":"T","content":"   "}]`,
		strings.Repeat(" ", MaxSitePopupsBytes+1),
	}
	for _, bad := range invalidCases {
		_, parseErr := ParseSitePopups(bad)
		assert.Error(t, parseErr, "expected error for input: %s", bad[:min(len(bad), 80)])
	}
}
