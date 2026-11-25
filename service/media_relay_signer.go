package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"mime"
	"net/http"
	"net/url"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/setting/operation_setting"
)

const emptySHA256Hex = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

// PresignedMediaUpload 描述签发给浏览器直传对象存储的上传参数
type PresignedMediaUpload struct {
	ObjectKey     string            `json:"object_key"`
	UploadURL     string            `json:"upload_url"`
	UploadMethod  string            `json:"upload_method"`
	UploadHeaders map[string]string `json:"upload_headers"`
	PublicURL     string            `json:"public_url"`
	SignedUntil   int64             `json:"signed_until"`
}

// MediaRelayConnectivityResult 描述后台测试存储桶连接的结果
type MediaRelayConnectivityResult struct {
	Reachable   bool   `json:"reachable"`
	StatusCode  int    `json:"status_code"`
	Provider    string `json:"provider"`
	Region      string `json:"region"`
	Endpoint    string `json:"endpoint"`
	PublicBase  string `json:"public_base"`
	LatencyMS   int64  `json:"latency_ms"`
	Diagnostic  string `json:"diagnostic"`
}

// BuildMediaRelayObjectKey 为上传素材生成安全、隔离且可按日期清理的对象路径
func BuildMediaRelayObjectKey(prefix string, userId int, dateKey string, sha256Hex string, fileName string, contentType string) string {
	cleanPrefix := strings.Trim(strings.TrimSpace(prefix), "/")
	if cleanPrefix == "" {
		cleanPrefix = operation_setting.DefaultMediaRelayKeyPrefix
	}
	dayCompact := strings.ReplaceAll(dateKey, "-", "")
	if dayCompact == "" {
		dayCompact = time.Now().UTC().Format("20060102")
	}
	hashPart := sanitizeMediaHexPrefix(sha256Hex, 16)
	if hashPart == "" {
		hashPart = randomMediaHex(8)
	}
	ext := resolveMediaExtension(fileName, contentType)
	randPart := randomMediaHex(4)
	return fmt.Sprintf("%s/u%d/%s/%s-%s%s", cleanPrefix, userId, dayCompact, hashPart, randPart, ext)
}

func sanitizeMediaHexPrefix(raw string, maxLen int) string {
	cleaned := strings.ToLower(strings.TrimSpace(raw))
	var b strings.Builder
	for _, r := range cleaned {
		if (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') {
			b.WriteRune(r)
			if b.Len() >= maxLen {
				break
			}
		}
	}
	return b.String()
}

func randomMediaHex(byteLen int) string {
	buf := make([]byte, byteLen)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%x", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf)
}

func resolveMediaExtension(fileName string, contentType string) string {
	ext := strings.ToLower(strings.TrimSpace(path.Ext(fileName)))
	if isSafeMediaExt(ext) {
		return ext
	}
	mimeType := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	switch mimeType {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "video/mp4":
		return ".mp4"
	case "video/quicktime":
		return ".mov"
	case "video/webm":
		return ".webm"
	case "audio/mpeg":
		return ".mp3"
	case "audio/wav", "audio/x-wav":
		return ".wav"
	case "audio/mp4", "audio/m4a":
		return ".m4a"
	case "audio/ogg":
		return ".ogg"
	}
	if exts, err := mime.ExtensionsByType(mimeType); err == nil && len(exts) > 0 {
		candidate := strings.ToLower(exts[0])
		if isSafeMediaExt(candidate) {
			return candidate
		}
	}
	return ".bin"
}

