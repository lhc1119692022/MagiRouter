package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/gin-gonic/gin"
)

func captureModelAvailabilitySnapshot() service.ModelAvailabilitySnapshot {
	if !console_setting.GetConsoleSetting().AutoModelChangeNoticeEnabled {
		return service.ModelAvailabilitySnapshot{}
	}
	return service.CaptureModelAvailabilitySnapshot()
}

func syncModelAvailabilityNotices(c *gin.Context, before service.ModelAvailabilitySnapshot) {
	if !before.Captured {
		return
	}
	lang := ""
	if c != nil {
		lang = i18n.StatedLang(c)
	}
	if _, err := service.SyncModelAvailabilityNotices(before, lang); err != nil {
		common.SysLog(common.LogText("failed to sync model availability notices: %v", err))
	}
}
