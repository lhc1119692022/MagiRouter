package service

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupModelNoticeTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	require.NoError(t, i18n.Init())

	prevDB := model.DB
	prevOptionMap := common.OptionMap
	prevAnnouncements := console_setting.GetConsoleSetting().Announcements
	prevAutoEnabled := console_setting.GetConsoleSetting().AutoModelChangeNoticeEnabled

	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.SystemTask{}, &model.Channel{}, &model.Ability{}, &model.Model{}))
	require.NoError(t, db.Where("1 = 1").Delete(&model.Option{}).Error)
	require.NoError(t, db.Where("1 = 1").Delete(&model.SystemTask{}).Error)
	require.NoError(t, db.Where("1 = 1").Delete(&model.Channel{}).Error)
	require.NoError(t, db.Where("1 = 1").Delete(&model.Ability{}).Error)
	require.NoError(t, db.Where("1 = 1").Delete(&model.Model{}).Error)

	model.DB = db
	common.OptionMap = map[string]string{}
	console_setting.GetConsoleSetting().Announcements = ""
	console_setting.GetConsoleSetting().AutoModelChangeNoticeEnabled = true

	t.Cleanup(func() {
		model.DB = prevDB
		common.OptionMap = prevOptionMap
		console_setting.GetConsoleSetting().Announcements = prevAnnouncements
		console_setting.GetConsoleSetting().AutoModelChangeNoticeEnabled = prevAutoEnabled
	})
	return db
}

func TestSyncModelAvailabilityNoticesOnlineOfflineAndVisibility(t *testing.T) {
	db := setupModelNoticeTestDB(t)

	// Seed one manual announcement to ensure auto-synced items prepend without losing manual ones.
	manual := `[{"id":5,"title":"Site maintenance","category":"announcement","content":"Scheduled window","publishDate":"2026-11-20T00:00:00Z","type":"default"}]`
	require.NoError(t, model.UpdateOption(console_setting.AnnouncementsOption, manual))

	// 1. Add enabled channel bringing two models online.
	beforeLaunch := CaptureModelAvailabilitySnapshot()
	require.True(t, beforeLaunch.Captured)
	ch1 := model.Channel{Id: 1, Name: "upstream-a", Status: common.ChannelStatusEnabled, Group: "default", Models: "deepseek-v4,gpt-6-sol"}
	require.NoError(t, db.Create(&ch1).Error)
	require.NoError(t, db.Create(&model.Ability{Group: "default", Model: "deepseek-v4", ChannelId: 1, Enabled: true}).Error)
	require.NoError(t, db.Create(&model.Ability{Group: "default", Model: "gpt-6-sol", ChannelId: 1, Enabled: true}).Error)

	published, err := SyncModelAvailabilityNotices(beforeLaunch, i18n.LangZhCN)
	require.NoError(t, err)
	assert.Equal(t, 1, published)

	notices := console_setting.GetAnnouncements()
	require.Len(t, notices, 2)
	assert.Equal(t, "model", notices[0]["category"])
	assert.Equal(t, "模型上线", notices[0]["kindLabel"])
	assert.Equal(t, "success", notices[0]["type"])
	assert.Equal(t, AutoModelNoticeSource, notices[0]["source"])
	assert.Contains(t, notices[0]["title"], "deepseek-v4")
	assert.Contains(t, notices[0]["title"], "gpt-6-sol")
	assert.Contains(t, notices[0]["content"], "default")
	_, hasAutoExtra := notices[0]["extra"]
	assert.False(t, hasAutoExtra)
	assert.Equal(t, "Site maintenance", notices[1]["title"])

	// 2. Adding a redundant backup channel for an existing model must NOT publish a duplicate notice.
	beforeBackup := CaptureModelAvailabilitySnapshot()
	ch2 := model.Channel{Id: 2, Name: "upstream-b", Status: common.ChannelStatusEnabled, Group: "vip", Models: "deepseek-v4"}
	require.NoError(t, db.Create(&ch2).Error)
	require.NoError(t, db.Create(&model.Ability{Group: "vip", Model: "deepseek-v4", ChannelId: 2, Enabled: true}).Error)

	published, err = SyncModelAvailabilityNotices(beforeBackup, i18n.LangZhCN)
	require.NoError(t, err)
	assert.Equal(t, 0, published)
	assert.Len(t, console_setting.GetAnnouncements(), 2)

	// 3. Removing channel 1 takes gpt-6-sol offline while deepseek-v4 stays online on channel 2.
	beforeRemove := CaptureModelAvailabilitySnapshot()
	require.NoError(t, db.Delete(&model.Channel{}, 1).Error)
	require.NoError(t, db.Where("channel_id = ?", 1).Delete(&model.Ability{}).Error)

	published, err = SyncModelAvailabilityNotices(beforeRemove, i18n.LangZhCN)
	require.NoError(t, err)
	assert.Equal(t, 1, published)

	notices = console_setting.GetAnnouncements()
	require.Len(t, notices, 3)
	assert.Equal(t, "模型下线", notices[0]["kindLabel"])
	assert.Equal(t, "warning", notices[0]["type"])
	assert.Contains(t, notices[0]["title"], "gpt-6-sol")
	assert.NotContains(t, notices[0]["content"], "deepseek-v4")

	// 4. Hiding deepseek-v4 via Model Management (status=0) publishes an offline notice.
	beforeHide := CaptureModelAvailabilitySnapshot()
	hiddenMeta := &model.Model{ModelName: "deepseek-v4", NameRule: model.NameRuleExact}
	require.NoError(t, db.Create(hiddenMeta).Error)
	require.NoError(t, db.Model(hiddenMeta).Update("status", 0).Error)
	published, err = SyncModelAvailabilityNotices(beforeHide, i18n.LangEn)
	require.NoError(t, err)
	assert.Equal(t, 1, published)

	notices = console_setting.GetAnnouncements()
	require.Len(t, notices, 4)
	assert.Equal(t, "Model offline", notices[0]["kindLabel"])
	assert.Contains(t, notices[0]["title"], "deepseek-v4")

	// 5. Turning off AutoModelChangeNoticeEnabled suppresses auto publishing.
	console_setting.GetConsoleSetting().AutoModelChangeNoticeEnabled = false
	beforeRestore := CaptureModelAvailabilitySnapshot()
	require.NoError(t, db.Model(&model.Model{}).Where("model_name = ?", "deepseek-v4").Update("status", 1).Error)
	published, err = SyncModelAvailabilityNotices(beforeRestore, i18n.LangZhCN)
	require.NoError(t, err)
	assert.Equal(t, 0, published)
	assert.Len(t, console_setting.GetAnnouncements(), 4)
}

