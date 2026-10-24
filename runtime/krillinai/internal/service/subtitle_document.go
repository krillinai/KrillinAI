package service

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
	"unicode"

	"github.com/clipperhouse/uax29/v2/graphemes"

	subtitlestyle "krillin-ai/internal/subtitle_style"
	"krillin-ai/internal/types"
)

// SubtitleDocument is the renderer input shared by the editor and video export.
// Text fields are language roles, not physical lines of an SRT block.
type SubtitleDocument struct {
	Width            int                   `json:"width"`
	Height           int                   `json:"height"`
	Horizontal       bool                  `json:"horizontal"`
	Bilingual        bool                  `json:"bilingual"`
	SubtitlePosition string                `json:"subtitlePosition"`
	MajorTitle       string                `json:"majorTitle,omitempty"`
	MinorTitle       string                `json:"minorTitle,omitempty"`
	Cues             []SubtitleDocumentCue `json:"cues"`
}

type SubtitleDocumentCue struct {
	StartMS    int64  `json:"startMs"`
	EndMS      int64  `json:"endMs"`
	Text       string `json:"text"`
	SourceText string `json:"sourceText,omitempty"`
}

func CompileSubtitleDocumentFile(input, output string, style *subtitlestyle.StyleSet) error {
	data, err := os.ReadFile(input)
	if err != nil {
		return err
	}
	var doc SubtitleDocument
	if err := json.Unmarshal(data, &doc); err != nil {
		return err
	}
	ass, err := CompileSubtitleDocument(doc, style)
	if err != nil {
		return err
	}
	return os.WriteFile(output, []byte(ass), 0600)
}

