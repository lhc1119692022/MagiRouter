package service

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/stretchr/testify/assert"
)

func TestSanitizeClientErrorPreservesLocalGatewayErrors(t *testing.T) {
	localQuotaErr := types.NewErrorWithStatusCode(
		errors.New("user quota is not enough"),
		types.ErrorCodeInsufficientUserQuota,
		http.StatusForbidden,
		types.ErrOptionWithSkipRetry(),
		types.ErrOptionWithNoRecordErrorLog(),
	)
	out := SanitizeClientOpenAIError(localQuotaErr, "local-req-1")
	assert.Equal(t, "user quota is not enough (request id: local-req-1)", out.Message)
	assert.Equal(t, types.ErrorCodeInsufficientUserQuota, out.Code)

	localRecordedQuotaErr := types.NewErrorWithStatusCode(
		errors.New("user quota is not enough"),
		types.ErrorCodeInsufficientUserQuota,
		http.StatusForbidden,
		types.ErrOptionWithSkipRetry(),
	)
	recordedOut := SanitizeClientOpenAIError(localRecordedQuotaErr, "local-req-1b")
	assert.Equal(t, "user quota is not enough (request id: local-req-1b)", recordedOut.Message)
	assert.Equal(t, types.ErrorCodeInsufficientUserQuota, recordedOut.Code)

	localInvalidErr := types.NewError(
		errors.New("messages field is required"),
		types.ErrorCodeInvalidRequest,
		types.ErrOptionWithStatusCode(http.StatusBadRequest),
	)
	claudeOut := SanitizeClientClaudeError(localInvalidErr, "local-req-2")
	assert.Equal(t, "messages field is required (request id: local-req-2)", claudeOut.Message)
}

func TestSanitizeClientErrorGeneralizesUpstreamInfraAndAccountFailures(t *testing.T) {
	cases := []struct {
		name        string
		err         *types.NewAPIError
		wantMessage string
		wantOaiType string
		wantOaiCode any
		wantClType  string
	}{
		{
			name:        "upstream 502 with proxy host",
			err:         types.NewOpenAIError(errors.New("dial tcp 10.1.2.3:443 failed at https://upstream.relay.net"), types.ErrorCodeBadResponseStatusCode, http.StatusBadGateway),
			wantMessage: genericUpstreamUnavailableMessage + " (request id: req-1)",
			wantOaiType: "upstream_error",
			wantOaiCode: "upstream_error",
			wantClType:  "api_error",
		},
		{
			name:        "upstream 401 invalid api key",
			err:         types.WithOpenAIError(types.OpenAIError{Message: "Incorrect API key provided: sk-upstream", Type: "invalid_request_error", Code: "invalid_api_key"}, http.StatusUnauthorized),
			wantMessage: genericUpstreamUnavailableMessage + " (request id: req-1)",
			wantOaiType: "upstream_error",
			wantOaiCode: "upstream_error",
			wantClType:  "api_error",
		},
		{
			name:        "upstream 429 rate limit",
			err:         types.WithOpenAIError(types.OpenAIError{Message: "Rate limit reached for org-secret on upstream relay", Type: "tokens", Code: "rate_limit_exceeded"}, http.StatusTooManyRequests),
			wantMessage: genericUpstreamBusyMessage + " (request id: req-1)",
			wantOaiType: "rate_limit_error",
			wantOaiCode: "rate_limit_exceeded",
			wantClType:  "rate_limit_error",
		},
		{
			name:        "upstream 504 timeout",
			err:         types.NewOpenAIError(errors.New("context deadline exceeded"), types.ErrorCodeDoRequestFailed, http.StatusGatewayTimeout),
			wantMessage: genericUpstreamTimeoutMessage + " (request id: req-1)",
			wantOaiType: "upstream_error",
			wantOaiCode: "upstream_timeout",
			wantClType:  "api_error",
		},
		{
			name:        "upstream 400 leaking credit balance",
			err:         types.WithOpenAIError(types.OpenAIError{Message: "Your credit balance is too low to access the Anthropic API", Type: "invalid_request_error", Code: "invalid_request_error"}, http.StatusBadRequest),
			wantMessage: genericUpstreamUnavailableMessage + " (request id: req-1)",
			wantOaiType: "upstream_error",
			wantOaiCode: "upstream_error",
			wantClType:  "api_error",
		},
		{
			name:        "upstream 400 from nested relay with no available channel",
			err:         types.WithOpenAIError(types.OpenAIError{Message: "当前分组 default 下对于模型 gpt-5 无可用渠道 (request id: 202611250000)", Type: "new_api_error", Code: "no_channel"}, http.StatusBadRequest),
			wantMessage: genericUpstreamUnavailableMessage + " (request id: req-1)",
			wantOaiType: "upstream_error",
			wantOaiCode: "upstream_error",
			wantClType:  "api_error",
		},
		{
			name:        "upstream 403 insufficient_user_quota from nested new-api pool account",
			err:         types.WithOpenAIError(types.OpenAIError{Message: "用户额度不足, 剩余额度: ＄0.000000, 需要预扣费额度: ＄0.000100 (request id: 202611280001)", Type: "new_api_error", Code: "insufficient_user_quota"}, http.StatusForbidden),
			wantMessage: genericUpstreamUnavailableMessage + " (request id: req-1)",
			wantOaiType: "upstream_error",
			wantOaiCode: "upstream_error",
			wantClType:  "api_error",
		},
		{
			name:        "upstream 400 with insufficient_user_quota code",
			err:         types.WithOpenAIError(types.OpenAIError{Message: "request rejected", Type: "invalid_request_error", Code: "insufficient_user_quota"}, http.StatusBadRequest),
			wantMessage: genericUpstreamUnavailableMessage + " (request id: req-1)",
			wantOaiType: "upstream_error",
			wantOaiCode: "upstream_error",
			wantClType:  "api_error",
		},
		{
			name:        "upstream 400 with Chinese balance exhausted message",
			err:         types.WithOpenAIError(types.OpenAIError{Message: "账号余额不足，请充值后重试", Type: "invalid_request_error", Code: "invalid_request_error"}, http.StatusBadRequest),
			wantMessage: genericUpstreamUnavailableMessage + " (request id: req-1)",
			wantOaiType: "upstream_error",
			wantOaiCode: "upstream_error",
			wantClType:  "api_error",
		},
		{
			name:        "channel error",
			err:         types.NewErrorWithStatusCode(errors.New("channel #5 invalid key"), types.ErrorCodeChannelInvalidKey, http.StatusBadRequest),
			wantMessage: genericUpstreamUnavailableMessage + " (request id: req-1)",
			wantOaiType: "upstream_error",
			wantOaiCode: "upstream_error",
			wantClType:  "api_error",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			oai := SanitizeClientOpenAIError(tc.err, "req-1", "https://upstream.relay.net")
			assert.Equal(t, tc.wantMessage, oai.Message)
			assert.Equal(t, tc.wantOaiType, oai.Type)
			assert.Equal(t, tc.wantOaiCode, oai.Code)
			assert.Empty(t, oai.Param)
			assert.Nil(t, oai.Metadata)

			cl := SanitizeClientClaudeError(tc.err, "req-1", "https://upstream.relay.net")
			assert.Equal(t, tc.wantMessage, cl.Message)
			assert.Equal(t, tc.wantClType, cl.Type)

			pubType, pubCode := SanitizeClientErrorPublicMeta(tc.err, "https://upstream.relay.net")
			assert.Equal(t, tc.wantOaiType, pubType)
			assert.Equal(t, tc.wantOaiCode, pubCode)
			assert.NotContains(t, oai.Message, "额度不足")
		})
	}
}

