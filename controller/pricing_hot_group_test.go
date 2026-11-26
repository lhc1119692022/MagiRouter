package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSelectHottestModelGroup(t *testing.T) {
	ratios := map[string]float64{
		"GPT Team": 0.055,
		"GPT Fast": 0.25,
		"GPT Plus": 0.08,
	}

	t.Run("prefers highest per-model group request count", func(t *testing.T) {
		hot := selectHottestModelGroup(
			"gpt-6.2-sol",
			[]string{"auto", "GPT Team", "GPT Fast", "GPT Plus"},
			ratios,
			map[string]map[string]int64{
				"gpt-6.2-sol": {
					"GPT Team": 40,
					"GPT Fast": 120,
				},
			},
			map[string]int64{
				"GPT Team": 500,
				"GPT Fast": 120,
			},
		)
		assert.Equal(t, "GPT Fast", hot)
	})

	t.Run("falls back to overall group popularity when model has no traffic", func(t *testing.T) {
		hot := selectHottestModelGroup(
			"gpt-6.2-astra",
			[]string{"GPT Team", "GPT Plus", "GPT Fast"},
			ratios,
			map[string]map[string]int64{},
			map[string]int64{
				"GPT Plus": 300,
				"GPT Fast": 80,
			},
		)
		assert.Equal(t, "GPT Plus", hot)
	})

	t.Run("falls back to lowest multiplier ratio when no traffic exists", func(t *testing.T) {
		hot := selectHottestModelGroup(
			"gpt-6.2-sol",
			[]string{"auto", "GPT Fast", "GPT Plus", "GPT Team"},
			ratios,
			nil,
			nil,
		)
		assert.Equal(t, "GPT Team", hot)
	})
}
