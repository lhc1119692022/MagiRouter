package controller

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"path"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	metadataSourceOfficial   = "official"
	metadataSourceMerged     = "merged"
	metadataSourceLobeHub    = "lobehub"
	metadataSourceOpenRouter = "openrouter"
	metadataSourceModelsDev  = "models_dev"

	defaultLobeHubRegistryURL = "https://registry.npmjs.org/model-bank/latest"
	defaultOpenRouterURL      = "https://openrouter.ai/api/v1/models"
	defaultModelsDevURL       = "https://models.dev/api.json"

	maxLobeHubTarballBytes = 12 << 20
	maxLobeHubModuleBytes  = 4 << 20
)

type canonicalVendorSpec struct {
	Key        string
	ZHName     string
	ENName     string
	VendorIcon string
	ModelIcon  string
	Aliases    []string
}

var canonicalVendors = []canonicalVendorSpec{
	{Key: "openai", ZHName: "OpenAI", ENName: "OpenAI", VendorIcon: "OpenAI", ModelIcon: "OpenAI", Aliases: []string{"openai"}},
	{Key: "anthropic", ZHName: "Anthropic", ENName: "Anthropic", VendorIcon: "Anthropic", ModelIcon: "Claude.Color", Aliases: []string{"anthropic"}},
	{Key: "google", ZHName: "Google", ENName: "Google", VendorIcon: "Google.Color", ModelIcon: "Gemini.Color", Aliases: []string{"google", "gemini", "google-ai-studio"}},
	{Key: "deepseek", ZHName: "DeepSeek", ENName: "DeepSeek", VendorIcon: "DeepSeek.Color", ModelIcon: "DeepSeek.Color", Aliases: []string{"deepseek"}},
	{Key: "zhipu", ZHName: "智谱", ENName: "Zhipu AI", VendorIcon: "ZAI", ModelIcon: "Zhipu.Color", Aliases: []string{"zhipu", "zhipuai", "z-ai", "z.ai", "z.ai coding plan", "zhipu ai", "智谱", "bigmodel"}},
	{Key: "moonshot", ZHName: "Moonshot AI", ENName: "Moonshot AI", VendorIcon: "Moonshot", ModelIcon: "Moonshot", Aliases: []string{"moonshot", "moonshotai", "moonshot ai", "kimi"}},
	{Key: "xai", ZHName: "xAI", ENName: "xAI", VendorIcon: "XAI", ModelIcon: "XAI", Aliases: []string{"xai", "x-ai"}},
	{Key: "alibaba", ZHName: "Alibaba", ENName: "Alibaba", VendorIcon: "Qwen.Color", ModelIcon: "Qwen.Color", Aliases: []string{"alibaba", "alibaba (china)", "alibaba token plan", "qwen", "dashscope", "aliyun", "阿里", "阿里巴巴"}},
	{Key: "bytedance", ZHName: "字节跳动", ENName: "ByteDance", VendorIcon: "ByteDance.Color", ModelIcon: "Doubao.Color", Aliases: []string{"bytedance", "volcengine", "volcengine ark", "volcengine ark coding plan", "doubao", "字节跳动", "火山引擎"}},
	{Key: "minimax", ZHName: "MiniMax", ENName: "MiniMax", VendorIcon: "Minimax.Color", ModelIcon: "Minimax.Color", Aliases: []string{"minimax", "minimax (minimax.io)", "minimax (minimax.cn)", "minimax token plan (minimax.io)"}},
	{Key: "tencent", ZHName: "Tencent", ENName: "Tencent", VendorIcon: "Hunyuan.Color", ModelIcon: "Hunyuan.Color", Aliases: []string{"tencent", "hunyuan", "tencent hunyuan", "tencent coding plan (china)", "tencent token plan", "腾讯"}},
	{Key: "mistral", ZHName: "Mistral", ENName: "Mistral", VendorIcon: "Mistral.Color", ModelIcon: "Mistral.Color", Aliases: []string{"mistral", "mistralai", "mistral ai"}},
	{Key: "cohere", ZHName: "Cohere", ENName: "Cohere", VendorIcon: "Cohere.Color", ModelIcon: "Cohere.Color", Aliases: []string{"cohere"}},
	{Key: "meta", ZHName: "Meta", ENName: "Meta", VendorIcon: "Meta.Color", ModelIcon: "Meta.Color", Aliases: []string{"meta", "meta-llama"}},
	{Key: "perplexity", ZHName: "Perplexity", ENName: "Perplexity", VendorIcon: "Perplexity.Color", ModelIcon: "Perplexity.Color", Aliases: []string{"perplexity"}},
	{Key: "stepfun", ZHName: "StepFun", ENName: "StepFun", VendorIcon: "Stepfun", ModelIcon: "Stepfun", Aliases: []string{"stepfun", "stepfun (china)", "stepfun (global)", "stepfun step plan (china)"}},
	{Key: "baichuan", ZHName: "Baichuan", ENName: "Baichuan", VendorIcon: "Baichuan.Color", ModelIcon: "Baichuan.Color", Aliases: []string{"baichuan"}},
	{Key: "yi", ZHName: "01.AI", ENName: "01.AI", VendorIcon: "Yi.Color", ModelIcon: "Yi.Color", Aliases: []string{"yi", "01-ai", "01.ai", "zeroone"}},
	{Key: "bfl", ZHName: "Black Forest Labs", ENName: "Black Forest Labs", VendorIcon: "Flux", ModelIcon: "Flux", Aliases: []string{"bfl", "black-forest-labs", "black forest labs"}},
	{Key: "elevenlabs", ZHName: "ElevenLabs", ENName: "ElevenLabs", VendorIcon: "ElevenLabs", ModelIcon: "ElevenLabs", Aliases: []string{"elevenlabs"}},
	{Key: "baidu", ZHName: "Baidu", ENName: "Baidu", VendorIcon: "Wenxin.Color", ModelIcon: "Wenxin.Color", Aliases: []string{"baidu", "wenxin", "qianfan"}},
	{Key: "xiaomi", ZHName: "小米", ENName: "Xiaomi", VendorIcon: "XiaomiMiMo", ModelIcon: "XiaomiMiMo", Aliases: []string{"xiaomi", "mimo", "xiaomi mimo", "小米"}},
	{Key: "nvidia", ZHName: "NVIDIA", ENName: "NVIDIA", VendorIcon: "Nvidia.Color", ModelIcon: "Nvidia.Color", Aliases: []string{"nvidia"}},
	{Key: "amazon", ZHName: "Amazon", ENName: "Amazon", VendorIcon: "Aws.Color", ModelIcon: "Aws.Color", Aliases: []string{"amazon", "aws", "bedrock"}},
}

var (
	canonicalVendorByKey   map[string]canonicalVendorSpec
	canonicalVendorByAlias map[string]canonicalVendorSpec
)

func init() {
	canonicalVendorByKey = make(map[string]canonicalVendorSpec, len(canonicalVendors))
	canonicalVendorByAlias = make(map[string]canonicalVendorSpec, len(canonicalVendors)*4)
	for _, spec := range canonicalVendors {
		canonicalVendorByKey[spec.Key] = spec
		canonicalVendorByAlias[strings.ToLower(spec.Key)] = spec
		canonicalVendorByAlias[strings.ToLower(spec.ZHName)] = spec
		canonicalVendorByAlias[strings.ToLower(spec.ENName)] = spec
		for _, alias := range spec.Aliases {
			canonicalVendorByAlias[strings.ToLower(alias)] = spec
		}
	}
}

var lobeHubFirstPartyProviders = map[string]string{
	"openai":     "openai",
	"anthropic":  "anthropic",
	"google":     "google",
	"deepseek":   "deepseek",
	"zhipu":      "zhipu",
	"moonshot":   "moonshot",
	"xai":        "xai",
	"qwen":       "alibaba",
	"volcengine": "bytedance",
	"minimax":    "minimax",
	"hunyuan":    "tencent",
	"mistral":    "mistral",
	"cohere":     "cohere",
	"perplexity": "perplexity",
	"stepfun":    "stepfun",
	"baichuan":   "baichuan",
	"zeroone":    "yi",
	"bfl":        "bfl",
	"elevenlabs": "elevenlabs",
	"wenxin":     "baidu",
	"xiaomi":     "xiaomi",
}

