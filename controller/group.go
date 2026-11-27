package controller

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

func GetGroups(c *gin.Context) {
	var groupNames []string
	if strings.TrimSpace(c.Query("scope")) == "billing" {
		groupNames = ratio_setting.GetBillingGroupNames()
	} else {
		groupNames = ratio_setting.GetAllGroupNames()
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    groupNames,
	})
}

func GetUserGroups(c *gin.Context) {
	usableGroups := make(map[string]map[string]any)
	userGroup := ""
	userId := c.GetInt("id")
	userGroup, _ = model.GetUserGroup(userId, false)
	userUsableGroups := service.GetUserUsableGroups(userGroup)
	var enabledGroupSet map[string]struct{}
	if enabledGroups, err := model.GetEnabledModelGroups(); err == nil {
		enabledGroupSet = make(map[string]struct{}, len(enabledGroups))
		for _, groupName := range enabledGroups {
			enabledGroupSet[groupName] = struct{}{}
		}
	}
	visibleModelsByGroup, visibleErr := model.GetVisibleModelsByGroup(nil)
	if visibleErr != nil {
		visibleModelsByGroup = nil
	}
	for groupName := range ratio_setting.GetGroupRatioCopy() {
		if ratio_setting.IsUserManagementGroup(groupName) {
			continue
		}
		// UserUsableGroups contains the groups that the user can use
		if desc, ok := userUsableGroups[groupName]; ok {
			entry := map[string]any{
				"ratio": service.GetUserGroupRatio(userGroup, groupName),
				"desc":  desc,
			}
			if visibleModelsByGroup != nil {
				models := visibleModelsByGroup[groupName]
				entry["has_models"] = len(models) > 0
				if len(models) > 0 {
					entry["models"] = models
				}
			} else if enabledGroupSet != nil {
				_, hasModels := enabledGroupSet[groupName]
				entry["has_models"] = hasModels
			}
			if enabledGroupSet != nil {
				_, hasActiveChannels := enabledGroupSet[groupName]
				entry["has_active_channels"] = hasActiveChannels
			}
			usableGroups[groupName] = entry
		}
	}
	if _, ok := userUsableGroups["auto"]; ok {
		entry := map[string]any{
			"ratio": "auto",
			"desc":  setting.GetUsableGroupDescription("auto"),
		}
		autoGroups := service.GetUserAutoGroup(userGroup)
		if visibleModelsByGroup != nil {
			hasModels := false
			for _, autoGroup := range autoGroups {
				if len(visibleModelsByGroup[autoGroup]) > 0 {
					hasModels = true
					break
				}
			}
			entry["has_models"] = hasModels
		} else if enabledGroupSet != nil {
			hasModels := false
			for _, autoGroup := range autoGroups {
				if _, ok := enabledGroupSet[autoGroup]; ok {
					hasModels = true
					break
				}
			}
			entry["has_models"] = hasModels
		}
		if enabledGroupSet != nil {
			hasActiveChannels := false
			for _, autoGroup := range autoGroups {
				if _, ok := enabledGroupSet[autoGroup]; ok {
					hasActiveChannels = true
					break
				}
			}
			entry["has_active_channels"] = hasActiveChannels
		}
		usableGroups["auto"] = entry
	}
	c.JSON(http.StatusOK, gin.H{
		"success":                true,
		"message":                "",
		"data":                   usableGroups,
		"user_group":             userGroup,
		"require_explicit_group": ratio_setting.IsUserManagementGroup(userGroup),
		"smart_routing_enabled":  setting.GetSmartRoutingConfig().Enabled,
	})
}
