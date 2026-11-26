package operation_setting

import (
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateQuotaOptionUserAndInviteQuotas(t *testing.T) {
	keys := []string{"QuotaForNewUser", "QuotaForInviter", "QuotaForInvitee"}
	maxValid := strconv.Itoa(common.MaxWalletQuota)
	aboveMax := strconv.Itoa(common.MaxWalletQuota + 1)

	for _, key := range keys {
		t.Run(key, func(t *testing.T) {
			for _, valid := range []string{"0", "250000", maxValid} {
				require.NoError(t, ValidateQuotaOption(key, valid), "value=%q", valid)
			}

			for _, invalid := range []string{"", "0.5", "-1", " 250000 ", "invalid"} {
				err := ValidateQuotaOption(key, invalid)
				require.Error(t, err, "value=%q", invalid)
				assert.Contains(t, err.Error(), "non-negative integer")
			}

			err := ValidateQuotaOption(key, aboveMax)
			require.Error(t, err)
			assert.Contains(t, err.Error(), "exceeds valid range")
		})
	}
}
