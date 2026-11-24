package model

import (
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/MoeForge/moego/regexp"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/QuantumNous/new-api/setting/reasoning"
)

type PlaygroundChatControls struct {
	ImageInput    bool     `json:"image_input,omitempty"`
	WebSearch     bool     `json:"web_search,omitempty"`
	Fields        []string `json:"fields,omitempty"`
	Efforts       []string `json:"efforts,omitempty"`
	DefaultEffort string   `json:"default_effort,omitempty"`
	Sampling      string   `json:"sampling,omitempty"`
}

var playgroundResponsesRegexCache sync.Map

func GetPlaygroundChatControls(groups []string) (map[string]PlaygroundChatControls, error) {
	result := make(map[string]PlaygroundChatControls)
	if len(groups) == 0 {
		return result, nil
	}
	var routes []struct {
		ChannelId int
		Model     string
	}
	if err := DB.Model(&Ability{}).Distinct("channel_id", "model").Where(commonGroupCol+" IN ? AND enabled = ?", groups, true).Find(&routes).Error; err != nil {
		return nil, err
	}
	ids := make(map[int]bool)
	var channelIDs []int
	for _, route := range routes {
		if !ids[route.ChannelId] {
			ids[route.ChannelId] = true
			channelIDs = append(channelIDs, route.ChannelId)
		}
	}
	if len(channelIDs) == 0 {
		return result, nil
	}
	var channels []Channel
	if err := DB.Select("id", "type", "model_mapping", "param_override", "setting").Where("id IN ? AND status = ?", channelIDs, common.ChannelStatusEnabled).Find(&channels).Error; err != nil {
		return nil, err
	}
	type provider struct {
		kind          int
		aliases       map[string]string
		passThrough   bool
		paramOverride bool
	}
	providers := make(map[int]provider)
	for _, channel := range channels {
		var settings dto.ChannelSettings
		if channel.Setting != nil && *channel.Setting != "" && common.UnmarshalJsonStr(*channel.Setting, &settings) != nil {
			continue
		}
		var aliases map[string]string
		if raw := channel.GetModelMapping(); raw != "" && common.UnmarshalJsonStr(raw, &aliases) != nil {
			continue
		}
		paramOverride := channel.ParamOverride != nil && *channel.ParamOverride != "" && *channel.ParamOverride != "{}"
		providers[channel.Id] = provider{
			kind:          channel.Type,
			aliases:       aliases,
			passThrough:   settings.PassThroughBodyEnabled,
			paramOverride: paramOverride,
		}
	}
	globalSettings := model_setting.GetGlobalSettings()
	allowWebSearch := !globalSettings.PassThroughRequestEnabled
	responsesPolicy := globalSettings.ChatCompletionsToResponsesPolicy
	var responsesPatterns []*regexp.Regexp
	if allowWebSearch && responsesPolicy.Enabled {
		for _, pattern := range responsesPolicy.ModelPatterns {
			if pattern == "" {
				continue
			}
			if cached, ok := playgroundResponsesRegexCache.Load(pattern); ok {
				responsesPatterns = append(responsesPatterns, cached.(*regexp.Regexp))
				continue
			}
			compiled, err := regexp.Compile(pattern)
			if err != nil {
				continue
			}
			playgroundResponsesRegexCache.Store(pattern, compiled)
			responsesPatterns = append(responsesPatterns, compiled)
		}
	}
	for _, route := range routes {
		upstream, ok := providers[route.ChannelId]
		name, cycle := followChannelModelMapping(upstream.aliases, route.Model)
		var controls PlaygroundChatControls
		if ok && !cycle && reasoning.BaseModelName(route.Model) == route.Model {
			if upstream.passThrough || upstream.paramOverride {
				controls.Efforts, controls.DefaultEffort = documentedModelEfforts(name)
			} else {
				useResponses := len(responsesPatterns) > 0 &&
					responsesPolicy.IsChannelEnabled(route.ChannelId, upstream.kind) &&
					route.Model != "" &&
					slices.ContainsFunc(responsesPatterns, func(pattern *regexp.Regexp) bool {
						return pattern.MatchString(route.Model)
					})
				controls = documentedChatControls(upstream.kind, name, allowWebSearch, useResponses)
				if len(controls.Efforts) == 0 {
					controls.Efforts, controls.DefaultEffort = documentedModelEfforts(name)
				}
			}
		}
		if previous, exists := result[route.Model]; exists {
			controls.ImageInput = previous.ImageInput && controls.ImageInput
			controls.WebSearch = previous.WebSearch && controls.WebSearch
			controls.Fields = slices.DeleteFunc(controls.Fields, func(field string) bool { return !slices.Contains(previous.Fields, field) })
			controls.Efforts = slices.DeleteFunc(controls.Efforts, func(effort string) bool { return !slices.Contains(previous.Efforts, effort) })
			if controls.DefaultEffort != previous.DefaultEffort {
				controls.DefaultEffort = ""
			}
			if controls.Sampling != previous.Sampling {
				controls.Sampling = ""
			}
		}
		result[route.Model] = controls
	}
	return result, nil
}

