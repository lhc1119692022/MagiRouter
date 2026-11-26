package controller

import (
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

func GetUpstreamBalanceOverview(c *gin.Context) {
	overview, err := service.BuildUpstreamBalanceOverview()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, overview)
}

func RefreshUpstreamBalances(c *gin.Context) {
	var req struct {
		SiteKey    string `json:"site_key"`
		ChannelID  int    `json:"channel_id"`
		SendAlerts bool   `json:"send_alerts"`
	}
	if c.Request.Body != nil {
		if err := common.DecodeJsonBody(c.Request.Body, &req); err != nil && err != io.EOF {
			common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
			return
		}
	}
	summary, err := service.RefreshUpstreamBalances(c.Request.Context(), service.UpstreamBalanceRefreshOptions{
		SiteKey:    strings.TrimSpace(req.SiteKey),
		ChannelID:  req.ChannelID,
		SendAlerts: req.SendAlerts,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	overview, err := service.BuildUpstreamBalanceOverview()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"summary":  summary,
		"overview": overview,
	})
}

func GetUpstreamBalanceSettings(c *gin.Context) {
	common.ApiSuccess(c, operation_setting.GetUpstreamBalanceSettingSnapshot().Redacted())
}

func UpdateUpstreamBalanceSettings(c *gin.Context) {
	existing := operation_setting.GetUpstreamBalanceSettingSnapshot()
	req := operation_setting.UpstreamBalanceSetting{
		CheckIntervalMinutes: existing.CheckIntervalMinutes,
		AlertCooldownMinutes: existing.AlertCooldownMinutes,
	}
	if err := common.DecodeJsonBody(c.Request.Body, &req); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	if err := req.Validate(); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, err)
		return
	}
	merged := req.MergeSecrets(existing).Normalized()
	optionMap, err := merged.ToOptionMap()
	if err != nil {
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to save configuration"))
		return
	}
	if err := model.UpdateOptionsBulk(optionMap); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "option.upstream_balance_update", map[string]any{
		"enabled":                merged.Enabled,
		"check_interval_minutes": merged.CheckIntervalMinutes,
		"alert_cooldown_minutes": merged.AlertCooldownMinutes,
		"site_configs":           len(merged.Sites),
		"channel_configs":        len(merged.Channels),
	})
	overview, err := service.BuildUpstreamBalanceOverview()
	if err != nil {
		common.ApiSuccess(c, operation_setting.GetUpstreamBalanceSettingSnapshot().Redacted())
		return
	}
	common.ApiSuccess(c, overview)
}

func TestUpstreamBalanceAlertEmail(c *gin.Context) {
	var req struct {
		NotifyEmails *string `json:"notify_emails"`
	}
	if c.Request.Body != nil {
		if err := common.DecodeJsonBody(c.Request.Body, &req); err != nil && err != io.EOF {
			common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
			return
		}
	}
	notifyEmails := operation_setting.GetUpstreamBalanceSettingSnapshot().NotifyEmails
	if req.NotifyEmails != nil {
		notifyEmails = *req.NotifyEmails
	}
	userID := c.GetInt("id")
	if err := service.SendUpstreamBalanceTestEmail(notifyEmails, userID); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "option.upstream_balance_test_email", map[string]any{
		"custom_recipients": strings.TrimSpace(notifyEmails) != "",
	})
	common.ApiSuccessT(c, "Test alert email sent", nil)
}
