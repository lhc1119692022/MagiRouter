package model

import (
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateOptionValueQuotaIntegers(t *testing.T) {
	for _, key := range []string{"QuotaForNewUser", "QuotaForInviter", "QuotaForInvitee"} {
		for _, invalid := range []string{"", "0.5", "-1", "abc", strconv.Itoa(common.MaxWalletQuota + 1)} {
			t.Run(key+"_"+invalid, func(t *testing.T) {
				assert.Error(t, validateOptionValue(key, invalid))
			})
		}
		require.NoError(t, validateOptionValue(key, "0"))
		require.NoError(t, validateOptionValue(key, "250000"))
	}
}

func TestUpdateOptionMapRejectsInvalidQuotaWithoutOverwritingState(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	prevMap := common.OptionMap
	common.OptionMap = map[string]string{
		"QuotaForNewUser": "250000",
		"QuotaForInviter": "500000",
		"QuotaForInvitee": "100000",
	}
	common.OptionMapRWMutex.Unlock()

	prevNew, prevInviter, prevInvitee := common.QuotaForNewUser, common.QuotaForInviter, common.QuotaForInvitee
	common.QuotaForNewUser = 250000
	common.QuotaForInviter = 500000
	common.QuotaForInvitee = 100000

	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = prevMap
		common.OptionMapRWMutex.Unlock()
		common.QuotaForNewUser = prevNew
		common.QuotaForInviter = prevInviter
		common.QuotaForInvitee = prevInvitee
	})

	assert.Error(t, updateOptionMap("QuotaForNewUser", "0.5"))
	assert.Equal(t, 250000, common.QuotaForNewUser)
	assert.Equal(t, "250000", common.OptionMap["QuotaForNewUser"])

	assert.Error(t, updateOptionMap("QuotaForInviter", "-10"))
	assert.Equal(t, 500000, common.QuotaForInviter)
	assert.Equal(t, "500000", common.OptionMap["QuotaForInviter"])

	assert.Error(t, updateOptionMap("QuotaForInvitee", "not-a-number"))
	assert.Equal(t, 100000, common.QuotaForInvitee)
	assert.Equal(t, "100000", common.OptionMap["QuotaForInvitee"])

	require.NoError(t, updateOptionMap("QuotaForNewUser", "750000"))
	assert.Equal(t, 750000, common.QuotaForNewUser)
	assert.Equal(t, "750000", common.OptionMap["QuotaForNewUser"])
}
