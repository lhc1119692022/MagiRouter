package console_setting

import "testing"

func TestParsePricingFilterOrderValidAndInvalid(t *testing.T) {
	valid := `{"vendors":["Anthropic","OpenAI","Anthropic"],"groups":["「限时」特惠","Claude Cursor"],"capabilities":["text","image"],"quota_types":["token","request"]}`
	parsed, err := ParsePricingFilterOrder(valid)
	if err != nil {
		t.Fatalf("expected valid pricing filter order, got error: %v", err)
	}
	if len(parsed.Vendors) != 2 || parsed.Vendors[0] != "Anthropic" || parsed.Vendors[1] != "OpenAI" {
		t.Fatalf("unexpected vendors: %#v", parsed.Vendors)
	}
	if len(parsed.Groups) != 2 || parsed.Groups[0] != "「限时」特惠" {
		t.Fatalf("unexpected groups: %#v", parsed.Groups)
	}
	if len(parsed.Capabilities) != 2 || parsed.Capabilities[1] != "image" {
		t.Fatalf("unexpected capabilities: %#v", parsed.Capabilities)
	}
	if len(parsed.QuotaTypes) != 2 || parsed.QuotaTypes[1] != "request" {
		t.Fatalf("unexpected quota types: %#v", parsed.QuotaTypes)
	}

	empty, err := ParsePricingFilterOrder("{}")
	if err != nil || !empty.IsEmpty() {
		t.Fatalf("expected empty pricing filter order, got %#v err=%v", empty, err)
	}

	invalidCases := []string{
		`not-json`,
		`{"vendors":[""]}`,
		`{"capabilities":["unknown-cap"]}`,
		`{"quota_types":["free"]}`,
	}
	for _, raw := range invalidCases {
		if _, err := ParsePricingFilterOrder(raw); err == nil {
			t.Fatalf("expected error for %s", raw)
		}
	}
}
