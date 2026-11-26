package model

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestCanonicalChannelGroupsAndSortChannels(t *testing.T) {
	assert.Equal(t, []string{"default", "GPT Fast", "GPT UltraFast"}, CanonicalChannelGroups(" GPT UltraFast , default , GPT Fast , default "))
	assert.Nil(t, CanonicalChannelGroups(" , "))

	p10 := int64(10)
	p50 := int64(50)
	p80 := int64(80)
	p100 := int64(100)

	makeFixture := func() []*Channel {
		return []*Channel{
			{Id: 1, Name: "team-low", Group: "GPT Team", Priority: &p10},
			{Id: 2, Name: "combo-reversed-high", Group: "GPT UltraFast,GPT Fast", Priority: &p100},
			{Id: 3, Name: "plus-low", Group: "GPT Plus", Priority: &p10},
			{Id: 4, Name: "default-only", Group: "default", Priority: &p10},
			{Id: 5, Name: "combo-ordered-low", Group: "GPT Fast,GPT UltraFast", Priority: &p50},
			{Id: 6, Name: "plus-high", Group: "GPT Plus", Priority: &p80},
			{Id: 7, Name: "default-vip", Group: "vip,default", Priority: &p50},
			{Id: 8, Name: "empty-group", Group: "", Priority: &p100},
		}
	}

	ascChannels := makeFixture()
	SortChannels(ascChannels, NewChannelSortOptions("group", "asc", false))
	ascIDs := make([]int, len(ascChannels))
	for idx, ch := range ascChannels {
		ascIDs[idx] = ch.Id
	}
	assert.Equal(t, []int{4, 7, 2, 5, 6, 3, 1, 8}, ascIDs)

	descChannels := makeFixture()
	SortChannels(descChannels, NewChannelSortOptions("group", "desc", false))
	descIDs := make([]int, len(descChannels))
	for idx, ch := range descChannels {
		descIDs[idx] = ch.Id
	}
	assert.Equal(t, []int{1, 6, 3, 2, 5, 7, 4, 8}, descIDs)
}

func TestChannelGroupSortDatabaseMatrix(t *testing.T) {
	for _, dialect := range []struct {
		name string
		env  string
	}{
		{name: "sqlite", env: ""},
		{name: "mysql", env: "TEST_CHANNEL_SORT_MYSQL_DSN"},
		{name: "postgres", env: "TEST_CHANNEL_SORT_POSTGRES_DSN"},
	} {
		t.Run(dialect.name, func(t *testing.T) {
			dsn := ""
			if dialect.env != "" {
				dsn = os.Getenv(dialect.env)
				if dsn == "" {
					t.Skipf("set %s to run %s test", dialect.env, dialect.name)
				}
			}
			oldDB, oldType, oldLogType, oldSQLite, oldMaster, oldRedis := DB, common.MainDatabaseType(), common.LogDatabaseType(), common.SQLitePath, common.IsMasterNode, common.RedisEnabled
			t.Cleanup(func() {
				DB = oldDB
				common.SetDatabaseTypes(oldType, oldLogType)
				common.SQLitePath = oldSQLite
				common.IsMasterNode = oldMaster
				common.RedisEnabled = oldRedis
				initCol()
			})

			t.Setenv("SQL_DSN", dsn)
			common.IsMasterNode, common.RedisEnabled = false, false
			common.SQLitePath = filepath.Join(t.TempDir(), "channel-sort.db")
			require.NoError(t, InitDB())
			sqlDB, err := DB.DB()
			require.NoError(t, err)
			t.Cleanup(func() { _ = sqlDB.Close() })
			require.NoError(t, DB.AutoMigrate(&Channel{}))
			require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&Channel{}).Error)

			p10 := int64(10)
			p50 := int64(50)
			p80 := int64(80)
			p100 := int64(100)
			fixtures := []*Channel{
				{Name: "team", Key: "sk-1", Group: "GPT Team", Models: "gpt-5", Priority: &p10, Status: common.ChannelStatusEnabled},
				{Name: "combo-a", Key: "sk-2", Group: "GPT UltraFast,GPT Fast", Models: "gpt-5", Priority: &p100, Status: common.ChannelStatusEnabled},
				{Name: "plus-low", Key: "sk-3", Group: "GPT Plus", Models: "gpt-5", Priority: &p10, Status: common.ChannelStatusEnabled},
				{Name: "combo-b", Key: "sk-4", Group: "GPT Fast,GPT UltraFast", Models: "gpt-5", Priority: &p50, Status: common.ChannelStatusEnabled},
				{Name: "plus-high", Key: "sk-5", Group: "GPT Plus", Models: "gpt-5", Priority: &p80, Status: common.ChannelStatusEnabled},
				{Name: "default-ch", Key: "sk-6", Group: "default", Models: "gpt-5", Priority: &p10, Status: common.ChannelStatusEnabled},
			}
			for _, ch := range fixtures {
				require.NoError(t, DB.Create(ch).Error)
			}

			var rawApplied []Channel
			require.NoError(t, NewChannelSortOptions("group", "asc", false).Apply(DB.Model(&Channel{})).Find(&rawApplied).Error)
			assert.Len(t, rawApplied, len(fixtures))

			page1, total, err := FindChannelsSortedByGroup(DB.Model(&Channel{}), 0, 3, false, false)
			require.NoError(t, err)
			assert.Equal(t, int64(6), total)
			require.Len(t, page1, 3)
			assert.Equal(t, []string{"default-ch", "combo-a", "combo-b"}, []string{page1[0].Name, page1[1].Name, page1[2].Name})
			assert.Empty(t, page1[0].Key)

			page2, total2, err := FindChannelsSortedByGroup(DB.Model(&Channel{}), 3, 3, false, false)
			require.NoError(t, err)
			assert.Equal(t, int64(6), total2)
			require.Len(t, page2, 3)
			assert.Equal(t, []string{"plus-high", "plus-low", "team"}, []string{page2[0].Name, page2[1].Name, page2[2].Name})

			descAll, _, err := FindChannelsSortedByGroup(DB.Model(&Channel{}), 0, 10, false, true)
			require.NoError(t, err)
			descNames := make([]string, len(descAll))
			for idx, ch := range descAll {
				descNames[idx] = ch.Name
			}
			assert.Equal(t, []string{"team", "plus-high", "plus-low", "combo-a", "combo-b", "default-ch"}, descNames)

			searched, err := SearchChannels("", "", "gpt-5", false, NewChannelSortOptions("group", "asc", false))
			require.NoError(t, err)
			searchedNames := make([]string, len(searched))
			for idx, ch := range searched {
				searchedNames[idx] = ch.Name
			}
			assert.Equal(t, []string{"default-ch", "combo-a", "combo-b", "plus-high", "plus-low", "team"}, searchedNames)
		})
	}
}
