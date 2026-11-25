package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type violationVerdictRequest struct {
	Decision string `json:"decision"`
	Note     string `json:"note"`
}

type violationAllowlistRequest struct {
	UserId int    `json:"user_id"`
	Reason string `json:"reason"`
}

func parseViolationPagination(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.Query("p"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return page, pageSize
}

func resolveOperatorUsername(c *gin.Context) string {
	if name := strings.TrimSpace(c.GetString("username")); name != "" {
		return name
	}
	if operatorID := c.GetInt("id"); operatorID > 0 && model.DB != nil {
		var operator model.User
		if err := model.DB.Select("username").First(&operator, operatorID).Error; err == nil {
			return operator.Username
		}
	}
	return ""
}

func GetViolationAuditOverview(c *gin.Context) {
	overview, err := model.GetViolationAuditOverview(c.Request.Context(), model.DB)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var recorderStats service.ViolationRecorderStats
	if recorder := service.CurrentViolationAuditRecorder(); recorder != nil {
		recorderStats = recorder.Stats()
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"overview": overview,
			"recorder": recorderStats,
		},
	})
}

func ListViolationCases(c *gin.Context) {
	page, pageSize := parseViolationPagination(c)
	userID, _ := strconv.Atoi(c.Query("user_id"))
	items, total, err := model.ListViolationCases(c.Request.Context(), model.DB, model.ViolationCaseFilter{
		Status:    strings.TrimSpace(c.Query("status")),
		RiskLevel: strings.TrimSpace(c.Query("risk_level")),
		Keyword:   strings.TrimSpace(c.Query("keyword")),
		UserId:    userID,
		Page:      page,
		PageSize:  pageSize,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"items":     items,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

func GetViolationCaseDetail(c *gin.Context) {
	caseID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || caseID < 1 {
		common.ApiErrorT(c, "Invalid case ID")
		return
	}
	accountCase, err := model.GetViolationCaseById(c.Request.Context(), model.DB, caseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorT(c, "Violation case not found")
			return
		}
		common.ApiError(c, err)
		return
	}
	events, err := model.GetViolationEventsForCase(c.Request.Context(), model.DB, accountCase.ViolationAccountCase, 50)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"case":   accountCase,
			"events": events,
		},
	})
}

func RunSingleViolationCaseAudit(c *gin.Context) {
	caseID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || caseID < 1 {
		common.ApiErrorT(c, "Invalid case ID")
		return
	}
	settings, err := model.LoadViolationAuditSettings(model.DB)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	updated, err := service.AuditViolationCase(c.Request.Context(), model.DB, nil, settings, caseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorT(c, "Violation case not found")
			return
		}
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    updated,
	})
}

