package model

import (
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func withOrderExpireMinutesTestConfig(t *testing.T, minutes int) {
	t.Helper()
	ps := operation_setting.GetPaymentSetting()
	oldMinutes := ps.OrderExpireMinutes

	common.OptionMapRWMutex.Lock()
	ps.OrderExpireMinutes = minutes
	common.OptionMapRWMutex.Unlock()

	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		ps.OrderExpireMinutes = oldMinutes
		common.OptionMapRWMutex.Unlock()
	})
}

func TestExpireOverduePendingOrders_RespectsConfigurableTimeoutAndStatuses(t *testing.T) {
	truncateTables(t)
	withOrderExpireMinutesTestConfig(t, 20)

	now := time.Date(2026, 11, 27, 10, 30, 0, 0, time.Local)
	seedTopUps := []TopUp{
		{UserId: 801, Amount: 5, Money: 5, TradeNo: "exp-old", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, CreateTime: now.Add(-25 * time.Minute).Unix(), Status: common.TopUpStatusPending},
		{UserId: 801, Amount: 5, Money: 5, TradeNo: "exp-exact", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, CreateTime: now.Add(-20 * time.Minute).Unix(), Status: common.TopUpStatusPending},
		{UserId: 801, Amount: 5, Money: 5, TradeNo: "exp-fresh", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, CreateTime: now.Add(-19*time.Minute - 59*time.Second).Unix(), Status: common.TopUpStatusPending},
		{UserId: 801, Amount: 5, Money: 5, TradeNo: "exp-success", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, CreateTime: now.Add(-2 * time.Hour).Unix(), CompleteTime: now.Add(-2 * time.Hour).Unix(), Status: common.TopUpStatusSuccess},
		{UserId: 801, Amount: 5, Money: 5, TradeNo: "exp-failed", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, CreateTime: now.Add(-2 * time.Hour).Unix(), Status: common.TopUpStatusFailed},
	}
	for i := range seedTopUps {
		require.NoError(t, DB.Create(&seedTopUps[i]).Error)
	}

	seedSubs := []SubscriptionOrder{
		{UserId: 801, PlanId: 1, Money: 19.9, TradeNo: "sub-exp-old", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, CreateTime: now.Add(-21 * time.Minute).Unix(), Status: common.TopUpStatusPending},
		{UserId: 801, PlanId: 1, Money: 19.9, TradeNo: "sub-exp-fresh", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, CreateTime: now.Add(-10 * time.Minute).Unix(), Status: common.TopUpStatusPending},
		{UserId: 801, PlanId: 1, Money: 19.9, TradeNo: "sub-exp-success", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, CreateTime: now.Add(-3 * time.Hour).Unix(), CompleteTime: now.Add(-3 * time.Hour).Unix(), Status: common.TopUpStatusSuccess},
	}
	for i := range seedSubs {
		require.NoError(t, DB.Create(&seedSubs[i]).Error)
	}

	expiredTopUps, err := ExpireOverduePendingTopUps(now)
	require.NoError(t, err)
	assert.Equal(t, int64(2), expiredTopUps)

	expiredSubs, err := ExpireOverduePendingSubscriptionOrders(now)
	require.NoError(t, err)
	assert.Equal(t, int64(1), expiredSubs)

	assert.Equal(t, common.TopUpStatusExpired, GetTopUpByTradeNo("exp-old").Status)
	assert.Equal(t, common.TopUpStatusExpired, GetTopUpByTradeNo("exp-exact").Status)
	assert.Equal(t, common.TopUpStatusPending, GetTopUpByTradeNo("exp-fresh").Status)
	assert.Equal(t, common.TopUpStatusSuccess, GetTopUpByTradeNo("exp-success").Status)
	assert.Equal(t, common.TopUpStatusFailed, GetTopUpByTradeNo("exp-failed").Status)

	oldSub := GetSubscriptionOrderByTradeNo("sub-exp-old")
	require.NotNil(t, oldSub)
	assert.Equal(t, common.TopUpStatusExpired, oldSub.Status)
	assert.Equal(t, now.Unix(), oldSub.CompleteTime)
	assert.Equal(t, common.TopUpStatusPending, GetSubscriptionOrderByTradeNo("sub-exp-fresh").Status)
	assert.Equal(t, common.TopUpStatusSuccess, GetSubscriptionOrderByTradeNo("sub-exp-success").Status)

	// Shortening timeout to 10 minutes immediately expires remaining 10m+ pending orders.
	withOrderExpireMinutesTestConfig(t, 10)
	expiredTopUps, err = ExpireOverduePendingTopUps(now)
	require.NoError(t, err)
	assert.Equal(t, int64(1), expiredTopUps)
	assert.Equal(t, common.TopUpStatusExpired, GetTopUpByTradeNo("exp-fresh").Status)

	expiredSubs, err = ExpireOverduePendingSubscriptionOrders(now)
	require.NoError(t, err)
	assert.Equal(t, int64(1), expiredSubs)
	assert.Equal(t, common.TopUpStatusExpired, GetSubscriptionOrderByTradeNo("sub-exp-fresh").Status)

	// Setting timeout to 0 disables automatic expiration.
	withOrderExpireMinutesTestConfig(t, 0)
	require.NoError(t, DB.Create(&TopUp{
		UserId: 801, Amount: 5, Money: 5, TradeNo: "exp-disabled", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		CreateTime: now.Add(-24 * time.Hour).Unix(), Status: common.TopUpStatusPending,
	}).Error)
	expiredTopUps, err = ExpireOverduePendingTopUps(now)
	require.NoError(t, err)
	assert.Equal(t, int64(0), expiredTopUps)
	assert.Equal(t, common.TopUpStatusPending, GetTopUpByTradeNo("exp-disabled").Status)
}

