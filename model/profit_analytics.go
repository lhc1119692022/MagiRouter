package model

import (
	"cmp"
	"errors"
	"fmt"
	"math"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm"
)

type ProfitAnalyticsOptions struct {
	RecentOrderLimit  int
	ExcludeAdminUsers *bool
}

type ProfitPricingReference struct {
	DefaultGroupRatio float64            `json:"default_group_ratio"`
	GroupRatios       map[string]float64 `json:"group_ratios"`
}

type ProfitCurrencyMeta struct {
	QuotaPerUnit      float64 `json:"quota_per_unit"`
	DisplayType       string  `json:"display_type"`
	Symbol            string  `json:"symbol"`
	USDExchangeRate   float64 `json:"usd_exchange_rate"`
	USDToCurrencyRate float64 `json:"usd_to_currency_rate"`
	TopUpPrice        float64 `json:"topup_price"`
}

type ProfitSummary struct {
	RangeDays                int     `json:"range_days"`
	StartTime                int64   `json:"start_time"`
	EndTime                  int64   `json:"end_time"`
	ExcludeAdminUsers        bool    `json:"exclude_admin_users"`
	ExcludedAdminCount       int     `json:"excluded_admin_count"`
	CashRevenue              float64 `json:"cash_revenue"`
	WalletTopUpMoney         float64 `json:"wallet_topup_money"`
	WalletTopUpOrders        int     `json:"wallet_topup_orders"`
	SubscriptionDirectMoney  float64 `json:"subscription_direct_money"`
	SubscriptionDirectOrders int     `json:"subscription_direct_orders"`
	SubscriptionBalanceMoney float64 `json:"subscription_balance_money"`
	SubscriptionBalanceCount int     `json:"subscription_balance_orders"`
	PaymentFeeCost           float64 `json:"payment_fee_cost"`
	NetCashInflow            float64 `json:"net_cash_inflow"`
	BilledQuota              int64   `json:"billed_quota"`
	BilledUSD                float64 `json:"billed_usd"`
	BilledLocal              float64 `json:"billed_local"`
	TotalRequests            int64   `json:"total_requests"`
	TotalTokens              int64   `json:"total_tokens"`
	PayingUsers              int     `json:"paying_users"`
	ActiveUsers              int     `json:"active_users"`
	UpstreamVariableCost     float64 `json:"upstream_variable_cost"`
	ChannelFixedCost         float64 `json:"channel_fixed_cost"`
	PlatformFixedCost        float64 `json:"platform_fixed_cost"`
	TotalEstimatedCost       float64 `json:"total_estimated_cost"`
	CashNetProfit            float64 `json:"cash_net_profit"`
	CashNetMargin            float64 `json:"cash_net_margin"`
	BilledGrossProfit        float64 `json:"billed_gross_profit"`
	BilledGrossMargin        float64 `json:"billed_gross_margin"`
	BilledNetProfit          float64 `json:"billed_net_profit"`
	BilledNetMargin          float64 `json:"billed_net_margin"`
}

type ProfitLiabilitySnapshot struct {
	UserRemainingQuota         int64   `json:"user_remaining_quota"`
	UserRemainingUSD           float64 `json:"user_remaining_usd"`
	UserRemainingLocal         float64 `json:"user_remaining_local"`
	SubscriptionRemainingQuota int64   `json:"subscription_remaining_quota"`
	SubscriptionRemainingUSD   float64 `json:"subscription_remaining_usd"`
	SubscriptionRemainingLocal float64 `json:"subscription_remaining_local"`
	RedeemedQuota              int64   `json:"redeemed_quota"`
	RedeemedUSD                float64 `json:"redeemed_usd"`
	RedeemedLocal              float64 `json:"redeemed_local"`
	RedeemedCount              int64   `json:"redeemed_count"`
	CheckinQuota               int64   `json:"checkin_quota"`
	CheckinUSD                 float64 `json:"checkin_usd"`
	CheckinLocal               float64 `json:"checkin_local"`
	CheckinCount               int64   `json:"checkin_count"`
}

type ProfitDailyTrendPoint struct {
	Date                    string  `json:"date"`
	CashRevenue             float64 `json:"cash_revenue"`
	WalletTopUpMoney        float64 `json:"wallet_topup_money"`
	SubscriptionDirectMoney float64 `json:"subscription_direct_money"`
	PaymentFee              float64 `json:"payment_fee"`
	BilledUSD               float64 `json:"billed_usd"`
	BilledLocal             float64 `json:"billed_local"`
	UpstreamCost            float64 `json:"upstream_cost"`
	FixedCost               float64 `json:"fixed_cost"`
	TotalCost               float64 `json:"total_cost"`
	CashNetProfit           float64 `json:"cash_net_profit"`
	BilledGrossProfit       float64 `json:"billed_gross_profit"`
	BilledNetProfit         float64 `json:"billed_net_profit"`
	Requests                int64   `json:"requests"`
	Tokens                  int64   `json:"tokens"`
	Orders                  int     `json:"orders"`
}

type ProfitChannelBreakdown struct {
	ChannelId               int      `json:"channel_id"`
	ChannelName             string   `json:"channel_name"`
	ChannelType             int      `json:"channel_type"`
	Group                   string   `json:"group"`
	Tag                     string   `json:"tag"`
	Status                  int      `json:"status"`
	Balance                 float64  `json:"balance"`
	Requests                int64    `json:"requests"`
	Tokens                  int64    `json:"tokens"`
	BilledQuota             int64    `json:"billed_quota"`
	BilledUSD               float64  `json:"billed_usd"`
	BilledLocal             float64  `json:"billed_local"`
	CostRatio               float64  `json:"cost_ratio"`
	CustomCostRatio         bool     `json:"custom_cost_ratio"`
	PricingMode             string   `json:"pricing_mode,omitempty"`
	UpstreamValue           *float64 `json:"upstream_value,omitempty"`
	PlatformValue           *float64 `json:"platform_value,omitempty"`
	SuggestedGroupRatio     float64  `json:"suggested_group_ratio"`
	SuggestedUnitPrice      float64  `json:"suggested_unit_price,omitempty"`
	SuggestedUnitPriceModel string   `json:"suggested_unit_price_model,omitempty"`
	VariableCost            float64  `json:"variable_cost"`
	MonthlyFixedCost        float64  `json:"monthly_fixed_cost"`
	AmortizedFixedCost      float64  `json:"amortized_fixed_cost"`
	GrossProfit             float64  `json:"gross_profit"`
	NetProfit               float64  `json:"net_profit"`
	MarginRate              float64  `json:"margin_rate"`
	Note                    string   `json:"note"`
}

