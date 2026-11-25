package model

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"net/url"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	ViolationAuditOptionKey = "ViolationAuditSettings"

	ViolationCaseStatusPendingAudit   = "pending_audit"
	ViolationCaseStatusPendingVerdict = "pending_verdict"
	ViolationCaseStatusBanned         = "banned"
	ViolationCaseStatusDismissed      = "dismissed"
	ViolationCaseStatusAllowlisted    = "allowlisted"

	ViolationAuditStatusPending   = "pending"
	ViolationAuditStatusRunning   = "running"
	ViolationAuditStatusSucceeded = "succeeded"
	ViolationAuditStatusFailed    = "failed"

	ViolationRiskHigh    = "high"
	ViolationRiskMedium  = "medium"
	ViolationRiskLow     = "low"
	ViolationRiskNone    = "none"
	ViolationRiskUnknown = "unknown"

	ViolationVerdictBan       = "ban"
	ViolationVerdictDismiss   = "dismiss"
	ViolationVerdictAllowlist = "allowlist"

	violationAuditSecretPrefix = "enc:v1:"
)

var DefaultViolationTrackedPlugins = []string{
	"request-filter",
	"content-moderation",
	"llm-security-guard",
}

// ViolationEvent stores a single policy/security rejection event captured from
// the request plugin pipeline. Only rejected requests are stored; normal user
// prompts are never persisted.
type ViolationEvent struct {
	Id            int64  `json:"id" gorm:"primaryKey"`
	UserId        int    `json:"user_id" gorm:"index:idx_violation_event_user_time,priority:1;index"`
	Username      string `json:"username" gorm:"type:varchar(64);index"`
	TokenId       int    `json:"token_id"`
	RequestId     string `json:"request_id" gorm:"type:varchar(64);index"`
	Model         string `json:"model" gorm:"type:varchar(255)"`
	Route         string `json:"route" gorm:"type:varchar(255)"`
	Ip            string `json:"ip" gorm:"type:varchar(64)"`
	Plugin        string `json:"plugin" gorm:"type:varchar(128);index"`
	Instance      string `json:"instance" gorm:"type:varchar(128)"`
	InstanceName  string `json:"instance_name" gorm:"type:varchar(256)"`
	Stage         string `json:"stage" gorm:"type:varchar(32)"`
	Code          string `json:"code" gorm:"type:varchar(128)"`
	RuleId        string `json:"rule_id" gorm:"type:varchar(256)"`
	Category      string `json:"category" gorm:"type:varchar(64);index"`
	Message       string `json:"message" gorm:"type:varchar(512)"`
	PromptExcerpt string `json:"prompt_excerpt" gorm:"type:text"`
	PromptHash    string `json:"prompt_hash" gorm:"type:varchar(64);index"`
	CreatedAt     int64  `json:"created_at" gorm:"bigint;index:idx_violation_event_user_time,priority:2;index"`
}

// ViolationEvidenceQuote links an AI-extracted quote back to a verified
// substring of a captured ViolationEvent.
type ViolationEvidenceQuote struct {
	EventId int64  `json:"event_id"`
	Quote   string `json:"quote"`
	Note    string `json:"note,omitempty"`
}

// ViolationAccountCase represents one account-level risk screening, AI audit
// assessment, and human verdict lifecycle.
type ViolationAccountCase struct {
	Id                int64  `json:"id" gorm:"primaryKey"`
	UserId            int    `json:"user_id" gorm:"index:idx_violation_case_user_status,priority:1;index"`
	Username          string `json:"username" gorm:"type:varchar(64);index"`
	Status            string `json:"status" gorm:"type:varchar(32);index:idx_violation_case_user_status,priority:2;index"`
	HitCount          int    `json:"hit_count"`
	WindowHours       int    `json:"window_hours"`
	FirstViolationAt  int64  `json:"first_violation_at" gorm:"bigint"`
	LastViolationAt   int64  `json:"last_violation_at" gorm:"bigint;index"`
	AuditStatus       string `json:"audit_status" gorm:"type:varchar(32);index"`
	NeedsReaudit      bool   `json:"needs_reaudit"`
	AuditModel        string `json:"audit_model" gorm:"type:varchar(128)"`
	RiskLevel         string `json:"risk_level" gorm:"type:varchar(32);index"`
	RiskScore         int    `json:"risk_score"`
	RecommendedAction string `json:"recommended_action" gorm:"type:varchar(32)"`
	Category          string `json:"category" gorm:"type:varchar(64)"`
	Summary           string `json:"summary" gorm:"type:text"`
	EvidenceQuotes    string `json:"-" gorm:"type:text"`
	AuditError        string `json:"audit_error" gorm:"type:varchar(512)"`
	AuditedAt         int64  `json:"audited_at" gorm:"bigint"`
	AuditedEventMaxId int64  `json:"audited_event_max_id" gorm:"bigint"`
	Verdict           string `json:"verdict" gorm:"type:varchar(32)"`
	VerdictNote       string `json:"verdict_note" gorm:"type:text"`
	DecidedBy         int    `json:"decided_by"`
	DecidedByUsername string `json:"decided_by_username" gorm:"type:varchar(64)"`
	DecidedAt         int64  `json:"decided_at" gorm:"bigint"`
	CreatedAt         int64  `json:"created_at" gorm:"bigint;index"`
	UpdatedAt         int64  `json:"updated_at" gorm:"bigint;index"`
}

