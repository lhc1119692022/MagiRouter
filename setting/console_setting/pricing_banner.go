package console_setting

import (
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
)

const PricingBannerOption = "console_setting.pricing_banner"

type PricingBannerSlide struct {
	Title     string `json:"title"`
	Subtitle  string `json:"subtitle,omitempty"`
	CTALabel  string `json:"cta_label,omitempty"`
	CTAHref   string `json:"cta_href,omitempty"`
	MediaURL  string `json:"media_url,omitempty"`
	MediaType string `json:"media_type,omitempty"`
	PosterURL string `json:"poster_url,omitempty"`
}

var pricingBannerCache struct {
	sync.Mutex
	raw    string
	slides []PricingBannerSlide
}

func ParsePricingBanner(raw string) ([]PricingBannerSlide, error) {
	invalid := common.NewMessage("Invalid model square banner configuration.")
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "[]" {
		return []PricingBannerSlide{}, nil
	}
	if len(raw) > 64*1024 {
		return nil, invalid
	}
	var entries []PricingBannerSlide
	if common.UnmarshalJsonStr(raw, &entries) != nil || entries == nil || len(entries) > 8 {
		return nil, invalid
	}
	result := make([]PricingBannerSlide, 0, len(entries))
	for _, slide := range entries {
		slide.Title = strings.TrimSpace(slide.Title)
		slide.Subtitle = strings.TrimSpace(slide.Subtitle)
		slide.CTALabel = strings.TrimSpace(slide.CTALabel)
		slide.CTAHref = strings.TrimSpace(slide.CTAHref)
		slide.MediaURL = strings.TrimSpace(slide.MediaURL)
		slide.MediaType = strings.TrimSpace(slide.MediaType)
		slide.PosterURL = strings.TrimSpace(slide.PosterURL)
		if slide.Title == "" ||
			utf8.RuneCountInString(slide.Title) > 120 ||
			utf8.RuneCountInString(slide.Subtitle) > 300 ||
			utf8.RuneCountInString(slide.CTALabel) > 40 {
			return nil, invalid
		}
		if slide.MediaType != "" && slide.MediaType != "auto" && slide.MediaType != "image" && slide.MediaType != "video" {
			return nil, invalid
		}
		if !isValidHomeShowcaseURL(slide.CTAHref) ||
			!isValidHomeShowcaseURL(slide.MediaURL) ||
			!isValidHomeShowcaseURL(slide.PosterURL) {
			return nil, invalid
		}
		result = append(result, slide)
	}
	return result, nil
}

func GetPricingBanner() []PricingBannerSlide {
	common.OptionMapRWMutex.RLock()
	raw := GetConsoleSetting().PricingBanner
	common.OptionMapRWMutex.RUnlock()
	pricingBannerCache.Lock()
	defer pricingBannerCache.Unlock()
	if raw != pricingBannerCache.raw {
		parsed, err := ParsePricingBanner(raw)
		if err != nil {
			parsed = []PricingBannerSlide{}
		}
		pricingBannerCache.slides = parsed
		pricingBannerCache.raw = raw
	}
	return pricingBannerCache.slides
}
