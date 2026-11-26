package model

import (
	"cmp"
	"errors"
	"math"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	MediaRelayObjectStatusPending = "pending"
	MediaRelayObjectStatusReady   = "ready"
	MediaRelayObjectStatusAborted = "aborted"
)

var (
	ErrMediaDailyTrafficExceeded = errors.New("daily media transfer traffic limit exceeded")
	ErrMediaRelayObjectNotFound  = errors.New("media relay object not found")
)

// MediaDailyTraffic 记录用户每日已消耗的云端中转流量（按日重置，非永久存储空间）
type MediaDailyTraffic struct {
	Id          int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId      int    `json:"user_id" gorm:"not null;uniqueIndex:idx_media_daily_user_date"`
	TrafficDate string `json:"traffic_date" gorm:"type:varchar(10);not null;uniqueIndex:idx_media_daily_user_date"`
	UsedBytes   int64  `json:"used_bytes" gorm:"type:bigint;not null;default:0"`
	UploadCount int    `json:"upload_count" gorm:"type:int;not null;default:0"`
	UpdatedAt   int64  `json:"updated_at" gorm:"type:bigint;not null;default:0"`
}

func (MediaDailyTraffic) TableName() string {
	return "media_daily_traffic"
}

// MediaTrafficOverride 记录针对指定用户的每日中转流量定向增量（支持长期或临时到期自动失效）
type MediaTrafficOverride struct {
	Id              int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId          int    `json:"user_id" gorm:"not null;uniqueIndex"`
	ExtraDailyBytes int64  `json:"extra_daily_bytes" gorm:"type:bigint;not null;default:0"`
	ExpiresAt       int64  `json:"expires_at" gorm:"type:bigint;not null;default:0"`
	Note            string `json:"note" gorm:"type:varchar(255);not null;default:''"`
	UpdatedBy       int    `json:"updated_by" gorm:"type:int;not null;default:0"`
	UpdatedAt       int64  `json:"updated_at" gorm:"type:bigint;not null;default:0"`
}

func (MediaTrafficOverride) TableName() string {
	return "media_traffic_overrides"
}

// MediaRelayObject 记录预签名上传与同用户 SHA-256 去重索引
type MediaRelayObject struct {
	Id          int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId      int    `json:"user_id" gorm:"not null;index:idx_media_obj_user_sha"`
	ObjectKey   string `json:"object_key" gorm:"type:varchar(512);not null;uniqueIndex"`
	SHA256      string `json:"sha256" gorm:"type:varchar(64);not null;default:'';index:idx_media_obj_user_sha"`
	SizeBytes   int64  `json:"size_bytes" gorm:"type:bigint;not null;default:0"`
	ContentType string `json:"content_type" gorm:"type:varchar(128);not null;default:''"`
	FileName    string `json:"file_name" gorm:"type:varchar(255);not null;default:''"`
	PublicURL   string `json:"public_url" gorm:"type:text;not null"`
	Status      string `json:"status" gorm:"type:varchar(16);not null;default:'pending';index"`
	TrafficDate string `json:"traffic_date" gorm:"type:varchar(10);not null;index"`
	ExpiresAt   int64  `json:"expires_at" gorm:"type:bigint;not null;default:0;index"`
	CreatedAt   int64  `json:"created_at" gorm:"type:bigint;not null;default:0"`
}

func (MediaRelayObject) TableName() string {
	return "media_relay_objects"
}

// MediaTrafficQuotaSummary 汇总用户当日云端中转流量使用与有效配额明细
type MediaTrafficQuotaSummary struct {
	Enabled              bool   `json:"enabled"`
	Provider             string `json:"provider"`
	Region               string `json:"region"`
	TrafficDate          string `json:"traffic_date"`
	ResetAt              int64  `json:"reset_at"`
	RetentionDays        int    `json:"retention_days"`
	MaxFileSizeBytes     int64  `json:"max_file_size_bytes"`
	UsedBytes            int64  `json:"used_bytes"`
	UploadCount          int    `json:"upload_count"`
	BaseDailyBytes       int64  `json:"base_daily_bytes"`
	GroupName            string `json:"group_name"`
	GroupBonusBytes      int64  `json:"group_bonus_bytes"`
	GlobalTempBonusBytes int64  `json:"global_temp_bonus_bytes"`
	GlobalTempExpiresAt  int64  `json:"global_temp_expires_at"`
	GlobalTempNote       string `json:"global_temp_note"`
	UserBonusBytes       int64  `json:"user_bonus_bytes"`
	UserBonusExpiresAt   int64  `json:"user_bonus_expires_at"`
	UserBonusNote        string `json:"user_bonus_note"`
	EffectiveDailyBytes  int64  `json:"effective_daily_bytes"`
	RemainingBytes       int64  `json:"remaining_bytes"`
}

// MediaTrafficOverrideView 用于后台管理面板展示针对性增量及实时当日用量
type MediaTrafficOverrideView struct {
	UserId              int    `json:"user_id"`
	Username            string `json:"username"`
	DisplayName         string `json:"display_name"`
	Group               string `json:"group"`
	ExtraDailyBytes     int64  `json:"extra_daily_bytes"`
	ExtraDailyMB        int64  `json:"extra_daily_mb"`
	ExpiresAt           int64  `json:"expires_at"`
	Active              bool   `json:"active"`
	Note                string `json:"note"`
	UpdatedBy           int    `json:"updated_by"`
	UpdatedAt           int64  `json:"updated_at"`
	TodayUsedBytes      int64  `json:"today_used_bytes"`
	EffectiveDailyBytes int64  `json:"effective_daily_bytes"`
}

