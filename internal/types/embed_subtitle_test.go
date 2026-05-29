package types

import (
	"strconv"
	"strings"
	"testing"
)

func TestAssHeaderVerticalUsesSmallerReadableChineseStyle(t *testing.T) {
	if !strings.Contains(AssHeaderVertical, "Style: Major,Arial,12,") {
		t.Fatalf("vertical major subtitle style should use smaller font size 12")
	}
	if strings.Contains(AssHeaderVertical, ",-10,0,1,") {
		t.Fatalf("vertical subtitle style should not use negative letter spacing")
	}
}

func TestAssHeaderVerticalKeepsBilingualLinesCloseTogether(t *testing.T) {
	majorMargin := styleMarginV(t, AssHeaderVertical, "Major")
	minorMargin := styleMarginV(t, AssHeaderVertical, "Minor")
	if minorMargin-majorMargin > 10 {
		t.Fatalf("vertical bilingual subtitle gap too large: major MarginV=%d minor MarginV=%d", majorMargin, minorMargin)
	}
}

func styleMarginV(t *testing.T, header, styleName string) int {
	t.Helper()
	for _, line := range strings.Split(header, "\n") {
		prefix := "Style: " + styleName + ","
		if !strings.HasPrefix(line, prefix) {
			continue
		}
		fields := strings.Split(strings.TrimPrefix(line, "Style: "), ",")
		if len(fields) < 22 {
			t.Fatalf("style %s has %d fields, want at least 22: %q", styleName, len(fields), line)
		}
		marginV, err := strconv.Atoi(fields[21])
		if err != nil {
			t.Fatalf("style %s MarginV = %q: %v", styleName, fields[21], err)
		}
		return marginV
	}
	t.Fatalf("style %s not found", styleName)
	return 0
}