func SubmitViolationCaseVerdict(c *gin.Context) {
	caseID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || caseID < 1 {
		common.ApiErrorT(c, "Invalid case ID")
		return
	}
	var req violationVerdictRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	decision := strings.ToLower(strings.TrimSpace(req.Decision))
	note := strings.TrimSpace(strings.ReplaceAll(req.Note, "\x00", ""))
	if utf8.RuneCountInString(note) > 1000 {
		common.ApiErrorT(c, "Verdict note must not exceed 1000 characters")
		return
	}
	if decision != model.ViolationVerdictBan && decision != model.ViolationVerdictDismiss && decision != model.ViolationVerdictAllowlist {
		common.ApiErrorT(c, "Invalid verdict decision")
		return
	}

	var accountCase model.ViolationAccountCase
	if err := model.DB.WithContext(c.Request.Context()).First(&accountCase, caseID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorT(c, "Violation case not found")
			return
		}
		common.ApiError(c, err)
		return
	}

	operatorID := c.GetInt("id")
	operatorRole := c.GetInt("role")
	operatorUsername := resolveOperatorUsername(c)
	now := common.GetTimestamp()
	verificationMethod := ""

	switch decision {
	case model.ViolationVerdictBan:
		var targetUser model.User
		if err := model.DB.Unscoped().Where("id = ?", accountCase.UserId).First(&targetUser).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				common.ApiErrorT(c, "User does not exist")
				return
			}
			common.ApiError(c, err)
			return
		}
		if targetUser.Role == common.RoleRootUser {
			common.ApiErrorT(c, "Cannot disable super administrator user")
			return
		}
		if !canManageTargetRole(operatorRole, targetUser.Role) {
			common.ApiErrorT(c, "No permission to update users of same or higher permission level")
			return
		}
		authorization := requireAdminUserProof(c, service.VerificationScopeAdminUserManage, service.AdminUserManageContext{
			UserID: targetUser.Id,
			Action: "disable",
		})
		if authorization == nil {
			return
		}
		verificationMethod = authorization.Method
		targetUser.Status = common.UserStatusDisabled
		if err := targetUser.Update(false); err != nil {
			common.ApiError(c, err)
			return
		}
		if err := model.InvalidateUserTokensCache(targetUser.Id); err != nil {
			common.SysLog(common.LogText("failed to invalidate tokens cache for user %d: %s", targetUser.Id, err.Error()))
		}
		if err := model.DB.WithContext(c.Request.Context()).Model(&model.ViolationAccountCase{}).
			Where("id = ?", accountCase.Id).
			Updates(map[string]any{
				"status":              model.ViolationCaseStatusBanned,
				"verdict":             model.ViolationVerdictBan,
				"verdict_note":        note,
				"decided_by":          operatorID,
				"decided_by_username": operatorUsername,
				"decided_at":          now,
				"needs_reaudit":       false,
				"updated_at":          now,
			}).Error; err != nil {
			common.ApiError(c, err)
			return
		}
	case model.ViolationVerdictDismiss:
		if err := model.DB.WithContext(c.Request.Context()).Model(&model.ViolationAccountCase{}).
			Where("id = ?", accountCase.Id).
			Updates(map[string]any{
				"status":              model.ViolationCaseStatusDismissed,
				"verdict":             model.ViolationVerdictDismiss,
				"verdict_note":        note,
				"decided_by":          operatorID,
				"decided_by_username": operatorUsername,
				"decided_at":          now,
				"needs_reaudit":       false,
				"updated_at":          now,
			}).Error; err != nil {
			common.ApiError(c, err)
			return
		}
	case model.ViolationVerdictAllowlist:
		reason := note
		if reason == "" {
			reason = "Allowlisted via violation verdict"
		}
		if _, err := model.AddViolationAllowlist(c.Request.Context(), model.DB, model.ViolationAllowlist{
			UserId:            accountCase.UserId,
			Username:          accountCase.Username,
			Reason:            reason,
			CreatedBy:         operatorID,
			CreatedByUsername: operatorUsername,
			CreatedAt:         now,
		}); err != nil {
			common.ApiError(c, err)
			return
		}
		if err := model.DB.WithContext(c.Request.Context()).Model(&model.ViolationAccountCase{}).
			Where("user_id = ? AND status IN ?", accountCase.UserId, []string{model.ViolationCaseStatusPendingAudit, model.ViolationCaseStatusPendingVerdict}).
			Updates(map[string]any{
				"status":              model.ViolationCaseStatusAllowlisted,
				"verdict":             model.ViolationVerdictAllowlist,
				"verdict_note":        note,
				"decided_by":          operatorID,
				"decided_by_username": operatorUsername,
				"decided_at":          now,
				"needs_reaudit":       false,
				"updated_at":          now,
			}).Error; err != nil {
			common.ApiError(c, err)
			return
		}
	}

	auditParams := map[string]any{
		"case_id":  accountCase.Id,
		"decision": decision,
		"username": accountCase.Username,
		"id":       accountCase.UserId,
	}
	if note != "" {
		auditParams["note"] = note
	}
	if verificationMethod != "" {
		auditParams["verification_method"] = verificationMethod
	}
	recordManageAuditFor(c, accountCase.UserId, "violation_audit.verdict", auditParams)

	updated, err := model.GetViolationCaseById(c.Request.Context(), model.DB, accountCase.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    updated,
	})
}

