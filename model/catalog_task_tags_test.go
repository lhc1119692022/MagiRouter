package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSplitAndNormalizeCatalogTaskTags(t *testing.T) {
	ordinary, declarations := SplitCatalogTaskTags("推荐，200K 上下文, 推荐 , 低延迟，@mr:catalog:v1=text,@mr:tasks:v1=txt")
	require.Equal(t, "推荐,200K 上下文,低延迟", ordinary)
	require.Equal(t, "@mr:catalog:v1=text,@mr:tasks:v1=txt", declarations)

	require.Equal(
		t,
		"推荐,200K 上下文,低延迟,@mr:catalog:v1=text",
		NormalizeModelTags(" 推荐 ， 200K 上下文 , , 低延迟 , @mr:catalog:v1=text "),
	)
	require.Equal(t, "@mr:catalog:v1=none", NormalizeModelTags(",，@mr:catalog:v1=none"))
	require.Equal(t, "", NormalizeModelTags(" , ， "))
}

func TestResolveModelCapabilityCategories(t *testing.T) {
	require.Equal(
		t,
		[]string{"image", "video"},
		ResolveModelCapabilityCategories("Featured,@mr:catalog:v1=video+image", []string{"openai"}, ""),
	)
	require.Empty(
		t,
		ResolveModelCapabilityCategories("@mr:catalog:v1=none", []string{"openai"}, ""),
	)
	require.Equal(
		t,
		[]string{"text"},
		ResolveModelCapabilityCategories("@mr:tasks:v1=t2i,@mr:catalog:v1=auto", []string{"openai"}, ""),
	)
	require.Equal(
		t,
		[]string{"image", "transcription"},
		ResolveModelCapabilityCategories("@mr:tasks:v1=stt+i2i", nil, ""),
	)
	require.Empty(
		t,
		ResolveModelCapabilityCategories("@mr:tasks:v1=none", []string{"openai"}, ""),
	)
	require.Equal(
		t,
		[]string{"text", "image"},
		ResolveModelCapabilityCategories("", []string{"openai"}, `{"/v1/images/generations":{"path":"/v1/images/generations"}}`),
	)
	require.Equal(
		t,
		[]string{"video", "audio"},
		ResolveModelCapabilityCategories("", []string{"TTS"}, `["/v1/videos"]`),
	)
	require.Equal(
		t,
		[]string{"other"},
		ResolveModelCapabilityCategories("ordinary-tag", nil, ""),
	)

	cleared := &Model{Tags: "@mr:catalog:v1=none", SupportedEndpoints: []string{"openai"}}
	require.False(t, ModelMatchesCapabilityLabels(cleared, []string{"text", "other"}))
	require.True(t, ModelMatchesCapabilityLabels(cleared, nil))

	multi := &Model{Tags: "@mr:catalog:v1=image+video"}
	require.True(t, ModelMatchesCapabilityLabels(multi, []string{"video"}))
	require.True(t, ModelMatchesCapabilityLabels(multi, []string{"audio", "image"}))
	require.False(t, ModelMatchesCapabilityLabels(multi, []string{"text", "audio"}))
}
