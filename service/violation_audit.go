package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/tidwall/gjson"
	"gorm.io/gorm"
)

const (
	violationAuditQueueSize   = 512
	violationAuditMaxRawBytes = 256 << 10
)

var violationMediaPlaceholderRe = regexp.MustCompile(`^\[media:\d+\]$`)

type ViolationCaptureInput struct {
	UserId       int
	Username     string
	TokenId      int
	RequestId    string
	Model        string
	Route        string
	Ip           string
	Format       string
	Plugin       string
	Instance     string
	InstanceName string
	Stage        string
	Code         string
	RuleId       string
	Category     string
	Message      string
	RawBody      []byte
}

type ViolationRecorderStats struct {
	Pending       int    `json:"pending"`
	Dropped       uint64 `json:"dropped"`
	WriteFailures uint64 `json:"write_failures"`
}

type ViolationAuditRecorder struct {
	db       *gorm.DB
	settings atomic.Pointer[model.ViolationAuditSettings]
	queue    chan ViolationCaptureInput
	dropped  atomic.Uint64
	failures atomic.Uint64
	mu       sync.Mutex
	closed   bool
	cancel   context.CancelFunc
	done     chan struct{}
}

var violationAuditRecorder atomic.Pointer[ViolationAuditRecorder]

func NewViolationAuditRecorder(db *gorm.DB) (*ViolationAuditRecorder, error) {
	settings, err := model.LoadViolationAuditSettings(db)
	if err != nil {
		return nil, err
	}
	recorder := &ViolationAuditRecorder{
		db:    db,
		queue: make(chan ViolationCaptureInput, violationAuditQueueSize),
		done:  make(chan struct{}),
	}
	recorder.settings.Store(&settings)
	return recorder, nil
}

func CurrentViolationAuditRecorder() *ViolationAuditRecorder {
	return violationAuditRecorder.Load()
}

func StartViolationAuditRecorder() error {
	recorder, err := NewViolationAuditRecorder(model.DB)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(context.Background())
	recorder.cancel = cancel
	violationAuditRecorder.Store(recorder)
	go recorder.run(ctx)
	return nil
}

func StopViolationAuditRecorder(ctx context.Context) {
	recorder := violationAuditRecorder.Load()
	if recorder == nil {
		return
	}
	recorder.mu.Lock()
	if !recorder.closed {
		recorder.closed = true
		close(recorder.queue)
	}
	recorder.mu.Unlock()
	if recorder.cancel != nil {
		recorder.cancel()
	}
	select {
	case <-recorder.done:
		violationAuditRecorder.CompareAndSwap(recorder, nil)
	case <-ctx.Done():
		common.SysError("violation audit recorder shutdown timed out")
	}
}

func ReloadViolationAuditSettings(settings model.ViolationAuditSettings) {
	recorder := violationAuditRecorder.Load()
	if recorder == nil {
		return
	}
	copySettings := settings
	recorder.settings.Store(&copySettings)
}

func ReloadViolationAuditSettingsFromDB(ctx context.Context) error {
	recorder := violationAuditRecorder.Load()
	if recorder == nil {
		return nil
	}
	settings, err := model.LoadViolationAuditSettings(recorder.db.WithContext(ctx))
	if err != nil {
		return err
	}
	recorder.settings.Store(&settings)
	return nil
}

// CaptureViolationRejection enqueues a rejected request asynchronously so the
// relay response path never blocks on database writes.
func CaptureViolationRejection(input ViolationCaptureInput) {
	recorder := violationAuditRecorder.Load()
	if recorder == nil {
		return
	}
	recorder.Capture(input)
}

func (r *ViolationAuditRecorder) Stats() ViolationRecorderStats {
	if r == nil {
		return ViolationRecorderStats{}
	}
	return ViolationRecorderStats{
		Pending:       len(r.queue),
		Dropped:       r.dropped.Load(),
		WriteFailures: r.failures.Load(),
	}
}

func (r *ViolationAuditRecorder) Settings() model.ViolationAuditSettings {
	if r == nil {
		return model.DefaultViolationAuditSettings()
	}
	if current := r.settings.Load(); current != nil {
		return *current
	}
	return model.DefaultViolationAuditSettings()
}

