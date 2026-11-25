package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupViolationAuditControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db := setupManageUserTestDB(t)
	prevCryptoSecret := common.CryptoSecret
	common.CryptoSecret = "violation-audit-controller-test-secret"
	t.Cleanup(func() {
		common.CryptoSecret = prevCryptoSecret
	})
	// Run AutoMigrate twice to prove schema migration idempotency across dialects.
	for range 2 {
		require.NoError(t, db.AutoMigrate(
			&model.Option{},
			&model.SystemTask{},
			&model.ViolationEvent{},
			&model.ViolationAccountCase{},
			&model.ViolationAllowlist{},
		))
	}
	return db
}

func TestViolationAuditControllerVerdictsAndSecurity(t *testing.T) {
	db := setupViolationAuditControllerTestDB(t)
	gin.SetMode(gin.TestMode)

	target := model.User{
		Username: "abuser_account",
		Password: "x",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		AffCode:  "aff-abuser",
	}
	require.NoError(t, db.Create(&target).Error)

	settings := model.DefaultViolationAuditSettings()
	settings.ThresholdCount = 2
	for i := 1; i <= 2; i++ {
		_, err := model.RecordViolationEventAndScreen(t.Context(), db, &model.ViolationEvent{
			UserId:        target.Id,
			Username:      target.Username,
			Plugin:        "llm-security-guard",
			Code:          "security_guard.blocked",
			Category:      "prompt_injection",
			PromptExcerpt: fmt.Sprintf("jailbreak attempt %d", i),
		}, settings)
		require.NoError(t, err)
	}

	var opened model.ViolationAccountCase
	require.NoError(t, db.Where("user_id = ?", target.Id).First(&opened).Error)
	assert.Equal(t, model.ViolationCaseStatusPendingAudit, opened.Status)

	// 1. Ban verdict without step-up proof must fail and keep user enabled.
	verifiedIdentity, proof := manageUserProof(t, db, service.VerificationOperation{
		Scope:   service.VerificationScopeAdminUserManage,
		Context: []byte(fmt.Sprintf(`{"user_id":%d,"action":"disable"}`, target.Id)),
	})
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/violation_audit/cases/%d/verdict", opened.Id), strings.NewReader(`{"decision":"ban","note":"repeated jailbreaks"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", opened.Id)}}
	c.Set("id", verifiedIdentity.UserID)
	c.Set("role", common.RoleRootUser)
	c.Set("username", "root-operator")
	c.Set("session_id", verifiedIdentity.SessionID)
	c.Set("auth_version", verifiedIdentity.UserAuthVersion)
	c.Set("session_version", verifiedIdentity.SessionVersion)
	SubmitViolationCaseVerdict(c)
	assert.NotEqual(t, http.StatusOK, rec.Code)

	var stillEnabled model.User
	require.NoError(t, db.First(&stillEnabled, target.Id).Error)
	assert.Equal(t, common.UserStatusEnabled, stillEnabled.Status)

	// 2. Ban verdict with valid step-up proof disables user and closes case as banned.
	rec2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(rec2)
	c2.Request = httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/violation_audit/cases/%d/verdict", opened.Id), strings.NewReader(`{"decision":"ban","note":"confirmed repeated jailbreaks"}`))
	c2.Request.Header.Set("Content-Type", "application/json")
	c2.Request.Header.Set("X-Security-Proof", proof)
	c2.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", opened.Id)}}
	c2.Set("id", verifiedIdentity.UserID)
	c2.Set("role", common.RoleRootUser)
	c2.Set("username", "root-operator")
	c2.Set("session_id", verifiedIdentity.SessionID)
	c2.Set("auth_version", verifiedIdentity.UserAuthVersion)
	c2.Set("session_version", verifiedIdentity.SessionVersion)
	SubmitViolationCaseVerdict(c2)
	require.Equal(t, http.StatusOK, rec2.Code, rec2.Body.String())

	var resp struct {
		Success bool                    `json:"success"`
		Data    model.ViolationCaseView `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec2.Body.Bytes(), &resp))
	assert.True(t, resp.Success)
	assert.Equal(t, model.ViolationCaseStatusBanned, resp.Data.Status)
	assert.Equal(t, model.ViolationVerdictBan, resp.Data.Verdict)
	assert.Equal(t, "confirmed repeated jailbreaks", resp.Data.VerdictNote)

	var disabledUser model.User
	require.NoError(t, db.First(&disabledUser, target.Id).Error)
	assert.Equal(t, common.UserStatusDisabled, disabledUser.Status)

	// 3. Dismiss verdict resets clean slate: prior events do not immediately reopen a case.
	secondUser := model.User{
		Username: "false_positive_dev",
		Password: "x",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		AffCode:  "aff-dev",
	}
	require.NoError(t, db.Create(&secondUser).Error)
	for i := 1; i <= 2; i++ {
		_, err := model.RecordViolationEventAndScreen(t.Context(), db, &model.ViolationEvent{
			UserId:        secondUser.Id,
			Username:      secondUser.Username,
			Plugin:        "request-filter",
			Code:          "request_filtered",
			Category:      "cyber_abuse",
			PromptExcerpt: fmt.Sprintf("fix sql injection bug %d", i),
		}, settings)
		require.NoError(t, err)
	}
	var devCase model.ViolationAccountCase
	require.NoError(t, db.Where("user_id = ?", secondUser.Id).First(&devCase).Error)

	rec3 := httptest.NewRecorder()
	c3, _ := gin.CreateTestContext(rec3)
	c3.Request = httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/violation_audit/cases/%d/verdict", devCase.Id), strings.NewReader(`{"decision":"dismiss","note":"normal code review"}`))
	c3.Request.Header.Set("Content-Type", "application/json")
	c3.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", devCase.Id)}}
	c3.Set("id", verifiedIdentity.UserID)
	c3.Set("role", common.RoleRootUser)
	c3.Set("username", "root-operator")
	SubmitViolationCaseVerdict(c3)
	require.Equal(t, http.StatusOK, rec3.Code, rec3.Body.String())

	var dismissed model.ViolationAccountCase
	require.NoError(t, db.First(&dismissed, devCase.Id).Error)
	assert.Equal(t, model.ViolationCaseStatusDismissed, dismissed.Status)

	// 4. Settings update persists encrypted API key and never leaks it via GetOptions.
	rec4 := httptest.NewRecorder()
	c4, _ := gin.CreateTestContext(rec4)
	c4.Request = httptest.NewRequest(http.MethodPut, "/api/violation_audit/settings", strings.NewReader(`{"enabled":true,"auto_audit_enabled":true,"interval_minutes":15,"threshold_count":4,"window_hours":48,"retention_days":30,"max_excerpt_chars":4000,"max_events_per_audit":20,"protocol":"auto","endpoint":"https://api.deepseek.com/v1/chat/completions","model":"deepseek-flash","api_key":"sk-live-secret-key","timeout_seconds":60,"tracked_plugins":["request-filter","llm-security-guard"]}`))
	c4.Request.Header.Set("Content-Type", "application/json")
	c4.Set("id", verifiedIdentity.UserID)
	c4.Set("role", common.RoleRootUser)
	c4.Set("username", "root-operator")
	UpdateViolationAuditSettings(c4)
	require.Equal(t, http.StatusOK, rec4.Code, rec4.Body.String())
	assert.NotContains(t, rec4.Body.String(), "sk-live-secret-key")

	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = map[string]string{}
	}
	common.OptionMap[model.ViolationAuditOptionKey] = `{"api_key":"enc:v1:secret"}`
	common.OptionMapRWMutex.Unlock()
	recOpt := httptest.NewRecorder()
	cOpt, _ := gin.CreateTestContext(recOpt)
	GetOptions(cOpt)
	assert.NotContains(t, recOpt.Body.String(), model.ViolationAuditOptionKey)

	// 5. Exercise overview, cases list, events list, and allowlist endpoints across all SQL dialects.
	for _, check := range []struct {
		name    string
		path    string
		handler gin.HandlerFunc
	}{
		{"overview", "/api/violation_audit/overview", GetViolationAuditOverview},
		{"cases", "/api/violation_audit/cases?status=all&p=1&page_size=20", ListViolationCases},
		{"events", "/api/violation_audit/events?p=1&page_size=20", ListViolationEvents},
		{"allowlist", "/api/violation_audit/allowlist?p=1&page_size=20", ListViolationAllowlist},
	} {
		r := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(r)
		ctx.Request = httptest.NewRequest(http.MethodGet, check.path, nil)
		ctx.Set("id", verifiedIdentity.UserID)
		ctx.Set("role", common.RoleRootUser)
		check.handler(ctx)
		require.Equal(t, http.StatusOK, r.Code, "%s: %s", check.name, r.Body.String())
	}

	// 6. Add and remove allowlist entry via controller.
	recAddAllow := httptest.NewRecorder()
	cAddAllow, _ := gin.CreateTestContext(recAddAllow)
	cAddAllow.Request = httptest.NewRequest(http.MethodPost, "/api/violation_audit/allowlist", strings.NewReader(fmt.Sprintf(`{"user_id":%d,"reason":"trusted auditor"}`, secondUser.Id)))
	cAddAllow.Request.Header.Set("Content-Type", "application/json")
	cAddAllow.Set("id", verifiedIdentity.UserID)
	cAddAllow.Set("role", common.RoleRootUser)
	cAddAllow.Set("username", "root-operator")
	AddViolationAllowlist(cAddAllow)
	require.Equal(t, http.StatusOK, recAddAllow.Code, recAddAllow.Body.String())

	recDelAllow := httptest.NewRecorder()
	cDelAllow, _ := gin.CreateTestContext(recDelAllow)
	cDelAllow.Request = httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/violation_audit/allowlist/%d", secondUser.Id), nil)
	cDelAllow.Params = gin.Params{{Key: "user_id", Value: fmt.Sprintf("%d", secondUser.Id)}}
	cDelAllow.Set("id", verifiedIdentity.UserID)
	cDelAllow.Set("role", common.RoleRootUser)
	cDelAllow.Set("username", "root-operator")
	RemoveViolationAllowlist(cDelAllow)
	require.Equal(t, http.StatusOK, recDelAllow.Code, recDelAllow.Body.String())
}
