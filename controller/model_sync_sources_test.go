package controller

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func buildTestTarball(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for name, content := range files {
		data := []byte(content)
		require.NoError(t, tw.WriteHeader(&tar.Header{
			Name:     name,
			Mode:     0644,
			Size:     int64(len(data)),
			Typeflag: tar.TypeReg,
		}))
		_, err := tw.Write(data)
		require.NoError(t, err)
	}
	require.NoError(t, tw.Close())
	require.NoError(t, gz.Close())
	return buf.Bytes()
}

func TestExtractLobeHubModelsFromJS(t *testing.T) {
	src := `
import { n as gptImage2Schema } from "../imageParameters-abc.mjs";
const openaiModels = [
	{
		description: "GPT Image 2.6 Sunburst creates crisp visuals and animations.",
		displayName: "GPT Image 2.6 Sunburst",
		enabled: true,
		id: "gpt-image-2.6-sunburst",
		parameters: gptImage2Schema,
		pricing: { units: [{ name: "imageOutput", rate: 30 }] },
		releasedAt: "2026-11-04",
		type: "image"
	},
	{
		abilities: {
			functionCall: true,
			reasoning: true,
			vision: true,
			files: true
		},
		contextWindowTokens: 1.05e6,
		description: "GPT-6.2 Sol handles coding and agentic tasks.",
		displayName: "GPT-6.2 Sol",
		id: "gpt-6.2-sol",
		type: "chat"
	}
];
export { openaiModels as allModels };
`
	models := extractLobeHubModelsFromJS(src, "openai")
	require.Len(t, models, 2)
	assert.Equal(t, "gpt-image-2.6-sunburst", models[0].ID)
	assert.Equal(t, "image", models[0].Type)
	assert.Equal(t, "openai", models[0].ProviderKey)
	assert.Contains(t, models[0].Description, "GPT Image 2.6 Sunburst")

	assert.Equal(t, "gpt-6.2-sol", models[1].ID)
	assert.Equal(t, "chat", models[1].Type)
	assert.Equal(t, 1050000, models[1].ContextWindow)
	assert.True(t, models[1].Reasoning)
	assert.True(t, models[1].Vision)
	assert.True(t, models[1].Tools)
	assert.True(t, models[1].Files)
}