func (r *ViolationAuditRecorder) Capture(input ViolationCaptureInput) {
	if r == nil {
		return
	}
	settings := r.Settings()
	if !settings.Enabled {
		return
	}
	if input.Code == "moderation.too_long" {
		return
	}
	if !settings.TracksPlugin(input.Plugin) {
		return
	}
	if len(input.RawBody) > violationAuditMaxRawBytes {
		copied := make([]byte, violationAuditMaxRawBytes)
		copy(copied, input.RawBody[:violationAuditMaxRawBytes])
		input.RawBody = copied
	} else if len(input.RawBody) > 0 {
		copied := make([]byte, len(input.RawBody))
		copy(copied, input.RawBody)
		input.RawBody = copied
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		r.dropped.Add(1)
		return
	}
	select {
	case r.queue <- input:
	default:
		r.dropped.Add(1)
	}
}

func (r *ViolationAuditRecorder) run(ctx context.Context) {
	defer close(r.done)
	for item := range r.queue {
		writeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := r.persist(writeCtx, item); err != nil {
			r.failures.Add(1)
			common.SysError("violation audit event persist failed: " + err.Error())
		}
		cancel()
		if ctx.Err() != nil && len(r.queue) == 0 {
			return
		}
	}
}

func (r *ViolationAuditRecorder) persist(ctx context.Context, input ViolationCaptureInput) error {
	settings := r.Settings()
	excerpt := ExtractViolationPromptExcerpt(input.Format, input.RawBody, settings.MaxExcerptChars)
	hash := sha256.Sum256([]byte(excerpt))
	category := strings.TrimSpace(input.Category)
	if category == "" {
		category = strings.TrimSpace(input.RuleId)
	}
	if category == "" {
		category = strings.TrimSpace(input.Code)
	}
	event := &model.ViolationEvent{
		UserId:        input.UserId,
		Username:      truncateViolationText(input.Username, 64),
		TokenId:       input.TokenId,
		RequestId:     truncateViolationText(input.RequestId, 64),
		Model:         truncateViolationText(input.Model, 255),
		Route:         truncateViolationText(input.Route, 255),
		Ip:            truncateViolationText(input.Ip, 64),
		Plugin:        truncateViolationText(input.Plugin, 128),
		Instance:      truncateViolationText(input.Instance, 128),
		InstanceName:  truncateViolationText(input.InstanceName, 256),
		Stage:         truncateViolationText(input.Stage, 32),
		Code:          truncateViolationText(input.Code, 128),
		RuleId:        truncateViolationText(input.RuleId, 256),
		Category:      truncateViolationText(category, 64),
		Message:       truncateViolationText(input.Message, 512),
		PromptExcerpt: excerpt,
		PromptHash:    hex.EncodeToString(hash[:]),
		CreatedAt:     common.GetTimestamp(),
	}
	_, err := model.RecordViolationEventAndScreen(ctx, r.db, event, settings)
	return err
}

