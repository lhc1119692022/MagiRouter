package console_setting

import (
	"encoding/base64"
	"net/url"
	"sort"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/MoeForge/moego/regexp"
	"github.com/QuantumNous/new-api/common"
)

const (
	MaxAnnouncementImages             = 4
	MaxAnnouncementImageURLLength     = 2048
	MaxAnnouncementImageDataURLLength = 750 * 1024
	MaxAnnouncementsPayloadBytes      = 8 * 1024 * 1024
	MaxNoticeImagesPayloadBytes       = 4 * 1024 * 1024
)

var (
	urlRegex       = regexp.MustCompile(`^https?://(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?|(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))(?:\:[0-9]{1,5})?(?:/.*)?$`)
	dangerousChars = []string{"<script", "<iframe", "javascript:", "onload=", "onerror=", "onclick="}
	validColors    = map[string]bool{
		"blue": true, "green": true, "cyan": true, "purple": true, "pink": true,
		"red": true, "orange": true, "amber": true, "yellow": true, "lime": true,
		"light-green": true, "teal": true, "light-blue": true, "indigo": true,
		"violet": true, "grey": true, "slate": true,
	}
	slugRegex                        = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
	allowedAnnouncementImagePrefixes = []string{
		"data:image/png;base64,",
		"data:image/jpeg;base64,",
		"data:image/jpg;base64,",
		"data:image/webp;base64,",
		"data:image/gif;base64,",
	}
)

func parseJSONArray(jsonStr string, formatErrorKey string) ([]map[string]any, error) {
	var list []map[string]any
	if err := common.UnmarshalJsonStr(jsonStr, &list); err != nil {
		return nil, common.NewMessage(formatErrorKey, map[string]any{"error": err.Error()})
	}
	return list, nil
}

func exceedsMaxCharacters(s string, max int) bool {
	return len(utf16.Encode([]rune(s))) > max
}

// itemMessages are the keys of the URL and content checks shared by the
// API info and Uptime Kuma group lists.
type itemMessages struct {
	invalidURL    string
	unparsableURL string
	unsafeContent string
}

var (
	apiInfoMessages = itemMessages{
		invalidURL:    "API info #{{index}} has an invalid URL format",
		unparsableURL: "API info #{{index}} has a URL that cannot be parsed: {{error}}",
		unsafeContent: "API info #{{index}} contains disallowed content",
	}
	groupMessages = itemMessages{
		invalidURL:    "Group #{{index}} has an invalid URL format",
		unparsableURL: "Group #{{index}} has a URL that cannot be parsed: {{error}}",
		unsafeContent: "Group #{{index}} contains disallowed content",
	}
)

func validateURL(urlStr string, index int, messages itemMessages) error {
	if !urlRegex.MatchString(urlStr) {
		return common.NewMessage(messages.invalidURL, map[string]any{"index": index})
	}
	if _, err := url.Parse(urlStr); err != nil {
		return common.NewMessage(messages.unparsableURL, map[string]any{"index": index, "error": err.Error()})
	}
	return nil
}

func checkDangerousContent(content string, index int, messages itemMessages) error {
	lower := strings.ToLower(content)
	for _, d := range dangerousChars {
		if strings.Contains(lower, d) {
			return common.NewMessage(messages.unsafeContent, map[string]any{"index": index})
		}
	}
	return nil
}

func getJSONList(jsonStr string) []map[string]any {
	if jsonStr == "" {
		return []map[string]any{}
	}
	var list []map[string]any
	_ = common.UnmarshalJsonStr(jsonStr, &list)
	return list
}

func ValidateConsoleSettings(settingsStr string, settingType string) error {
	if settingsStr == "" {
		return nil
	}

	switch settingType {
	case "ApiInfo":
		return validateApiInfo(settingsStr)
	case "Announcements":
		return validateAnnouncements(settingsStr)
	case "FAQ":
		return validateFAQ(settingsStr)
	case "UptimeKumaGroups":
		return validateUptimeKumaGroups(settingsStr)
	default:
		return common.NewMessage("Unknown setting type: {{type}}", map[string]any{"type": settingType})
	}
}

