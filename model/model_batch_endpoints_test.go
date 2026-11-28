package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestApplyBatchModelEndpointsUpdate(t *testing.T) {
	t.Run("unchanged keeps existing value", func(t *testing.T) {
		existing := `{"openai":{"path":"/v1/chat/completions","method":"POST"}}`
		got, err := applyBatchModelEndpointsUpdate(existing, "", "", nil)
		require.NoError(t, err)
		assert.Equal(t, existing, got)
	})

	t.Run("clear removes all custom endpoints", func(t *testing.T) {
		got, err := applyBatchModelEndpointsUpdate(`{"openai":"/v1/chat/completions"}`, "clear", "", nil)
		require.NoError(t, err)
		assert.Empty(t, got)

		got, err = applyBatchModelEndpointsUpdate(`{malformed`, "clear", "", nil)
		require.NoError(t, err)
		assert.Empty(t, got)
	})

	t.Run("replace validates and canonicalizes object or array endpoints", func(t *testing.T) {
		got, err := applyBatchModelEndpointsUpdate(
			`{"openai":{"path":"/v1/chat/completions","method":"POST"}}`,
			"replace",
			`{"image-generation":{"path":"/v1/images/generations","method":"POST"},"image-edits":{"path":"/v1/images/edits","method":"POST"}}`,
			nil,
		)
		require.NoError(t, err)
		assert.JSONEq(t, `{"image-generation":{"path":"/v1/images/generations","method":"POST"},"image-edits":{"path":"/v1/images/edits","method":"POST"}}`, got)

		gotArray, err := applyBatchModelEndpointsUpdate("", "replace", `["openai","openai","image-generation"]`, nil)
		require.NoError(t, err)
		assert.JSONEq(t, `["openai","image-generation"]`, gotArray)
	})

	t.Run("append merges into empty, object, string-path, and array endpoints", func(t *testing.T) {
		incoming := `{"image-edits":{"path":"/v1/images/edits","method":"POST"}}`

		gotEmpty, err := applyBatchModelEndpointsUpdate("", "append", incoming, nil)
		require.NoError(t, err)
		assert.JSONEq(t, incoming, gotEmpty)

		gotObject, err := applyBatchModelEndpointsUpdate(
			`{"image-generation":{"path":"/v1/images/generations","method":"POST","extra":true},"image-edits":{"path":"/v1/legacy","method":"POST"}}`,
			"append",
			incoming,
			nil,
		)
		require.NoError(t, err)
		assert.JSONEq(t, `{
			"image-generation":{"path":"/v1/images/generations","method":"POST","extra":true},
			"image-edits":{"path":"/v1/images/edits","method":"POST"}
		}`, gotObject)

		gotLegacyStr, err := applyBatchModelEndpointsUpdate(
			`{"custom":"/v1/custom"}`,
			"append",
			incoming,
			nil,
		)
		require.NoError(t, err)
		assert.JSONEq(t, `{
			"custom":"/v1/custom",
			"image-edits":{"path":"/v1/images/edits","method":"POST"}
		}`, gotLegacyStr)

		gotFromArray, err := applyBatchModelEndpointsUpdate(
			`["openai","image-generation"]`,
			"append",
			incoming,
			nil,
		)
		require.NoError(t, err)
		assert.JSONEq(t, `{
			"openai":{"path":"/v1/chat/completions","method":"POST"},
			"image-generation":{"path":"/v1/images/generations","method":"POST"},
			"image-edits":{"path":"/v1/images/edits","method":"POST"}
		}`, gotFromArray)

		gotArrayMerge, err := applyBatchModelEndpointsUpdate(
			`["openai"]`,
			"append",
			`["openai","image-edits"]`,
			nil,
		)
		require.NoError(t, err)
		assert.JSONEq(t, `["openai","image-edits"]`, gotArrayMerge)
	})

	t.Run("append rejects array entry without default path unless overridden", func(t *testing.T) {
		_, err := applyBatchModelEndpointsUpdate(
			`["unknown-custom"]`,
			"append",
			`{"openai":{"path":"/v1/chat/completions","method":"POST"}}`,
			nil,
		)
		require.ErrorContains(t, err, "unknown-custom")

		got, err := applyBatchModelEndpointsUpdate(
			`["unknown-custom"]`,
			"append",
			`{"unknown-custom":{"path":"/v1/custom","method":"POST"}}`,
			nil,
		)
		require.NoError(t, err)
		assert.JSONEq(t, `{"unknown-custom":{"path":"/v1/custom","method":"POST"}}`, got)
	})

	t.Run("remove deletes specified keys and returns empty string when none left", func(t *testing.T) {
		existing := `{"image-generation":{"path":"/v1/images/generations","method":"POST"},"image-edits":{"path":"/v1/images/edits","method":"POST"}}`

		gotPartial, err := applyBatchModelEndpointsUpdate(existing, "remove", "", []string{"image-edits", "missing"})
		require.NoError(t, err)
		assert.JSONEq(t, `{"image-generation":{"path":"/v1/images/generations","method":"POST"}}`, gotPartial)

		gotEmpty, err := applyBatchModelEndpointsUpdate(existing, "remove", "", []string{"image-generation", "image-edits"})
		require.NoError(t, err)
		assert.Empty(t, gotEmpty)

		gotArrayPartial, err := applyBatchModelEndpointsUpdate(`["openai","image-edits"]`, "remove", "", []string{"image-edits"})
		require.NoError(t, err)
		assert.JSONEq(t, `["openai"]`, gotArrayPartial)

		gotArrayEmpty, err := applyBatchModelEndpointsUpdate(`["image-edits"]`, "remove", "", []string{"image-edits"})
		require.NoError(t, err)
		assert.Empty(t, gotArrayEmpty)

		gotNoop, err := applyBatchModelEndpointsUpdate("", "remove", "", []string{"openai"})
		require.NoError(t, err)
		assert.Empty(t, gotNoop)
	})

	t.Run("validation rejects invalid modes and malformed payloads", func(t *testing.T) {
		assert.ErrorContains(t, validateBatchModelEndpointsRequest("unknown", "", nil), "invalid endpoints update mode")
		assert.ErrorContains(t, validateBatchModelEndpointsRequest("replace", "", nil), "endpoints configuration cannot be empty")
		assert.ErrorContains(t, validateBatchModelEndpointsRequest("append", "{}", nil), "endpoints configuration cannot be empty")
		assert.ErrorContains(t, validateBatchModelEndpointsRequest("replace", "[]", nil), "endpoints configuration cannot be empty")
		assert.ErrorContains(t, validateBatchModelEndpointsRequest("append", "{invalid", nil), "invalid endpoints")
		assert.ErrorContains(t, validateBatchModelEndpointsRequest("replace", `{"openai":{"path":"v1/no-slash","method":"POST"}}`, nil), "must start with /")
		assert.ErrorContains(t, validateBatchModelEndpointsRequest("append", `{"openai":{"path":"/v1/chat","method":"BAD"}}`, nil), "invalid endpoint HTTP method")
		assert.ErrorContains(t, validateBatchModelEndpointsRequest("remove", "", []string{"", "  "}), "select at least one endpoint to remove")
	})
}
