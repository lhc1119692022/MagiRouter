package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"gorm.io/gorm"
)

var (
	ErrInvalidUserConcurrencyAdjustment = errors.New("invalid user concurrency adjustment")
	ErrUserConcurrencyPermission        = errors.New("cannot adjust concurrency for this user role")
)

// UserConcurrencyAdjustment records the committed per-user concurrency change.
type UserConcurrencyAdjustment struct {
	UserID   int
	Username string
	Group    string
	Before   int
	After    int
}

// AdjustUserMaxConcurrency atomically updates only a user's max_concurrency
// override without altering their group or other account attributes.
func AdjustUserMaxConcurrency(userID, operatorRole, maxConcurrency int) (*UserConcurrencyAdjustment, error) {
	if userID <= 0 {
		return nil, ErrInvalidUserConcurrencyAdjustment
	}
	if err := setting.ValidateUserConcurrencyLimitValue(maxConcurrency); err != nil {
		return nil, ErrInvalidUserConcurrencyAdjustment
	}

	var adjustment UserConcurrencyAdjustment
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).First(&user, userID).Error; err != nil {
			return err
		}
		if operatorRole != common.RoleRootUser && operatorRole <= user.Role {
			return ErrUserConcurrencyPermission
		}
		if maxConcurrency != user.MaxConcurrency {
			result := tx.Model(&User{}).Where("id = ?", userID).Update("max_concurrency", maxConcurrency)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return gorm.ErrRecordNotFound
			}
		}
		adjustment = UserConcurrencyAdjustment{
			UserID:   user.Id,
			Username: user.Username,
			Group:    user.Group,
			Before:   user.MaxConcurrency,
			After:    maxConcurrency,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	if adjustment.Before != adjustment.After {
		if err := PublishUserAuthCache(userID); err != nil {
			common.SysError(common.LogText("failed to sync user concurrency update for user %d: %s", userID, err))
		}
	}
	return &adjustment, nil
}
