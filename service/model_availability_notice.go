package service

import (
	"encoding/json"
	"errors"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf16"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm"
)

const (
	AutoModelNoticeSource       = "auto_model_sync"
	maxConsoleAnnouncements     = 100
	maxAnnouncementTitleUTF16   = 120
	maxAnnouncementContentUTF16 = 500
	maxNoticeTitleModels        = 3
	maxNoticeContentModels      = 12
	maxNoticeContentGroups      = 6
)

var autoModelNoticeMu sync.Mutex

type ModelAvailabilitySnapshot struct {
	Models      map[string]struct{}
	ModelGroups map[string][]string
	Captured    bool
}

func CaptureModelAvailabilitySnapshot() ModelAvailabilitySnapshot {
	if model.DB == nil || !model.DB.Migrator().HasTable(&model.Ability{}) {
		return ModelAvailabilitySnapshot{}
	}

	type abilityGroupModelRow struct {
		Group string `gorm:"column:group_name"`
		Model string `gorm:"column:model"`
	}

	groupCol := "`group`"
	if model.DB.Dialector != nil && model.DB.Dialector.Name() == "postgres" {
		groupCol = `"group"`
	}

	var rows []abilityGroupModelRow
	var err error
	if model.DB.Migrator().HasTable(&model.Channel{}) {
		err = model.DB.Table("abilities").
			Select("DISTINCT abilities."+groupCol+" AS group_name, abilities.model AS model").
			Joins("JOIN channels ON abilities.channel_id = channels.id").
			Where("abilities.enabled = ? AND channels.status = ? AND abilities.model <> ?", true, common.ChannelStatusEnabled, "").
			Scan(&rows).Error
	} else {
		err = model.DB.Table("abilities").
			Select("DISTINCT "+groupCol+" AS group_name, model").
			Where("enabled = ? AND model <> ?", true, "").
			Scan(&rows).Error
	}
	if err != nil {
		return ModelAvailabilitySnapshot{}
	}

	candidateGroups := make(map[string]map[string]struct{})
	candidateNames := make([]string, 0, len(rows))
	for _, row := range rows {
		modelName := strings.TrimSpace(row.Model)
		groupName := strings.TrimSpace(row.Group)
		if modelName == "" {
			continue
		}
		if groupName != "" && ratio_setting.IsUserManagementGroup(groupName) {
			continue
		}
		if _, exists := candidateGroups[modelName]; !exists {
			candidateGroups[modelName] = make(map[string]struct{})
			candidateNames = append(candidateNames, modelName)
		}
		if groupName != "" {
			candidateGroups[modelName][groupName] = struct{}{}
		}
	}

	hiddenModels, err := model.GetHiddenModelNames(candidateNames)
	if err != nil {
		return ModelAvailabilitySnapshot{}
	}

	available := make(map[string]struct{}, len(candidateNames))
	modelGroups := make(map[string][]string, len(candidateNames))
	for _, modelName := range candidateNames {
		if _, hidden := hiddenModels[modelName]; hidden {
			continue
		}
		available[modelName] = struct{}{}
		groupSet := candidateGroups[modelName]
		if len(groupSet) > 0 {
			groups := make([]string, 0, len(groupSet))
			for groupName := range groupSet {
				groups = append(groups, groupName)
			}
			sort.Strings(groups)
			modelGroups[modelName] = groups
		}
	}

	return ModelAvailabilitySnapshot{
		Models:      available,
		ModelGroups: modelGroups,
		Captured:    true,
	}
}

func SyncModelAvailabilityNotices(before ModelAvailabilitySnapshot, lang string) (int, error) {
	if !before.Captured {
		return 0, nil
	}
	if !console_setting.GetConsoleSetting().AutoModelChangeNoticeEnabled {
		return 0, nil
	}
	after := CaptureModelAvailabilitySnapshot()
	if !after.Captured {
		return 0, nil
	}

	onlineModels, offlineModels := diffModelAvailability(before.Models, after.Models)
	if len(onlineModels) == 0 && len(offlineModels) == 0 {
		return 0, nil
	}

	onlineGroups := collectNoticeGroups(onlineModels, after.ModelGroups)
	offlineGroups := collectNoticeGroups(offlineModels, before.ModelGroups)
	now := time.Now().UTC()
	notices := buildModelAvailabilityNotices(lang, onlineModels, onlineGroups, offlineModels, offlineGroups, now)
	if len(notices) == 0 {
		return 0, nil
	}

	if err := prependConsoleAnnouncements(notices, now); err != nil {
		return 0, err
	}
	return len(notices), nil
}

