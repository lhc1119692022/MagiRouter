package setting

import (
	"fmt"
	"maps"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const (
	MaxUserConcurrencyLimit       = 100000
	MaxUserConcurrencyWaitSeconds = 300
	MaxUserConcurrencyWaitExtra   = 1000
	MinUserConcurrencySlotTTL     = 30
	MaxUserConcurrencySlotTTL     = 7200

	DefaultUserConcurrencyWaitExtra = 10
	DefaultUserConcurrencySlotTTL   = 900
)

var (
	UserConcurrencyLimitEnabled            = false
	UserConcurrencyLimitDefault            = 0
	UserConcurrencyLimitGroup              = map[string]int{}
	UserConcurrencyLimitWaitTimeoutSeconds = 0
	UserConcurrencyLimitMaxWaitExtra       = DefaultUserConcurrencyWaitExtra
	UserConcurrencyLimitSlotTTLSeconds     = DefaultUserConcurrencySlotTTL
	UserConcurrencyLimitMutex              sync.RWMutex
)

func IsUserConcurrencyLimitEnabled() bool {
	UserConcurrencyLimitMutex.RLock()
	defer UserConcurrencyLimitMutex.RUnlock()
	return UserConcurrencyLimitEnabled
}

func SetUserConcurrencyLimitEnabled(enabled bool) {
	UserConcurrencyLimitMutex.Lock()
	defer UserConcurrencyLimitMutex.Unlock()
	UserConcurrencyLimitEnabled = enabled
}

func GetUserConcurrencyLimitDefault() int {
	UserConcurrencyLimitMutex.RLock()
	defer UserConcurrencyLimitMutex.RUnlock()
	return UserConcurrencyLimitDefault
}

func SetUserConcurrencyLimitDefault(limit int) {
	UserConcurrencyLimitMutex.Lock()
	defer UserConcurrencyLimitMutex.Unlock()
	if limit < 0 {
		limit = 0
	}
	if limit > MaxUserConcurrencyLimit {
		limit = MaxUserConcurrencyLimit
	}
	UserConcurrencyLimitDefault = limit
}

func GetUserConcurrencyLimitWaitTimeoutSeconds() int {
	UserConcurrencyLimitMutex.RLock()
	defer UserConcurrencyLimitMutex.RUnlock()
	return UserConcurrencyLimitWaitTimeoutSeconds
}

func SetUserConcurrencyLimitWaitTimeoutSeconds(seconds int) {
	UserConcurrencyLimitMutex.Lock()
	defer UserConcurrencyLimitMutex.Unlock()
	if seconds < 0 {
		seconds = 0
	}
	if seconds > MaxUserConcurrencyWaitSeconds {
		seconds = MaxUserConcurrencyWaitSeconds
	}
	UserConcurrencyLimitWaitTimeoutSeconds = seconds
}

func GetUserConcurrencyLimitWaitTimeout() time.Duration {
	return time.Duration(GetUserConcurrencyLimitWaitTimeoutSeconds()) * time.Second
}

func GetUserConcurrencyLimitMaxWaitExtra() int {
	UserConcurrencyLimitMutex.RLock()
	defer UserConcurrencyLimitMutex.RUnlock()
	return UserConcurrencyLimitMaxWaitExtra
}

func SetUserConcurrencyLimitMaxWaitExtra(extra int) {
	UserConcurrencyLimitMutex.Lock()
	defer UserConcurrencyLimitMutex.Unlock()
	if extra < 0 {
		extra = 0
	}
	if extra > MaxUserConcurrencyWaitExtra {
		extra = MaxUserConcurrencyWaitExtra
	}
	UserConcurrencyLimitMaxWaitExtra = extra
}

func GetUserConcurrencyLimitSlotTTLSeconds() int {
	UserConcurrencyLimitMutex.RLock()
	defer UserConcurrencyLimitMutex.RUnlock()
	if UserConcurrencyLimitSlotTTLSeconds < MinUserConcurrencySlotTTL {
		return DefaultUserConcurrencySlotTTL
	}
	return UserConcurrencyLimitSlotTTLSeconds
}

func SetUserConcurrencyLimitSlotTTLSeconds(seconds int) {
	UserConcurrencyLimitMutex.Lock()
	defer UserConcurrencyLimitMutex.Unlock()
	if seconds < MinUserConcurrencySlotTTL {
		seconds = MinUserConcurrencySlotTTL
	}
	if seconds > MaxUserConcurrencySlotTTL {
		seconds = MaxUserConcurrencySlotTTL
	}
	UserConcurrencyLimitSlotTTLSeconds = seconds
}

func UserConcurrencyLimitGroup2JSONString() string {
	UserConcurrencyLimitMutex.RLock()
	defer UserConcurrencyLimitMutex.RUnlock()
	jsonBytes, err := common.Marshal(UserConcurrencyLimitGroup)
	if err != nil {
		common.SysError("error marshalling user concurrency limit group: " + err.Error())
		return "{}"
	}
	return string(jsonBytes)
}

func UpdateUserConcurrencyLimitGroupByJSONString(jsonStr string) error {
	parsed, err := parseUserConcurrencyLimitGroup(jsonStr)
	if err != nil {
		return err
	}
	UserConcurrencyLimitMutex.Lock()
	defer UserConcurrencyLimitMutex.Unlock()
	UserConcurrencyLimitGroup = parsed
	return nil
}

func CheckUserConcurrencyLimitGroup(jsonStr string) error {
	_, err := parseUserConcurrencyLimitGroup(jsonStr)
	return err
}

func parseUserConcurrencyLimitGroup(jsonStr string) (map[string]int, error) {
	trimmed := strings.TrimSpace(jsonStr)
	if trimmed == "" {
		return map[string]int{}, nil
	}
	parsed := make(map[string]int)
	if err := common.UnmarshalJsonStr(trimmed, &parsed); err != nil {
		return nil, err
	}
	for group, limit := range parsed {
		if strings.TrimSpace(group) == "" {
			return nil, fmt.Errorf("group name cannot be empty")
		}
		if limit < 0 || limit > MaxUserConcurrencyLimit {
			return nil, fmt.Errorf("group %s concurrency limit %d must be between 0 and %d", group, limit, MaxUserConcurrencyLimit)
		}
	}
	return parsed, nil
}

func GetUserConcurrencyLimitGroupCopy() map[string]int {
	UserConcurrencyLimitMutex.RLock()
	defer UserConcurrencyLimitMutex.RUnlock()
	copied := make(map[string]int, len(UserConcurrencyLimitGroup))
	maps.Copy(copied, UserConcurrencyLimitGroup)
	return copied
}

type UserConcurrencySummary struct {
	Enabled        bool   `json:"enabled"`
	UserOverride   int    `json:"user_override"`
	EffectiveLimit int    `json:"effective_limit"`
	Source         string `json:"source"`
}

// GetUserConcurrencySummary resolves the account-level concurrency limit and
// its source ("disabled", "user", "group", or "default").
func GetUserConcurrencySummary(userMaxConcurrency int, userGroup string) UserConcurrencySummary {
	if userMaxConcurrency < 0 {
		userMaxConcurrency = 0
	}
	UserConcurrencyLimitMutex.RLock()
	defer UserConcurrencyLimitMutex.RUnlock()
	if !UserConcurrencyLimitEnabled {
		return UserConcurrencySummary{
			Enabled:        false,
			UserOverride:   userMaxConcurrency,
			EffectiveLimit: 0,
			Source:         "disabled",
		}
	}
	if userMaxConcurrency > 0 {
		return UserConcurrencySummary{
			Enabled:        true,
			UserOverride:   userMaxConcurrency,
			EffectiveLimit: userMaxConcurrency,
			Source:         "user",
		}
	}
	if userGroup != "" {
		if limit, ok := UserConcurrencyLimitGroup[userGroup]; ok {
			return UserConcurrencySummary{
				Enabled:        true,
				UserOverride:   0,
				EffectiveLimit: limit,
				Source:         "group",
			}
		}
	}
	return UserConcurrencySummary{
		Enabled:        true,
		UserOverride:   0,
		EffectiveLimit: UserConcurrencyLimitDefault,
		Source:         "default",
	}
}

// ResolveUserConcurrencyLimit returns the effective maximum simultaneous in-flight
// requests for a user. Priority: per-user override (>0) > token group entry >
// user group entry > global default. A returned value <= 0 means unlimited.
func ResolveUserConcurrencyLimit(userMaxConcurrency int, tokenGroup string, userGroup string) int {
	if userMaxConcurrency > 0 {
		return userMaxConcurrency
	}
	UserConcurrencyLimitMutex.RLock()
	defer UserConcurrencyLimitMutex.RUnlock()
	if tokenGroup != "" {
		if limit, ok := UserConcurrencyLimitGroup[tokenGroup]; ok {
			return limit
		}
	}
	if userGroup != "" {
		if limit, ok := UserConcurrencyLimitGroup[userGroup]; ok {
			return limit
		}
	}
	return UserConcurrencyLimitDefault
}

func ValidateUserConcurrencyLimitValue(value int) error {
	if value < 0 || value > MaxUserConcurrencyLimit {
		return fmt.Errorf("user concurrency limit must be between 0 and %d", MaxUserConcurrencyLimit)
	}
	return nil
}

func ValidateUserConcurrencyWaitTimeout(seconds int) error {
	if seconds < 0 || seconds > MaxUserConcurrencyWaitSeconds {
		return fmt.Errorf("concurrency wait timeout must be between 0 and %d seconds", MaxUserConcurrencyWaitSeconds)
	}
	return nil
}

func ValidateUserConcurrencyMaxWaitExtra(extra int) error {
	if extra < 0 || extra > MaxUserConcurrencyWaitExtra {
		return fmt.Errorf("concurrency wait queue extra capacity must be between 0 and %d", MaxUserConcurrencyWaitExtra)
	}
	return nil
}

func ValidateUserConcurrencySlotTTL(seconds int) error {
	if seconds < MinUserConcurrencySlotTTL || seconds > MaxUserConcurrencySlotTTL {
		return fmt.Errorf("concurrency slot TTL must be between %d and %d seconds", MinUserConcurrencySlotTTL, MaxUserConcurrencySlotTTL)
	}
	return nil
}