func ListViolationEvents(c *gin.Context) {
	page, pageSize := parseViolationPagination(c)
	userID, _ := strconv.Atoi(c.Query("user_id"))
	items, total, err := model.ListViolationEvents(c.Request.Context(), model.DB, model.ViolationEventFilter{
		UserId:   userID,
		Username: strings.TrimSpace(c.Query("username")),
		Plugin:   strings.TrimSpace(c.Query("plugin")),
		Category: strings.TrimSpace(c.Query("category")),
		Keyword:  strings.TrimSpace(c.Query("keyword")),
		Page:     page,
		PageSize: pageSize,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"items":     items,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

func DeleteViolationEvent(c *gin.Context) {
	eventID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || eventID < 1 {
		common.ApiErrorT(c, "Invalid event ID")
		return
	}
	if err := model.DB.WithContext(c.Request.Context()).Delete(&model.ViolationEvent{}, eventID).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func ListViolationAllowlist(c *gin.Context) {
	page, pageSize := parseViolationPagination(c)
	items, total, err := model.ListViolationAllowlist(c.Request.Context(), model.DB, page, pageSize, c.Query("keyword"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"items":     items,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

func AddViolationAllowlist(c *gin.Context) {
	var req violationAllowlistRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	if req.UserId < 1 {
		common.ApiErrorT(c, "Invalid user ID")
		return
	}
	var user model.User
	if err := model.DB.Select("id, username").First(&user, req.UserId).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorT(c, "User does not exist")
			return
		}
		common.ApiError(c, err)
		return
	}
	reason := strings.TrimSpace(strings.ReplaceAll(req.Reason, "\x00", ""))
	if utf8.RuneCountInString(reason) > 500 {
		common.ApiErrorT(c, "Reason must not exceed 500 characters")
		return
	}
	operatorID := c.GetInt("id")
	operatorUsername := resolveOperatorUsername(c)
	now := common.GetTimestamp()
	entry, err := model.AddViolationAllowlist(c.Request.Context(), model.DB, model.ViolationAllowlist{
		UserId:            user.Id,
		Username:          user.Username,
		Reason:            reason,
		CreatedBy:         operatorID,
		CreatedByUsername: operatorUsername,
		CreatedAt:         now,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	_ = model.DB.WithContext(c.Request.Context()).Model(&model.ViolationAccountCase{}).
		Where("user_id = ? AND status IN ?", user.Id, []string{model.ViolationCaseStatusPendingAudit, model.ViolationCaseStatusPendingVerdict}).
		Updates(map[string]any{
			"status":              model.ViolationCaseStatusAllowlisted,
			"verdict":             model.ViolationVerdictAllowlist,
			"verdict_note":        reason,
			"decided_by":          operatorID,
			"decided_by_username": operatorUsername,
			"decided_at":          now,
			"needs_reaudit":       false,
			"updated_at":          now,
		}).Error
	recordManageAuditFor(c, user.Id, "violation_audit.allowlist_add", map[string]any{
		"username": user.Username,
		"id":       user.Id,
		"reason":   reason,
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    entry,
	})
}

func RemoveViolationAllowlist(c *gin.Context) {
	userID, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || userID < 1 {
		common.ApiErrorT(c, "Invalid user ID")
		return
	}
	if err := model.RemoveViolationAllowlist(c.Request.Context(), model.DB, userID); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAuditFor(c, userID, "violation_audit.allowlist_remove", map[string]any{
		"id": userID,
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func GetViolationAuditSettings(c *gin.Context) {
	settings, err := model.LoadViolationAuditSettings(model.DB)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    settings.Redacted(),
	})
}

func UpdateViolationAuditSettings(c *gin.Context) {
	var incoming model.ViolationAuditSettings
	if err := common.DecodeJson(c.Request.Body, &incoming); err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	saved, err := model.SaveViolationAuditSettings(model.DB, incoming)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	service.ReloadViolationAuditSettings(saved)
	model.BumpSyncTopic(model.SyncTopicOptions)
	recordManageAudit(c, "violation_audit.settings_update", map[string]any{
		"enabled":            saved.Enabled,
		"auto_audit_enabled": saved.AutoAuditEnabled,
		"threshold_count":    saved.ThresholdCount,
		"window_hours":       saved.WindowHours,
		"interval_minutes":   saved.IntervalMinutes,
		"model":              saved.Model,
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    saved.Redacted(),
	})
}

func RunViolationAuditNow(c *gin.Context) {
	settings, err := model.LoadViolationAuditSettings(model.DB)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	summary, err := service.RunViolationAuditBatch(c.Request.Context(), model.DB, settings, nil)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    summary,
	})
}

func TestViolationAuditSettings(c *gin.Context) {
	existing, err := model.LoadViolationAuditSettings(model.DB)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	candidate := existing
	if c.Request.ContentLength != 0 {
		var incoming model.ViolationAuditSettings
		if err := common.DecodeJson(c.Request.Body, &incoming); err != nil {
			common.ApiErrorT(c, "Invalid parameters")
			return
		}
		candidate = incoming
		if candidate.ClearAPIKey {
			candidate.APIKey = ""
		} else if strings.TrimSpace(candidate.APIKey) == "" {
			candidate.APIKey = existing.APIKey
		}
	}
	result, err := service.TestViolationAuditConnection(c.Request.Context(), candidate)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    result,
	})
}