func stripDocumentedDateSuffix(name string) string {
	if len(name) > 11 && name[len(name)-11] == '-' {
		if _, err := time.Parse(time.DateOnly, name[len(name)-10:]); err == nil {
			return name[:len(name)-11]
		}
	}
	if strings.HasPrefix(name, "claude-") && len(name) > 9 && name[len(name)-9] == '-' {
		if _, err := time.Parse("20060102", name[len(name)-8:]); err == nil {
			return name[:len(name)-9]
		}
	}
	return name
}

func documentedModelEfforts(name string) ([]string, string) {
	name = stripDocumentedDateSuffix(name)
	standard := []string{"low", "medium", "high"}
	switch name {
	case "gpt-5", "gpt-5-mini", "gpt-5-nano":
		return append([]string{"minimal"}, standard...), "medium"
	case "gpt-5.1":
		return append([]string{"none"}, standard...), "none"
	case "gpt-5.2", "gpt-5.4":
		return append(append([]string{"none"}, standard...), "xhigh"), "none"
	case "gpt-6-sol", "gpt-6-luna", "gpt-6.1-terra":
		return append(append([]string{"none"}, standard...), "xhigh", "max"), "medium"
	case "gpt-6-astra", "gpt-6.1-sol":
		return append(standard, "xhigh", "max"), "medium"
	case "gpt-6.2-sol", "gpt-6.2-astra":
		return standard, ""
	case "o1", "o3", "o3-mini", "o4-mini":
		return standard, "medium"
	case "claude-opus-4-5":
		return standard, "high"
	case "claude-opus-4-6", "claude-sonnet-4-6", "claude-mythos-preview":
		return append(standard, "max"), "high"
	case "claude-opus-4-7", "claude-opus-4-8", "claude-opus-5", "claude-sonnet-5", "claude-sonnet-5-5", "claude-mythos-5", "claude-mythos-5-1", "claude-mythos-5-2", "claude-fable-5", "claude-fable-5-1", "claude-fable-5-2":
		return append(standard, "xhigh", "max"), "high"
	case "claude-opus-5-5", "claude-haiku-5-5":
		return append(standard, "xhigh", "max"), "medium"
	case "gemini-4-neon", "gemini-4-hydrogen":
		return append(standard, "xhigh"), "high"
	case "gemini-4-carbon", "gemini-4-argon", "gemini-3.8-flash":
		return standard, "medium"
	case "gemini-3.6-flash":
		return append([]string{"minimal"}, standard...), "medium"
	case "gemini-3.5-flash-lite", "gemini-3.1-flash-lite":
		return append([]string{"minimal"}, standard...), "minimal"
	case "gemini-3.1-pro-preview":
		return standard, "high"
	case "gemini-3-pro-preview":
		return []string{"low", "high"}, "high"
	case "gemini-3-flash-preview":
		return append([]string{"minimal"}, standard...), "high"
	case "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite":
		return standard, ""
	default:
		return nil, ""
	}
}

