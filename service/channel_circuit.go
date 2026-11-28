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
const channelFailurePruneThreshold = 256

type channelFailureState struct {
	count    int
	lastFail time.Time
}

var (
	channelFailureMu        sync.Mutex
	channelFailureStates    = make(map[int]map[string]channelFailureState)
	channelFailureActiveIDs sync.Map
	channelCircuitNow       = time.Now
)

func normalizeChannelFailureUsingKey(isMultiKey bool, usingKey string) string {
	if !isMultiKey {
		return ""
	}
	return usingKey
}

func pruneStaleChannelFailuresLocked(now time.Time) {
	for chID, keyStates := range channelFailureStates {
		for keyName, entry := range keyStates {
			if !entry.lastFail.IsZero() && now.Sub(entry.lastFail) > channelFailureStaleWindow {
				delete(keyStates, keyName)
			}
		}
		if len(keyStates) == 0 {
			delete(channelFailureStates, chID)
			channelFailureActiveIDs.Delete(chID)
		}
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
	keyName := normalizeChannelFailureUsingKey(isMultiKey, usingKey)
	now := channelCircuitNow()

	channelFailureMu.Lock()
	defer channelFailureMu.Unlock()

	if len(channelFailureStates) > channelFailurePruneThreshold {
		pruneStaleChannelFailuresLocked(now)
	}
	keyStates := channelFailureStates[channelID]
	if keyStates == nil {
		keyStates = make(map[string]channelFailureState)
		channelFailureStates[channelID] = keyStates
	}
	state := keyStates[keyName]
	if state.count > 0 && !state.lastFail.IsZero() && now.Sub(state.lastFail) > channelFailureStaleWindow {
		state.count = 0
	}
	state.count++
	state.lastFail = now
	keyStates[keyName] = state
	channelFailureActiveIDs.Store(channelID, struct{}{})
	return state.count
}

func ResetChannelFailureCount(channelID int, usingKey string) {
	if channelID <= 0 {
		return
	}
	if _, active := channelFailureActiveIDs.Load(channelID); !active {
		return
	}
	channelFailureMu.Lock()
	defer channelFailureMu.Unlock()

	keyStates, exists := channelFailureStates[channelID]
	if !exists {
		channelFailureActiveIDs.Delete(channelID)
		return
	}
	if usingKey == "" {
		delete(channelFailureStates, channelID)
		channelFailureActiveIDs.Delete(channelID)
		return
	}
	delete(keyStates, usingKey)
	delete(keyStates, "")
	if len(keyStates) == 0 {
		delete(channelFailureStates, channelID)
		channelFailureActiveIDs.Delete(channelID)
	}
}

func GetChannelFailureCount(channelID int, isMultiKey bool, usingKey string) int {
	if channelID <= 0 {
		return 0
	}
	if _, active := channelFailureActiveIDs.Load(channelID); !active {
		return 0
	}
	keyName := normalizeChannelFailureUsingKey(isMultiKey, usingKey)
	now := channelCircuitNow()

	channelFailureMu.Lock()
	defer channelFailureMu.Unlock()

	keyStates, exists := channelFailureStates[channelID]
	if !exists {
		channelFailureActiveIDs.Delete(channelID)
		return 0
	}
	state, exists := keyStates[keyName]
	if !exists {
		return 0
	}
	if !state.lastFail.IsZero() && now.Sub(state.lastFail) > channelFailureStaleWindow {
		delete(keyStates, keyName)
		if len(keyStates) == 0 {
			delete(channelFailureStates, channelID)
			channelFailureActiveIDs.Delete(channelID)
		}
		return 0
	}
	return state.count
}

func ResetAllChannelFailureCountsForTest() {
	channelFailureMu.Lock()
	defer channelFailureMu.Unlock()
	clear(channelFailureStates)
	channelFailureActiveIDs.Range(func(key, _ any) bool {
		channelFailureActiveIDs.Delete(key)
		return true
	})
}