func TestMergedMetadataSyncSanitizesVendorsAndFillsMissingImageModels(t *testing.T) {
	db := modelManagementDB(t, "sqlite", "")
	require.NoError(t, db.Create(&model.Vendor{Name: "智谱", Icon: "ZAI", Status: 1}).Error)
	require.NoError(t, db.Create(&model.Vendor{Name: "OpenAI", Icon: "OpenAI", Status: 1}).Error)

	var zhipuVendor, openaiVendor model.Vendor
	require.NoError(t, db.Where("name = ?", "智谱").First(&zhipuVendor).Error)
	require.NoError(t, db.Where("name = ?", "OpenAI").First(&openaiVendor).Error)

	require.NoError(t, db.Create(&model.Model{
		ModelName:    "glm-5.3",
		Description:  "Old GLM desc",
		Icon:         "",
		VendorID:     zhipuVendor.Id,
		Status:       1,
		SyncOfficial: 1,
	}).Error)
	require.NoError(t, db.Create(&model.Model{
		ModelName:    "gpt-image-2.6-sunburst",
		Description:  "",
		Icon:         "",
		Tags:         "@mr:catalog:v1=image",
		VendorID:     openaiVendor.Id,
		Status:       1,
		SyncOfficial: 1,
	}).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group:     "default",
		Model:     "claude-opus-5-5",
		ChannelId: 1,
		Enabled:   true,
	}).Error)

	tgz := buildTestTarball(t, map[string]string{
		"package/dist/openai-1234.mjs": `
const allModels = [{
	id: "gpt-image-2.6-sunburst",
	description: "OpenAI image generation model with high fidelity.",
	displayName: "GPT Image 2.6 Sunburst",
	type: "image"
}];
export { allModels };
`,
		"package/dist/zhipu-5678.mjs": `
const allModels = [{
	id: "glm-5.3",
	description: "English GLM description",
	contextWindowTokens: 1e6,
	abilities: { reasoning: true, functionCall: true },
	type: "chat"
}];
export { allModels };
`,
		"package/dist/aiModels/aihubmix.mjs": `
const allModels = [{
	id: "glm-5.3",
	description: "Reseller copy that must be ignored",
	type: "chat"
}];
export { allModels };
`,
	})

	lobehubServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/gzip")
		_, _ = w.Write(tgz)
	}))
	defer lobehubServer.Close()

	openRouterServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		payload := map[string]any{
			"data": []map[string]any{
				{
					"id":                   "anthropic/claude-opus-5.5",
					"description":          "Anthropic flagship agentic model.",
					"context_length":       1000000,
					"supported_parameters": []string{"reasoning", "tools"},
					"architecture": map[string]any{
						"input_modalities":  []string{"text", "image", "file"},
						"output_modalities": []string{"text"},
					},
				},
				{
					"id":          "anthropic/claude-opus-5.5:free",
					"description": "Variant that must be ignored",
				},
			},
		}
		encoded, _ := common.Marshal(payload)
		_, _ = w.Write(encoded)
	}))
	defer openRouterServer.Close()

	modelsDevServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Simulate a failing auxiliary source to verify graceful degradation in merged mode.
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer modelsDevServer.Close()

	basellmServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/i18n/zh/newapi/vendors.json" {
			encoded, _ := common.Marshal(map[string]any{
				"success": true,
				"data": []map[string]any{
					{"name": "Tencent TokenHub", "icon": "Hunyuan.Color", "status": 1},
				},
			})
			_, _ = w.Write(encoded)
			return
		}
		encoded, _ := common.Marshal(map[string]any{
			"success": true,
			"data": []map[string]any{
				{
					"model_name":  "glm-5.3",
					"description": "GLM 旗舰中文简介",
					"icon":        "Hunyuan.Color",
					"tags":        "推理,工具,1M",
					"vendor_name": "Tencent TokenHub",
					"status":      1,
				},
			},
		})
		_, _ = w.Write(encoded)
	}))
	defer basellmServer.Close()

	t.Setenv("SYNC_UPSTREAM_BASE", basellmServer.URL)
	t.Setenv("SYNC_LOBEHUB_TARBALL_URL", lobehubServer.URL)
	t.Setenv("SYNC_OPENROUTER_MODELS_URL", openRouterServer.URL)
	t.Setenv("SYNC_MODELS_DEV_URL", modelsDevServer.URL)
	t.Setenv("SYNC_SOURCE_CACHE_TTL_SECONDS", "0")
	t.Setenv("SYNC_HTTP_RETRY", "1")

	var preview struct {
		Success bool
		Data    struct {
			Source     metadataSyncSource
			Candidates []metadataSyncCandidate
		}
	}
	resp := modelManagementRequest(t, SyncUpstreamPreview, http.MethodGet, "/api/models/sync_upstream/preview?locale=zh&source=merged", nil, &preview)
	require.Equal(t, http.StatusOK, resp.Code)
	require.True(t, preview.Success, resp.Body.String())
	assert.Equal(t, metadataSourceMerged, preview.Data.Source.Source)
	assert.ElementsMatch(t, []string{metadataSourceLobeHub, metadataSourceOpenRouter, metadataSourceOfficial}, preview.Data.Source.ActiveSources)
	assert.Len(t, preview.Data.Source.Warnings, 1)

	byName := make(map[string]metadataSyncCandidate)
	for _, item := range preview.Data.Candidates {
		byName[item.ModelName] = item
	}

	// 1. glm-5.3: keeps basellm Chinese description, fixes Tencent TokenHub -> existing local 智谱 + Zhipu.Color
	glm, ok := byName["glm-5.3"]
	require.True(t, ok)
	require.NotNil(t, glm.Upstream)
	assert.Equal(t, "update", glm.Kind)
	assert.Equal(t, "GLM 旗舰中文简介", glm.Upstream.Description)
	assert.Equal(t, "智谱", glm.Upstream.Vendor)
	assert.Equal(t, "Zhipu.Color", glm.Upstream.Icon)
	assert.Empty(t, glm.VendorToCreate)

	// 2. gpt-image-2.6-sunburst: filled from LobeHub model-bank with OpenAI vendor/icon & localized image tag
	img, ok := byName["gpt-image-2.6-sunburst"]
	require.True(t, ok)
	require.NotNil(t, img.Upstream)
	assert.Equal(t, "update", img.Kind)
	assert.Equal(t, "OpenAI", img.Upstream.Vendor)
	assert.Equal(t, "OpenAI", img.Upstream.Icon)
	assert.Contains(t, img.Upstream.Description, "OpenAI image generation")
	assert.Contains(t, img.Upstream.Tags, "图片生成")

	// 3. claude-opus-5-5: dot-to-dash normalized from OpenRouter, creates Anthropic vendor
	claude, ok := byName["claude-opus-5-5"]
	require.True(t, ok)
	require.NotNil(t, claude.Upstream)
	assert.Equal(t, "create", claude.Kind)
	assert.Equal(t, "Anthropic", claude.Upstream.Vendor)
	assert.Equal(t, "Claude.Color", claude.Upstream.Icon)
	assert.Equal(t, "Anthropic", claude.VendorToCreate)
	assert.Contains(t, claude.Upstream.Tags, "推理")
	assert.Contains(t, claude.Upstream.Tags, "1M")

	// Apply selected changes via SyncUpstreamModels with source=merged
	applyBody := map[string]any{
		"locale":         "zh",
		"source":         "merged",
		"source_version": preview.Data.Source.Version,
		"selections": []model.MetadataSyncSelection{
			{
				ModelName:     "glm-5.3",
				RecordVersion: glm.RecordVersion,
				Create:        false,
				Fields:        []string{"description", "icon", "tags"},
			},
			{
				ModelName:     "gpt-image-2.6-sunburst",
				RecordVersion: img.RecordVersion,
				Create:        false,
				Fields:        []string{"description", "icon", "tags"},
			},
			{
				ModelName:     "claude-opus-5-5",
				RecordVersion: claude.RecordVersion,
				Create:        true,
				Fields:        []string{"description", "icon", "tags", "vendor", "endpoints", "name_rule", "status"},
			},
		},
	}
	var applyResp struct {
		Success bool
		Data    model.MetadataSyncResult
	}
	resp = modelManagementRequest(t, SyncUpstreamModels, http.MethodPost, "/api/models/sync_upstream", applyBody, &applyResp)
	require.Equal(t, http.StatusOK, resp.Code, resp.Body.String())
	require.True(t, applyResp.Success)
	assert.Equal(t, []string{"claude-opus-5-5"}, applyResp.Data.CreatedModels)
	assert.Equal(t, []string{"Anthropic"}, applyResp.Data.CreatedVendors)

	var savedImg model.Model
	require.NoError(t, db.Where("model_name = ?", "gpt-image-2.6-sunburst").First(&savedImg).Error)
	assert.Equal(t, "OpenAI", savedImg.Icon)
	assert.Contains(t, savedImg.Tags, "图片生成")
	assert.Contains(t, savedImg.Tags, "@mr:catalog:v1=image")

	var savedGLM model.Model
	require.NoError(t, db.Where("model_name = ?", "glm-5.3").First(&savedGLM).Error)
	assert.Equal(t, "Zhipu.Color", savedGLM.Icon)
	assert.Equal(t, "GLM 旗舰中文简介", savedGLM.Description)
	assert.Equal(t, zhipuVendor.Id, savedGLM.VendorID)
}