func validateApiInfo(apiInfoStr string) error {
	apiInfoList, err := parseJSONArray(apiInfoStr, "Invalid API info format: {{error}}")
	if err != nil {
		return err
	}

	if len(apiInfoList) > 50 {
		return common.NewMessage("API info cannot exceed 50 entries")
	}

	for i, apiInfo := range apiInfoList {
		urlStr, ok := apiInfo["url"].(string)
		if !ok || urlStr == "" {
			return common.NewMessage("API info #{{index}} is missing the URL field", map[string]any{"index": i + 1})
		}
		route, ok := apiInfo["route"].(string)
		if !ok || route == "" {
			return common.NewMessage("API info #{{index}} is missing the route description field", map[string]any{"index": i + 1})
		}
		description, ok := apiInfo["description"].(string)
		if !ok || description == "" {
			return common.NewMessage("API info #{{index}} is missing the description field", map[string]any{"index": i + 1})
		}
		color, ok := apiInfo["color"].(string)
		if !ok || color == "" {
			return common.NewMessage("API info #{{index}} is missing the color field", map[string]any{"index": i + 1})
		}

		if !isPublishableAPIURL(urlStr) {
			return common.NewMessage(apiInfoMessages.invalidURL, map[string]any{"index": i + 1})
		}

		if exceedsMaxCharacters(urlStr, 500) {
			return common.NewMessage("API info #{{index}} URL cannot exceed 500 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(route, 100) {
			return common.NewMessage("API info #{{index}} route description cannot exceed 100 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(description, 200) {
			return common.NewMessage("API info #{{index}} description cannot exceed 200 characters", map[string]any{"index": i + 1})
		}

		if !validColors[color] {
			return common.NewMessage("API info #{{index}} has an invalid color value", map[string]any{"index": i + 1})
		}

		if err := checkDangerousContent(description, i+1, apiInfoMessages); err != nil {
			return err
		}
		if err := checkDangerousContent(route, i+1, apiInfoMessages); err != nil {
			return err
		}
	}
	return nil
}

func isPublishableAPIURL(raw string) bool {
	if !urlRegex.MatchString(raw) || strings.ContainsAny(raw, "?#\\") {
		return false
	}
	address, err := url.Parse(raw)
	return err == nil && address.User == nil && address.Hostname() != ""
}

func GetApiInfo() []map[string]any {
	items := getJSONList(GetConsoleSetting().ApiInfo)
	public := make([]map[string]any, 0, len(items))
	for _, item := range items {
		address, _ := item["url"].(string)
		if !isPublishableAPIURL(address) {
			continue
		}
		entry := map[string]any{"url": address}
		for _, key := range []string{"route", "description", "color"} {
			if text, ok := item[key].(string); ok {
				entry[key] = text
			}
		}
		if id, ok := item["id"].(float64); ok {
			entry["id"] = id
		}
		public = append(public, entry)
	}
	return public
}

type imageSourceIssue int

const (
	imageSourceOK imageSourceIssue = iota
	imageSourceInvalid
	imageSourceTooLarge
)

func inspectNoticeImageSource(raw string) imageSourceIssue {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return imageSourceInvalid
	}

	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "data:") {
		for _, prefix := range allowedAnnouncementImagePrefixes {
			if strings.HasPrefix(lower, prefix) {
				if len(trimmed) > MaxAnnouncementImageDataURLLength {
					return imageSourceTooLarge
				}
				payload := trimmed[len(prefix):]
				if payload == "" {
					return imageSourceInvalid
				}
				if _, err := base64.StdEncoding.DecodeString(payload); err != nil {
					return imageSourceInvalid
				}
				return imageSourceOK
			}
		}
		return imageSourceInvalid
	}

	if len(trimmed) > MaxAnnouncementImageURLLength || strings.ContainsAny(trimmed, " \t\r\n") {
		return imageSourceInvalid
	}

	if strings.HasPrefix(trimmed, "/") {
		if strings.HasPrefix(trimmed, "//") {
			return imageSourceInvalid
		}
		return imageSourceOK
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return imageSourceInvalid
	}
	scheme := strings.ToLower(parsed.Scheme)
	if (scheme != "https" && scheme != "http") || parsed.Host == "" || parsed.User != nil {
		return imageSourceInvalid
	}
	return imageSourceOK
}

func validateAnnouncementImageSource(raw string, index int) error {
	switch inspectNoticeImageSource(raw) {
	case imageSourceTooLarge:
		return common.NewMessage("Announcement #{{index}} image is too large", map[string]any{"index": index})
	case imageSourceInvalid:
		return common.NewMessage("Announcement #{{index}} has an invalid image source", map[string]any{"index": index})
	default:
		return nil
	}
}