func computeMediaTrafficSummary(
	cfg operation_setting.MediaRelaySetting,
	userGroup string,
	usage MediaDailyTraffic,
	override *MediaTrafficOverride,
	now time.Time,
) MediaTrafficQuotaSummary {
	dateKey, resetAt := operation_setting.MediaTrafficDayWindow(now)
	normalizedGroup := strings.TrimSpace(userGroup)
	if normalizedGroup == "" {
		normalizedGroup = "default"
	}

	baseBytes := int64(cfg.DefaultDailyTrafficMB) * operation_setting.BytesPerMiB
	groupBonusBytes := cfg.GroupBonusBytes(normalizedGroup)
	globalBonusBytes, globalExpiresAt, globalNote := cfg.ActiveGlobalTempBonusBytes(now)

	var userBonusBytes int64
	var userBonusExpiresAt int64
	var userBonusNote string
	if override != nil && override.ExtraDailyBytes > 0 {
		if override.ExpiresAt == 0 || override.ExpiresAt > now.Unix() {
			userBonusBytes = override.ExtraDailyBytes
			userBonusExpiresAt = override.ExpiresAt
			userBonusNote = override.Note
		}
	}

	effectiveBytes := baseBytes + groupBonusBytes + globalBonusBytes + userBonusBytes
	remainingBytes := effectiveBytes - usage.UsedBytes
	if remainingBytes < 0 {
		remainingBytes = 0
	}

	return MediaTrafficQuotaSummary{
		Enabled:              cfg.IsReady(),
		Provider:             cfg.Provider,
		Region:               cfg.Region,
		TrafficDate:          dateKey,
		ResetAt:              resetAt,
		RetentionDays:        cfg.RetentionDays,
		MaxFileSizeBytes:     int64(cfg.MaxFileSizeMB) * operation_setting.BytesPerMiB,
		UsedBytes:            usage.UsedBytes,
		UploadCount:          usage.UploadCount,
		BaseDailyBytes:       baseBytes,
		GroupName:            normalizedGroup,
		GroupBonusBytes:      groupBonusBytes,
		GlobalTempBonusBytes: globalBonusBytes,
		GlobalTempExpiresAt:  globalExpiresAt,
		GlobalTempNote:       globalNote,
		UserBonusBytes:       userBonusBytes,
		UserBonusExpiresAt:   userBonusExpiresAt,
		UserBonusNote:        userBonusNote,
		EffectiveDailyBytes:  effectiveBytes,
		RemainingBytes:       remainingBytes,
	}
}

func loadUserGroupAndOverrideTx(tx *gorm.DB, userId int) (string, *MediaTrafficOverride, error) {
	var user User
	if err := tx.Select("id", commonGroupCol).Where("id = ?", userId).First(&user).Error; err != nil {
		return "", nil, err
	}
	var override MediaTrafficOverride
	err := tx.Where("user_id = ?", userId).First(&override).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return user.Group, nil, nil
	}
	if err != nil {
		return "", nil, err
	}
	return user.Group, &override, nil
}

func loadUserDailyTrafficTx(tx *gorm.DB, userId int, dateKey string) (MediaDailyTraffic, error) {
	var usage MediaDailyTraffic
	err := tx.Where("user_id = ? AND traffic_date = ?", userId, dateKey).First(&usage).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return MediaDailyTraffic{UserId: userId, TrafficDate: dateKey}, nil
	}
	return usage, err
}

// GetUserMediaTrafficQuota 查询用户当前每日中转流量配额与今日使用量
func GetUserMediaTrafficQuota(userId int, now time.Time) (*MediaTrafficQuotaSummary, error) {
	cfg := operation_setting.GetMediaRelaySettingSnapshot()
	dateKey, _ := operation_setting.MediaTrafficDayWindow(now)

	group, override, err := loadUserGroupAndOverrideTx(DB, userId)
	if err != nil {
		return nil, err
	}
	usage, err := loadUserDailyTrafficTx(DB, userId, dateKey)
	if err != nil {
		return nil, err
	}
	summary := computeMediaTrafficSummary(cfg, group, usage, override, now)
	return &summary, nil
}

// FindReusableMediaRelayObject 查找同用户未过期的相同内容哈希对象（用于零流量秒传复用）
func FindReusableMediaRelayObject(userId int, sha256Hex string, sizeBytes int64, now time.Time) (*MediaRelayObject, error) {
	normalizedHash := strings.ToLower(strings.TrimSpace(sha256Hex))
	if len(normalizedHash) != 64 || sizeBytes <= 0 {
		return nil, nil
	}
	// 至少保留 2 小时有效期，避免返回即将被 OSS 生命周期清理的链接
	minExpiry := now.Add(2 * time.Hour).Unix()
	var existing MediaRelayObject
	err := DB.Where(
		"user_id = ? AND sha256 = ? AND size_bytes = ? AND status = ? AND expires_at > ?",
		userId, normalizedHash, sizeBytes, MediaRelayObjectStatusReady, minExpiry,
	).Order("id DESC").First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &existing, nil
}

