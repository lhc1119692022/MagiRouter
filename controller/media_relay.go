package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type mediaRelayConfigResponse struct {
	Enabled                   bool           `json:"enabled"`
	IsReady                   bool           `json:"is_ready"`
	Provider                  string         `json:"provider"`
	Endpoint                  string         `json:"endpoint"`
	Region                    string         `json:"region"`
	Bucket                    string         `json:"bucket"`
	PublicBaseURL             string         `json:"public_base_url"`
	KeyPrefix                 string         `json:"key_prefix"`
	AccessKeyId               string         `json:"access_key_id"`
	AccessKeySecretConfigured bool           `json:"access_key_secret_configured"`
	ForcePathStyle            bool           `json:"force_path_style"`
	PresignTTLSeconds         int            `json:"presign_ttl_seconds"`
	RetentionDays             int            `json:"retention_days"`
	MaxFileSizeMB             int            `json:"max_file_size_mb"`
	DefaultDailyTrafficMB     int            `json:"default_daily_traffic_mb"`
	GroupDailyBonusMB         map[string]int `json:"group_daily_bonus_mb"`
	TempGlobalBonusMB         int            `json:"temp_global_bonus_mb"`
	TempGlobalExpiresAt       int64          `json:"temp_global_expires_at"`
	TempGlobalNote            string         `json:"temp_global_note"`
	ActiveGlobalTempBonusMB   int            `json:"active_global_temp_bonus_mb"`
	TrafficDate               string         `json:"traffic_date"`
	ResetAt                   int64          `json:"reset_at"`
}

type mediaRelayConfigUpdateRequest struct {
	Enabled               bool           `json:"enabled"`
	Provider              string         `json:"provider"`
	Endpoint              string         `json:"endpoint"`
	Region                string         `json:"region"`
	Bucket                string         `json:"bucket"`
	PublicBaseURL         string         `json:"public_base_url"`
	KeyPrefix             string         `json:"key_prefix"`
	AccessKeyId           string         `json:"access_key_id"`
	AccessKeySecret       string         `json:"access_key_secret"`
	ClearAccessKeySecret  bool           `json:"clear_access_key_secret"`
	ForcePathStyle        bool           `json:"force_path_style"`
	PresignTTLSeconds     int            `json:"presign_ttl_seconds"`
	RetentionDays         int            `json:"retention_days"`
	MaxFileSizeMB         int            `json:"max_file_size_mb"`
	DefaultDailyTrafficMB int            `json:"default_daily_traffic_mb"`
	GroupDailyBonusMB     map[string]int `json:"group_daily_bonus_mb"`
	TempGlobalBonusMB     int            `json:"temp_global_bonus_mb"`
	TempGlobalExpiresAt   int64          `json:"temp_global_expires_at"`
	TempGlobalNote        string         `json:"temp_global_note"`
}

type mediaPresignRequest struct {
	FileName    string `json:"file_name"`
	ContentType string `json:"content_type"`
	SizeBytes   int64  `json:"size_bytes"`
	SHA256      string `json:"sha256"`
}

type mediaObjectActionRequest struct {
	ObjectId int `json:"object_id"`
}

type mediaOverrideUpsertRequest struct {
	ExtraDailyMB int64  `json:"extra_daily_mb"`
	ExpiresAt    int64  `json:"expires_at"`
	Note         string `json:"note"`
}

type mediaAccountSubscriptionItem struct {
	Id                  int    `json:"id"`
	PlanId              int    `json:"plan_id"`
	PlanTitle           string `json:"plan_title"`
	PlanSubtitle        string `json:"plan_subtitle,omitempty"`
	AmountTotal         int64  `json:"amount_total"`
	AmountUsed          int64  `json:"amount_used"`
	StartTime           int64  `json:"start_time"`
	EndTime             int64  `json:"end_time"`
	Status              string `json:"status"`
	UpgradeGroup        string `json:"upgrade_group,omitempty"`
	AllowWalletOverflow bool   `json:"allow_wallet_overflow"`
}

