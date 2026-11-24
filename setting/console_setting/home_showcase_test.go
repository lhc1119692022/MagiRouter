package console_setting

import "testing"

func TestParseHomeShowcaseValidAndInvalid(t *testing.T) {
	valid := `{
		"text": {
			"title": "Unified Language Models",
			"description": "Fast routing across flagship models.",
			"media_url": "https://cdn.example.com/hero-text.mp4",
			"media_type": "video",
			"poster_url": "/media/hero-text.webp",
			"models": ["gpt-6.2-sol", "claude-opus-5.5", "gpt-6.2-sol"],
			"explore_label": "探索全部"
		}
	}`
	parsed, err := ParseHomeShowcase(valid)
	if err != nil {
		t.Fatalf("expected valid showcase config, got error: %v", err)
	}
	textItem, ok := parsed["text"]
	if !ok {
		t.Fatalf("expected text tab item")
	}
	if len(textItem.Models) != 2 {
		t.Fatalf("expected deduplicated 2 models, got %v", textItem.Models)
	}

	for name, bad := range map[string]string{
		"unknown tab":   `{"other":{"title":"bad"}}`,
		"javascript url": `{"text":{"media_url":"javascript:alert(1)"}}`,
		"protocol-rel":  `{"text":{"media_url":"//evil.example/a.png"}}`,
		"bad mediaType": `{"text":{"media_type":"flash"}}`,
		"too many":      `{"text":{"models":["a","b","c","d","e","f","g","h","i"]}}`,
	} {
		if _, err := ParseHomeShowcase(bad); err == nil {
			t.Fatalf("expected error for %s", name)
		}
	}
}