func TestMergedMetadataSyncDeduplicatesCaseAndFiltersResellerNoise(t *testing.T) {
	db := modelManagementDB(t, "sqlite", "")
	require.NoError(t, db.Create(&model.Vendor{Name: "DeepSeek", Icon: "DeepSeek.Color", Status: 1}).Error)
	var dsVendor model.Vendor
	require.NoError(t, db.Where("name = ?", "DeepSeek").First(&dsVendor).Error)

	require.NoError(t, db.Create(&model.Model{
		ModelName:    "deepseek-v4.1-flash",
		Description:  "Old local description",
		VendorID:     dsVendor.Id,
		Status:       1,
		SyncOfficial: 1,
	}).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group:     "default",
		Model:     "DeepSeek-V4.1-Flash-1017",
		ChannelId: 1,
		Enabled:   true,
	}).Error)

	tgz := buildTestTarball(t, map[string]string{
		"package/dist/deepseek-1234.mjs": `
const allModels = [{
	id: "DeepSeek-V4.1-Flash",
	description: "DeepSeek V4.1 Flash from LobeHub",
	contextWindowTokens: 128000,
	abilities: { reasoning: true, functionCall: true },
	type: "chat"
}];
export { allModels };
`,
	})
	lobehubServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/gzip")
		_, _ = w.Write(tgz)
	}))
	defer lobehubServer.Close()

	openRouterServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		payload := map[string]any{
			"data": []map[string]any{
				{
					"id":             "deepseek/deepseek-v4.1-flash",
					"description":    "OpenRouter DeepSeek V4.1 Flash",
					"context_length": 128000,
				},
				{
					"id":             "deepseek/deepseek-v4.1-flash-1017",
					"description":    "OpenRouter DeepSeek V4.1 Flash 1017",
					"context_length": 128000,
				},
				{
					"id":          "openrouter/auto",
					"description": "Meta router that must be ignored",
				},
				{
					"id":          "~deepseek/deepseek-flash-latest",
					"description": "Tilde alias that must be ignored",
				},
			},
		}
		encoded, _ := common.Marshal(payload)
		_, _ = w.Write(encoded)
	}))
	defer openRouterServer.Close()

	modelsDevServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		payload := map[string]any{
			"inferx": map[string]any{
				"name": "InferX",
				"models": map[string]any{
					"Agents-A1": map[string]any{"id": "Agents-A1", "description": "Reseller model"},
				},
			},
			"stepping-stone": map[string]any{
				"name": "stepping stone AG",
				"models": map[string]any{
					"apertus-ai/Apertus-v1.5-8B": map[string]any{"id": "apertus-ai/Apertus-v1.5-8B"},
				},
			},
			"nanogpt": map[string]any{
				"name": "NanoGPT",
				"models": map[string]any{
					"Artemis-v1.1": map[string]any{"id": "Artemis-v1.1"},
				},
			},
			"alibaba-cn": map[string]any{
				"name": "Alibaba (China)",
				"models": map[string]any{
					"DeepSeek-V4.1-Flash": map[string]any{
						"id":          "deepseek-ai/DeepSeek-V4.1-Flash",
						"description": "Duplicate casing from alibaba-cn",
						"reasoning":   true,
					},
					"mindlab/macaron-v1.1-venti": map[string]any{
						"id": "mindlab/macaron-v1.1-venti",
					},
					"qwen3.8-max": map[string]any{
						"id":          "qwen3.8-max",
						"description": "Alibaba Qwen 3.8 Max",
					},
				},
			},
			"minimax": map[string]any{
				"name": "MiniMax (minimax.io)",
				"models": map[string]any{
					"MiniMax-M3": map[string]any{
						"id":          "MiniMax-M3",
						"description": "MiniMax M3",
					},
				},
			},
		}
		encoded, _ := common.Marshal(payload)
		_, _ = w.Write(encoded)
	}))
	defer modelsDevServer.Close()

	basellmServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/i18n/zh/newapi/vendors.json" {
			encoded, _ := common.Marshal(map[string]any{
				"success": true,
				"data": []map[string]any{
					{"name": "DeepSeek", "icon": "DeepSeek.Color", "status": 1},
					{"name": "MiniMax", "icon": "Minimax.Color", "status": 1},
				},
			})
			_, _ = w.Write(encoded)
			return
		}
		encoded, _ := common.Marshal(map[string]any{
			"success": true,
			"data": []map[string]any{
				{
					"model_name":  "deepseek-v4.1-flash",
					"description": "DeepSeek V4.1 Flash 中文简介",
					"vendor_name": "Tencent TokenHub",
					"status":      1,
				},
				{
					"model_name":  "deepseek-ai/DeepSeek-V4.1-Flash:peft:262144",
					"description": "PEFT noise",
					"vendor_name": "Thinking Machines",
					"status":      1,
				},
				{
					"model_name":  "deepseek/deepseek-v4.1-flash",
					"description": "Slash duplicate",
					"vendor_name": "Tencent TokenHub",
					"status":      1,
				},
				{
					"model_name":  "MiniMax-M3",
					"description": "MiniMax M3 中文简介",
					"vendor_name": "MiniMax",
					"status":      1,
				},
				{
					"model_name":  "minimax-m3",
					"description": "",
					"vendor_name": "MiniMax",
					"status":      1,
				},
			},
		})
		_, _ = w.Write(encoded)
	}))
	defer basellmServer.Close()

	t.Setenv("SYNC_UPSTREAM_BASE", basellmServer.URL)
	t.Setenv("SYNC_LOBEHUB_TARBALL_URL", lobehubServer.URL)
	t.Setenv("SYNC_OPENROUTER_MODELS_URL", openRouterServer.URL)
	t.Setenv("SYNC_MODELS_DEV_URL", modelsDevServer.URL)
	t.Setenv("SYNC_SOURCE_CACHE_TTL_SECONDS", "0")
	t.Setenv("SYNC_HTTP_RETRY", "1")

	var preview struct {
		Success bool
		Data    struct {
			Source     metadataSyncSource
			Candidates []metadataSyncCandidate
		}
	}
	resp := modelManagementRequest(t, SyncUpstreamPreview, http.MethodGet, "/api/models/sync_upstream/preview?locale=zh&source=merged", nil, &preview)
	require.Equal(t, http.StatusOK, resp.Code)
	require.True(t, preview.Success, resp.Body.String())

	names := make([]string, 0, len(preview.Data.Candidates))
	byName := make(map[string]metadataSyncCandidate, len(preview.Data.Candidates))
	for _, item := range preview.Data.Candidates {
		names = append(names, item.ModelName)
		byName[item.ModelName] = item
	}

	// Case-insensitive sort & zero case-duplicates / reseller noise / fake dot-to-dash aliases
	assert.Equal(t, []string{
		"deepseek-v4.1-flash",
		"DeepSeek-V4.1-Flash-1017",
		"minimax-m3",
		"qwen3.8-max",
	}, names)

	assert.Equal(t, "site", byName["deepseek-v4.1-flash"].Scope)
	assert.Equal(t, "update", byName["deepseek-v4.1-flash"].Kind)
	require.NotNil(t, byName["deepseek-v4.1-flash"].Upstream)
	assert.Equal(t, "DeepSeek V4.1 Flash 中文简介", byName["deepseek-v4.1-flash"].Upstream.Description)
	assert.Equal(t, "DeepSeek", byName["deepseek-v4.1-flash"].Upstream.Vendor)

	// Site channel with mixed case matches lowercase upstream without creating a duplicate candidate
	siteMixed := byName["DeepSeek-V4.1-Flash-1017"]
	assert.Equal(t, "site", siteMixed.Scope)
	assert.Equal(t, "create", siteMixed.Kind)
	require.NotNil(t, siteMixed.Upstream)
	assert.Equal(t, "DeepSeek", siteMixed.Upstream.Vendor)

	// basellm MiniMax-M3 + minimax-m3 collapsed into lowercase minimax-m3 while preserving Chinese description
	minimax := byName["minimax-m3"]
	assert.Equal(t, "catalog", minimax.Scope)
	assert.Equal(t, "create", minimax.Kind)
	require.NotNil(t, minimax.Upstream)
	assert.Equal(t, "MiniMax M3 中文简介", minimax.Upstream.Description)

	// Reject duplicate case selections in a single sync request
	dupResp := modelManagementRequest(t, SyncUpstreamModels, http.MethodPost, "/api/models/sync_upstream", map[string]any{
		"locale":         "zh",
		"source":         "merged",
		"source_version": preview.Data.Source.Version,
		"selections": []model.MetadataSyncSelection{
			{ModelName: "DeepSeek-V4.1-Flash-1017", RecordVersion: siteMixed.RecordVersion, Create: true},
			{ModelName: "deepseek-v4.1-flash-1017", RecordVersion: siteMixed.RecordVersion, Create: true},
		},
	}, nil)
	assert.Equal(t, http.StatusBadRequest, dupResp.Code)

	// Applying mixed-case site model matched to lowercase upstream succeeds cleanly
	var applyResp struct {
		Success bool
		Data    model.MetadataSyncResult
	}
	applyHTTP := modelManagementRequest(t, SyncUpstreamModels, http.MethodPost, "/api/models/sync_upstream", map[string]any{
		"locale":         "zh",
		"source":         "merged",
		"source_version": preview.Data.Source.Version,
		"selections": []model.MetadataSyncSelection{
			{
				ModelName:     "DeepSeek-V4.1-Flash-1017",
				RecordVersion: siteMixed.RecordVersion,
				Create:        true,
				Fields:        []string{"description", "icon", "tags", "vendor", "endpoints", "name_rule", "status"},
			},
		},
	}, &applyResp)
	require.Equal(t, http.StatusOK, applyHTTP.Code, applyHTTP.Body.String())
	require.True(t, applyResp.Success)
	assert.Equal(t, []string{"DeepSeek-V4.1-Flash-1017"}, applyResp.Data.CreatedModels)
}