var modelsDevFirstPartyProviders = map[string]string{
	"openai":            "openai",
	"anthropic":         "anthropic",
	"google":            "google",
	"deepseek":          "deepseek",
	"zhipuai":           "zhipu",
	"zai":               "zhipu",
	"moonshotai":        "moonshot",
	"moonshotai-cn":     "moonshot",
	"xai":               "xai",
	"alibaba":           "alibaba",
	"alibaba-cn":        "alibaba",
	"volcengine":        "bytedance",
	"byteplus":          "bytedance",
	"minimax":           "minimax",
	"minimax-cn":        "minimax",
	"mistral":           "mistral",
	"cohere":            "cohere",
	"perplexity":        "perplexity",
	"meta":              "meta",
	"stepfun":           "stepfun",
	"stepfun-ai":        "stepfun",
	"black-forest-labs": "bfl",
	"xiaomi":            "xiaomi",
	"baidu":             "baidu",
	"tencent":           "tencent",
	"baichuan":          "baichuan",
	"01-ai":             "yi",
}

var openRouterFirstPartyPrefixes = map[string]string{
	"openai":            "openai",
	"anthropic":         "anthropic",
	"google":            "google",
	"deepseek":          "deepseek",
	"z-ai":              "zhipu",
	"moonshotai":        "moonshot",
	"x-ai":              "xai",
	"qwen":              "alibaba",
	"bytedance":         "bytedance",
	"bytedance-seed":    "bytedance",
	"minimax":           "minimax",
	"tencent":           "tencent",
	"mistralai":         "mistral",
	"cohere":            "cohere",
	"meta":              "meta",
	"meta-llama":        "meta",
	"perplexity":        "perplexity",
	"stepfun":           "stepfun",
	"baichuan":          "baichuan",
	"01-ai":             "yi",
	"black-forest-labs": "bfl",
	"baidu":             "baidu",
	"xiaomi":            "xiaomi",
	"nvidia":            "nvidia",
	"amazon":            "amazon",
}

var resellerVendorNames = map[string]bool{
	"tencent tokenhub": true,
	"aihubmix":         true,
	"openrouter":       true,
	"siliconcloud":     true,
	"siliconflow":      true,
	"cheapllm":         true,
	"powerspring":      true,
	"newapi":           true,
	"302.ai":           true,
	"zenmux":           true,
}

func normalizeMetadataSource(raw string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", metadataSourceOfficial, "basellm":
		return metadataSourceOfficial, true
	case metadataSourceMerged:
		return metadataSourceMerged, true
	case metadataSourceLobeHub, "model-bank":
		return metadataSourceLobeHub, true
	case metadataSourceOpenRouter:
		return metadataSourceOpenRouter, true
	case metadataSourceModelsDev, "models.dev":
		return metadataSourceModelsDev, true
	default:
		return "", false
	}
}

func inferFirstPartyKeyByModelName(modelName string) string {
	lower := strings.ToLower(strings.TrimSpace(modelName))
	if idx := strings.LastIndex(lower, "/"); idx >= 0 {
		lower = lower[idx+1:]
	}
	switch {
	case strings.HasPrefix(lower, "gpt-"),
		strings.HasPrefix(lower, "chatgpt-"),
		strings.HasPrefix(lower, "dall-e"),
		strings.HasPrefix(lower, "whisper"),
		strings.HasPrefix(lower, "tts-"),
		strings.HasPrefix(lower, "text-embedding-"),
		strings.HasPrefix(lower, "sora"),
		strings.HasPrefix(lower, "o1"),
		strings.HasPrefix(lower, "o3"),
		strings.HasPrefix(lower, "o4"):
		return "openai"
	case strings.HasPrefix(lower, "claude-"):
		return "anthropic"
	case strings.HasPrefix(lower, "gemini-"),
		strings.HasPrefix(lower, "gemma-"),
		strings.HasPrefix(lower, "imagen-"),
		strings.HasPrefix(lower, "veo-"):
		return "google"
	case strings.HasPrefix(lower, "deepseek-"):
		return "deepseek"
	case strings.HasPrefix(lower, "glm-"),
		strings.HasPrefix(lower, "cogview"),
		strings.HasPrefix(lower, "cogvideo"),
		strings.HasPrefix(lower, "characterglm"),
		strings.HasPrefix(lower, "codegeex"):
		return "zhipu"
	case strings.HasPrefix(lower, "kimi-"),
		strings.HasPrefix(lower, "moonshot-"):
		return "moonshot"
	case strings.HasPrefix(lower, "grok-"):
		return "xai"
	case strings.HasPrefix(lower, "qwen"),
		strings.HasPrefix(lower, "qwq"),
		strings.HasPrefix(lower, "qvq"),
		strings.HasPrefix(lower, "wanx"),
		strings.HasPrefix(lower, "wan2"),
		strings.HasPrefix(lower, "wan-"):
		return "alibaba"
	case strings.HasPrefix(lower, "doubao-"),
		strings.HasPrefix(lower, "seed-"),
		strings.HasPrefix(lower, "seedance"),
		strings.HasPrefix(lower, "seedream"):
		return "bytedance"
	case strings.HasPrefix(lower, "minimax-"),
		strings.HasPrefix(lower, "abab"),
		strings.HasPrefix(lower, "speech-0"),
		strings.HasPrefix(lower, "speech-2"):
		return "minimax"
	case strings.HasPrefix(lower, "hunyuan-"):
		return "tencent"
	case strings.HasPrefix(lower, "mistral-"),
		strings.HasPrefix(lower, "mixtral-"),
		strings.HasPrefix(lower, "codestral"),
		strings.HasPrefix(lower, "pixtral"),
		strings.HasPrefix(lower, "ministral"),
		strings.HasPrefix(lower, "magistral"):
		return "mistral"
	case strings.HasPrefix(lower, "command-"):
		return "cohere"
	case strings.HasPrefix(lower, "llama-"),
		strings.HasPrefix(lower, "llama3"),
		strings.HasPrefix(lower, "llama4"),
		strings.HasPrefix(lower, "muse-"):
		return "meta"
	case strings.HasPrefix(lower, "sonar"):
		return "perplexity"
	case strings.HasPrefix(lower, "step-"):
		return "stepfun"
	case strings.HasPrefix(lower, "baichuan"):
		return "baichuan"
	case strings.HasPrefix(lower, "yi-"):
		return "yi"
	case strings.HasPrefix(lower, "flux-"),
		strings.HasPrefix(lower, "flux."):
		return "bfl"
	case strings.HasPrefix(lower, "ernie-"):
		return "baidu"
	case strings.HasPrefix(lower, "mimo-"):
		return "xiaomi"
	case strings.HasPrefix(lower, "nemotron"):
		return "nvidia"
	case strings.HasPrefix(lower, "nova-"),
		strings.HasPrefix(lower, "titan-"):
		return "amazon"
	default:
		return ""
	}
}