func isSafeMediaExt(ext string) bool {
	if len(ext) < 2 || len(ext) > 10 || ext[0] != '.' {
		return false
	}
	for _, r := range ext[1:] {
		if !((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')) {
			return false
		}
	}
	return true
}

// BuildMediaPublicURL 根据自定义公网域名或存储桶默认域名拼接公网只读地址
func BuildMediaPublicURL(cfg operation_setting.MediaRelaySetting, objectKey string) (string, error) {
	normalized := cfg.Normalized()
	cleanKey := strings.TrimLeft(objectKey, "/")
	if normalized.PublicBaseURL != "" {
		return strings.TrimRight(normalized.PublicBaseURL, "/") + "/" + encodeObjectPath(cleanKey), nil
	}
	host, scheme, err := resolveBucketEndpoint(normalized)
	if err != nil {
		return "", err
	}
	if normalized.Provider == operation_setting.MediaRelayProviderS3 && normalized.ForcePathStyle {
		return fmt.Sprintf("%s://%s/%s/%s", scheme, host, normalized.Bucket, encodeObjectPath(cleanKey)), nil
	}
	return fmt.Sprintf("%s://%s/%s", scheme, host, encodeObjectPath(cleanKey)), nil
}

func resolveBucketEndpoint(cfg operation_setting.MediaRelaySetting) (host string, scheme string, err error) {
	parsed, err := url.Parse(cfg.Endpoint)
	if err != nil || parsed == nil || parsed.Host == "" {
		return "", "", fmt.Errorf("invalid storage endpoint %q", cfg.Endpoint)
	}
	scheme = parsed.Scheme
	if scheme == "" {
		scheme = "https"
	}
	baseHost := parsed.Host
	if cfg.Provider == operation_setting.MediaRelayProviderS3 && cfg.ForcePathStyle {
		return baseHost, scheme, nil
	}
	lowerBucketPrefix := strings.ToLower(cfg.Bucket) + "."
	if strings.HasPrefix(strings.ToLower(baseHost), lowerBucketPrefix) {
		return baseHost, scheme, nil
	}
	return cfg.Bucket + "." + baseHost, scheme, nil
}

func encodeObjectPath(objectKey string) string {
	parts := strings.Split(strings.TrimLeft(objectKey, "/"), "/")
	for i, part := range parts {
		parts[i] = awsURIEncode(part)
	}
	return strings.Join(parts, "/")
}

func awsURIEncode(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if (ch >= 'A' && ch <= 'Z') ||
			(ch >= 'a' && ch <= 'z') ||
			(ch >= '0' && ch <= '9') ||
			ch == '-' || ch == '_' || ch == '.' || ch == '~' {
			b.WriteByte(ch)
		} else {
			b.WriteString(fmt.Sprintf("%%%02X", ch))
		}
	}
	return b.String()
}

// PresignMediaPutUpload 签发浏览器直传 PUT 预签名地址（原生支持阿里云 OSS 与标准 S3 V4）
func PresignMediaPutUpload(cfg operation_setting.MediaRelaySetting, objectKey string, contentType string, now time.Time) (*PresignedMediaUpload, error) {
	normalized := cfg.Normalized()
	if !normalized.IsReady() {
		return nil, fmt.Errorf("media relay storage is not fully configured")
	}
	cleanKey := strings.TrimLeft(objectKey, "/")
	mimeType := strings.TrimSpace(contentType)
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	publicURL, err := BuildMediaPublicURL(normalized, cleanKey)
	if err != nil {
		return nil, err
	}
	expiresAt := now.UTC().Add(time.Duration(normalized.PresignTTLSeconds) * time.Second)

	var uploadURL string
	if normalized.Provider == operation_setting.MediaRelayProviderS3 {
		uploadURL, err = presignS3V4Put(normalized, cleanKey, now.UTC(), normalized.PresignTTLSeconds)
	} else {
		uploadURL, err = presignAliyunOSSV1Put(normalized, cleanKey, mimeType, expiresAt.Unix())
	}
	if err != nil {
		return nil, err
	}
	return &PresignedMediaUpload{
		ObjectKey:    cleanKey,
		UploadURL:    uploadURL,
		UploadMethod: http.MethodPut,
		UploadHeaders: map[string]string{
			"Content-Type": mimeType,
		},
		PublicURL:   publicURL,
		SignedUntil: expiresAt.Unix(),
	}, nil
}

func presignAliyunOSSV1Put(cfg operation_setting.MediaRelaySetting, objectKey string, contentType string, expiresUnix int64) (string, error) {
	host, scheme, err := resolveBucketEndpoint(cfg)
	if err != nil {
		return "", err
	}
	expiresStr := strconv.FormatInt(expiresUnix, 10)
	canonicalResource := "/" + cfg.Bucket + "/" + objectKey
	stringToSign := "PUT\n\n" + contentType + "\n" + expiresStr + "\n" + canonicalResource
	mac := hmac.New(sha1.New, []byte(cfg.AccessKeySecret))
	mac.Write([]byte(stringToSign))
	signature := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	query := url.Values{}
	query.Set("OSSAccessKeyId", cfg.AccessKeyId)
	query.Set("Expires", expiresStr)
	query.Set("Signature", signature)
	return fmt.Sprintf("%s://%s/%s?%s", scheme, host, encodeObjectPath(objectKey), query.Encode()), nil
}

