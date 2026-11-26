package common

import (
	"regexp"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateNumericVerificationCode(t *testing.T) {
	sixDigitPattern := regexp.MustCompile(`^\d{6}$`)
	seen := make(map[string]struct{})

	for range 32 {
		code, err := GenerateNumericVerificationCode(6)
		require.NoError(t, err)
		assert.True(t, sixDigitPattern.MatchString(code), "expected 6 numeric digits, got %q", code)
		seen[code] = struct{}{}
	}
	assert.Greater(t, len(seen), 1, "generated verification codes should not be constant")

	_, zeroErr := GenerateNumericVerificationCode(0)
	assert.Error(t, zeroErr)
	_, negativeErr := GenerateNumericVerificationCode(-3)
	assert.Error(t, negativeErr)
}

func TestVerifyCodeWithKeySecurityControls(t *testing.T) {
	email := "verify-controls@qq.com"
	t.Cleanup(func() {
		DeleteKey(email, EmailVerificationPurpose)
		DeleteKey(email, PasswordResetPurpose)
	})

	RegisterVerificationCodeWithKey(email, "482910", EmailVerificationPurpose)

	assert.False(t, VerifyCodeWithKey(email, "482910", PasswordResetPurpose))
	assert.True(t, VerifyCodeWithKey(email, "482910", EmailVerificationPurpose))

	DeleteKey(email, EmailVerificationPurpose)
	assert.False(t, VerifyCodeWithKey(email, "482910", EmailVerificationPurpose))

	RegisterVerificationCodeWithKey(email, "739104", EmailVerificationPurpose)
	for range VerificationMaxAttempts {
		assert.False(t, VerifyCodeWithKey(email, "000000", EmailVerificationPurpose))
	}
	assert.False(t, VerifyCodeWithKey(email, "739104", EmailVerificationPurpose), "code must be invalidated after max failed attempts")

	RegisterVerificationCodeWithKey(email, "615243", EmailVerificationPurpose)
	verificationMutex.Lock()
	entry := verificationMap[EmailVerificationPurpose+email]
	entry.time = time.Now().Add(-time.Duration(VerificationValidMinutes)*time.Minute - time.Second)
	verificationMap[EmailVerificationPurpose+email] = entry
	verificationMutex.Unlock()

	assert.False(t, VerifyCodeWithKey(email, "615243", EmailVerificationPurpose), "expired code must be rejected")
}