func buildMediaBillingDisplay() gin.H {
	return gin.H{
		"quota_per_unit":       common.QuotaPerUnit,
		"display_in_currency":  operation_setting.IsCurrencyDisplay(),
		"quota_display_type":   operation_setting.GetQuotaDisplayType(),
		"currency_symbol":      operation_setting.GetCurrencySymbol(),
		"usd_exchange_rate":    operation_setting.USDExchangeRate,
		"usd_to_currency_rate": operation_setting.GetUsdToCurrencyRate(operation_setting.USDExchangeRate),
	}
}

func buildMediaRelayConfigResponse(cfg operation_setting.MediaRelaySetting, now time.Time) mediaRelayConfigResponse {
	normalized := cfg.Normalized()
	dateKey, resetAt := operation_setting.MediaTrafficDayWindow(now)
	activeGlobalBytes, _, _ := normalized.ActiveGlobalTempBonusBytes(now)
	return mediaRelayConfigResponse{
		Enabled:                   normalized.Enabled,
		IsReady:                   normalized.IsReady(),
		Provider:                  normalized.Provider,
		Endpoint:                  normalized.Endpoint,
		Region:                    normalized.Region,
		Bucket:                    normalized.Bucket,
		PublicBaseURL:             normalized.PublicBaseURL,
		KeyPrefix:                 normalized.KeyPrefix,
		AccessKeyId:               normalized.AccessKeyId,
		AccessKeySecretConfigured: normalized.AccessKeySecret != "",
		ForcePathStyle:            normalized.ForcePathStyle,
		PresignTTLSeconds:         normalized.PresignTTLSeconds,
		RetentionDays:             normalized.RetentionDays,
		MaxFileSizeMB:             normalized.MaxFileSizeMB,
		DefaultDailyTrafficMB:     normalized.DefaultDailyTrafficMB,
		GroupDailyBonusMB:         normalized.GroupDailyBonusMB,
		TempGlobalBonusMB:         normalized.TempGlobalBonusMB,
		TempGlobalExpiresAt:       normalized.TempGlobalExpiresAt,
		TempGlobalNote:            normalized.TempGlobalNote,
		ActiveGlobalTempBonusMB:   int(activeGlobalBytes / operation_setting.BytesPerMiB),
		TrafficDate:               dateKey,
		ResetAt:                   resetAt,
	}
}

func mergeMediaRelayUpdateRequest(current operation_setting.MediaRelaySetting, req mediaRelayConfigUpdateRequest) operation_setting.MediaRelaySetting {
	secret := strings.TrimSpace(req.AccessKeySecret)
	if secret == "" && !req.ClearAccessKeySecret {
		secret = current.AccessKeySecret
	}
	groupBonus := req.GroupDailyBonusMB
	if groupBonus == nil {
		groupBonus = map[string]int{}
	}
	return operation_setting.MediaRelaySetting{
		Enabled:               req.Enabled,
		Provider:              req.Provider,
		Endpoint:              req.Endpoint,
		Region:                req.Region,
		Bucket:                req.Bucket,
		PublicBaseURL:         req.PublicBaseURL,
		KeyPrefix:             req.KeyPrefix,
		AccessKeyId:           req.AccessKeyId,
		AccessKeySecret:       secret,
		ForcePathStyle:        req.ForcePathStyle,
		PresignTTLSeconds:     req.PresignTTLSeconds,
		RetentionDays:         req.RetentionDays,
		MaxFileSizeMB:         req.MaxFileSizeMB,
		DefaultDailyTrafficMB: req.DefaultDailyTrafficMB,
		GroupDailyBonusMB:     groupBonus,
		TempGlobalBonusMB:     req.TempGlobalBonusMB,
		TempGlobalExpiresAt:   req.TempGlobalExpiresAt,
		TempGlobalNote:        req.TempGlobalNote,
	}.Normalized()
}

// GetMediaQuota 返回当前 API Key 所属用户的每日云端中转流量配额与使用明细
func GetMediaQuota(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		common.ApiErrorStatus(c, http.StatusUnauthorized, common.NewMessage("Unauthorized"))
		return
	}
	summary, err := model.GetUserMediaTrafficQuota(userId, time.Now())
	if err != nil {
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to load daily media transfer quota"))
		return
	}
	common.ApiSuccess(c, summary)
}

