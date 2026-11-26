package model

import (
	"os"
	"strings"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func openPerfMetricTestDB(t *testing.T) (*gorm.DB, string) {
	t.Helper()
	dsn := strings.TrimSpace(os.Getenv("TEST_PERF_DB_DSN"))
	dialect := strings.ToLower(strings.TrimSpace(os.Getenv("TEST_PERF_DB_DIALECT")))
	if dsn == "" {
		db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
		require.NoError(t, err)
		return db, "`group`"
	}
	switch dialect {
	case "mysql":
		db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
		require.NoError(t, err)
		return db, "`group`"
	case "postgres", "postgresql":
		db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
		require.NoError(t, err)
		return db, `"group"`
	default:
		t.Fatalf("unsupported TEST_PERF_DB_DIALECT: %s", dialect)
		return nil, ""
	}
}

func TestPerfMetricGroupQueriesAcrossDatabases(t *testing.T) {
	prevDB := DB
	prevGroupCol := commonGroupCol
	db, groupCol := openPerfMetricTestDB(t)
	DB = db
	commonGroupCol = groupCol
	t.Cleanup(func() {
		DB = prevDB
		commonGroupCol = prevGroupCol
	})

	require.NoError(t, db.AutoMigrate(&PerfMetric{}, &Ability{}))
	require.NoError(t, db.Where("1 = 1").Delete(&PerfMetric{}).Error)
	require.NoError(t, db.Where("1 = 1").Delete(&Ability{}).Error)

	require.NoError(t, db.Create(&Ability{Group: "default", Model: "gpt-4o-mini", ChannelId: 1, Enabled: true}).Error)
	require.NoError(t, db.Create(&Ability{Group: "default", Model: "claude-sonnet-4-5", ChannelId: 2, Enabled: true}).Error)
	require.NoError(t, db.Create(&Ability{Group: "default", Model: "disabled-model", ChannelId: 3, Enabled: false}).Error)
	require.NoError(t, db.Create(&Ability{Group: "vip", Model: "claude-opus-4-1", ChannelId: 4, Enabled: true}).Error)

	require.NoError(t, UpsertPerfMetric(&PerfMetric{
		ModelName:      "gpt-4o-mini",
		Group:          "default",
		BucketTs:       3600,
		RequestCount:   10,
		SuccessCount:   9,
		TotalLatencyMs: 8000,
		TtftSumMs:      2000,
		TtftCount:      10,
		OutputTokens:   3000,
		GenerationMs:   50000,
	}))
	require.NoError(t, UpsertPerfMetric(&PerfMetric{
		ModelName:      "claude-sonnet-4-5",
		Group:          "default",
		BucketTs:       3600,
		RequestCount:   5,
		SuccessCount:   5,
		TotalLatencyMs: 7000,
		TtftSumMs:      1500,
		TtftCount:      5,
		OutputTokens:   2000,
		GenerationMs:   40000,
	}))
	require.NoError(t, UpsertPerfMetric(&PerfMetric{
		ModelName:      "claude-opus-4-1",
		Group:          "vip",
		BucketTs:       7200,
		RequestCount:   4,
		SuccessCount:   3,
		TotalLatencyMs: 12000,
	}))

	counts, err := GetEnabledModelCountsByGroup([]string{"default", "vip"})
	require.NoError(t, err)
	assert.Equal(t, 2, counts["default"])
	assert.Equal(t, 1, counts["vip"])

	modelsByGroup, err := GetEnabledModelsByGroup([]string{"default", "vip"})
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"gpt-4o-mini", "claude-sonnet-4-5"}, modelsByGroup["default"])
	assert.ElementsMatch(t, []string{"claude-opus-4-1"}, modelsByGroup["vip"])

	buckets, err := GetPerfMetricsGroupBuckets(3600, 7200, []string{"default", "vip"})
	require.NoError(t, err)
	require.Len(t, buckets, 2)
	assert.Equal(t, "default", buckets[0].Group)
	assert.Equal(t, int64(15), buckets[0].RequestCount)
	assert.Equal(t, int64(14), buckets[0].SuccessCount)
	assert.Equal(t, int64(3500), buckets[0].TtftSumMs)
	assert.Equal(t, "vip", buckets[1].Group)
	assert.Equal(t, int64(4), buckets[1].RequestCount)

	modelSummaries, err := GetPerfMetricsGroupModelSummaries(3600, 7200, []string{"default"})
	require.NoError(t, err)
	require.Len(t, modelSummaries, 2)
}
