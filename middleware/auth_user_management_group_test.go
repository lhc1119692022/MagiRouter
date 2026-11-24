package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestTokenAuthEnforcesBillingGroupWhenUserGroupIsUserManagementOnly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())

	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousType := common.MainDatabaseType()
	previousRedis := common.RedisEnabled
	originalUsable := setting.UserUsableGroups2JSONString()
	originalRatios := ratio_setting.GroupRatio2JSONString()
	originalUserManaged := ratio_setting.UserManagementGroups2JSONString()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.AuditLog{}))
	model.DB = db
	model.LOG_DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	require.NoError(t, model.InitLogDB())

	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"standard":1}`))
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"standard":"Standard"}`))
	require.NoError(t, ratio_setting.UpdateUserManagementGroupsByJSONString(`{"default":"Default user tier"}`))

	t.Cleanup(func() {
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.SetMainDatabaseType(previousType)
		common.RedisEnabled = previousRedis
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsable))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
		require.NoError(t, ratio_setting.UpdateUserManagementGroupsByJSONString(originalUserManaged))
	})

	user := &model.User{
		Id:       501,
		Username: "umg-token-auth-user",
		Password: "password",
		Group:    "default",
		Status:   common.UserStatusEnabled,
		Quota:    100000,
	}
	require.NoError(t, db.Create(user).Error)

	legacyEmptyToken := &model.Token{
		UserId:         user.Id,
		Name:           "legacy-empty",
		Key:            "legacyemptykey12345678901234567890123456789012",
		Status:         common.TokenStatusEnabled,
		ExpiredTime:    -1,
		UnlimitedQuota: true,
		Group:          "",
	}
	umgGroupToken := &model.Token{
		UserId:         user.Id,
		Name:           "umg-group",
		Key:            "umggroupkey12345678901234567890123456789012345",
		Status:         common.TokenStatusEnabled,
		ExpiredTime:    -1,
		UnlimitedQuota: true,
		Group:          "default",
	}
	billingToken := &model.Token{
		UserId:         user.Id,
		Name:           "billing-group",
		Key:            "billinggroupkey1234567890123456789012345678901",
		Status:         common.TokenStatusEnabled,
		ExpiredTime:    -1,
		UnlimitedQuota: true,
		Group:          "standard",
	}
	require.NoError(t, db.Create(legacyEmptyToken).Error)
	require.NoError(t, db.Create(umgGroupToken).Error)
	require.NoError(t, db.Create(billingToken).Error)

	router := gin.New()
	router.POST("/v1/chat/completions", TokenAuth(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"using_group": common.GetContextKeyString(c, constant.ContextKeyUsingGroup),
		})
	})

	perform := func(tokenKey string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
		req.Header.Set("Authorization", "Bearer sk-"+tokenKey)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}

	legacyRec := perform(legacyEmptyToken.Key)
	assert.Equal(t, http.StatusForbidden, legacyRec.Code)
	assert.Contains(t, legacyRec.Body.String(), "user management only")

	umgRec := perform(umgGroupToken.Key)
	assert.Equal(t, http.StatusForbidden, umgRec.Code)
	assert.Contains(t, umgRec.Body.String(), "user management only")

	billingRec := perform(billingToken.Key)
	assert.Equal(t, http.StatusOK, billingRec.Code)
	assert.Contains(t, billingRec.Body.String(), `"using_group":"standard"`)
}
