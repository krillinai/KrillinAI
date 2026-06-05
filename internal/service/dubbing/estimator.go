package dubbing

import (
	"math"
	"strings"
	"sync"
	"unicode"

	"krillin-ai/internal/types"
)

type DurationEstimator interface {
	Estimate(text string, language types.StandardLanguageCode) (float64, float64, error)
}

type CalibratingEstimator interface {
	DurationEstimator
	Calibrate(language types.StandardLanguageCode, estimatedSeconds, actualSeconds float64)
}

type speechRateProfile struct {
	runePerSecond float64
	confidence    float64
	pauseWeight   float64
	numberWeight  float64
	acronymWeight float64
}

var speechProfiles = map[types.StandardLanguageCode]speechRateProfile{
	types.LanguageNameSimplifiedChinese:  {runePerSecond: 4.2, confidence: 0.95, pauseWeight: 0.30, numberWeight: 0.22, acronymWeight: 0.12},
	types.LanguageNameTraditionalChinese: {runePerSecond: 4.1, confidence: 0.95, pauseWeight: 0.30, numberWeight: 0.22, acronymWeight: 0.12},
	types.LanguageNameJapanese:           {runePerSecond: 4.0, confidence: 0.94, pauseWeight: 0.28, numberWeight: 0.20, acronymWeight: 0.12},
	types.LanguageNameKorean:             {runePerSecond: 4.3, confidence: 0.93, pauseWeight: 0.28, numberWeight: 0.20, acronymWeight: 0.12},
	types.LanguageNameEnglish:            {runePerSecond: 13.5, confidence: 0.92, pauseWeight: 0.24, numberWeight: 0.26, acronymWeight: 0.32},
	types.LanguageNameGerman:             {runePerSecond: 11.8, confidence: 0.91, pauseWeight: 0.24, numberWeight: 0.25, acronymWeight: 0.28},
	types.LanguageNameRussian:            {runePerSecond: 10.8, confidence: 0.90, pauseWeight: 0.24, numberWeight: 0.24, acronymWeight: 0.24},
	types.LanguageNameTurkish:            {runePerSecond: 12.0, confidence: 0.91, pauseWeight: 0.24, numberWeight: 0.24, acronymWeight: 0.26},
}

type StatisticalEstimator struct {
	mu          sync.RWMutex
	calibration map[types.StandardLanguageCode]float64
}

func NewStatisticalEstimator() *StatisticalEstimator {
	return &StatisticalEstimator{
		calibration: map[types.StandardLanguageCode]float64{},
	}
}

func (e *StatisticalEstimator) Estimate(text string, language types.StandardLanguageCode) (float64, float64, error) {
	profile, ok := speechProfiles[language]
	if !ok {
		return NewHeuristicEstimator().Estimate(text, language)
	}

	runeCount := nonSpaceRuneCount(text)
	if runeCount == 0 {
		return 0, profile.confidence, nil
	}

	baseDuration := float64(runeCount) / profile.runePerSecond
	duration := baseDuration + punctuationPause(text, profile) + numberPenalty(text, profile) + acronymPenalty(text, profile)
	duration *= e.calibrationFactor(language)
	if duration < 0 {
		duration = 0
	}
	return duration, profile.confidence, nil
}

func (e *StatisticalEstimator) Calibrate(language types.StandardLanguageCode, estimatedSeconds, actualSeconds float64) {
	if estimatedSeconds <= 0 || actualSeconds <= 0 {
		return
	}

	target := actualSeconds / estimatedSeconds
	if target <= 0 || math.IsNaN(target) || math.IsInf(target, 0) {
		return
	}
	target = math.Max(0.5, math.Min(1.5, target))

	e.mu.Lock()
	defer e.mu.Unlock()

	current := e.calibration[language]
	if current == 0 {
		current = 1.0
	}
	e.calibration[language] = current*0.7 + target*0.3
}

func (e *StatisticalEstimator) calibrationFactor(language types.StandardLanguageCode) float64 {
	e.mu.RLock()
	defer e.mu.RUnlock()

	if factor, ok := e.calibration[language]; ok && factor > 0 {
		return factor
	}
	return 1.0
}

type HeuristicEstimator struct{}

func NewHeuristicEstimator() *HeuristicEstimator {
	return &HeuristicEstimator{}
}

func (e *HeuristicEstimator) Estimate(text string, language types.StandardLanguageCode) (float64, float64, error) {
	runeCount := nonSpaceRuneCount(text)
	if runeCount == 0 {
		return 0, 0.5, nil
	}

	wordCount := len(strings.Fields(text))
	letterCount := 0
	digitCount := 0
	for _, r := range text {
		switch {
		case unicode.IsDigit(r):
			digitCount++
		case unicode.IsLetter(r):
			letterCount++
		}
	}

	baseDuration := float64(runeCount) / 8.5
	if wordCount > 0 {
		baseDuration += float64(wordCount) * 0.12
	}
	baseDuration += float64(digitCount) * 0.08
	baseDuration += float64(letterCount) * 0.01
	baseDuration += punctuationPause(text, speechRateProfile{pauseWeight: 0.18, numberWeight: 0.10, acronymWeight: 0.10})
	baseDuration += numberPenalty(text, speechRateProfile{pauseWeight: 0.18, numberWeight: 0.10, acronymWeight: 0.10})
	baseDuration += acronymPenalty(text, speechRateProfile{pauseWeight: 0.18, numberWeight: 0.10, acronymWeight: 0.10})
	if baseDuration < 0.2 {
		baseDuration = 0.2
	}
	return baseDuration, 0.5, nil
}

func nonSpaceRuneCount(text string) int {
	count := 0
	for _, r := range text {
		if !unicode.IsSpace(r) {
			count++
		}
	}
	return count
}

func punctuationPause(text string, profile speechRateProfile) float64 {
	var pauses float64
	for _, r := range text {
		switch r {
		case ',', '，', '、', ';', '；', ':', '：':
			pauses += 0.22 * profile.pauseWeight
		case '.', '。', '!', '！', '?', '？':
			pauses += 0.28 * profile.pauseWeight
		case '…', '—', '～':
			pauses += 0.34 * profile.pauseWeight
		}
	}
	return pauses
}

func numberPenalty(text string, profile speechRateProfile) float64 {
	var count int
	for _, r := range text {
		if unicode.IsDigit(r) {
			count++
		}
	}
	return float64(count) * 0.12 * profile.numberWeight
}

func acronymPenalty(text string, profile speechRateProfile) float64 {
	var penalty float64
	var run int
	for _, r := range text {
		if unicode.IsUpper(r) {
			run++
			continue
		}
		if run >= 2 {
			penalty += float64(run) * 0.18 * profile.acronymWeight
		}
		run = 0
	}
	if run >= 2 {
		penalty += float64(run) * 0.18 * profile.acronymWeight
	}
	return penalty
}
