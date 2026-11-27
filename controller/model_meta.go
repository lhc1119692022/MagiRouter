package controller

import (
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetAllModelsMeta 获取模型列表（分页）
func GetAllModelsMeta(c *gin.Context) {
	listModelsMeta(c, "", "")
}

// SearchModelsMeta 搜索模型列表
func SearchModelsMeta(c *gin.Context) {
	listModelsMeta(c, c.Query("keyword"), c.Query("vendor"))
}

func listModelsMeta(c *gin.Context, keyword, vendor string) {
	squareState := model.ModelSquareState(c.Query("square_state"))
	switch squareState {
	case "", model.ModelSquareVisible, model.ModelSquareUnavailable, model.ModelSquareHidden, model.ModelSquarePartial:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid model square state"})
		return
	}

	sortBy := strings.ToLower(strings.TrimSpace(c.Query("sort_by")))
	sortOrder := strings.ToLower(strings.TrimSpace(c.Query("sort_order")))
	switch sortBy {
	case "", "default", "id", "model_name", "vendor", "updated_time", "created_time", "channels", "issues":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid sort field"})
		return
	}
	if sortBy == "default" {
		sortBy = ""
	}
	if sortOrder != "asc" && sortOrder != "desc" {
		if sortBy == "model_name" || sortBy == "vendor" {
			sortOrder = "asc"
		} else {
			sortOrder = "desc"
		}
	}

	pageInfo := common.GetPageQuery(c)
	needsFullEnrich := squareState != "" || sortBy != ""
	if needsFullEnrich && (pageInfo.GetPage() < 1 || pageInfo.GetPageSize() < 1) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid pagination"})
		return
	}
	offset, limit := pageInfo.GetStartIdx(), pageInfo.GetPageSize()
	if needsFullEnrich {
		// Visibility depends on live channels and metadata rules. Filter the
		// enriched candidate set before counting and paginating the results.
		offset, limit = 0, -1
	}
	search := model.SearchModels
	if c.Query("include_channel_models") == "true" {
		search = model.SearchModelsWithChannels
	}
	modelsMeta, total, err := search(keyword, vendor, c.Query("status"), c.Query("sync_official"), offset, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := enrichModels(modelsMeta); err != nil {
		common.ApiError(c, err)
		return
	}
	if squareState != "" {
		filtered := make([]*model.Model, 0, len(modelsMeta))
		for _, metadata := range modelsMeta {
			if metadata.SquareState == squareState {
				filtered = append(filtered, metadata)
			}
		}
		modelsMeta = filtered
	}
	if sortBy != "" {
		var vendorNames map[int]string
		if sortBy == "vendor" {
			vendorNames = loadVendorNameMap()
		}
		sortModelsMeta(modelsMeta, sortBy, sortOrder == "desc", vendorNames)
	}
	if needsFullEnrich {
		total = int64(len(modelsMeta))
		start := len(modelsMeta)
		if pageInfo.GetPage()-1 <= len(modelsMeta)/pageInfo.GetPageSize() {
			start = (pageInfo.GetPage() - 1) * pageInfo.GetPageSize()
		}
		end := min(start+pageInfo.GetPageSize(), len(modelsMeta))
		modelsMeta = modelsMeta[start:end]
	}

	vendorCounts, _ := model.GetVendorModelCounts()
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(modelsMeta)
	common.ApiSuccess(c, gin.H{
		"items":         modelsMeta,
		"total":         total,
		"page":          pageInfo.GetPage(),
		"page_size":     pageInfo.GetPageSize(),
		"vendor_counts": vendorCounts,
	})
}

// GetModelMeta 根据 ID 获取单条模型信息
func GetModelMeta(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var m model.Model
	if err := model.DB.First(&m, id).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	if err := enrichModels([]*model.Model{&m}); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &m)
}

