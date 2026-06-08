package dubbing

import (
	"fmt"
	"strings"
)

func FitTimeline(plan []PlanItem, chunks []Chunk, cfg Config) ([]PlanItem, []Chunk, Report, error) {
	cfg = normalizeSpeedConfig(cfg)
	if !(cfg.SpeedMin > 0 && cfg.SpeedMin <= cfg.SpeedAccept && cfg.SpeedAccept <= cfg.SpeedMax) {
		return nil, nil, Report{}, fmt.Errorf("invalid speed config: min %.2f accept %.2f max %.2f", cfg.SpeedMin, cfg.SpeedAccept, cfg.SpeedMax)
	}

	fitted := append([]PlanItem(nil), plan...)
	fittedChunks := append([]Chunk(nil), chunks...)
	report := Report{}

	for chunkIndex, chunk := range fittedChunks {
		available := chunk.End - chunk.Start
		if available <= 0 {
			return nil, nil, report, fmt.Errorf("chunk %d has non-positive duration: %.3f", chunk.ID, available)
		}

		actual, err := chunkActualDuration(fitted, chunk)
		if err != nil {
			return nil, nil, report, err
		}

		speed := 1.0
		if actual > available {
			speed = actual / available
		}
		if speed > report.MaxSpeedFactor {
			report.MaxSpeedFactor = speed
		}
		if speed > cfg.SpeedAccept {
			report.Warnings = append(report.Warnings, fmt.Sprintf("chunk %d speed %.2f exceeds acceptable %.2f", chunk.ID, speed, cfg.SpeedAccept))
		}
		if speed > cfg.SpeedMax {
			report.Warnings = append(report.Warnings, fmt.Sprintf("chunk %d speed %.2f exceeds max %.2f", chunk.ID, speed, cfg.SpeedMax))
		}
		appliedSpeed := speed
		if appliedSpeed > cfg.SpeedMax {
			appliedSpeed = cfg.SpeedMax
		}
		if appliedSpeed < cfg.SpeedMin {
			appliedSpeed = cfg.SpeedMin
		}
		fittedChunks[chunkIndex].SpeedFactor = appliedSpeed

		durations := allocateChunkDurations(fitted, chunk, actual, appliedSpeed)
		cursor := chunk.Start
		for i, idx := range chunk.Items {
			duration := durations[i]
			fitted[idx].NewStart = cursor
			fitted[idx].NewEnd = cursor + duration
			fitted[idx].SpeedFactor = appliedSpeed
			cursor = fitted[idx].NewEnd
		}

		if cursor > chunk.End+0.6 {
			report.Warnings = append(report.Warnings, fmt.Sprintf("chunk %d overflows by %.2fs", chunk.ID, cursor-chunk.End))
		}
	}

	return fitted, fittedChunks, report, nil
}

func chunkActualDuration(plan []PlanItem, chunk Chunk) (float64, error) {
	if chunk.ActualDuration > 0 {
		for itemIndex, idx := range chunk.Items {
			if idx < 0 || idx >= len(plan) {
				return 0, fmt.Errorf("chunk %d references plan item %d out of range", chunk.ID, itemIndex)
			}
		}
		return chunk.ActualDuration, nil
	}

	actual := 0.0
	for itemIndex, idx := range chunk.Items {
		if idx < 0 || idx >= len(plan) {
			return 0, fmt.Errorf("chunk %d references plan item %d out of range", chunk.ID, itemIndex)
		}
		if plan[idx].ActualDuration <= 0 {
			return 0, fmt.Errorf("chunk %d item %d references plan index %d with non-positive actual duration: %.3f", chunk.ID, itemIndex, idx, plan[idx].ActualDuration)
		}
		actual += plan[idx].ActualDuration
	}
	return actual, nil
}

func allocateChunkDurations(plan []PlanItem, chunk Chunk, actual, speed float64) []float64 {
	durations := make([]float64, len(chunk.Items))
	if len(chunk.Items) == 0 {
		return durations
	}
	if speed <= 0 {
		speed = 1
	}

	total := actual / speed
	weights := make([]float64, len(chunk.Items))
	weightSum := 0.0
	useItemActual := chunk.ActualDuration <= 0
	for i, idx := range chunk.Items {
		weight := 0.0
		if useItemActual {
			weight = plan[idx].ActualDuration
		}
		if weight <= 0 {
			weight = plan[idx].EstimatedDuration
		}
		if weight <= 0 {
			weight = float64(len([]rune(strings.TrimSpace(plan[idx].SpokenText))))
		}
		if weight <= 0 {
			weight = 1
		}
		weights[i] = weight
		weightSum += weight
	}
	if weightSum <= 0 {
		even := total / float64(len(durations))
		for i := range durations {
			durations[i] = even
		}
		return durations
	}
	for i, weight := range weights {
		durations[i] = total * weight / weightSum
	}
	return durations
}

func normalizeSpeedConfig(cfg Config) Config {
	defaults := DefaultConfig()
	if cfg.SpeedMin <= 0 {
		cfg.SpeedMin = defaults.SpeedMin
	}
	if cfg.SpeedAccept <= 0 {
		cfg.SpeedAccept = defaults.SpeedAccept
	}
	if cfg.SpeedMax <= 0 {
		cfg.SpeedMax = defaults.SpeedMax
	}
	return cfg
}
