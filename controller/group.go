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
			if enabledGroupSet != nil {
				_, hasModels := enabledGroupSet[groupName]
				entry["has_models"] = hasModels
			}
			usableGroups[groupName] = entry
		}
	}
	if _, ok := userUsableGroups["auto"]; ok {
		entry := map[string]any{
			"ratio": "auto",
			"desc":  setting.GetUsableGroupDescription("auto"),
		}
		if enabledGroupSet != nil {
			hasModels := false
			for _, autoGroup := range service.GetUserAutoGroup(userGroup) {
				if _, ok := enabledGroupSet[autoGroup]; ok {
					hasModels = true
					break
				}
			}
			entry["has_models"] = hasModels
		}
		usableGroups["auto"] = entry
	}
	c.JSON(http.StatusOK, gin.H{
		"success":                true,
		"message":                "",
		"data":                   usableGroups,
		"user_group":             userGroup,
		"require_explicit_group": ratio_setting.IsUserManagementGroup(userGroup),
	})
}
