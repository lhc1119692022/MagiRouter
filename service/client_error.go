package service

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/MoeForge/moego/regexp"
	"github.com/QuantumNous/new-api/common"
	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

const (
	genericUpstreamUnavailableMessage = "Upstream service is temporarily unavailable, please try again later"
	genericUpstreamBusyMessage        = "Upstream service is temporarily busy, please try again later"
	genericUpstreamTimeoutMessage     = "Upstream service timed out, please try again later"
	genericInvalidRequestMessage      = "Invalid request"
)

var (
	clientErrorURLPattern = regexp.MustCompile(`(?:https?|wss?)://[^\s"<>{}]+`)
	// Strips upstream relay/provider trace tails such as "(request id: ...)" or "[trace_id=...]".
	clientErrorWrappedTraceIDPattern = regexp.MustCompile(`(?i)\s*[\(\[（【]\s*(?:request|trace|req|log|upstream(?:[_\s-]request)?)\s*[_\s-]*id\s*[:=]\s*[^)\]）】]+[\)\]）】]`)
	clientErrorInlineTraceIDPattern  = regexp.MustCompile(`(?i)\b(?:request_id|trace_id|req_id|log_id|x-request-id|x-oneapi-request-id)\s*[:=]\s*[A-Za-z0-9._-]+`)
	clientErrorChannelTagPattern     = regexp.MustCompile(`(?i)\s*[\(\[]?\s*channel\s*#?\d+\s*[\)\]]?`)
	clientErrorMultiSpacePattern     = regexp.MustCompile(`[ \t]{2,}`)
)

var upstreamLeakKeywords = []string{
	"credit balance is too low",
	"insufficient_quota",
	"insufficient quota",
	"exceeded your current quota",
	"billing hard limit",
	"account is not active",
	"organization has been disabled",
	"invalid_api_key",
	"incorrect api key",
	"invalid x-api-key",
	"no available channel",
	"无可用渠道",
	"当前分组",
	"负载已饱和",
	"channel #",
	"upstream error",
	"bad response status code",
	"one-api",
	"new-api",
	"oneapi",
	"newapi",
	"openrouter",
}

type sanitizedClientError struct {
	message     string
	openaiType  string
	openaiCode  any
	openaiParam string
	claudeType  string
	generalized bool
}

// SanitizeClientOpenAIError formats a NewAPIError for client-facing OpenAI/Responses/Realtime
// responses. Local gateway errors retain their original actionable message; upstream errors
// are sanitized by tier so upstream infrastructure, credentials, and relay chains are never leaked.
func SanitizeClientOpenAIError(apiErr *types.NewAPIError, requestID string, upstreamURLs ...string) types.OpenAIError {
	if apiErr == nil {
		return types.OpenAIError{}
	}
	sanitized := buildSanitizedClientError(apiErr, upstreamURLs...)
	return types.OpenAIError{
		Message: appendLocalRequestID(sanitized.message, requestID),
		Type:    sanitized.openaiType,
		Param:   sanitized.openaiParam,
		Code:    sanitized.openaiCode,
	}
}

// SanitizeClientClaudeError formats a NewAPIError for client-facing Claude responses.
func SanitizeClientClaudeError(apiErr *types.NewAPIError, requestID string, upstreamURLs ...string) types.ClaudeError {
	if apiErr == nil {
		return types.ClaudeError{}
	}
	sanitized := buildSanitizedClientError(apiErr, upstreamURLs...)
	return types.ClaudeError{
		Type:    sanitized.claudeType,
		Message: appendLocalRequestID(sanitized.message, requestID),
	}
}

// SanitizeClientErrorMessage returns the client-safe error text without status code or request ID.
func SanitizeClientErrorMessage(apiErr *types.NewAPIError, upstreamURLs ...string) string {
	if apiErr == nil {
		return ""
	}
	return buildSanitizedClientError(apiErr, upstreamURLs...).message
}

