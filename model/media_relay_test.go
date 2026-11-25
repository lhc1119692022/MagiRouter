package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func withMediaRelayTestConfig(t *testing.T, cfg operation_setting.MediaRelaySetting) {
	t.Helper()
	target := operation_setting.GetMediaRelaySetting()
	old := *target

	common.OptionMapRWMutex.Lock()
	*target = cfg
	common.OptionMapRWMutex.Unlock()

	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		*target = old
		common.OptionMapRWMutex.Unlock()
	})
}

func TestMediaRelayDailyTrafficReserveAbortAndOverrides(t *testing.T) {
	truncateTables(t)
	require.NoError(t, DB.AutoMigrate(&MediaDailyTraffic{}, &MediaTrafficOverride{}, &MediaRelayObject{}))
	t.Cleanup(func() {
		DB.Exec("DELETE FROM media_relay_objects")
		DB.Exec("DELETE FROM media_traffic_overrides")
		DB.Exec("DELETE FROM media_daily_traffic")
	})

	now := time.Date(2026, 11, 25, 14, 0, 0, 0, time.UTC)
	withMediaRelayTestConfig(t, operation_setting.MediaRelaySetting{
		Enabled:               true,
		Provider:              operation_setting.MediaRelayProviderAliyunOSS,
		Endpoint:              operation_setting.DefaultMediaRelayEndpoint,
		Region:                operation_setting.DefaultMediaRelayRegion,
		Bucket:                "magirouter-media-hk",
		AccessKeyId:           "ak",
		AccessKeySecret:       "sk",
		RetentionDays:         3,
		MaxFileSizeMB:         200,
		DefaultDailyTrafficMB: 200,
		TempGlobalBonusMB:     100,
		TempGlobalExpiresAt:   now.Add(24 * time.Hour).Unix(),
		TempGlobalNote:        "global boost",
	})

	user := User{Username: "media_user", AffCode: "media001", Group: "default", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(&user).Error)

	// 200 MB base + 100 MB global temp boost = 300 MB/day
	quota, err := GetUserMediaTrafficQuota(user.Id, now)
	require.NoError(t, err)
	assert.Equal(t, int64(300)*operation_setting.BytesPerMiB, quota.EffectiveDailyBytes)

	// Reserve 180 MB
	obj1 := &MediaRelayObject{
		ObjectKey:   "magicanva/media/u1/obj1.mp4",
		SHA256:      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		ContentType: "video/mp4",
		FileName:    "obj1.mp4",
		PublicURL:   "https://media-hk.magirouter.com/magicanva/media/u1/obj1.mp4",
		ExpiresAt:   now.Add(72 * time.Hour).Unix(),
	}
	q1, err := ReserveUserMediaDailyTraffic(user.Id, 180*operation_setting.BytesPerMiB, now, obj1)
	require.NoError(t, err)
	assert.Equal(t, int64(180)*operation_setting.BytesPerMiB, q1.UsedBytes)

	// Attempting another 150 MB exceeds 300 MB daily cap
	obj2 := &MediaRelayObject{ObjectKey: "magicanva/media/u1/obj2.mp4", PublicURL: "https://media-hk.magirouter.com/obj2.mp4"}
	_, err = ReserveUserMediaDailyTraffic(user.Id, 150*operation_setting.BytesPerMiB, now, obj2)
	assert.ErrorIs(t, err, ErrMediaDailyTrafficExceeded)

	// Targeted per-user boost (+200 MB/day -> 500 MB/day total) unlocks the 150 MB upload
	_, err = UpsertMediaTrafficOverride(user.Id, 200*operation_setting.BytesPerMiB, now.Add(48*time.Hour).Unix(), "vip trial", 1)
	require.NoError(t, err)

	q2, err := ReserveUserMediaDailyTraffic(user.Id, 150*operation_setting.BytesPerMiB, now, obj2)
	require.NoError(t, err)
	assert.Equal(t, int64(330)*operation_setting.BytesPerMiB, q2.UsedBytes)

	// Aborting pending obj2 refunds 150 MB
	q3, err := AbortUserMediaRelayObject(user.Id, obj2.Id, now)
	require.NoError(t, err)
	assert.Equal(t, int64(180)*operation_setting.BytesPerMiB, q3.UsedBytes)

	// Completing obj1 makes it reusable by SHA-256
	_, _, err = CompleteUserMediaRelayObject(user.Id, obj1.Id, now)
	require.NoError(t, err)
	reused, err := FindReusableMediaRelayObject(user.Id, obj1.SHA256, 180*operation_setting.BytesPerMiB, now)
	require.NoError(t, err)
	require.NotNil(t, reused)
	assert.Equal(t, obj1.PublicURL, reused.PublicURL)
}
