package operation_setting

import (
	"encoding/base64"
	"math"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

type PaymentSetting struct {
	AmountOptions  []int           `json:"amount_options"`
	AmountDiscount map[int]float64 `json:"amount_discount"` // 充值金额对应的折扣，例如 100 元 0.9 表示 100 元充值享受 9 折优惠

	ComplianceConfirmed    bool   `json:"compliance_confirmed"`
	ComplianceTermsVersion string `json:"compliance_terms_version"`
	ComplianceConfirmedAt  int64  `json:"compliance_confirmed_at"`
	ComplianceConfirmedBy  int    `json:"compliance_confirmed_by"`
	ComplianceConfirmedIP  string `json:"compliance_confirmed_ip"`

	// 易支付签名方式：MD5 使用 EpayKey；RSA 使用商户私钥签名请求、平台公钥验证回调。
	EpaySignType           string `json:"epay_sign_type"`
	EpayMerchantPrivateKey string `json:"epay_merchant_private_key"`
	EpayPlatformPublicKey  string `json:"epay_platform_public_key"`

	DailyTopUpLimit               float64  `json:"daily_topup_limit"`
	DailyTopUpExemptUsers         []string `json:"daily_topup_exempt_users"`
	DailyTopUpContactWeChatQRCode string   `json:"daily_topup_contact_wechat_qrcode"`
	DailyTopUpContactNote         string   `json:"daily_topup_contact_note"`

	// OrderExpireMinutes controls after how many minutes unpaid pending orders expire automatically (0 disables).
	OrderExpireMinutes int `json:"order_expire_minutes"`
}

const CurrentComplianceTermsVersion = "v1"

const (
	EpaySignTypeMD5 = "MD5"
	EpaySignTypeRSA = "RSA"

	EpaySignTypeOptionKey           = "payment_setting.epay_sign_type"
	EpayMerchantPrivateKeyOptionKey = "payment_setting.epay_merchant_private_key"
	EpayPlatformPublicKeyOptionKey  = "payment_setting.epay_platform_public_key"

	DailyTopUpLimitOptionKey               = "payment_setting.daily_topup_limit"
	DailyTopUpExemptUsersOptionKey         = "payment_setting.daily_topup_exempt_users"
	DailyTopUpContactWeChatQRCodeOptionKey = "payment_setting.daily_topup_contact_wechat_qrcode"
	DailyTopUpContactNoteOptionKey         = "payment_setting.daily_topup_contact_note"
	OrderExpireMinutesOptionKey            = "payment_setting.order_expire_minutes"

	DefaultDailyTopUpLimit        = 200.0
	MaxDailyTopUpLimit            = 1_000_000_000.0
	MaxDailyTopUpExemptUsers      = 1000
	MaxDailyTopUpQRCodeLength     = 750 * 1024
	MaxDailyTopUpContactNoteRunes = 500
	DefaultOrderExpireMinutes     = 20
	MaxOrderExpireMinutes         = 30 * 24 * 60
)

type DailyTopUpLimitConfig struct {
	Limit           float64
	ExemptUsers     []string
	ContactWeChatQR string
	ContactNote     string
}

// 默认配置
var paymentSetting = PaymentSetting{
	AmountOptions:  []int{10, 20, 50, 100, 200, 500},
	AmountDiscount: map[int]float64{},
	// 没有保存过签名方式的站点按 MD5 运行，升级后行为不变。
	EpaySignType:          EpaySignTypeMD5,
	DailyTopUpLimit:       DefaultDailyTopUpLimit,
	DailyTopUpExemptUsers: []string{},
	OrderExpireMinutes:    DefaultOrderExpireMinutes,
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("payment_setting", &paymentSetting)
}

func GetPaymentSetting() *PaymentSetting {
	return &paymentSetting
}

func IsPaymentComplianceConfirmed() bool {
	return paymentSetting.ComplianceConfirmed &&
		paymentSetting.ComplianceTermsVersion == CurrentComplianceTermsVersion
}

func GetDailyTopUpLimitConfig() DailyTopUpLimitConfig {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()

	exemptUsers := make([]string, 0, len(paymentSetting.DailyTopUpExemptUsers))
	for _, raw := range paymentSetting.DailyTopUpExemptUsers {
		if trimmed := strings.TrimSpace(raw); trimmed != "" {
			exemptUsers = append(exemptUsers, trimmed)
		}
	}

	limit := paymentSetting.DailyTopUpLimit
	if math.IsNaN(limit) || math.IsInf(limit, 0) || limit < 0 {
		limit = 0
	}

	return DailyTopUpLimitConfig{
		Limit:           limit,
		ExemptUsers:     exemptUsers,
		ContactWeChatQR: strings.TrimSpace(paymentSetting.DailyTopUpContactWeChatQRCode),
		ContactNote:     strings.TrimSpace(paymentSetting.DailyTopUpContactNote),
	}
}

func GetOrderExpireMinutes() int {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()

	minutes := paymentSetting.OrderExpireMinutes
	if minutes < 0 {
		return 0
	}
	return min(minutes, MaxOrderExpireMinutes)
}

func GetOrderExpireDuration() time.Duration {
	minutes := GetOrderExpireMinutes()
	if minutes <= 0 {
		return 0
	}
	return time.Duration(minutes) * time.Minute
}

func ValidateOrderExpireOption(key, value string) error {
	if key != OrderExpireMinutesOptionKey {
		return nil
	}
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || parsed < 0 || parsed > MaxOrderExpireMinutes {
		return common.NewMessage("Order expiration timeout must be an integer between 0 and {{max}} minutes", map[string]any{"max": MaxOrderExpireMinutes})
	}
	return nil
}

func (cfg DailyTopUpLimitConfig) IsUserExempt(userId int, username string, email string) bool {
	trimmedUsername := strings.TrimSpace(username)
	trimmedEmail := strings.TrimSpace(email)

	for _, rawEntry := range cfg.ExemptUsers {
		entry := strings.TrimSpace(rawEntry)
		if entry == "" {
			continue
		}

		numericCandidate := strings.TrimPrefix(entry, "#")
		if numericCandidate != "" {
			if parsedId, err := strconv.Atoi(numericCandidate); err == nil && parsedId > 0 && strconv.Itoa(parsedId) == numericCandidate {
				if userId > 0 && parsedId == userId {
					return true
				}
				continue
			}
		}

		if trimmedUsername != "" && strings.EqualFold(entry, trimmedUsername) {
			return true
		}
		if trimmedEmail != "" && strings.EqualFold(entry, trimmedEmail) {
			return true
		}
	}

	return false
}

var allowedQRCodeDataURLPrefixes = []string{
	"data:image/png;base64,",
	"data:image/jpeg;base64,",
	"data:image/jpg;base64,",
	"data:image/webp;base64,",
	"data:image/gif;base64,",
}

func isValidWeChatQRCodeSource(value string) bool {
	lower := strings.ToLower(value)
	for _, prefix := range allowedQRCodeDataURLPrefixes {
		if strings.HasPrefix(lower, prefix) {
			payload := value[len(prefix):]
			if payload == "" {
				return false
			}
			if _, err := base64.StdEncoding.DecodeString(payload); err != nil {
				return false
			}
			return true
		}
	}

	if strings.HasPrefix(value, "/") {
		if strings.HasPrefix(value, "//") {
			return false
		}
		return !strings.ContainsAny(value, " \t\r\n")
	}

	parsed, err := url.Parse(value)
	if err != nil {
		return false
	}
	scheme := strings.ToLower(parsed.Scheme)
	return (scheme == "https" || scheme == "http") && parsed.Host != ""
}

func ValidateDailyTopUpOption(key, value string) error {
	switch key {
	case DailyTopUpLimitOptionKey:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
		if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) || parsed < 0 || parsed > MaxDailyTopUpLimit {
			return common.NewMessage("Daily top-up limit must be a non-negative number")
		}
	case DailyTopUpExemptUsersOptionKey:
		var entries []string
		if err := common.UnmarshalJsonStr(value, &entries); err != nil {
			return common.NewMessage("Daily top-up exempt users must be a valid JSON string array")
		}
		if len(entries) > MaxDailyTopUpExemptUsers {
			return common.NewMessage("Daily top-up exempt users list cannot exceed {{max}} entries", map[string]any{"max": MaxDailyTopUpExemptUsers})
		}
		for _, entry := range entries {
			if len(strings.TrimSpace(entry)) > 255 {
				return common.NewMessage("Daily top-up exempt user identifier is too long")
			}
		}
	case DailyTopUpContactWeChatQRCodeOptionKey:
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return nil
		}
		if len(trimmed) > MaxDailyTopUpQRCodeLength {
			return common.NewMessage("WeChat QR code image is too large")
		}
		if !isValidWeChatQRCodeSource(trimmed) {
			return common.NewMessage("WeChat QR code must be a valid HTTP(S) URL, site path, or PNG/JPEG/WebP/GIF image")
		}
	case DailyTopUpContactNoteOptionKey:
		if utf8.RuneCountInString(strings.TrimSpace(value)) > MaxDailyTopUpContactNoteRunes {
			return common.NewMessage("Daily top-up contact note cannot exceed {{max}} characters", map[string]any{"max": MaxDailyTopUpContactNoteRunes})
		}
	}
	return nil
}