// GetMediaAccount 返回当前 API Key 所属用户的余额、有效订阅套餐与今日云端中转流量摘要
func GetMediaAccount(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		common.ApiErrorStatus(c, http.StatusUnauthorized, common.NewMessage("Unauthorized"))
		return
	}
	user, err := model.GetUserById(userId, false)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorStatus(c, http.StatusUnauthorized, common.NewMessage("Unauthorized"))
			return
		}
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to load user account"))
		return
	}

	var tokenInfo gin.H
	if tokenId := c.GetInt("token_id"); tokenId > 0 {
		if token, tErr := model.GetTokenByIds(tokenId, userId); tErr == nil && token != nil {
			tokenInfo = gin.H{
				"id":              token.Id,
				"name":            token.Name,
				"group":           strings.TrimSpace(token.Group),
				"remain_quota":    token.RemainQuota,
				"used_quota":      token.UsedQuota,
				"unlimited_quota": token.UnlimitedQuota,
			}
		}
	}

	activeSubs, _ := model.GetAllActiveUserSubscriptions(userId)
	subItems := make([]mediaAccountSubscriptionItem, 0, len(activeSubs))
	for _, summary := range activeSubs {
		sub := summary.Subscription
		if sub == nil {
			continue
		}
		item := mediaAccountSubscriptionItem{
			Id:                  sub.Id,
			PlanId:              sub.PlanId,
			AmountTotal:         sub.AmountTotal,
			AmountUsed:          sub.AmountUsed,
			StartTime:           sub.StartTime,
			EndTime:             sub.EndTime,
			Status:              sub.Status,
			UpgradeGroup:        sub.UpgradeGroup,
			AllowWalletOverflow: sub.AllowWalletOverflow,
		}
		if plan, pErr := model.GetSubscriptionPlanById(sub.PlanId); pErr == nil && plan != nil {
			item.PlanTitle = plan.Title
			item.PlanSubtitle = plan.Subtitle
		}
		subItems = append(subItems, item)
	}

	mediaQuota, _ := model.GetUserMediaTrafficQuota(userId, time.Now())
	common.ApiSuccess(c, gin.H{
		"user": gin.H{
			"id":            user.Id,
			"username":      user.Username,
			"display_name":  user.DisplayName,
			"email":         user.Email,
			"group":         user.Group,
			"quota":         user.Quota,
			"used_quota":    user.UsedQuota,
			"request_count": user.RequestCount,
		},
		"token":         tokenInfo,
		"billing":       buildMediaBillingDisplay(),
		"subscriptions": subItems,
		"media_quota":   mediaQuota,
	})
}

// GetMediaPricing 返回当前 API Key 所属用户可用分组与模型计费倍率，供画布实时展示模型消费说明
func GetMediaPricing(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		common.ApiErrorStatus(c, http.StatusUnauthorized, common.NewMessage("Unauthorized"))
		return
	}
	user, err := model.GetUserById(userId, false)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorStatus(c, http.StatusUnauthorized, common.NewMessage("Unauthorized"))
			return
		}
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to load user account"))
		return
	}

	userGroup := strings.TrimSpace(user.Group)
	tokenGroup := ""
	if tokenId := c.GetInt("token_id"); tokenId > 0 {
		if token, tErr := model.GetTokenByIds(tokenId, userId); tErr == nil && token != nil {
			tokenGroup = strings.TrimSpace(token.Group)
		}
	}

	usableGroup := service.GetUserUsableGroups(userGroup)
	pricing := filterPricingByUsableGroups(model.GetPricing(), usableGroup)
	preferences, _ := model.GetUserSetting(userId, false)
	references := console_setting.GetOfficialModelPrices()
	for index := range pricing {
		if preferences.AcceptUnsetRatioModel {
			pricing[index].PriceUnconfigured = false
		}
		pricing[index].OfficialPrice = references[pricing[index].ModelName]
	}

	groupRatio := ratio_setting.GetGroupRatioCopy()
	for group := range groupRatio {
		if _, ok := usableGroup[group]; !ok {
			delete(groupRatio, group)
			continue
		}
		if userGroup != "" {
			if ratio, ok := ratio_setting.GetGroupGroupRatio(userGroup, group); ok {
				groupRatio[group] = ratio
			}
		}
	}

	common.ApiSuccess(c, gin.H{
		"models":       pricing,
		"group_ratio":  groupRatio,
		"usable_group": usableGroup,
		"user_group":   userGroup,
		"token_group":  tokenGroup,
		"billing":      buildMediaBillingDisplay(),
	})
}

