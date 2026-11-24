package console_setting

import (
	"math"
	"net/url"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
)

const OfficialModelPricesOption = "console_setting.official_model_prices"

type OfficialModelPrice struct {
	SourceURL           string   `json:"source_url"`
	InputUSDPerMillion  *float64 `json:"input_usd_per_million,omitempty"`
	OutputUSDPerMillion *float64 `json:"output_usd_per_million,omitempty"`
	USDPerRequest       *float64 `json:"usd_per_request,omitempty"`
}

var officialPricesCache struct {
	sync.Mutex
	raw    string
	prices map[string]*OfficialModelPrice
}

func ParseOfficialModelPrices(raw string) (map[string]*OfficialModelPrice, error) {
	invalid := common.NewMessage("Invalid official reference prices.")
	var entries map[string]map[string]any
	if len(raw) > 256*1024 || common.UnmarshalJsonStr(raw, &entries) != nil || entries == nil || len(entries) > 1000 {
		return nil, invalid
	}
	prices := make(map[string]*OfficialModelPrice, len(entries))
	for name, fields := range entries {
		if name == "" || name != strings.TrimSpace(name) || utf8.RuneCountInString(name) > 256 || strings.ContainsAny(name, "*?") || strings.IndexFunc(name, unicode.IsControl) >= 0 {
			return nil, invalid
		}
		source, ok := fields["source_url"].(string)
		if !ok || len(source) > 2048 || !strings.HasPrefix(source, "https://") || strings.Contains(source, "\\") || strings.IndexFunc(source, unicode.IsSpace) >= 0 {
			return nil, invalid
		}
		address, err := url.Parse(source)
		if err != nil || address.Hostname() == "" || address.User != nil {
			return nil, invalid
		}
		quote := &OfficialModelPrice{SourceURL: source}
		for field, value := range fields {
			if field == "source_url" {
				continue
			}
			amount, ok := value.(float64)
			if !ok || amount < 0 || math.IsNaN(amount) || math.IsInf(amount, 0) {
				return nil, invalid
			}
			switch field {
			case "input_usd_per_million":
				quote.InputUSDPerMillion = &amount
			case "output_usd_per_million":
				quote.OutputUSDPerMillion = &amount
			case "usd_per_request":
				quote.USDPerRequest = &amount
			default:
				return nil, invalid
			}
		}
		perToken := quote.InputUSDPerMillion != nil || quote.OutputUSDPerMillion != nil
		if perToken == (quote.USDPerRequest != nil) {
			return nil, invalid
		}
		prices[name] = quote
	}
	return prices, nil
}

func GetOfficialModelPrices() map[string]*OfficialModelPrice {
	common.OptionMapRWMutex.RLock()
	raw := GetConsoleSetting().OfficialModelPrices
	common.OptionMapRWMutex.RUnlock()
	officialPricesCache.Lock()
	defer officialPricesCache.Unlock()
	if raw != officialPricesCache.raw {
		officialPricesCache.prices, _ = ParseOfficialModelPrices(raw)
		officialPricesCache.raw = raw
	}
	return officialPricesCache.prices
}
