package controller

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestCreationPresetWritePermissions(t *testing.T) {
	admin, _ := setupAccessTokenAudit(t)
	_, adminSession := createAccessTokenTestSession(t, admin.Id, "preset-admin")
	root := &model.User{Username: "preset-owner", Role: common.RoleRootUser, Status: common.UserStatusEnabled, AuthVersion: 1, AffCode: "preset-owner"}
	require.NoError(t, model.DB.Create(root).Error)
	_, rootSession := createAccessTokenTestSession(t, root.Id, "preset-owner")
	reader, _ := createScopedAccessToken(t, root.Id, 0, "option:read")
	writer, _ := createScopedAccessToken(t, root.Id, 0, "option:write")
	router := gin.New()
	const path = "/api/option/creation-presets"
	router.POST(path, middleware.RootAuth(), CreateCreationPreset)
	for _, test := range []struct {
		name, credential string
		status           int
	}{
		{"anonymous", "", http.StatusUnauthorized},
		{"non-root administrator", adminSession, http.StatusForbidden},
		{"root read-only grant", reader, http.StatusForbidden},
		{"root browser session reaches validation", rootSession, http.StatusBadRequest},
		{"root write grant reaches validation", writer, http.StatusBadRequest},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := accessTokenRequest(router, http.MethodPost, path, test.credential, "", `{}`)
			require.Equal(t, test.status, response.Code, response.Body.String())
		})
	}
	var count int64
	require.NoError(t, model.DB.Model(&model.Option{}).Where(&model.Option{Key: console_setting.CreationPresetsOption}).Count(&count).Error)
	require.Zero(t, count)
}

func TestCreationPresetPersistence(t *testing.T) {
	const key = console_setting.CreationPresetsOption
	const create = "/api/option/creation-presets"
	const setup = "/api/option/"
	const read = "/api/user/self/creation-presets"
	const draft = `{"id":"compose","title":"Compose","model":"writing-alias","mode":"chat","prompt":"  Revise the opening.\nKeep its meaning.  ","tags":["Editorial"],"parameters":{"temperature":0,"seed":0}}`
	const live = `{"id":"design","title":"Design","model":"motion-alias","mode":"video","prompt":"Illustrate.","published":true,"parameters":{"videoTask":"t2v","nativeAudio":false}}`
	previousConfig := console_setting.GetConsoleSetting().CreationPresets
	t.Cleanup(func() { console_setting.GetConsoleSetting().CreationPresets = previousConfig })
	for _, dialect := range []struct{ name, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.name, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}
			database := modelManagementDB(t, dialect.name, os.Getenv(dialect.env))
			require.NoError(t, database.AutoMigrate(&model.SystemTask{}))
			post := func(body string) *httptest.ResponseRecorder {
				response := httptest.NewRecorder()
				ctx, _ := gin.CreateTestContext(response)
				ctx.Request = httptest.NewRequest(http.MethodPost, create, strings.NewReader(body))
				ctx.Set("role", common.RoleRootUser)
				CreateCreationPreset(ctx)
				return response
			}
			var saved model.Option
			lookup := func() string {
				t.Helper()
				require.NoError(t, database.Where(&model.Option{Key: key}).Take(&saved).Error)
				return saved.Value
			}
			responses := make(chan *httptest.ResponseRecorder, 3)
			for _, body := range []string{draft, live, draft} {
				go func() { responses <- post(body) }()
			}
			for range 3 {
				response := <-responses
				require.Equal(t, http.StatusOK, response.Code, response.Body.String())
			}
			initial := lookup()
			stored, err := console_setting.ParseCreationPresets(initial)
			require.NoError(t, err)
			require.Len(t, stored, 2)
			var expectedDraft, expectedLive map[string]any
			require.NoError(t, common.UnmarshalJsonStr(draft, &expectedDraft))
			require.NoError(t, common.UnmarshalJsonStr(live, &expectedLive))
			expectedDraft["published"] = false
			require.ElementsMatch(t, []map[string]any{expectedDraft, expectedLive}, stored)
			var syncs int64
			require.NoError(t, database.Model(&model.SystemTask{}).Where("type = ?", model.SyncTaskType(model.SyncTopicOptions)).Count(&syncs).Error)
			require.EqualValues(t, 2, syncs)
			for _, bad := range []string{
				`null`, `[]`, draft + `{}`, strings.Repeat(" ", console_setting.MaxCreationPresetsBytes) + draft,
				strings.Replace(draft, `"tags":["Editorial"]`, `"tags":["duplicate","duplicate"]`, 1),
				strings.Replace(draft, `"tags":["Editorial"]`, `"tags":[" "]`, 1),
				strings.Replace(draft, `"tags":["Editorial"]`, `"tags":["`+strings.Repeat("猫", 33)+`"]`, 1),
				strings.Replace(draft, `"tags"`, `"attachments"`, 1),
				strings.Replace(draft, `"temperature":0`, `"provider_settings":{}`, 1),
			} {
				response := post(bad)
				require.Equal(t, http.StatusBadRequest, response.Code)
			}
			require.Equal(t, http.StatusConflict, post(strings.Replace(draft, "writing-alias", "another-alias", 1)).Code)
			old := "[]"
			for _, previous := range []*string{nil, &old} {
				response := modelManagementRequest(t, UpdateOption, http.MethodPut, setup, OptionUpdateRequest{Key: key, Value: "[]", PreviousValue: previous}, nil)
				require.Equal(t, http.StatusConflict, response.Code)
			}
			require.Equal(t, initial, lookup())
			require.NoError(t, model.LoadOptionsFromDatabase())
			var published struct{ Data []map[string]any }
			modelManagementRequest(t, GetCreationPresets, http.MethodGet, read, nil, &published)
			require.Equal(t, []map[string]any{expectedLive}, published.Data)
			expectedDraft["published"] = true
			edited, err := common.Marshal([]map[string]any{expectedDraft})
			require.NoError(t, err)
			response := modelManagementRequest(t, UpdateOption, http.MethodPut, setup, OptionUpdateRequest{Key: key, Value: string(edited), PreviousValue: &initial}, nil)
			require.Equal(t, http.StatusOK, response.Code, response.Body.String())
			require.Equal(t, string(edited), lookup())
			modelManagementRequest(t, GetCreationPresets, http.MethodGet, read, nil, &published)
			require.Equal(t, []map[string]any{expectedDraft}, published.Data)
		})
	}
}
