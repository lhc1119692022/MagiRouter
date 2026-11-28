package controller

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupDailyTopUpControllerTestDB(t *testing.T) *model.User {
	t.Helper()
	oldDB, oldLogDB := model.DB, model.LOG_DB
	oldType, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
	oldMaster, oldCache, oldRedis, oldSQLitePath := common.IsMasterNode, common.MemoryCacheEnabled, common.RedisEnabled, common.SQLitePath
	oldPrice := operation_setting.Price
	oldMinTopUp := operation_setting.MinTopUp
	oldPayAddress := operation_setting.PayAddress
	oldEpayID := operation_setting.EpayId
	oldEpayKey := operation_setting.EpayKey
	oldPayMethods := operation_setting.PayMethods

	ps := operation_setting.GetPaymentSetting()
	oldLimit := ps.DailyTopUpLimit
	oldExempt := append([]string(nil), ps.DailyTopUpExemptUsers...)
	oldMethod := ps.DailyTopUpContactMethod
	oldEmail := ps.DailyTopUpContactEmail
	oldQR := ps.DailyTopUpContactWeChatQRCode
	oldNote := ps.DailyTopUpContactNote

	t.Setenv("SQL_DSN", "")
	t.Setenv("LOG_SQL_DSN", "")
	common.IsMasterNode, common.MemoryCacheEnabled, common.RedisEnabled = false, false, false
	common.SQLitePath = filepath.Join(t.TempDir(), "daily-topup.db")
	require.NoError(t, model.InitDB())
	db := model.DB
	sqlDB, err := db.DB()
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.TopUp{}))

	operation_setting.Price = 1.0
	operation_setting.MinTopUp = 1
	operation_setting.PayAddress = "https://epay.example.com"
	operation_setting.EpayId = "merchant-1"
	operation_setting.EpayKey = "secret-key"
	operation_setting.PayMethods = []map[string]string{{"name": "Alipay", "type": "alipay"}}

	common.OptionMapRWMutex.Lock()
	ps.DailyTopUpLimit = 200
	ps.DailyTopUpExemptUsers = []string{"vip_user"}
	ps.DailyTopUpContactMethod = operation_setting.DailyTopUpContactMethodEmail
	ps.DailyTopUpContactEmail = "billing@example.com"
	ps.DailyTopUpContactWeChatQRCode = "https://cdn.example.com/wechat-qr.png"
	ps.DailyTopUpContactNote = "Contact us for large top-up"
	common.OptionMapRWMutex.Unlock()

	t.Cleanup(func() {
		_ = sqlDB.Close()
		model.DB, model.LOG_DB = oldDB, oldLogDB
		common.SetDatabaseTypes(oldType, oldLogType)
		common.IsMasterNode, common.MemoryCacheEnabled, common.RedisEnabled, common.SQLitePath = oldMaster, oldCache, oldRedis, oldSQLitePath
		operation_setting.Price = oldPrice
		operation_setting.MinTopUp = oldMinTopUp
		operation_setting.PayAddress = oldPayAddress
		operation_setting.EpayId = oldEpayID
		operation_setting.EpayKey = oldEpayKey
		operation_setting.PayMethods = oldPayMethods
		common.OptionMapRWMutex.Lock()
		ps.DailyTopUpLimit = oldLimit
		ps.DailyTopUpExemptUsers = oldExempt
		ps.DailyTopUpContactMethod = oldMethod
		ps.DailyTopUpContactEmail = oldEmail
		ps.DailyTopUpContactWeChatQRCode = oldQR
		ps.DailyTopUpContactNote = oldNote
		common.OptionMapRWMutex.Unlock()
	})

	user := &model.User{
		Id:       401,
		Username: "regular_user",
		Group:    "default",
		Status:   common.UserStatusEnabled,
	}
	require.NoError(t, db.Create(user).Error)
	return user
}

