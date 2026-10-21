package service

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"golang.org/x/image/font/sfnt"
)

// Native font providers can silently use system fonts. Resolve missing glyphs
// explicitly so native libass and the isolated browser worker use the same TTF.
type subtitleFontCoverage struct {
	fonts    map[string]*sfnt.Font
	families []string
}

func readSubtitleFontCoverage() (*subtitleFontCoverage, error) {
	root := strings.TrimSpace(os.Getenv("KRILLINAI_RESOURCE_ROOT"))
	coverage := &subtitleFontCoverage{fonts: map[string]*sfnt.Font{}}
	if root == "" {
		return coverage, nil
	}
	data, err := os.ReadFile(filepath.Join(root, "fonts", "manifest.json"))
	if err != nil {
		return nil, err
	}
	var manifest subtitleFontManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, err
	}
	for _, entry := range append(manifest.Fonts, manifest.FallbackFonts...) {
		data, err := os.ReadFile(filepath.Join(root, "fonts", filepath.Base(entry.File)))
		if err != nil {
			return nil, err
		}
		font, err := sfnt.Parse(data)
		if err != nil {
			return nil, fmt.Errorf("invalid subtitle font %s: %w", entry.Family, err)
		}
		coverage.fonts[entry.Family] = font
		coverage.families = append(coverage.families, entry.Family)
	}
	return coverage, nil
}

func (c *subtitleFontCoverage) has(family, cluster string) bool {
	font := c.fonts[family]
	if font == nil {
		return true
	} // Standalone CLI keeps its legacy font provider.
	var buffer sfnt.Buffer
	for _, r := range cluster {
		if unicode.IsSpace(r) || unicode.IsControl(r) || unicode.In(r, unicode.Cf) || r == '\ufe0f' || r == '\ufe0e' {
			continue
		}
		index, err := font.GlyphIndex(&buffer, r)
		if err != nil || index == 0 {
			return false
		}
	}
	return true
}

func (c *subtitleFontCoverage) choose(cluster, chosen, primary string) string {
	if c == nil || c.has(chosen, cluster) {
		return chosen
	}
	weight := "Regular"
	for _, candidate := range []string{"Bold", "Medium"} {
		if strings.HasSuffix(primary, candidate) {
			weight = candidate
		}
	}
	preferred := "OpenCreator Sans " + weight
	if c.fonts[preferred] != nil && c.has(preferred, cluster) {
		return preferred
	}
	for _, family := range c.families {
		if c.has(family, cluster) {
			return family
		}
	}
	return chosen
}