func CompileSubtitleDocument(doc SubtitleDocument, style *subtitlestyle.StyleSet) (string, error) {
	if doc.Width < 1 || doc.Height < 1 || doc.Width > 16384 || doc.Height > 16384 {
		return "", fmt.Errorf("invalid subtitle canvas")
	}
	if style == nil {
		style = subtitlestyle.DefaultStyleSet()
	}
	if err := subtitlestyle.Validate(style); err != nil {
		return "", err
	}
	if err := validatePackagedSubtitleFonts(style); err != nil {
		return "", err
	}
	coverage, err := readSubtitleFontCoverage()
	if err != nil {
		return "", err
	}
	screen := style.Vertical
	if doc.Horizontal {
		screen = style.Horizontal
	}
	step := &types.SubtitleTaskStepParam{RenderWidth: doc.Width, RenderHeight: doc.Height}
	fallbacks := packagedSubtitleFallbacks()
	var result strings.Builder
	result.WriteString(subtitlestyle.BuildAssHeader(style, doc.Horizontal))
	// Disable legacy colour-space mangling on both native and WASM renderers.
	header := strings.Replace(result.String(), "ScriptType: v4.00+\n", "ScriptType: v4.00+\nYCbCr Matrix: None\n", 1)
	result.Reset()
	result.WriteString(header)
	layered := subtitlestyle.NeedsShadowLayer(screen.Major) || (doc.Bilingual && subtitlestyle.NeedsShadowLayer(screen.Minor))
	text := func(value string, st subtitlestyle.Style, name string, shadow bool) string {
		var lines []string
		for _, line := range strings.Split(strings.ReplaceAll(value, "\r\n", "\n"), "\n") {
			wrapped := wrapDocumentLine(line, st, step, false)
			for _, part := range wrapped {
				lines = append(lines, escapeSubtitleText(part))
			}
		}
		tags := subtitlestyle.DialogueTags(st)
		if layered {
			tags = subtitlestyle.DialogueLayerTags(st, shadow)
		}
		return fmt.Sprintf("{\\r%s}{\\an%d}%s%s", name, subtitlestyle.Alignment(st), tags, subtitleFallbackFontTags(strings.Join(lines, `\N`), st.FontName, fallbacks, coverage))
	}
	emit := func(cue SubtitleDocumentCue) {
		passes := 1
		if layered {
			passes = 2
		}
		for layer := 0; layer < passes; layer++ {
			shadow := layered && layer == 0
			content := text(cue.Text, screen.Major, "Major", shadow)
			if doc.Bilingual && cue.SourceText != "" {
				original := text(cue.SourceText, screen.Minor, "Minor", shadow)
				if doc.SubtitlePosition == "bottom" {
					content = original + `\N` + content
				} else {
					content += `\N` + original
				}
			}
			fmt.Fprintf(&result, "Dialogue: %d,%s,%s,Major,,0,0,0,,%s\n", layer, formatTimestamp(time.Duration(cue.StartMS)*time.Millisecond), formatTimestamp(time.Duration(cue.EndMS)*time.Millisecond), content)
		}
	}
	for _, cue := range doc.Cues {
		if cue.StartMS < 0 || cue.EndMS <= cue.StartMS {
			return "", fmt.Errorf("invalid subtitle timeline")
		}
		if !doc.Horizontal && !doc.Bilingual && containsChinese(cue.Text) && !strings.Contains(cue.Text, "\n") {
			parts := wrapDocumentLine(cue.Text, screen.Major, step, true)
			for i, part := range parts {
				duration := cue.EndMS - cue.StartMS
				emit(SubtitleDocumentCue{StartMS: cue.StartMS + int64(i)*duration/int64(len(parts)), EndMS: cue.StartMS + int64(i+1)*duration/int64(len(parts)), Text: part})
			}
		} else {
			emit(cue)
		}
	}

	// Title coordinates reproduce the existing 720x1280 composition, expressed
	// in the legacy ASS script coordinates. Titles and subtitles share libass.
	for i, title := range []string{doc.MajorTitle, doc.MinorTitle} {
		if title == "" {
			continue
		}
		font := "OpenCreator Sans Bold"
		size, y := 44.0, 120.0
		if i == 1 {
			font = "OpenCreator Sans Regular"
			size, y = 30, 178
		}
		// Position coordinates scale along their respective script axes.
		x := 192.0
		end := int64(24 * 60 * 60 * 1000)
		content := subtitleFallbackFontTags(escapeSubtitleText(title), font, fallbacks, coverage)
		titleLayer := 1
		if layered {
			titleLayer = 2
		}
		fmt.Fprintf(&result, "Dialogue: %d,0:00:00.00,%s,Major,,0,0,0,,{\\rMajor\\an8\\pos(%.4f,%.4f)\\fs%.4f\\fn%s\\c&H00FFFF&\\bord0\\shad0\\b%d}%s\n", titleLayer, formatTimestamp(time.Duration(end)*time.Millisecond), x, y/1280*288, size/1280*288, font, 1-i, content)
	}
	return result.String(), nil
}

// Keep every source character, including punctuation and whitespace. The
// legacy helpers trim punctuation and therefore cannot serialize edited text.
func wrapDocumentLine(value string, style subtitlestyle.Style, step *types.SubtitleTaskStepParam, vertical bool) []string {
	config := newSubtitleWrapConfig(style, step)
	if vertical && config.fontSize*verticalChineseMaxRunesPerLine < config.maxLineWidth {
		config.maxLineWidth = config.fontSize * verticalChineseMaxRunesPerLine
	}
	needsWrap := containsChinese(value)
	for _, r := range value {
		if unicode.IsLetter(r) && !unicode.In(r, unicode.Latin, unicode.Greek, unicode.Cyrillic) {
			needsWrap = true
			break
		}
	}
	if !needsWrap || estimateSubtitleTextWidth(value, config) <= config.maxLineWidth {
		return []string{value}
	}
	if !containsChinese(value) {
		// Keep the existing Unicode word-boundary splitter. Reattach its trimmed
		// whitespace from the original text so editing never drops characters.
		parts, err := splitSubtitleText(value, func(part string) bool { return estimateSubtitleTextWidth(part, config) <= config.maxLineWidth })
		if err != nil || len(parts) == 0 {
			return []string{value}
		}
		cursor := 0
		for i, part := range parts {
			index := strings.Index(value[cursor:], part)
			if index < 0 {
				return []string{value}
			}
			end := cursor + index + len(part)
			parts[i] = value[cursor:end]
			cursor = end
		}
		parts[len(parts)-1] += value[cursor:]
		return parts
	}
	var tokens []string
	if containsChinese(value) {
		cursor := 0
		for _, token := range segmentChineseText(value) {
			index := strings.Index(value[cursor:], token)
			if index < 0 {
				tokens = nil
				break
			}
			end := cursor + index + len(token)
			tokens = append(tokens, value[cursor:end])
			cursor = end
		}
		if len(tokens) > 0 && cursor < len(value) {
			tokens = append(tokens, value[cursor:])
		}
	}
	if len(tokens) == 0 {
		iter := graphemes.FromString(value)
		for iter.Next() {
			tokens = append(tokens, iter.Value())
		}
	}
	var lines []string
	var current strings.Builder
	for _, token := range tokens {
		if current.Len() > 0 && estimateSubtitleTextWidth(current.String()+token, config) > config.maxLineWidth && !isTrailingSubtitlePunctuation(strings.TrimSpace(token)) {
			lines = append(lines, current.String())
			current.Reset()
		}
		current.WriteString(token)
	}
	if current.Len() > 0 {
		lines = append(lines, current.String())
	}
	return lines
}