type ProfitModelBreakdown struct {
	ModelName     string  `json:"model_name"`
	Requests      int64   `json:"requests"`
	Tokens        int64   `json:"tokens"`
	BilledQuota   int64   `json:"billed_quota"`
	BilledUSD     float64 `json:"billed_usd"`
	BilledLocal   float64 `json:"billed_local"`
	EstimatedCost float64 `json:"estimated_cost"`
	GrossProfit   float64 `json:"gross_profit"`
	MarginRate    float64 `json:"margin_rate"`
}

type ProfitGroupBreakdown struct {
	Group         string  `json:"group"`
	Requests      int64   `json:"requests"`
	ActiveUsers   int     `json:"active_users"`
	Tokens        int64   `json:"tokens"`
	BilledQuota   int64   `json:"billed_quota"`
	BilledUSD     float64 `json:"billed_usd"`
	BilledLocal   float64 `json:"billed_local"`
	EstimatedCost float64 `json:"estimated_cost"`
	GrossProfit   float64 `json:"gross_profit"`
	MarginRate    float64 `json:"margin_rate"`
}

type ProfitPaymentMethodBreakdown struct {
	PaymentMethod string  `json:"payment_method"`
	OrderCount    int     `json:"order_count"`
	GrossMoney    float64 `json:"gross_money"`
	FeeRate       float64 `json:"fee_rate"`
	EstimatedFee  float64 `json:"estimated_fee"`
	NetMoney      float64 `json:"net_money"`
	IsInternal    bool    `json:"is_internal"`
}

type ProfitRecentOrderItem struct {
	OrderType       string  `json:"order_type"`
	TradeNo         string  `json:"trade_no"`
	UserId          int     `json:"user_id"`
	Username        string  `json:"username"`
	DisplayName     string  `json:"display_name"`
	PaymentMethod   string  `json:"payment_method"`
	PaymentProvider string  `json:"payment_provider"`
	Money           float64 `json:"money"`
	Amount          int64   `json:"amount"`
	PlanTitle       string  `json:"plan_title,omitempty"`
	CompletedAt     int64   `json:"completed_at"`
	IsInternal      bool    `json:"is_internal"`
}

type ProfitAnalyticsReport struct {
	Currency       ProfitCurrencyMeta                       `json:"currency"`
	PricingRef     ProfitPricingReference                   `json:"pricing_ref"`
	CostSettings   operation_setting.ProfitAnalyticsSetting `json:"cost_settings"`
	Summary        ProfitSummary                            `json:"summary"`
	Liability      ProfitLiabilitySnapshot                  `json:"liability"`
	DailyTrend     []ProfitDailyTrendPoint                  `json:"daily_trend"`
	Channels       []ProfitChannelBreakdown                 `json:"channels"`
	Models         []ProfitModelBreakdown                   `json:"models"`
	Groups         []ProfitGroupBreakdown                   `json:"groups"`
	PaymentMethods []ProfitPaymentMethodBreakdown           `json:"payment_methods"`
	RecentOrders   []ProfitRecentOrderItem                  `json:"recent_orders"`
}

func roundMoney(value float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return math.Round(value*100) / 100
}

func roundPercent(value float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return math.Round(value*100) / 100
}

func roundRatio6(value float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return math.Round(value*1e6) / 1e6
}

func loadProfitLocation() *time.Location {
	if loc, err := time.LoadLocation("Asia/Shanghai"); err == nil && loc != nil {
		return loc
	}
	return time.FixedZone("CST", 8*3600)
}

func profitCurrencyMeta() ProfitCurrencyMeta {
	quotaPerUnit := common.QuotaPerUnit
	if quotaPerUnit <= 0 {
		quotaPerUnit = 500000
	}
	displayType := operation_setting.GetQuotaDisplayType()
	symbol := operation_setting.GetCurrencySymbol()
	rate := operation_setting.GetUsdToCurrencyRate(operation_setting.USDExchangeRate)
	if rate <= 0 {
		rate = 1
	}
	if symbol == "" {
		symbol = "$"
	}
	return ProfitCurrencyMeta{
		QuotaPerUnit:      quotaPerUnit,
		DisplayType:       displayType,
		Symbol:            symbol,
		USDExchangeRate:   operation_setting.USDExchangeRate,
		USDToCurrencyRate: rate,
		TopUpPrice:        operation_setting.Price,
	}
}

func quotaToUSDAndLocal(quota int64, meta ProfitCurrencyMeta) (float64, float64) {
	usd := float64(quota) / meta.QuotaPerUnit
	return usd, usd * meta.USDToCurrencyRate
}

