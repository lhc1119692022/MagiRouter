package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/gin-gonic/gin"
)

func GetDocsConfig(c *gin.Context) {
	common.ApiSuccess(c, console_setting.GetDocsConfig())
}
