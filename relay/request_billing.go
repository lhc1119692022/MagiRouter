package relay

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
)

func buildRequestTokenCountMeta(info *relaycommon.RelayInfo) *types.TokenCountMeta {
	meta := &types.TokenCountMeta{TokenType: types.TokenTypeTokenizer}
	if info == nil || info.Request == nil {
		return meta
	}
	if constant.CountToken {
		return info.Request.GetTokenCountMeta()
	}
	// Avoid building CombineText when only the pricing quantities are needed.
	switch request := info.Request.(type) {
	case *dto.GeneralOpenAIRequest:
		meta.MaxTokens = int(max(lo.FromPtr(request.MaxTokens), lo.FromPtr(request.MaxCompletionTokens)))
	case *dto.OpenAIResponsesRequest:
		meta.MaxTokens = int(lo.FromPtr(request.MaxOutputTokens))
	case *dto.ClaudeRequest:
		meta.MaxTokens = int(lo.FromPtr(request.MaxTokens))
	case *dto.ImageRequest:
		meta = request.GetTokenCountMeta()
	}
	return meta
}

// PrepareRequestBilling estimates and reserves one request's charge. Transports
// provide the current request body through BodyStorage or BillingRequestInput;
// channel retries retain the resulting billing session and pricing snapshot.
func PrepareRequestBilling(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	meta := buildRequestTokenCountMeta(info)

	tokens, err := service.EstimateRequestToken(c, meta, info)
	if err != nil {
		return types.NewError(err, types.ErrorCodeCountTokenFailed)
	}
	info.SetEstimatePromptTokens(tokens)

	priceData, err := helper.ModelPriceHelper(c, info, tokens, meta)
	if err != nil {
		return types.NewError(err, types.ErrorCodeModelPriceError, types.ErrOptionWithStatusCode(http.StatusBadRequest))
	}
	if priceData.FreeModel {
		logger.LogInfo(c, common.LogText("model %s is free, skipping pre-consume", info.OriginModelName))
		return nil
	}
	return service.PreConsumeBilling(c, priceData.QuotaToPreConsume, info)
}

// PrepareBillingForSelectedGroup refreshes group-dependent billing state before
// an upstream attempt. When a model defines per-group billing overrides and the
// selected group resolves to a different expression or billing mode, it rebuilds
// the pricing state and reserves any higher estimate.
func PrepareBillingForSelectedGroup(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	if info == nil {
		return nil
	}
	billingModelName := info.GetBillingModelName()
	if !billing_setting.HasGroupBillingExprForModel(billingModelName) {
		return service.PrepareTieredBillingForSelectedGroup(c, info)
	}

	info.PriceData.GroupRatioInfo = helper.HandleGroupRatio(c, info)
	targetExpr, hasTargetExpr := billing_setting.ResolveGroupBillingExpr(info.UsingGroup, billingModelName)
	if !hasTargetExpr && billing_setting.GetBillingMode(billingModelName) == billing_setting.BillingModeTieredExpr {
		targetExpr, hasTargetExpr = billing_setting.GetBillingExpr(billingModelName)
	}

	snap := info.TieredBillingSnapshot
	if hasTargetExpr && snap != nil && snap.BillingMode == billing_setting.BillingModeTieredExpr && snap.ExprString == targetExpr {
		return service.PrepareTieredBillingForSelectedGroup(c, info)
	}
	if !hasTargetExpr && snap == nil {
		return nil
	}

	info.TieredBillingSnapshot = nil
	info.BillingImageCount = nil
	if _, isImage := info.Request.(*dto.ImageRequest); isImage {
		info.BillingRequestInput = nil
	}
	priceData, err := helper.ModelPriceHelper(c, info, info.GetEstimatePromptTokens(), buildRequestTokenCountMeta(info))
	if err != nil {
		return types.NewError(err, types.ErrorCodeModelPriceError, types.ErrOptionWithStatusCode(http.StatusBadRequest), types.ErrOptionWithSkipRetry())
	}
	if priceData.FreeModel && info.Billing == nil {
		return nil
	}
	if priceData.QuotaToPreConsume <= 0 {
		return nil
	}
	info.PriceData.FreeModel = false
	if info.Billing == nil {
		return service.PreConsumeBilling(c, priceData.QuotaToPreConsume, info)
	}
	if err := info.Billing.Reserve(priceData.QuotaToPreConsume); err != nil {
		return types.NewError(err, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
	}
	info.FinalPreConsumedQuota = info.Billing.GetPreConsumedQuota()
	return nil
}
// RefundFailedRequestBilling applies the common final-failure policy after all
// eligible attempts have ended. A settled BillingSession never refunds again.
func RefundFailedRequestBilling(c *gin.Context, info *relaycommon.RelayInfo, apiErr *types.NewAPIError) *types.NewAPIError {
	if apiErr == nil {
		return nil
	}
	apiErr = service.NormalizeViolationFeeError(apiErr)
	if info.Billing != nil {
		info.Billing.Refund(c)
	}
	service.ChargeViolationFeeIfNeeded(c, info, apiErr)
	return apiErr
}