func TestTopUpListingAndManualCompleteEnforceExpiration(t *testing.T) {
	truncateTables(t)
	withOrderExpireMinutesTestConfig(t, 20)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500000
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	userA := &User{Id: 811, Username: "expire_user_a", AffCode: "expa811", Status: common.UserStatusEnabled, Quota: 0}
	userB := &User{Id: 812, Username: "expire_user_b", AffCode: "expb812", Status: common.UserStatusEnabled, Quota: 0}
	require.NoError(t, DB.Create(userA).Error)
	require.NoError(t, DB.Create(userB).Error)

	now := time.Now()
	overdueA := &TopUp{
		UserId: userA.Id, Amount: 5, Money: 5, TradeNo: "list-overdue-a",
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		CreateTime: now.Add(-25 * time.Minute).Unix(), Status: common.TopUpStatusPending,
	}
	freshA := &TopUp{
		UserId: userA.Id, Amount: 3, Money: 3, TradeNo: "list-fresh-a",
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		CreateTime: now.Add(-5 * time.Minute).Unix(), Status: common.TopUpStatusPending,
	}
	overdueB := &TopUp{
		UserId: userB.Id, Amount: 5, Money: 5, TradeNo: "list-overdue-b",
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		CreateTime: now.Add(-30 * time.Minute).Unix(), Status: common.TopUpStatusPending,
	}
	overdueManual := &TopUp{
		UserId: userB.Id, Amount: 4, Money: 4, TradeNo: "manual-overdue-b",
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		CreateTime: now.Add(-22 * time.Minute).Unix(), Status: common.TopUpStatusPending,
	}
	require.NoError(t, DB.Create(overdueA).Error)
	require.NoError(t, DB.Create(freshA).Error)
	require.NoError(t, DB.Create(overdueB).Error)
	require.NoError(t, DB.Create(overdueManual).Error)

	// GetUserTopUps expires only userA's overdue orders before returning.
	pageInfo := &common.PageInfo{Page: 1, PageSize: 20}
	items, total, err := GetUserTopUps(userA.Id, pageInfo)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	statuses := make(map[string]string, len(items))
	for _, item := range items {
		statuses[item.TradeNo] = item.Status
	}
	assert.Equal(t, common.TopUpStatusExpired, statuses["list-overdue-a"])
	assert.Equal(t, common.TopUpStatusPending, statuses["list-fresh-a"])
	assert.Equal(t, common.TopUpStatusPending, GetTopUpByTradeNo("list-overdue-b").Status)

	// ManualCompleteTopUp rejects an overdue pending order, persists expired status, and adds no quota.
	err = ManualCompleteTopUp("manual-overdue-b", "127.0.0.1")
	require.Error(t, err)
	assert.Equal(t, common.TopUpStatusExpired, GetTopUpByTradeNo("manual-overdue-b").Status)
	assert.Equal(t, 0, getUserQuotaForPaymentGuardTest(t, userB.Id))

	// SearchAllTopUps expires remaining overdue orders across users.
	allItems, allTotal, err := SearchAllTopUps("list-overdue-b", &common.PageInfo{Page: 1, PageSize: 10})
	require.NoError(t, err)
	assert.Equal(t, int64(1), allTotal)
	require.Len(t, allItems, 1)
	assert.Equal(t, common.TopUpStatusExpired, allItems[0].Status)

	// ManualCompleteTopUp still succeeds for a non-expired pending order.
	require.NoError(t, ManualCompleteTopUp("list-fresh-a", "127.0.0.1"))
	assert.Equal(t, common.TopUpStatusSuccess, GetTopUpByTradeNo("list-fresh-a").Status)
	assert.Equal(t, 3*500000, getUserQuotaForPaymentGuardTest(t, userA.Id))

	// Expired order is rejected by payment webhook settlement as well.
	_, err = RechargeEpay("list-overdue-a", "alipay", "127.0.0.1")
	assert.ErrorIs(t, err, ErrTopUpStatusInvalid)
}