func ValidateNoticeImages(raw string) error {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	if len(trimmed) > MaxNoticeImagesPayloadBytes {
		return common.NewMessage("System notice images data is too large")
	}
	var items []any
	if err := common.UnmarshalJsonStr(trimmed, &items); err != nil {
		return common.NewMessage("Invalid system notice images format")
	}
	if len(items) > MaxAnnouncementImages {
		return common.NewMessage("System notice cannot exceed {{max}} images", map[string]any{"max": MaxAnnouncementImages})
	}
	for _, entry := range items {
		src, isStr := entry.(string)
		if !isStr {
			return common.NewMessage("System notice has an invalid image source")
		}
		switch inspectNoticeImageSource(src) {
		case imageSourceTooLarge:
			return common.NewMessage("System notice image is too large")
		case imageSourceInvalid:
			return common.NewMessage("System notice has an invalid image source")
		}
	}
	return nil
}

func ParseNoticeImages(raw string) []string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	var items []string
	if err := common.UnmarshalJsonStr(trimmed, &items); err != nil {
		return nil
	}
	result := make([]string, 0, min(len(items), MaxAnnouncementImages))
	for _, entry := range items {
		candidate := strings.TrimSpace(entry)
		if inspectNoticeImageSource(candidate) != imageSourceOK {
			continue
		}
		result = append(result, candidate)
		if len(result) >= MaxAnnouncementImages {
			break
		}
	}
	return result
}

func validateAnnouncementImages(raw any, index int) (int, error) {
	if raw == nil {
		return 0, nil
	}
	items, ok := raw.([]any)
	if !ok {
		return 0, common.NewMessage("Announcement #{{index}} has an invalid images format", map[string]any{"index": index})
	}
	if len(items) > MaxAnnouncementImages {
		return 0, common.NewMessage("Announcement #{{index}} cannot exceed {{max}} images", map[string]any{"index": index, "max": MaxAnnouncementImages})
	}
	for _, entry := range items {
		src, isStr := entry.(string)
		if !isStr {
			return 0, common.NewMessage("Announcement #{{index}} has an invalid image source", map[string]any{"index": index})
		}
		if err := validateAnnouncementImageSource(src, index); err != nil {
			return 0, err
		}
	}
	return len(items), nil
}

func validateAnnouncements(announcementsStr string) error {
	if len(announcementsStr) > MaxAnnouncementsPayloadBytes {
		return common.NewMessage("Announcements data is too large")
	}
	list, err := parseJSONArray(announcementsStr, "Invalid announcements format: {{error}}")
	if err != nil {
		return err
	}
	if len(list) > 100 {
		return common.NewMessage("Announcements cannot exceed 100 entries")
	}
	validTypes := map[string]bool{
		"default": true, "ongoing": true, "success": true, "warning": true, "error": true,
	}
	for idx, ann := range list {
		entryIndex := idx + 1
		imageCount, imgErr := validateAnnouncementImages(ann["images"], entryIndex)
		if imgErr != nil {
			return imgErr
		}
		titleStr, _ := ann["title"].(string)
		content, ok := ann["content"].(string)
		if (!ok || content == "") && (strings.TrimSpace(titleStr) == "" || imageCount == 0) {
			return common.NewMessage("Announcement #{{index}} is missing the content field", map[string]any{"index": entryIndex})
		}
		publishDateAny, exists := ann["publishDate"]
		if !exists {
			return common.NewMessage("Announcement #{{index}} is missing the publish date field", map[string]any{"index": entryIndex})
		}
		publishDateStr, ok := publishDateAny.(string)
		if !ok || publishDateStr == "" {
			return common.NewMessage("Announcement #{{index}} publish date cannot be empty", map[string]any{"index": entryIndex})
		}
		if _, err := time.Parse(time.RFC3339, publishDateStr); err != nil {
			return common.NewMessage("Announcement #{{index}} has an invalid publish date format", map[string]any{"index": entryIndex})
		}
		if rawType, exists := ann["type"]; exists {
			if typeStr, ok := rawType.(string); ok {
				if !validTypes[typeStr] {
					return common.NewMessage("Announcement #{{index}} has an invalid type value", map[string]any{"index": entryIndex})
				}
			}
		}
		if exceedsMaxCharacters(content, 500) {
			return common.NewMessage("Announcement #{{index}} content cannot exceed 500 characters", map[string]any{"index": entryIndex})
		}
		if extra, exists := ann["extra"]; exists {
			if extraStr, ok := extra.(string); ok && exceedsMaxCharacters(extraStr, 100) {
				return common.NewMessage("Announcement #{{index}} note cannot exceed 100 characters", map[string]any{"index": entryIndex})
			}
		}
	}
	return nil
}

