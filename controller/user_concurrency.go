package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func manageUserConcurrency(c *gin.Context, req ManageRequest) {
	action := "user.concurrency_update"
	params := model.AuditFields{
		"target_user_id": req.Id,
		"to":             req.Value,
	}
	success := false
	defer func() {
		content := auditContentEN(action, params)
		if !success {
			content = "Failed user concurrency adjustment"
		}
		model.RecordOperationAuditLog(c.GetInt("id"), c.GetInt("role"), content, c.ClientIP(), action, params,
			auditOperatorInfo(c), &model.AuditRequestInfo{
				Method: c.Request.Method, Route: c.FullPath(), Status: c.Writer.Status(), Success: success,
			}, c)
		markAuditLogged(c)
	}()

	adjustment, err := model.AdjustUserMaxConcurrency(req.Id, c.GetInt("role"), req.Value)
	if err != nil {
		switch {
		case errors.Is(err, model.ErrInvalidUserConcurrencyAdjustment):
			params["failure_reason"] = "invalid_parameters"
			common.ApiErrorT(c, "Invalid parameters")
		case errors.Is(err, model.ErrUserConcurrencyPermission):
			params["failure_reason"] = "permission_denied"
			common.ApiErrorT(c, "No permission to update users of same or higher permission level")
		case errors.Is(err, gorm.ErrRecordNotFound):
			params["failure_reason"] = "target_not_found"
			common.ApiErrorT(c, "User does not exist")
		default:
			params["failure_reason"] = "database_error"
			common.ApiError(c, err)
		}
		return
	}

	params["target_username"] = adjustment.Username
	params["from"] = adjustment.Before
	params["to"] = adjustment.After
	success = true

	summary := setting.GetUserConcurrencySummary(adjustment.After, adjustment.Group)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"id":                adjustment.UserID,
			"max_concurrency":   adjustment.After,
			"concurrency_limit": summary,
		},
	})
}
