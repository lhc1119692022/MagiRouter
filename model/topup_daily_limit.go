package model

import (
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const DailyTopUpPendingHoldDuration = 15 * time.Minute

type DailyTopUpLimitStatus struct {
	Enabled            bool    `json:"enabled"`
	Limit              float64 `json:"limit"`
	Used               float64 `json:"used"`
	Pending            float64 `json:"pending"`
	Remaining          float64 `json:"remaining"`
	Exempt             bool    `json:"exempt"`
	PendingHoldMinutes int     `json:"pending_hold_minutes,omitempty"`
	ContactWeChatQR    string  `json:"contact_wechat_qrcode"`
	ContactNote        string  `json:"contact_note"`
}

type DailyTopUpLimitExceededError struct {
	Status     DailyTopUpLimitStatus
	OrderMoney float64
}

func (e *DailyTopUpLimitExceededError) Error() string {
	return fmt.Sprintf("daily top-up limit %.2f exceeded (remaining %.2f, requested %.2f)", e.Status.Limit, e.Status.Remaining, e.OrderMoney)
}

var userDailyTopUpLocks sync.Map

func lockUserDailyTopUp(userId int) func() {
	actual, _ := userDailyTopUpLocks.LoadOrStore(userId, &sync.Mutex{})
	mu := actual.(*sync.Mutex)
	mu.Lock()
	return mu.Unlock
}

func dailyTopUpPendingHoldDuration() time.Duration {
	if expireDuration := operation_setting.GetOrderExpireDuration(); expireDuration > 0 {
		return expireDuration
	}
	return DailyTopUpPendingHoldDuration
}

func dailyTopUpWindow(now time.Time) (dayStart int64, pendingCutoff int64) {
	dayStart = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()
	pendingCutoff = max(dayStart, now.Unix()-int64(dailyTopUpPendingHoldDuration().Seconds()))
	return dayStart, pendingCutoff
}

func topUpRecordedPayMoney(topUp TopUp) decimal.Decimal {
	money := decimal.NewFromFloat(topUp.Money)
	if topUp.PaymentProvider == PaymentProviderStripe || topUp.PaymentMethod == PaymentMethodStripe {
		if setting.StripeUnitPrice > 0 {
			money = money.Mul(decimal.NewFromFloat(setting.StripeUnitPrice))
			if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens && common.QuotaPerUnit > 0 {
				money = money.Div(decimal.NewFromFloat(common.QuotaPerUnit))
			}
		}
	}
	if !money.IsPositive() {
		return decimal.Zero
	}
	return money.Round(2)
}

func queryUserDailyTopUpUsageTx(tx *gorm.DB, userId int, now time.Time) (used decimal.Decimal, pending decimal.Decimal, err error) {
	dayStart, pendingCutoff := dailyTopUpWindow(now)
	var rows []TopUp
	err = tx.Select("amount", "money", "payment_method", "payment_provider", "status", "create_time", "complete_time").
		Where(
			"user_id = ? AND amount > 0 AND ((status = ? AND (complete_time >= ? OR (complete_time = 0 AND create_time >= ?))) OR (status = ? AND create_time >= ?))",
			userId,
			common.TopUpStatusSuccess, dayStart, dayStart,
			common.TopUpStatusPending, pendingCutoff,
		).
		Find(&rows).Error
	if err != nil {
		return decimal.Zero, decimal.Zero, err
	}

	used = decimal.Zero
	pending = decimal.Zero
	for _, row := range rows {
		amount := topUpRecordedPayMoney(row)
		if !amount.IsPositive() {
			continue
		}
		switch row.Status {
		case common.TopUpStatusSuccess:
			used = used.Add(amount)
		case common.TopUpStatusPending:
			pending = pending.Add(amount)
		}
	}
	return used.Round(2), pending.Round(2), nil
}

func buildDailyTopUpLimitStatus(cfg operation_setting.DailyTopUpLimitConfig, exempt bool, used decimal.Decimal, pending decimal.Decimal) DailyTopUpLimitStatus {
	limitDec := decimal.NewFromFloat(cfg.Limit).Round(2)
	enabled := limitDec.IsPositive()
	remainingDec := decimal.Zero
	if enabled && !exempt {
		remainingDec = limitDec.Sub(used).Sub(pending)
		if remainingDec.IsNegative() {
			remainingDec = decimal.Zero
		}
	}
	return DailyTopUpLimitStatus{
		Enabled:            enabled,
		Limit:              limitDec.InexactFloat64(),
		Used:               used.Round(2).InexactFloat64(),
		Pending:            pending.Round(2).InexactFloat64(),
		Remaining:          remainingDec.Round(2).InexactFloat64(),
		Exempt:             exempt,
		PendingHoldMinutes: int(dailyTopUpPendingHoldDuration() / time.Minute),
		ContactWeChatQR:    cfg.ContactWeChatQR,
		ContactNote:        cfg.ContactNote,
	}
}

func GetUserDailyTopUpStatus(userId int, now time.Time) (DailyTopUpLimitStatus, error) {
	cfg := operation_setting.GetDailyTopUpLimitConfig()
	if userId <= 0 {
		return buildDailyTopUpLimitStatus(cfg, false, decimal.Zero, decimal.Zero), nil
	}

	var user User
	if err := DB.Select("id", "username", "email").Where("id = ?", userId).First(&user).Error; err != nil {
		return buildDailyTopUpLimitStatus(cfg, false, decimal.Zero, decimal.Zero), err
	}

	exempt := cfg.IsUserExempt(user.Id, user.Username, user.Email)
	used, pending, err := queryUserDailyTopUpUsageTx(DB, userId, now)
	if err != nil {
		return buildDailyTopUpLimitStatus(cfg, exempt, decimal.Zero, decimal.Zero), err
	}

	return buildDailyTopUpLimitStatus(cfg, exempt, used, pending), nil
}

// CreateTopUpWithDailyLimit atomically verifies the user's daily top-up money
// limit and inserts the pending top-up order inside one transaction.
func CreateTopUpWithDailyLimit(topUp *TopUp, orderMoney float64, now time.Time) error {
	if topUp == nil {
		return ErrTopUpNotFound
	}

	unlock := lockUserDailyTopUp(topUp.UserId)
	defer unlock()

	return DB.Transaction(func(tx *gorm.DB) error {
		cfg := operation_setting.GetDailyTopUpLimitConfig()
		limitDec := decimal.NewFromFloat(cfg.Limit).Round(2)
		if limitDec.IsPositive() {
			var user User
			if err := lockForUpdate(tx).Select("id", "username", "email").Where("id = ?", topUp.UserId).First(&user).Error; err != nil {
				return err
			}

			if !cfg.IsUserExempt(user.Id, user.Username, user.Email) {
				used, pending, err := queryUserDailyTopUpUsageTx(tx, topUp.UserId, now)
				if err != nil {
					return err
				}
				orderDec := decimal.NewFromFloat(orderMoney).Round(2)
				if used.Add(pending).Add(orderDec).GreaterThan(limitDec) {
					return &DailyTopUpLimitExceededError{
						Status:     buildDailyTopUpLimitStatus(cfg, false, used, pending),
						OrderMoney: orderDec.InexactFloat64(),
					}
				}
			}
		}

		return tx.Create(topUp).Error
	})
}
