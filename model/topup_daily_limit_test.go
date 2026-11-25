package model

import (
	"errors"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func withDailyTopUpTestConfig(t *testing.T, limit float64, exemptUsers []string, qr string, note string) {
	t.Helper()
	ps := operation_setting.GetPaymentSetting()
	oldLimit := ps.DailyTopUpLimit
	oldExempt := append([]string(nil), ps.DailyTopUpExemptUsers...)
	oldQR := ps.DailyTopUpContactWeChatQRCode
	oldNote := ps.DailyTopUpContactNote

	common.OptionMapRWMutex.Lock()
	ps.DailyTopUpLimit = limit
	ps.DailyTopUpExemptUsers = append([]string(nil), exemptUsers...)
	ps.DailyTopUpContactWeChatQRCode = qr
	ps.DailyTopUpContactNote = note
	common.OptionMapRWMutex.Unlock()

	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		ps.DailyTopUpLimit = oldLimit
		ps.DailyTopUpExemptUsers = oldExempt
		ps.DailyTopUpContactWeChatQRCode = oldQR
		ps.DailyTopUpContactNote = oldNote
		common.OptionMapRWMutex.Unlock()
	})
}

func TestCreateTopUpWithDailyLimit_EnforcesMoneyCapAndStatusFiltering(t *testing.T) {
	truncateTables(t)
	withDailyTopUpTestConfig(t, 200, nil, "https://example.com/wechat-qr.png", "Scan WeChat for >200")

	user := &User{Id: 301, Username: "daily_limit_user", Email: "daily@example.com", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(user).Error)

	now := time.Date(2026, 11, 25, 14, 0, 0, 0, time.Local)
	yesterday := now.Add(-24 * time.Hour)
	stalePending := now.Add(-DailyTopUpPendingHoldDuration - time.Minute)
	recentPending := now.Add(-5 * time.Minute)

	seedOrders := []TopUp{
		// Yesterday's completed order should not count today.
		{UserId: user.Id, Amount: 50, Money: 500, TradeNo: "dl-yesterday", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, CreateTime: yesterday.Unix(), CompleteTime: yesterday.Unix(), Status: common.TopUpStatusSuccess},
		// Failed / expired orders today should not count.
		{UserId: user.Id, Amount: 50, Money: 150, TradeNo: "dl-failed", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, CreateTime: now.Unix(), Status: common.TopUpStatusFailed},
		{UserId: user.Id, Amount: 50, Money: 150, TradeNo: "dl-expired", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, CreateTime: now.Unix(), Status: common.TopUpStatusExpired},
		// Stale pending order older than 15m should not block today's limit.
		{UserId: user.Id, Amount: 50, Money: 150, TradeNo: "dl-stale-pending", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, CreateTime: stalePending.Unix(), Status: common.TopUpStatusPending},
		// Subscription mirror row (Amount == 0) should not count as top-up.
		{UserId: user.Id, Amount: 0, Money: 199, TradeNo: "dl-sub-mirror", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, CreateTime: now.Unix(), CompleteTime: now.Unix(), Status: common.TopUpStatusSuccess},
		// Today's completed top-up: 120.
		{UserId: user.Id, Amount: 16, Money: 120, TradeNo: "dl-today-success", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, CreateTime: now.Add(-time.Hour).Unix(), CompleteTime: now.Add(-time.Hour).Unix(), Status: common.TopUpStatusSuccess},
		// Today's recent pending top-up: 30.
		{UserId: user.Id, Amount: 4, Money: 30, TradeNo: "dl-today-pending", PaymentMethod: "wxpay", PaymentProvider: PaymentProviderEpay, CreateTime: recentPending.Unix(), Status: common.TopUpStatusPending},
	}
	for _, order := range seedOrders {
		require.NoError(t, DB.Create(&order).Error)
	}

	status, err := GetUserDailyTopUpStatus(user.Id, now)
	require.NoError(t, err)
	assert.True(t, status.Enabled)
	assert.False(t, status.Exempt)
	assert.Equal(t, 200.0, status.Limit)
	assert.Equal(t, 120.0, status.Used)
	assert.Equal(t, 30.0, status.Pending)
	assert.Equal(t, 50.0, status.Remaining)
	assert.Equal(t, "https://example.com/wechat-qr.png", status.ContactWeChatQR)
	assert.Equal(t, "Scan WeChat for >200", status.ContactNote)

	// Requesting 50.01 exceeds remaining 50 -> rejected without inserting a row.
	overOrder := &TopUp{
		UserId:          user.Id,
		Amount:          7,
		Money:           50.01,
		TradeNo:         "dl-over-limit",
		PaymentMethod:   "alipay",
		PaymentProvider: PaymentProviderEpay,
		CreateTime:      now.Unix(),
		Status:          common.TopUpStatusPending,
	}
	err = CreateTopUpWithDailyLimit(overOrder, 50.01, now)
	var limitErr *DailyTopUpLimitExceededError
	require.ErrorAs(t, err, &limitErr)
	assert.Equal(t, 50.0, limitErr.Status.Remaining)
	assert.Nil(t, GetTopUpByTradeNo("dl-over-limit"))

	// Requesting exact remaining 50.00 succeeds.
	exactOrder := &TopUp{
		UserId:          user.Id,
		Amount:          7,
		Money:           50.00,
		TradeNo:         "dl-exact-limit",
		PaymentMethod:   "alipay",
		PaymentProvider: PaymentProviderEpay,
		CreateTime:      now.Unix(),
		Status:          common.TopUpStatusPending,
	}
	require.NoError(t, CreateTopUpWithDailyLimit(exactOrder, 50.00, now))
	require.NotNil(t, GetTopUpByTradeNo("dl-exact-limit"))
}

