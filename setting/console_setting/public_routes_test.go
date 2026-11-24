package console_setting

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPublicAPIRoutesPublishOnlyConfiguredPublicFields(t *testing.T) {
	settings := GetConsoleSetting()
	previous := settings.ApiInfo
	t.Cleanup(func() { settings.ApiInfo = previous })
	settings.ApiInfo = `[{"id":4,"url":"https://gateway.example/v1","route":"Main","description":"Public gateway","color":"blue","internal_note":"not public"},{"url":"https://gateway.example/v1?token=hidden","route":"Old URL","description":"Address","color":"blue"}]`
	data, err := common.Marshal(GetApiInfo())
	require.NoError(t, err)
	assert.JSONEq(t, `[{"id":4,"url":"https://gateway.example/v1","route":"Main","description":"Public gateway","color":"blue"}]`, string(data))
	for _, address := range []string{"https://gateway.example/v1?token=x", "https://gateway.example/v1#private", "https://u:p@gateway.example"} {
		err := ValidateConsoleSettings(`[{"url":"`+address+`","route":"Main","description":"Public gateway","color":"blue"}]`, "ApiInfo")
		assert.Error(t, err)
	}
}