// ExtractViolationPromptExcerpt extracts human-readable user prompt text from a
// client JSON body across OpenAI, Responses, Claude, Gemini, and task formats.
func ExtractViolationPromptExcerpt(format string, body []byte, maxChars int) string {
	if maxChars <= 0 {
		maxChars = 4000
	}
	if len(body) == 0 || !gjson.ValidBytes(body) {
		return ""
	}
	root := gjson.ParseBytes(body)
	var parts []string
	addText := func(text string) {
		cleaned := strings.TrimSpace(strings.ReplaceAll(text, "\x00", ""))
		if cleaned == "" || violationMediaPlaceholderRe.MatchString(cleaned) {
			return
		}
		parts = append(parts, cleaned)
	}

	switch format {
	case "openai", "claude":
		if messages := root.Get("messages"); messages.IsArray() {
			messages.ForEach(func(_, item gjson.Result) bool {
				role := item.Get("role").Str
				if role == "user" {
					addText(extractJSONContentText(item.Get("content")))
				}
				return true
			})
		} else if prompt := root.Get("prompt"); prompt.Exists() {
			collectStringOrArray(prompt, addText)
		}
	case "openai_responses":
		input := root.Get("input")
		if input.Type == gjson.String {
			addText(input.Str)
		} else if input.IsArray() {
			input.ForEach(func(_, item gjson.Result) bool {
				role := item.Get("role").Str
				itemType := item.Get("type").Str
				if role == "user" && (itemType == "" || itemType == "message") {
					addText(extractJSONContentText(item.Get("content")))
				}
				return true
			})
		}
	case "gemini":
		if contents := root.Get("contents"); contents.IsArray() {
			contents.ForEach(func(_, item gjson.Result) bool {
				role := item.Get("role").Str
				if role == "" || role == "user" {
					addText(extractJSONContentText(item.Get("parts")))
				}
				return true
			})
		}
	case "embedding":
		collectStringOrArray(root.Get("input"), addText)
	case "openai_image":
		collectStringOrArray(root.Get("prompt"), addText)
	default:
		// Generic / task / Midjourney fallback across common prompt fields.
		for _, path := range []string{"prompt", "lyrics", "gpt_description_prompt", "input.prompt"} {
			collectStringOrArray(root.Get(path), addText)
		}
		if messages := root.Get("messages"); messages.IsArray() {
			messages.ForEach(func(_, item gjson.Result) bool {
				if item.Get("role").Str == "user" {
					addText(extractJSONContentText(item.Get("content")))
				}
				return true
			})
		}
		if input := root.Get("input"); input.Type == gjson.String {
			addText(input.Str)
		} else if inputMsgs := root.Get("input.messages"); inputMsgs.IsArray() {
			inputMsgs.ForEach(func(_, item gjson.Result) bool {
				if item.Get("role").Str == "user" {
					addText(extractJSONContentText(item.Get("content")))
				}
				return true
			})
		}
		if contents := root.Get("contents"); contents.IsArray() {
			contents.ForEach(func(_, item gjson.Result) bool {
				role := item.Get("role").Str
				if role == "" || role == "user" {
					addText(extractJSONContentText(item.Get("parts")))
				}
				return true
			})
		}
		if instances := root.Get("instances"); instances.IsArray() {
			instances.ForEach(func(_, item gjson.Result) bool {
				collectStringOrArray(item.Get("prompt"), addText)
				return true
			})
		}
	}

	if len(parts) == 0 {
		return ""
	}
	// Keep the tail when a long multi-turn conversation exceeds the excerpt cap
	// because the latest user turns usually carry the rejected content.
	combined := strings.Join(parts, "\n---\n")
	runes := []rune(combined)
	if len(runes) <= maxChars {
		return combined
	}
	const marker = "\n...\n"
	headLen := maxChars / 3
	tailLen := maxChars - headLen - len([]rune(marker))
	if tailLen < 100 {
		return string(runes[len(runes)-maxChars:])
	}
	return string(runes[:headLen]) + marker + string(runes[len(runes)-tailLen:])
}

func collectStringOrArray(value gjson.Result, add func(string)) {
	if value.Type == gjson.String {
		add(value.Str)
		return
	}
	if value.IsArray() {
		value.ForEach(func(_, item gjson.Result) bool {
			if item.Type == gjson.String {
				add(item.Str)
			}
			return true
		})
	}
}

func extractJSONContentText(value gjson.Result) string {
	if value.Type == gjson.String {
		return value.Str
	}
	if !value.IsArray() {
		return ""
	}
	var texts []string
	value.ForEach(func(_, part gjson.Result) bool {
		if part.Type == gjson.String {
			texts = append(texts, part.Str)
			return true
		}
		if !part.IsObject() {
			return true
		}
		if part.Get("thought").Bool() {
			return true
		}
		partType := part.Get("type").Str
		if text := part.Get("text"); text.Type == gjson.String &&
			(partType == "" || partType == "text" || partType == "input_text" || partType == "output_text") {
			texts = append(texts, text.Str)
			return true
		}
		if partType == "document" && part.Get("source.type").Str == "text" {
			if data := part.Get("source.data"); data.Type == gjson.String {
				texts = append(texts, data.Str)
			}
		}
		return true
	})
	return strings.Join(texts, "\n")
}

func truncateViolationText(text string, maxRunes int) string {
	cleaned := strings.TrimSpace(strings.ReplaceAll(text, "\x00", ""))
	if maxRunes <= 0 || utf8.RuneCountInString(cleaned) <= maxRunes {
		return cleaned
	}
	runes := []rune(cleaned)
	return string(runes[:maxRunes])
}