func TestCreateTopUpWithDailyLimit_WhitelistBypassesCap(t *testing.T) {
	truncateTables(t)
	withDailyTopUpTestConfig(t, 200, []string{"302", "vip_name", "vip@example.com"}, "", "")

	users := []*User{
		{Id: 302, Username: "by_id", AffCode: "dlvip1", Status: common.UserStatusEnabled},
		{Id: 303, Username: "VIP_Name", AffCode: "dlvip2", Status: common.UserStatusEnabled},
		{Id: 304, Username: "by_email", Email: "VIP@example.com", AffCode: "dlvip3", Status: common.UserStatusEnabled},
	}
	now := time.Date(2026, 11, 25, 14, 0, 0, 0, time.Local)

	for idx, user := range users {
		require.NoError(t, DB.Create(user).Error)
		status, err := GetUserDailyTopUpStatus(user.Id, now)
		require.NoError(t, err)
		assert.True(t, status.Exempt)

		order := &TopUp{
			UserId:          user.Id,
			Amount:          100,
			Money:           500,
			TradeNo:         fmt.Sprintf("dl-vip-%d", idx),
			PaymentMethod:   "alipay",
			PaymentProvider: PaymentProviderEpay,
			CreateTime:      now.Unix(),
			Status:          common.TopUpStatusPending,
		}
		require.NoError(t, CreateTopUpWithDailyLimit(order, 500, now))
	}
}

func TestCreateTopUpWithDailyLimit_StripeUnitPriceAccounting(t *testing.T) {
	truncateTables(t)
	withDailyTopUpTestConfig(t, 200, nil, "", "")

	oldStripeUnitPrice := setting.StripeUnitPrice
	setting.StripeUnitPrice = 8.0
	t.Cleanup(func() {
		setting.StripeUnitPrice = oldStripeUnitPrice
	})

	user := &User{Id: 305, Username: "stripe_user", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(user).Error)
	now := time.Date(2026, 11, 25, 14, 0, 0, 0, time.Local)

	// Stripe stores charged quota units (20) in TopUp.Money while actual payment money is 20 * 8 = 160.
	first := &TopUp{
		UserId:          user.Id,
		Amount:          20,
		Money:           20,
		TradeNo:         "dl-stripe-1",
		PaymentMethod:   PaymentMethodStripe,
		PaymentProvider: PaymentProviderStripe,
		CreateTime:      now.Unix(),
		CompleteTime:    now.Unix(),
		Status:          common.TopUpStatusSuccess,
	}
	require.NoError(t, DB.Create(first).Error)

	status, err := GetUserDailyTopUpStatus(user.Id, now)
	require.NoError(t, err)
	assert.Equal(t, 160.0, status.Used)
	assert.Equal(t, 40.0, status.Remaining)

	// Another 6 units * 8 = 48 exceeds remaining 40.
	second := &TopUp{
		UserId:          user.Id,
		Amount:          6,
		Money:           6,
		TradeNo:         "dl-stripe-2",
		PaymentMethod:   PaymentMethodStripe,
		PaymentProvider: PaymentProviderStripe,
		CreateTime:      now.Unix(),
		Status:          common.TopUpStatusPending,
	}
	err = CreateTopUpWithDailyLimit(second, 48, now)
	var limitErr *DailyTopUpLimitExceededError
	require.ErrorAs(t, err, &limitErr)
}

