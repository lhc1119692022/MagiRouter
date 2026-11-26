package console_setting

import (
	"slices"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
)

const PricingFilterOrderOption = "console_setting.pricing_filter_order"

const maxPricingFilterOrderItems = 200

var validPricingCapabilityCategories = []string{
	"text",
	"image",
	"video",
	"audio",
	"transcription",
	"other",
}

var validPricingQuotaTypes = []string{
	"token",
	"request",
	"task",
}

type PricingFilterOrder struct {
	Vendors      []string `json:"vendors,omitempty"`
	Groups       []string `json:"groups,omitempty"`
	Capabilities []string `json:"capabilities,omitempty"`
	QuotaTypes   []string `json:"quota_types,omitempty"`
}

func (order PricingFilterOrder) IsEmpty() bool {
	return len(order.Vendors) == 0 &&
		len(order.Groups) == 0 &&
		len(order.Capabilities) == 0 &&
		len(order.QuotaTypes) == 0
}

var pricingFilterOrderCache struct {
	sync.Mutex
	raw   string
	order PricingFilterOrder
}

func normalizePricingFilterOrderList(items []string, allowed []string, invalid error) ([]string, error) {
	if len(items) == 0 {
		return nil, nil
	}
	if len(items) > maxPricingFilterOrderItems {
		return nil, invalid
	}
	result := make([]string, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, rawItem := range items {
		item := strings.TrimSpace(rawItem)
		if item == "" || utf8.RuneCountInString(item) > 128 {
			return nil, invalid
		}
		if len(allowed) > 0 && !slices.Contains(allowed, item) {
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

func ParsePricingFilterOrder(raw string) (PricingFilterOrder, error) {
	invalid := common.NewMessage("Invalid model square filter order configuration.")
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "{}" {
		return PricingFilterOrder{}, nil
	}
	if len(raw) > 64*1024 {
		return PricingFilterOrder{}, invalid
	}
	var parsed PricingFilterOrder
	if common.UnmarshalJsonStr(raw, &parsed) != nil {
		return PricingFilterOrder{}, invalid
	}
	vendors, err := normalizePricingFilterOrderList(parsed.Vendors, nil, invalid)
	if err != nil {
		return PricingFilterOrder{}, err
	}
	groups, err := normalizePricingFilterOrderList(parsed.Groups, nil, invalid)
	if err != nil {
		return PricingFilterOrder{}, err
	}
	capabilities, err := normalizePricingFilterOrderList(parsed.Capabilities, validPricingCapabilityCategories, invalid)
	if err != nil {
		return PricingFilterOrder{}, err
	}
	quotaTypes, err := normalizePricingFilterOrderList(parsed.QuotaTypes, validPricingQuotaTypes, invalid)
	if err != nil {
		return PricingFilterOrder{}, err
	}
	return PricingFilterOrder{
		Vendors:      vendors,
		Groups:       groups,
		Capabilities: capabilities,
		QuotaTypes:   quotaTypes,
	}, nil
}

func GetPricingFilterOrder() PricingFilterOrder {
	common.OptionMapRWMutex.RLock()
	raw := GetConsoleSetting().PricingFilterOrder
	common.OptionMapRWMutex.RUnlock()
	pricingFilterOrderCache.Lock()
	defer pricingFilterOrderCache.Unlock()
	if raw != pricingFilterOrderCache.raw {
		parsed, err := ParsePricingFilterOrder(raw)
		if err != nil {
			parsed = PricingFilterOrder{}
		}
		pricingFilterOrderCache.order = parsed
		pricingFilterOrderCache.raw = raw
	}
	return pricingFilterOrderCache.order
}