func canonicalModelKey(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

func isNoiseCatalogModelID(id string) bool {
	trimmed := strings.TrimSpace(id)
	if trimmed == "" || len(trimmed) > 128 || strings.ContainsAny(trimmed, " \t\r\n") {
		return true
	}
	if strings.HasPrefix(trimmed, "~") || strings.Contains(trimmed, ":") {
		return true
	}
	lower := strings.ToLower(trimmed)
	if lower == "auto" || lower == "free" || strings.HasPrefix(lower, "openrouter/") {
		return true
	}
	if strings.HasPrefix(lower, "fw-") || strings.HasPrefix(lower, "umans-") || strings.HasPrefix(lower, "abliteration-") {
		return true
	}
	return strings.Contains(lower, "-abliterated") ||
		strings.Contains(lower, "-uncensored") ||
		strings.HasSuffix(lower, "-maas") ||
		strings.HasSuffix(lower, "-exacto") ||
		strings.HasSuffix(lower, "-nitro")
}

func preferCanonicalModelName(existing, candidate string, existingScore, candidateScore int) string {
	existing = strings.TrimSpace(existing)
	candidate = strings.TrimSpace(candidate)
	if existing == "" {
		return candidate
	}
	if candidate == "" || existing == candidate {
		return existing
	}
	existingLower := existing == strings.ToLower(existing)
	candidateLower := candidate == strings.ToLower(candidate)
	if candidateLower && !existingLower {
		return candidate
	}
	if existingLower && !candidateLower {
		return existing
	}
	if candidateScore > existingScore {
		return candidate
	}
	if existingScore > candidateScore {
		return existing
	}
	if candidate < existing {
		return candidate
	}
	return existing
}

func mergeExternalModelRecord(existing, incoming externalModelRecord) externalModelRecord {
	primary, secondary := existing, incoming
	if incoming.FirstPartyScore > existing.FirstPartyScore ||
		(incoming.FirstPartyScore == existing.FirstPartyScore && existing.ProviderKey == "" && incoming.ProviderKey != "") {
		primary, secondary = incoming, existing
	}
	merged := primary
	merged.ID = preferCanonicalModelName(existing.ID, incoming.ID, existing.FirstPartyScore, incoming.FirstPartyScore)
	if merged.ProviderKey == "" {
		merged.ProviderKey = secondary.ProviderKey
	}
	if merged.RawVendor == "" || isResellerVendor(merged.RawVendor) {
		if secondary.RawVendor != "" && !isResellerVendor(secondary.RawVendor) {
			merged.RawVendor = secondary.RawVendor
		}
	}
	if strings.TrimSpace(merged.Description) == "" {
		merged.Description = secondary.Description
	}
	if merged.Type == "" || (merged.Type == "chat" && secondary.Type != "" && secondary.Type != "chat") {
		merged.Type = secondary.Type
	}
	if secondary.ContextWindow > merged.ContextWindow {
		merged.ContextWindow = secondary.ContextWindow
	}
	merged.Reasoning = merged.Reasoning || secondary.Reasoning
	merged.Vision = merged.Vision || secondary.Vision
	merged.Tools = merged.Tools || secondary.Tools
	merged.Files = merged.Files || secondary.Files
	merged.Search = merged.Search || secondary.Search
	merged.AudioInput = merged.AudioInput || secondary.AudioInput
	merged.VideoInput = merged.VideoInput || secondary.VideoInput
	merged.OpenWeights = merged.OpenWeights || secondary.OpenWeights
	if secondary.FirstPartyScore > merged.FirstPartyScore {
		merged.FirstPartyScore = secondary.FirstPartyScore
	}
	return merged
}

func putExternalRecordByLower(byLower map[string]externalModelRecord, rec externalModelRecord) {
	key := canonicalModelKey(rec.ID)
	if key == "" {
		return
	}
	if existing, exists := byLower[key]; exists {
		byLower[key] = mergeExternalModelRecord(existing, rec)
		return
	}
	byLower[key] = rec
}

func materializeExternalRecords(byLower map[string]externalModelRecord) map[string]externalModelRecord {
	records := make(map[string]externalModelRecord, len(byLower))
	for _, rec := range byLower {
		records[rec.ID] = rec
	}
	return records
}

func resolveCanonicalVendor(providerKey, locale string, localVendors map[string]*model.Vendor) (string, model.Vendor, string, bool) {
	spec, ok := canonicalVendorByKey[providerKey]
	if !ok {
		return "", model.Vendor{}, "", false
	}
	name := spec.ENName
	if locale == "zh" && spec.ZHName != "" {
		name = spec.ZHName
	}
	if len(localVendors) > 0 {
		candidates := append([]string{name, spec.ZHName, spec.ENName}, spec.Aliases...)
		for _, alias := range candidates {
			if existing := model.FindMetadataVendor(localVendors, alias); existing != nil {
				name = existing.Name
				break
			}
		}
	}
	vendor := model.Vendor{
		Name:   name,
		Icon:   spec.VendorIcon,
		Status: 1,
	}
	return name, vendor, spec.ModelIcon, true
}

func isResellerVendor(vendorName string) bool {
	lower := strings.ToLower(strings.TrimSpace(vendorName))
	if lower == "" {
		return false
	}
	if resellerVendorNames[lower] {
		return true
	}
	return strings.Contains(lower, "tokenhub") ||
		strings.Contains(lower, "coding plan") ||
		strings.Contains(lower, "token plan")
}

type externalModelRecord struct {
	ID              string
	ProviderKey     string
	RawVendor       string
	Description     string
	Type            string
	ContextWindow   int
	Reasoning       bool
	Vision          bool
	Tools           bool
	Files           bool
	Search          bool
	VideoInput      bool
	AudioInput      bool
	OpenWeights     bool
	FirstPartyScore int
}

type externalCacheEntry struct {
	fetchedAt time.Time
	url       string
	records   map[string]externalModelRecord
}

var (
	externalCacheMu sync.RWMutex
	externalCache   = make(map[string]externalCacheEntry)
)

func getExternalCacheTTL() time.Duration {
	seconds := common.GetEnvOrDefault("SYNC_SOURCE_CACHE_TTL_SECONDS", 300)
	if seconds <= 0 {
		return 0
	}
	return time.Duration(seconds) * time.Second
}

func readExternalCache(cacheKey string) (externalCacheEntry, bool) {
	ttl := getExternalCacheTTL()
	if ttl <= 0 {
		return externalCacheEntry{}, false
	}
	externalCacheMu.RLock()
	entry, ok := externalCache[cacheKey]
	externalCacheMu.RUnlock()
	if !ok || time.Since(entry.fetchedAt) > ttl {
		return externalCacheEntry{}, false
	}
	return entry, true
}

func writeExternalCache(cacheKey string, entry externalCacheEntry) {
	if getExternalCacheTTL() <= 0 {
		return
	}
	externalCacheMu.Lock()
	externalCache[cacheKey] = entry
	externalCacheMu.Unlock()
}

func fetchRawBytes(ctx context.Context, url string, maxBytes int64) ([]byte, error) {
	attempts := max(common.GetEnvOrDefault("SYNC_HTTP_RETRY", 2), 1)
	var lastErr error
	for attempt := 0; attempt < attempts; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", "MagiRouter-MetadataSync/1.0")
		resp, err := getHTTPClient().Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		buf, readErr := func() ([]byte, error) {
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
			}
			limited := io.LimitReader(resp.Body, maxBytes+1)
			data, err := io.ReadAll(limited)
			if err != nil {
				return nil, err
			}
			if int64(len(data)) > maxBytes {
				return nil, errors.New("upstream payload exceeds size limit")
			}
			return data, nil
		}()
		if readErr == nil {
			return buf, nil
		}
		lastErr = readErr
	}
	return nil, lastErr
}

func getLobeHubSourceURLs() (tarballURL, registryURL string) {
	tarballURL = strings.TrimSpace(common.GetEnvOrDefaultString("SYNC_LOBEHUB_TARBALL_URL", ""))
	registryURL = strings.TrimSpace(common.GetEnvOrDefaultString("SYNC_LOBEHUB_REGISTRY_URL", defaultLobeHubRegistryURL))
	return tarballURL, registryURL
}