func TestCreateTopUpWithDailyLimit_SerializesConcurrentRequests(t *testing.T) {
	truncateTables(t)
	withDailyTopUpTestConfig(t, 200, nil, "", "")

	user := &User{Id: 306, Username: "concurrent_user", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(user).Error)
	now := time.Date(2026, 11, 25, 14, 0, 0, 0, time.Local)

	const workers = 5
	var succeeded atomic.Int32
	var limitBlocked atomic.Int32
	var wg sync.WaitGroup
	start := make(chan struct{})

	for i := range workers {
		wg.Go(func() {
			<-start
			order := &TopUp{
				UserId:          user.Id,
				Amount:          20,
				Money:           120,
				TradeNo:         fmt.Sprintf("dl-concurrent-%d", i),
				PaymentMethod:   "alipay",
				PaymentProvider: PaymentProviderEpay,
				CreateTime:      now.Unix(),
				Status:          common.TopUpStatusPending,
			}
			err := CreateTopUpWithDailyLimit(order, 120, now)
			if err == nil {
				succeeded.Add(1)
				return
			}
			var limitErr *DailyTopUpLimitExceededError
			if errors.As(err, &limitErr) {
				limitBlocked.Add(1)
			}
		})
	}
	close(start)
	wg.Wait()

	assert.Equal(t, int32(1), succeeded.Load())
	assert.Equal(t, int32(workers-1), limitBlocked.Load())
}

func TestCreateTopUpWithDailyLimit_DatabaseMatrix(t *testing.T) {
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
				NamingStrategy: schema.NamingStrategy{TablePrefix: "daily_limit_matrix_"},
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
				_ = db.Migrator().DropTable(&TopUp{}, &User{})
				_ = sqlDB.Close()
			})

			require.NoError(t, db.AutoMigrate(&User{}, &TopUp{}))
			var version string
			versionQuery := "SELECT version()"
			if dialect == "sqlite" {
				versionQuery = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
			t.Logf("database=%s version=%s", dialect, version)

			withDailyTopUpTestConfig(t, 200, []string{"vip_matrix"}, "https://cdn.example.com/qr.png", "Scan WeChat")

			regular := &User{Id: 701, Username: "matrix_regular", AffCode: "mreg701", Status: common.UserStatusEnabled}
			vip := &User{Id: 702, Username: "vip_matrix", AffCode: "mvip702", Status: common.UserStatusEnabled}
			require.NoError(t, db.Create(regular).Error)
			require.NoError(t, db.Create(vip).Error)

			now := time.Date(2026, 11, 25, 15, 0, 0, 0, time.Local)
			require.NoError(t, db.Create(&TopUp{
				UserId:          regular.Id,
				Amount:          10,
				Money:           150,
				TradeNo:         "matrix-done-1",
				PaymentMethod:   "alipay",
				PaymentProvider: PaymentProviderEpay,
				CreateTime:      now.Add(-time.Hour).Unix(),
				CompleteTime:    now.Add(-time.Hour).Unix(),
				Status:          common.TopUpStatusSuccess,
			}).Error)

			status, err := GetUserDailyTopUpStatus(regular.Id, now)
			require.NoError(t, err)
			assert.Equal(t, 150.0, status.Used)
			assert.Equal(t, 50.0, status.Remaining)

			// Exceeds remaining 50 -> rejected.
			err = CreateTopUpWithDailyLimit(&TopUp{
				UserId:          regular.Id,
				Amount:          10,
				Money:           60,
				TradeNo:         "matrix-over-1",
				PaymentMethod:   "alipay",
				PaymentProvider: PaymentProviderEpay,
				CreateTime:      now.Unix(),
				Status:          common.TopUpStatusPending,
			}, 60, now)
			var limitErr *DailyTopUpLimitExceededError
			require.ErrorAs(t, err, &limitErr)

			// Exact remaining 50 -> allowed.
			require.NoError(t, CreateTopUpWithDailyLimit(&TopUp{
				UserId:          regular.Id,
				Amount:          5,
				Money:           50,
				TradeNo:         "matrix-exact-1",
				PaymentMethod:   "alipay",
				PaymentProvider: PaymentProviderEpay,
				CreateTime:      now.Unix(),
				Status:          common.TopUpStatusPending,
			}, 50, now))

			// Whitelisted user bypasses 200 cap.
			require.NoError(t, CreateTopUpWithDailyLimit(&TopUp{
				UserId:          vip.Id,
				Amount:          50,
				Money:           500,
				TradeNo:         "matrix-vip-1",
				PaymentMethod:   "alipay",
				PaymentProvider: PaymentProviderEpay,
				CreateTime:      now.Unix(),
				Status:          common.TopUpStatusPending,
			}, 500, now))
		})
	}
}
