package controller

import (
	"io"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
)

func PreviewSmartRouting(c *gin.Context) {
	cfg := setting.GetSmartRoutingConfig()
	if c.Request != nil && c.Request.Body != nil {
		body, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
		if err != nil {
			common.ApiError(c, err)
			return
		}
		if strings.TrimSpace(string(body)) != "" {
			parsed, parseErr := setting.ParseSmartRoutingConfigJSON(string(body))
			if parseErr != nil {
				common.ApiError(c, parseErr)
				return
			}
			cfg = parsed
		}
	}
	userGroup, _ := getTokenRequestUserGroup(c)
	preview := service.BuildSmartRoutingPreview(userGroup, cfg)
	common.ApiSuccess(c, preview)
}