func TestSanitizeClientErrorKeepsActionable4xxWhileScrubbingUpstreamTraces(t *testing.T) {
	openRouterErr := types.WithOpenAIError(types.OpenAIError{
		Message:  "This model's maximum context length is 128000 tokens. See https://upstream-source.example.org/docs (request id: 20261125999999) [trace_id: tr_abc]",
		Type:     "invalid_request_error",
		Param:    "messages",
		Code:     "context_length_exceeded",
		Metadata: json.RawMessage(`{"provider_name":"DeepInfra","raw":"secret"}`),
	}, http.StatusBadRequest)

	oai := SanitizeClientOpenAIError(openRouterErr, "local-99", "https://direct-upstream.example.com")
	assert.Equal(t, "This model's maximum context length is 128000 tokens. See [redacted-url] (request id: local-99)", oai.Message)
	assert.Equal(t, "invalid_request_error", oai.Type)
	assert.Equal(t, "context_length_exceeded", oai.Code)
	assert.Equal(t, "messages", oai.Param)
	assert.Nil(t, oai.Metadata)
	assert.NotContains(t, oai.Message, "DeepInfra")
	assert.NotContains(t, oai.Message, "20261125999999")
	assert.NotContains(t, oai.Message, "tr_abc")
	assert.NotContains(t, oai.Message, "upstream-source.example.org")
}

func TestSanitizeTaskErrorForClient(t *testing.T) {
	taskErr := &taskdto.TaskError{
		Code:       "upstream_502",
		Message:    "upstream https://source.vendor.io/tasks returned 502 (request id: up-1)",
		StatusCode: http.StatusBadGateway,
		LocalError: false,
	}
	SanitizeTaskErrorForClient(taskErr, "https://direct.relay.io")
	assert.Equal(t, genericUpstreamUnavailableMessage, taskErr.Message)
	assert.Equal(t, "upstream_error", taskErr.Code)

	badPromptErr := &taskdto.TaskError{
		Code:       "invalid_prompt",
		Message:    "Prompt violates safety policy (request id: up-2)",
		StatusCode: http.StatusBadRequest,
		LocalError: false,
	}
	SanitizeTaskErrorForClient(badPromptErr)
	assert.Equal(t, "Prompt violates safety policy", badPromptErr.Message)
	assert.Equal(t, "invalid_prompt", badPromptErr.Code)

	upstreamQuotaTaskErr := &taskdto.TaskError{
		Code:       "insufficient_user_quota",
		Message:    "request rejected",
		StatusCode: http.StatusBadRequest,
		LocalError: false,
	}
	SanitizeTaskErrorForClient(upstreamQuotaTaskErr)
	assert.Equal(t, genericUpstreamUnavailableMessage, upstreamQuotaTaskErr.Message)
	assert.Equal(t, "upstream_error", upstreamQuotaTaskErr.Code)
}
