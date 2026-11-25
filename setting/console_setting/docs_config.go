package console_setting

import (
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"

	"github.com/MoeForge/moego/regexp"
	"github.com/QuantumNous/new-api/common"
)

const (
	DocsConfigOption       = "console_setting.docs_config"
	MaxDocsConfigBytes     = 256 * 1024
	maxDocsArticles        = 60
	maxDocsModelOverrides  = 120
	maxDocsEndpointsPerDoc = 12
)

var (
	docsArticleIDRegex = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$`)
	allowedDocsGroups  = map[string]struct{}{
		"快速开始": {},
		"接口协议": {},
		"任务环节": {},
		"资源":   {},
	}
	allowedDocsModalities = map[string]struct{}{
		"text":  {},
		"image": {},
		"video": {},
		"audio": {},
	}
	allowedDocsMethods = map[string]struct{}{
		"POST":   {},
		"GET":    {},
		"DELETE": {},
	}
)

type DocsExampleModels struct {
	OpenAI    string `json:"openai,omitempty"`
	Anthropic string `json:"anthropic,omitempty"`
	Gemini    string `json:"gemini,omitempty"`
	Image     string `json:"image,omitempty"`
	Video     string `json:"video,omitempty"`
	Audio     string `json:"audio,omitempty"`
}

type DocsEndpointConfig struct {
	Method string `json:"method"`
	Path   string `json:"path"`
}

type DocsSnippetsOverride struct {
	Curl   string `json:"curl,omitempty"`
	Python string `json:"python,omitempty"`
	Node   string `json:"node,omitempty"`
	JSON   string `json:"json,omitempty"`
}

type DocsArticleOverride struct {
	ID            string                `json:"id"`
	Group         string                `json:"group,omitempty"`
	Title         string                `json:"title,omitempty"`
	Summary       string                `json:"summary,omitempty"`
	Hidden        bool                  `json:"hidden,omitempty"`
	Order         *int                  `json:"order,omitempty"`
	URLLabel      string                `json:"url_label,omitempty"`
	URLValue      string                `json:"url_value,omitempty"`
	Endpoints     []DocsEndpointConfig  `json:"endpoints,omitempty"`
	Markdown      string                `json:"markdown,omitempty"`
	Snippets      *DocsSnippetsOverride `json:"snippets,omitempty"`
	ResponseTitle string                `json:"response_title,omitempty"`
	ResponseJSON  string                `json:"response_json,omitempty"`
}

type DocsModelOverride struct {
	ModelID       string                `json:"model_id"`
	FamilyName    string                `json:"family_name,omitempty"`
	Cap           string                `json:"cap,omitempty"`
	Hidden        bool                  `json:"hidden,omitempty"`
	Summary       string                `json:"summary,omitempty"`
	EndpointPath  string                `json:"endpoint_path,omitempty"`
	Endpoints     []DocsEndpointConfig  `json:"endpoints,omitempty"`
	Markdown      string                `json:"markdown,omitempty"`
	Snippets      *DocsSnippetsOverride `json:"snippets,omitempty"`
	ResponseTitle string                `json:"response_title,omitempty"`
	ResponseJSON  string                `json:"response_json,omitempty"`
}

type DocsConfig struct {
	ExampleModels  *DocsExampleModels    `json:"example_models,omitempty"`
	Articles       []DocsArticleOverride `json:"articles,omitempty"`
	ModelOverrides []DocsModelOverride   `json:"model_overrides,omitempty"`
}

var docsConfigCache struct {
	sync.Mutex
	raw    string
	config DocsConfig
}

func isValidDocsSingleLine(value string, maxRunes int) bool {
	return utf8.RuneCountInString(value) <= maxRunes && strings.IndexFunc(value, unicode.IsControl) < 0
}

func isValidDocsURLValue(value string) bool {
	if value == "" {
		return true
	}
	if !isValidDocsSingleLine(value, 512) || strings.IndexFunc(value, unicode.IsSpace) >= 0 {
		return false
	}
	lower := strings.ToLower(value)
	return !strings.HasPrefix(lower, "javascript:") &&
		!strings.HasPrefix(lower, "data:") &&
		!strings.HasPrefix(lower, "vbscript:")
}

func isValidDocsEndpointPath(path string) bool {
	if path == "" || !strings.HasPrefix(path, "/") {
		return false
	}
	return isValidDocsSingleLine(path, 256) && strings.IndexFunc(path, unicode.IsSpace) < 0
}

func normalizeDocsEndpoints(entries []DocsEndpointConfig) ([]DocsEndpointConfig, bool) {
	if len(entries) == 0 {
		return nil, true
	}
	if len(entries) > maxDocsEndpointsPerDoc {
		return nil, false
	}
	clean := make([]DocsEndpointConfig, 0, len(entries))
	for _, entry := range entries {
		method := strings.ToUpper(strings.TrimSpace(entry.Method))
		path := strings.TrimSpace(entry.Path)
		if _, ok := allowedDocsMethods[method]; !ok {
			return nil, false
		}
		if !isValidDocsEndpointPath(path) {
			return nil, false
		}
		clean = append(clean, DocsEndpointConfig{Method: method, Path: path})
	}
	return clean, true
}

func normalizeDocsSnippets(snippets *DocsSnippetsOverride) (*DocsSnippetsOverride, bool) {
	if snippets == nil {
		return nil, true
	}
	clean := DocsSnippetsOverride{
		Curl:   strings.TrimSpace(snippets.Curl),
		Python: strings.TrimSpace(snippets.Python),
		Node:   strings.TrimSpace(snippets.Node),
		JSON:   strings.TrimSpace(snippets.JSON),
	}
	if utf8.RuneCountInString(clean.Curl) > 8000 ||
		utf8.RuneCountInString(clean.Python) > 8000 ||
		utf8.RuneCountInString(clean.Node) > 8000 ||
		utf8.RuneCountInString(clean.JSON) > 8000 {
		return nil, false
	}
	if clean.Curl == "" && clean.Python == "" && clean.Node == "" && clean.JSON == "" {
		return nil, true
	}
	return &clean, true
}

func ParseDocsConfig(raw string) (DocsConfig, error) {
	invalid := common.NewMessage("Invalid docs configuration.")
	if len(raw) > MaxDocsConfigBytes {
		return DocsConfig{}, invalid
	}
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "{}" {
		return DocsConfig{}, nil
	}
	if !strings.HasPrefix(trimmed, "{") {
		return DocsConfig{}, invalid
	}
	var input DocsConfig
	if common.UnmarshalJsonStr(raw, &input) != nil {
		return DocsConfig{}, invalid
	}

	var result DocsConfig
	if input.ExampleModels != nil {
		models := DocsExampleModels{
			OpenAI:    strings.TrimSpace(input.ExampleModels.OpenAI),
			Anthropic: strings.TrimSpace(input.ExampleModels.Anthropic),
			Gemini:    strings.TrimSpace(input.ExampleModels.Gemini),
			Image:     strings.TrimSpace(input.ExampleModels.Image),
			Video:     strings.TrimSpace(input.ExampleModels.Video),
			Audio:     strings.TrimSpace(input.ExampleModels.Audio),
		}
		for _, modelName := range []string{models.OpenAI, models.Anthropic, models.Gemini, models.Image, models.Video, models.Audio} {
			if !isValidDocsSingleLine(modelName, 256) {
				return DocsConfig{}, invalid
			}
		}
		if models != (DocsExampleModels{}) {
			result.ExampleModels = &models
		}
	}

	if len(input.Articles) > maxDocsArticles {
		return DocsConfig{}, invalid
	}
	seenArticles := make(map[string]struct{}, len(input.Articles))
	for _, item := range input.Articles {
		item.ID = strings.TrimSpace(item.ID)
		item.Group = strings.TrimSpace(item.Group)
		item.Title = strings.TrimSpace(item.Title)
		item.Summary = strings.TrimSpace(item.Summary)
		item.URLLabel = strings.TrimSpace(item.URLLabel)
		item.URLValue = strings.TrimSpace(item.URLValue)
		item.Markdown = strings.TrimSpace(item.Markdown)
		item.ResponseTitle = strings.TrimSpace(item.ResponseTitle)
		item.ResponseJSON = strings.TrimSpace(item.ResponseJSON)

		if !docsArticleIDRegex.MatchString(item.ID) {
			return DocsConfig{}, invalid
		}
		if _, duplicate := seenArticles[item.ID]; duplicate {
			return DocsConfig{}, invalid
		}
		seenArticles[item.ID] = struct{}{}

		if item.Group != "" {
			if _, ok := allowedDocsGroups[item.Group]; !ok {
				return DocsConfig{}, invalid
			}
		}
		if !isValidDocsSingleLine(item.Title, 120) ||
			utf8.RuneCountInString(item.Summary) > 600 ||
			!isValidDocsSingleLine(item.URLLabel, 60) ||
			!isValidDocsURLValue(item.URLValue) ||
			utf8.RuneCountInString(item.Markdown) > 32000 ||
			!isValidDocsSingleLine(item.ResponseTitle, 100) ||
			utf8.RuneCountInString(item.ResponseJSON) > 16000 {
			return DocsConfig{}, invalid
		}
		if item.Order != nil && (*item.Order < -1000 || *item.Order > 10000) {
			return DocsConfig{}, invalid
		}
		endpoints, endpointsOk := normalizeDocsEndpoints(item.Endpoints)
		if !endpointsOk {
			return DocsConfig{}, invalid
		}
		snippets, snippetsOk := normalizeDocsSnippets(item.Snippets)
		if !snippetsOk {
			return DocsConfig{}, invalid
		}
		item.Endpoints = endpoints
		item.Snippets = snippets
		result.Articles = append(result.Articles, item)
	}

	if len(input.ModelOverrides) > maxDocsModelOverrides {
		return DocsConfig{}, invalid
	}
	seenModels := make(map[string]struct{}, len(input.ModelOverrides))
	for _, item := range input.ModelOverrides {
		item.ModelID = strings.TrimSpace(item.ModelID)
		item.FamilyName = strings.TrimSpace(item.FamilyName)
		item.Cap = strings.TrimSpace(item.Cap)
		item.Summary = strings.TrimSpace(item.Summary)
		item.EndpointPath = strings.TrimSpace(item.EndpointPath)
		item.Markdown = strings.TrimSpace(item.Markdown)
		item.ResponseTitle = strings.TrimSpace(item.ResponseTitle)
		item.ResponseJSON = strings.TrimSpace(item.ResponseJSON)

		if item.ModelID == "" || !isValidDocsSingleLine(item.ModelID, 256) {
			return DocsConfig{}, invalid
		}
		if _, duplicate := seenModels[item.ModelID]; duplicate {
			return DocsConfig{}, invalid
		}
		seenModels[item.ModelID] = struct{}{}

		if item.Cap != "" {
			if _, ok := allowedDocsModalities[item.Cap]; !ok {
				return DocsConfig{}, invalid
			}
		}
		if item.EndpointPath != "" && !isValidDocsEndpointPath(item.EndpointPath) {
			return DocsConfig{}, invalid
		}
		if !isValidDocsSingleLine(item.FamilyName, 80) ||
			utf8.RuneCountInString(item.Summary) > 600 ||
			utf8.RuneCountInString(item.Markdown) > 32000 ||
			!isValidDocsSingleLine(item.ResponseTitle, 100) ||
			utf8.RuneCountInString(item.ResponseJSON) > 16000 {
			return DocsConfig{}, invalid
		}
		endpoints, endpointsOk := normalizeDocsEndpoints(item.Endpoints)
		if !endpointsOk {
			return DocsConfig{}, invalid
		}
		snippets, snippetsOk := normalizeDocsSnippets(item.Snippets)
		if !snippetsOk {
			return DocsConfig{}, invalid
		}
		item.Endpoints = endpoints
		item.Snippets = snippets
		result.ModelOverrides = append(result.ModelOverrides, item)
	}

	return result, nil
}

func GetDocsConfig() DocsConfig {
	common.OptionMapRWMutex.RLock()
	raw := GetConsoleSetting().DocsConfig
	common.OptionMapRWMutex.RUnlock()

	docsConfigCache.Lock()
	defer docsConfigCache.Unlock()
	if raw != docsConfigCache.raw {
		parsed, err := ParseDocsConfig(raw)
		if err != nil {
			parsed = DocsConfig{}
		}
		docsConfigCache.config = parsed
		docsConfigCache.raw = raw
	}
	return docsConfigCache.config
}
