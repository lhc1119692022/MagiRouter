package console_setting

import "github.com/QuantumNous/new-api/setting/config"

type ConsoleSetting struct {
	OfficialModelPrices     string `json:"official_model_prices"`
	HomeShowcase            string `json:"home_showcase"`
	PricingBanner           string `json:"pricing_banner"`
	PricingFilterOrder      string `json:"pricing_filter_order"`
	ChannelStatusGroupOrder string `json:"channel_status_group_order"`
	CreationPresets         string `json:"creation_presets"`
	DocsConfig              string `json:"docs_config"`
	SitePopups              string `json:"site_popups"`
	ApiInfo                 string `json:"api_info"`              // 控制台 API 信息 (JSON 数组字符串)
	UptimeKumaGroups        string `json:"uptime_kuma_groups"`    // Uptime Kuma 分组配置 (JSON 数组字符串)
	Announcements           string `json:"announcements"`         // 系统公告 (JSON 数组字符串)
	FAQ                     string `json:"faq"`                   // 常见问题 (JSON 数组字符串)
	ApiInfoEnabled          bool   `json:"api_info_enabled"`      // 是否启用 API 信息面板
	AuthDomainsEnabled      bool   `json:"auth_domains_enabled"`  // 是否在登录注册页展示官方访问域名
	UptimeKumaEnabled       bool   `json:"uptime_kuma_enabled"`   // 是否启用 Uptime Kuma 面板
	AnnouncementsEnabled    bool   `json:"announcements_enabled"` // 是否启用系统公告面板
	FAQEnabled              bool   `json:"faq_enabled"`           // 是否启用常见问答面板
}

// 默认配置
var defaultConsoleSetting = ConsoleSetting{
	OfficialModelPrices:     "{}",
	HomeShowcase:            "{}",
	PricingBanner:           "[]",
	PricingFilterOrder:      "{}",
	ChannelStatusGroupOrder: "[]",
	CreationPresets:         "[]",
	DocsConfig:              "{}",
	SitePopups:              "[]",
	ApiInfo:                 "",
	UptimeKumaGroups:        "",
	Announcements:           "",
	FAQ:                     "",
	ApiInfoEnabled:          true,
	AuthDomainsEnabled:      false,
	UptimeKumaEnabled:       true,
	AnnouncementsEnabled:    true,
	FAQEnabled:              true,
}

// 全局实例
var consoleSetting = defaultConsoleSetting

func init() {
	// 注册到全局配置管理器，键名为 console_setting
	config.GlobalConfig.Register("console_setting", &consoleSetting)
}

// GetConsoleSetting 获取 ConsoleSetting 配置实例
func GetConsoleSetting() *ConsoleSetting {
	return &consoleSetting
}
