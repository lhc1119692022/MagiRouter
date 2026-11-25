package console_setting

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseDocsConfigValidAndInvalid(t *testing.T) {
	empty, err := ParseDocsConfig("{}")
	require.NoError(t, err)
	assert.Nil(t, empty.ExampleModels)
	assert.Empty(t, empty.Articles)
	assert.Empty(t, empty.ModelOverrides)

	valid := `{
		"example_models": {
			"openai": "gpt-5.6",
			"anthropic": "claude-sonnet-4-6",
			"video": "seedance-2-0"
		},
		"articles": [
			{
				"id": "quickstart",
				"title": "快速接入指南",
				"markdown": "## 1. 接入地址\n\n使用 {{V1_URL}}",
				"endpoints": [{"method": "post", "path": "/v1/chat/completions"}],
				"snippets": {"curl": "curl {{V1_URL}}/chat/completions"}
			},
			{
				"id": "custom-sdk",
				"group": "资源",
				"title": "自定义 SDK 说明",
				"order": 2,
				"url_value": "{{BASE_URL}}/v1",
				"markdown": "## 安装\n\n直接配置即可。"
			}
		],
		"model_overrides": [
			{
				"model_id": "seedance-2-0",
				"family_name": "Seedance 系列",
				"cap": "video",
				"endpoint_path": "/v1/videos",
				"markdown": "## 参数\n\n支持 1080p。"
			}
		]
	}`
	parsed, err := ParseDocsConfig(valid)
	require.NoError(t, err)
	require.NotNil(t, parsed.ExampleModels)
	assert.Equal(t, "gpt-5.6", parsed.ExampleModels.OpenAI)
	require.Len(t, parsed.Articles, 2)
	assert.Equal(t, "POST", parsed.Articles[0].Endpoints[0].Method)
	require.Len(t, parsed.ModelOverrides, 1)
	assert.Equal(t, "video", parsed.ModelOverrides[0].Cap)

	invalidCases := []string{
		`not-json`,
		`null`,
		`[]`,
		`{"articles":[{"id":"model:bad","title":"Reserved"}]}`,
		`{"articles":[{"id":"a","group":"非法分组"}]}`,
		`{"articles":[{"id":"dup"},{"id":"dup"}]}`,
		`{"articles":[{"id":"xss","url_value":"javascript:alert(1)"}]}`,
		`{"articles":[{"id":"bad-ep","endpoints":[{"method":"PUT","path":"/v1/test"}]}]}`,
		`{"articles":[{"id":"bad-path","endpoints":[{"method":"POST","path":"v1/no-leading-slash"}]}]}`,
		`{"model_overrides":[{"model_id":"m1","cap":"3d"}]}`,
		`{"model_overrides":[{"model_id":"dup"},{"model_id":"dup"}]}`,
		`{"model_overrides":[{"model_id":"m1","endpoint_path":"relative/path"}]}`,
		strings.Repeat(" ", MaxDocsConfigBytes+1),
	}
	for _, bad := range invalidCases {
		_, parseErr := ParseDocsConfig(bad)
		assert.Error(t, parseErr, "expected error for input: %s", bad[:min(len(bad), 80)])
	}
}
