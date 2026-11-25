package model

import (
	"errors"
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
