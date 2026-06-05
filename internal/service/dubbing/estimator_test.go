package dubbing

import (
	"krillin-ai/internal/types"
	"testing"
)

func TestStatisticalEstimatorAddsPunctuationAndNumberPenalty(t *testing.T) {
	est := NewStatisticalEstimator()
	plain, _, err := est.Estimate("你好世界", types.LanguageNameSimplifiedChinese)
	if err != nil {
		t.Fatal(err)
	}
	withPause, _, err := est.Estimate("你好，世界。2026", types.LanguageNameSimplifiedChinese)
	if err != nil {
		t.Fatal(err)
	}
	if withPause <= plain {
		t.Fatalf("withPause = %v, plain = %v; want punctuation and number to add duration", withPause, plain)
	}
}

func TestEstimatorCalibrationAdjustsFutureEstimates(t *testing.T) {
	est := NewStatisticalEstimator()
	before, _, _ := est.Estimate("这是一个测试句子", types.LanguageNameSimplifiedChinese)
	est.Calibrate(types.LanguageNameSimplifiedChinese, before, before*1.5)
	after, _, _ := est.Estimate("这是一个测试句子", types.LanguageNameSimplifiedChinese)
	if after <= before {
		t.Fatalf("after = %v, before = %v; want calibration to increase estimate", after, before)
	}
}

func TestHeuristicFallbackReturnsLowConfidence(t *testing.T) {
	est := NewHeuristicEstimator()
	seconds, confidence, err := est.Estimate("hello world", "")
	if err != nil {
		t.Fatal(err)
	}
	if seconds <= 0 || confidence >= 0.7 {
		t.Fatalf("seconds=%v confidence=%v", seconds, confidence)
	}
}