func documentedChatControls(kind int, name string, allowWebSearch bool, useResponses bool) PlaygroundChatControls {
	controls := PlaygroundChatControls{Fields: []string{"max_tokens"}}
	name = stripDocumentedDateSuffix(name)
	efforts, defaultEffort := documentedModelEfforts(name)
	switch kind {
	case constant.ChannelTypeOpenAI, constant.ChannelTypeAzure:
		if base, ok := strings.CutSuffix(name, "-search-preview"); ok && base != "" {
			controls.WebSearch = allowWebSearch
			return controls
		}
		if base, ok := strings.CutSuffix(name, "-search-api"); ok && base != "" {
			controls.WebSearch = allowWebSearch
			return controls
		}
		switch name {
		case "gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano":
			controls.Sampling = "always"
			controls.Fields = append(controls.Fields, "frequency_penalty", "presence_penalty")
		case "gpt-5.1", "gpt-5.2", "gpt-5.4", "gpt-6-sol", "gpt-6-luna", "gpt-6.1-terra":
			if dto.GetOpenAIChatCapabilities(name, "none").SupportsTemperature {
				controls.Sampling = "none_only"
			}
		case "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-6-astra", "gpt-6.1-sol", "gpt-6.2-sol", "gpt-6.2-astra", "o1", "o3", "o3-mini", "o4-mini":
		default:
			return PlaygroundChatControls{}
		}
		controls.Efforts, controls.DefaultEffort = efforts, defaultEffort
		if allowWebSearch && useResponses && name != "o1" && name != "o3-mini" {
			controls.WebSearch = true
		}
	case constant.ChannelTypeAnthropic:
		switch name {
		case "claude-3-7-sonnet", "claude-sonnet-4", "claude-opus-4", "claude-opus-4-1", "claude-haiku-4-5", "claude-sonnet-4-5",
			"claude-opus-4-5", "claude-opus-4-6", "claude-sonnet-4-6", "claude-mythos-preview",
			"claude-opus-4-7", "claude-opus-4-8", "claude-opus-5", "claude-opus-5-5",
			"claude-sonnet-5", "claude-sonnet-5-5", "claude-haiku-5-5",
			"claude-mythos-5", "claude-mythos-5-1", "claude-mythos-5-2",
			"claude-fable-5", "claude-fable-5-1", "claude-fable-5-2":
		default:
			return PlaygroundChatControls{}
		}
		controls.Efforts, controls.DefaultEffort = efforts, defaultEffort
		controls.WebSearch = allowWebSearch
	case constant.ChannelTypeGemini:
		switch name {
		case "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite":
			controls.Sampling = "always"
		case "gemini-4-neon", "gemini-4-hydrogen", "gemini-4-carbon", "gemini-4-argon", "gemini-3.8-flash",
			"gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite",
			"gemini-3.1-pro-preview", "gemini-3-pro-preview", "gemini-3-flash-preview":
		default:
			return PlaygroundChatControls{}
		}
		controls.Efforts, controls.DefaultEffort = efforts, defaultEffort
		controls.WebSearch = allowWebSearch
	default:
		return PlaygroundChatControls{}
	}
	switch kind {
	case constant.ChannelTypeOpenAI, constant.ChannelTypeAzure:
		controls.ImageInput = slices.Contains([]string{"gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5.1", "gpt-5.2", "gpt-5.4", "gpt-6-sol", "gpt-6.1-sol", "gpt-6.2-sol", "o3"}, name)
	case constant.ChannelTypeAnthropic:
		controls.ImageInput = slices.Contains([]string{"claude-opus-4-5", "claude-opus-4-6", "claude-sonnet-4-6", "claude-opus-5-5"}, name)
	case constant.ChannelTypeGemini:
		controls.ImageInput = slices.Contains([]string{"gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite", "gemini-3-flash-preview", "gemini-3.1-pro-preview", "gemini-4-neon"}, name)
	}
	return controls
}
