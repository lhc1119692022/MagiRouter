package model

import (
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	channelrouting "github.com/QuantumNous/new-api/pkg/channel_routing"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupChannelSelectRuntimeDB(t *testing.T) *gorm.DB {
	t.Helper()
	prevDB := DB
	prevCache := common.MemoryCacheEnabled
	channelrouting.ResetForTest()

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Channel{}, &Ability{}))
	DB = db

	t.Cleanup(func() {
		channelrouting.ResetForTest()
		DB = prevDB
		common.MemoryCacheEnabled = prevCache
		if prevCache && prevDB != nil && prevDB.Migrator().HasTable(&Channel{}) && prevDB.Migrator().HasTable(&Ability{}) {
			InitChannelCache()
		}
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func TestGetRandomSatisfiedChannelExcludesTriedSamePriorityPeers(t *testing.T) {
	db := setupChannelSelectRuntimeDB(t)
	priority := int64(100)
	weight := uint(100)
	for _, id := range []int{501, 502} {
		ch := Channel{
			Id:       id,
			Type:     constant.ChannelTypeOpenAI,
			Key:      fmt.Sprintf("key-%d", id),
			Status:   common.ChannelStatusEnabled,
			Name:     fmt.Sprintf("peer-%d", id),
			Models:   "gpt-peer-test",
			Group:    "default",
			Priority: &priority,
			Weight:   &weight,
		}
		require.NoError(t, db.Create(&ch).Error)
		require.NoError(t, db.Create(&Ability{
			Group:     "default",
			Model:     "gpt-peer-test",
			ChannelId: id,
			Enabled:   true,
			Priority:  &priority,
			Weight:    weight,
		}).Error)
	}

	filters := []dto.ChannelFilter{{
		Kind:              dto.FilterExcludeChannelIDs,
		ExcludeChannelIDs: []int{501},
	}}

	for _, cached := range []bool{true, false} {
		t.Run(fmt.Sprintf("cache=%t", cached), func(t *testing.T) {
			common.MemoryCacheEnabled = cached
			if cached {
				InitChannelCache()
			}
			for range 10 {
				selected, err := GetRandomSatisfiedChannel("default", "gpt-peer-test", 1, filters)
				require.NoError(t, err)
				require.NotNil(t, selected)
				assert.Equal(t, 502, selected.Id, "retry must skip already-tried peer at same priority")
			}
			// When every peer at this priority was tried, fallback still returns a channel.
			allExcluded := []dto.ChannelFilter{{
				Kind:              dto.FilterExcludeChannelIDs,
				ExcludeChannelIDs: []int{501, 502},
			}}
			fallback, err := GetRandomSatisfiedChannel("default", "gpt-peer-test", 1, allExcluded)
			require.NoError(t, err)
			require.NotNil(t, fallback)
		})
	}
}

func TestGetRandomSatisfiedChannelPrefersFastPeerOverSoftDemotedPeer(t *testing.T) {
	db := setupChannelSelectRuntimeDB(t)
	priority := int64(100)
	weight := uint(100)
	for _, id := range []int{601, 602} {
		ch := Channel{
			Id:       id,
			Type:     constant.ChannelTypeOpenAI,
			Key:      fmt.Sprintf("key-%d", id),
			Status:   common.ChannelStatusEnabled,
			Name:     fmt.Sprintf("peer-%d", id),
			Models:   "gpt-ewma-test",
			Group:    "default",
			Priority: &priority,
			Weight:   &weight,
		}
		require.NoError(t, db.Create(&ch).Error)
		require.NoError(t, db.Create(&Ability{
			Group:     "default",
			Model:     "gpt-ewma-test",
			ChannelId: id,
			Enabled:   true,
			Priority:  &priority,
			Weight:    weight,
		}).Error)
	}

	common.MemoryCacheEnabled = true
	InitChannelCache()

	channelrouting.RecordAttempt(601, channelrouting.AttemptSample{TtftMs: 700, LatencyMs: 1000, Success: true})
	channelrouting.RecordAttempt(601, channelrouting.AttemptSample{TtftMs: 800, LatencyMs: 1100, Success: true})
	for range 3 {
		channelrouting.RecordAttempt(602, channelrouting.AttemptSample{TtftMs: 12000, LatencyMs: 13000, Success: true, PeerMedianMs: 750})
	}

	fastHits := 0
	const trials = 100
	for range trials {
		selected, err := GetRandomSatisfiedChannel("default", "gpt-ewma-test", 0, nil)
		require.NoError(t, err)
		require.NotNil(t, selected)
		if selected.Id == 601 {
			fastHits++
		}
	}
	assert.GreaterOrEqual(t, fastHits, 80, "fast channel should receive the vast majority of traffic over soft-demoted peer")
}

func TestGetEnabledKeyWithPreferredPinsAndFallsBack(t *testing.T) {
	ch := &Channel{
		Id:  701,
		Key: "sk-key-0\nsk-key-1\nsk-key-2",
		ChannelInfo: ChannelInfo{
			IsMultiKey:   true,
			MultiKeyMode: constant.MultiKeyModeRandom,
			MultiKeyStatusList: map[int]int{
				0: common.ChannelStatusEnabled,
				1: common.ChannelStatusEnabled,
				2: common.ChannelStatusAutoDisabled,
			},
		},
	}

	key, idx, apiErr := ch.GetEnabledKeyWithPreferred(1)
	require.Nil(t, apiErr)
	assert.Equal(t, "sk-key-1", key)
	assert.Equal(t, 1, idx)

	// Disabled preferred key falls back cleanly to an enabled key.
	key, idx, apiErr = ch.GetEnabledKeyWithPreferred(2)
	require.Nil(t, apiErr)
	assert.Contains(t, []string{"sk-key-0", "sk-key-1"}, key)
	assert.NotEqual(t, 2, idx)
}

func TestUpdateResponseTimeAndTestTimeOnlyDoNotMutateSharedCachedChannel(t *testing.T) {
	db := setupChannelSelectRuntimeDB(t)
	priority := int64(100)
	ch := &Channel{
		Id:           751,
		Type:         constant.ChannelTypeOpenAI,
		Key:          "sk-cached",
		Status:       common.ChannelStatusEnabled,
		Name:         "cached-channel",
		Models:       "gpt-4o-mini",
		Group:        "default",
		ResponseTime: 100,
		TestTime:     1000,
	}
	require.NoError(t, db.Create(ch).Error)
	require.NoError(t, db.Create(&Ability{
		Group:     "default",
		Model:     "gpt-4o-mini",
		ChannelId: 751,
		Enabled:   true,
		Priority:  &priority,
		Weight:    100,
	}).Error)

	common.MemoryCacheEnabled = true
	InitChannelCache()

	cached, err := CacheGetChannel(751)
	require.NoError(t, err)

	var workers sync.WaitGroup
	for workerIdx := range 8 {
		workers.Add(1)
		go func(idx int) {
			defer workers.Done()
			for range 10 {
				_ = cached.ResponseTime
				_ = cached.TestTime
				if idx%2 == 0 {
					cached.UpdateResponseTime(int64(250 + idx))
				} else {
					cached.UpdateTestTimeOnly()
				}
			}
		}(workerIdx)
	}
	workers.Wait()

	assert.Equal(t, 100, cached.ResponseTime)
	assert.Equal(t, int64(1000), cached.TestTime)

	var stored Channel
	require.NoError(t, db.First(&stored, 751).Error)
	assert.GreaterOrEqual(t, stored.ResponseTime, 250)
	assert.Greater(t, stored.TestTime, int64(1000))
}

func TestGetEnabledKeyWithPreferredPollingAdvancesCachedIndexConcurrently(t *testing.T) {
	db := setupChannelSelectRuntimeDB(t)
	priority := int64(100)
	ch := &Channel{
		Id:     752,
		Type:   constant.ChannelTypeOpenAI,
		Key:    "sk-poll-0\nsk-poll-1\nsk-poll-2",
		Status: common.ChannelStatusEnabled,
		Name:   "polling-channel",
		Models: "gpt-4o-mini",
		Group:  "default",
		ChannelInfo: ChannelInfo{
			IsMultiKey:   true,
			MultiKeyMode: constant.MultiKeyModePolling,
			MultiKeyStatusList: map[int]int{
				0: common.ChannelStatusEnabled,
				1: common.ChannelStatusEnabled,
				2: common.ChannelStatusEnabled,
			},
		},
	}
	require.NoError(t, db.Create(ch).Error)
	require.NoError(t, db.Create(&Ability{
		Group:     "default",
		Model:     "gpt-4o-mini",
		ChannelId: 752,
		Enabled:   true,
		Priority:  &priority,
		Weight:    100,
	}).Error)

	common.MemoryCacheEnabled = true
	InitChannelCache()

	staleCopy := *ch
	counts := make([]int, 3)
	var countsMu sync.Mutex
	var workers sync.WaitGroup
	for range 6 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			localCopy := staleCopy
			for range 15 {
				_, idx, apiErr := localCopy.GetEnabledKeyWithPreferred(-1)
				require.Nil(t, apiErr)
				countsMu.Lock()
				counts[idx]++
				countsMu.Unlock()
			}
		}()
	}
	workers.Wait()

	assert.Equal(t, 30, counts[0])
	assert.Equal(t, 30, counts[1])
	assert.Equal(t, 30, counts[2])
}