func GetProfitAnalytics(startTime, endTime int64, opts ProfitAnalyticsOptions) (*ProfitAnalyticsReport, error) {
	if DB == nil {
		return nil, errors.New("database is not initialized")
	}
	if endTime < startTime {
		return nil, common.NewMessage("Invalid time range")
	}
	recentOrderLimit := opts.RecentOrderLimit
	if recentOrderLimit <= 0 || recentOrderLimit > 200 {
		recentOrderLimit = 50
	}

	loc := loadProfitLocation()
	costCfg := operation_setting.GetProfitAnalyticsSettingSnapshot()
	currency := profitCurrencyMeta()
	nowUnix := time.Now().Unix()

	groupRatios := ratio_setting.GetGroupRatioCopy()
	defaultGroupRatio := groupRatios[ratio_setting.DefaultGroupName]
	if defaultGroupRatio <= 0 {
		defaultGroupRatio = ratio_setting.GetGroupRatio(ratio_setting.DefaultGroupName)
	}
	if defaultGroupRatio <= 0 {
		defaultGroupRatio = 1
	}
	pricingRef := ProfitPricingReference{
		DefaultGroupRatio: roundRatio6(defaultGroupRatio),
		GroupRatios:       groupRatios,
	}

	excludeAdmins := costCfg.ExcludeAdminUsers
	if opts.ExcludeAdminUsers != nil {
		excludeAdmins = *opts.ExcludeAdminUsers
	}
	var adminUserIDs []int
	adminUserIDSet := make(map[int]struct{})
	if excludeAdmins {
		if err := DB.Unscoped().Model(&User{}).
			Where("role >= ?", common.RoleAdminUser).
			Pluck("id", &adminUserIDs).Error; err != nil {
			return nil, err
		}
		for _, uid := range adminUserIDs {
			adminUserIDSet[uid] = struct{}{}
		}
	}
	isExcludedAdmin := func(userID int) bool {
		if !excludeAdmins || userID <= 0 {
			return false
		}
		_, excluded := adminUserIDSet[userID]
		return excluded
	}
	adminUserSubQuery := func() *gorm.DB {
		return DB.Unscoped().Model(&User{}).Select("id").Where("role >= ?", common.RoleAdminUser)
	}

	startDate := time.Unix(startTime, 0).In(loc)
	endDate := time.Unix(endTime, 0).In(loc)
	startDay := time.Date(startDate.Year(), startDate.Month(), startDate.Day(), 0, 0, 0, 0, loc)
	endDay := time.Date(endDate.Year(), endDate.Month(), endDate.Day(), 0, 0, 0, 0, loc)

	dailyOrder := make([]string, 0, 32)
	dailyMap := make(map[string]*ProfitDailyTrendPoint)
	for cursor := startDay; !cursor.After(endDay); cursor = cursor.AddDate(0, 0, 1) {
		dateKey := cursor.Format("2006-01-02")
		dailyOrder = append(dailyOrder, dateKey)
		dailyMap[dateKey] = &ProfitDailyTrendPoint{Date: dateKey}
	}
	rangeDays := max(1, len(dailyOrder))
	ensureDailyPoint := func(ts int64) *ProfitDailyTrendPoint {
		dateKey := time.Unix(ts, 0).In(loc).Format("2006-01-02")
		if point, ok := dailyMap[dateKey]; ok {
			return point
		}
		return nil
	}

	// 1. Load completed subscription orders in range.
	var subOrders []SubscriptionOrder
	if err := DB.Where(
		"status = ? AND ((complete_time > 0 AND complete_time >= ? AND complete_time <= ?) OR (complete_time = 0 AND create_time >= ? AND create_time <= ?))",
		common.TopUpStatusSuccess, startTime, endTime, startTime, endTime,
	).Find(&subOrders).Error; err != nil {
		return nil, err
	}

	// 2. Load completed top-up orders in range and deduplicate mirrored subscription rows.
	var topUps []TopUp
	if err := DB.Where(
		"status = ? AND ((complete_time > 0 AND complete_time >= ? AND complete_time <= ?) OR (complete_time = 0 AND create_time >= ? AND create_time <= ?))",
		common.TopUpStatusSuccess, startTime, endTime, startTime, endTime,
	).Find(&topUps).Error; err != nil {
		return nil, err
	}

	subTradeNos := make(map[string]struct{}, len(subOrders))
	for _, order := range subOrders {
		if order.TradeNo != "" {
			subTradeNos[order.TradeNo] = struct{}{}
		}
	}
	if len(topUps) > 0 {
		candidateTradeNos := make([]string, 0, len(topUps))
		for _, topUp := range topUps {
			if topUp.TradeNo != "" {
				if _, alreadyKnown := subTradeNos[topUp.TradeNo]; !alreadyKnown {
					candidateTradeNos = append(candidateTradeNos, topUp.TradeNo)
				}
			}
		}
		if len(candidateTradeNos) > 0 {
			var mirroredTradeNos []string
			if err := DB.Model(&SubscriptionOrder{}).
				Where("trade_no IN ?", candidateTradeNos).
				Pluck("trade_no", &mirroredTradeNos).Error; err != nil {
				return nil, err
			}
			for _, tradeNo := range mirroredTradeNos {
				subTradeNos[tradeNo] = struct{}{}
			}
		}
	}

	// Load plan titles for subscription orders.
	planTitles := make(map[int]string)
	if len(subOrders) > 0 {
		planIdSet := make(map[int]struct{}, len(subOrders))
		planIds := make([]int, 0, len(subOrders))
		for _, order := range subOrders {
			if order.PlanId > 0 {
				if _, seen := planIdSet[order.PlanId]; !seen {
					planIdSet[order.PlanId] = struct{}{}
					planIds = append(planIds, order.PlanId)
				}
			}
		}
		if len(planIds) > 0 {
			var plans []SubscriptionPlan
			if err := DB.Select("id, title").Where("id IN ?", planIds).Find(&plans).Error; err == nil {
				for _, plan := range plans {
					planTitles[plan.Id] = plan.Title
				}
			}
		}
	}

	summary := ProfitSummary{
		RangeDays:          rangeDays,
		StartTime:          startTime,
		EndTime:            endTime,
		ExcludeAdminUsers:  excludeAdmins,
		ExcludedAdminCount: len(adminUserIDs),
	}
	payingUserSet := make(map[int]struct{})
	methodMap := make(map[string]*ProfitPaymentMethodBreakdown)
	recordMethod := func(rawMethod string, money float64, isInternal bool) float64 {
		method := strings.ToLower(strings.TrimSpace(rawMethod))
		if method == "" {
			method = "unknown"
		}
		entry, ok := methodMap[method]
		if !ok {
			entry = &ProfitPaymentMethodBreakdown{
				PaymentMethod: method,
				FeeRate:       costCfg.EffectivePaymentFeeRate(method),
				IsInternal:    isInternal,
			}
			methodMap[method] = entry
		}
		fee := 0.0
		if !isInternal {
			fee = money * entry.FeeRate
		}
		entry.OrderCount++
		entry.GrossMoney += money
		entry.EstimatedFee += fee
		entry.NetMoney += money - fee
		return fee
	}

	recentOrders := make([]ProfitRecentOrderItem, 0, len(topUps)+len(subOrders))
	orderUserIdSet := make(map[int]struct{})

	for _, topUp := range topUps {
		if _, isSubMirror := subTradeNos[topUp.TradeNo]; isSubMirror {
			continue
		}
		if isExcludedAdmin(topUp.UserId) {
			continue
		}
		ts := topUp.CompleteTime
		if ts <= 0 {
			ts = topUp.CreateTime
		}
		fee := recordMethod(topUp.PaymentMethod, topUp.Money, false)
		summary.WalletTopUpMoney += topUp.Money
		summary.WalletTopUpOrders++
		summary.PaymentFeeCost += fee
		if topUp.UserId > 0 {
			payingUserSet[topUp.UserId] = struct{}{}
			orderUserIdSet[topUp.UserId] = struct{}{}
		}
		if point := ensureDailyPoint(ts); point != nil {
			point.WalletTopUpMoney += topUp.Money
			point.CashRevenue += topUp.Money
			point.PaymentFee += fee
			point.Orders++
		}
		recentOrders = append(recentOrders, ProfitRecentOrderItem{
			OrderType:       "topup",
			TradeNo:         topUp.TradeNo,
			UserId:          topUp.UserId,
			PaymentMethod:   topUp.PaymentMethod,
			PaymentProvider: topUp.PaymentProvider,
			Money:           topUp.Money,
			Amount:          topUp.Amount,
			CompletedAt:     ts,
			IsInternal:      false,
		})
	}

	for _, order := range subOrders {
		if isExcludedAdmin(order.UserId) {
			continue
		}
		ts := order.CompleteTime
		if ts <= 0 {
			ts = order.CreateTime
		}
		isBalance := strings.EqualFold(strings.TrimSpace(order.PaymentMethod), PaymentMethodBalance)
		if isBalance {
			recordMethod(PaymentMethodBalance, order.Money, true)
			summary.SubscriptionBalanceMoney += order.Money
			summary.SubscriptionBalanceCount++
		} else {
			fee := recordMethod(order.PaymentMethod, order.Money, false)
			summary.SubscriptionDirectMoney += order.Money
			summary.SubscriptionDirectOrders++
			summary.PaymentFeeCost += fee
			if order.UserId > 0 {
				payingUserSet[order.UserId] = struct{}{}
			}
			if point := ensureDailyPoint(ts); point != nil {
				point.SubscriptionDirectMoney += order.Money
				point.CashRevenue += order.Money
				point.PaymentFee += fee
				point.Orders++
			}
		}
		if order.UserId > 0 {
			orderUserIdSet[order.UserId] = struct{}{}
		}
		orderType := "subscription"
		if isBalance {
			orderType = "subscription_balance"
		}
		recentOrders = append(recentOrders, ProfitRecentOrderItem{
			OrderType:       orderType,
			TradeNo:         order.TradeNo,
			UserId:          order.UserId,
			PaymentMethod:   order.PaymentMethod,
			PaymentProvider: order.PaymentProvider,
			Money:           order.Money,
			PlanTitle:       planTitles[order.PlanId],
			CompletedAt:     ts,
			IsInternal:      isBalance,
		})
	}

	summary.CashRevenue = summary.WalletTopUpMoney + summary.SubscriptionDirectMoney
	summary.NetCashInflow = summary.CashRevenue - summary.PaymentFeeCost
	summary.PayingUsers = len(payingUserSet)

	// Enrich recent orders with usernames.
	slices.SortFunc(recentOrders, func(a, b ProfitRecentOrderItem) int {
		if res := cmp.Compare(b.CompletedAt, a.CompletedAt); res != 0 {
			return res
		}
		return cmp.Compare(a.TradeNo, b.TradeNo)
	})
	if len(recentOrders) > recentOrderLimit {
		recentOrders = recentOrders[:recentOrderLimit]
	}
	if len(recentOrders) > 0 {
		userIds := make([]int, 0, len(recentOrders))
		seenUsers := make(map[int]struct{}, len(recentOrders))
		for _, item := range recentOrders {
			if item.UserId > 0 {
				if _, seen := seenUsers[item.UserId]; !seen {
					seenUsers[item.UserId] = struct{}{}
					userIds = append(userIds, item.UserId)
				}
			}
		}
		if len(userIds) > 0 {
			var users []User
			if err := DB.Select("id, username, display_name").Where("id IN ?", userIds).Find(&users).Error; err == nil {
				userLookup := make(map[int]User, len(users))
				for _, user := range users {
					userLookup[user.Id] = user
				}
				for idx := range recentOrders {
					if user, ok := userLookup[recentOrders[idx].UserId]; ok {
						recentOrders[idx].Username = user.Username
						recentOrders[idx].DisplayName = user.DisplayName
					}
				}
			}
		}
	}

	// 3. Load channel metadata for cost & display mapping.
	type channelRow struct {
		Id      int
		Name    string
		Type    int
		Group   string
		Models  string
		Tag     *string
		Status  int
		Balance float64
	}
	var channelRows []channelRow
	if err := DB.Model(&Channel{}).
		Select("id", "name", "type", "group", "models", "tag", "status", "balance").
		Find(&channelRows).Error; err != nil {
		return nil, err
	}
	channelMeta := make(map[int]channelRow, len(channelRows))
	for _, row := range channelRows {
		channelMeta[row.Id] = row
	}

	// 4. Query aggregated usage from quota_data (hourly granularity, cross-DB portable).
	type quotaAggRow struct {
		CreatedAt int64
		ChannelID int
		ModelName string
		UseGroup  string
		Quota     int64
		Count     int64
		TokenUsed int64
	}
	startBucket := startTime - (startTime % 3600)
	var quotaRows []quotaAggRow
	quotaQuery := DB.Model(&QuotaData{}).
		Select("created_at, channel_id, model_name, use_group, SUM(quota) AS quota, SUM(count) AS count, SUM(token_used) AS token_used").
		Where("created_at >= ? AND created_at <= ?", startBucket, endTime)
	if excludeAdmins && len(adminUserIDs) > 0 {
		quotaQuery = quotaQuery.Where("user_id NOT IN (?)", adminUserSubQuery())
	}
	if err := quotaQuery.Group("created_at, channel_id, model_name, use_group").Scan(&quotaRows).Error; err != nil {
		return nil, err
	}

	// Distinct active user counts (total and per group).
	var activeUserCount int64
	activeUserQuery := DB.Model(&QuotaData{}).
		Where("created_at >= ? AND created_at <= ?", startBucket, endTime)
	if excludeAdmins && len(adminUserIDs) > 0 {
		activeUserQuery = activeUserQuery.Where("user_id NOT IN (?)", adminUserSubQuery())
	}
	if err := activeUserQuery.Distinct("user_id").Count(&activeUserCount).Error; err == nil {
		summary.ActiveUsers = int(activeUserCount)
	}
	type groupUserRow struct {
		UseGroup string
		Users    int64
	}
	var groupUserRows []groupUserRow
	groupActiveUsers := make(map[string]int)
	groupUserQuery := DB.Model(&QuotaData{}).
		Select("use_group, COUNT(DISTINCT user_id) AS users").
		Where("created_at >= ? AND created_at <= ?", startBucket, endTime)
	if excludeAdmins && len(adminUserIDs) > 0 {
		groupUserQuery = groupUserQuery.Where("user_id NOT IN (?)", adminUserSubQuery())
	}
	if err := groupUserQuery.Group("use_group").Scan(&groupUserRows).Error; err == nil {
		for _, row := range groupUserRows {
			groupName := strings.TrimSpace(row.UseGroup)
			if groupName == "" {
				groupName = "default"
			}
			groupActiveUsers[groupName] += int(row.Users)
		}
	}

	channelBreakdownMap := make(map[int]*ProfitChannelBreakdown)
	modelBreakdownMap := make(map[string]*ProfitModelBreakdown)
	groupBreakdownMap := make(map[string]*ProfitGroupBreakdown)
	channelGroupWeights := make(map[int]map[string]float64)
	channelModelWeights := make(map[int]map[string]float64)

	ensureChannelEntry := func(channelID int) *ProfitChannelBreakdown {
		if entry, ok := channelBreakdownMap[channelID]; ok {
			return entry
		}
		ratio, custom := costCfg.EffectiveChannelCostRatio(channelID)
		chCfg := costCfg.ChannelCosts[strconv.Itoa(channelID)]
		entry := &ProfitChannelBreakdown{
			ChannelId:        channelID,
			ChannelName:      fmt.Sprintf("#%d", channelID),
			CostRatio:        ratio,
			CustomCostRatio:  custom,
			PricingMode:      chCfg.PricingMode,
			UpstreamValue:    chCfg.UpstreamValue,
			PlatformValue:    chCfg.PlatformValue,
			MonthlyFixedCost: chCfg.MonthlyFixedCost,
			Note:             chCfg.Note,
		}
		if channelID == 0 {
			entry.ChannelName = "Unattributed"
		} else if meta, ok := channelMeta[channelID]; ok {
			if strings.TrimSpace(meta.Name) != "" {
				entry.ChannelName = meta.Name
			}
			entry.ChannelType = meta.Type
			entry.Group = meta.Group
			if meta.Tag != nil {
				entry.Tag = *meta.Tag
			}
			entry.Status = meta.Status
			entry.Balance = meta.Balance
		}
		channelBreakdownMap[channelID] = entry
		return entry
	}

	for _, row := range quotaRows {
		billedUSD, billedLocal := quotaToUSDAndLocal(row.Quota, currency)
		ratio, _ := costCfg.EffectiveChannelCostRatio(row.ChannelID)
		varCost := billedLocal * ratio

		summary.BilledQuota += row.Quota
		summary.BilledUSD += billedUSD
		summary.BilledLocal += billedLocal
		summary.TotalRequests += row.Count
		summary.TotalTokens += row.TokenUsed
		summary.UpstreamVariableCost += varCost

		if point := ensureDailyPoint(row.CreatedAt); point != nil {
			point.BilledUSD += billedUSD
			point.BilledLocal += billedLocal
			point.UpstreamCost += varCost
			point.Requests += row.Count
			point.Tokens += row.TokenUsed
		}

		chEntry := ensureChannelEntry(row.ChannelID)
		chEntry.Requests += row.Count
		chEntry.Tokens += row.TokenUsed
		chEntry.BilledQuota += row.Quota
		chEntry.BilledUSD += billedUSD
		chEntry.BilledLocal += billedLocal
		chEntry.VariableCost += varCost

		modelName := strings.TrimSpace(row.ModelName)
		if modelName == "" {
			modelName = "unknown"
		}
		mEntry, ok := modelBreakdownMap[modelName]
		if !ok {
			mEntry = &ProfitModelBreakdown{ModelName: modelName}
			modelBreakdownMap[modelName] = mEntry
		}
		mEntry.Requests += row.Count
		mEntry.Tokens += row.TokenUsed
		mEntry.BilledQuota += row.Quota
		mEntry.BilledUSD += billedUSD
		mEntry.BilledLocal += billedLocal
		mEntry.EstimatedCost += varCost

		groupName := strings.TrimSpace(row.UseGroup)
		if groupName == "" {
			groupName = "default"
		}
		weight := float64(row.Quota)
		if weight <= 0 {
			weight = float64(max(int64(1), row.Count))
		}
		if channelGroupWeights[row.ChannelID] == nil {
			channelGroupWeights[row.ChannelID] = make(map[string]float64)
		}
		channelGroupWeights[row.ChannelID][groupName] += weight
		if modelName != "unknown" {
			if channelModelWeights[row.ChannelID] == nil {
				channelModelWeights[row.ChannelID] = make(map[string]float64)
			}
			channelModelWeights[row.ChannelID][modelName] += weight
		}
		gEntry, ok := groupBreakdownMap[groupName]
		if !ok {
			gEntry = &ProfitGroupBreakdown{
				Group:       groupName,
				ActiveUsers: groupActiveUsers[groupName],
			}
			groupBreakdownMap[groupName] = gEntry
		}
		gEntry.Requests += row.Count
		gEntry.Tokens += row.TokenUsed
		gEntry.BilledQuota += row.Quota
		gEntry.BilledUSD += billedUSD
		gEntry.BilledLocal += billedLocal
		gEntry.EstimatedCost += varCost
	}

	// Include channels with configured fixed cost or custom cost even if they had zero traffic in range.
	for rawChannelID, cfg := range costCfg.ChannelCosts {
		if cfg.MonthlyFixedCost <= 0 && cfg.CostRatio == nil {
			continue
		}
		channelID, err := strconv.Atoi(rawChannelID)
		if err != nil || channelID <= 0 {
			continue
		}
		ensureChannelEntry(channelID)
	}
	// Also include enabled channels so root can easily configure per-channel cost from the breakdown table.
	for _, row := range channelRows {
		if row.Status == common.ChannelStatusEnabled {
			ensureChannelEntry(row.Id)
		}
	}

	amortizeFactor := float64(rangeDays) / 30.0
	channels := make([]ProfitChannelBreakdown, 0, len(channelBreakdownMap))
	for _, entry := range channelBreakdownMap {
		suggestedRatio := 0.0
		if weights := channelGroupWeights[entry.ChannelId]; len(weights) > 0 {
			weightedSum := 0.0
			totalWeight := 0.0
			for gName, w := range weights {
				if w <= 0 {
					continue
				}
				gRatio, ok := groupRatios[gName]
				if !ok || gRatio <= 0 {
					gRatio = defaultGroupRatio
				}
				weightedSum += gRatio * w
				totalWeight += w
			}
			if totalWeight > 0 {
				suggestedRatio = weightedSum / totalWeight
			}
		}
		if suggestedRatio <= 0 && entry.Group != "" {
			fallbackRatio := 0.0
			for _, rawGroup := range strings.Split(entry.Group, ",") {
				gName := strings.TrimSpace(rawGroup)
				if gName == "" {
					continue
				}
				gRatio, ok := groupRatios[gName]
				if !ok || gRatio <= 0 {
					continue
				}
				if !ratio_setting.IsUserManagementGroup(gName) {
					suggestedRatio = gRatio
					break
				}
				if fallbackRatio <= 0 {
					fallbackRatio = gRatio
				}
			}
			if suggestedRatio <= 0 {
				suggestedRatio = fallbackRatio
			}
		}
		if suggestedRatio <= 0 {
			suggestedRatio = defaultGroupRatio
		}
		entry.SuggestedGroupRatio = roundRatio6(suggestedRatio)

		bestModelName := ""
		bestModelWeight := 0.0
		for mName, w := range channelModelWeights[entry.ChannelId] {
			if w > bestModelWeight || (w == bestModelWeight && (bestModelName == "" || mName < bestModelName)) {
				bestModelWeight = w
				bestModelName = mName
			}
		}
		if bestModelName != "" {
			if price, ok := ratio_setting.GetModelPrice(bestModelName, false); ok && price > 0 {
				entry.SuggestedUnitPrice = roundRatio6(price * suggestedRatio * currency.USDToCurrencyRate)
				entry.SuggestedUnitPriceModel = bestModelName
			}
		}
		if entry.SuggestedUnitPrice <= 0 {
			if meta, ok := channelMeta[entry.ChannelId]; ok && strings.TrimSpace(meta.Models) != "" {
				var firstModel string
				firstPrice := 0.0
				uniform := true
				modelCount := 0
				for _, rawModel := range strings.Split(meta.Models, ",") {
					mName := strings.TrimSpace(rawModel)
					if mName == "" {
						continue
					}
					modelCount++
					price, hasPrice := ratio_setting.GetModelPrice(mName, false)
					if !hasPrice || price <= 0 {
						uniform = false
						break
					}
					if firstModel == "" {
						firstModel = mName
						firstPrice = price
					} else if math.Abs(price-firstPrice) > 1e-9 {
						uniform = false
						break
					}
				}
				if uniform && modelCount > 0 && firstPrice > 0 {
					entry.SuggestedUnitPrice = roundRatio6(firstPrice * suggestedRatio * currency.USDToCurrencyRate)
					entry.SuggestedUnitPriceModel = firstModel
				}
			}
		}

		entry.AmortizedFixedCost = entry.MonthlyFixedCost * amortizeFactor
		summary.ChannelFixedCost += entry.AmortizedFixedCost
		entry.GrossProfit = entry.BilledLocal - entry.VariableCost
		entry.NetProfit = entry.GrossProfit - entry.AmortizedFixedCost
		if entry.BilledLocal > 0 {
			entry.MarginRate = roundPercent((entry.NetProfit / entry.BilledLocal) * 100)
		}
		entry.BilledUSD = roundMoney(entry.BilledUSD)
		entry.BilledLocal = roundMoney(entry.BilledLocal)
		entry.VariableCost = roundMoney(entry.VariableCost)
		entry.AmortizedFixedCost = roundMoney(entry.AmortizedFixedCost)
		entry.GrossProfit = roundMoney(entry.GrossProfit)
		entry.NetProfit = roundMoney(entry.NetProfit)
		channels = append(channels, *entry)
	}
	slices.SortFunc(channels, func(a, b ProfitChannelBreakdown) int {
		if res := cmp.Compare(b.BilledLocal, a.BilledLocal); res != 0 {
			return res
		}
		if res := cmp.Compare(b.AmortizedFixedCost, a.AmortizedFixedCost); res != 0 {
			return res
		}
		return cmp.Compare(a.ChannelId, b.ChannelId)
	})

	for _, item := range costCfg.ExtraFixedCosts {
		if !item.Enabled || item.MonthlyCost <= 0 {
			continue
		}
		summary.PlatformFixedCost += item.MonthlyCost * amortizeFactor
	}

	totalFixedCost := summary.ChannelFixedCost + summary.PlatformFixedCost
	dailyFixedCost := totalFixedCost / float64(rangeDays)

	dailyTrend := make([]ProfitDailyTrendPoint, 0, len(dailyOrder))
	for _, dateKey := range dailyOrder {
		point := dailyMap[dateKey]
		point.FixedCost = dailyFixedCost
		point.TotalCost = point.UpstreamCost + point.FixedCost + point.PaymentFee
		point.CashNetProfit = point.CashRevenue - point.TotalCost
		point.BilledGrossProfit = point.BilledLocal - point.UpstreamCost
		point.BilledNetProfit = point.BilledLocal - point.UpstreamCost - point.FixedCost

		point.CashRevenue = roundMoney(point.CashRevenue)
		point.WalletTopUpMoney = roundMoney(point.WalletTopUpMoney)
		point.SubscriptionDirectMoney = roundMoney(point.SubscriptionDirectMoney)
		point.PaymentFee = roundMoney(point.PaymentFee)
		point.BilledUSD = roundMoney(point.BilledUSD)
		point.BilledLocal = roundMoney(point.BilledLocal)
		point.UpstreamCost = roundMoney(point.UpstreamCost)
		point.FixedCost = roundMoney(point.FixedCost)
		point.TotalCost = roundMoney(point.TotalCost)
		point.CashNetProfit = roundMoney(point.CashNetProfit)
		point.BilledGrossProfit = roundMoney(point.BilledGrossProfit)
		point.BilledNetProfit = roundMoney(point.BilledNetProfit)
		dailyTrend = append(dailyTrend, *point)
	}

	models := make([]ProfitModelBreakdown, 0, len(modelBreakdownMap))
	for _, entry := range modelBreakdownMap {
		entry.GrossProfit = entry.BilledLocal - entry.EstimatedCost
		if entry.BilledLocal > 0 {
			entry.MarginRate = roundPercent((entry.GrossProfit / entry.BilledLocal) * 100)
		}
		entry.BilledUSD = roundMoney(entry.BilledUSD)
		entry.BilledLocal = roundMoney(entry.BilledLocal)
		entry.EstimatedCost = roundMoney(entry.EstimatedCost)
		entry.GrossProfit = roundMoney(entry.GrossProfit)
		models = append(models, *entry)
	}
	slices.SortFunc(models, func(a, b ProfitModelBreakdown) int {
		if res := cmp.Compare(b.BilledLocal, a.BilledLocal); res != 0 {
			return res
		}
		return cmp.Compare(a.ModelName, b.ModelName)
	})

	groups := make([]ProfitGroupBreakdown, 0, len(groupBreakdownMap))
	for _, entry := range groupBreakdownMap {
		entry.GrossProfit = entry.BilledLocal - entry.EstimatedCost
		if entry.BilledLocal > 0 {
			entry.MarginRate = roundPercent((entry.GrossProfit / entry.BilledLocal) * 100)
		}
		entry.BilledUSD = roundMoney(entry.BilledUSD)
		entry.BilledLocal = roundMoney(entry.BilledLocal)
		entry.EstimatedCost = roundMoney(entry.EstimatedCost)
		entry.GrossProfit = roundMoney(entry.GrossProfit)
		groups = append(groups, *entry)
	}
	slices.SortFunc(groups, func(a, b ProfitGroupBreakdown) int {
		if res := cmp.Compare(b.BilledLocal, a.BilledLocal); res != 0 {
			return res
		}
		return cmp.Compare(a.Group, b.Group)
	})

	paymentMethods := make([]ProfitPaymentMethodBreakdown, 0, len(methodMap))
	for _, entry := range methodMap {
		entry.GrossMoney = roundMoney(entry.GrossMoney)
		entry.EstimatedFee = roundMoney(entry.EstimatedFee)
		entry.NetMoney = roundMoney(entry.NetMoney)
		paymentMethods = append(paymentMethods, *entry)
	}
	slices.SortFunc(paymentMethods, func(a, b ProfitPaymentMethodBreakdown) int {
		if a.IsInternal != b.IsInternal {
			if a.IsInternal {
				return 1
			}
			return -1
		}
		if res := cmp.Compare(b.GrossMoney, a.GrossMoney); res != 0 {
			return res
		}
		return cmp.Compare(a.PaymentMethod, b.PaymentMethod)
	})

	summary.TotalEstimatedCost = summary.UpstreamVariableCost + summary.ChannelFixedCost + summary.PlatformFixedCost + summary.PaymentFeeCost
	summary.CashNetProfit = summary.CashRevenue - summary.TotalEstimatedCost
	if summary.CashRevenue > 0 {
		summary.CashNetMargin = roundPercent((summary.CashNetProfit / summary.CashRevenue) * 100)
	}
	summary.BilledGrossProfit = summary.BilledLocal - summary.UpstreamVariableCost
	if summary.BilledLocal > 0 {
		summary.BilledGrossMargin = roundPercent((summary.BilledGrossProfit / summary.BilledLocal) * 100)
	}
	summary.BilledNetProfit = summary.BilledLocal - summary.UpstreamVariableCost - summary.ChannelFixedCost - summary.PlatformFixedCost
	if summary.BilledLocal > 0 {
		summary.BilledNetMargin = roundPercent((summary.BilledNetProfit / summary.BilledLocal) * 100)
	}

	summary.CashRevenue = roundMoney(summary.CashRevenue)
	summary.WalletTopUpMoney = roundMoney(summary.WalletTopUpMoney)
	summary.SubscriptionDirectMoney = roundMoney(summary.SubscriptionDirectMoney)
	summary.SubscriptionBalanceMoney = roundMoney(summary.SubscriptionBalanceMoney)
	summary.PaymentFeeCost = roundMoney(summary.PaymentFeeCost)
	summary.NetCashInflow = roundMoney(summary.NetCashInflow)
	summary.BilledUSD = roundMoney(summary.BilledUSD)
	summary.BilledLocal = roundMoney(summary.BilledLocal)
	summary.UpstreamVariableCost = roundMoney(summary.UpstreamVariableCost)
	summary.ChannelFixedCost = roundMoney(summary.ChannelFixedCost)
	summary.PlatformFixedCost = roundMoney(summary.PlatformFixedCost)
	summary.TotalEstimatedCost = roundMoney(summary.TotalEstimatedCost)
	summary.CashNetProfit = roundMoney(summary.CashNetProfit)
	summary.BilledGrossProfit = roundMoney(summary.BilledGrossProfit)
	summary.BilledNetProfit = roundMoney(summary.BilledNetProfit)

	// 5. Liability & giveaway snapshot (cross-DB portable GORM queries).
	liability := ProfitLiabilitySnapshot{}
	var userQuotaSum struct {
		Total int64
	}
	userQuotaQuery := DB.Model(&User{}).
		Select("COALESCE(SUM(quota), 0) AS total").
		Where("quota > 0")
	if excludeAdmins {
		userQuotaQuery = userQuotaQuery.Where("role < ?", common.RoleAdminUser)
	}
	if err := userQuotaQuery.Scan(&userQuotaSum).Error; err == nil {
		liability.UserRemainingQuota = userQuotaSum.Total
		usd, local := quotaToUSDAndLocal(userQuotaSum.Total, currency)
		liability.UserRemainingUSD = roundMoney(usd)
		liability.UserRemainingLocal = roundMoney(local)
	}

	var subQuotaSum struct {
		Total int64
	}
	subQuotaQuery := DB.Model(&UserSubscription{}).
		Select("COALESCE(SUM(CASE WHEN amount_total > amount_used THEN amount_total - amount_used ELSE 0 END), 0) AS total").
		Where("status = ? AND (end_time = 0 OR end_time > ?)", "active", nowUnix)
	if excludeAdmins && len(adminUserIDs) > 0 {
		subQuotaQuery = subQuotaQuery.Where("user_id NOT IN (?)", adminUserSubQuery())
	}
	if err := subQuotaQuery.Scan(&subQuotaSum).Error; err == nil {
		liability.SubscriptionRemainingQuota = subQuotaSum.Total
		usd, local := quotaToUSDAndLocal(subQuotaSum.Total, currency)
		liability.SubscriptionRemainingUSD = roundMoney(usd)
		liability.SubscriptionRemainingLocal = roundMoney(local)
	}

	var redemptionSum struct {
		Total int64
		Count int64
	}
	redemptionQuery := DB.Model(&Redemption{}).
		Select("COALESCE(SUM(quota), 0) AS total, COUNT(*) AS count").
		Where("status = ? AND redeemed_time >= ? AND redeemed_time <= ?", common.RedemptionCodeStatusUsed, startTime, endTime)
	if excludeAdmins && len(adminUserIDs) > 0 {
		redemptionQuery = redemptionQuery.Where("(used_user_id IS NULL OR used_user_id NOT IN (?))", adminUserSubQuery())
	}
	if err := redemptionQuery.Scan(&redemptionSum).Error; err == nil {
		liability.RedeemedQuota = redemptionSum.Total
		liability.RedeemedCount = redemptionSum.Count
		usd, local := quotaToUSDAndLocal(redemptionSum.Total, currency)
		liability.RedeemedUSD = roundMoney(usd)
		liability.RedeemedLocal = roundMoney(local)
	}

	var checkinSum struct {
		Total int64
		Count int64
	}
	checkinQuery := DB.Model(&Checkin{}).
		Select("COALESCE(SUM(quota_awarded), 0) AS total, COUNT(*) AS count").
		Where("created_at >= ? AND created_at <= ?", startTime, endTime)
	if excludeAdmins && len(adminUserIDs) > 0 {
		checkinQuery = checkinQuery.Where("user_id NOT IN (?)", adminUserSubQuery())
	}
	if err := checkinQuery.Scan(&checkinSum).Error; err == nil {
		liability.CheckinQuota = checkinSum.Total
		liability.CheckinCount = checkinSum.Count
		usd, local := quotaToUSDAndLocal(checkinSum.Total, currency)
		liability.CheckinUSD = roundMoney(usd)
		liability.CheckinLocal = roundMoney(local)
	}

	return &ProfitAnalyticsReport{
		Currency:       currency,
		PricingRef:     pricingRef,
		CostSettings:   costCfg,
		Summary:        summary,
		Liability:      liability,
		DailyTrend:     dailyTrend,
		Channels:       channels,
		Models:         models,
		Groups:         groups,
		PaymentMethods: paymentMethods,
		RecentOrders:   recentOrders,
	}, nil
}