func fetchLobeHubCatalog(ctx context.Context) (string, map[string]externalModelRecord, error) {
	tarballURL, registryURL := getLobeHubSourceURLs()
	cacheKey := "lobehub:" + tarballURL + "|" + registryURL
	if cached, ok := readExternalCache(cacheKey); ok {
		return cached.url, cached.records, nil
	}

	resolvedTarball := tarballURL
	if resolvedTarball == "" {
		metaBytes, err := fetchRawBytes(ctx, registryURL, 2<<20)
		if err != nil {
			return registryURL, nil, fmt.Errorf("fetch model-bank registry: %w", err)
		}
		var pkg struct {
			Dist struct {
				Tarball string `json:"tarball"`
			} `json:"dist"`
		}
		if err := common.Unmarshal(metaBytes, &pkg); err != nil || strings.TrimSpace(pkg.Dist.Tarball) == "" {
			return registryURL, nil, errors.New("invalid model-bank registry response")
		}
		resolvedTarball = pkg.Dist.Tarball
	}

	tgzBytes, err := fetchRawBytes(ctx, resolvedTarball, maxLobeHubTarballBytes)
	if err != nil {
		return resolvedTarball, nil, fmt.Errorf("fetch model-bank tarball: %w", err)
	}
	records, err := parseLobeHubTarball(tgzBytes)
	if err != nil {
		return resolvedTarball, nil, err
	}
	writeExternalCache(cacheKey, externalCacheEntry{
		fetchedAt: time.Now(),
		url:       resolvedTarball,
		records:   records,
	})
	return resolvedTarball, records, nil
}

func matchLobeHubFirstPartyFile(entryPath string) (string, bool) {
	clean := path.Clean(strings.TrimPrefix(entryPath, "./"))
	if !strings.HasSuffix(clean, ".mjs") || strings.HasSuffix(clean, ".test.mjs") {
		return "", false
	}
	base := path.Base(clean)
	stem := strings.TrimSuffix(base, ".mjs")
	if strings.HasPrefix(clean, "package/dist/aiModels/") {
		if canonical, ok := lobeHubFirstPartyProviders[stem]; ok {
			return canonical, true
		}
		return "", false
	}
	if strings.HasPrefix(clean, "package/dist/") && !strings.Contains(strings.TrimPrefix(clean, "package/dist/"), "/") {
		if idx := strings.Index(stem, "-"); idx > 0 {
			prefix := stem[:idx]
			if canonical, ok := lobeHubFirstPartyProviders[prefix]; ok {
				return canonical, true
			}
		}
	}
	return "", false
}

func parseLobeHubTarball(tgzBytes []byte) (map[string]externalModelRecord, error) {
	gzReader, err := gzip.NewReader(bytes.NewReader(tgzBytes))
	if err != nil {
		return nil, fmt.Errorf("decompress model-bank tarball: %w", err)
	}
	defer gzReader.Close()

	tarReader := tar.NewReader(gzReader)
	byLower := make(map[string]externalModelRecord)
	for {
		hdr, err := tarReader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read model-bank tarball: %w", err)
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		providerKey, ok := matchLobeHubFirstPartyFile(hdr.Name)
		if !ok {
			continue
		}
		content, err := io.ReadAll(io.LimitReader(tarReader, maxLobeHubModuleBytes))
		if err != nil {
			return nil, err
		}
		for _, item := range extractLobeHubModelsFromJS(string(content), providerKey) {
			if isNoiseCatalogModelID(item.ID) {
				continue
			}
			putExternalRecordByLower(byLower, item)
		}
	}
	if len(byLower) == 0 {
		return nil, errors.New("no models parsed from model-bank tarball")
	}
	return materializeExternalRecords(byLower), nil
}

type jsTokKind int

const (
	jsTokEOF jsTokKind = iota
	jsTokPunct
	jsTokIdent
	jsTokString
	jsTokNumber
)

type jsTok struct {
	kind jsTokKind
	val  string
}

func tokenizeJS(src string) []jsTok {
	tokens := make([]jsTok, 0, len(src)/8)
	n := len(src)
	i := 0
	for i < n {
		ch := src[i]
		if ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n' {
			i++
			continue
		}
		if ch == '/' && i+1 < n && src[i+1] == '/' {
			i += 2
			for i < n && src[i] != '\n' {
				i++
			}
			continue
		}
		if ch == '/' && i+1 < n && src[i+1] == '*' {
			i += 2
			for i+1 < n && !(src[i] == '*' && src[i+1] == '/') {
				i++
			}
			i += 2
			continue
		}
		if ch == '"' || ch == '\'' || ch == '`' {
			quote := ch
			i++
			var sb strings.Builder
			for i < n && src[i] != quote {
				if src[i] == '\\' && i+1 < n {
					i++
					switch src[i] {
					case 'n':
						sb.WriteByte('\n')
					case 'r':
						sb.WriteByte('\r')
					case 't':
						sb.WriteByte('\t')
					case '\\', '"', '\'', '`':
						sb.WriteByte(src[i])
					case 'u':
						if i+4 < n {
							if code, err := strconv.ParseInt(src[i+1:i+5], 16, 32); err == nil {
								sb.WriteRune(rune(code))
								i += 4
							}
						}
					default:
						sb.WriteByte(src[i])
					}
					i++
					continue
				}
				sb.WriteByte(src[i])
				i++
			}
			if i < n {
				i++
			}
			tokens = append(tokens, jsTok{kind: jsTokString, val: sb.String()})
			continue
		}
		if (ch >= '0' && ch <= '9') || (ch == '.' && i+1 < n && src[i+1] >= '0' && src[i+1] <= '9') {
			start := i
			for i < n {
				c := src[i]
				if (c >= '0' && c <= '9') || c == '.' || c == '_' || c == 'e' || c == 'E' || ((c == '+' || c == '-') && i > start && (src[i-1] == 'e' || src[i-1] == 'E')) {
					i++
					continue
				}
				break
			}
			tokens = append(tokens, jsTok{kind: jsTokNumber, val: src[start:i]})
			continue
		}
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch == '_' || ch == '$' {
			start := i
			for i < n {
				c := src[i]
				if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '$' {
					i++
					continue
				}
				break
			}
			tokens = append(tokens, jsTok{kind: jsTokIdent, val: src[start:i]})
			continue
		}
		tokens = append(tokens, jsTok{kind: jsTokPunct, val: src[i : i+1]})
		i++
	}
	return tokens
}

func skipJSBalanced(tokens []jsTok, pos int) int {
	if pos >= len(tokens) {
		return pos
	}
	open := tokens[pos].val
	closeCh := "}"
	if open == "[" {
		closeCh = "]"
	} else if open == "(" {
		closeCh = ")"
	}
	depth := 1
	pos++
	for pos < len(tokens) && depth > 0 {
		if tokens[pos].kind == jsTokPunct {
			if tokens[pos].val == open {
				depth++
			} else if tokens[pos].val == closeCh {
				depth--
			}
		}
		pos++
	}
	return pos
}

func skipJSValue(tokens []jsTok, pos int) int {
	for pos < len(tokens) {
		tok := tokens[pos]
		if tok.kind == jsTokPunct {
			switch tok.val {
			case "{", "[", "(":
				pos = skipJSBalanced(tokens, pos)
				continue
			case ",", "}", "]":
				return pos
			}
		}
		pos++
	}
	return pos
}

func parseJSInt(raw string) int {
	clean := strings.ReplaceAll(raw, "_", "")
	f, err := strconv.ParseFloat(clean, 64)
	if err != nil || math.IsNaN(f) || math.IsInf(f, 0) || f < 0 {
		return 0
	}
	return int(math.Round(f))
}

func parseJSAbilitiesObject(tokens []jsTok, pos int, rec *externalModelRecord) int {
	if pos >= len(tokens) || tokens[pos].kind != jsTokPunct || tokens[pos].val != "{" {
		return skipJSValue(tokens, pos)
	}
	pos++
	for pos < len(tokens) {
		if tokens[pos].kind == jsTokPunct && tokens[pos].val == "}" {
			return pos + 1
		}
		if tokens[pos].kind == jsTokPunct && tokens[pos].val == "," {
			pos++
			continue
		}
		key := ""
		if tokens[pos].kind == jsTokIdent || tokens[pos].kind == jsTokString {
			key = tokens[pos].val
			pos++
		} else {
			pos++
			continue
		}
		if pos >= len(tokens) || tokens[pos].kind != jsTokPunct || tokens[pos].val != ":" {
			pos = skipJSValue(tokens, pos)
			continue
		}
		pos++
		valBool := pos < len(tokens) && tokens[pos].kind == jsTokIdent && tokens[pos].val == "true"
		switch key {
		case "reasoning":
			rec.Reasoning = valBool
		case "vision":
			rec.Vision = valBool
		case "functionCall":
			rec.Tools = valBool
		case "files":
			rec.Files = valBool
		case "search":
			rec.Search = valBool
		case "video":
			rec.VideoInput = valBool
		case "imageOutput":
			if valBool && rec.Type == "" {
				rec.Type = "image"
			}
		}
		pos = skipJSValue(tokens, pos)
	}
	return pos
}

