package console_setting

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateAnnouncementsImages(t *testing.T) {
	validPNG := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+8X8AAAAASUVORK5CYII="
	base := map[string]any{
		"id":          1,
		"title":       "Launch poster",
		"content":     "New release details",
		"publishDate": "2026-11-28T10:00:00Z",
		"type":        "default",
	}

	marshalList := func(item map[string]any) string {
		raw, err := json.Marshal([]map[string]any{item})
		require.NoError(t, err)
		return string(raw)
	}

	t.Run("accepts https, site-relative, and raster data URLs", func(t *testing.T) {
		entry := map[string]any{
			"id":          base["id"],
			"title":       base["title"],
			"content":     base["content"],
			"publishDate": base["publishDate"],
			"type":        base["type"],
			"images": []string{
				"https://cdn.example.com/notice.png",
				"/assets/banner.webp",
				validPNG,
			},
		}
		require.NoError(t, ValidateConsoleSettings(marshalList(entry), "Announcements"))
	})

	t.Run("allows image-only announcement when title is present", func(t *testing.T) {
		entry := map[string]any{
			"id":          2,
			"title":       "Poster notice",
			"content":     "",
			"publishDate": base["publishDate"],
			"images":      []string{validPNG},
		}
		require.NoError(t, ValidateConsoleSettings(marshalList(entry), "Announcements"))
	})

	t.Run("rejects empty content when no images exist", func(t *testing.T) {
		entry := map[string]any{
			"id":          3,
			"title":       "Empty notice",
			"content":     "",
			"publishDate": base["publishDate"],
		}
		require.Error(t, ValidateConsoleSettings(marshalList(entry), "Announcements"))
	})

	t.Run("rejects unsafe or malformed image sources", func(t *testing.T) {
		invalidSources := []string{
			"",
			"javascript:alert(1)",
			"data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
			"data:image/png;base64,not-valid-base64!!!",
			"//evil.example.com/a.png",
			"https://user:pass@example.com/a.png",
			"ftp://example.com/a.png",
			"data:image/png;base64," + strings.Repeat("A", MaxAnnouncementImageDataURLLength),
		}
		for _, src := range invalidSources {
			entry := map[string]any{
				"id":          4,
				"content":     "Body",
				"publishDate": base["publishDate"],
				"images":      []string{src},
			}
			require.Error(t, ValidateConsoleSettings(marshalList(entry), "Announcements"), "expected error for %q", src)
		}
	})

	t.Run("rejects more than max images per announcement", func(t *testing.T) {
		entry := map[string]any{
			"id":          5,
			"content":     "Body",
			"publishDate": base["publishDate"],
			"images": []string{
				"https://cdn.example.com/1.png",
				"https://cdn.example.com/2.png",
				"https://cdn.example.com/3.png",
				"https://cdn.example.com/4.png",
				"https://cdn.example.com/5.png",
			},
		}
		require.Error(t, ValidateConsoleSettings(marshalList(entry), "Announcements"))
	})
}

func TestValidateAndParseNoticeImages(t *testing.T) {
	validPNG := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+8X8AAAAASUVORK5CYII="

	t.Run("accepts empty and valid image lists", func(t *testing.T) {
		require.NoError(t, ValidateNoticeImages(""))
		require.NoError(t, ValidateNoticeImages("[]"))
		raw, err := json.Marshal([]string{
			"https://cdn.example.com/notice.png",
			"/assets/qr.webp",
			validPNG,
		})
		require.NoError(t, err)
		require.NoError(t, ValidateNoticeImages(string(raw)))
		require.Equal(t, []string{
			"https://cdn.example.com/notice.png",
			"/assets/qr.webp",
			validPNG,
		}, ParseNoticeImages(string(raw)))
	})

	t.Run("rejects malformed JSON, unsafe sources, and excess images", func(t *testing.T) {
		require.Error(t, ValidateNoticeImages("{bad"))
		require.Error(t, ValidateNoticeImages(`["javascript:alert(1)"]`))
		require.Error(t, ValidateNoticeImages(`["//evil.example.com/x.png"]`))
		require.Error(t, ValidateNoticeImages(`[123]`))
		tooMany, err := json.Marshal([]string{
			"https://cdn.example.com/1.png",
			"https://cdn.example.com/2.png",
			"https://cdn.example.com/3.png",
			"https://cdn.example.com/4.png",
			"https://cdn.example.com/5.png",
		})
		require.NoError(t, err)
		require.Error(t, ValidateNoticeImages(string(tooMany)))
	})

	t.Run("ParseNoticeImages filters unsafe items and enforces cap", func(t *testing.T) {
		raw, err := json.Marshal([]string{
			"https://cdn.example.com/1.png",
			"javascript:alert(1)",
			"/assets/2.png",
			"https://cdn.example.com/3.png",
			"https://cdn.example.com/4.png",
			"https://cdn.example.com/5.png",
		})
		require.NoError(t, err)
		require.Equal(t, []string{
			"https://cdn.example.com/1.png",
			"/assets/2.png",
			"https://cdn.example.com/3.png",
			"https://cdn.example.com/4.png",
		}, ParseNoticeImages(string(raw)))
	})
}

func TestGetAnnouncementsStripsLegacyAutoSyncExtra(t *testing.T) {
	prev := GetConsoleSetting().Announcements
	t.Cleanup(func() {
		GetConsoleSetting().Announcements = prev
	})

	raw, err := json.Marshal([]map[string]any{
		{
			"id":          1,
			"title":       "模型上线：seedream-5.5",
			"content":     "新上线模型（1 个）：seedream-5.5",
			"publishDate": "2026-11-28T00:53:21Z",
			"type":        "success",
			"source":      "auto_model_sync",
			"extra":       "后台管理自动同步",
		},
		{
			"id":          2,
			"title":       "Model removed: old-model",
			"content":     "Offline",
			"publishDate": "2026-11-28T00:48:51Z",
			"type":        "warning",
			"source":      "auto_model_sync",
			"extra":       "Auto-synced from admin",
		},
		{
			"id":          3,
			"title":       "Manual notice",
			"content":     "Maintenance window",
			"publishDate": "2026-11-28T00:40:00Z",
			"type":        "default",
			"extra":       "Contact support if needed",
		},
	})
	require.NoError(t, err)
	GetConsoleSetting().Announcements = string(raw)

	list := GetAnnouncements()
	require.Len(t, list, 3)
	_, hasFirstExtra := list[0]["extra"]
	_, hasSecondExtra := list[1]["extra"]
	require.False(t, hasFirstExtra)
	require.False(t, hasSecondExtra)
	require.Equal(t, "Contact support if needed", list[2]["extra"])
}