func validateFAQ(faqStr string) error {
	list, err := parseJSONArray(faqStr, "Invalid FAQ format: {{error}}")
	if err != nil {
		return err
	}
	if len(list) > 100 {
		return common.NewMessage("FAQ cannot exceed 100 entries")
	}
	for i, faq := range list {
		question, ok := faq["question"].(string)
		if !ok || question == "" {
			return common.NewMessage("FAQ #{{index}} is missing the question field", map[string]any{"index": i + 1})
		}
		answer, ok := faq["answer"].(string)
		if !ok || answer == "" {
			return common.NewMessage("FAQ #{{index}} is missing the answer field", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(question, 200) {
			return common.NewMessage("FAQ #{{index}} question cannot exceed 200 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(answer, 1000) {
			return common.NewMessage("FAQ #{{index}} answer cannot exceed 1000 characters", map[string]any{"index": i + 1})
		}
	}
	return nil
}

func getPublishTime(item map[string]any) time.Time {
	if v, ok := item["publishDate"]; ok {
		if s, ok2 := v.(string); ok2 {
			if t, err := time.Parse(time.RFC3339, s); err == nil {
				return t
			}
		}
	}
	return time.Time{}
}

func GetAnnouncements() []map[string]any {
	list := getJSONList(GetConsoleSetting().Announcements)
	for _, item := range list {
		source, _ := item["source"].(string)
		extra, _ := item["extra"].(string)
		trimmedExtra := strings.TrimSpace(extra)
		if source == "auto_model_sync" && (trimmedExtra == "后台管理自动同步" || trimmedExtra == "Auto-synced from admin") {
			delete(item, "extra")
		}
	}
	sort.SliceStable(list, func(i, j int) bool {
		return getPublishTime(list[i]).After(getPublishTime(list[j]))
	})
	return list
}

func GetFAQ() []map[string]any {
	return getJSONList(GetConsoleSetting().FAQ)
}

func validateUptimeKumaGroups(groupsStr string) error {
	groups, err := parseJSONArray(groupsStr, "Invalid Uptime Kuma group settings format: {{error}}")
	if err != nil {
		return err
	}

	if len(groups) > 20 {
		return common.NewMessage("Uptime Kuma groups cannot exceed 20 entries")
	}

	nameSet := make(map[string]bool)

	for i, group := range groups {
		categoryName, ok := group["categoryName"].(string)
		if !ok || categoryName == "" {
			return common.NewMessage("Group #{{index}} is missing the category name field", map[string]any{"index": i + 1})
		}
		if nameSet[categoryName] {
			return common.NewMessage("Group #{{index}} category name duplicates another group", map[string]any{"index": i + 1})
		}
		nameSet[categoryName] = true
		urlStr, ok := group["url"].(string)
		if !ok || urlStr == "" {
			return common.NewMessage("Group #{{index}} is missing the URL field", map[string]any{"index": i + 1})
		}
		slug, ok := group["slug"].(string)
		if !ok || slug == "" {
			return common.NewMessage("Group #{{index}} is missing the slug field", map[string]any{"index": i + 1})
		}
		description, ok := group["description"].(string)
		if !ok {
			description = ""
		}

		if err := validateURL(urlStr, i+1, groupMessages); err != nil {
			return err
		}

		if exceedsMaxCharacters(categoryName, 50) {
			return common.NewMessage("Group #{{index}} category name cannot exceed 50 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(urlStr, 500) {
			return common.NewMessage("Group #{{index}} URL cannot exceed 500 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(slug, 100) {
			return common.NewMessage("Group #{{index}} slug cannot exceed 100 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(description, 200) {
			return common.NewMessage("Group #{{index}} description cannot exceed 200 characters", map[string]any{"index": i + 1})
		}

		if !slugRegex.MatchString(slug) {
			return common.NewMessage("Group #{{index}} slug can only contain letters, numbers, underscores and hyphens", map[string]any{"index": i + 1})
		}

		if err := checkDangerousContent(description, i+1, groupMessages); err != nil {
			return err
		}
		if err := checkDangerousContent(categoryName, i+1, groupMessages); err != nil {
			return err
		}
	}
	return nil
}

func GetUptimeKumaGroups() []map[string]any {
	return getJSONList(GetConsoleSetting().UptimeKumaGroups)
}