func extractLobeHubModelsFromJS(src, providerKey string) []externalModelRecord {
	tokens := tokenizeJS(src)
	var out []externalModelRecord
	n := len(tokens)
	for i := 0; i < n; i++ {
		if tokens[i].kind != jsTokPunct || tokens[i].val != "{" {
			continue
		}
		rec := externalModelRecord{
			ProviderKey:     providerKey,
			FirstPartyScore: 3,
		}
		hasCardSignal := false
		pos := i + 1
		for pos < n {
			if tokens[pos].kind == jsTokPunct && tokens[pos].val == "}" {
				break
			}
			if tokens[pos].kind == jsTokPunct && tokens[pos].val == "," {
				pos++
				continue
			}
			if tokens[pos].kind == jsTokPunct && tokens[pos].val == "." {
				pos = skipJSValue(tokens, pos)
				continue
			}
			if tokens[pos].kind != jsTokIdent && tokens[pos].kind != jsTokString {
				pos = skipJSValue(tokens, pos)
				continue
			}
			key := tokens[pos].val
			pos++
			if pos >= n || tokens[pos].kind != jsTokPunct || tokens[pos].val != ":" {
				pos = skipJSValue(tokens, pos)
				continue
			}
			pos++
			if pos >= n {
				break
			}
			switch key {
			case "id":
				if tokens[pos].kind == jsTokString {
					rec.ID = strings.TrimSpace(tokens[pos].val)
				}
				pos = skipJSValue(tokens, pos)
			case "description":
				if tokens[pos].kind == jsTokString {
					rec.Description = strings.TrimSpace(tokens[pos].val)
					hasCardSignal = true
				}
				pos = skipJSValue(tokens, pos)
			case "displayName":
				if tokens[pos].kind == jsTokString {
					hasCardSignal = true
				}
				pos = skipJSValue(tokens, pos)
			case "type":
				if tokens[pos].kind == jsTokString {
					rec.Type = strings.ToLower(strings.TrimSpace(tokens[pos].val))
					hasCardSignal = true
				}
				pos = skipJSValue(tokens, pos)
			case "contextWindowTokens":
				if tokens[pos].kind == jsTokNumber {
					rec.ContextWindow = parseJSInt(tokens[pos].val)
					hasCardSignal = true
				}
				pos = skipJSValue(tokens, pos)
			case "releasedAt":
				if tokens[pos].kind == jsTokString {
					hasCardSignal = true
				}
				pos = skipJSValue(tokens, pos)
			case "abilities":
				hasCardSignal = true
				pos = parseJSAbilitiesObject(tokens, pos, &rec)
			default:
				pos = skipJSValue(tokens, pos)
			}
		}
		if rec.ID != "" && hasCardSignal {
			if rec.Type == "" {
				rec.Type = "chat"
			}
			if inferred := inferFirstPartyKeyByModelName(rec.ID); inferred != "" {
				rec.ProviderKey = inferred
			}
			out = append(out, rec)
			i = pos
		}
	}
	return out
}

func fetchOpenRouterCatalog(ctx context.Context) (string, map[string]externalModelRecord, error) {
	url := strings.TrimSpace(common.GetEnvOrDefaultString("SYNC_OPENROUTER_MODELS_URL", defaultOpenRouterURL))
	cacheKey := "openrouter:" + url
	if cached, ok := readExternalCache(cacheKey); ok {
		return cached.url, cached.records, nil
	}

	raw, err := fetchRawBytes(ctx, url, 10<<20)
	if err != nil {
		return url, nil, fmt.Errorf("fetch openrouter models: %w", err)
	}
	var payload struct {
		Data []struct {
			ID                  string   `json:"id"`
			Name                string   `json:"name"`
			Description         string   `json:"description"`
			ContextLength       int      `json:"context_length"`
			SupportedParameters []string `json:"supported_parameters"`
			Architecture        struct {
				InputModalities  []string `json:"input_modalities"`
				OutputModalities []string `json:"output_modalities"`
			} `json:"architecture"`
		} `json:"data"`
	}
	if err := common.Unmarshal(raw, &payload); err != nil {
		return url, nil, fmt.Errorf("decode openrouter models: %w", err)
	}
	byLower := make(map[string]externalModelRecord, len(payload.Data))
	for _, item := range payload.Data {
		id := strings.TrimSpace(item.ID)
		if id == "" || strings.Contains(id, ":") || strings.HasPrefix(id, "~") {
			continue
		}
		prefix, shortID, hasSlash := strings.Cut(id, "/")
		if !hasSlash || shortID == "" {
			shortID = id
			prefix = ""
		}
		if strings.EqualFold(prefix, "openrouter") || strings.HasPrefix(prefix, "~") || isNoiseCatalogModelID(shortID) {
			continue
		}
		providerKey := openRouterFirstPartyPrefixes[strings.ToLower(prefix)]
		if inferred := inferFirstPartyKeyByModelName(shortID); inferred != "" {
			providerKey = inferred
		}
		rec := externalModelRecord{
			ID:              shortID,
			ProviderKey:     providerKey,
			RawVendor:       prefix,
			Description:     strings.TrimSpace(item.Description),
			Type:            "chat",
			ContextWindow:   item.ContextLength,
			FirstPartyScore: 2,
		}
		for _, mod := range item.Architecture.InputModalities {
			switch strings.ToLower(mod) {
			case "image":
				rec.Vision = true
			case "file":
				rec.Files = true
			case "audio":
				rec.AudioInput = true
			case "video":
				rec.VideoInput = true
			}
		}
		for _, mod := range item.Architecture.OutputModalities {
			if strings.EqualFold(mod, "image") && !containsFold(item.Architecture.OutputModalities, "text") {
				rec.Type = "image"
			}
		}
		for _, param := range item.SupportedParameters {
			switch strings.ToLower(param) {
			case "reasoning", "include_reasoning":
				rec.Reasoning = true
			case "tools", "tool_choice":
				rec.Tools = true
			}
		}
		if len(shortID) <= 128 {
			putExternalRecordByLower(byLower, rec)
		}
		if strings.HasPrefix(strings.ToLower(shortID), "claude-") && strings.Contains(shortID, ".") {
			dashed := strings.ReplaceAll(shortID, ".", "-")
			if len(dashed) <= 128 {
				aliasRec := rec
				aliasRec.ID = dashed
				putExternalRecordByLower(byLower, aliasRec)
			}
		}
	}
	if len(byLower) == 0 {
		return url, nil, errors.New("empty openrouter models response")
	}
	records := materializeExternalRecords(byLower)
	writeExternalCache(cacheKey, externalCacheEntry{
		fetchedAt: time.Now(),
		url:       url,
		records:   records,
	})
	return url, records, nil
}

