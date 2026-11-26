package console_setting

import (
	"slices"
	"strings"
	"testing"
)

func TestParseAndMarshalChannelStatusGroupOrder(t *testing.T) {
	parsed, err := ParseChannelStatusGroupOrder(`[" GPT Fast ","Claude Max","GPT Fast"]`)
	if err != nil {
		t.Fatalf("expected valid order, got error: %v", err)
	}
	want := []string{"GPT Fast", "Claude Max"}
	if !slices.Equal(parsed, want) {
		t.Fatalf("unexpected parsed order: got %#v, want %#v", parsed, want)
	}

	for _, emptyRaw := range []string{"", "   ", "[]"} {
		empty, err := ParseChannelStatusGroupOrder(emptyRaw)
		if err != nil || len(empty) != 0 {
			t.Fatalf("expected empty order for %q, got %#v err=%v", emptyRaw, empty, err)
		}
	}

	serialized, normalized, err := MarshalChannelStatusGroupOrder([]string{" vip ", "default", "vip"})
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if serialized != `["vip","default"]` {
		t.Fatalf("unexpected serialized json: %s", serialized)
	}
	if !slices.Equal(normalized, []string{"vip", "default"}) {
		t.Fatalf("unexpected normalized slice: %#v", normalized)
	}

	emptyJSON, emptySlice, err := MarshalChannelStatusGroupOrder(nil)
	if err != nil || emptyJSON != "[]" || len(emptySlice) != 0 {
		t.Fatalf("unexpected empty marshal result: json=%q slice=%#v err=%v", emptyJSON, emptySlice, err)
	}

	invalidCases := []string{
		`not-json`,
		`{}`,
		`[""]`,
		`["   "]`,
		`["` + strings.Repeat("a", 129) + `"]`,
	}
	for _, raw := range invalidCases {
		if _, err := ParseChannelStatusGroupOrder(raw); err == nil {
			t.Fatalf("expected error for invalid input %q", raw)
		}
	}

	tooMany := make([]string, maxChannelStatusGroupOrderItems+1)
	for i := range tooMany {
		tooMany[i] = "group"
	}
	if _, err := NormalizeChannelStatusGroupOrder(tooMany); err == nil {
		t.Fatalf("expected error when exceeding max items")
	}
}

func TestGetChannelStatusGroupOrderCachesAndClones(t *testing.T) {
	prev := GetConsoleSetting().ChannelStatusGroupOrder
	t.Cleanup(func() {
		GetConsoleSetting().ChannelStatusGroupOrder = prev
	})

	GetConsoleSetting().ChannelStatusGroupOrder = `["alpha","beta"]`
	first := GetChannelStatusGroupOrder()
	if !slices.Equal(first, []string{"alpha", "beta"}) {
		t.Fatalf("unexpected order: %#v", first)
	}
	first[0] = "mutated"
	second := GetChannelStatusGroupOrder()
	if !slices.Equal(second, []string{"alpha", "beta"}) {
		t.Fatalf("expected cached order not to be mutated, got %#v", second)
	}

	GetConsoleSetting().ChannelStatusGroupOrder = "[]"
	third := GetChannelStatusGroupOrder()
	if len(third) != 0 {
		t.Fatalf("expected empty order after reset, got %#v", third)
	}
}