func presignS3V4Put(cfg operation_setting.MediaRelaySetting, objectKey string, nowUTC time.Time, ttlSeconds int) (string, error) {
	host, scheme, err := resolveBucketEndpoint(cfg)
	if err != nil {
		return "", err
	}
	amzDate := nowUTC.Format("20060102T150405Z")
	dateStamp := nowUTC.Format("20060102")
	credentialScope := fmt.Sprintf("%s/%s/s3/aws4_request", dateStamp, cfg.Region)
	canonicalURI := "/" + encodeObjectPath(objectKey)
	if cfg.ForcePathStyle {
		canonicalURI = "/" + awsURIEncode(cfg.Bucket) + "/" + encodeObjectPath(objectKey)
	}

	params := map[string]string{
		"X-Amz-Algorithm":     "AWS4-HMAC-SHA256",
		"X-Amz-Credential":    cfg.AccessKeyId + "/" + credentialScope,
		"X-Amz-Date":          amzDate,
		"X-Amz-Expires":       strconv.Itoa(ttlSeconds),
		"X-Amz-SignedHeaders": "host",
	}
	canonicalQuery := buildAWSV4CanonicalQuery(params)
	canonicalHeaders := "host:" + host + "\n"
	canonicalRequest := strings.Join([]string{
		http.MethodPut,
		canonicalURI,
		canonicalQuery,
		canonicalHeaders,
		"host",
		"UNSIGNED-PAYLOAD",
	}, "\n")

	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		sha256HexString(canonicalRequest),
	}, "\n")
	signingKey := deriveAWSV4SigningKey(cfg.AccessKeySecret, dateStamp, cfg.Region, "s3")
	signature := hex.EncodeToString(hmacSHA256Bytes(signingKey, stringToSign))

	return fmt.Sprintf("%s://%s%s?%s&X-Amz-Signature=%s", scheme, host, canonicalURI, canonicalQuery, signature), nil
}

func buildAWSV4CanonicalQuery(params map[string]string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	pairs := make([]string, 0, len(keys))
	for _, k := range keys {
		pairs = append(pairs, awsURIEncode(k)+"="+awsURIEncode(params[k]))
	}
	return strings.Join(pairs, "&")
}

func deriveAWSV4SigningKey(secretKey, dateStamp, region, serviceName string) []byte {
	kDate := hmacSHA256Bytes([]byte("AWS4"+secretKey), dateStamp)
	kRegion := hmacSHA256Bytes(kDate, region)
	kService := hmacSHA256Bytes(kRegion, serviceName)
	return hmacSHA256Bytes(kService, "aws4_request")
}

func hmacSHA256Bytes(key []byte, data string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(data))
	return mac.Sum(nil)
}

func sha256HexString(data string) string {
	sum := sha256.Sum256([]byte(data))
	return hex.EncodeToString(sum[:])
}