func fetchModelsDevCatalog(ctx context.Context) (string, map[string]externalModelRecord, error) {
	url := strings.TrimSpace(common.GetEnvOrDefaultString("SYNC_MODELS_DEV_URL", defaultModelsDevURL))
	cacheKey := "models_dev:" + url
	if cached, ok := readExternalCache(cacheKey); ok {
		return cached.url, cached.records, nil
	}

	raw, err := fetchRawBytes(ctx, url, 16<<20)
	if err != nil {
		return url, nil, fmt.Errorf("fetch models.dev catalog: %w", err)
	}
	var providers map[string]struct {
		Name   string `json:"name"`
		Models map[string]struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			Description string `json:"description"`
			Attachment  bool   `json:"attachment"`
			Reasoning   bool   `json:"reasoning"`
			ToolCall    bool   `json:"tool_call"`
			OpenWeights bool   `json:"open_weights"`
			Modalities  struct {
				Input  []string `json:"input"`
				Output []string `json:"output"`
			} `json:"modalities"`
			Limit struct {
				Context int `json:"context"`
			} `json:"limit"`
		} `json:"models"`
	}
	if err := common.Unmarshal(raw, &providers); err != nil {
		return url, nil, fmt.Errorf("decode models.dev catalog: %w", err)
	}

	providerKeys := make([]string, 0, len(providers))
	for key := range providers {
		providerKeys = append(providerKeys, key)
	}
	sort.Strings(providerKeys)

	byLower := make(map[string]externalModelRecord)
	for _, pKey := range providerKeys {
		pData := providers[pKey]
		canonicalKey, isFirstParty := modelsDevFirstPartyProviders[strings.ToLower(pKey)]
		if !isFirstParty {
			continue
		}
		modelKeys := make([]string, 0, len(pData.Models))
		for mKey := range pData.Models {
			modelKeys = append(modelKeys, mKey)
		}
		sort.Strings(modelKeys)
		for _, mKey := range modelKeys {
			m := pData.Models[mKey]
			rawID := strings.TrimSpace(m.ID)
			if rawID == "" {
				rawID = strings.TrimSpace(mKey)
			}
			if isNoiseCatalogModelID(rawID) {
				continue
			}
			shortID := rawID
			hasSlash := false
			if idx := strings.LastIndex(shortID, "/"); idx >= 0 {
				hasSlash = true
				shortID = shortID[idx+1:]
			}
			if isNoiseCatalogModelID(shortID) {
				continue
			}
			resolvedProvider := canonicalKey
			modelScore := 2
			inferred := inferFirstPartyKeyByModelName(shortID)
			if hasSlash && inferred == "" {
				continue
			}
			if inferred != "" {
				resolvedProvider = inferred
				if canonicalKey == inferred {
					modelScore = 3
				}
			}
			rec := externalModelRecord{
				ID:              shortID,
				ProviderKey:     resolvedProvider,
				RawVendor:       strings.TrimSpace(pData.Name),
				Description:     strings.TrimSpace(m.Description),
				Type:            "chat",
				ContextWindow:   m.Limit.Context,
				Reasoning:       m.Reasoning,
				Tools:           m.ToolCall,
				Files:           m.Attachment,
				OpenWeights:     m.OpenWeights,
				FirstPartyScore: modelScore,
			}
			for _, mod := range m.Modalities.Input {
				switch strings.ToLower(mod) {
				case "image":
					rec.Vision = true
				case "pdf", "file":
					rec.Files = true
				case "audio":
					rec.AudioInput = true
				case "video":
					rec.VideoInput = true
				}
			}
			if containsFold(m.Modalities.Output, "image") && !containsFold(m.Modalities.Output, "text") {
				rec.Type = "image"
			} else if containsFold(m.Modalities.Output, "video") && !containsFold(m.Modalities.Output, "text") {
				rec.Type = "video"
			} else if containsFold(m.Modalities.Output, "audio") && !containsFold(m.Modalities.Output, "text") {
				rec.Type = "tts"
			}
			putExternalRecordByLower(byLower, rec)
		}
	}
	if len(byLower) == 0 {
		return url, nil, errors.New("empty models.dev catalog")
	}
	records := materializeExternalRecords(byLower)
	writeExternalCache(cacheKey, externalCacheEntry{
		fetchedAt: time.Now(),
		url:       url,
		records:   records,
	})
	return url, records, nil
}

func containsFold(items []string, target string) bool {
	for _, item := range items {
		if strings.EqualFold(strings.TrimSpace(item), target) {
			return true
		}
	}
	return false
}

func formatContextBadge(tokens int) string {
	if tokens <= 0 {
		return ""
	}
	if tokens >= 1_000_000 {
		millions := float64(tokens) / 1_000_000.0
		rounded := math.Round(millions*10) / 10
		if math.Abs(rounded-math.Round(rounded)) < 0.05 {
			return fmt.Sprintf("%dM", int(math.Round(rounded)))
		}
		return fmt.Sprintf("%.1fM", rounded)
	}
	if tokens >= 1000 {
		k := int(math.Round(float64(tokens) / 1000.0))
		return fmt.Sprintf("%dK", k)
	}
	return ""
}

func localizedTag(key, locale string) string {
	if locale == "zh" {
		switch key {
		case "image":
			return "图片生成"
		case "video":
			return "视频生成"
		case "tts":
			return "语音合成"
		case "stt":
			return "语音识别"
		case "embedding":
			return "向量"
		case "reasoning":
			return "推理"
		case "tools":
			return "工具"
		case "files":
			return "文件"
		case "vision":
			return "多模态"
		case "search":
			return "联网"
		case "audio":
			return "音频"
		case "open_weights":
			return "开源权重"
		}
	}
	if locale == "ja" {
		switch key {
		case "image":
			return "画像生成"
		case "video":
			return "動画生成"
		case "tts":
			return "音声合成"
		case "stt":
			return "音声認識"
		case "embedding":
			return "埋め込み"
		case "reasoning":
			return "推論"
		case "tools":
			return "ツール"
		case "files":
			return "ファイル"
		case "vision":
			return "マルチモーダル"
		case "search":
			return "検索"
		case "audio":
			return "音声"
		case "open_weights":
			return "オープンウェイト"
		}
	}
	switch key {
	case "image":
		return "Image Gen"
	case "video":
		return "Video Gen"
	case "tts":
		return "TTS"
	case "stt":
		return "STT"
	case "embedding":
		return "Embedding"
	case "reasoning":
		return "Reasoning"
	case "tools":
		return "Tools"
	case "files":
		return "Files"
	case "vision":
		return "Multimodal"
	case "search":
		return "Search"
	case "audio":
		return "Audio"
	case "open_weights":
		return "Open Weights"
	default:
		return ""
	}
}

func appendUniqueTag(tags []string, seen map[string]bool, tag string) []string {
	trimmed := strings.TrimSpace(tag)
	if trimmed == "" {
		return tags
	}
	lower := strings.ToLower(trimmed)
	if seen[lower] {
		return tags
	}
	seen[lower] = true
	return append(tags, trimmed)
}

func joinBoundedTags(tags []string, maxRunes int) string {
	var sb strings.Builder
	for _, tag := range tags {
		addition := tag
		if sb.Len() > 0 {
			addition = "," + tag
		}
		if utf8.RuneCountInString(sb.String()+addition) > maxRunes {
			break
		}
		sb.WriteString(addition)
	}
	return sb.String()
}

func buildExternalTags(baseTags string, rec *externalModelRecord, locale string) string {
	var tags []string
	seen := make(map[string]bool)
	if baseTags != "" {
		for _, part := range strings.Split(baseTags, ",") {
			tags = appendUniqueTag(tags, seen, part)
		}
	}
	if rec != nil {
		switch rec.Type {
		case "image", "video", "tts", "stt", "embedding":
			tags = appendUniqueTag(tags, seen, localizedTag(rec.Type, locale))
		}
		if rec.Reasoning {
			tags = appendUniqueTag(tags, seen, localizedTag("reasoning", locale))
		}
		if rec.Tools {
			tags = appendUniqueTag(tags, seen, localizedTag("tools", locale))
		}
		if rec.Files {
			tags = appendUniqueTag(tags, seen, localizedTag("files", locale))
		}
		if rec.OpenWeights {
			tags = appendUniqueTag(tags, seen, localizedTag("open_weights", locale))
		}
		if rec.Vision {
			tags = appendUniqueTag(tags, seen, localizedTag("vision", locale))
		}
		if rec.Search {
			tags = appendUniqueTag(tags, seen, localizedTag("search", locale))
		}
		if rec.AudioInput {
			tags = appendUniqueTag(tags, seen, localizedTag("audio", locale))
		}
		if ctxBadge := formatContextBadge(rec.ContextWindow); ctxBadge != "" {
			hasCtxTag := false
			for _, existing := range tags {
				upper := strings.ToUpper(existing)
				if strings.HasSuffix(upper, "K") || strings.HasSuffix(upper, "M") {
					if _, err := strconv.ParseFloat(upper[:len(upper)-1], 64); err == nil {
						hasCtxTag = true
						break
					}
				}
			}
			if !hasCtxTag {
				tags = appendUniqueTag(tags, seen, ctxBadge)
			}
		}
	}
	return joinBoundedTags(tags, 200)
}

