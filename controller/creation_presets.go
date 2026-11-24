package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/gin-gonic/gin"
)

func GetCreationPresets(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	raw := console_setting.GetConsoleSetting().CreationPresets
	common.OptionMapRWMutex.RUnlock()
	presets, err := console_setting.PublishedCreationPresets(raw)
	if err != nil {
		common.ApiErrorT(c, "Could not load creation presets.")
		return
	}
	common.ApiSuccess(c, presets)
}

func CreateCreationPreset(c *gin.Context) {
	var preset map[string]any
	body := http.MaxBytesReader(c.Writer, c.Request.Body, console_setting.MaxCreationPresetsBytes)
	if err := common.DecodeJsonBody(body, &preset); err != nil {
		writeCreationPresetError(c, console_setting.ErrInvalidCreationPreset)
		return
	}
	if err := model.CreateCreationPreset(c.Request.Context(), preset); err != nil {
		writeCreationPresetError(c, err)
		return
	}
	recordManageAudit(c, "option.update", map[string]any{"key": console_setting.CreationPresetsOption})
	common.ApiSuccess(c, preset)
}

func writeCreationPresetError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, model.ErrCreationPresetIDConflict):
		common.ApiErrorStatus(c, http.StatusConflict, common.NewMessage("A different preset already uses this ID. Reopen the form to save a new preset."))
	case errors.Is(err, model.ErrCreationPresetsChanged):
		common.ApiErrorStatus(c, http.StatusConflict, common.NewMessage("Creation presets have changed. Reload the list before saving."))
	case errors.Is(err, console_setting.ErrInvalidCreationPreset):
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid creation preset configuration."))
	default:
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to save configuration"))
	}
}