// PresignMediaUpload 校验每日流量并签发对象存储直传 PUT 预签名地址（同内容 SHA-256 自动去重免扣流量）
func PresignMediaUpload(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		common.ApiErrorStatus(c, http.StatusUnauthorized, common.NewMessage("Unauthorized"))
		return
	}
	cfg := operation_setting.GetMediaRelaySettingSnapshot()
	if !cfg.IsReady() {
		common.ApiErrorStatus(c, http.StatusServiceUnavailable, common.NewMessage("Cloud media relay is not enabled or configured"), gin.H{
			"code": "MEDIA_RELAY_NOT_CONFIGURED",
		})
		return
	}

	var req mediaPresignRequest
	if err := common.DecodeJsonBody(c.Request.Body, &req); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid upload parameters"))
		return
	}
	maxBytes := int64(cfg.MaxFileSizeMB) * operation_setting.BytesPerMiB
	if req.SizeBytes <= 0 || req.SizeBytes > maxBytes {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("File size exceeds allowed single-file limit"), gin.H{
			"code":                "MEDIA_FILE_TOO_LARGE",
			"max_file_size_bytes": maxBytes,
		})
		return
	}

	now := time.Now()
	contentType := strings.TrimSpace(req.ContentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	normalizedSHA := strings.ToLower(strings.TrimSpace(req.SHA256))

	if existing, err := model.FindReusableMediaRelayObject(userId, normalizedSHA, req.SizeBytes, now); err == nil && existing != nil {
		quota, qErr := model.GetUserMediaTrafficQuota(userId, now)
		if qErr != nil {
			common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to load daily media transfer quota"))
			return
		}
		common.ApiSuccess(c, gin.H{
			"reused":     true,
			"object_id":  existing.Id,
			"object_key": existing.ObjectKey,
			"public_url": existing.PublicURL,
			"expires_at": existing.ExpiresAt,
			"quota":      quota,
		})
		return
	}

	dateKey, _ := operation_setting.MediaTrafficDayWindow(now)
	objectKey := service.BuildMediaRelayObjectKey(cfg.KeyPrefix, userId, dateKey, normalizedSHA, req.FileName, contentType)
	presigned, err := service.PresignMediaPutUpload(cfg, objectKey, contentType, now)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to generate upload signature"))
		return
	}

	objectExpiresAt := now.Add(time.Duration(cfg.RetentionDays) * 24 * time.Hour).Unix()
	fileName := strings.TrimSpace(req.FileName)
	if len(fileName) > 255 {
		fileName = fileName[:255]
	}
	if len(contentType) > 128 {
		contentType = contentType[:128]
	}
	obj := &model.MediaRelayObject{
		ObjectKey:   presigned.ObjectKey,
		SHA256:      normalizedSHA,
		SizeBytes:   req.SizeBytes,
		ContentType: contentType,
		FileName:    fileName,
		PublicURL:   presigned.PublicURL,
		ExpiresAt:   objectExpiresAt,
	}

	quota, err := model.ReserveUserMediaDailyTraffic(userId, req.SizeBytes, now, obj)
	if err != nil {
		if errors.Is(err, model.ErrMediaDailyTrafficExceeded) {
			common.ApiErrorStatus(c, http.StatusTooManyRequests, common.NewMessage("Daily cloud media transfer traffic limit exceeded"), gin.H{
				"code": "MEDIA_DAILY_TRAFFIC_EXCEEDED",
				"data": quota,
			})
			return
		}
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to reserve daily media transfer quota"))
		return
	}

	common.ApiSuccess(c, gin.H{
		"reused":         false,
		"object_id":      obj.Id,
		"object_key":     presigned.ObjectKey,
		"upload_url":     presigned.UploadURL,
		"upload_method":  presigned.UploadMethod,
		"upload_headers": presigned.UploadHeaders,
		"public_url":     presigned.PublicURL,
		"signed_until":   presigned.SignedUntil,
		"expires_at":     objectExpiresAt,
		"quota":          quota,
	})
}