// ReserveUserMediaDailyTraffic 原子校验并扣减用户当日中转流量配额，同时登记待上传对象
func ReserveUserMediaDailyTraffic(
	userId int,
	sizeBytes int64,
	now time.Time,
	obj *MediaRelayObject,
) (*MediaTrafficQuotaSummary, error) {
	if sizeBytes <= 0 {
		return nil, common.NewMessage("File size must be greater than zero")
	}
	cfg := operation_setting.GetMediaRelaySettingSnapshot()
	dateKey, _ := operation_setting.MediaTrafficDayWindow(now)
	nowUnix := now.Unix()

	var summary MediaTrafficQuotaSummary
	err := DB.Transaction(func(tx *gorm.DB) error {
		group, override, err := loadUserGroupAndOverrideTx(tx, userId)
		if err != nil {
			return err
		}
		preUsage, err := loadUserDailyTrafficTx(tx, userId, dateKey)
		if err != nil {
			return err
		}
		effective := computeMediaTrafficSummary(cfg, group, preUsage, override, now).EffectiveDailyBytes

		seed := MediaDailyTraffic{
			UserId:      userId,
			TrafficDate: dateKey,
			UsedBytes:   0,
			UploadCount: 0,
			UpdatedAt:   nowUnix,
		}
		if err := tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "user_id"}, {Name: "traffic_date"}},
			DoNothing: true,
		}).Create(&seed).Error; err != nil {
			return err
		}

		updateRes := tx.Model(&MediaDailyTraffic{}).
			Where("user_id = ? AND traffic_date = ? AND used_bytes + ? <= ?", userId, dateKey, sizeBytes, effective).
			Updates(map[string]any{
				"used_bytes":   gorm.Expr("used_bytes + ?", sizeBytes),
				"upload_count": gorm.Expr("upload_count + 1"),
				"updated_at":   nowUnix,
			})
		if updateRes.Error != nil {
			return updateRes.Error
		}
		if updateRes.RowsAffected == 0 {
			latestUsage, _ := loadUserDailyTrafficTx(tx, userId, dateKey)
			summary = computeMediaTrafficSummary(cfg, group, latestUsage, override, now)
			return ErrMediaDailyTrafficExceeded
		}

		obj.UserId = userId
		obj.SizeBytes = sizeBytes
		obj.Status = MediaRelayObjectStatusPending
		obj.TrafficDate = dateKey
		obj.CreatedAt = nowUnix
		if err := tx.Create(obj).Error; err != nil {
			return err
		}

		afterUsage, err := loadUserDailyTrafficTx(tx, userId, dateKey)
		if err != nil {
			return err
		}
		summary = computeMediaTrafficSummary(cfg, group, afterUsage, override, now)
		return nil
	})
	if err != nil {
		if errors.Is(err, ErrMediaDailyTrafficExceeded) {
			return &summary, err
		}
		return nil, err
	}
	return &summary, nil
}

// CompleteUserMediaRelayObject 将直传成功的对象标记为 ready
func CompleteUserMediaRelayObject(userId int, objectId int, now time.Time) (*MediaRelayObject, *MediaTrafficQuotaSummary, error) {
	var obj MediaRelayObject
	if err := DB.Where("id = ? AND user_id = ?", objectId, userId).First(&obj).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, ErrMediaRelayObjectNotFound
		}
		return nil, nil, err
	}
	if obj.Status == MediaRelayObjectStatusAborted {
		return nil, nil, common.NewMessage("Upload reservation has already been aborted")
	}
	if obj.Status != MediaRelayObjectStatusReady {
		if err := DB.Model(&MediaRelayObject{}).
			Where("id = ? AND user_id = ? AND status = ?", objectId, userId, MediaRelayObjectStatusPending).
			Update("status", MediaRelayObjectStatusReady).Error; err != nil {
			return nil, nil, err
		}
		obj.Status = MediaRelayObjectStatusReady
	}
	summary, err := GetUserMediaTrafficQuota(userId, now)
	if err != nil {
		return nil, nil, err
	}
	return &obj, summary, nil
}

// AbortUserMediaRelayObject 在浏览器直传失败时撤销预扣流量
func AbortUserMediaRelayObject(userId int, objectId int, now time.Time) (*MediaTrafficQuotaSummary, error) {
	nowUnix := now.Unix()
	err := DB.Transaction(func(tx *gorm.DB) error {
		var obj MediaRelayObject
		if err := tx.Where("id = ? AND user_id = ?", objectId, userId).First(&obj).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrMediaRelayObjectNotFound
			}
			return err
		}
		res := tx.Model(&MediaRelayObject{}).
			Where("id = ? AND user_id = ? AND status = ?", objectId, userId, MediaRelayObjectStatusPending).
			Update("status", MediaRelayObjectStatusAborted)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return nil
		}
		return tx.Model(&MediaDailyTraffic{}).
			Where("user_id = ? AND traffic_date = ?", userId, obj.TrafficDate).
			Updates(map[string]any{
				"used_bytes":   gorm.Expr("CASE WHEN used_bytes >= ? THEN used_bytes - ? ELSE 0 END", obj.SizeBytes, obj.SizeBytes),
				"upload_count": gorm.Expr("CASE WHEN upload_count > 0 THEN upload_count - 1 ELSE 0 END"),
				"updated_at":   nowUnix,
			}).Error
	})
	if err != nil {
		return nil, err
	}
	return GetUserMediaTrafficQuota(userId, now)
}

