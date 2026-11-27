package model

import (
	"cmp"
	"errors"
	"math"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

type SiteOverviewOptions struct {
	Range             string
	ExcludeAdminUsers *bool
	Now               time.Time
}

type SiteOverviewMeta struct {
	Range              string             `json:"range"`
	BucketUnit         string             `json:"bucket_unit"`
	StartTime          int64              `json:"start_time"`
	EndTime            int64              `json:"end_time"`
	PrevStartTime      int64              `json:"prev_start_time"`
	PrevEndTime        int64              `json:"prev_end_time"`
	GeneratedAt        int64              `json:"generated_at"`
	ExcludeAdminUsers  bool               `json:"exclude_admin_users"`
	ExcludedAdminCount int                `json:"excluded_admin_count"`
	Currency           ProfitCurrencyMeta `json:"currency"`
}

type SiteOverviewUsageSummary struct {
	TotalRequests       int64    `json:"total_requests"`
	PrevRequests        int64    `json:"prev_requests"`
	RequestsChangePct   *float64 `json:"requests_change_pct,omitempty"`
	TotalQuota          int64    `json:"total_quota"`
	BilledUSD           float64  `json:"billed_usd"`
	BilledLocal         float64  `json:"billed_local"`
	PrevQuota           int64    `json:"prev_quota"`
	QuotaChangePct      *float64 `json:"quota_change_pct,omitempty"`
	TotalTokens         int64    `json:"total_tokens"`
	PrevTokens          int64    `json:"prev_tokens"`
	TokensChangePct     *float64 `json:"tokens_change_pct,omitempty"`
	CacheReadTokens     int64    `json:"cache_read_tokens"`
	CacheCreationTokens int64    `json:"cache_creation_tokens"`
	CacheHitRate        float64  `json:"cache_hit_rate"`
	AvgRPM              float64  `json:"avg_rpm"`
	AvgTPM              float64  `json:"avg_tpm"`
}

type SiteOverviewUsersSummary struct {
	TotalUsers           int64    `json:"total_users"`
	EnabledUsers         int64    `json:"enabled_users"`
	DisabledUsers        int64    `json:"disabled_users"`
	NewUsers             int64    `json:"new_users"`
	PrevNewUsers         int64    `json:"prev_new_users"`
	NewUsersChangePct    *float64 `json:"new_users_change_pct,omitempty"`
	TodayNewUsers        int64    `json:"today_new_users"`
	DeletedUsers         int64    `json:"deleted_users"`
	NetUserChange        int64    `json:"net_user_change"`
	ActiveUsers          int64    `json:"active_users"`
	PrevActiveUsers      int64    `json:"prev_active_users"`
	ActiveUsersChangePct *float64 `json:"active_users_change_pct,omitempty"`
	DAU                  int64    `json:"dau"`
	WAU                  int64    `json:"wau"`
	MAU                  int64    `json:"mau"`
	LoginActiveUsers     int64    `json:"login_active_users"`
	PayingUsers          int64    `json:"paying_users"`
	ActiveRate           float64  `json:"active_rate"`
	TotalRemainingQuota  int64    `json:"total_remaining_quota"`
	TotalRemainingUSD    float64  `json:"total_remaining_usd"`
	TotalRemainingLocal  float64  `json:"total_remaining_local"`
}

type SiteOverviewChannelAlert struct {
	Id           int    `json:"id"`
	Name         string `json:"name"`
	Type         int    `json:"type"`
	Group        string `json:"group"`
	Status       int    `json:"status"`
	ResponseTime int    `json:"response_time"`
	TestTime     int64  `json:"test_time"`
	Priority     int64  `json:"priority"`
}

type SiteOverviewChannelsSummary struct {
	Total            int64                      `json:"total"`
	Enabled          int64                      `json:"enabled"`
	ManuallyDisabled int64                      `json:"manually_disabled"`
	AutoDisabled     int64                      `json:"auto_disabled"`
	Unknown          int64                      `json:"unknown"`
	DisabledChannels []SiteOverviewChannelAlert `json:"disabled_channels"`
}

type SiteOverviewTrendPoint struct {
	Ts                  int64   `json:"ts"`
	Label               string  `json:"label"`
	Requests            int64   `json:"requests"`
	Quota               int64   `json:"quota"`
	BilledUSD           float64 `json:"billed_usd"`
	BilledLocal         float64 `json:"billed_local"`
	Tokens              int64   `json:"tokens"`
	CacheReadTokens     int64   `json:"cache_read_tokens"`
	CacheCreationTokens int64   `json:"cache_creation_tokens"`
	ActiveUsers         int64   `json:"active_users"`
	NewUsers            int64   `json:"new_users"`
	DeletedUsers        int64   `json:"deleted_users"`
	CumulativeUsers     int64   `json:"cumulative_users"`
	PerfRequests        int64   `json:"perf_requests"`
	SuccessRate         float64 `json:"success_rate"`
	AvgLatencyMs        int64   `json:"avg_latency_ms"`
	AvgTtftMs           int64   `json:"avg_ttft_ms"`
	AvgTps              float64 `json:"avg_tps"`
}

type SiteOverviewModelItem struct {
	ModelName       string   `json:"model_name"`
	Requests        int64    `json:"requests"`
	Quota           int64    `json:"quota"`
	BilledUSD       float64  `json:"billed_usd"`
	BilledLocal     float64  `json:"billed_local"`
	Tokens          int64    `json:"tokens"`
	SharePct        float64  `json:"share_pct"`
	SuccessRate     *float64 `json:"success_rate,omitempty"`
	AvgLatencyMs    *int64   `json:"avg_latency_ms,omitempty"`
	AvgTtftMs       *int64   `json:"avg_ttft_ms,omitempty"`
	AvgTps          *float64 `json:"avg_tps,omitempty"`
	TpsInsufficient bool     `json:"tps_insufficient,omitempty"`
}

type SiteOverviewGroupItem struct {
	Group           string   `json:"group"`
	Requests        int64    `json:"requests"`
	Quota           int64    `json:"quota"`
	BilledUSD       float64  `json:"billed_usd"`
	BilledLocal     float64  `json:"billed_local"`
	Tokens          int64    `json:"tokens"`
	ActiveUsers     int64    `json:"active_users"`
	SuccessRate     *float64 `json:"success_rate,omitempty"`
	AvgLatencyMs    *int64   `json:"avg_latency_ms,omitempty"`
	AvgTtftMs       *int64   `json:"avg_ttft_ms,omitempty"`
	AvgTps          *float64 `json:"avg_tps,omitempty"`
	TpsInsufficient bool     `json:"tps_insufficient,omitempty"`
}

type SiteOverviewUserItem struct {
	UserId         int     `json:"user_id"`
	Username       string  `json:"username"`
	DisplayName    string  `json:"display_name,omitempty"`
	Group          string  `json:"group"`
	Status         int     `json:"status"`
	Requests       int64   `json:"requests"`
	Quota          int64   `json:"quota"`
	BilledUSD      float64 `json:"billed_usd"`
	BilledLocal    float64 `json:"billed_local"`
	Tokens         int64   `json:"tokens"`
	RemainingQuota int64   `json:"remaining_quota"`
	RemainingLocal float64 `json:"remaining_local"`
	LastLoginAt    int64   `json:"last_login_at"`
	CreatedAt      int64   `json:"created_at"`
}

type SiteOverviewBaseReport struct {
	Meta      SiteOverviewMeta            `json:"meta"`
	Usage     SiteOverviewUsageSummary    `json:"usage"`
	Users     SiteOverviewUsersSummary    `json:"users"`
	Channels  SiteOverviewChannelsSummary `json:"channels"`
	Trend     []SiteOverviewTrendPoint    `json:"trend"`
	TopModels []SiteOverviewModelItem     `json:"top_models"`
	Groups    []SiteOverviewGroupItem     `json:"groups"`
	TopUsers  []SiteOverviewUserItem      `json:"top_users"`
	Location  *time.Location              `json:"-"`
}

func normalizeSiteOverviewRange(raw string) (string, string, int) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "24h", "1d":
		return "24h", "hour", 1
	case "30d":
		return "30d", "day", 30
	case "90d":
		return "90d", "day", 90
	default:
		return "7d", "day", 7
	}
}