// ViolationAllowlist exempts trusted accounts from automated violation
// screening (for example, authorized security researchers or internal testers).
type ViolationAllowlist struct {
	Id                int64  `json:"id" gorm:"primaryKey"`
	UserId            int    `json:"user_id" gorm:"uniqueIndex"`
	Username          string `json:"username" gorm:"type:varchar(64);index"`
	Reason            string `json:"reason" gorm:"type:varchar(512)"`
	CreatedBy         int    `json:"created_by"`
	CreatedByUsername string `json:"created_by_username" gorm:"type:varchar(64)"`
	CreatedAt         int64  `json:"created_at" gorm:"bigint"`
}

// ViolationAuditSettings holds capture, screening, and scheduled LLM reviewer
// settings persisted in the options table. APIKey is encrypted at rest and
// redacted in API responses.
type ViolationAuditSettings struct {
	Enabled           bool     `json:"enabled"`
	AutoAuditEnabled  bool     `json:"auto_audit_enabled"`
	IntervalMinutes   int      `json:"interval_minutes"`
	ThresholdCount    int      `json:"threshold_count"`
	WindowHours       int      `json:"window_hours"`
	RetentionDays     int      `json:"retention_days"`
	MaxExcerptChars   int      `json:"max_excerpt_chars"`
	MaxEventsPerAudit int      `json:"max_events_per_audit"`
	Protocol          string   `json:"protocol"`
	Endpoint          string   `json:"endpoint"`
	Model             string   `json:"model"`
	APIKey            string   `json:"api_key,omitempty"`
	HasAPIKey         bool     `json:"has_api_key"`
	ClearAPIKey       bool     `json:"clear_api_key,omitempty"`
	TimeoutSeconds    int      `json:"timeout_seconds"`
	ExtraPolicy       string   `json:"extra_policy"`
	TrackedPlugins    []string `json:"tracked_plugins"`
}

type ViolationCaseView struct {
	ViolationAccountCase
	EvidenceQuotesList []ViolationEvidenceQuote `json:"evidence_quotes"`
	UserStatus         int                      `json:"user_status"`
	UserRole           int                      `json:"user_role"`
	Allowlisted        bool                     `json:"allowlisted"`
}

type ViolationCaseFilter struct {
	Status    string
	RiskLevel string
	Keyword   string
	UserId    int
	Page      int
	PageSize  int
}

type ViolationEventFilter struct {
	UserId   int
	Username string
	Plugin   string
	Category string
	Keyword  string
	Page     int
	PageSize int
}

type ViolationAuditOverview struct {
	PendingAudit     int64  `json:"pending_audit"`
	PendingVerdict   int64  `json:"pending_verdict"`
	HighRiskPending  int64  `json:"high_risk_pending"`
	Events24h        int64  `json:"events_24h"`
	BannedCount      int64  `json:"banned_count"`
	DismissedCount   int64  `json:"dismissed_count"`
	AllowlistCount   int64  `json:"allowlist_count"`
	Enabled          bool   `json:"enabled"`
	AutoAuditEnabled bool   `json:"auto_audit_enabled"`
	ThresholdCount   int    `json:"threshold_count"`
	WindowHours      int    `json:"window_hours"`
	IntervalMinutes  int    `json:"interval_minutes"`
	Model            string `json:"model"`
	HasAPIKey        bool   `json:"has_api_key"`
}

