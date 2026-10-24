package service

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/image/font/sfnt"
)

func TestSubtitleFontCoverageResolvesMissingSimplifiedGlyphs(t *testing.T) {
	coverage := &subtitleFontCoverage{fonts: map[string]*sfnt.Font{}, families: []string{"OpenCreator Rounded Bold", "OpenCreator Sans Bold"}}
	for i, file := range []string{"OpenCreatorRounded-Bold.ttf", "OpenCreatorSans-Bold.ttf"} {
		data, err := os.ReadFile(filepath.Join("../../../../assets/creator-subtitle-fonts/desktop", file))
		if err != nil {
			t.Fatal(err)
		}
		font, err := sfnt.Parse(data)
		if err != nil {
			t.Fatal(err)
		}
		coverage.fonts[coverage.families[i]] = font
	}
	if coverage.has("OpenCreator Rounded Bold", "长标") {
		t.Fatal("fixture must exercise missing glyphs")
	}
	actual := subtitleFallbackFontTags("长字幕，标点！", "OpenCreator Rounded Bold", nil, coverage)
	if !strings.Contains(actual, `{\fnOpenCreator Sans Bold}长`) || !strings.Contains(actual, `{\fnOpenCreator Sans Bold}标`) {
		t.Fatalf("missing explicit fallback: %s", actual)
	}
	if !strings.Contains(actual, `{\fnOpenCreator Rounded Bold}字幕，`) {
		t.Fatalf("available preset glyphs lost their font: %s", actual)
	}
}
