package common

import (
	"crypto/rand"
	"crypto/subtle"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type verificationValue struct {
	code           string
	time           time.Time
	failedAttempts int
}

const (
	EmailVerificationPurpose = "v"
	PasswordResetPurpose     = "r"
)

var verificationMutex sync.Mutex
var verificationMap map[string]verificationValue
var verificationMapMaxSize = 10
var VerificationValidMinutes = 10
var VerificationMaxAttempts = 5

func GenerateVerificationCode(length int) string {
	code := uuid.New().String()
	code = strings.Replace(code, "-", "", -1)
	if length == 0 {
		return code
	}
	return code[:length]
}

func GenerateNumericVerificationCode(length int) (string, error) {
	if length <= 0 {
		return "", fmt.Errorf("verification code length must be positive")
	}
	ten := big.NewInt(10)
	var builder strings.Builder
	builder.Grow(length)
	for range length {
		digit, err := rand.Int(rand.Reader, ten)
		if err != nil {
			return "", err
		}
		builder.WriteByte(byte('0' + digit.Int64()))
	}
	return builder.String(), nil
}

func RegisterVerificationCodeWithKey(key string, code string, purpose string) {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	verificationMap[purpose+key] = verificationValue{
		code: code,
		time: time.Now(),
	}
	if len(verificationMap) > verificationMapMaxSize {
		removeExpiredPairs()
	}
}

func VerifyCodeWithKey(key string, code string, purpose string) bool {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	mapKey := purpose + key
	value, okay := verificationMap[mapKey]
	now := time.Now()
	if !okay {
		return false
	}
	if now.Sub(value.time) >= time.Duration(VerificationValidMinutes)*time.Minute {
		delete(verificationMap, mapKey)
		return false
	}
	if subtle.ConstantTimeCompare([]byte(code), []byte(value.code)) == 1 {
		return true
	}
	value.failedAttempts++
	if VerificationMaxAttempts > 0 && value.failedAttempts >= VerificationMaxAttempts {
		delete(verificationMap, mapKey)
	} else {
		verificationMap[mapKey] = value
	}
	return false
}

func DeleteKey(key string, purpose string) {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	delete(verificationMap, purpose+key)
}

// no lock inside, so the caller must lock the verificationMap before calling!
func removeExpiredPairs() {
	now := time.Now()
	for key := range verificationMap {
		if now.Sub(verificationMap[key].time) >= time.Duration(VerificationValidMinutes)*time.Minute {
			delete(verificationMap, key)
		}
	}
}

func init() {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	verificationMap = make(map[string]verificationValue)
}