func DefaultViolationAuditSettings() ViolationAuditSettings {
	return ViolationAuditSettings{
		Enabled:           true,
		AutoAuditEnabled:  false,
		IntervalMinutes:   30,
		ThresholdCount:    3,
		WindowHours:       24,
		RetentionDays:     30,
		MaxExcerptChars:   4000,
		MaxEventsPerAudit: 20,
		Protocol:          "auto",
		Endpoint:          "https://api.deepseek.com/v1/chat/completions",
		Model:             "deepseek-flash",
		TimeoutSeconds:    60,
		TrackedPlugins:    slices.Clone(DefaultViolationTrackedPlugins),
	}
}

func (s ViolationAuditSettings) Redacted() ViolationAuditSettings {
	out := s
	out.HasAPIKey = strings.TrimSpace(s.APIKey) != ""
	out.APIKey = ""
	out.ClearAPIKey = false
	if out.TrackedPlugins == nil {
		out.TrackedPlugins = []string{}
	}
	return out
}

func (s *ViolationAuditSettings) Normalize() {
	s.Endpoint = strings.TrimSpace(s.Endpoint)
	s.Model = strings.TrimSpace(s.Model)
	s.APIKey = strings.TrimSpace(s.APIKey)
	s.ExtraPolicy = strings.TrimSpace(s.ExtraPolicy)
	s.Protocol = strings.TrimSpace(strings.ToLower(s.Protocol))
	if s.Protocol == "" {
		s.Protocol = "auto"
	}
	if s.IntervalMinutes == 0 {
		s.IntervalMinutes = 30
	}
	if s.ThresholdCount == 0 {
		s.ThresholdCount = 3
	}
	if s.WindowHours == 0 {
		s.WindowHours = 24
	}
	if s.RetentionDays == 0 {
		s.RetentionDays = 30
	}
	if s.MaxExcerptChars == 0 {
		s.MaxExcerptChars = 4000
	}
	if s.MaxEventsPerAudit == 0 {
		s.MaxEventsPerAudit = 20
	}
	if s.TimeoutSeconds == 0 {
		s.TimeoutSeconds = 60
	}
	cleanedPlugins := make([]string, 0, len(s.TrackedPlugins))
	for _, plugin := range s.TrackedPlugins {
		trimmed := strings.TrimSpace(plugin)
		if trimmed != "" && !slices.Contains(cleanedPlugins, trimmed) {
			cleanedPlugins = append(cleanedPlugins, trimmed)
		}
	}
	s.TrackedPlugins = cleanedPlugins
}

func (s ViolationAuditSettings) Validate() error {
	for _, value := range []string{s.Endpoint, s.Model, s.APIKey, s.ExtraPolicy, s.Protocol} {
		if !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') {
			return common.NewMessage("Invalid violation audit settings")
		}
	}
	if !slices.Contains([]string{"auto", "openai_chat", "openai_responses", "anthropic", "gemini"}, s.Protocol) {
		return common.NewMessage("Invalid violation audit protocol")
	}
	if s.IntervalMinutes < 1 || s.IntervalMinutes > 10080 {
		return common.NewMessage("Audit interval must be between 1 and 10080 minutes")
	}
	if s.ThresholdCount < 1 || s.ThresholdCount > 100 {
		return common.NewMessage("Violation threshold must be between 1 and 100")
	}
	if s.WindowHours < 1 || s.WindowHours > 720 {
		return common.NewMessage("Screening window must be between 1 and 720 hours")
	}
	if s.RetentionDays < 1 || s.RetentionDays > 365 {
		return common.NewMessage("Retention days must be between 1 and 365")
	}
	if s.MaxExcerptChars < 500 || s.MaxExcerptChars > 16000 {
		return common.NewMessage("Maximum excerpt length must be between 500 and 16000 characters")
	}
	if s.MaxEventsPerAudit < 1 || s.MaxEventsPerAudit > 50 {
		return common.NewMessage("Maximum events per audit must be between 1 and 50")
	}
	if s.TimeoutSeconds < 5 || s.TimeoutSeconds > 180 {
		return common.NewMessage("Audit request timeout must be between 5 and 180 seconds")
	}
	if len(s.Model) > 128 || len(s.ExtraPolicy) > 4000 || len(s.APIKey) > 4096 || strings.ContainsAny(s.APIKey, "\r\n") {
		return common.NewMessage("Invalid violation audit settings")
	}
	if s.Endpoint != "" {
		parsed, err := url.Parse(s.Endpoint)
		host := strings.ToLower(parsed.Hostname())
		isLoopback := host == "localhost" || host == "127.0.0.1" || host == "::1"
		if err != nil || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" || len(s.Endpoint) > 2048 ||
			(parsed.Scheme != "https" && !(parsed.Scheme == "http" && isLoopback)) {
			return common.NewMessage("Audit endpoint must use HTTPS (HTTP is allowed only for localhost or loopback)")
		}
	}
	if s.AutoAuditEnabled {
		if s.Endpoint == "" {
			return common.NewMessage("Audit model endpoint is required when automatic audit is enabled")
		}
		if s.Protocol != "gemini" && s.Model == "" {
			return common.NewMessage("Audit model name is required when automatic audit is enabled")
		}
	}
	return nil
}