func TestSyncModelAvailabilityNoticesRespectsCapAndValidation(t *testing.T) {
	db := setupModelNoticeTestDB(t)

	// Seed 100 existing announcements (1 manual + 99 auto).
	existing := make([]map[string]any, 0, 100)
	existing = append(existing, map[string]any{
		"id":          1,
		"title":       "Pinned manual notice",
		"category":    "announcement",
		"content":     "Manual content",
		"publishDate": "2026-11-01T00:00:00Z",
		"type":        "default",
	})
	for idx := 2; idx <= 100; idx++ {
		existing = append(existing, map[string]any{
			"id":          idx,
			"title":       fmt.Sprintf("Auto #%d", idx),
			"category":    "model",
			"content":     "Auto content",
			"publishDate": "2026-11-02T00:00:00Z",
			"type":        "success",
			"source":      AutoModelNoticeSource,
		})
	}
	raw, err := common.Marshal(existing)
	require.NoError(t, err)
	require.NoError(t, model.UpdateOption(console_setting.AnnouncementsOption, string(raw)))

	// Launch 25 long-named models at once to verify content/title clamping + 100-item cap retaining manual entry.
	before := CaptureModelAvailabilitySnapshot()
	require.NoError(t, db.Create(&model.Channel{Id: 9, Name: "bulk", Status: common.ChannelStatusEnabled, Group: "default"}).Error)
	for idx := 0; idx < 25; idx++ {
		name := fmt.Sprintf("provider-enterprise-reasoning-ultra-long-model-name-%02d", idx)
		require.NoError(t, db.Create(&model.Ability{Group: "default", Model: name, ChannelId: 9, Enabled: true}).Error)
	}

	published, err := SyncModelAvailabilityNotices(before, i18n.LangZhCN)
	require.NoError(t, err)
	assert.Equal(t, 1, published)

	notices := console_setting.GetAnnouncements()
	assert.Len(t, notices, 100)
	require.NoError(t, console_setting.ValidateConsoleSettings(console_setting.GetConsoleSetting().Announcements, "Announcements"))

	hasManual := false
	for _, item := range notices {
		if item["title"] == "Pinned manual notice" {
			hasManual = true
			break
		}
	}
	assert.True(t, hasManual, "trimming must drop oldest auto-synced notices before manual admin notices")
}