func TestGetTopUpInfoIncludesDailyLimitWithoutLeakingExemptList(t *testing.T) {
	gin.SetMode(gin.TestMode)
	user := setupDailyTopUpControllerTestDB(t)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/user/topup/info", nil)
	ctx.Set("id", user.Id)

	GetTopUpInfo(ctx)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.NotContains(t, recorder.Body.String(), "vip_user")

	var resp struct {
		Success bool `json:"success"`
		Data    struct {
			DailyLimit model.DailyTopUpLimitStatus `json:"daily_limit"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.True(t, resp.Data.DailyLimit.Enabled)
	assert.Equal(t, 200.0, resp.Data.DailyLimit.Limit)
	assert.Equal(t, 200.0, resp.Data.DailyLimit.Remaining)
	assert.False(t, resp.Data.DailyLimit.Exempt)
	assert.Equal(t, operation_setting.DailyTopUpContactMethodEmail, resp.Data.DailyLimit.ContactMethod)
	assert.Equal(t, "billing@example.com", resp.Data.DailyLimit.ContactEmail)
	assert.Empty(t, resp.Data.DailyLimit.ContactWeChatQR)
	assert.NotContains(t, recorder.Body.String(), "wechat-qr.png")
}

func TestRequestEpayReturnsDailyLimitPayloadWithEmailWhenExceeded(t *testing.T) {
	gin.SetMode(gin.TestMode)
	user := setupDailyTopUpControllerTestDB(t)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/pay", strings.NewReader(`{"amount":250,"payment_method":"alipay"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("id", user.Id)

	RequestEpay(ctx)
	require.Equal(t, http.StatusOK, recorder.Code)

	var body struct {
		Message    string                      `json:"message"`
		Code       string                      `json:"code"`
		MessageKey string                      `json:"message_key"`
		DailyLimit model.DailyTopUpLimitStatus `json:"daily_limit"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &body))
	assert.Equal(t, "error", body.Message)
	assert.Equal(t, "daily_topup_limit_exceeded", body.Code)
	assert.Contains(t, body.MessageKey, "email")
	assert.Equal(t, 200.0, body.DailyLimit.Limit)
	assert.Equal(t, 200.0, body.DailyLimit.Remaining)
	assert.Equal(t, operation_setting.DailyTopUpContactMethodEmail, body.DailyLimit.ContactMethod)
	assert.Equal(t, "billing@example.com", body.DailyLimit.ContactEmail)
	assert.Empty(t, body.DailyLimit.ContactWeChatQR)
	assert.Equal(t, "Contact us for large top-up", body.DailyLimit.ContactNote)
	assert.NotContains(t, recorder.Body.String(), "wechat-qr.png")
}

func TestRequestEpayReturnsDailyLimitPayloadWithQRCodeWhenWeChatEnabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	user := setupDailyTopUpControllerTestDB(t)

	ps := operation_setting.GetPaymentSetting()
	common.OptionMapRWMutex.Lock()
	ps.DailyTopUpContactMethod = operation_setting.DailyTopUpContactMethodWeChat
	common.OptionMapRWMutex.Unlock()

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/pay", strings.NewReader(`{"amount":250,"payment_method":"alipay"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("id", user.Id)

	RequestEpay(ctx)
	require.Equal(t, http.StatusOK, recorder.Code)

	var body struct {
		Message    string                      `json:"message"`
		Code       string                      `json:"code"`
		MessageKey string                      `json:"message_key"`
		DailyLimit model.DailyTopUpLimitStatus `json:"daily_limit"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &body))
	assert.Equal(t, "error", body.Message)
	assert.Equal(t, "daily_topup_limit_exceeded", body.Code)
	assert.Contains(t, body.MessageKey, "WeChat")
	assert.Equal(t, operation_setting.DailyTopUpContactMethodWeChat, body.DailyLimit.ContactMethod)
	assert.Empty(t, body.DailyLimit.ContactEmail)
	assert.Equal(t, "https://cdn.example.com/wechat-qr.png", body.DailyLimit.ContactWeChatQR)
	assert.NotContains(t, recorder.Body.String(), "billing@example.com")
}

func TestRequestEpayAllowsExemptUserOverDailyLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	_ = setupDailyTopUpControllerTestDB(t)

	vipUser := &model.User{
		Id:       402,
		Username: "vip_user",
		Group:    "default",
		AffCode:  "vipaff1",
		Status:   common.UserStatusEnabled,
	}
	require.NoError(t, model.DB.Create(vipUser).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/pay", strings.NewReader(`{"amount":250,"payment_method":"alipay"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("id", vipUser.Id)

	RequestEpay(ctx)
	require.Equal(t, http.StatusOK, recorder.Code)

	var body struct {
		Message string `json:"message"`
		URL     string `json:"url"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &body))
	assert.Equal(t, "success", body.Message)
	assert.NotEmpty(t, body.URL)
}
