package controller

import (
	"bytes"
	"context"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type fetchChannelUpstreamRatiosRequest struct {
	ChannelID int     `json:"channel_id"`
	Type      int     `json:"type"`
	BaseURL   *string `json:"base_url"`
	Proxy     *string `json:"proxy"`
}

type UpstreamGroupRatioOption struct {
	Group       string  `json:"group"`
	Ratio       float64 `json:"ratio"`
	Description string  `json:"description,omitempty"`
}

type fetchChannelUpstreamRatiosResponse struct {
	Supported bool                       `json:"supported"`
	Source    string                     `json:"source,omitempty"`
	Groups    []UpstreamGroupRatioOption `json:"groups"`
}

func buildUpstreamPricingCandidateURLs(rawBaseURL string) ([]string, error) {
	trimmed := strings.TrimRight(strings.TrimSpace(rawBaseURL), "/")
	if trimmed == "" {
		return nil, common.NewMessage("Base URL is required to fetch upstream group ratios")
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, common.NewMessage("Invalid upstream base URL")
	}

	basePath := strings.TrimRight(parsed.Path, "/")
	for _, suffix := range []string{"/v1beta", "/v1"} {
		if strings.HasSuffix(strings.ToLower(basePath), suffix) {
			basePath = strings.TrimRight(basePath[:len(basePath)-len(suffix)], "/")
			break
		}
	}

	origin := parsed.Scheme + "://" + parsed.Host
	candidates := make([]string, 0, 2)
	if basePath != "" {
		candidates = append(candidates, origin+basePath+"/api/pricing")
	}
	candidates = append(candidates, origin+"/api/pricing")
	return candidates, nil
}

func parseUpstreamPricingGroupRatios(body []byte) ([]UpstreamGroupRatioOption, bool) {
	var payload struct {
		Success     *bool              `json:"success"`
		GroupRatio  map[string]float64 `json:"group_ratio"`
		UsableGroup map[string]string  `json:"usable_group"`
	}
	if err := common.DecodeJson(bytes.NewReader(body), &payload); err != nil {
		return nil, false
	}
	if payload.Success != nil && !*payload.Success {
		return nil, false
	}
	if len(payload.GroupRatio) == 0 {
		return nil, false
	}

	groups := make([]UpstreamGroupRatioOption, 0, len(payload.GroupRatio))
	for rawName, ratio := range payload.GroupRatio {
		name := strings.TrimSpace(rawName)
		if name == "" || name == "auto" {
			continue
		}
		if math.IsNaN(ratio) || math.IsInf(ratio, 0) || ratio < 0 || ratio > dto.MaxUpstreamGroupRatio {
			continue
		}
		desc := ""
		if payload.UsableGroup != nil {
			desc = strings.TrimSpace(payload.UsableGroup[name])
		}
		groups = append(groups, UpstreamGroupRatioOption{
			Group:       name,
			Ratio:       ratio,
			Description: desc,
		})
	}
	if len(groups) == 0 {
		return nil, false
	}

	sort.Slice(groups, func(i, j int) bool {
		if groups[i].Group == "default" && groups[j].Group != "default" {
			return true
		}
		if groups[j].Group == "default" && groups[i].Group != "default" {
			return false
		}
		return groups[i].Group < groups[j].Group
	})
	return groups, true
}

func FetchChannelUpstreamRatios(c *gin.Context) {
	var req fetchChannelUpstreamRatiosRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}

	var channelSettings dto.ChannelSettings
	baseURL := ""
	if req.BaseURL != nil {
		baseURL = strings.TrimSpace(*req.BaseURL)
	}
	if req.ChannelID > 0 {
		existing, err := model.GetChannelById(req.ChannelID, false)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		channelSettings = existing.GetSetting()
		if baseURL == "" {
			baseURL = strings.TrimSpace(existing.GetBaseURL())
		}
		if req.Type == 0 {
			req.Type = existing.Type
		}
	}
	if baseURL == "" {
		baseURL = strings.TrimSpace(constant.GetChannelBaseURL(req.Type))
	}
	if req.Proxy != nil {
		trimmedProxy := strings.TrimSpace(*req.Proxy)
		if trimmedProxy != "" {
			if err := service.ValidateProxyURL(trimmedProxy); err != nil {
				common.ApiError(c, err)
				return
			}
		}
		channelSettings.Proxy = trimmedProxy
	}

	candidates, err := buildUpstreamPricingCandidateURLs(baseURL)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, err)
		return
	}

	sharedClient, err := service.GetHttpClientWithProxySettings(channelSettings.Proxy, channelSettings)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	client := *sharedClient
	client.Timeout = time.Duration(defaultTimeoutSeconds) * time.Second

	for _, candidateURL := range candidates {
		ctx, cancel := context.WithTimeout(c.Request.Context(), time.Duration(defaultTimeoutSeconds)*time.Second)
		httpReq, reqErr := http.NewRequestWithContext(ctx, http.MethodGet, candidateURL, nil)
		if reqErr != nil {
			cancel()
			continue
		}
		httpReq.Header.Set("Accept", "application/json")
		resp, doErr := client.Do(httpReq)
		if doErr != nil {
			cancel()
			continue
		}
		bodyBytes, readErr := io.ReadAll(io.LimitReader(resp.Body, maxRatioConfigBytes))
		resp.Body.Close()
		cancel()
		if readErr != nil || resp.StatusCode != http.StatusOK {
			continue
		}
		if groups, ok := parseUpstreamPricingGroupRatios(bodyBytes); ok {
			common.ApiSuccess(c, fetchChannelUpstreamRatiosResponse{
				Supported: true,
				Source:    candidateURL,
				Groups:    groups,
			})
			return
		}
	}

	common.ApiSuccess(c, fetchChannelUpstreamRatiosResponse{
		Supported: false,
		Groups:    []UpstreamGroupRatioOption{},
	})
}