// CompleteMediaUpload 在浏览器直传对象存储成功后确认素材就绪
func CompleteMediaUpload(c *gin.Context) {
	userId := c.GetInt("id")
	var req mediaObjectActionRequest
	if err := common.DecodeJsonBody(c.Request.Body, &req); err != nil || req.ObjectId <= 0 {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid upload parameters"))
		return
	}
	obj, quota, err := model.CompleteUserMediaRelayObject(userId, req.ObjectId, time.Now())
	if err != nil {
		if errors.Is(err, model.ErrMediaRelayObjectNotFound) {
			common.ApiErrorStatus(c, http.StatusNotFound, common.NewMessage("Upload record not found"))
			return
		}
		common.ApiErrorStatus(c, http.StatusBadRequest, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"object_id":  obj.Id,
		"object_key": obj.ObjectKey,
		"public_url": obj.PublicURL,
		"expires_at": obj.ExpiresAt,
		"quota":      quota,
	})
}

// AbortMediaUpload 在浏览器直传失败时回滚预扣的当日流量
func AbortMediaUpload(c *gin.Context) {
	userId := c.GetInt("id")
	var req mediaObjectActionRequest
	if err := common.DecodeJsonBody(c.Request.Body, &req); err != nil || req.ObjectId <= 0 {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid upload parameters"))
		return
	}
	quota, err := model.AbortUserMediaRelayObject(userId, req.ObjectId, time.Now())
	if err != nil {
		if errors.Is(err, model.ErrMediaRelayObjectNotFound) {
			common.ApiErrorStatus(c, http.StatusNotFound, common.NewMessage("Upload record not found"))
			return
		}
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to abort upload reservation"))
		return
	}
	common.ApiSuccess(c, gin.H{
		"aborted": true,
		"quota":   quota,
	})
}

// GetMediaRelayConfig 返回画布媒体中转与每日流量配置（Root）
func GetMediaRelayConfig(c *gin.Context) {
	cfg := operation_setting.GetMediaRelaySettingSnapshot()
	common.ApiSuccess(c, buildMediaRelayConfigResponse(cfg, time.Now()))
}

// UpdateMediaRelayConfig 更新画布媒体中转存储桶、基础流量与全站临时增量配置（Root）
func UpdateMediaRelayConfig(c *gin.Context) {
	var req mediaRelayConfigUpdateRequest
	if err := common.DecodeJsonBody(c.Request.Body, &req); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	current := operation_setting.GetMediaRelaySettingSnapshot()
	next := mergeMediaRelayUpdateRequest(current, req)
	if err := next.Validate(); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, err)
		return
	}
	optionMap, err := next.ToOptionMap()
	if err != nil {
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to serialize configuration"))
		return
	}
	if err := model.UpdateOptionsBulk(optionMap); err != nil {
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to save configuration"))
		return
	}
	recordManageAudit(c, "option.media_relay_update", map[string]any{
		"enabled":                  next.Enabled,
		"provider":                 next.Provider,
		"region":                   next.Region,
		"bucket":                   next.Bucket,
		"default_daily_traffic_mb": next.DefaultDailyTrafficMB,
		"temp_global_bonus_mb":     next.TempGlobalBonusMB,
		"temp_global_expires_at":   next.TempGlobalExpiresAt,
	})
	common.ApiSuccess(c, buildMediaRelayConfigResponse(next, time.Now()))
}

