package service

import (
	"net/url"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPresignAliyunOSSV1Put(t *testing.T) {
	cfg := operation_setting.MediaRelaySetting{
		Enabled:           true,
		Provider:          operation_setting.MediaRelayProviderAliyunOSS,
		Endpoint:          "https://oss-cn-hongkong.aliyuncs.com",
		Region:            "oss-cn-hongkong",
		Bucket:            "magirouter-media-hk",
		PublicBaseURL:     "https://media-hk.magirouter.com",
		KeyPrefix:         "magicanva/media",
		AccessKeyId:       "LTAI5tDemo",
		AccessKeySecret:   "DemoSecretKey",
		PresignTTLSeconds: 600,
	}
	now := time.Date(2026, 11, 25, 10, 0, 0, 0, time.UTC)
	key := BuildMediaRelayObjectKey(cfg.KeyPrefix, 7, "2026-11-25", "abcdef0123456789", "clip.mp4", "video/mp4")
	presigned, err := PresignMediaPutUpload(cfg, key, "video/mp4", now)
	require.NoError(t, err)

	parsed, err := url.Parse(presigned.UploadURL)
	require.NoError(t, err)
	assert.Equal(t, "magirouter-media-hk.oss-cn-hongkong.aliyuncs.com", parsed.Host)
	assert.Equal(t, "LTAI5tDemo", parsed.Query().Get("OSSAccessKeyId"))
	assert.NotEmpty(t, parsed.Query().Get("Signature"))
	assert.Equal(t, "video/mp4", presigned.UploadHeaders["Content-Type"])
	assert.Equal(t, "https://media-hk.magirouter.com/"+key, presigned.PublicURL)
}

func TestPresignS3V4Put(t *testing.T) {
	cfg := operation_setting.MediaRelaySetting{
		Enabled:           true,
		Provider:          operation_setting.MediaRelayProviderS3,
		Endpoint:          "https://s3.example.com",
		Region:            "auto",
		Bucket:            "media-bucket",
		ForcePathStyle:    true,
		KeyPrefix:         "magicanva/media",
		AccessKeyId:       "AKIAEXAMPLE",
		AccessKeySecret:   "SECRETEXAMPLE",
		PresignTTLSeconds: 600,
	}
	now := time.Date(2026, 11, 25, 10, 0, 0, 0, time.UTC)
	presigned, err := PresignMediaPutUpload(cfg, "magicanva/media/u1/20261125/test.png", "image/png", now)
	require.NoError(t, err)

	parsed, err := url.Parse(presigned.UploadURL)
	require.NoError(t, err)
	assert.Equal(t, "s3.example.com", parsed.Host)
	assert.Equal(t, "/media-bucket/magicanva/media/u1/20261125/test.png", parsed.Path)
	assert.Equal(t, "AWS4-HMAC-SHA256", parsed.Query().Get("X-Amz-Algorithm"))
	assert.NotEmpty(t, parsed.Query().Get("X-Amz-Signature"))
	assert.Equal(t, "https://s3.example.com/media-bucket/magicanva/media/u1/20261125/test.png", presigned.PublicURL)
}