func escapeSubtitleText(value string) string {
	// libass supports escaped braces; a WORD JOINER prevents a literal
	// backslash followed by N/n/h from becoming an ASS escape.
	value = strings.ReplaceAll(value, `\`, "\\\u2060")
	value = strings.ReplaceAll(value, "{", `\{`)
	value = strings.ReplaceAll(value, "}", `\}`)
	value = strings.ReplaceAll(value, "\r", "")
	value = strings.ReplaceAll(value, "\x00", "")
	return strings.ReplaceAll(value, "\n", `\N`)
}

func subtitleDocumentFromSRT(input string, horizontal bool, step *types.SubtitleTaskStepParam) (SubtitleDocument, error) {
	file, err := os.Open(input)
	if err != nil {
		return SubtitleDocument{}, err
	}
	defer file.Close()
	doc := SubtitleDocument{Width: 384, Height: 288, Horizontal: horizontal, SubtitlePosition: "top"}
	if step != nil {
		if step.RenderWidth > 0 && step.RenderHeight > 0 {
			doc.Width, doc.Height = step.RenderWidth, step.RenderHeight
		}
		if step.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnBottom {
			doc.SubtitlePosition = "bottom"
		}
		if !horizontal {
			doc.MajorTitle, doc.MinorTitle = step.VerticalVideoMajorTitle, step.VerticalVideoMinorTitle
		}
	}
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 4096), 16*1024*1024)
	var block []string
	flush := func() error {
		if len(block) == 0 {
			return nil
		}
		defer func() { block = nil }()
		if len(block) < 3 {
			return fmt.Errorf("invalid subtitle block")
		}
		parts := strings.Split(block[1], " --> ")
		if len(parts) != 2 {
			return fmt.Errorf("invalid subtitle timestamp")
		}
		start, err := parseSrtTime(strings.TrimSpace(parts[0]))
		if err != nil {
			return err
		}
		end, err := parseSrtTime(strings.TrimSpace(parts[1]))
		if err != nil {
			return err
		}
		cue := SubtitleDocumentCue{StartMS: start.Milliseconds(), EndMS: end.Milliseconds()}
		lines := block[2:]
		bilingual := len(lines) > 1 && (step == nil || step.RenderLineMode != "target-only")
		if bilingual {
			doc.Bilingual = true
			if doc.SubtitlePosition == "bottom" {
				cue.SourceText = lines[0]
				cue.Text = strings.Join(lines[1:], "\n")
			} else {
				cue.Text = lines[0]
				cue.SourceText = strings.Join(lines[1:], "\n")
			}
		} else {
			cue.Text = strings.Join(lines, "\n")
		}
		doc.Cues = append(doc.Cues, cue)
		return nil
	}
	for scanner.Scan() {
		line := strings.TrimSuffix(scanner.Text(), "\r")
		if strings.TrimSpace(line) == "" {
			if err := flush(); err != nil {
				return doc, err
			}
		} else {
			block = append(block, line)
		}
	}
	if err := scanner.Err(); err != nil {
		return doc, err
	}
	return doc, flush()
}
