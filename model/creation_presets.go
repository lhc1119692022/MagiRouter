package model

import (
	"context"
	"errors"
	"reflect"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var creationPresetsMutex sync.Mutex
var ErrCreationPresetIDConflict = errors.New("creation preset ID conflict")
var ErrCreationPresetsChanged = errors.New("creation presets changed")

func CreateCreationPreset(ctx context.Context, preset map[string]any) error {
	if err := console_setting.ValidateCreationPreset(preset); err != nil {
		return err
	}
	if _, explicit := preset["published"]; !explicit {
		preset["published"] = false
	}
	return changeCreationPresets(ctx, func(current string) (string, error) {
		items, err := console_setting.ParseCreationPresets(current)
		if err != nil {
			return "", err
		}
		for _, stored := range items {
			if stored["id"] != preset["id"] {
				continue
			}
			if !reflect.DeepEqual(stored, preset) {
				return "", ErrCreationPresetIDConflict
			}
			return current, nil
		}
		if len(items) >= console_setting.MaxCreationPresets {
			return "", console_setting.ErrInvalidCreationPreset
		}
		data, err := common.Marshal(append(items, preset))
		return string(data), err
	})
}

func ReplaceCreationPresets(ctx context.Context, previous *string, value string) error {
	items, err := console_setting.ParseCreationPresets(value)
	if err != nil {
		return err
	}
	expected := "[]"
	if previous != nil {
		expected = *previous
	}
	return changeCreationPresets(ctx, func(current string) (string, error) {
		if current != expected {
			return "", ErrCreationPresetsChanged
		}
		stored, err := console_setting.ParseCreationPresets(current)
		if err != nil {
			return "", err
		}
		existing := make(map[string]map[string]any, len(stored))
		for _, item := range stored {
			existing[item["id"].(string)] = item
		}
		normalized := false
		for _, item := range items {
			if _, supplied := item["published"]; supplied {
				continue
			}
			old := existing[item["id"].(string)]
			if old == nil {
				item["published"] = false
				normalized = true
			} else if visibility, explicit := old["published"]; explicit {
				item["published"] = visibility
				normalized = true
			}
		}
		if normalized {
			data, err := common.Marshal(items)
			return string(data), err
		}
		return value, nil
	})
}

func changeCreationPresets(ctx context.Context, change func(string) (string, error)) error {
	creationPresetsMutex.Lock()
	defer creationPresetsMutex.Unlock()
	const key = console_setting.CreationPresetsOption
	var next string
	var changed bool
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&Option{Key: key, Value: "[]"}).Error; err != nil {
			return err
		}
		var current Option
		if err := lockForUpdate(tx).Where(&Option{Key: key}).Take(&current).Error; err != nil {
			return err
		}
		updated, err := change(current.Value)
		if err != nil {
			return err
		}
		if len(updated) > console_setting.MaxCreationPresetsBytes {
			return console_setting.ErrInvalidCreationPreset
		}
		next, changed = updated, updated != current.Value
		if !changed {
			return nil
		}
		return tx.Model(&current).Update("value", updated).Error
	})
	if err != nil {
		return err
	}
	if changed {
		BumpSyncTopic(SyncTopicOptions)
	}
	return updateOptionMap(key, next)
}