func diffModelAvailability(before map[string]struct{}, after map[string]struct{}) (online []string, offline []string) {
	for modelName := range after {
		if _, existed := before[modelName]; !existed {
			online = append(online, modelName)
		}
	}
	for modelName := range before {
		if _, exists := after[modelName]; !exists {
			offline = append(offline, modelName)
		}
	}
	sort.Strings(online)
	sort.Strings(offline)
	return online, offline
}

func collectNoticeGroups(models []string, groupsByModel map[string][]string) []string {
	if len(models) == 0 || len(groupsByModel) == 0 {
		return nil
	}
	seen := make(map[string]struct{})
	groups := make([]string, 0)
	for _, modelName := range models {
		for _, groupName := range groupsByModel[modelName] {
			if groupName == "" {
				continue
			}
			if _, exists := seen[groupName]; exists {
				continue
			}
			seen[groupName] = struct{}{}
			groups = append(groups, groupName)
		}
	}
	sort.Strings(groups)
	return groups
}

func isChineseNoticeLang(lang string) bool {
	effective := strings.TrimSpace(lang)
	if effective == "" {
		effective = strings.TrimSpace(common.DefaultLanguage)
	}
	return strings.HasPrefix(strings.ToLower(effective), "zh")
}

func utf16Len(value string) int {
	return len(utf16.Encode([]rune(value)))
}

func clampUTF16(value string, maxUnits int) string {
	if maxUnits <= 0 || utf16Len(value) <= maxUnits {
		return value
	}
	ellipsis := "…"
	budget := maxUnits - utf16Len(ellipsis)
	if budget <= 0 {
		return ellipsis
	}
	var builder strings.Builder
	used := 0
	for _, r := range value {
		units := 1
		if r > 0xFFFF {
			units = 2
		}
		if used+units > budget {
			break
		}
		builder.WriteRune(r)
		used += units
	}
	return strings.TrimRight(builder.String(), " ,、") + ellipsis
}

func buildNoticeEntry(
	lang string,
	isOnline bool,
	models []string,
	groups []string,
	publishDate string,
) map[string]any {
	sep := ", "
	if isChineseNoticeLang(lang) {
		sep = "、"
	}

	kindKey := i18n.MsgModelNoticeOfflineKind
	titleSingleKey := i18n.MsgModelNoticeOfflineTitleSingle
	titleMultiKey := i18n.MsgModelNoticeOfflineTitleMulti
	contentKey := i18n.MsgModelNoticeOfflineContent
	groupsKey := i18n.MsgModelNoticePrevGroupsSuffix
	noticeType := "warning"
	if isOnline {
		kindKey = i18n.MsgModelNoticeLaunchKind
		titleSingleKey = i18n.MsgModelNoticeLaunchTitleSingle
		titleMultiKey = i18n.MsgModelNoticeLaunchTitleMulti
		contentKey = i18n.MsgModelNoticeLaunchContent
		groupsKey = i18n.MsgModelNoticeGroupsSuffix
		noticeType = "success"
	}

	var title string
	if len(models) <= maxNoticeTitleModels {
		candidate := i18n.Translate(lang, titleSingleKey, map[string]any{
			"Models": strings.Join(models, sep),
		})
		if utf16Len(candidate) <= maxAnnouncementTitleUTF16 || len(models) == 1 {
			title = clampUTF16(candidate, maxAnnouncementTitleUTF16)
		}
	}
	if title == "" {
		shown := min(2, len(models))
		title = clampUTF16(i18n.Translate(lang, titleMultiKey, map[string]any{
			"Models": strings.Join(models[:shown], sep),
			"More":   len(models) - shown,
			"Count":  len(models),
		}), maxAnnouncementTitleUTF16)
	}

	groupLine := ""
	if len(groups) > 0 {
		shownGroups := groups
		suffix := ""
		if len(groups) > maxNoticeContentGroups {
			shownGroups = groups[:maxNoticeContentGroups]
			suffix = " " + i18n.Translate(lang, i18n.MsgModelNoticeMoreModels, map[string]any{
				"More":  len(groups) - maxNoticeContentGroups,
				"Count": len(groups),
			})
		}
		groupLine = "\n" + i18n.Translate(lang, groupsKey, map[string]any{
			"Groups": strings.Join(shownGroups, sep) + suffix,
		})
	}

	maxShown := min(len(models), maxNoticeContentModels)
	var content string
	for shown := maxShown; shown >= 1; shown-- {
		listText := strings.Join(models[:shown], sep)
		if shown < len(models) {
			listText += " " + i18n.Translate(lang, i18n.MsgModelNoticeMoreModels, map[string]any{
				"More":  len(models) - shown,
				"Count": len(models),
			})
		}
		body := i18n.Translate(lang, contentKey, map[string]any{
			"Count":  len(models),
			"Models": listText,
		})
		if groupLine != "" && utf16Len(body+groupLine) <= maxAnnouncementContentUTF16 {
			content = body + groupLine
			break
		}
		if utf16Len(body) <= maxAnnouncementContentUTF16 {
			content = body
			break
		}
	}
	if content == "" {
		content = clampUTF16(i18n.Translate(lang, contentKey, map[string]any{
			"Count":  len(models),
			"Models": models[0],
		}), maxAnnouncementContentUTF16)
	}

	return map[string]any{
		"title":       title,
		"category":    "model",
		"kindLabel":   clampUTF16(i18n.Translate(lang, kindKey), 32),
		"content":     content,
		"publishDate": publishDate,
		"type":        noticeType,
		"source":      AutoModelNoticeSource,
	}
}

