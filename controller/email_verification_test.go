package controller

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestSendEmailVerificationGeneratesSixDigitNumericCodeAndRegisterConsumesIt(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.Log{}, &model.Option{}))

	previousDB := model.DB
	previousRedis := common.RedisEnabled
	previousRegister := common.RegisterEnabled
	previousPasswordRegister := common.PasswordRegisterEnabled
	previousEmailVerify := common.EmailVerificationEnabled
	previousDomainRestrict := common.EmailDomainRestrictionEnabled
	previousDefaultToken := constant.GenerateDefaultToken
	model.DB = db
	common.RedisEnabled = false
	common.RegisterEnabled = true
	common.PasswordRegisterEnabled = true
	common.EmailVerificationEnabled = true
	common.EmailDomainRestrictionEnabled = false
	constant.GenerateDefaultToken = false
	email := "123456789@qq.com"
	t.Cleanup(func() {
		common.DeleteKey(email, common.EmailVerificationPurpose)
		model.DB = previousDB
		common.RedisEnabled = previousRedis
		common.RegisterEnabled = previousRegister
		common.PasswordRegisterEnabled = previousPasswordRegister
		common.EmailVerificationEnabled = previousEmailVerify
		common.EmailDomainRestrictionEnabled = previousDomainRestrict
		constant.GenerateDefaultToken = previousDefaultToken
	})

	configureEmailDelivery(t, map[string]string{
		"EmailProvider": "resend",
		"ResendApiKey":  "test-key",
		"ResendFrom":    "sender@example.com",
	})

	var capturedHTML string
	http.DefaultTransport = emailHTTPTransport(func(request *http.Request) (*http.Response, error) {
		var payload struct {
			HTML string `json:"html"`
		}
		rawBody, readErr := io.ReadAll(request.Body)
		require.NoError(t, readErr)
		require.NoError(t, json.Unmarshal(rawBody, &payload))
		capturedHTML = payload.HTML
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"id":"email-1"}`)),
		}, nil
	})

	sendRecorder := httptest.NewRecorder()
	sendContext, _ := gin.CreateTestContext(sendRecorder)
	sendContext.Request = httptest.NewRequest(http.MethodGet, "/api/verification?email="+email, nil)
	SendEmailVerification(sendContext)

	require.Equal(t, http.StatusOK, sendRecorder.Code)
	assert.Contains(t, sendRecorder.Body.String(), `"success":true`)

	matches := regexp.MustCompile(`<strong>([^<]+)</strong>`).FindStringSubmatch(capturedHTML)
	require.Len(t, matches, 2, "verification email HTML should include code in <strong>")
	sentCode := matches[1]
	assert.Regexp(t, `^\d{6}$`, sentCode)

	wrongBody := `{"username":"qqtester","password":"Password123!","email":"` + email + `","verification_code":"abcdef"}`
	wrongRecorder := httptest.NewRecorder()
	wrongContext, _ := gin.CreateTestContext(wrongRecorder)
	wrongContext.Request = httptest.NewRequest(http.MethodPost, "/api/user/register", strings.NewReader(wrongBody))
	wrongContext.Request.Header.Set("Content-Type", "application/json")
	Register(wrongContext)
	assert.Contains(t, wrongRecorder.Body.String(), `"success":false`)

	validBody := `{"username":"qqtester","password":"Password123!","email":"` + email + `","verification_code":" ` + sentCode + ` "}`
	validRecorder := httptest.NewRecorder()
	validContext, _ := gin.CreateTestContext(validRecorder)
	validContext.Request = httptest.NewRequest(http.MethodPost, "/api/user/register", strings.NewReader(validBody))
	validContext.Request.Header.Set("Content-Type", "application/json")
	Register(validContext)
	require.Equal(t, http.StatusOK, validRecorder.Code)
	assert.Contains(t, validRecorder.Body.String(), `"success":true`)

	assert.False(t, common.VerifyCodeWithKey(email, sentCode, common.EmailVerificationPurpose), "registration must consume verification code")
}

func TestSendEmailVerificationDoesNotRegisterCodeOnDeliveryFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Option{}))

	previousDB := model.DB
	previousDomainRestrict := common.EmailDomainRestrictionEnabled
	model.DB = db
	common.EmailDomainRestrictionEnabled = false
	email := "delivery-fail@qq.com"
	t.Cleanup(func() {
		common.DeleteKey(email, common.EmailVerificationPurpose)
		model.DB = previousDB
		common.EmailDomainRestrictionEnabled = previousDomainRestrict
	})

	configureEmailDelivery(t, map[string]string{
		"EmailProvider": "resend",
		"ResendApiKey":  "test-key",
		"ResendFrom":    "sender@example.com",
	})

	var attemptedCode string
	http.DefaultTransport = emailHTTPTransport(func(request *http.Request) (*http.Response, error) {
		var payload struct {
			HTML string `json:"html"`
		}
		rawBody, readErr := io.ReadAll(request.Body)
		require.NoError(t, readErr)
		require.NoError(t, json.Unmarshal(rawBody, &payload))
		if matches := regexp.MustCompile(`<strong>([^<]+)</strong>`).FindStringSubmatch(payload.HTML); len(matches) == 2 {
			attemptedCode = matches[1]
		}
		return nil, errors.New("network failure")
	})

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/verification?email="+email, nil)
	SendEmailVerification(context)

	require.Regexp(t, `^\d{6}$`, attemptedCode)
	assert.Contains(t, recorder.Body.String(), `"success":false`)
	assert.False(t, common.VerifyCodeWithKey(email, attemptedCode, common.EmailVerificationPurpose))
}