// CreateModelMeta 新建模型
func CreateModelMeta(c *gin.Context) {
	var m model.Model
	if err := c.ShouldBindJSON(&m); err != nil {
		common.ApiError(c, err)
		return
	}
	if m.ModelName == "" {
		common.ApiErrorT(c, "Model name cannot be empty")
		return
	}
	m.Tags = model.NormalizeModelTags(m.Tags)
	if err := model.ValidateMetadataValues(model.MetadataValues{Tags: m.Tags, Endpoints: m.Endpoints, Status: m.Status, NameRule: m.NameRule}); err != nil {
		common.ApiError(c, err)
		return
	}
	// 名称冲突检查
	if dup, err := model.IsModelNameDuplicated(0, m.ModelName); err != nil {
		common.ApiError(c, err)
		return
	} else if dup {
		common.ApiErrorT(c, "Model name already exists")
		return
	}

	beforeModels := captureModelAvailabilitySnapshot()
	if err := m.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	model.RefreshPricing()
	syncModelAvailabilityNotices(c, beforeModels)
	m.HasMetadata = m.Id > 0
	common.ApiSuccess(c, &m)
}

// UpdateModelMeta 更新模型
func UpdateModelMeta(c *gin.Context) {
	statusOnly := c.Query("status_only") == "true"

	var m model.Model
	if err := c.ShouldBindJSON(&m); err != nil {
		common.ApiError(c, err)
		return
	}
	if m.Id == 0 {
		common.ApiErrorT(c, "Missing model ID")
		return
	}
	beforeModels := captureModelAvailabilitySnapshot()

	if statusOnly {
		if m.Status != 0 && m.Status != 1 {
			common.ApiErrorMsg(c, "invalid catalog visibility")
			return
		}
		// 只更新状态，防止误清空其他字段
		if err := model.DB.Model(&model.Model{}).Where("id = ?", m.Id).Update("status", m.Status).Error; err != nil {
			common.ApiError(c, err)
			return
		}
		model.BumpSyncTopic(model.SyncTopicModels)
	} else {
		if strings.TrimSpace(m.ModelName) == "" {
			common.ApiErrorT(c, "Model name cannot be empty")
			return
		}
		m.Tags = model.NormalizeModelTags(m.Tags)
		if err := model.ValidateMetadataValues(model.MetadataValues{Tags: m.Tags, Endpoints: m.Endpoints, Status: m.Status, NameRule: m.NameRule}); err != nil {
			common.ApiError(c, err)
			return
		}
		// 名称冲突检查
		if dup, err := model.IsModelNameDuplicated(m.Id, m.ModelName); err != nil {
			common.ApiError(c, err)
			return
		} else if dup {
			common.ApiErrorT(c, "Model name already exists")
			return
		}

		if err := m.Update(); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	model.RefreshPricing()
	syncModelAvailabilityNotices(c, beforeModels)
	m.HasMetadata = m.Id > 0
	common.ApiSuccess(c, &m)
}

// DeleteModelMeta 删除模型
func DeleteModelMeta(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	removeFromChannels, err := strconv.ParseBool(c.DefaultQuery("remove_from_channels", "false"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	removePricing, err := strconv.ParseBool(c.DefaultQuery("remove_pricing", "false"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if removePricing && c.GetInt("role") != common.RoleRootUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Model pricing is managed by a super administrator."})
		return
	}
	beforeModels := captureModelAvailabilitySnapshot()
	result, err := model.DeleteModelMetadata([]int{id}, removeFromChannels, removePricing)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	syncModelAvailabilityNotices(c, beforeModels)
	recordManageAudit(c, "model.delete", map[string]any{"model_ids": []int{id}, "remove_from_channels": removeFromChannels, "remove_pricing": removePricing, "updated_channels": result.UpdatedChannels})
	common.ApiSuccess(c, result)
}

func BatchDeleteModelMeta(c *gin.Context) {
	var request struct {
		ModelIDs           []int    `json:"model_ids"`
		ChannelModels      []string `json:"channel_models"`
		RemoveFromChannels bool     `json:"remove_from_channels"`
		RemovePricing      bool     `json:"remove_pricing"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiError(c, err)
		return
	}
	if request.RemovePricing && c.GetInt("role") != common.RoleRootUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Model pricing is managed by a super administrator."})
		return
	}
	beforeModels := captureModelAvailabilitySnapshot()
	result, err := model.DeleteModels(request.ModelIDs, request.ChannelModels, request.RemoveFromChannels, request.RemovePricing)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	syncModelAvailabilityNotices(c, beforeModels)
	auditPayload := map[string]any{
		"model_ids":            request.ModelIDs,
		"remove_from_channels": request.RemoveFromChannels,
		"remove_pricing":       request.RemovePricing,
		"updated_channels":     result.UpdatedChannels,
	}
	if len(request.ChannelModels) > 0 {
		auditPayload["channel_models"] = request.ChannelModels
	}
	recordManageAudit(c, "model.delete_batch", auditPayload)
	common.ApiSuccess(c, result)
}

func BatchUpdateModelMeta(c *gin.Context) {
	var request model.ModelBatchUpdateRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiError(c, err)
		return
	}
	beforeModels := captureModelAvailabilitySnapshot()
	result, err := model.BatchUpdateModels(request)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	syncModelAvailabilityNotices(c, beforeModels)
	auditPayload := map[string]any{
		"model_ids":     request.ModelIDs,
		"updated_count": result.UpdatedCount,
		"created_count": result.CreatedCount,
	}
	if len(request.ChannelModels) > 0 {
		auditPayload["channel_models"] = request.ChannelModels
	}
	recordManageAudit(c, "model.update_batch", auditPayload)
	common.ApiSuccess(c, result)
}

func loadVendorNameMap() map[int]string {
	var vendors []model.Vendor
	result := make(map[int]string)
	if err := model.DB.Select("id", "name").Find(&vendors).Error; err != nil {
		return result
	}
	for _, vendor := range vendors {
		result[vendor.Id] = strings.ToLower(strings.TrimSpace(vendor.Name))
	}
	return result
}

func modelConfigIssueScore(metadata *model.Model) int {
	if metadata == nil {
		return 0
	}
	score := 0
	if metadata.Id <= 0 {
		score += 100
	}
	if metadata.SquareState == model.ModelSquareUnavailable {
		score += 40
	} else if metadata.SquareState == model.ModelSquarePartial {
		score += 15
	}
	if metadata.Id > 0 && metadata.VendorID <= 0 {
		score += 25
	}
	if metadata.Id > 0 && strings.TrimSpace(metadata.Description) == "" {
		score += 10
	}
	if metadata.Id > 0 {
		_, declarations := model.SplitCatalogTaskTags(metadata.Tags)
		if declarations == "" {
			score += 5
		}
	}
	return score
}

func sortModelsMeta(modelsMeta []*model.Model, sortBy string, desc bool, vendorNames map[int]string) {
	sort.SliceStable(modelsMeta, func(i, j int) bool {
		left, right := modelsMeta[i], modelsMeta[j]
		cmp := 0
		switch sortBy {
		case "id":
			if left.Id != right.Id {
				if left.Id < right.Id {
					cmp = -1
				} else {
					cmp = 1
				}
			}
		case "model_name":
			cmp = strings.Compare(strings.ToLower(left.ModelName), strings.ToLower(right.ModelName))
		case "vendor":
			leftVendor := vendorNames[left.VendorID]
			rightVendor := vendorNames[right.VendorID]
			if leftVendor == "" && rightVendor != "" {
				return false
			}
			if leftVendor != "" && rightVendor == "" {
				return true
			}
			cmp = strings.Compare(leftVendor, rightVendor)
		case "updated_time":
			if left.UpdatedTime != right.UpdatedTime {
				if left.UpdatedTime < right.UpdatedTime {
					cmp = -1
				} else {
					cmp = 1
				}
			}
		case "created_time":
			if left.CreatedTime != right.CreatedTime {
				if left.CreatedTime < right.CreatedTime {
					cmp = -1
				} else {
					cmp = 1
				}
			}
		case "channels":
			leftChannels := len(left.BoundChannels)
			rightChannels := len(right.BoundChannels)
			if leftChannels != rightChannels {
				if leftChannels < rightChannels {
					cmp = -1
				} else {
					cmp = 1
				}
			} else if left.ConfiguredChannelCount != right.ConfiguredChannelCount {
				if left.ConfiguredChannelCount < right.ConfiguredChannelCount {
					cmp = -1
				} else {
					cmp = 1
				}
			}
		case "issues":
			leftScore := modelConfigIssueScore(left)
			rightScore := modelConfigIssueScore(right)
			if leftScore != rightScore {
				if leftScore < rightScore {
					cmp = -1
				} else {
					cmp = 1
				}
			}
		}
		if cmp == 0 {
			return strings.ToLower(left.ModelName) < strings.ToLower(right.ModelName)
		}
		if desc {
			return cmp > 0
		}
		return cmp < 0
	})
}

// enrichModels keeps configured endpoints intact and derives connections from
// enabled routes, including hidden or unpriced models absent from the catalog.
func enrichModels(models []*model.Model) error {
	if len(models) == 0 {
		return nil
	}
	configured, err := model.GetConfiguredModelChannels()
	if err != nil {
		return err
	}
	for _, metadata := range models {
		if metadata == nil {
			continue
		}
		metadata.HasMetadata = metadata.Id > 0
		channelIDs := make(map[int]struct{})
		for name, ids := range configured {
			if metadata.MatchesName(name) {
				for _, id := range ids {
					channelIDs[id] = struct{}{}
				}
			}
		}
		metadata.ConfiguredChannelCount = len(channelIDs)
	}
	connections, err := model.GetModelConnections()
	if err != nil {
		return err
	}
	if err := model.FillModelSquareStates(models, configured, connections); err != nil {
		return err
	}
	for _, metadata := range models {
		if metadata == nil {
			continue
		}
		channels := make(map[int]model.BoundChannel)
		groups := make(map[string]bool)
		names := make(map[string]bool)
		endpoints := make(map[string]bool)
		quotas := make(map[int]bool)
		for _, connection := range connections {
			name := connection.Model
			if !metadata.MatchesName(name) {
				continue
			}
			names[name] = true
			groups[connection.Group] = true
			channels[connection.ChannelId] = model.BoundChannel{Name: connection.ChannelName, Type: connection.ChannelType}
			for _, endpoint := range model.GetModelSupportEndpointTypes(name) {
				endpoints[string(endpoint)] = true
			}
			for _, quota := range model.GetModelQuotaTypes(name) {
				quotas[quota] = true
			}
		}
		metadata.BoundChannels = nil
		metadata.EnableGroups = nil
		metadata.SupportedEndpoints = nil
		metadata.QuotaTypes = nil
		metadata.MatchedModels = nil
		for _, channel := range channels {
			metadata.BoundChannels = append(metadata.BoundChannels, channel)
		}
		sort.Slice(metadata.BoundChannels, func(i, j int) bool {
			a, b := metadata.BoundChannels[i], metadata.BoundChannels[j]
			if a.Name == b.Name {
				return a.Type < b.Type
			}
			return a.Name < b.Name
		})
		for group := range groups {
			metadata.EnableGroups = append(metadata.EnableGroups, group)
		}
		for endpoint := range endpoints {
			metadata.SupportedEndpoints = append(metadata.SupportedEndpoints, endpoint)
		}
		for quota := range quotas {
			metadata.QuotaTypes = append(metadata.QuotaTypes, quota)
		}
		sort.Strings(metadata.EnableGroups)
		sort.Strings(metadata.SupportedEndpoints)
		sort.Ints(metadata.QuotaTypes)
		if metadata.NameRule != model.NameRuleExact {
			for name := range names {
				metadata.MatchedModels = append(metadata.MatchedModels, name)
			}
			sort.Strings(metadata.MatchedModels)
			metadata.MatchedCount = len(names)
		}
	}
	return nil
}
