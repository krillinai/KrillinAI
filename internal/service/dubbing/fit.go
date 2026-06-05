package dubbing

import (
	"fmt"
)

func FitTimeline(plan []PlanItem, chunks []Chunk, cfg Config) ([]PlanItem, Report, error) {
	cfg = normalizeSpeedConfig(cfg)
	if !(cfg.SpeedMin > 0 && cfg.SpeedMin <= cfg.SpeedAccept && cfg.SpeedAccept <= cfg.SpeedMax) {
		return nil, Report{}, fmt.Errorf("invalid speed config: min %.2f accept %.2f max %.2f", cfg.SpeedMin, cfg.SpeedAccept, cfg.SpeedMax)
	}

	fitted := append([]PlanItem(nil), plan...)
	report := Report{}

	for _, chunk := range chunks {
		available := chunk.End - chunk.Start
		if available <= 0 {
			return nil, report, fmt.Errorf("chunk %d has non-positive duration: %.3f", chunk.ID, available)
		}

		actual := 0.0
		for itemIndex, idx := range chunk.Items {
			if idx < 0 || idx >= len(fitted) {
				return nil, report, fmt.Errorf("chunk %d references plan item %d out of range", chunk.ID, idx)
			}
			if fitted[idx].ActualDuration <= 0 {
				return nil, report, fmt.Errorf("chunk %d item %d references plan index %d with non-positive actual duration: %.3f", chunk.ID, itemIndex, idx, fitted[idx].ActualDuration)
			}
			actual += fitted[idx].ActualDuration
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

		cursor := chunk.Start
		for _, idx := range chunk.Items {
			duration := fitted[idx].ActualDuration
			if appliedSpeed > 0 {
				duration = duration / appliedSpeed
			}
			fitted[idx].NewStart = cursor
			fitted[idx].NewEnd = cursor + duration
			fitted[idx].SpeedFactor = appliedSpeed
			cursor = fitted[idx].NewEnd
		}

		if cursor > chunk.End+0.6 {
			report.Warnings = append(report.Warnings, fmt.Sprintf("chunk %d overflows by %.2fs", chunk.ID, cursor-chunk.End))
		}
	}

	return fitted, report, nil
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
