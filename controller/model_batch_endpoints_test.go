package controller

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func testBatchModelEndpoints(t *testing.T, db *gorm.DB) {
	t.Helper()

	channel := model.Channel{
		Name:   "batch-endpoints-channel",
		Group:  "default",
		Models: "batch-ep-a,batch-ep-b,batch-ep-channel-only",
		Status: 1,
		Type:   constant.ChannelTypeOpenAI,
	}
	require.NoError(t, db.Create(&channel).Error)
	require.NoError(t, channel.AddAbilities(db))
	t.Cleanup(func() {
		require.NoError(t, db.Where("channel_id = ?", channel.Id).Delete(&model.Ability{}).Error)
		require.NoError(t, db.Where("id = ?", channel.Id).Delete(&model.Channel{}).Error)
		require.NoError(t, db.Unscoped().Where("model_name LIKE ?", "batch-ep-%").Delete(&model.Model{}).Error)
		model.RefreshPricing()
	})

	modelA := model.Model{
		ModelName:    "batch-ep-a",
		Status:       1,
		SyncOfficial: 1,
		NameRule:     model.NameRuleExact,
		Endpoints:    `{"image-generation":{"path":"/v1/images/generations","method":"POST"}}`,
	}
	modelB := model.Model{
		ModelName:    "batch-ep-b",
		Status:       1,
		SyncOfficial: 1,
		NameRule:     model.NameRuleExact,
		Endpoints:    `["openai"]`,
	}
	require.NoError(t, db.Create(&modelA).Error)
	require.NoError(t, db.Create(&modelB).Error)

	type batchResponse struct {
		Success bool                         `json:"success"`
		Message string                       `json:"message"`
		Data    model.ModelBatchUpdateResult `json:"data"`
	}

	// 1. Append endpoints across existing models and a channel-only model.
	var appendRes batchResponse
	modelManagementRequest(t, BatchUpdateModelMeta, http.MethodPost, "/api/models/batch_update", model.ModelBatchUpdateRequest{
		ModelIDs:      []int{modelA.Id, modelB.Id},
		ChannelModels: []string{"batch-ep-channel-only"},
		EndpointsMode: "append",
		Endpoints:     `{"image-edits":{"path":"/v1/images/edits","method":"POST"}}`,
	}, &appendRes)
	require.True(t, appendRes.Success, appendRes.Message)
	assert.Equal(t, 2, appendRes.Data.UpdatedCount)
	assert.Equal(t, 1, appendRes.Data.CreatedCount)

	var reloadedA, reloadedB, createdChannel model.Model
	require.NoError(t, db.First(&reloadedA, modelA.Id).Error)
	require.NoError(t, db.First(&reloadedB, modelB.Id).Error)
	require.NoError(t, db.Where("model_name = ?", "batch-ep-channel-only").First(&createdChannel).Error)

	assert.JSONEq(t, `{
		"image-generation":{"path":"/v1/images/generations","method":"POST"},
		"image-edits":{"path":"/v1/images/edits","method":"POST"}
	}`, reloadedA.Endpoints)
	assert.JSONEq(t, `{
		"openai":{"path":"/v1/chat/completions","method":"POST"},
		"image-edits":{"path":"/v1/images/edits","method":"POST"}
	}`, reloadedB.Endpoints)
	assert.JSONEq(t, `{"image-edits":{"path":"/v1/images/edits","method":"POST"}}`, createdChannel.Endpoints)
	assert.Contains(t, model.GetModelSupportEndpointTypes("batch-ep-a"), constant.EndpointType("image-edits"))
	assert.Contains(t, model.GetModelSupportEndpointTypes("batch-ep-channel-only"), constant.EndpointType("image-edits"))

	// 2. Omitting endpoints_mode preserves endpoints when updating another field.
	statusHidden := 0
	var statusRes batchResponse
	modelManagementRequest(t, BatchUpdateModelMeta, http.MethodPost, "/api/models/batch_update", model.ModelBatchUpdateRequest{
		ModelIDs: []int{modelA.Id},
		Status:   &statusHidden,
	}, &statusRes)
	require.True(t, statusRes.Success, statusRes.Message)
	require.NoError(t, db.First(&reloadedA, modelA.Id).Error)
	assert.Equal(t, 0, reloadedA.Status)
	assert.JSONEq(t, `{
		"image-generation":{"path":"/v1/images/generations","method":"POST"},
		"image-edits":{"path":"/v1/images/edits","method":"POST"}
	}`, reloadedA.Endpoints)

	// 3. Remove specified endpoint keys across models (last key cleared to empty string).
	var removeRes batchResponse
	modelManagementRequest(t, BatchUpdateModelMeta, http.MethodPost, "/api/models/batch_update", model.ModelBatchUpdateRequest{
		ModelIDs:      []int{modelA.Id, createdChannel.Id},
		EndpointsMode: "remove",
		EndpointKeys:  []string{"image-edits"},
	}, &removeRes)
	require.True(t, removeRes.Success, removeRes.Message)
	require.NoError(t, db.First(&reloadedA, modelA.Id).Error)
	require.NoError(t, db.First(&createdChannel, createdChannel.Id).Error)
	assert.JSONEq(t, `{"image-generation":{"path":"/v1/images/generations","method":"POST"}}`, reloadedA.Endpoints)
	assert.Empty(t, createdChannel.Endpoints)

	// 4. Replace endpoints on multiple models.
	var replaceRes batchResponse
	modelManagementRequest(t, BatchUpdateModelMeta, http.MethodPost, "/api/models/batch_update", model.ModelBatchUpdateRequest{
		ModelIDs:      []int{modelA.Id, modelB.Id},
		EndpointsMode: "replace",
		Endpoints:     `{"openai-video":{"path":"/v1/videos","method":"POST"}}`,
	}, &replaceRes)
	require.True(t, replaceRes.Success, replaceRes.Message)
	require.NoError(t, db.First(&reloadedA, modelA.Id).Error)
	require.NoError(t, db.First(&reloadedB, modelB.Id).Error)
	assert.JSONEq(t, `{"openai-video":{"path":"/v1/videos","method":"POST"}}`, reloadedA.Endpoints)
	assert.JSONEq(t, `{"openai-video":{"path":"/v1/videos","method":"POST"}}`, reloadedB.Endpoints)

	// 5. Invalid payload fails without modifying existing rows.
	var invalidRes batchResponse
	modelManagementRequest(t, BatchUpdateModelMeta, http.MethodPost, "/api/models/batch_update", model.ModelBatchUpdateRequest{
		ModelIDs:      []int{modelA.Id, modelB.Id},
		EndpointsMode: "replace",
		Endpoints:     `{"bad":{"path":"no-leading-slash","method":"POST"}}`,
	}, &invalidRes)
	assert.False(t, invalidRes.Success)
	require.NoError(t, db.First(&reloadedA, modelA.Id).Error)
	assert.JSONEq(t, `{"openai-video":{"path":"/v1/videos","method":"POST"}}`, reloadedA.Endpoints)

	// 6. Clear custom endpoints across selected models.
	var clearRes batchResponse
	modelManagementRequest(t, BatchUpdateModelMeta, http.MethodPost, "/api/models/batch_update", model.ModelBatchUpdateRequest{
		ModelIDs:      []int{modelA.Id, modelB.Id},
		EndpointsMode: "clear",
	}, &clearRes)
	require.True(t, clearRes.Success, clearRes.Message)
	require.NoError(t, db.First(&reloadedA, modelA.Id).Error)
	require.NoError(t, db.First(&reloadedB, modelB.Id).Error)
	assert.Empty(t, reloadedA.Endpoints)
	assert.Empty(t, reloadedB.Endpoints)
}
