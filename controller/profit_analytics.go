package controller

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

func resolveProfitTimeRange(c *gin.Context) (int64, int64, bool) {
	now := time.Now()
	startRaw := c.Query("start_timestamp")
	endRaw := c.Query("end_timestamp")
	if startRaw != "" || endRaw != "" {
		startTs, startErr := strconv.ParseInt(startRaw, 10, 64)
		endTs, endErr := strconv.ParseInt(endRaw, 10, 64)
		if startErr != nil || endErr != nil || startTs <= 0 || endTs <= 0 || endTs < startTs {
			common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid time range"))
			return 0, 0, false
		}
		const maxRangeSeconds = int64(366 * 24 * 3600)
		if endTs-startTs > maxRangeSeconds {
			common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Time range cannot exceed 366 days"))
			return 0, 0, false
		}
		return startTs, endTs, true
	}

	days := 30
	if daysRaw := c.Query("days"); daysRaw != "" {
		parsed, err := strconv.Atoi(daysRaw)
		if err != nil || parsed < 1 || parsed > 366 {
			common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
			return 0, 0, false
		}
		days = parsed
	}
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil || loc == nil {
		loc = time.FixedZone("CST", 8*3600)
	}
	nowLocal := now.In(loc)
	startDay := time.Date(nowLocal.Year(), nowLocal.Month(), nowLocal.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, -(days - 1))
	return startDay.Unix(), now.Unix(), true
}

func GetProfitAnalytics(c *gin.Context) {
	startTs, endTs, ok := resolveProfitTimeRange(c)
	if !ok {
		return
	}
	limit := 50
	if limitRaw := c.Query("order_limit"); limitRaw != "" {
		if parsed, err := strconv.Atoi(limitRaw); err == nil && parsed > 0 && parsed <= 200 {
			limit = parsed
		}
	}
	var excludeAdmins *bool
	if raw := strings.TrimSpace(c.Query("exclude_admins")); raw != "" {
		parsed, err := strconv.ParseBool(raw)
		if err != nil {
			common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
			return
		}
		excludeAdmins = &parsed
	}
	report, err := model.GetProfitAnalytics(startTs, endTs, model.ProfitAnalyticsOptions{
		RecentOrderLimit:  limit,
		ExcludeAdminUsers: excludeAdmins,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, report)
}

func GetProfitAnalyticsSettings(c *gin.Context) {
	common.ApiSuccess(c, operation_setting.GetProfitAnalyticsSettingSnapshot())
}

func UpdateProfitAnalyticsSettings(c *gin.Context) {
	req := operation_setting.ProfitAnalyticsSetting{
		ExcludeAdminUsers: operation_setting.GetProfitAnalyticsSettingSnapshot().ExcludeAdminUsers,
	}
	if err := common.DecodeJsonBody(c.Request.Body, &req); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	if err := req.Validate(); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, err)
		return
	}
	normalized := req.Normalized()
	optionMap, err := normalized.ToOptionMap()
	if err != nil {
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to save configuration"))
		return
	}
	if err := model.UpdateOptionsBulk(optionMap); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "option.profit_analytics_update", map[string]any{
		"exclude_admin_users": normalized.ExcludeAdminUsers,
		"default_cost_ratio":  normalized.DefaultCostRatio,
		"payment_fee_rate":    normalized.PaymentFeeRate,
		"channel_overrides":   len(normalized.ChannelCosts),
		"extra_fixed_costs":   len(normalized.ExtraFixedCosts),
	})
	common.ApiSuccess(c, operation_setting.GetProfitAnalyticsSettingSnapshot())
}

func GetProfitDeletedUserRecords(c *gin.Context) {
	preview, err := model.GetProfitDeletedUserRecordsPreview()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, preview)
}

func CleanupProfitDeletedUserRecords(c *gin.Context) {
	var req model.ProfitDeletedUserCleanupRequest
	if c.Request.Body != nil {
		if err := common.DecodeJsonBody(c.Request.Body, &req); err != nil && !errors.Is(err, io.EOF) {
			common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
			return
		}
	}
	result, err := model.CleanupProfitDeletedUserRecords(req)
	if err != nil {
		var msgErr *common.Message
		if errors.As(err, &msgErr) {
			common.ApiErrorStatus(c, http.StatusBadRequest, msgErr)
			return
		}
		common.ApiError(c, err)
		return
	}
	recordManageAuditFor(c, result.TargetUserId, "profit.deleted_user_records_cleanup", map[string]any{
		"target_user_id":              result.TargetUserId,
		"topups_deleted":              result.TopUpsDeleted,
		"subscription_orders_deleted": result.SubOrdersDeleted,
		"quota_data_deleted":          result.QuotaDataDeleted,
		"user_subscriptions_deleted":  result.UserSubsDeleted,
		"used_redemptions_deleted":    result.RedemptionsDeleted,
		"checkins_deleted":            result.CheckinsDeleted,
		"total_deleted":               result.TotalDeleted,
	})
	common.ApiSuccess(c, result)
}