// ValidateEpaySignOption checks a change to the Epay signing settings against
// the saved ones. While RSA is active, both keys must parse; under MD5 only a
// newly entered key is checked.
func ValidateEpaySignOption(key, value string) error {
	if key != EpaySignTypeOptionKey && key != EpayMerchantPrivateKeyOptionKey && key != EpayPlatformPublicKeyOptionKey {
		return nil
	}
	// Saved values are written under OptionMapRWMutex by the option update path.
	common.OptionMapRWMutex.RLock()
	signType := paymentSetting.EpaySignType
	privateKey := paymentSetting.EpayMerchantPrivateKey
	publicKey := paymentSetting.EpayPlatformPublicKey
	common.OptionMapRWMutex.RUnlock()
	switch key {
	case EpaySignTypeOptionKey:
		if value != EpaySignTypeMD5 && value != EpaySignTypeRSA {
			return common.NewMessage("Epay signature type must be MD5 or RSA")
		}
		signType = value
	case EpayMerchantPrivateKeyOptionKey:
		privateKey = value
	case EpayPlatformPublicKeyOptionKey:
		publicKey = value
	}
	rsaActive := signType == EpaySignTypeRSA
	if rsaActive || (key == EpayMerchantPrivateKeyOptionKey && strings.TrimSpace(value) != "") {
		if _, err := epay.ParseRSAPrivateKey(privateKey); err != nil {
			return common.NewMessage("The Epay merchant private key is missing or invalid")
		}
	}
	if rsaActive || (key == EpayPlatformPublicKeyOptionKey && strings.TrimSpace(value) != "") {
		if _, err := epay.ParseRSAPublicKey(publicKey); err != nil {
			return common.NewMessage("The Epay platform public key is missing or invalid")
		}
	}
	return nil
}