// SanitizeClientErrorWithStatusCode formats the client-safe error text with status_code prefix
// for user-visible error logs.
func SanitizeClientErrorWithStatusCode(apiErr *types.NewAPIError, upstreamURLs ...string) string {
	if apiErr == nil {
		return ""
	}
	msg := SanitizeClientErrorMessage(apiErr, upstreamURLs...)
	if apiErr.StatusCode == 0 {
		return msg
	}
	if msg == "" {
		return fmt.Sprintf("status_code=%d", apiErr.StatusCode)
	}
	return fmt.Sprintf("status_code=%d, %s", apiErr.StatusCode, msg)
}

// SanitizeClientErrorPublicMeta returns user-safe error_type and error_code values for public log metadata.
func SanitizeClientErrorPublicMeta(apiErr *types.NewAPIError, upstreamURLs ...string) (string, string) {
	if apiErr == nil {
		return "", ""
	}
	sanitized := buildSanitizedClientError(apiErr, upstreamURLs...)
	if !sanitized.generalized {
		return string(apiErr.GetErrorType()), string(apiErr.GetErrorCode())
	}
	code := ""
	if sanitized.openaiCode != nil {
		code = fmt.Sprintf("%v", sanitized.openaiCode)
	}
	return sanitized.openaiType, code
}

// SanitizeTaskErrorMessage applies tiered upstream error sanitization to task/image errors.
func SanitizeTaskErrorMessage(statusCode int, rawMessage string, localError bool, upstreamURLs ...string) string {
	if localError {
		return common.MaskSensitiveInfo(rawMessage, upstreamURLs...)
	}
	if shouldGeneralizeStatusOrMessage(statusCode, "", rawMessage) {
		return genericMessageForStatus(statusCode, "")
	}
	cleaned := scrubUpstreamErrorText(rawMessage, upstreamURLs...)
	if cleaned == "" {
		return genericInvalidRequestMessage
	}
	return cleaned
}

func buildSanitizedClientError(apiErr *types.NewAPIError, upstreamURLs ...string) sanitizedClientError {
	if isLocalGatewayError(apiErr) {
		openAIErr := apiErr.ToOpenAIError(upstreamURLs...)
		claudeErr := apiErr.ToClaudeError(upstreamURLs...)
		return sanitizedClientError{
			message:     openAIErr.Message,
			openaiType:  openAIErr.Type,
			openaiCode:  openAIErr.Code,
			openaiParam: openAIErr.Param,
			claudeType:  claudeErr.Type,
			generalized: false,
		}
	}

	rawMsg := extractRawUpstreamMessage(apiErr)
	if types.IsChannelError(apiErr) || shouldGeneralizeStatusOrMessage(apiErr.StatusCode, apiErr.GetErrorCode(), rawMsg) {
		return buildGeneralizedClientError(apiErr.StatusCode, apiErr.GetErrorCode())
	}

	cleanedMsg := scrubUpstreamErrorText(rawMsg, upstreamURLs...)
	if cleanedMsg == "" {
		cleanedMsg = genericInvalidRequestMessage
	}

	openAIErr := apiErr.ToOpenAIError(upstreamURLs...)
	claudeErr := apiErr.ToClaudeError(upstreamURLs...)

	openaiType := sanitizeClientErrorToken(openAIErr.Type, "invalid_request_error")
	claudeType := sanitizeClientErrorToken(claudeErr.Type, "invalid_request_error")
	openaiCode := sanitizeClientErrorCode(openAIErr.Code)
	openaiParam := scrubUpstreamErrorText(openAIErr.Param, upstreamURLs...)

	return sanitizedClientError{
		message:     cleanedMsg,
		openaiType:  openaiType,
		openaiCode:  openaiCode,
		openaiParam: openaiParam,
		claudeType:  claudeType,
		generalized: false,
	}
}