func buildModelAvailabilityNotices(
	lang string,
	onlineModels []string,
	onlineGroups []string,
	offlineModels []string,
	offlineGroups []string,
	now time.Time,
) []map[string]any {
	_ = i18n.Init()
	publishDate := now.UTC().Format(time.RFC3339)
	notices := make([]map[string]any, 0, 2)
	if len(onlineModels) > 0 {
		notices = append(notices, buildNoticeEntry(lang, true, onlineModels, onlineGroups, publishDate))
	}
	if len(offlineModels) > 0 {
		notices = append(notices, buildNoticeEntry(lang, false, offlineModels, offlineGroups, publishDate))
	}
	return notices
}

func extractAnnouncementID(item map[string]any) int64 {
	raw, exists := item["id"]
	if !exists || raw == nil {
		return 0
	}
	switch typed := raw.(type) {
	case float64:
		return int64(typed)
	case int64:
		return typed
	case int:
		return int64(typed)
	case json.Number:
		parsed, err := typed.Int64()
		if err == nil {
			return parsed
		}
	}
	return 0
}

func trimAnnouncementsToLimit(list []map[string]any, limit int) []map[string]any {
	if len(list) <= limit {
		return list
	}
	excess := len(list) - limit
	dropIndex := make(map[int]struct{}, excess)
	for idx := len(list) - 1; idx >= 0 && len(dropIndex) < excess; idx-- {
		if source, _ := list[idx]["source"].(string); source == AutoModelNoticeSource {
			dropIndex[idx] = struct{}{}
		}
	}
	for idx := len(list) - 1; idx >= 0 && len(dropIndex) < excess; idx-- {
		if _, dropped := dropIndex[idx]; !dropped {
			dropIndex[idx] = struct{}{}
		}
	}
	trimmed := make([]map[string]any, 0, limit)
	for idx, item := range list {
		if _, dropped := dropIndex[idx]; !dropped {
			trimmed = append(trimmed, item)
		}
	}
	return trimmed
}

func prependConsoleAnnouncements(entries []map[string]any, now time.Time) error {
	if len(entries) == 0 || model.DB == nil || !model.DB.Migrator().HasTable(&model.Option{}) {
		return nil
	}
	autoModelNoticeMu.Lock()
	defer autoModelNoticeMu.Unlock()

	raw := ""
	var stored model.Option
	err := model.DB.Where(&model.Option{Key: console_setting.AnnouncementsOption}).First(&stored).Error
	if err == nil {
		raw = stored.Value
	} else if errors.Is(err, gorm.ErrRecordNotFound) {
		raw = console_setting.GetConsoleSetting().Announcements
	} else {
		return err
	}

	existing := make([]map[string]any, 0)
	if strings.TrimSpace(raw) != "" {
		if unmarshalErr := common.UnmarshalJsonStr(raw, &existing); unmarshalErr != nil {
			existing = make([]map[string]any, 0)
		}
	}

	maxID := int64(0)
	for _, item := range existing {
		if itemID := extractAnnouncementID(item); itemID > maxID {
			maxID = itemID
		}
	}
	nextID := now.UnixMilli()
	if nextID <= maxID {
		nextID = maxID + 1
	}

	prepared := make([]map[string]any, 0, len(entries))
	for _, entry := range entries {
		cloned := make(map[string]any, len(entry)+1)
		for key, val := range entry {
			cloned[key] = val
		}
		cloned["id"] = nextID
		nextID++
		prepared = append(prepared, cloned)
	}

	combined := slices.Concat(prepared, existing)
	combined = trimAnnouncementsToLimit(combined, maxConsoleAnnouncements)

	encodedBytes, err := common.Marshal(combined)
	if err != nil {
		return err
	}
	encoded := string(encodedBytes)
	if err := console_setting.ValidateConsoleSettings(encoded, "Announcements"); err != nil {
		return err
	}
	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = map[string]string{}
	}
	common.OptionMapRWMutex.Unlock()
	return model.UpdateOption(console_setting.AnnouncementsOption, encoded)
}