// TestMediaRelayBucketConnectivity 向配置的存储桶发起一次轻量签名 HEAD 探测，校验连通性与签名凭证
func TestMediaRelayBucketConnectivity(ctx context.Context, cfg operation_setting.MediaRelaySetting) (*MediaRelayConnectivityResult, error) {
	normalized := cfg.Normalized()
	normalized.Enabled = true
	if err := normalized.Validate(); err != nil {
		return nil, err
	}
	host, scheme, err := resolveBucketEndpoint(normalized)
	if err != nil {
		return nil, err
	}
	probeKey := strings.Trim(normalized.KeyPrefix, "/") + "/.magicanva-connectivity-probe"
	publicBase, err := BuildMediaPublicURL(normalized, "")
	if err != nil {
		publicBase = ""
	}
	publicBase = strings.TrimRight(publicBase, "/")

	var req *http.Request
	nowUTC := time.Now().UTC()
	if normalized.Provider == operation_setting.MediaRelayProviderS3 {
		req, err = buildSignedS3V4HeadRequest(ctx, normalized, host, scheme, probeKey, nowUTC)
	} else {
		req, err = buildSignedAliyunOSSV1HeadRequest(ctx, normalized, host, scheme, probeKey, nowUTC)
	}
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: 8 * time.Second}
	start := time.Now()
	resp, err := client.Do(req)
	latency := time.Since(start).Milliseconds()
	result := &MediaRelayConnectivityResult{
		Provider:   normalized.Provider,
		Region:     normalized.Region,
		Endpoint:   normalized.Endpoint,
		PublicBase: publicBase,
		LatencyMS:  latency,
	}
	if err != nil {
		result.Reachable = false
		result.Diagnostic = fmt.Sprintf("Unable to reach storage endpoint: %v", err)
		return result, nil
	}
	defer resp.Body.Close()
	result.StatusCode = resp.StatusCode

	switch {
	case resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusNotFound:
		result.Reachable = true
		result.Diagnostic = "Bucket reachable and signature accepted"
	case resp.StatusCode == http.StatusForbidden:
		result.Reachable = false
		result.Diagnostic = "Signature rejected (HTTP 403): check AccessKey ID/Secret, bucket name, region, or RAM permissions"
	default:
		result.Reachable = false
		result.Diagnostic = fmt.Sprintf("Storage endpoint returned HTTP %d", resp.StatusCode)
	}
	return result, nil
}

func buildSignedAliyunOSSV1HeadRequest(ctx context.Context, cfg operation_setting.MediaRelaySetting, host, scheme, objectKey string, nowUTC time.Time) (*http.Request, error) {
	targetURL := fmt.Sprintf("%s://%s/%s", scheme, host, encodeObjectPath(objectKey))
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, targetURL, nil)
	if err != nil {
		return nil, err
	}
	dateHeader := nowUTC.Format(http.TimeFormat)
	canonicalResource := "/" + cfg.Bucket + "/" + strings.TrimLeft(objectKey, "/")
	stringToSign := "HEAD\n\n\n" + dateHeader + "\n" + canonicalResource
	mac := hmac.New(sha1.New, []byte(cfg.AccessKeySecret))
	mac.Write([]byte(stringToSign))
	signature := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	req.Header.Set("Date", dateHeader)
	req.Header.Set("Authorization", fmt.Sprintf("OSS %s:%s", cfg.AccessKeyId, signature))
	return req, nil
}

func buildSignedS3V4HeadRequest(ctx context.Context, cfg operation_setting.MediaRelaySetting, host, scheme, objectKey string, nowUTC time.Time) (*http.Request, error) {
	canonicalURI := "/" + encodeObjectPath(objectKey)
	if cfg.ForcePathStyle {
		canonicalURI = "/" + awsURIEncode(cfg.Bucket) + "/" + encodeObjectPath(objectKey)
	}
	targetURL := fmt.Sprintf("%s://%s%s", scheme, host, canonicalURI)
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, targetURL, nil)
	if err != nil {
		return nil, err
	}
	amzDate := nowUTC.Format("20060102T150405Z")
	dateStamp := nowUTC.Format("20060102")
	credentialScope := fmt.Sprintf("%s/%s/s3/aws4_request", dateStamp, cfg.Region)
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalHeaders := fmt.Sprintf("host:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n", host, emptySHA256Hex, amzDate)
	canonicalRequest := strings.Join([]string{
		http.MethodHead,
		canonicalURI,
		"",
		canonicalHeaders,
		signedHeaders,
		emptySHA256Hex,
	}, "\n")
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		sha256HexString(canonicalRequest),
	}, "\n")
	signingKey := deriveAWSV4SigningKey(cfg.AccessKeySecret, dateStamp, cfg.Region, "s3")
	signature := hex.EncodeToString(hmacSHA256Bytes(signingKey, stringToSign))
	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("x-amz-content-sha256", emptySHA256Hex)
	req.Header.Set("Authorization", fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		cfg.AccessKeyId, credentialScope, signedHeaders, signature,
	))
	return req, nil
}