func siteOverviewPctChange(current float64, previous float64) *float64 {
	if previous <= 0 {
		return nil
	}
	delta := roundPercent((current - previous) / previous * 100)
	return &delta
}

func siteOverviewBucketLabel(ts int64, bucketUnit string, loc *time.Location) string {
	tm := time.Unix(ts, 0).In(loc)
	if bucketUnit == "hour" {
		return tm.Format("2006-01-02 15:00")
	}
	return tm.Format("2006-01-02")
}

func GetSiteOverviewBase(opts SiteOverviewOptions) (*SiteOverviewBaseReport, error) {
	if DB == nil {
		return nil, errors.New("database is not initialized")
	}

	loc := loadProfitLocation()
	now := opts.Now
	if now.IsZero() {
		now = time.Now()
	}
	now = now.In(loc)
	nowUnix := now.Unix()

	rangeKey, bucketUnit, rangeDays := normalizeSiteOverviewRange(opts.Range)
	currency := profitCurrencyMeta()

	excludeAdmins := operation_setting.GetProfitAnalyticsSettingSnapshot().ExcludeAdminUsers
	if opts.ExcludeAdminUsers != nil {
		excludeAdmins = *opts.ExcludeAdminUsers
	}

	var adminUserIDs []int
	if excludeAdmins {
		if err := DB.Unscoped().Model(&User{}).
			Where("role >= ?", common.RoleAdminUser).
			Pluck("id", &adminUserIDs).Error; err != nil {
			return nil, err
		}
	}
	hasExcludedAdmins := excludeAdmins && len(adminUserIDs) > 0
	adminUserSubQuery := func() *gorm.DB {
		return DB.Unscoped().Model(&User{}).Select("id").Where("role >= ?", common.RoleAdminUser)
	}
	applyUserRoleFilter := func(tx *gorm.DB) *gorm.DB {
		if excludeAdmins {
			return tx.Where("role < ?", common.RoleAdminUser)
		}
		return tx
	}
	applyQuotaAdminFilter := func(tx *gorm.DB) *gorm.DB {
		if hasExcludedAdmins {
			return tx.Where("user_id NOT IN (?)", adminUserSubQuery())
		}
		return tx
	}

	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	var startTs, endTs, prevStartTs, prevEndTs int64
	endTs = nowUnix

	trendOrder := make([]string, 0, 96)
	trendMap := make(map[string]*SiteOverviewTrendPoint, 96)

	if bucketUnit == "hour" {
		endHour := time.Date(now.Year(), now.Month(), now.Day(), now.Hour(), 0, 0, 0, loc)
		startHour := endHour.Add(-23 * time.Hour)
		startTs = startHour.Unix()
		prevStartTs = startHour.Add(-24 * time.Hour).Unix()
		prevEndTs = startTs - 1
		for cursor := startHour; !cursor.After(endHour); cursor = cursor.Add(time.Hour) {
			label := cursor.Format("2006-01-02 15:00")
			trendOrder = append(trendOrder, label)
			trendMap[label] = &SiteOverviewTrendPoint{
				Ts:    cursor.Unix(),
				Label: label,
			}
		}
	} else {
		startDay := todayStart.AddDate(0, 0, -(rangeDays - 1))
		startTs = startDay.Unix()
		prevStartTs = startDay.AddDate(0, 0, -rangeDays).Unix()
		prevEndTs = startTs - 1
		for cursor := startDay; !cursor.After(todayStart); cursor = cursor.AddDate(0, 0, 1) {
			label := cursor.Format("2006-01-02")
			trendOrder = append(trendOrder, label)
			trendMap[label] = &SiteOverviewTrendPoint{
				Ts:    cursor.Unix(),
				Label: label,
			}
		}
	}

	startBucket := startTs - (startTs % 3600)
	prevStartBucket := prevStartTs - (prevStartTs % 3600)
	prevEndBucket := startBucket - 1
	if prevEndBucket < prevStartBucket {
		prevEndBucket = prevEndTs
	}

	// 1. Quota & usage trend in current range.
	type quotaTrendRow struct {
		CreatedAt           int64
		Requests            int64
		Quota               int64
		Tokens              int64
		CacheReadTokens     int64
		CacheCreationTokens int64
	}
	var quotaTrendRows []quotaTrendRow
	if err := applyQuotaAdminFilter(DB.Model(&QuotaData{})).
		Select("created_at, COALESCE(SUM(count), 0) AS requests, COALESCE(SUM(quota), 0) AS quota, COALESCE(SUM(token_used), 0) AS tokens, COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens, COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens").
		Where("created_at >= ? AND created_at <= ?", startBucket, endTs).
		Group("created_at").
		Scan(&quotaTrendRows).Error; err != nil {
		return nil, err
	}

	var usage SiteOverviewUsageSummary
	for _, row := range quotaTrendRows {
		usage.TotalRequests += row.Requests
		usage.TotalQuota += row.Quota
		usage.TotalTokens += row.Tokens
		usage.CacheReadTokens += row.CacheReadTokens
		usage.CacheCreationTokens += row.CacheCreationTokens

		label := siteOverviewBucketLabel(row.CreatedAt, bucketUnit, loc)
		if point, ok := trendMap[label]; ok {
			point.Requests += row.Requests
			point.Quota += row.Quota
			point.Tokens += row.Tokens
			point.CacheReadTokens += row.CacheReadTokens
			point.CacheCreationTokens += row.CacheCreationTokens
		}
	}

	// Previous period usage summary for period-over-period delta.
	type quotaSummaryRow struct {
		Requests int64
		Quota    int64
		Tokens   int64
	}
	var prevUsage quotaSummaryRow
	if err := applyQuotaAdminFilter(DB.Model(&QuotaData{})).
		Select("COALESCE(SUM(count), 0) AS requests, COALESCE(SUM(quota), 0) AS quota, COALESCE(SUM(token_used), 0) AS tokens").
		Where("created_at >= ? AND created_at <= ?", prevStartBucket, prevEndBucket).
		Scan(&prevUsage).Error; err != nil {
		return nil, err
	}
	usage.PrevRequests = prevUsage.Requests
	usage.PrevQuota = prevUsage.Quota
	usage.PrevTokens = prevUsage.Tokens
	usage.RequestsChangePct = siteOverviewPctChange(float64(usage.TotalRequests), float64(usage.PrevRequests))
	usage.QuotaChangePct = siteOverviewPctChange(float64(usage.TotalQuota), float64(usage.PrevQuota))
	usage.TokensChangePct = siteOverviewPctChange(float64(usage.TotalTokens), float64(usage.PrevTokens))

	billedUSD, billedLocal := quotaToUSDAndLocal(usage.TotalQuota, currency)
	usage.BilledUSD = roundMoney(billedUSD)
	usage.BilledLocal = roundMoney(billedLocal)
	if usage.TotalTokens > 0 {
		usage.CacheHitRate = roundPercent(float64(usage.CacheReadTokens) / float64(usage.TotalTokens) * 100)
	}
	minutes := math.Max(1, float64(endTs-startTs)/60.0)
	usage.AvgRPM = roundPercent(float64(usage.TotalRequests) / minutes)
	usage.AvgTPM = roundPercent(float64(usage.TotalTokens) / minutes)

	// 2. Active users per bucket and overall / DAU / WAU / MAU.
	var usersSummary SiteOverviewUsersSummary
	type bucketUserRow struct {
		CreatedAt int64
		UserID    int
	}
	var bucketUserRows []bucketUserRow
	if err := applyQuotaAdminFilter(DB.Model(&QuotaData{})).
		Select("DISTINCT created_at, user_id").
		Where("created_at >= ? AND created_at <= ?", startBucket, endTs).
		Scan(&bucketUserRows).Error; err != nil {
		return nil, err
	}
	rangeActiveSet := make(map[int]struct{})
	bucketActiveSets := make(map[string]map[int]struct{}, len(trendOrder))
	for _, row := range bucketUserRows {
		if row.UserID <= 0 {
			continue
		}
		rangeActiveSet[row.UserID] = struct{}{}
		label := siteOverviewBucketLabel(row.CreatedAt, bucketUnit, loc)
		if _, exists := trendMap[label]; exists {
			set := bucketActiveSets[label]
			if set == nil {
				set = make(map[int]struct{})
				bucketActiveSets[label] = set
			}
			set[row.UserID] = struct{}{}
		}
	}
	usersSummary.ActiveUsers = int64(len(rangeActiveSet))
	for label, set := range bucketActiveSets {
		if point, ok := trendMap[label]; ok {
			point.ActiveUsers = int64(len(set))
		}
	}

	var prevActiveUsers int64
	if err := applyQuotaAdminFilter(DB.Model(&QuotaData{})).
		Where("created_at >= ? AND created_at <= ?", prevStartBucket, prevEndBucket).
		Distinct("user_id").
		Count(&prevActiveUsers).Error; err != nil {
		return nil, err
	}
	usersSummary.PrevActiveUsers = prevActiveUsers
	usersSummary.ActiveUsersChangePct = siteOverviewPctChange(float64(usersSummary.ActiveUsers), float64(usersSummary.PrevActiveUsers))

	countActiveSince := func(sinceTs int64) (int64, error) {
		sinceBucket := sinceTs - (sinceTs % 3600)
		var cnt int64
		err := applyQuotaAdminFilter(DB.Model(&QuotaData{})).
			Where("created_at >= ? AND created_at <= ?", sinceBucket, endTs).
			Distinct("user_id").
			Count(&cnt).Error
		return cnt, err
	}
	dau, err := countActiveSince(todayStart.Unix())
	if err != nil {
		return nil, err
	}
	wau, err := countActiveSince(todayStart.AddDate(0, 0, -6).Unix())
	if err != nil {
		return nil, err
	}
	mau, err := countActiveSince(todayStart.AddDate(0, 0, -29).Unix())
	if err != nil {
		return nil, err
	}
	usersSummary.DAU = dau
	usersSummary.WAU = wau
	usersSummary.MAU = mau

	// 3. User counts, growth, deletions, login activity, and balance stock.
	type userStatusRow struct {
		Status     int
		Cnt        int64
		TotalQuota int64
	}
	var userStatusRows []userStatusRow
	if err := applyUserRoleFilter(DB.Model(&User{})).
		Select("status, COUNT(*) AS cnt, COALESCE(SUM(quota), 0) AS total_quota").
		Group("status").
		Scan(&userStatusRows).Error; err != nil {
		return nil, err
	}
	for _, row := range userStatusRows {
		usersSummary.TotalUsers += row.Cnt
		usersSummary.TotalRemainingQuota += row.TotalQuota
		switch row.Status {
		case common.UserStatusEnabled:
			usersSummary.EnabledUsers += row.Cnt
		case common.UserStatusDisabled:
			usersSummary.DisabledUsers += row.Cnt
		}
	}
	remUSD, remLocal := quotaToUSDAndLocal(usersSummary.TotalRemainingQuota, currency)
	usersSummary.TotalRemainingUSD = roundMoney(remUSD)
	usersSummary.TotalRemainingLocal = roundMoney(remLocal)

	var newUserTimestamps []int64
	if err := applyUserRoleFilter(DB.Unscoped().Model(&User{})).
		Where("created_at >= ? AND created_at <= ?", startTs, endTs).
		Pluck("created_at", &newUserTimestamps).Error; err != nil {
		return nil, err
	}
	usersSummary.NewUsers = int64(len(newUserTimestamps))
	for _, createdAt := range newUserTimestamps {
		label := siteOverviewBucketLabel(createdAt, bucketUnit, loc)
		if point, ok := trendMap[label]; ok {
			point.NewUsers++
		}
	}

	var baselineUsers int64
	if err := applyUserRoleFilter(DB.Model(&User{})).
		Where("created_at < ?", startTs).
		Count(&baselineUsers).Error; err != nil {
		return nil, err
	}

	var prevNewUsers int64
	if err := applyUserRoleFilter(DB.Unscoped().Model(&User{})).
		Where("created_at >= ? AND created_at <= ?", prevStartTs, prevEndTs).
		Count(&prevNewUsers).Error; err != nil {
		return nil, err
	}
	usersSummary.PrevNewUsers = prevNewUsers
	usersSummary.NewUsersChangePct = siteOverviewPctChange(float64(usersSummary.NewUsers), float64(usersSummary.PrevNewUsers))

	var todayNewUsers int64
	if err := applyUserRoleFilter(DB.Unscoped().Model(&User{})).
		Where("created_at >= ? AND created_at <= ?", todayStart.Unix(), endTs).
		Count(&todayNewUsers).Error; err != nil {
		return nil, err
	}
	usersSummary.TodayNewUsers = todayNewUsers

	type deletedUserRow struct {
		CreatedAt int64
		DeletedAt gorm.DeletedAt
	}
	var deletedRows []deletedUserRow
	// Pad SQL bounds by 24h so SQLite text timestamps with mixed offsets never drop boundary rows, then filter exact Unix seconds in Go.
	if err := applyUserRoleFilter(DB.Unscoped().Model(&User{})).
		Select("created_at, deleted_at").
		Where("deleted_at IS NOT NULL AND deleted_at >= ? AND deleted_at <= ?", time.Unix(startTs-86400, 0), time.Unix(endTs+86400, 0)).
		Scan(&deletedRows).Error; err != nil {
		return nil, err
	}
	var deletedUsers int64
	for _, row := range deletedRows {
		if !row.DeletedAt.Valid {
			continue
		}
		delTs := row.DeletedAt.Time.Unix()
		if delTs < startTs || delTs > endTs {
			continue
		}
		deletedUsers++
		if row.CreatedAt < startTs {
			baselineUsers++
		}
		label := siteOverviewBucketLabel(delTs, bucketUnit, loc)
		if point, ok := trendMap[label]; ok {
			point.DeletedUsers++
		}
	}
	usersSummary.DeletedUsers = deletedUsers
	usersSummary.NetUserChange = usersSummary.NewUsers - usersSummary.DeletedUsers

	runningUsers := baselineUsers
	for _, label := range trendOrder {
		point := trendMap[label]
		runningUsers += point.NewUsers - point.DeletedUsers
		if runningUsers < 0 {
			runningUsers = 0
		}
		point.CumulativeUsers = runningUsers
	}

	var loginActiveUsers int64
	if err := applyUserRoleFilter(DB.Model(&User{})).
		Where("last_login_at >= ? AND last_login_at <= ?", startTs, endTs).
		Count(&loginActiveUsers).Error; err != nil {
		return nil, err
	}
	usersSummary.LoginActiveUsers = loginActiveUsers

	if usersSummary.TotalUsers > 0 {
		usersSummary.ActiveRate = roundPercent(float64(usersSummary.ActiveUsers) / float64(usersSummary.TotalUsers) * 100)
	}

	// Paying users (completed top-ups or direct subscription orders).
	payingSet := make(map[int]struct{})
	if DB.Migrator().HasTable(&TopUp{}) {
		var topUpUserIDs []int
		topUpQuery := DB.Model(&TopUp{}).
			Where(
				"status = ? AND ((complete_time > 0 AND complete_time >= ? AND complete_time <= ?) OR (complete_time = 0 AND create_time >= ? AND create_time <= ?))",
				common.TopUpStatusSuccess, startTs, endTs, startTs, endTs,
			)
		if err := applyQuotaAdminFilter(topUpQuery).Distinct("user_id").Pluck("user_id", &topUpUserIDs).Error; err == nil {
			for _, uid := range topUpUserIDs {
				if uid > 0 {
					payingSet[uid] = struct{}{}
				}
			}
		}
	}
	if DB.Migrator().HasTable(&SubscriptionOrder{}) {
		var subUserIDs []int
		subQuery := DB.Model(&SubscriptionOrder{}).
			Where(
				"status = ? AND payment_method <> ? AND ((complete_time > 0 AND complete_time >= ? AND complete_time <= ?) OR (complete_time = 0 AND create_time >= ? AND create_time <= ?))",
				common.TopUpStatusSuccess, PaymentMethodBalance, startTs, endTs, startTs, endTs,
			)
		if err := applyQuotaAdminFilter(subQuery).Distinct("user_id").Pluck("user_id", &subUserIDs).Error; err == nil {
			for _, uid := range subUserIDs {
				if uid > 0 {
					payingSet[uid] = struct{}{}
				}
			}
		}
	}
	usersSummary.PayingUsers = int64(len(payingSet))

	// 4. Top models breakdown.
	type modelBreakdownRow struct {
		ModelName string
		Requests  int64
		Quota     int64
		Tokens    int64
	}
	var modelRows []modelBreakdownRow
	if err := applyQuotaAdminFilter(DB.Model(&QuotaData{})).
		Select("model_name, COALESCE(SUM(count), 0) AS requests, COALESCE(SUM(quota), 0) AS quota, COALESCE(SUM(token_used), 0) AS tokens").
		Where("created_at >= ? AND created_at <= ?", startBucket, endTs).
		Group("model_name").
		Scan(&modelRows).Error; err != nil {
		return nil, err
	}
	topModels := make([]SiteOverviewModelItem, 0, len(modelRows))
	for _, row := range modelRows {
		name := strings.TrimSpace(row.ModelName)
		if name == "" {
			continue
		}
		mUSD, mLocal := quotaToUSDAndLocal(row.Quota, currency)
		share := 0.0
		if usage.TotalQuota > 0 {
			share = roundPercent(float64(row.Quota) / float64(usage.TotalQuota) * 100)
		} else if usage.TotalRequests > 0 {
			share = roundPercent(float64(row.Requests) / float64(usage.TotalRequests) * 100)
		}
		topModels = append(topModels, SiteOverviewModelItem{
			ModelName:   name,
			Requests:    row.Requests,
			Quota:       row.Quota,
			BilledUSD:   roundMoney(mUSD),
			BilledLocal: roundMoney(mLocal),
			Tokens:      row.Tokens,
			SharePct:    share,
		})
	}
	slices.SortFunc(topModels, func(left, right SiteOverviewModelItem) int {
		if res := cmp.Compare(right.Quota, left.Quota); res != 0 {
			return res
		}
		if res := cmp.Compare(right.Requests, left.Requests); res != 0 {
			return res
		}
		return cmp.Compare(left.ModelName, right.ModelName)
	})
	if len(topModels) > 12 {
		topModels = topModels[:12]
	}

	// 5. Group breakdown.
	type groupBreakdownRow struct {
		GroupName   string `gorm:"column:group_name"`
		Requests    int64
		Quota       int64
		Tokens      int64
		ActiveUsers int64
	}
	var groupRows []groupBreakdownRow
	groupExpr := "CASE WHEN use_group IS NULL OR TRIM(use_group) = '' THEN 'default' ELSE TRIM(use_group) END"
	if err := applyQuotaAdminFilter(DB.Model(&QuotaData{})).
		Select(groupExpr+" AS group_name, COALESCE(SUM(count), 0) AS requests, COALESCE(SUM(quota), 0) AS quota, COALESCE(SUM(token_used), 0) AS tokens, COUNT(DISTINCT user_id) AS active_users").
		Where("created_at >= ? AND created_at <= ?", startBucket, endTs).
		Group(groupExpr).
		Scan(&groupRows).Error; err != nil {
		return nil, err
	}
	groups := make([]SiteOverviewGroupItem, 0, len(groupRows))
	for _, row := range groupRows {
		name := strings.TrimSpace(row.GroupName)
		if name == "" {
			name = "default"
		}
		gUSD, gLocal := quotaToUSDAndLocal(row.Quota, currency)
		groups = append(groups, SiteOverviewGroupItem{
			Group:       name,
			Requests:    row.Requests,
			Quota:       row.Quota,
			BilledUSD:   roundMoney(gUSD),
			BilledLocal: roundMoney(gLocal),
			Tokens:      row.Tokens,
			ActiveUsers: row.ActiveUsers,
		})
	}
	slices.SortFunc(groups, func(left, right SiteOverviewGroupItem) int {
		if res := cmp.Compare(right.Quota, left.Quota); res != 0 {
			return res
		}
		if res := cmp.Compare(right.Requests, left.Requests); res != 0 {
			return res
		}
		return cmp.Compare(left.Group, right.Group)
	})

	// 6. Top active/consuming users.
	type topUserRow struct {
		UserID   int
		Username string
		Requests int64
		Quota    int64
		Tokens   int64
	}
	var topUserRows []topUserRow
	if err := applyQuotaAdminFilter(DB.Model(&QuotaData{})).
		Select("user_id, MAX(username) AS username, COALESCE(SUM(count), 0) AS requests, COALESCE(SUM(quota), 0) AS quota, COALESCE(SUM(token_used), 0) AS tokens").
		Where("created_at >= ? AND created_at <= ?", startBucket, endTs).
		Group("user_id").
		Order("SUM(quota) DESC, SUM(count) DESC").
		Limit(10).
		Scan(&topUserRows).Error; err != nil {
		return nil, err
	}
	topUsers := make([]SiteOverviewUserItem, 0, len(topUserRows))
	if len(topUserRows) > 0 {
		userIDs := make([]int, 0, len(topUserRows))
		for _, row := range topUserRows {
			if row.UserID > 0 {
				userIDs = append(userIDs, row.UserID)
			}
		}
		type userInfoRow struct {
			Id          int
			Username    string
			DisplayName string
			GroupName   string `gorm:"column:group_name"`
			Status      int
			Quota       int64
			LastLoginAt int64
			CreatedAt   int64
		}
		userLookup := make(map[int]userInfoRow, len(userIDs))
		if len(userIDs) > 0 {
			groupCol := perfMetricGroupCol()
			var userInfos []userInfoRow
			if err := DB.Unscoped().Model(&User{}).
				Select("id, username, display_name, "+groupCol+" AS group_name, status, quota, last_login_at, created_at").
				Where("id IN ?", userIDs).
				Scan(&userInfos).Error; err == nil {
				for _, info := range userInfos {
					userLookup[info.Id] = info
				}
			}
		}
		for _, row := range topUserRows {
			uUSD, uLocal := quotaToUSDAndLocal(row.Quota, currency)
			item := SiteOverviewUserItem{
				UserId:      row.UserID,
				Username:    row.Username,
				Requests:    row.Requests,
				Quota:       row.Quota,
				BilledUSD:   roundMoney(uUSD),
				BilledLocal: roundMoney(uLocal),
				Tokens:      row.Tokens,
			}
			if info, ok := userLookup[row.UserID]; ok {
				if info.Username != "" {
					item.Username = info.Username
				}
				item.DisplayName = info.DisplayName
				item.Group = info.GroupName
				item.Status = info.Status
				item.RemainingQuota = info.Quota
				_, remLoc := quotaToUSDAndLocal(info.Quota, currency)
				item.RemainingLocal = roundMoney(remLoc)
				item.LastLoginAt = info.LastLoginAt
				item.CreatedAt = info.CreatedAt
			}
			topUsers = append(topUsers, item)
		}
	}

	// 7. Channels health snapshot.
	channelsSummary := SiteOverviewChannelsSummary{
		DisabledChannels: make([]SiteOverviewChannelAlert, 0),
	}
	if DB.Migrator().HasTable(&Channel{}) {
		type channelStatusRow struct {
			Status int
			Cnt    int64
		}
		var channelStatusRows []channelStatusRow
		if err := DB.Model(&Channel{}).
			Select("status, COUNT(*) AS cnt").
			Group("status").
			Scan(&channelStatusRows).Error; err != nil {
			return nil, err
		}
		for _, row := range channelStatusRows {
			channelsSummary.Total += row.Cnt
			switch row.Status {
			case common.ChannelStatusEnabled:
				channelsSummary.Enabled += row.Cnt
			case common.ChannelStatusManuallyDisabled:
				channelsSummary.ManuallyDisabled += row.Cnt
			case common.ChannelStatusAutoDisabled:
				channelsSummary.AutoDisabled += row.Cnt
			default:
				channelsSummary.Unknown += row.Cnt
			}
		}

		type channelAlertRow struct {
			Id           int
			Name         string
			Type         int
			GroupName    string `gorm:"column:group_name"`
			Status       int
			ResponseTime int
			TestTime     int64
			Priority     *int64
		}
		var alertRows []channelAlertRow
		groupCol := perfMetricGroupCol()
		if err := DB.Model(&Channel{}).
			Select("id, name, type, "+groupCol+" AS group_name, status, response_time, test_time, priority").
			Where("status IN ?", []int{common.ChannelStatusAutoDisabled, common.ChannelStatusManuallyDisabled}).
			Order("status DESC, id DESC").
			Limit(8).
			Scan(&alertRows).Error; err == nil {
			for _, row := range alertRows {
				var priority int64
				if row.Priority != nil {
					priority = *row.Priority
				}
				channelsSummary.DisabledChannels = append(channelsSummary.DisabledChannels, SiteOverviewChannelAlert{
					Id:           row.Id,
					Name:         row.Name,
					Type:         row.Type,
					Group:        row.GroupName,
					Status:       row.Status,
					ResponseTime: row.ResponseTime,
					TestTime:     row.TestTime,
					Priority:     priority,
				})
			}
		}
	}

	// Finalize trend slice with currency conversions.
	trend := make([]SiteOverviewTrendPoint, 0, len(trendOrder))
	for _, label := range trendOrder {
		point := trendMap[label]
		pUSD, pLocal := quotaToUSDAndLocal(point.Quota, currency)
		point.BilledUSD = roundMoney(pUSD)
		point.BilledLocal = roundMoney(pLocal)
		trend = append(trend, *point)
	}

	return &SiteOverviewBaseReport{
		Meta: SiteOverviewMeta{
			Range:              rangeKey,
			BucketUnit:         bucketUnit,
			StartTime:          startTs,
			EndTime:            endTs,
			PrevStartTime:      prevStartTs,
			PrevEndTime:        prevEndTs,
			GeneratedAt:        nowUnix,
			ExcludeAdminUsers:  excludeAdmins,
			ExcludedAdminCount: len(adminUserIDs),
			Currency:           currency,
		},
		Usage:     usage,
		Users:     usersSummary,
		Channels:  channelsSummary,
		Trend:     trend,
		TopModels: topModels,
		Groups:    groups,
		TopUsers:  topUsers,
		Location:  loc,
	}, nil
}