func isLocalGatewayError(apiErr *types.NewAPIError) bool {
	if apiErr == nil {
		return true
	}
	if types.IsChannelError(apiErr) {
		return false
	}
	if !types.IsRecordErrorLog(apiErr) {
		return true
	}
	switch apiErr.GetErrorCode() {
	case types.ErrorCodeInsufficientUserQuota,
		types.ErrorCodePreConsumeTokenQuotaFailed,
		types.ErrorCodeAccessDenied,
		types.ErrorCodeSensitiveWordsDetected,
		types.ErrorCodeRequestRejected,
		types.ErrorCodeRequestPluginFailed,
		types.ErrorCodeResponseRejected,
		types.ErrorCodeViolationFeeGrokCSAM,
		types.ErrorCodeCountTokenFailed,
		types.ErrorCodeModelPriceError,
		types.ErrorCodeReadRequestBodyFailed,
		types.ErrorCodeConvertRequestFailed,
		types.ErrorCodeBadRequestBody,
		types.ErrorCodeGetChannelFailed,
		types.ErrorCodeGenRelayInfoFailed,
		types.ErrorCodeInvalidApiType:
		return true
	case types.ErrorCodeDoRequestFailed,
		types.ErrorCodeReadResponseBodyFailed,
		types.ErrorCodeBadResponseStatusCode,
		types.ErrorCodeBadResponse,
		types.ErrorCodeBadResponseBody,
		types.ErrorCodeEmptyResponse,
		types.ErrorCodeAwsInvokeError:
		return false
	}
	if apiErr.GetErrorType() == types.ErrorTypeNewAPIError {
		return true
	}
	return false
}

func shouldGeneralizeStatusOrMessage(statusCode int, errorCode types.ErrorCode, message string) bool {
	switch errorCode {
	case types.ErrorCodeDoRequestFailed,
		types.ErrorCodeReadResponseBodyFailed,
		types.ErrorCodeBadResponse,
		types.ErrorCodeBadResponseBody,
		types.ErrorCodeEmptyResponse,
		types.ErrorCodeAwsInvokeError,
		types.ErrorCodeChannelResponseTimeExceeded:
		return true
	}
	switch {
	case statusCode <= 0,
		statusCode >= http.StatusInternalServerError,
		statusCode == http.StatusUnauthorized,
		statusCode == http.StatusPaymentRequired,
		statusCode == http.StatusForbidden,
		statusCode == http.StatusProxyAuthRequired,
		statusCode == http.StatusRequestTimeout,
		statusCode == http.StatusTooManyRequests:
		return true
	}
	return containsUpstreamLeakKeyword(message)
}

func containsUpstreamLeakKeyword(message string) bool {
	if message == "" {
		return false
	}
	lower := strings.ToLower(message)
	for _, kw := range upstreamLeakKeywords {
		if strings.Contains(lower, kw) {
			return true
		}
	}
	for _, kw := range operation_setting.AutomaticDisableKeywords {
		kw = strings.TrimSpace(strings.ToLower(kw))
		if kw != "" && strings.Contains(lower, kw) {
			return true
		}
	}
	return false
}

func genericMessageForStatus(statusCode int, errorCode types.ErrorCode) string {
	if statusCode == http.StatusTooManyRequests {
		return genericUpstreamBusyMessage
	}
	if statusCode == http.StatusGatewayTimeout || statusCode == http.StatusRequestTimeout || errorCode == types.ErrorCodeChannelResponseTimeExceeded {
		return genericUpstreamTimeoutMessage
	}
	return genericUpstreamUnavailableMessage
}

func buildGeneralizedClientError(statusCode int, errorCode types.ErrorCode) sanitizedClientError {
	if statusCode == http.StatusTooManyRequests {
		return sanitizedClientError{
			message:     genericUpstreamBusyMessage,
			openaiType:  "rate_limit_error",
			openaiCode:  "rate_limit_exceeded",
			claudeType:  "rate_limit_error",
			generalized: true,
		}
	}
	if statusCode == http.StatusGatewayTimeout || statusCode == http.StatusRequestTimeout || errorCode == types.ErrorCodeChannelResponseTimeExceeded {
		return sanitizedClientError{
			message:     genericUpstreamTimeoutMessage,
			openaiType:  "upstream_error",
			openaiCode:  "upstream_timeout",
			claudeType:  "api_error",
			generalized: true,
		}
	}
	return sanitizedClientError{
		message:     genericUpstreamUnavailableMessage,
		openaiType:  "upstream_error",
		openaiCode:  "upstream_error",
		claudeType:  "api_error",
		generalized: true,
	}
}

