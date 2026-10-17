package service

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	subtitlestyle "krillin-ai/internal/subtitle_style"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestSubtitleFallbackFontTagsPreserveLogicalTextAndASSBreaks(t *testing.T) {
	families := map[string]string{"Arab": "Noto Sans Arabic", "Deva": "Noto Sans Devanagari", "Latn": "Noto Sans"}
	for _, text := range []string{`العربية 123 OpenCreator\Nالعربية`, `हिन्दी क्षि\Nहिन्दी`, "Tiếng Việt"} {
		tagged := subtitleFallbackFontTags(text, "Primary", families)
		plain := regexp.MustCompile(`\{[^}]*\}`).ReplaceAllString(tagged, "")
		if plain != text {
			t.Fatalf("text/ASS control changed: %q", tagged)
		}
		if strings.Contains(tagged, `\{`) {
			t.Fatalf("font tag split ASS escape: %q", tagged)
		}
	}
}

func TestExtendedSourceSubtitleFallbackFontsPreserveText(t *testing.T) {
	for _, test := range []struct{ script, family, text string }{
		{"Ethi", "Noto Sans Ethiopic", "አማርኛ"},
		{"Java", "Noto Sans Javanese", "ꦧꦱꦗꦮ"},
		{"Mlym", "Noto Sans Malayalam", "മലയാളം"},
		{"Knda", "Noto Sans Kannada", "ಕನ್ನಡ"},
		{"Orya", "Noto Sans Oriya", "ଓଡ଼ିଆ"},
		{"Geor", "Noto Sans Georgian", "ქართული"},
		{"Armn", "Noto Sans Armenian", "Հայերեն"},
		{"Sinh", "Noto Sans Sinhala", "සිංහල"},
		{"Tibt", "Noto Serif Tibetan", "བོད་སྐད་"},
	} {
		t.Run(test.script, func(t *testing.T) {
			text := test.text + `\NEnglish 123`
			tagged := subtitleFallbackFontTags(text, "Primary", map[string]string{test.script: test.family})
			if !strings.HasPrefix(tagged, `{\fn`+test.family+`}`) || !strings.Contains(tagged, `{\fnPrimary}English`) {
				t.Fatalf("incorrect fallback: %q", tagged)
			}
			if regexp.MustCompile(`\{[^}]*\}`).ReplaceAllString(tagged, "") != text {
				t.Fatalf("source text changed: %q", tagged)
			}
		})
	}
}

func TestPackagedFontManifestV1AndV2Compatibility(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "fonts")
	os.MkdirAll(dir, 0755)
	content := []byte("font-fixture")
	hash := fmt.Sprintf("%x", sha256.Sum256(content))
	os.WriteFile(filepath.Join(dir, "primary.ttf"), content, 0644)
	os.WriteFile(filepath.Join(dir, "fallback.ttf"), content, 0644)
	t.Setenv("KRILLINAI_RESOURCE_ROOT", root)
	style := subtitlestyle.DefaultStyleSet()
	style.Horizontal.Major.FontName = "Primary"
	style.Horizontal.Minor.FontName = "Primary"
	style.Vertical.Major.FontName = "Primary"
	style.Vertical.Minor.FontName = "Primary"
	for _, version := range []int{1, 2} {
		manifest := subtitleFontManifest{Version: version, Fonts: []subtitleFontEntry{{Family: "Primary", File: "fonts/primary.ttf", SHA256: hash}}}
		if version == 2 {
			manifest.FallbackFonts = []subtitleFontEntry{{Family: "Fallback", File: "fonts/fallback.ttf", SHA256: hash, Scripts: []string{"Arab"}}}
		}
		data, _ := json.Marshal(manifest)
		os.WriteFile(filepath.Join(dir, "manifest.json"), data, 0644)
		if err := validatePackagedSubtitleFonts(style); err != nil {
			t.Fatal(err)
		}
		if version == 2 {
			os.Remove(filepath.Join(dir, "fallback.ttf"))
			if err := validatePackagedSubtitleFonts(style); err == nil {
				t.Fatal("missing fallback font accepted")
			}
		}
	}
}
