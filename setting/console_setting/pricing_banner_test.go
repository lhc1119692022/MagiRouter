package console_setting

import "testing"

func TestParsePricingBannerValidAndInvalid(t *testing.T) {
	valid := `[
		{
			"title": "Spring Promo",
			"subtitle": "All flagship models at 0.2x ratio.",
			"cta_label": "Try now",
			"cta_href": "/playground",
			"media_url": "https://cdn.example.com/banner.webp",
			"media_type": "image"
		}
	]`
	slides, err := ParsePricingBanner(valid)
	if err != nil {
		t.Fatalf("expected valid banner config, got error: %v", err)
	}
	if len(slides) != 1 || slides[0].Title != "Spring Promo" {
		t.Fatalf("unexpected parsed slides: %+v", slides)
	}

	for name, bad := range map[string]string{
		"empty title":   `[{"title":"   "}]`,
		"bad cta url":   `[{"title":"ok","cta_href":"javascript:alert(1)"}]`,
		"bad media url": `[{"title":"ok","media_url":"//evil.example/a.png"}]`,
		"bad mediaType": `[{"title":"ok","media_type":"swf"}]`,
	} {
		if _, err := ParsePricingBanner(bad); err == nil {
			t.Fatalf("expected error for %s", name)
		}
	}
}
