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