// TestMediaRelayConfig 测试当前或草稿 OSS/S3 存储桶连通性与签名凭证（Root）
func TestMediaRelayConfig(c *gin.Context) {
	current := operation_setting.GetMediaRelaySettingSnapshot()
	candidate := current
	if c.Request.ContentLength > 0 {
		var req mediaRelayConfigUpdateRequest
		if err := common.DecodeJsonBody(c.Request.Body, &req); err != nil {
			common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
			return
		}
		candidate = mergeMediaRelayUpdateRequest(current, req)
	}
	result, err := service.TestMediaRelayBucketConnectivity(c.Request.Context(), candidate)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, err)
		return
	}
	common.ApiSuccess(c, result)
}

// ListMediaTrafficOverrides 列出所有针对性用户每日流量增量记录（Root）
func ListMediaTrafficOverrides(c *gin.Context) {
	now := time.Now()
	keyword := strings.TrimSpace(c.Query("keyword"))
	items, err := model.ListMediaTrafficOverrides(keyword, now)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to load targeted traffic overrides"))
		return
	}
	dateKey, resetAt := operation_setting.MediaTrafficDayWindow(now)
	common.ApiSuccess(c, gin.H{
		"items":        items,
		"traffic_date": dateKey,
		"reset_at":     resetAt,
	})
}

// GetAdminUserMediaTraffic 查询指定用户的当日流量及有效额度明细（Root）
func GetAdminUserMediaTraffic(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || userId <= 0 {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid user ID"))
		return
	}
	user, err := model.GetUserById(userId, false)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorStatus(c, http.StatusNotFound, common.NewMessage("User does not exist"))
			return
		}
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to load user"))
		return
	}
	summary, err := model.GetUserMediaTrafficQuota(userId, time.Now())
	if err != nil {
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to load daily media transfer quota"))
		return
	}
	common.ApiSuccess(c, gin.H{
		"user": gin.H{
			"id":           user.Id,
			"username":     user.Username,
			"display_name": user.DisplayName,
			"group":        user.Group,
		},
		"quota": summary,
	})
}

// UpsertMediaTrafficOverride 为指定用户新增或修改针对性每日流量增量（Root）
func UpsertMediaTrafficOverride(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || userId <= 0 {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid user ID"))
		return
	}
	var req mediaOverrideUpsertRequest
	if err := common.DecodeJsonBody(c.Request.Body, &req); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	if req.ExtraDailyMB <= 0 || req.ExtraDailyMB > operation_setting.MaxMediaRelayDailyTrafficMB {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Targeted daily traffic bonus must be between 1 and 1048576 MB"))
		return
	}
	operatorId := c.GetInt("id")
	extraBytes := req.ExtraDailyMB * operation_setting.BytesPerMiB
	override, err := model.UpsertMediaTrafficOverride(userId, extraBytes, req.ExpiresAt, req.Note, operatorId)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, err)
		return
	}
	recordManageAuditFor(c, userId, "option.media_relay_override_upsert", map[string]any{
		"extra_daily_mb": req.ExtraDailyMB,
		"expires_at":     req.ExpiresAt,
		"note":           strings.TrimSpace(req.Note),
	})
	quota, _ := model.GetUserMediaTrafficQuota(userId, time.Now())
	common.ApiSuccess(c, gin.H{
		"override": override,
		"quota":    quota,
	})
}

// DeleteMediaTrafficOverride 移除指定用户的针对性每日流量增量（Root）
func DeleteMediaTrafficOverride(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || userId <= 0 {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid user ID"))
		return
	}
	if err := model.DeleteMediaTrafficOverride(userId); err != nil {
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to remove targeted traffic override"))
		return
	}
	recordManageAuditFor(c, userId, "option.media_relay_override_delete", map[string]any{})
	common.ApiSuccess(c, nil)
}

// ResetAdminUserMediaDailyTraffic 清零指定用户当日已用中转流量（Root）
func ResetAdminUserMediaDailyTraffic(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || userId <= 0 {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid user ID"))
		return
	}
	quota, err := model.ResetUserMediaDailyTraffic(userId, time.Now())
	if err != nil {
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to reset user daily traffic"))
		return
	}
	recordManageAuditFor(c, userId, "option.media_relay_usage_reset", map[string]any{
		"traffic_date": quota.TrafficDate,
	})
	common.ApiSuccess(c, quota)
}
