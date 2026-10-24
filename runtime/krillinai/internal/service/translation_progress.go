package service

import (
	"fmt"
	"krillin-ai/internal/types"
	"strings"
	"sync"
)

// Only whole-subtitle translation uses this reporter. Audio translation keeps
// its existing segment aggregator, and legacy callers keep their callbacks.
type translationWorkProgress struct {
	mu          sync.Mutex
	report      func(types.TaskProgress)
	total       int
	preparation int
	lastPercent int
	drafts      map[string]bool
	reviewed    map[string]bool
	laidOut     map[string]bool
	completed   map[string]bool
	active      map[string]string
	message     string
}

func newTranslationWorkProgress(report func(types.TaskProgress)) *translationWorkProgress {
	return &translationWorkProgress{report: report, drafts: map[string]bool{}, reviewed: map[string]bool{}, laidOut: map[string]bool{}, completed: map[string]bool{}, active: map[string]string{}}
}

func (p *translationWorkProgress) prepare(total int, message string) {
	if p == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.total, p.message = total, message
	p.emit()
}

// Preparation advances only when a source group or context section finishes.
func (p *translationWorkProgress) prepared(percent int) {
	if p == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.preparation = max(p.preparation, min(100, percent))
	p.emit()
}

func (p *translationWorkProgress) working(sources []pairedTranslationSource, step string) {
	if p == nil || len(sources) == 0 {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.message = ""
	for _, source := range sources {
		if !p.completed[source.ID] {
			p.active[source.ID] = step
			if step == "排版" {
				p.reviewed[source.ID] = true
			}
		}
	}
	p.emit()
}

// Called only after a checkpoint was saved successfully. A draft is useful
// work, but does not count as a finished, reviewed and laid-out subtitle.
func (p *translationWorkProgress) saved(sentence pairedSentence, complete bool) {
	if p == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.message = ""
	if sentence.TranslationFallbackReason == "" && hasUsableTranslation(sentence.FullTarget) {
		p.drafts[sentence.ID] = true
	}
	if sentence.SemanticReviewed {
		p.reviewed[sentence.ID] = true
	}
	if sentence.LayoutReviewed {
		p.laidOut[sentence.ID] = true
	}
	if complete {
		// Finished fallbacks also represent processed work; their warnings and
		// failure counts continue to describe the result separately.
		p.drafts[sentence.ID], p.reviewed[sentence.ID], p.laidOut[sentence.ID] = true, true, true
		p.completed[sentence.ID] = true
		delete(p.active, sentence.ID)
	}
	p.emit()
}

func (p *translationWorkProgress) notice(message string) {
	if p == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.message = message
	p.emit()
}

// The weights represent completed work, never elapsed time. Serialize reports
// with updates so parallel batches cannot publish an older snapshot last.
func (p *translationWorkProgress) emit() {
	if p.report == nil {
		return
	}
	progress := types.TaskProgress{Phase: "translating_subtitles", Percent: p.preparation / 10, Total: p.total, Completed: len(p.completed)}
	var steps []string
	for _, step := range []string{"初译", "审校", "排版"} {
		for _, active := range p.active {
			if active == step {
				steps = append(steps, step)
				break
			}
		}
	}
	message := p.message
	if message == "" && len(steps) > 0 {
		message = "正在" + strings.Join(steps, "、")
	}
	if message == "" {
		message = "正在整理字幕结果"
	}
	progress.Message = message
	if p.total > 0 {
		// Preparation 10%, drafts 40%, review 25%, layout 15%, finalization 10%.
		// Reviewed/layout checkpoints earn progress before an entire batch ends.
		progress.Percent += (len(p.drafts)*40 + len(p.reviewed)*25 + len(p.laidOut)*15 + len(p.completed)*10) / p.total
		progress.Message = fmt.Sprintf("初译 %d/%d；字幕完成 %d/%d；%s", len(p.drafts), p.total, len(p.completed), p.total, message)
	}
	p.lastPercent = max(p.lastPercent, min(100, progress.Percent))
	progress.Percent = p.lastPercent
	p.report(progress)
}