func TestOrderExpireOptionAndDailyLimitHoldWindow(t *testing.T) {
	truncateTables(t)
	withDailyTopUpTestConfig(t, 200, nil, "", "")
	withOrderExpireMinutesTestConfig(t, 20)

	common.OptionMapRWMutex.Lock()
	prevMap := common.OptionMap
	common.OptionMap = map[string]string{
		operation_setting.OrderExpireMinutesOptionKey: "20",
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = prevMap
		common.OptionMapRWMutex.Unlock()
	})

	require.Error(t, validateOptionValue(operation_setting.OrderExpireMinutesOptionKey, "-1"))
	require.Error(t, validateOptionValue(operation_setting.OrderExpireMinutesOptionKey, "20.5"))
	require.NoError(t, validateOptionValue(operation_setting.OrderExpireMinutesOptionKey, "30"))
	require.NoError(t, updateOptionMap(operation_setting.OrderExpireMinutesOptionKey, "30"))
	assert.Equal(t, 30, operation_setting.GetOrderExpireMinutes())

	user := &User{Id: 821, Username: "hold_window_user", AffCode: "hold821", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(user).Error)

	now := time.Date(2026, 11, 27, 14, 0, 0, 0, time.Local)
	require.NoError(t, DB.Create(&TopUp{
		UserId: user.Id, Amount: 10, Money: 40, TradeNo: "hold-22m",
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		CreateTime: now.Add(-22 * time.Minute).Unix(), Status: common.TopUpStatusPending,
	}).Error)

	// With 30-minute timeout, a 22-minute-old pending order still counts toward pending hold.
	status, err := GetUserDailyTopUpStatus(user.Id, now)
	require.NoError(t, err)
	assert.Equal(t, 30, status.PendingHoldMinutes)
	assert.Equal(t, 40.0, status.Pending)
	assert.Equal(t, 160.0, status.Remaining)

	// With 20-minute timeout, the same 22-minute-old pending order no longer blocks remaining limit.
	require.NoError(t, updateOptionMap(operation_setting.OrderExpireMinutesOptionKey, "20"))
	status, err = GetUserDailyTopUpStatus(user.Id, now)
	require.NoError(t, err)
	assert.Equal(t, 20, status.PendingHoldMinutes)
	assert.Equal(t, 0.0, status.Pending)
	assert.Equal(t, 200.0, status.Remaining)

	// With auto-expire disabled (0), daily limit falls back to the 15-minute hold window.
	require.NoError(t, updateOptionMap(operation_setting.OrderExpireMinutesOptionKey, "0"))
	status, err = GetUserDailyTopUpStatus(user.Id, now)
	require.NoError(t, err)
	assert.Equal(t, 15, status.PendingHoldMinutes)
	assert.Equal(t, 0.0, status.Pending)
}