func (s ViolationAuditSettings) TracksPlugin(plugin string) bool {
	if len(s.TrackedPlugins) == 0 {
		return true
	}
	return slices.Contains(s.TrackedPlugins, plugin)
}

func violationAuditCipher() (cipher.AEAD, error) {
	key := sha256.Sum256([]byte("violation-audit-secret-v1:" + common.CryptoSecret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func encryptViolationAuditSecret(plain string) (string, error) {
	if plain == "" {
		return "", nil
	}
	aead, err := violationAuditCipher()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := aead.Seal(nonce, nonce, []byte(plain), nil)
	return violationAuditSecretPrefix + base64.StdEncoding.EncodeToString(sealed), nil
}

func decryptViolationAuditSecret(encoded string) (string, error) {
	if encoded == "" {
		return "", nil
	}
	if !strings.HasPrefix(encoded, violationAuditSecretPrefix) {
		return encoded, nil
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(encoded, violationAuditSecretPrefix))
	if err != nil {
		return "", err
	}
	aead, err := violationAuditCipher()
	if err != nil {
		return "", err
	}
	nonceSize := aead.NonceSize()
	if len(raw) < nonceSize {
		return "", errors.New("invalid encrypted secret")
	}
	plain, err := aead.Open(nil, raw[:nonceSize], raw[nonceSize:], nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func LoadViolationAuditSettings(db *gorm.DB) (ViolationAuditSettings, error) {
	if db == nil {
		db = DB
	}
	settings := DefaultViolationAuditSettings()
	if db == nil {
		return settings, nil
	}
	var option Option
	err := db.Where(&Option{Key: ViolationAuditOptionKey}).First(&option).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return settings, nil
	}
	if err != nil {
		return settings, err
	}
	if err := common.UnmarshalJsonStr(option.Value, &settings); err != nil {
		return DefaultViolationAuditSettings(), err
	}
	if settings.APIKey != "" {
		decrypted, decErr := decryptViolationAuditSecret(settings.APIKey)
		if decErr != nil {
			settings.APIKey = ""
		} else {
			settings.APIKey = decrypted
		}
	}
	settings.Normalize()
	settings.HasAPIKey = settings.APIKey != ""
	settings.ClearAPIKey = false
	return settings, nil
}

func SaveViolationAuditSettings(db *gorm.DB, incoming ViolationAuditSettings) (ViolationAuditSettings, error) {
	if db == nil {
		db = DB
	}
	existing, err := LoadViolationAuditSettings(db)
	if err != nil {
		return existing, err
	}
	next := incoming
	next.Normalize()
	if next.ClearAPIKey {
		next.APIKey = ""
	} else if next.APIKey == "" {
		next.APIKey = existing.APIKey
	}
	next.ClearAPIKey = false
	if err := next.Validate(); err != nil {
		return existing, err
	}
	stored := next
	stored.HasAPIKey = false
	if stored.APIKey != "" {
		encrypted, encErr := encryptViolationAuditSecret(stored.APIKey)
		if encErr != nil {
			return existing, encErr
		}
		stored.APIKey = encrypted
	}
	encoded, err := common.Marshal(stored)
	if err != nil {
		return existing, err
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		var option Option
		findErr := lockForUpdate(tx).Where(&Option{Key: ViolationAuditOptionKey}).First(&option).Error
		if errors.Is(findErr, gorm.ErrRecordNotFound) {
			return tx.Create(&Option{
				Key:   ViolationAuditOptionKey,
				Value: string(encoded),
			}).Error
		}
		if findErr != nil {
			return findErr
		}
		return tx.Model(&Option{}).Where(&Option{Key: ViolationAuditOptionKey}).Update("value", string(encoded)).Error
	})
	if err != nil {
		return existing, err
	}
	next.HasAPIKey = next.APIKey != ""
	return next, nil
}

func ParseViolationQuotes(raw string) []ViolationEvidenceQuote {
	if strings.TrimSpace(raw) == "" {
		return []ViolationEvidenceQuote{}
	}
	var quotes []ViolationEvidenceQuote
	if err := common.UnmarshalJsonStr(raw, &quotes); err != nil || quotes == nil {
		return []ViolationEvidenceQuote{}
	}
	return quotes
}

func IsUserViolationAllowlisted(db *gorm.DB, userId int) (bool, error) {
	if db == nil {
		db = DB
	}
	if userId <= 0 {
		return false, nil
	}
	var count int64
	err := db.Model(&ViolationAllowlist{}).Where("user_id = ?", userId).Count(&count).Error
	return count > 0, err
}

func RecordViolationEventAndScreen(ctx context.Context, db *gorm.DB, event *ViolationEvent, settings ViolationAuditSettings) (*ViolationAccountCase, error) {
	if db == nil {
		db = DB
	}
	now := common.GetTimestamp()
	if event.CreatedAt == 0 {
		event.CreatedAt = now
	}
	if err := db.WithContext(ctx).Create(event).Error; err != nil {
		return nil, err
	}
	if event.UserId <= 0 {
		return nil, nil
	}
	return EvaluateUserViolationCase(ctx, db, event.UserId, event.Username, settings)
}

// EvaluateUserViolationCase checks whether a user meets the configured
// multi-hit violation threshold within the rolling window (strictly after any
// prior dismissal timestamp) and creates or updates their active account case.
func EvaluateUserViolationCase(ctx context.Context, db *gorm.DB, userId int, username string, settings ViolationAuditSettings) (*ViolationAccountCase, error) {
	if db == nil {
		db = DB
	}
	if userId <= 0 {
		return nil, nil
	}
	allowlisted, err := IsUserViolationAllowlisted(db.WithContext(ctx), userId)
	if err != nil || allowlisted {
		return nil, err
	}
	now := common.GetTimestamp()
	windowStart := now - int64(settings.WindowHours)*3600

	var resultCase *ViolationAccountCase
	err = db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var openCase ViolationAccountCase
		openErr := lockForUpdate(tx).
			Where("user_id = ? AND status IN ?", userId, []string{ViolationCaseStatusPendingAudit, ViolationCaseStatusPendingVerdict}).
			Order("id DESC").
			First(&openCase).Error
		hasOpen := openErr == nil
		if openErr != nil && !errors.Is(openErr, gorm.ErrRecordNotFound) {
			return openErr
		}

		var lastDismissed ViolationAccountCase
		dismissErr := tx.
			Where("user_id = ? AND status = ?", userId, ViolationCaseStatusDismissed).
			Order("decided_at DESC, id DESC").
			First(&lastDismissed).Error
		if dismissErr != nil && !errors.Is(dismissErr, gorm.ErrRecordNotFound) {
			return dismissErr
		}

		cutoff := windowStart
		if dismissErr == nil && lastDismissed.DecidedAt > cutoff {
			cutoff = lastDismissed.DecidedAt
		}
		if hasOpen && openCase.FirstViolationAt > 0 && openCase.FirstViolationAt < cutoff {
			cutoff = openCase.FirstViolationAt
		}

		var stats struct {
			Count   int64
			FirstAt int64
			LastAt  int64
			MaxId   int64
		}
		if err := tx.Model(&ViolationEvent{}).
			Select("COUNT(*) as count, COALESCE(MIN(created_at), 0) as first_at, COALESCE(MAX(created_at), 0) as last_at, COALESCE(MAX(id), 0) as max_id").
			Where("user_id = ? AND created_at >= ?", userId, cutoff).
			Scan(&stats).Error; err != nil {
			return err
		}

		if hasOpen {
			updates := map[string]any{
				"hit_count":         int(stats.Count),
				"window_hours":      settings.WindowHours,
				"last_violation_at": max(openCase.LastViolationAt, stats.LastAt),
				"updated_at":        now,
			}
			if username != "" {
				updates["username"] = username
			}
			if openCase.FirstViolationAt == 0 && stats.FirstAt > 0 {
				updates["first_violation_at"] = stats.FirstAt
			}
			if openCase.AuditedAt > 0 && stats.MaxId > openCase.AuditedEventMaxId {
				updates["needs_reaudit"] = true
			}
			if err := tx.Model(&openCase).Updates(updates).Error; err != nil {
				return err
			}
			if err := tx.First(&openCase, openCase.Id).Error; err != nil {
				return err
			}
			resultCase = &openCase
			return nil
		}

		if int(stats.Count) < settings.ThresholdCount {
			return nil
		}

		resolvedUsername := username
		if resolvedUsername == "" {
			var user User
			if err := tx.Select("username").First(&user, userId).Error; err == nil {
				resolvedUsername = user.Username
			}
		}

		newCase := ViolationAccountCase{
			UserId:            userId,
			Username:          resolvedUsername,
			Status:            ViolationCaseStatusPendingAudit,
			HitCount:          int(stats.Count),
			WindowHours:       settings.WindowHours,
			FirstViolationAt:  stats.FirstAt,
			LastViolationAt:   stats.LastAt,
			AuditStatus:       ViolationAuditStatusPending,
			NeedsReaudit:      false,
			RiskLevel:         ViolationRiskUnknown,
			RecommendedAction: "review",
			CreatedAt:         now,
			UpdatedAt:         now,
		}
		if err := tx.Create(&newCase).Error; err != nil {
			return err
		}
		resultCase = &newCase
		return nil
	})
	return resultCase, err
}

// ScreenEligibleViolationUsers finds users whose recent violation hits meet the
// threshold and ensures each non-allowlisted user has an open case.
func ScreenEligibleViolationUsers(ctx context.Context, db *gorm.DB, settings ViolationAuditSettings) (int, error) {
	if db == nil {
		db = DB
	}
	cutoff := common.GetTimestamp() - int64(settings.WindowHours)*3600
	var candidates []struct {
		UserId int
		Count  int64
	}
	if err := db.WithContext(ctx).Model(&ViolationEvent{}).
		Select("user_id, COUNT(*) as count").
		Where("user_id > 0 AND created_at >= ?", cutoff).
		Group("user_id").
		Having("COUNT(*) >= ?", settings.ThresholdCount).
		Scan(&candidates).Error; err != nil {
		return 0, err
	}
	screened := 0
	for _, candidate := range candidates {
		accountCase, err := EvaluateUserViolationCase(ctx, db, candidate.UserId, "", settings)
		if err != nil {
			return screened, err
		}
		if accountCase != nil {
			screened++
		}
	}
	return screened, nil
}

func ListCasesForViolationAudit(ctx context.Context, db *gorm.DB, limit int) ([]ViolationAccountCase, error) {
	if db == nil {
		db = DB
	}
	if limit <= 0 {
		limit = 20
	}
	var cases []ViolationAccountCase
	err := db.WithContext(ctx).
		Where("status IN ? AND (audit_status IN ? OR needs_reaudit = ?)",
			[]string{ViolationCaseStatusPendingAudit, ViolationCaseStatusPendingVerdict},
			[]string{ViolationAuditStatusPending, ViolationAuditStatusFailed},
			true,
		).
		Order("last_violation_at DESC, id DESC").
		Limit(limit).
		Find(&cases).Error
	return cases, err
}

func GetViolationEventsForCase(ctx context.Context, db *gorm.DB, accountCase ViolationAccountCase, limit int) ([]ViolationEvent, error) {
	if db == nil {
		db = DB
	}
	if limit <= 0 {
		limit = 20
	}
	query := db.WithContext(ctx).Model(&ViolationEvent{}).Where("user_id = ?", accountCase.UserId)
	if accountCase.FirstViolationAt > 0 {
		query = query.Where("created_at >= ?", accountCase.FirstViolationAt)
	}
	if accountCase.DecidedAt > 0 {
		query = query.Where("created_at <= ?", accountCase.DecidedAt)
	}
	var events []ViolationEvent
	err := query.Order("created_at DESC, id DESC").Limit(limit).Find(&events).Error
	return events, err
}

func PruneExpiredViolationEvents(ctx context.Context, db *gorm.DB, retentionDays int) (int64, error) {
	if db == nil {
		db = DB
	}
	if retentionDays < 1 {
		retentionDays = 30
	}
	cutoff := common.GetTimestamp() - int64(retentionDays)*24*3600
	result := db.WithContext(ctx).Where("created_at < ?", cutoff).Delete(&ViolationEvent{})
	return result.RowsAffected, result.Error
}

func GetViolationAuditOverview(ctx context.Context, db *gorm.DB) (ViolationAuditOverview, error) {
	if db == nil {
		db = DB
	}
	settings, err := LoadViolationAuditSettings(db.WithContext(ctx))
	if err != nil {
		return ViolationAuditOverview{}, err
	}
	overview := ViolationAuditOverview{
		Enabled:          settings.Enabled,
		AutoAuditEnabled: settings.AutoAuditEnabled,
		ThresholdCount:   settings.ThresholdCount,
		WindowHours:      settings.WindowHours,
		IntervalMinutes:  settings.IntervalMinutes,
		Model:            settings.Model,
		HasAPIKey:        settings.HasAPIKey,
	}
	now := common.GetTimestamp()
	if err := db.WithContext(ctx).Model(&ViolationAccountCase{}).Where("status = ?", ViolationCaseStatusPendingAudit).Count(&overview.PendingAudit).Error; err != nil {
		return overview, err
	}
	if err := db.WithContext(ctx).Model(&ViolationAccountCase{}).Where("status = ?", ViolationCaseStatusPendingVerdict).Count(&overview.PendingVerdict).Error; err != nil {
		return overview, err
	}
	if err := db.WithContext(ctx).Model(&ViolationAccountCase{}).Where("status IN ? AND risk_level = ?", []string{ViolationCaseStatusPendingAudit, ViolationCaseStatusPendingVerdict}, ViolationRiskHigh).Count(&overview.HighRiskPending).Error; err != nil {
		return overview, err
	}
	if err := db.WithContext(ctx).Model(&ViolationEvent{}).Where("created_at >= ?", now-24*3600).Count(&overview.Events24h).Error; err != nil {
		return overview, err
	}
	if err := db.WithContext(ctx).Model(&ViolationAccountCase{}).Where("status = ?", ViolationCaseStatusBanned).Count(&overview.BannedCount).Error; err != nil {
		return overview, err
	}
	if err := db.WithContext(ctx).Model(&ViolationAccountCase{}).Where("status = ?", ViolationCaseStatusDismissed).Count(&overview.DismissedCount).Error; err != nil {
		return overview, err
	}
	if err := db.WithContext(ctx).Model(&ViolationAllowlist{}).Count(&overview.AllowlistCount).Error; err != nil {
		return overview, err
	}
	return overview, nil
}

func ListViolationCases(ctx context.Context, db *gorm.DB, filter ViolationCaseFilter) ([]ViolationCaseView, int64, error) {
	if db == nil {
		db = DB
	}
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize < 1 || filter.PageSize > 100 {
		filter.PageSize = 20
	}
	query := db.WithContext(ctx).Model(&ViolationAccountCase{})
	switch filter.Status {
	case "", "open":
		query = query.Where("status IN ?", []string{ViolationCaseStatusPendingAudit, ViolationCaseStatusPendingVerdict})
	case "all":
	default:
		query = query.Where("status = ?", filter.Status)
	}
	if filter.RiskLevel != "" && filter.RiskLevel != "all" {
		query = query.Where("risk_level = ?", filter.RiskLevel)
	}
	if filter.UserId > 0 {
		query = query.Where("user_id = ?", filter.UserId)
	}
	if keyword := strings.TrimSpace(filter.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("username LIKE ? OR summary LIKE ? OR category LIKE ?", like, like, like)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []ViolationAccountCase
	offset := (filter.Page - 1) * filter.PageSize
	if err := query.Order("last_violation_at DESC, id DESC").Offset(offset).Limit(filter.PageSize).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	views, err := enrichViolationCaseViews(ctx, db, rows)
	return views, total, err
}

func GetViolationCaseById(ctx context.Context, db *gorm.DB, caseId int64) (*ViolationCaseView, error) {
	if db == nil {
		db = DB
	}
	var row ViolationAccountCase
	if err := db.WithContext(ctx).First(&row, caseId).Error; err != nil {
		return nil, err
	}
	views, err := enrichViolationCaseViews(ctx, db, []ViolationAccountCase{row})
	if err != nil {
		return nil, err
	}
	return &views[0], nil
}

func enrichViolationCaseViews(ctx context.Context, db *gorm.DB, rows []ViolationAccountCase) ([]ViolationCaseView, error) {
	if len(rows) == 0 {
		return []ViolationCaseView{}, nil
	}
	userIds := make([]int, 0, len(rows))
	for _, row := range rows {
		if row.UserId > 0 && !slices.Contains(userIds, row.UserId) {
			userIds = append(userIds, row.UserId)
		}
	}
	userMap := make(map[int]User, len(userIds))
	allowlistMap := make(map[int]bool, len(userIds))
	if len(userIds) > 0 {
		var users []User
		if err := db.WithContext(ctx).Unscoped().Select("id, username, status, role").Where("id IN ?", userIds).Find(&users).Error; err != nil {
			return nil, err
		}
		for _, user := range users {
			userMap[user.Id] = user
		}
		var allowed []ViolationAllowlist
		if err := db.WithContext(ctx).Select("user_id").Where("user_id IN ?", userIds).Find(&allowed).Error; err != nil {
			return nil, err
		}
		for _, item := range allowed {
			allowlistMap[item.UserId] = true
		}
	}

	views := make([]ViolationCaseView, 0, len(rows))
	for _, row := range rows {
		view := ViolationCaseView{
			ViolationAccountCase: row,
			EvidenceQuotesList:   ParseViolationQuotes(row.EvidenceQuotes),
			Allowlisted:          allowlistMap[row.UserId],
		}
		if user, ok := userMap[row.UserId]; ok {
			view.UserStatus = user.Status
			view.UserRole = user.Role
			if view.Username == "" {
				view.Username = user.Username
			}
		}
		views = append(views, view)
	}
	return views, nil
}

func ListViolationEvents(ctx context.Context, db *gorm.DB, filter ViolationEventFilter) ([]ViolationEvent, int64, error) {
	if db == nil {
		db = DB
	}
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize < 1 || filter.PageSize > 100 {
		filter.PageSize = 20
	}
	query := db.WithContext(ctx).Model(&ViolationEvent{})
	if filter.UserId > 0 {
		query = query.Where("user_id = ?", filter.UserId)
	}
	if username := strings.TrimSpace(filter.Username); username != "" {
		query = query.Where("username LIKE ?", "%"+username+"%")
	}
	if plugin := strings.TrimSpace(filter.Plugin); plugin != "" && plugin != "all" {
		query = query.Where("plugin = ?", plugin)
	}
	if category := strings.TrimSpace(filter.Category); category != "" && category != "all" {
		query = query.Where("category = ?", category)
	}
	if keyword := strings.TrimSpace(filter.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("prompt_excerpt LIKE ? OR username LIKE ? OR rule_id LIKE ? OR message LIKE ?", like, like, like, like)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []ViolationEvent
	offset := (filter.Page - 1) * filter.PageSize
	if err := query.Order("created_at DESC, id DESC").Offset(offset).Limit(filter.PageSize).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func ListViolationAllowlist(ctx context.Context, db *gorm.DB, page, pageSize int, keyword string) ([]ViolationAllowlist, int64, error) {
	if db == nil {
		db = DB
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	query := db.WithContext(ctx).Model(&ViolationAllowlist{})
	if trimmed := strings.TrimSpace(keyword); trimmed != "" {
		like := "%" + trimmed + "%"
		query = query.Where("username LIKE ? OR reason LIKE ?", like, like)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []ViolationAllowlist
	if err := query.Order("created_at DESC, id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func AddViolationAllowlist(ctx context.Context, db *gorm.DB, entry ViolationAllowlist) (*ViolationAllowlist, error) {
	if db == nil {
		db = DB
	}
	if entry.UserId <= 0 {
		return nil, common.NewMessage("Invalid user ID")
	}
	if entry.CreatedAt == 0 {
		entry.CreatedAt = common.GetTimestamp()
	}
	var stored ViolationAllowlist
	err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing ViolationAllowlist
		findErr := lockForUpdate(tx).Where("user_id = ?", entry.UserId).First(&existing).Error
		if errors.Is(findErr, gorm.ErrRecordNotFound) {
			if err := tx.Create(&entry).Error; err != nil {
				return err
			}
			stored = entry
			return nil
		}
		if findErr != nil {
			return findErr
		}
		updates := map[string]any{
			"username":            entry.Username,
			"reason":              entry.Reason,
			"created_by":          entry.CreatedBy,
			"created_by_username": entry.CreatedByUsername,
			"created_at":          entry.CreatedAt,
		}
		if err := tx.Model(&existing).Updates(updates).Error; err != nil {
			return err
		}
		return tx.First(&stored, existing.Id).Error
	})
	if err != nil {
		return nil, err
	}
	return &stored, nil
}

func RemoveViolationAllowlist(ctx context.Context, db *gorm.DB, userId int) error {
	if db == nil {
		db = DB
	}
	return db.WithContext(ctx).Where("user_id = ?", userId).Delete(&ViolationAllowlist{}).Error
}
