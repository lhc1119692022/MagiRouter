package console_setting

import (
	"slices"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
)

const ChannelStatusGroupOrderOption = "console_setting.channel_status_group_order"

const maxChannelStatusGroupOrderItems = 200

var channelStatusGroupOrderCache struct {
	sync.Mutex
	raw   string
	order []string
}

func NormalizeChannelStatusGroupOrder(items []string) ([]string, error) {
	invalid := common.NewMessage("Invalid channel status group order configuration.")
	if len(items) == 0 {
		return nil, nil
	}
	if len(items) > maxChannelStatusGroupOrderItems {
		return nil, invalid
	}
	result := make([]string, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, rawItem := range items {
		item := strings.TrimSpace(rawItem)
		if item == "" || utf8.RuneCountInString(item) > 128 {
			return nil, invalid
		}
		if _, exists := seen[item]; exists {
			continue
		}
		seen[item] = struct{}{}
		result = append(result, item)
	}
	if len(result) == 0 {
		return nil, nil
	}
	return result, nil
}

func ParseChannelStatusGroupOrder(raw string) ([]string, error) {
	invalid := common.NewMessage("Invalid channel status group order configuration.")
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "[]" {
		return nil, nil
	}
	if len(raw) > 64*1024 {
		return nil, invalid
	}
	var parsed []string
	if common.UnmarshalJsonStr(raw, &parsed) != nil {
		return nil, invalid
	}
	return NormalizeChannelStatusGroupOrder(parsed)
}

func MarshalChannelStatusGroupOrder(items []string) (string, []string, error) {
	normalized, err := NormalizeChannelStatusGroupOrder(items)
	if err != nil {
		return "", nil, err
	}
	if len(normalized) == 0 {
		return "[]", []string{}, nil
	}
	encoded, err := common.Marshal(normalized)
	if err != nil {
		return "", nil, err
	}
	return string(encoded), normalized, nil
}

func GetChannelStatusGroupOrder() []string {
	common.OptionMapRWMutex.RLock()
	raw := GetConsoleSetting().ChannelStatusGroupOrder
	common.OptionMapRWMutex.RUnlock()
	channelStatusGroupOrderCache.Lock()
	defer channelStatusGroupOrderCache.Unlock()
	if raw != channelStatusGroupOrderCache.raw {
		parsed, err := ParseChannelStatusGroupOrder(raw)
		if err != nil {
			parsed = nil
		}
		channelStatusGroupOrderCache.order = parsed
		channelStatusGroupOrderCache.raw = raw
	}
	return slices.Clone(channelStatusGroupOrderCache.order)
}
