package service

import (
	"krillin-ai/internal/types"
	"slices"
)

// A review's explicit adjacent IDs define the repair unit. The editor must fix
// that whole block, rather than independently moving the same phrase between
// its old cuts. Disjoint issues remain separate blocks.
func prepareSegmentReviewRepair(sentence *pairedSentence, issues []segmentReviewIssue, targetLang types.StandardLanguageCode) {
	state := sentence.SegmentState
	positions := map[string]int{}
	for i, unit := range state.Units {
		positions[unit.ID] = i
	}
	var intervals [][2]int
	for _, issue := range issues {
		if issue.ID != sentence.ID || len(issue.SegmentIDs) < 2 {
			continue
		}
		start, end := len(state.Units), -1
		for _, id := range issue.SegmentIDs {
			position, exists := positions[id]
			if !exists {
				continue
			}
			start, end = min(start, position), max(end, position)
		}
		if start < end {
			intervals = append(intervals, [2]int{start, end})
		}
	}
	slices.SortFunc(intervals, func(a, b [2]int) int { return a[0] - b[0] })
	var groups [][2]int
	for _, interval := range intervals {
		if len(groups) > 0 && interval[0] <= groups[len(groups)-1][1] {
			groups[len(groups)-1][1] = max(groups[len(groups)-1][1], interval[1])
		} else {
			groups = append(groups, interval)
		}
	}
	var units []segmentedTranslationUnit
	cursor := 0
	for _, group := range groups {
		units = append(units, state.Units[cursor:group[0]]...)
		block := state.Units[group[0]]
		block.End = state.Units[group[1]].End
		block.Source = sentence.FullSource[block.Start:block.End]
		block.OriginIDs = nil
		var sources, targets, directs []string
		for _, unit := range state.Units[group[0] : group[1]+1] {
			sources = append(sources, unit.Source)
			targets = append(targets, unit.Target)
			directs = append(directs, unit.Direct)
			for _, id := range unit.OriginIDs {
				if !slices.Contains(block.OriginIDs, id) {
					block.OriginIDs = append(block.OriginIDs, id)
				}
			}
		}
		block.Direct = joinPairedTargetSegments(directs, targetLang)
		block.Target = joinPairedTargetSegments(targets, targetLang)
		rejection := segmentRejectedCut{Source: block.Source, Parts: sources}
		known := false
		for _, prior := range state.RejectedCuts {
			known = known || prior.Source == rejection.Source && slices.Equal(prior.Parts, rejection.Parts)
		}
		if !known {
			state.RejectedCuts = append(state.RejectedCuts, rejection)
		}
		units = append(units, block)
		cursor = group[1] + 1
	}
	if len(groups) > 0 {
		state.Units = append(units, state.Units[cursor:]...)
	}
}