func TestOrderExpiration_DatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			var dbType common.DatabaseType
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(":memory:")
				dbType = common.DatabaseTypeSQLite
			case "mysql":
				dsn := os.Getenv("TEST_MYSQL_DSN")
				if dsn == "" {
					t.Skip("TEST_MYSQL_DSN is not configured")
				}
				driver = mysql.Open(dsn)
				dbType = common.DatabaseTypeMySQL
			case "postgres":
				dsn := os.Getenv("TEST_POSTGRES_DSN")
				if dsn == "" {
					t.Skip("TEST_POSTGRES_DSN is not configured")
				}
				driver = postgres.Open(dsn)
				dbType = common.DatabaseTypePostgreSQL
			}

			db, err := gorm.Open(driver, &gorm.Config{
				NamingStrategy: schema.NamingStrategy{TablePrefix: "order_expire_matrix_"},
			})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			if dialect == "sqlite" {
				sqlDB.SetMaxOpenConns(1)
			} else {
				sqlDB.SetMaxOpenConns(8)
			}

			previousDB := DB
			previousType := common.MainDatabaseType()
			DB = db
			common.SetMainDatabaseType(dbType)
			t.Cleanup(func() {
				DB = previousDB
				common.SetMainDatabaseType(previousType)
				_ = db.Migrator().DropTable(&TopUp{}, &SubscriptionOrder{}, &User{})
				_ = sqlDB.Close()
			})

			require.NoError(t, db.AutoMigrate(&User{}, &TopUp{}, &SubscriptionOrder{}))
			var version string
			versionQuery := "SELECT version()"
			if dialect == "sqlite" {
				versionQuery = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
			t.Logf("database=%s version=%s", dialect, version)

			withOrderExpireMinutesTestConfig(t, 20)

			user := &User{Id: 901, Username: "matrix_expire_user", AffCode: "mexp901", Status: common.UserStatusEnabled}
			require.NoError(t, db.Create(user).Error)

			now := time.Now()
			require.NoError(t, db.Create(&TopUp{
				UserId: user.Id, Amount: 5, Money: 5, TradeNo: "matrix-exp-overdue",
				PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
				CreateTime: now.Add(-25 * time.Minute).Unix(), Status: common.TopUpStatusPending,
			}).Error)
			require.NoError(t, db.Create(&TopUp{
				UserId: user.Id, Amount: 5, Money: 5, TradeNo: "matrix-exp-fresh",
				PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
				CreateTime: now.Add(-5 * time.Minute).Unix(), Status: common.TopUpStatusPending,
			}).Error)
			require.NoError(t, db.Create(&TopUp{
				UserId: user.Id, Amount: 5, Money: 5, TradeNo: "matrix-exp-manual",
				PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
				CreateTime: now.Add(-30 * time.Minute).Unix(), Status: common.TopUpStatusPending,
			}).Error)
			require.NoError(t, db.Create(&SubscriptionOrder{
				UserId: user.Id, PlanId: 1, Money: 10, TradeNo: "matrix-sub-overdue",
				PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
				CreateTime: now.Add(-25 * time.Minute).Unix(), Status: common.TopUpStatusPending,
			}).Error)

			// ManualCompleteTopUp rejects overdue order and transitions it to expired.
			require.Error(t, ManualCompleteTopUp("matrix-exp-manual", "127.0.0.1"))
			assert.Equal(t, common.TopUpStatusExpired, GetTopUpByTradeNo("matrix-exp-manual").Status)

			// ExpireOverduePendingTopUps / ExpireOverduePendingSubscriptionOrders expire remaining overdue rows.
			expiredTopUps, err := ExpireOverduePendingTopUps(now)
			require.NoError(t, err)
			assert.Equal(t, int64(1), expiredTopUps)
			assert.Equal(t, common.TopUpStatusExpired, GetTopUpByTradeNo("matrix-exp-overdue").Status)
			assert.Equal(t, common.TopUpStatusPending, GetTopUpByTradeNo("matrix-exp-fresh").Status)

			expiredSubs, err := ExpireOverduePendingSubscriptionOrders(now)
			require.NoError(t, err)
			assert.Equal(t, int64(1), expiredSubs)
			assert.Equal(t, common.TopUpStatusExpired, GetSubscriptionOrderByTradeNo("matrix-sub-overdue").Status)
		})
	}
}
