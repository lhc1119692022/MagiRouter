package console_setting

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPublishedCreationCoversAndDrafts(t *testing.T) {
	const brief = `"mode":"image","model":"studio-image","title":"Light","prompt":"Soft light"`
	const cover = `https://assets.example.test/presets/light.webp?version=2`
	raw := `[{"id":"legacy",` + brief + `},{"id":"draft","published":false,` + brief + `},{"id":"live","published":true,"cover_url":"` + cover + `",` + brief + `}]`
	saved, err := ParseCreationPresets(raw)
	require.NoError(t, err)
	require.Len(t, saved, 3)
	visible, err := PublishedCreationPresets(raw)
	require.NoError(t, err)
	require.Len(t, visible, 2)
	require.Equal(t, "legacy", visible[0]["id"])
	require.Equal(t, cover, visible[1]["cover_url"])
	for _, invalid := range []string{"http://images.example.test/photo.jpg", "data:image/png;base64,AAAA", "https://account@assets.example.test/image", "//assets.example.test/photo.jpg", "https:///missing-host", "https://assets.example.test/image#frag"} {
		_, err := ParseCreationPresets(strings.Replace(raw, cover, invalid, 1))
		require.Error(t, err)
	}
	empty, err := PublishedCreationPresets(`[{"id":"draft","published":false,` + brief + `}]`)
	require.NoError(t, err)
	require.Equal(t, []map[string]any{}, empty)
}

func TestCreationPresets(t *testing.T) {
	const valid = `{"id":"catalog-photo","title":"Editorial","model":"site/model","mode":"image","prompt":"Set the scene.","parameters":{"imageSize":"1024x1024","imageCount":2}}`
	for _, raw := range []string{"[]", "[" + valid + "]"} {
		if _, err := ParseCreationPresets(raw); err != nil {
			t.Fatalf("valid preset rejected: %v", err)
		}
	}
	for _, raw := range []string{"null", "{}", "[{}]", "[" + valid + "," + valid + "]", strings.Replace("["+valid+"]", "imageSize", "endpoint", 1), strings.Replace("["+valid+"]", `"image"`, `"chat"`, 1), strings.Replace("["+valid+"]", `:2}`, `:-1}`, 1)} {
		if _, err := ParseCreationPresets(raw); err == nil {
			t.Errorf("accepted invalid configuration: %s", raw)
		}
	}
}

func TestChatPresetOverrides(t *testing.T) {
	const preset = `[{"id":"reasoned","mode":"chat","title":"Edit","model":"site-alias","prompt":"Edit.","parameters":{"reasoning_effort":"low","seed":0,"presence_penalty":0,"frequency_penalty":-2}}]`
	if _, err := ParseCreationPresets(preset); err != nil {
		t.Fatal(err)
	}
	for _, invalid := range []string{strings.Replace(preset, `"low"`, `"unknown"`, 1), strings.Replace(preset, `"seed":0`, `"seed":0.5`, 1), strings.Replace(preset, `"presence_penalty":0`, `"presence_penalty":3`, 1), strings.Replace(preset, `"chat"`, `"image"`, 1)} {
		if _, err := ParseCreationPresets(invalid); err == nil {
			t.Fatalf("invalid overrides accepted: %s", invalid)
		}
	}
}
