package service

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
)

const channelFailureStaleWindow = 6 * time.Hour

type channelFailureKey struct {
	channelID int
	usingKey  string
}

type channelFailureState struct {
	count    int
	lastFail time.Time
}

var (
	channelFailureMu     sync.Mutex
	channelFailureStates = make(map[channelFailureKey]channelFailureState)
	channelCircuitNow    = time.Now
)

func normalizeChannelFailureKey(channelID int, isMultiKey bool, usingKey string) channelFailureKey {
	if !isMultiKey {
		usingKey = ""
	}
	return channelFailureKey{
		channelID: channelID,
		usingKey:  usingKey,
	}
}

func isClientRequestCanceled(c *gin.Context, err *types.NewAPIError) bool {
	if isContextCanceledError(err) {
		return true
	}
	if c != nil && c.Request != nil && errors.Is(c.Request.Context().Err(), context.Canceled) {
		return true
	}
	return false
}

func isContextCanceledError(err *types.NewAPIError) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "context canceled") || strings.Contains(msg, "client disconnected")
}

// IsConsecutiveDisableEligibleError reports whether an error reflects an
// upstream/transport availability failure (5xx, timeout, dial/network error)
// that should count toward consecutive-failure auto-isolation. Client/local
// errors, non-retryable rejections, and 4xx validation/rate-limit errors are
// excluded.
func IsConsecutiveDisableEligibleError(err *types.NewAPIError) bool {
	if err == nil {
		return false
	}
	if types.IsSkipRetryError(err) || isContextCanceledError(err) {
		return false
	}
	switch RelayErrorSource(err) {
	case "transport":
		return true
	case "upstream":
		if err.StatusCode >= http.StatusInternalServerError && err.StatusCode <= 599 {
			return true
		}
		if err.StatusCode == http.StatusRequestTimeout {
			return true
		}
		return false
	default:
		return false
	}
}

// ClassifyChannelAttemptOutcome classifies one completed upstream attempt for
// per-channel runtime routing telemetry. Client cancellations and non-channel
// 4xx client validation rejections are ignored so they never penalize healthy
// channels.
func ClassifyChannelAttemptOutcome(c *gin.Context, err *types.NewAPIError) (ignore bool, success bool, isTimeout bool) {
	if err == nil {
		return false, true, false
	}
	if isClientRequestCanceled(c, err) {
		return true, false, false
	}
	if errors.Is(err, context.DeadlineExceeded) ||
		err.StatusCode == http.StatusRequestTimeout ||
		err.StatusCode == http.StatusGatewayTimeout {
		return false, false, true
	}
	lowerMsg := strings.ToLower(err.Error())
	if strings.Contains(lowerMsg, "timeout") || strings.Contains(lowerMsg, "deadline exceeded") {
		return false, false, true
	}
	if IsConsecutiveDisableEligibleError(err) || err.StatusCode == http.StatusTooManyRequests || types.IsChannelError(err) {
		return false, false, false
	}
	if err.StatusCode >= http.StatusBadRequest && err.StatusCode < http.StatusInternalServerError {
		return true, false, false
	}
	return false, false, false
}

func RecordChannelFailure(channelID int, isMultiKey bool, usingKey string) int {
	if channelID <= 0 {
		return 0
	}
	key := normalizeChannelFailureKey(channelID, isMultiKey, usingKey)
	now := channelCircuitNow()

	channelFailureMu.Lock()
	defer channelFailureMu.Unlock()

	state := channelFailureStates[key]
	if state.count > 0 && !state.lastFail.IsZero() && now.Sub(state.lastFail) > channelFailureStaleWindow {
		state.count = 0
	}
	state.count++
	state.lastFail = now
	channelFailureStates[key] = state
	return state.count
}

func ResetChannelFailureCount(channelID int, usingKey string) {
	if channelID <= 0 {
		return
	}
	channelFailureMu.Lock()
	defer channelFailureMu.Unlock()

	if usingKey == "" {
		for key := range channelFailureStates {
			if key.channelID == channelID {
				delete(channelFailureStates, key)
			}
		}
		return
	}
	delete(channelFailureStates, channelFailureKey{channelID: channelID, usingKey: usingKey})
	delete(channelFailureStates, channelFailureKey{channelID: channelID, usingKey: ""})
}

func GetChannelFailureCount(channelID int, isMultiKey bool, usingKey string) int {
	if channelID <= 0 {
		return 0
	}
	key := normalizeChannelFailureKey(channelID, isMultiKey, usingKey)
	now := channelCircuitNow()

	channelFailureMu.Lock()
	defer channelFailureMu.Unlock()

	state, exists := channelFailureStates[key]
	if !exists {
		return 0
	}
	if !state.lastFail.IsZero() && now.Sub(state.lastFail) > channelFailureStaleWindow {
		delete(channelFailureStates, key)
		return 0
	}
	return state.count
}

func ResetAllChannelFailureCountsForTest() {
	channelFailureMu.Lock()
	defer channelFailureMu.Unlock()
	clear(channelFailureStates)
}