// UpsertMediaTrafficOverride 为指定用户新增或更新针对性每日流量增量
func UpsertMediaTrafficOverride(userId int, extraDailyBytes int64, expiresAt int64, note string, operatorId int) (*MediaTrafficOverride, error) {
	if userId <= 0 {
		return nil, common.NewMessage("Invalid user ID")
	}
	if extraDailyBytes <= 0 {
		return nil, common.NewMessage("Targeted daily traffic bonus must be greater than 0")
	}
	if expiresAt < 0 {
		expiresAt = 0
	}
	trimmedNote := strings.TrimSpace(note)
	if len(trimmedNote) > 255 {
		return nil, common.NewMessage("Note cannot exceed 255 characters")
	}
	var user User
	if err := DB.Select("id").Where("id = ?", userId).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, common.NewMessage("User does not exist")
		}
		return nil, err
	}
	row := MediaTrafficOverride{
		UserId:          userId,
		ExtraDailyBytes: extraDailyBytes,
		ExpiresAt:       expiresAt,
		Note:            trimmedNote,
		UpdatedBy:       operatorId,
		UpdatedAt:       time.Now().Unix(),
	}
	err := DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"extra_daily_bytes",
			"expires_at",
			"note",
			"updated_by",
			"updated_at",
		}),
	}).Create(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

// DeleteMediaTrafficOverride 移除指定用户的针对性流量增量
func DeleteMediaTrafficOverride(userId int) error {
	return DB.Where("user_id = ?", userId).Delete(&MediaTrafficOverride{}).Error
}

// ResetUserMediaDailyTraffic 清零指定用户当日已消耗的中转流量
func ResetUserMediaDailyTraffic(userId int, now time.Time) (*MediaTrafficQuotaSummary, error) {
	dateKey, _ := operation_setting.MediaTrafficDayWindow(now)
	if err := DB.Where("user_id = ? AND traffic_date = ?", userId, dateKey).Delete(&MediaDailyTraffic{}).Error; err != nil {
		return nil, err
	}
	return GetUserMediaTrafficQuota(userId, now)
}

// ListMediaTrafficOverrides 列出所有针对性用户增量并附带当日实时用量
func ListMediaTrafficOverrides(keyword string, now time.Time) ([]MediaTrafficOverrideView, error) {
	cfg := operation_setting.GetMediaRelaySettingSnapshot()
	dateKey, _ := operation_setting.MediaTrafficDayWindow(now)
	nowUnix := now.Unix()

	var overrides []MediaTrafficOverride
	if err := DB.Order("updated_at DESC").Find(&overrides).Error; err != nil {
		return nil, err
	}
	if len(overrides) == 0 {
		return []MediaTrafficOverrideView{}, nil
	}

	userIds := make([]int, 0, len(overrides))
	for _, row := range overrides {
		userIds = append(userIds, row.UserId)
	}

	var users []User
	if err := DB.Select("id", "username", "display_name", commonGroupCol).Where("id IN ?", userIds).Find(&users).Error; err != nil {
		return nil, err
	}
	userMap := make(map[int]User, len(users))
	for _, u := range users {
		userMap[u.Id] = u
	}

	var usages []MediaDailyTraffic
	if err := DB.Where("user_id IN ? AND traffic_date = ?", userIds, dateKey).Find(&usages).Error; err != nil {
		return nil, err
	}
	usageMap := make(map[int]MediaDailyTraffic, len(usages))
	for _, u := range usages {
		usageMap[u.UserId] = u
	}

	needle := strings.ToLower(strings.TrimSpace(keyword))
	views := make([]MediaTrafficOverrideView, 0, len(overrides))
	for i := range overrides {
		row := overrides[i]
		u, hasUser := userMap[row.UserId]
		if !hasUser {
			continue
		}
		if needle != "" {
			idStr := strconv.Itoa(u.Id)
			if !strings.Contains(idStr, needle) &&
				!strings.Contains(strings.ToLower(u.Username), needle) &&
				!strings.Contains(strings.ToLower(u.DisplayName), needle) &&
				!strings.Contains(strings.ToLower(row.Note), needle) {
				continue
			}
		}
		usage := usageMap[row.UserId]
		summary := computeMediaTrafficSummary(cfg, u.Group, usage, &row, now)
		views = append(views, MediaTrafficOverrideView{
			UserId:              row.UserId,
			Username:            u.Username,
			DisplayName:         u.DisplayName,
			Group:               summary.GroupName,
			ExtraDailyBytes:     row.ExtraDailyBytes,
			ExtraDailyMB:        row.ExtraDailyBytes / operation_setting.BytesPerMiB,
			ExpiresAt:           row.ExpiresAt,
			Active:              row.ExpiresAt == 0 || row.ExpiresAt > nowUnix,
			Note:                row.Note,
			UpdatedBy:           row.UpdatedBy,
			UpdatedAt:           row.UpdatedAt,
			TodayUsedBytes:      usage.UsedBytes,
			EffectiveDailyBytes: summary.EffectiveDailyBytes,
		})
	}
	return views, nil
}

type MediaTrafficPublicConfig struct {
	Enabled                 bool           `json:"enabled"`
	IsReady                 bool           `json:"is_ready"`
	Provider                string         `json:"provider"`
	Region                  string         `json:"region"`
	Bucket                  string         `json:"bucket"`
	RetentionDays           int            `json:"retention_days"`
	MaxFileSizeMB           int            `json:"max_file_size_mb"`
	DefaultDailyTrafficMB   int            `json:"default_daily_traffic_mb"`
	GroupDailyBonusMB       map[string]int `json:"group_daily_bonus_mb"`
	ActiveGlobalTempBonusMB int            `json:"active_global_temp_bonus_mb"`
	TempGlobalExpiresAt     int64          `json:"temp_global_expires_at"`
	TempGlobalNote          string         `json:"temp_global_note"`
	TrafficDate             string         `json:"traffic_date"`
	ResetAt                 int64          `json:"reset_at"`
}

type MediaTrafficAnalyticsSummary struct {
	Days                 int    `json:"days"`
	StartDate            string `json:"start_date"`
	EndDate              string `json:"end_date"`
	TodayUsedBytes       int64  `json:"today_used_bytes"`
	YesterdayUsedBytes   int64  `json:"yesterday_used_bytes"`
	TodayUploadCount     int64  `json:"today_upload_count"`
	TodayActiveUsers     int    `json:"today_active_users"`
	RangeUsedBytes       int64  `json:"range_used_bytes"`
	RangeUploadCount     int64  `json:"range_upload_count"`
	RangeActiveUsers     int    `json:"range_active_users"`
	AvgDailyBytes        int64  `json:"avg_daily_bytes"`
	PeakDailyBytes       int64  `json:"peak_daily_bytes"`
	PeakDate             string `json:"peak_date"`
	ActiveObjectsCount   int64  `json:"active_objects_count"`
	ActiveObjectsBytes   int64  `json:"active_objects_bytes"`
	ReadyObjectsCount    int64  `json:"ready_objects_count"`
	PendingObjectsCount  int64  `json:"pending_objects_count"`
	AbortedObjectsCount  int64  `json:"aborted_objects_count"`
	ActiveOverridesCount int    `json:"active_overrides_count"`
	NearLimitUsersCount  int    `json:"near_limit_users_count"`
}

type MediaDailyTrendPoint struct {
	Date        string `json:"date"`
	UsedBytes   int64  `json:"used_bytes"`
	UploadCount int64  `json:"upload_count"`
	ActiveUsers int    `json:"active_users"`
}

type MediaContentTypeStat struct {
	Category     string  `json:"category"`
	Count        int64   `json:"count"`
	TotalBytes   int64   `json:"total_bytes"`
	SharePercent float64 `json:"share_percent"`
}

type MediaUserTrafficRankItem struct {
	UserId              int     `json:"user_id"`
	Username            string  `json:"username"`
	DisplayName         string  `json:"display_name"`
	Group               string  `json:"group"`
	TodayUsedBytes      int64   `json:"today_used_bytes"`
	TodayUploadCount    int     `json:"today_upload_count"`
	EffectiveDailyBytes int64   `json:"effective_daily_bytes"`
	TodayUsagePercent   float64 `json:"today_usage_percent"`
	RangeUsedBytes      int64   `json:"range_used_bytes"`
	RangeUploadCount    int     `json:"range_upload_count"`
	ActiveOverrideBytes int64   `json:"active_override_bytes"`
	OverrideExpiresAt   int64   `json:"override_expires_at"`
	OverrideNote        string  `json:"override_note"`
}

type MediaTrafficAnalyticsReport struct {
	Config       MediaTrafficPublicConfig     `json:"config"`
	Summary      MediaTrafficAnalyticsSummary `json:"summary"`
	DailyTrend   []MediaDailyTrendPoint       `json:"daily_trend"`
	ContentTypes []MediaContentTypeStat       `json:"content_types"`
	TopUsers     []MediaUserTrafficRankItem   `json:"top_users"`
}

type MediaRelayObjectAdminView struct {
	Id          int    `json:"id"`
	UserId      int    `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Group       string `json:"group"`
	ObjectKey   string `json:"object_key"`
	FileName    string `json:"file_name"`
	ContentType string `json:"content_type"`
	Category    string `json:"category"`
	SizeBytes   int64  `json:"size_bytes"`
	Status      string `json:"status"`
	TrafficDate string `json:"traffic_date"`
	CreatedAt   int64  `json:"created_at"`
	ExpiresAt   int64  `json:"expires_at"`
	Expired     bool   `json:"expired"`
}

func classifyMediaContentType(contentType string) string {
	lower := strings.ToLower(strings.TrimSpace(contentType))
	switch {
	case strings.HasPrefix(lower, "image/"):
		return "image"
	case strings.HasPrefix(lower, "video/"):
		return "video"
	case strings.HasPrefix(lower, "audio/"):
		return "audio"
	case lower == "application/pdf" ||
		strings.HasPrefix(lower, "text/") ||
		strings.Contains(lower, "document") ||
		strings.Contains(lower, "word") ||
		strings.Contains(lower, "sheet") ||
		strings.Contains(lower, "presentation"):
		return "document"
	default:
		return "other"
	}
}

func GetAdminMediaTrafficAnalytics(days int, userKeyword string, now time.Time) (*MediaTrafficAnalyticsReport, error) {
	if DB == nil {
		return nil, errors.New("database is not initialized")
	}
	if days <= 0 {
		days = 30
	}
	if days > 90 {
		days = 90
	}
	cfg := operation_setting.GetMediaRelaySettingSnapshot()
	todayDate, resetAt := operation_setting.MediaTrafficDayWindow(now)
	nowUnix := now.Unix()
	globalBonusBytes, globalExpiresAt, globalNote := cfg.ActiveGlobalTempBonusBytes(now)

	loc := loadProfitLocation()
	todayParsed, parseErr := time.ParseInLocation("2006-01-02", todayDate, loc)
	if parseErr != nil {
		todayParsed = now.In(loc)
	}
	startDay := todayParsed.AddDate(0, 0, -(days - 1))
	startDate := startDay.Format("2006-01-02")
	yesterdayDate := todayParsed.AddDate(0, 0, -1).Format("2006-01-02")

	dailyOrder := make([]string, 0, days)
	dailyMap := make(map[string]*MediaDailyTrendPoint, days)
	for offset := 0; offset < days; offset++ {
		dateKey := startDay.AddDate(0, 0, offset).Format("2006-01-02")
		dailyOrder = append(dailyOrder, dateKey)
		dailyMap[dateKey] = &MediaDailyTrendPoint{Date: dateKey}
	}

	queryStartDate := startDate
	if yesterdayDate < queryStartDate {
		queryStartDate = yesterdayDate
	}
	var trafficRows []MediaDailyTraffic
	if err := DB.Where("traffic_date >= ? AND traffic_date <= ?", queryStartDate, todayDate).
		Find(&trafficRows).Error; err != nil {
		return nil, err
	}

	type userTrafficAgg struct {
		todayUsed    int64
		todayUploads int
		rangeUsed    int64
		rangeUploads int
	}
	userAggMap := make(map[int]*userTrafficAgg)
	dayActiveUsers := make(map[string]map[int]struct{}, days)
	rangeActiveUserSet := make(map[int]struct{})

	summary := MediaTrafficAnalyticsSummary{
		Days:      days,
		StartDate: startDate,
		EndDate:   todayDate,
	}

	for _, row := range trafficRows {
		if row.TrafficDate == yesterdayDate {
			summary.YesterdayUsedBytes += row.UsedBytes
		}
		if row.TrafficDate < startDate || row.TrafficDate > todayDate {
			continue
		}
		if row.UsedBytes > 0 || row.UploadCount > 0 {
			if row.TrafficDate == todayDate {
				summary.TodayUsedBytes += row.UsedBytes
				summary.TodayUploadCount += int64(row.UploadCount)
			}
			summary.RangeUsedBytes += row.UsedBytes
			summary.RangeUploadCount += int64(row.UploadCount)

			if point, ok := dailyMap[row.TrafficDate]; ok {
				point.UsedBytes += row.UsedBytes
				point.UploadCount += int64(row.UploadCount)
				if dayActiveUsers[row.TrafficDate] == nil {
					dayActiveUsers[row.TrafficDate] = make(map[int]struct{})
				}
				dayActiveUsers[row.TrafficDate][row.UserId] = struct{}{}
			}
			rangeActiveUserSet[row.UserId] = struct{}{}

			agg := userAggMap[row.UserId]
			if agg == nil {
				agg = &userTrafficAgg{}
				userAggMap[row.UserId] = agg
			}
			agg.rangeUsed += row.UsedBytes
			agg.rangeUploads += row.UploadCount
			if row.TrafficDate == todayDate {
				agg.todayUsed += row.UsedBytes
				agg.todayUploads += row.UploadCount
			}
		}
	}

	summary.RangeActiveUsers = len(rangeActiveUserSet)
	if todayUsers := dayActiveUsers[todayDate]; todayUsers != nil {
		summary.TodayActiveUsers = len(todayUsers)
	}

	dailyTrend := make([]MediaDailyTrendPoint, 0, len(dailyOrder))
	for _, dateKey := range dailyOrder {
		point := dailyMap[dateKey]
		if users := dayActiveUsers[dateKey]; users != nil {
			point.ActiveUsers = len(users)
		}
		if point.UsedBytes > summary.PeakDailyBytes {
			summary.PeakDailyBytes = point.UsedBytes
			summary.PeakDate = dateKey
		}
		dailyTrend = append(dailyTrend, *point)
	}
	summary.AvgDailyBytes = summary.RangeUsedBytes / int64(max(1, days))

	// Active (ready & non-expired) stored object footprint snapshot.
	var activeFootprint struct {
		Count int64
		Bytes int64
	}
	if err := DB.Model(&MediaRelayObject{}).
		Select("COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes").
		Where("status = ? AND (expires_at = 0 OR expires_at > ?)", MediaRelayObjectStatusReady, nowUnix).
		Scan(&activeFootprint).Error; err != nil {
		return nil, err
	}
	summary.ActiveObjectsCount = activeFootprint.Count
	summary.ActiveObjectsBytes = activeFootprint.Bytes

	// Range object stats by status and content type.
	type objectRangeRow struct {
		Status      string
		ContentType string
		SizeBytes   int64
	}
	var objectRows []objectRangeRow
	if err := DB.Model(&MediaRelayObject{}).
		Select("status, content_type, size_bytes").
		Where("traffic_date >= ? AND traffic_date <= ?", startDate, todayDate).
		Scan(&objectRows).Error; err != nil {
		return nil, err
	}

	categoryMap := make(map[string]*MediaContentTypeStat)
	var totalClassifiedBytes int64
	for _, row := range objectRows {
		switch row.Status {
		case MediaRelayObjectStatusReady:
			summary.ReadyObjectsCount++
		case MediaRelayObjectStatusPending:
			summary.PendingObjectsCount++
		case MediaRelayObjectStatusAborted:
			summary.AbortedObjectsCount++
		}
		if row.Status == MediaRelayObjectStatusAborted {
			continue
		}
		category := classifyMediaContentType(row.ContentType)
		stat := categoryMap[category]
		if stat == nil {
			stat = &MediaContentTypeStat{Category: category}
			categoryMap[category] = stat
		}
		stat.Count++
		stat.TotalBytes += row.SizeBytes
		totalClassifiedBytes += row.SizeBytes
	}

	contentTypes := make([]MediaContentTypeStat, 0, len(categoryMap))
	for _, stat := range categoryMap {
		if totalClassifiedBytes > 0 {
			stat.SharePercent = math.Round((float64(stat.TotalBytes)/float64(totalClassifiedBytes))*10000) / 100
		}
		contentTypes = append(contentTypes, *stat)
	}
	slices.SortFunc(contentTypes, func(a, b MediaContentTypeStat) int {
		if res := cmp.Compare(b.TotalBytes, a.TotalBytes); res != 0 {
			return res
		}
		return cmp.Compare(a.Category, b.Category)
	})

	// Overrides & user enrichment for top users ranking.
	var overrides []MediaTrafficOverride
	if err := DB.Find(&overrides).Error; err != nil {
		return nil, err
	}
	overrideMap := make(map[int]*MediaTrafficOverride, len(overrides))
	for idx := range overrides {
		row := overrides[idx]
		overrideMap[row.UserId] = &row
		if row.ExtraDailyBytes > 0 && (row.ExpiresAt == 0 || row.ExpiresAt > nowUnix) {
			summary.ActiveOverridesCount++
		}
	}

	userIds := make([]int, 0, len(userAggMap))
	for userId := range userAggMap {
		userIds = append(userIds, userId)
	}
	userMap := make(map[int]User, len(userIds))
	if len(userIds) > 0 {
		var users []User
		if err := DB.Select("id", "username", "display_name", "group").
			Where("id IN ?", userIds).
			Find(&users).Error; err != nil {
			return nil, err
		}
		for _, user := range users {
			userMap[user.Id] = user
		}
	}

	needle := strings.ToLower(strings.TrimSpace(userKeyword))
	topUsers := make([]MediaUserTrafficRankItem, 0, len(userAggMap))
	for userId, agg := range userAggMap {
		user := userMap[userId]
		override := overrideMap[userId]
		quotaSummary := computeMediaTrafficSummary(cfg, user.Group, MediaDailyTraffic{
			UserId:      userId,
			TrafficDate: todayDate,
			UsedBytes:   agg.todayUsed,
			UploadCount: agg.todayUploads,
		}, override, now)

		usagePercent := 0.0
		if quotaSummary.EffectiveDailyBytes > 0 {
			usagePercent = math.Round((float64(agg.todayUsed)/float64(quotaSummary.EffectiveDailyBytes))*10000) / 100
			if usagePercent >= 80 {
				summary.NearLimitUsersCount++
			}
		}

		if needle != "" {
			idStr := strconv.Itoa(userId)
			if !strings.Contains(idStr, needle) &&
				!strings.Contains(strings.ToLower(user.Username), needle) &&
				!strings.Contains(strings.ToLower(user.DisplayName), needle) &&
				!strings.Contains(strings.ToLower(quotaSummary.GroupName), needle) {
				continue
			}
		}

		topUsers = append(topUsers, MediaUserTrafficRankItem{
			UserId:              userId,
			Username:            user.Username,
			DisplayName:         user.DisplayName,
			Group:               quotaSummary.GroupName,
			TodayUsedBytes:      agg.todayUsed,
			TodayUploadCount:    agg.todayUploads,
			EffectiveDailyBytes: quotaSummary.EffectiveDailyBytes,
			TodayUsagePercent:   usagePercent,
			RangeUsedBytes:      agg.rangeUsed,
			RangeUploadCount:    agg.rangeUploads,
			ActiveOverrideBytes: quotaSummary.UserBonusBytes,
			OverrideExpiresAt:   quotaSummary.UserBonusExpiresAt,
			OverrideNote:        quotaSummary.UserBonusNote,
		})
	}
	slices.SortFunc(topUsers, func(a, b MediaUserTrafficRankItem) int {
		if res := cmp.Compare(b.RangeUsedBytes, a.RangeUsedBytes); res != 0 {
			return res
		}
		if res := cmp.Compare(b.TodayUsedBytes, a.TodayUsedBytes); res != 0 {
			return res
		}
		return cmp.Compare(a.UserId, b.UserId)
	})
	if len(topUsers) > 100 {
		topUsers = topUsers[:100]
	}

	return &MediaTrafficAnalyticsReport{
		Config: MediaTrafficPublicConfig{
			Enabled:                 cfg.Enabled,
			IsReady:                 cfg.IsReady(),
			Provider:                cfg.Provider,
			Region:                  cfg.Region,
			Bucket:                  cfg.Bucket,
			RetentionDays:           cfg.RetentionDays,
			MaxFileSizeMB:           cfg.MaxFileSizeMB,
			DefaultDailyTrafficMB:   cfg.DefaultDailyTrafficMB,
			GroupDailyBonusMB:       cfg.GroupDailyBonusMB,
			ActiveGlobalTempBonusMB: int(globalBonusBytes / operation_setting.BytesPerMiB),
			TempGlobalExpiresAt:     globalExpiresAt,
			TempGlobalNote:          globalNote,
			TrafficDate:             todayDate,
			ResetAt:                 resetAt,
		},
		Summary:      summary,
		DailyTrend:   dailyTrend,
		ContentTypes: contentTypes,
		TopUsers:     topUsers,
	}, nil
}

func ListAdminMediaRelayObjects(page, pageSize int, status, category, keyword string, now time.Time) ([]MediaRelayObjectAdminView, int64, error) {
	if DB == nil {
		return nil, 0, errors.New("database is not initialized")
	}
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	tx := DB.Model(&MediaRelayObject{})
	normalizedStatus := strings.ToLower(strings.TrimSpace(status))
	switch normalizedStatus {
	case MediaRelayObjectStatusReady, MediaRelayObjectStatusPending, MediaRelayObjectStatusAborted:
		tx = tx.Where("status = ?", normalizedStatus)
	}

	normalizedCategory := strings.ToLower(strings.TrimSpace(category))
	switch normalizedCategory {
	case "image":
		tx = tx.Where("LOWER(content_type) LIKE ?", "image/%")
	case "video":
		tx = tx.Where("LOWER(content_type) LIKE ?", "video/%")
	case "audio":
		tx = tx.Where("LOWER(content_type) LIKE ?", "audio/%")
	case "document":
		tx = tx.Where("(LOWER(content_type) = ? OR LOWER(content_type) LIKE ? OR LOWER(content_type) LIKE ? OR LOWER(content_type) LIKE ? OR LOWER(content_type) LIKE ? OR LOWER(content_type) LIKE ?)",
			"application/pdf", "text/%", "%document%", "%word%", "%sheet%", "%presentation%")
	case "other":
		tx = tx.Where("LOWER(content_type) NOT LIKE ? AND LOWER(content_type) NOT LIKE ? AND LOWER(content_type) NOT LIKE ? AND LOWER(content_type) <> ? AND LOWER(content_type) NOT LIKE ? AND LOWER(content_type) NOT LIKE ? AND LOWER(content_type) NOT LIKE ? AND LOWER(content_type) NOT LIKE ? AND LOWER(content_type) NOT LIKE ?",
			"image/%", "video/%", "audio/%", "application/pdf", "text/%", "%document%", "%word%", "%sheet%", "%presentation%")
	}

	trimmedKeyword := strings.TrimSpace(keyword)
	if trimmedKeyword != "" {
		lowerPattern := "%" + strings.ToLower(trimmedKeyword) + "%"
		var matchedUserIds []int
		userSearch := DB.Model(&User{}).Select("id").Where("LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?", lowerPattern, lowerPattern)
		if parsedID, err := strconv.Atoi(trimmedKeyword); err == nil && parsedID > 0 {
			userSearch = userSearch.Or("id = ?", parsedID)
		}
		_ = userSearch.Pluck("id", &matchedUserIds).Error

		if len(matchedUserIds) > 0 {
			tx = tx.Where("(LOWER(file_name) LIKE ? OR LOWER(object_key) LIKE ? OR LOWER(content_type) LIKE ? OR user_id IN ?)",
				lowerPattern, lowerPattern, lowerPattern, matchedUserIds)
		} else if parsedID, err := strconv.Atoi(trimmedKeyword); err == nil && parsedID > 0 {
			tx = tx.Where("(LOWER(file_name) LIKE ? OR LOWER(object_key) LIKE ? OR LOWER(content_type) LIKE ? OR user_id = ?)",
				lowerPattern, lowerPattern, lowerPattern, parsedID)
		} else {
			tx = tx.Where("(LOWER(file_name) LIKE ? OR LOWER(object_key) LIKE ? OR LOWER(content_type) LIKE ?)",
				lowerPattern, lowerPattern, lowerPattern)
		}
	}

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if total == 0 {
		return []MediaRelayObjectAdminView{}, 0, nil
	}

	var objects []MediaRelayObject
	if err := tx.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&objects).Error; err != nil {
		return nil, 0, err
	}

	userIdSet := make(map[int]struct{}, len(objects))
	userIds := make([]int, 0, len(objects))
	for _, obj := range objects {
		if obj.UserId > 0 {
			if _, seen := userIdSet[obj.UserId]; !seen {
				userIdSet[obj.UserId] = struct{}{}
				userIds = append(userIds, obj.UserId)
			}
		}
	}
	userMap := make(map[int]User, len(userIds))
	if len(userIds) > 0 {
		var users []User
		if err := DB.Select("id", "username", "display_name", "group").
			Where("id IN ?", userIds).
			Find(&users).Error; err == nil {
			for _, user := range users {
				userMap[user.Id] = user
			}
		}
	}

	nowUnix := now.Unix()
	views := make([]MediaRelayObjectAdminView, 0, len(objects))
	for _, obj := range objects {
		user := userMap[obj.UserId]
		groupName := strings.TrimSpace(user.Group)
		if groupName == "" {
			groupName = "default"
		}
		views = append(views, MediaRelayObjectAdminView{
			Id:          obj.Id,
			UserId:      obj.UserId,
			Username:    user.Username,
			DisplayName: user.DisplayName,
			Group:       groupName,
			ObjectKey:   obj.ObjectKey,
			FileName:    obj.FileName,
			ContentType: obj.ContentType,
			Category:    classifyMediaContentType(obj.ContentType),
			SizeBytes:   obj.SizeBytes,
			Status:      obj.Status,
			TrafficDate: obj.TrafficDate,
			CreatedAt:   obj.CreatedAt,
			ExpiresAt:   obj.ExpiresAt,
			Expired:     obj.ExpiresAt > 0 && obj.ExpiresAt <= nowUnix,
		})
	}
	return views, total, nil
}