func extractRawUpstreamMessage(apiErr *types.NewAPIError) string {
	var msg string
	switch apiErr.GetErrorType() {
	case types.ErrorTypeOpenAIError:
		if openAIErr, ok := apiErr.RelayError.(types.OpenAIError); ok && openAIErr.Message != "" {
			msg = openAIErr.Message
		}
	case types.ErrorTypeClaudeError:
		if claudeErr, ok := apiErr.RelayError.(types.ClaudeError); ok && claudeErr.Message != "" {
			msg = claudeErr.Message
		}
	}
	if msg == "" {
		msg = apiErr.Error()
	}
	if len(apiErr.Metadata) > 0 {
		suffix := fmt.Sprintf(" (%s)", apiErr.Metadata)
		msg = strings.TrimSuffix(msg, suffix)
	}
	return strings.TrimSpace(msg)
}

func scrubUpstreamErrorText(msg string, upstreamURLs ...string) string {
	if msg == "" {
		return ""
	}
	cleaned := common.MaskSensitiveInfo(msg, upstreamURLs...)
	cleaned = clientErrorURLPattern.ReplaceAllStringFunc(cleaned, func(match string) string {
		urlPart := strings.TrimRight(match, ".,;:!?')")
		suffix := match[len(urlPart):]
		return "[redacted-url]" + suffix
	})
	cleaned = clientErrorWrappedTraceIDPattern.ReplaceAllString(cleaned, "")
	cleaned = clientErrorInlineTraceIDPattern.ReplaceAllString(cleaned, "")
	cleaned = clientErrorChannelTagPattern.ReplaceAllString(cleaned, "")
	cleaned = clientErrorMultiSpacePattern.ReplaceAllString(cleaned, " ")
	cleaned = strings.TrimSpace(cleaned)
	cleaned = strings.TrimRight(cleaned, ",;:-")
	return strings.TrimSpace(cleaned)
}

func sanitizeClientErrorToken(token string, fallback string) string {
	trimmed := strings.TrimSpace(token)
	if trimmed == "" || clientErrorURLPattern.MatchString(trimmed) || containsUpstreamLeakKeyword(trimmed) || strings.HasPrefix(strings.ToLower(trimmed), "channel:") {
		return fallback
	}
	return trimmed
}

func sanitizeClientErrorCode(code any) any {
	if code == nil {
		return nil
	}
	str, ok := code.(string)
	if !ok {
		return code
	}
	trimmed := strings.TrimSpace(str)
	if trimmed == "" {
		return ""
	}
	if clientErrorURLPattern.MatchString(trimmed) || containsUpstreamLeakKeyword(trimmed) || strings.HasPrefix(strings.ToLower(trimmed), "channel:") {
		return "invalid_request_error"
	}
	return trimmed
}

func appendLocalRequestID(message string, requestID string) string {
	if requestID == "" {
		return message
	}
	suffix := fmt.Sprintf("(request id: %s)", requestID)
	if strings.HasSuffix(message, suffix) {
		return message
	}
	return common.MessageWithRequestId(message, requestID)
}

// SanitizeTaskErrorForClient scrubs or generalizes a non-local TaskError before sending to a client.
func SanitizeTaskErrorForClient(taskErr *taskdto.TaskError, upstreamURLs ...string) {
	if taskErr == nil || taskErr.LocalError {
		return
	}
	rawMessage := taskErr.Message
	generalized := shouldGeneralizeStatusOrMessage(taskErr.StatusCode, types.ErrorCode(taskErr.Code), rawMessage)
	taskErr.Message = SanitizeTaskErrorMessage(taskErr.StatusCode, rawMessage, false, upstreamURLs...)
	if generalized {
		if taskErr.StatusCode == http.StatusTooManyRequests {
			taskErr.Code = "rate_limit_exceeded"
		} else {
			taskErr.Code = "upstream_error"
		}
	}
}