func convertExternalRecordsToCatalog(
	records map[string]externalModelRecord,
	locale string,
	localVendors map[string]*model.Vendor,
) (map[string]model.MetadataValues, map[string]model.Vendor) {
	models := make(map[string]model.MetadataValues, len(records))
	vendors := make(map[string]model.Vendor)

	for name, rec := range records {
		providerKey := rec.ProviderKey
		if inferred := inferFirstPartyKeyByModelName(name); inferred != "" {
			providerKey = inferred
		}
		vendorName := ""
		icon := ""
		if resolvedName, vendorObj, modelIcon, ok := resolveCanonicalVendor(providerKey, locale, localVendors); ok {
			vendorName = resolvedName
			icon = modelIcon
			vendors[resolvedName] = vendorObj
		} else if rec.RawVendor != "" && !isResellerVendor(rec.RawVendor) {
			vendorName = rec.RawVendor
			if _, exists := vendors[vendorName]; !exists {
				vendors[vendorName] = model.Vendor{Name: vendorName, Status: 1}
			}
		}
		values := model.MetadataValues{
			Description: rec.Description,
			Icon:        icon,
			Tags:        buildExternalTags("", &rec, locale),
			Vendor:      vendorName,
			Endpoints:   "",
			NameRule:    model.NameRuleExact,
			Status:      1,
		}
		if err := model.ValidateMetadataValues(values); err == nil {
			models[name] = values
		}
	}
	return models, vendors
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func mergeMultiSourceCatalogs(
	locale string,
	localVendors map[string]*model.Vendor,
	officialModels map[string]model.MetadataValues,
	officialVendors map[string]model.Vendor,
	lobeHub map[string]externalModelRecord,
	openRouter map[string]externalModelRecord,
	modelsDev map[string]externalModelRecord,
) (map[string]model.MetadataValues, map[string]model.Vendor) {
	type namedOfficial struct {
		name   string
		values model.MetadataValues
	}

	mergeOfficialPair := func(existing, incoming namedOfficial) namedOfficial {
		merged := existing
		merged.name = preferCanonicalModelName(existing.name, incoming.name, 1, 1)
		if strings.TrimSpace(merged.values.Description) == "" {
			merged.values.Description = incoming.values.Description
		}
		if strings.TrimSpace(merged.values.Icon) == "" {
			merged.values.Icon = incoming.values.Icon
		}
		if strings.TrimSpace(merged.values.Tags) == "" {
			merged.values.Tags = incoming.values.Tags
		}
		if strings.TrimSpace(merged.values.Vendor) == "" || isResellerVendor(merged.values.Vendor) {
			if strings.TrimSpace(incoming.values.Vendor) != "" && !isResellerVendor(incoming.values.Vendor) {
				merged.values.Vendor = incoming.values.Vendor
			}
		}
		if strings.TrimSpace(merged.values.Endpoints) == "" {
			merged.values.Endpoints = incoming.values.Endpoints
		}
		return merged
	}

	lhByLower := make(map[string]externalModelRecord, len(lobeHub))
	for name, rec := range lobeHub {
		if rec.ID == "" {
			rec.ID = name
		}
		putExternalRecordByLower(lhByLower, rec)
	}
	orByLower := make(map[string]externalModelRecord, len(openRouter))
	for name, rec := range openRouter {
		if rec.ID == "" {
			rec.ID = name
		}
		putExternalRecordByLower(orByLower, rec)
	}
	mdByLower := make(map[string]externalModelRecord, len(modelsDev))
	for name, rec := range modelsDev {
		if rec.ID == "" {
			rec.ID = name
		}
		putExternalRecordByLower(mdByLower, rec)
	}

	offByLower := make(map[string]namedOfficial, len(officialModels))
	offSlashed := make([]namedOfficial, 0)
	officialNames := make([]string, 0, len(officialModels))
	for name := range officialModels {
		officialNames = append(officialNames, name)
	}
	sort.Strings(officialNames)
	for _, name := range officialNames {
		if isNoiseCatalogModelID(name) {
			continue
		}
		entry := namedOfficial{name: strings.TrimSpace(name), values: officialModels[name]}
		if strings.Contains(entry.name, "/") {
			offSlashed = append(offSlashed, entry)
			continue
		}
		lower := canonicalModelKey(entry.name)
		if existing, exists := offByLower[lower]; exists {
			offByLower[lower] = mergeOfficialPair(existing, entry)
		} else {
			offByLower[lower] = entry
		}
	}
	for _, entry := range offSlashed {
		short := entry.name[strings.LastIndex(entry.name, "/")+1:]
		shortLower := canonicalModelKey(short)
		_, hasOffShort := offByLower[shortLower]
		_, hasLHShort := lhByLower[shortLower]
		_, hasORShort := orByLower[shortLower]
		_, hasMDShort := mdByLower[shortLower]
		if shortLower != "" && (hasOffShort || hasLHShort || hasORShort || hasMDShort) {
			folded := namedOfficial{name: short, values: entry.values}
			if existing, exists := offByLower[shortLower]; exists {
				offByLower[shortLower] = mergeOfficialPair(existing, folded)
			} else {
				offByLower[shortLower] = folded
			}
			continue
		}
		lower := canonicalModelKey(entry.name)
		if existing, exists := offByLower[lower]; exists {
			offByLower[lower] = mergeOfficialPair(existing, entry)
		} else {
			offByLower[lower] = entry
		}
	}

	allLower := make(map[string]struct{}, len(offByLower)+len(lhByLower)+len(orByLower)+len(mdByLower))
	for key := range offByLower {
		allLower[key] = struct{}{}
	}
	for key := range lhByLower {
		allLower[key] = struct{}{}
	}
	for key := range orByLower {
		allLower[key] = struct{}{}
	}
	for key := range mdByLower {
		allLower[key] = struct{}{}
	}

	mergedModels := make(map[string]model.MetadataValues, len(allLower))
	mergedVendors := make(map[string]model.Vendor)

	for lowerKey := range allLower {
		offEntry, hasOff := offByLower[lowerKey]
		off := offEntry.values
		lh, hasLH := lhByLower[lowerKey]
		orRec, hasOR := orByLower[lowerKey]
		md, hasMD := mdByLower[lowerKey]

		name := ""
		for _, candidate := range []string{lh.ID, orRec.ID, offEntry.name, md.ID} {
			trimmed := strings.TrimSpace(candidate)
			if trimmed != "" && trimmed == strings.ToLower(trimmed) {
				name = trimmed
				break
			}
		}
		if name == "" {
			name = firstNonEmpty(lh.ID, orRec.ID, offEntry.name, md.ID)
		}
		if name == "" {
			continue
		}

		providerKey := inferFirstPartyKeyByModelName(name)
		if providerKey == "" && hasLH {
			providerKey = lh.ProviderKey
		}
		if providerKey == "" && hasOR {
			providerKey = orRec.ProviderKey
		}
		if providerKey == "" && hasMD && md.FirstPartyScore >= 2 {
			providerKey = md.ProviderKey
		}
		if providerKey == "" && hasOff && !isResellerVendor(off.Vendor) {
			if spec, ok := canonicalVendorByAlias[strings.ToLower(strings.TrimSpace(off.Vendor))]; ok {
				providerKey = spec.Key
			}
		}

		vendorName := ""
		icon := ""
		if resolvedName, vendorObj, modelIcon, ok := resolveCanonicalVendor(providerKey, locale, localVendors); ok {
			vendorName = resolvedName
			icon = modelIcon
			mergedVendors[resolvedName] = vendorObj
		} else if hasOff && strings.TrimSpace(off.Vendor) != "" && !isResellerVendor(off.Vendor) {
			vendorName = off.Vendor
			icon = off.Icon
			if v, ok := officialVendors[off.Vendor]; ok {
				mergedVendors[off.Vendor] = v
			} else {
				mergedVendors[off.Vendor] = model.Vendor{Name: off.Vendor, Icon: off.Icon, Status: 1}
			}
		} else if hasOR && orRec.RawVendor != "" && !isResellerVendor(orRec.RawVendor) {
			vendorName = orRec.RawVendor
			mergedVendors[vendorName] = model.Vendor{Name: vendorName, Status: 1}
		} else if hasMD && md.RawVendor != "" && !isResellerVendor(md.RawVendor) {
			vendorName = md.RawVendor
			mergedVendors[vendorName] = model.Vendor{Name: vendorName, Status: 1}
		}

		if hasOff && off.Icon != "" && !isResellerVendor(off.Vendor) && providerKey == "" {
			icon = off.Icon
		}

		var desc string
		if locale == "zh" || locale == "ja" {
			desc = firstNonEmpty(off.Description, lh.Description, orRec.Description, md.Description)
		} else {
			desc = firstNonEmpty(lh.Description, orRec.Description, md.Description, off.Description)
		}

		var combined externalModelRecord
		hasExt := hasLH || hasOR || hasMD
		if hasExt {
			for _, rec := range []*externalModelRecord{
				ptrIf(hasLH, lh),
				ptrIf(hasOR, orRec),
				ptrIf(hasMD, md),
			} {
				if rec == nil {
					continue
				}
				if combined.Type == "" || (combined.Type == "chat" && rec.Type != "" && rec.Type != "chat") {
					combined.Type = rec.Type
				}
				if rec.ContextWindow > combined.ContextWindow {
					combined.ContextWindow = rec.ContextWindow
				}
				combined.Reasoning = combined.Reasoning || rec.Reasoning
				combined.Vision = combined.Vision || rec.Vision
				combined.Tools = combined.Tools || rec.Tools
				combined.Files = combined.Files || rec.Files
				combined.Search = combined.Search || rec.Search
				combined.AudioInput = combined.AudioInput || rec.AudioInput
				combined.VideoInput = combined.VideoInput || rec.VideoInput
				combined.OpenWeights = combined.OpenWeights || rec.OpenWeights
			}
		}

		var extPtr *externalModelRecord
		if hasExt {
			extPtr = &combined
		}
		tags := buildExternalTags(off.Tags, extPtr, locale)

		nameRule := model.NameRuleExact
		status := 1
		endpoints := ""
		if hasOff {
			nameRule = off.NameRule
			status = off.Status
			endpoints = off.Endpoints
		}

		values := model.MetadataValues{
			Description: desc,
			Icon:        icon,
			Tags:        tags,
			Vendor:      vendorName,
			Endpoints:   endpoints,
			NameRule:    nameRule,
			Status:      status,
		}
		if err := model.ValidateMetadataValues(values); err == nil {
			mergedModels[name] = values
		}
	}

	return mergedModels, mergedVendors
}

func ptrIf(cond bool, rec externalModelRecord) *externalModelRecord {
	if !cond {
		return nil
	}
	copyRec := rec
	return &copyRec
}

func fetchMultiSourceMetadataCatalog(
	ctx context.Context,
	locale string,
	sourceType string,
	localVendors map[string]*model.Vendor,
) (metadataSyncSource, map[string]model.MetadataValues, map[string]model.Vendor, error) {
	switch sourceType {
	case metadataSourceLobeHub:
		url, records, err := fetchLobeHubCatalog(ctx)
		if err != nil {
			return metadataSyncSource{Source: sourceType, Locale: locale, ModelsURL: url}, nil, nil, err
		}
		models, vendors := convertExternalRecordsToCatalog(records, locale, localVendors)
		return metadataSyncSource{
			Source:        sourceType,
			Locale:        locale,
			ModelsURL:     url,
			VendorsURL:    "builtin:first-party-vendors",
			ActiveSources: []string{metadataSourceLobeHub},
		}, models, vendors, nil

	case metadataSourceOpenRouter:
		url, records, err := fetchOpenRouterCatalog(ctx)
		if err != nil {
			return metadataSyncSource{Source: sourceType, Locale: locale, ModelsURL: url}, nil, nil, err
		}
		models, vendors := convertExternalRecordsToCatalog(records, locale, localVendors)
		return metadataSyncSource{
			Source:        sourceType,
			Locale:        locale,
			ModelsURL:     url,
			VendorsURL:    "builtin:first-party-vendors",
			ActiveSources: []string{metadataSourceOpenRouter},
		}, models, vendors, nil

	case metadataSourceModelsDev:
		url, records, err := fetchModelsDevCatalog(ctx)
		if err != nil {
			return metadataSyncSource{Source: sourceType, Locale: locale, ModelsURL: url}, nil, nil, err
		}
		models, vendors := convertExternalRecordsToCatalog(records, locale, localVendors)
		return metadataSyncSource{
			Source:        sourceType,
			Locale:        locale,
			ModelsURL:     url,
			VendorsURL:    "builtin:first-party-vendors",
			ActiveSources: []string{metadataSourceModelsDev},
		}, models, vendors, nil

	case metadataSourceMerged:
		var (
			wg         sync.WaitGroup
			offModels  map[string]model.MetadataValues
			offVendors map[string]model.Vendor
			offSource  metadataSyncSource
			offErr     error
			lhURL      string
			lhRecords  map[string]externalModelRecord
			lhErr      error
			orURL      string
			orRecords  map[string]externalModelRecord
			orErr      error
			mdURL      string
			mdRecords  map[string]externalModelRecord
			mdErr      error
		)
		wg.Add(4)
		go func() {
			defer wg.Done()
			offSource, offModels, offVendors, offErr = fetchOfficialMetadataCatalog(ctx, locale)
		}()
		go func() {
			defer wg.Done()
			lhURL, lhRecords, lhErr = fetchLobeHubCatalog(ctx)
		}()
		go func() {
			defer wg.Done()
			orURL, orRecords, orErr = fetchOpenRouterCatalog(ctx)
		}()
		go func() {
			defer wg.Done()
			mdURL, mdRecords, mdErr = fetchModelsDevCatalog(ctx)
		}()
		wg.Wait()

		var active []string
		var urls []string
		var warnings []string
		if lhErr == nil {
			active = append(active, metadataSourceLobeHub)
			urls = append(urls, lhURL)
		} else {
			warnings = append(warnings, fmt.Sprintf("LobeHub model-bank: %v", lhErr))
		}
		if orErr == nil {
			active = append(active, metadataSourceOpenRouter)
			urls = append(urls, orURL)
		} else {
			warnings = append(warnings, fmt.Sprintf("OpenRouter: %v", orErr))
		}
		if mdErr == nil {
			active = append(active, metadataSourceModelsDev)
			urls = append(urls, mdURL)
		} else {
			warnings = append(warnings, fmt.Sprintf("models.dev: %v", mdErr))
		}
		if offErr == nil {
			active = append(active, metadataSourceOfficial)
			urls = append(urls, offSource.ModelsURL)
		} else {
			warnings = append(warnings, fmt.Sprintf("basellm: %v", offErr))
		}

		if len(active) == 0 {
			return metadataSyncSource{Source: sourceType, Locale: locale}, nil, nil,
				fmt.Errorf("all metadata sources failed: %s", strings.Join(warnings, "; "))
		}

		models, vendors := mergeMultiSourceCatalogs(
			locale,
			localVendors,
			offModels,
			offVendors,
			lhRecords,
			orRecords,
			mdRecords,
		)
		vendorsURL := "builtin:first-party-vendors"
		if offErr == nil && offSource.VendorsURL != "" {
			vendorsURL = "builtin:first-party-vendors + " + offSource.VendorsURL
		}
		return metadataSyncSource{
			Source:        sourceType,
			Locale:        locale,
			ModelsURL:     strings.Join(urls, " | "),
			VendorsURL:    vendorsURL,
			ActiveSources: active,
			Warnings:      warnings,
		}, models, vendors, nil

	default:
		return metadataSyncSource{}, nil, nil, errors.New("unsupported metadata source")
	}
}
