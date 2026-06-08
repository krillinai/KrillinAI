package service

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-ego/gse"
	"go.uber.org/zap"
)

var (
	chineseSegmenterOnce sync.Once
	chineseSegmenter     gse.Segmenter
	chineseSegmenterErr  error
)

const verticalChineseMaxRunesPerLine = 18

func (s Service) embedSubtitles(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	var err error
	if stepParam.EmbedSubtitleVideoType == "horizontal" || stepParam.EmbedSubtitleVideoType == "vertical" || stepParam.EmbedSubtitleVideoType == "all" {
		var width, height int
		width, height, err = getResolution(stepParam.InputVideoPath)
		if err != nil {
			log.GetLogger().Error("embedSubtitles getResolution error", zap.Any("step param", stepParam), zap.Error(err))
			return fmt.Errorf("embedSubtitles getResolution error: %w", err)
		}

		// 横屏可以合成竖屏的，但竖屏暂时不支持合成横屏的
		if stepParam.EmbedSubtitleVideoType == "horizontal" || stepParam.EmbedSubtitleVideoType == "all" {
			if width < height {
				log.GetLogger().Info("检测到输入视频是竖屏，无法合成横屏视频，跳过")
				return nil
			}
			log.GetLogger().Info("合成视频：横屏")
			err = embedSubtitles(stepParam, true, stepParam.EnableTts)
			if err != nil {
				log.GetLogger().Error("embedSubtitles embedSubtitles error", zap.Any("step param", stepParam), zap.Error(err))
				return fmt.Errorf("embedSubtitles embedSubtitles error: %w", err)
			}
		}
		if stepParam.EmbedSubtitleVideoType == "vertical" || stepParam.EmbedSubtitleVideoType == "all" {
			if width > height {
				// 生成竖屏视频
				transferredVerticalVideoPath := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskTransferredVerticalVideoFileName)
				err = convertToVertical(stepParam.InputVideoPath, transferredVerticalVideoPath, stepParam.VerticalVideoMajorTitle, stepParam.VerticalVideoMinorTitle)
				if err != nil {
					log.GetLogger().Error("embedSubtitles convertToVertical error", zap.Any("step param", stepParam), zap.Error(err))
					return fmt.Errorf("embedSubtitles convertToVertical error: %w", err)
				}
				stepParam.InputVideoPath = transferredVerticalVideoPath
			}
			log.GetLogger().Info("合成视频：竖屏")
			err = embedSubtitles(stepParam, false, stepParam.EnableTts)
			if err != nil {
				log.GetLogger().Error("embedSubtitles embedSubtitles error", zap.Any("step param", stepParam), zap.Error(err))
				return fmt.Errorf("embedSubtitles embedSubtitles error: %w", err)
			}
		}
		log.GetLogger().Info("字幕嵌入视频成功")
		return nil
	}
	log.GetLogger().Info("合成视频：不合成")
	return nil
}

func splitMajorTextInHorizontal(text string, language types.StandardLanguageCode, maxWordOneLine int) []string {
	// 按语言情况分割
	var (
		segments []string
		sep      string
	)
	if language == types.LanguageNameSimplifiedChinese || language == types.LanguageNameTraditionalChinese ||
		language == types.LanguageNameJapanese || language == types.LanguageNameKorean || language == types.LanguageNameThai {
		segments = regexp.MustCompile(`.`).FindAllString(text, -1)
		sep = ""
	} else {
		segments = strings.Split(text, " ")
		sep = " "
	}

	totalWidth := len(segments)

	// 直接返回原句子
	if totalWidth <= maxWordOneLine {
		return []string{text}
	}

	// 确定拆分点，按2/5和3/5的比例拆分
	line1MaxWidth := int(float64(totalWidth) * 2 / 5)
	currentWidth := 0
	splitIndex := 0

	for i := range segments {
		currentWidth++

		// 当达到 2/5 宽度时，设置拆分点
		if currentWidth >= line1MaxWidth {
			splitIndex = i + 1
			break
		}
	}

	// 分割文本，保留原有句子格式

	line1 := util.CleanPunction(strings.Join(segments[:splitIndex], sep))
	line2 := util.CleanPunction(strings.Join(segments[splitIndex:], sep))

	return []string{line1, line2}
}

func splitChineseText(text string, maxWordLine int) []string {
	text = util.CleanPunction(strings.TrimSpace(text))
	if text == "" {
		return nil
	}
	maxWidthPerLine := maxWordLine * 2
	if maxWordLine <= 0 || subtitleTextDisplayWidth(text) <= maxWidthPerLine {
		return []string{text}
	}
	if tokens := segmentChineseText(text); len(tokens) > 0 {
		return splitChineseTokens(tokens, maxWordLine)
	}
	return splitChineseTextByRune([]rune(text), maxWordLine)
}

func splitChineseTextByRune(runes []rune, maxWordLine int) []string {
	tokens := make([]string, 0, len(runes))
	for _, r := range runes {
		tokens = append(tokens, string(r))
	}
	return splitChineseSegmentsByDisplayWidth(tokens, maxWordLine)
}

func segmentChineseText(text string) []string {
	chineseSegmenterOnce.Do(func() {
		chineseSegmenter, chineseSegmenterErr = gse.NewEmbed("zh")
	})
	if chineseSegmenterErr != nil {
		log.GetLogger().Warn("中文分词器初始化失败，回退到字符断句", zap.Error(chineseSegmenterErr))
		return nil
	}
	return normalizeChineseTokens(chineseSegmenter.Cut(text, true))
}

func normalizeChineseTokens(tokens []string) []string {
	result := make([]string, 0, len(tokens))
	for _, token := range tokens {
		token = strings.TrimSpace(token)
		if token == "" {
			continue
		}
		result = append(result, token)
	}
	return result
}

func splitChineseTokens(tokens []string, maxWordLine int) []string {
	return splitChineseSegmentsByDisplayWidth(tokens, maxWordLine)
}

func splitChineseSegmentsByDisplayWidth(segments []string, maxWordLine int) []string {
	maxWidthPerLine := maxWordLine * 2
	totalWidth := 0
	for _, segment := range segments {
		totalWidth += subtitleTextDisplayWidth(segment)
	}
	if totalWidth <= maxWidthPerLine {
		return []string{util.CleanPunction(strings.Join(segments, ""))}
	}

	numLines := int(math.Ceil(float64(totalWidth) / float64(maxWidthPerLine)))
	if numLines < 1 {
		numLines = 1
	}
	widthPerLine := totalWidth / numLines
	if widthPerLine < 1 {
		widthPerLine = maxWidthPerLine
	}

	var lines []string
	var current strings.Builder
	currentWidth := 0

	for _, segment := range segments {
		segmentWidth := subtitleTextDisplayWidth(segment)
		if !isTrailingSubtitlePunctuation(segment) &&
			currentWidth > 0 &&
			currentWidth+segmentWidth > widthPerLine &&
			len(lines) < numLines-1 {
			lines = append(lines, util.CleanPunction(current.String()))
			current.Reset()
			currentWidth = 0
		}
		current.WriteString(segment)
		currentWidth += segmentWidth
	}

	if current.Len() > 0 {
		lines = append(lines, util.CleanPunction(current.String()))
	}
	return rebalanceShortChineseTrailingLine(lines)
}

func subtitleTextDisplayWidth(text string) int {
	width := 0
	for _, r := range text {
		if r >= '\u4e00' && r <= '\u9fff' {
			width += 2
		} else {
			width++
		}
	}
	return width
}

func isTrailingSubtitlePunctuation(segment string) bool {
	for _, r := range segment {
		if !strings.ContainsRune("，,.。！？”\"》", r) {
			return false
		}
	}
	return segment != ""
}

func rebalanceShortChineseTrailingLine(lines []string) []string {
	if len(lines) < 2 {
		return lines
	}

	last := []rune(lines[len(lines)-1])
	if len(last) == 0 || len(last) > 3 {
		return lines
	}

	prevIndex := len(lines) - 2
	prev := []rune(lines[prevIndex])
	totalLen := len(prev) + len(last)
	if totalLen < 6 {
		return lines
	}

	combined := append(append([]rune{}, prev...), last...)
	splitAt := bestChineseSplitIndex(combined, totalLen/2)
	lines[prevIndex] = string(combined[:splitAt])
	lines[len(lines)-1] = string(combined[splitAt:])
	return lines
}

func bestChineseSplitIndex(runes []rune, maxWordLine int) int {
	if len(runes) <= maxWordLine {
		return len(runes)
	}
	minSplit := maxWordLine * 3 / 5
	if minSplit < 1 {
		minSplit = 1
	}
	best := maxWordLine
	for i := maxWordLine; i >= minSplit; i-- {
		if isPreferredChineseBreak(runes, i) {
			return i
		}
	}
	for hasAwkwardChineseBreak(runes, best) && best > minSplit {
		best--
	}
	return best
}

func isPreferredChineseBreak(runes []rune, index int) bool {
	if index <= 0 || index >= len(runes) {
		return false
	}
	prev := runes[index-1]
	next := runes[index]
	if strings.ContainsRune("，。！？；：、,.!?;:", prev) {
		return true
	}
	if strings.ContainsRune("的了着过呢吗吧啊呀和与或但而就都也", prev) {
		return true
	}
	if strings.ContainsRune("，。！？；：、,.!?;:", next) {
		return false
	}
	return false
}

func hasAwkwardChineseBreak(runes []rune, index int) bool {
	if index <= 0 || index >= len(runes) {
		return false
	}
	pair := string([]rune{runes[index-1], runes[index]})
	if isProtectedChinesePair(pair) {
		return true
	}
	if index >= 2 {
		triple := string([]rune{runes[index-2], runes[index-1], runes[index]})
		if triple == "每一小" {
			return true
		}
	}
	return false
}

func isProtectedChinesePair(pair string) bool {
	switch pair {
	case "小时", "分钟", "秒钟", "今天", "明天", "自己", "人生", "目标", "规则", "注意", "未来", "屏幕":
		return true
	default:
		return false
	}
}

func parseSrtTime(timeStr string) (time.Duration, error) {
	timeStr = strings.Replace(timeStr, ",", ".", 1)
	parts := strings.Split(timeStr, ":")
	if len(parts) != 3 {
		return 0, fmt.Errorf("parseSrtTime invalid time format: %s", timeStr)
	}

	hours, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, err
	}
	minutes, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, err
	}
	secondsAndMilliseconds := strings.Split(parts[2], ".")
	if len(secondsAndMilliseconds) != 2 {
		return 0, fmt.Errorf("invalid time format: %s", timeStr)
	}
	seconds, err := strconv.Atoi(secondsAndMilliseconds[0])
	if err != nil {
		return 0, err
	}
	milliseconds, err := strconv.Atoi(secondsAndMilliseconds[1])
	if err != nil {
		return 0, err
	}

	duration := time.Duration(hours)*time.Hour +
		time.Duration(minutes)*time.Minute +
		time.Duration(seconds)*time.Second +
		time.Duration(milliseconds)*time.Millisecond

	return duration, nil
}

func formatTimestamp(t time.Duration) string {
	hours := int(t.Hours())
	minutes := int(t.Minutes()) % 60
	seconds := int(t.Seconds()) % 60
	milliseconds := int(t.Milliseconds()) % 1000 / 10
	return fmt.Sprintf("%02d:%02d:%02d.%02d", hours, minutes, seconds, milliseconds)
}

func srtToAss(inputSRT, outputASS string, isHorizontal bool, stepParam *types.SubtitleTaskStepParam) error {
	file, err := os.Open(inputSRT)
	if err != nil {
		log.GetLogger().Error("srtToAss Open input srt error", zap.Error(err))
		return fmt.Errorf("srtToAss Open input srt error: %w", err)
	}
	defer file.Close()

	assFile, err := os.Create(outputASS)
	if err != nil {
		log.GetLogger().Error("srtToAss Create output ass error", zap.Error(err))
		return fmt.Errorf("srtToAss Create output ass error: %w", err)
	}
	defer assFile.Close()
	scanner := bufio.NewScanner(file)

	if isHorizontal {
		_, _ = assFile.WriteString(types.AssHeaderHorizontal)
		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}
			// 读取时间戳行
			if !scanner.Scan() {
				break
			}
			timestampLine := scanner.Text()
			parts := strings.Split(timestampLine, " --> ")
			if len(parts) != 2 {
				continue // 无效时间戳格式
			}

			startTimeStr := strings.TrimSpace(parts[0])
			endTimeStr := strings.TrimSpace(parts[1])
			startTime, err := parseSrtTime(startTimeStr)
			if err != nil {
				log.GetLogger().Error("srtToAss parseSrtTime error", zap.Error(err))
				return fmt.Errorf("srtToAss parseSrtTime error: %w", err)
			}
			endTime, err := parseSrtTime(endTimeStr)
			if err != nil {
				log.GetLogger().Error("srtToAss parseSrtTime error", zap.Error(err))
				return fmt.Errorf("srtToAss parseSrtTime error: %w", err)
			}

			var subtitleLines []string
			for scanner.Scan() {
				textLine := scanner.Text()
				if textLine == "" {
					break // 字幕块结束
				}
				subtitleLines = append(subtitleLines, textLine)
			}

			if len(subtitleLines) == 0 {
				continue
			}
			//var majorTextLanguage types.StandardLanguageCode
			//if stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnTop { // 一定是bilingual
			//	majorTextLanguage = stepParam.TargetLanguage
			//} else {
			//	majorTextLanguage = stepParam.OriginLanguage
			//}

			//majorLine := strings.Join(splitMajorTextInHorizontal(subtitleLines[0], majorTextLanguage, stepParam.MaxWordOneLine), "      \\N")

			// ASS条目
			startFormatted := formatTimestamp(startTime)
			endFormatted := formatTimestamp(endTime)
			if len(subtitleLines) == 1 {
				combinedText := fmt.Sprintf("{\\an2}{\\rMajor}%s", util.CleanPunction(subtitleLines[0]))
				_, _ = assFile.WriteString(fmt.Sprintf("Dialogue: 0,%s,%s,Major,,0,0,0,,%s\n", startFormatted, endFormatted, combinedText))
				continue
			}
			combinedText := fmt.Sprintf("{\\an2}{\\rMajor}%s\\N{\\rMinor}%s", subtitleLines[0], util.CleanPunction(subtitleLines[1]))
			_, _ = assFile.WriteString(fmt.Sprintf("Dialogue: 0,%s,%s,Major,,0,0,0,,%s\n", startFormatted, endFormatted, combinedText))
		}
	} else {
		// TODO 竖屏拆分调优
		_, _ = assFile.WriteString(types.AssHeaderVertical)
		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}
			if !scanner.Scan() {
				break
			}
			timestampLine := scanner.Text()
			parts := strings.Split(timestampLine, " --> ")
			if len(parts) != 2 {
				continue // 无效时间戳格式
			}

			startTimeStr := strings.TrimSpace(parts[0])
			endTimeStr := strings.TrimSpace(parts[1])
			startTime, err := parseSrtTime(startTimeStr)
			if err != nil {
				return err
			}
			endTime, err := parseSrtTime(endTimeStr)
			if err != nil {
				return err
			}

			var content string
			scanner.Scan()
			content = scanner.Text()
			if content == "" {
				continue
			}

			if !util.ContainsAlphabetic(content) {
				// 处理中文字幕
				chineseLines := splitChineseText(content, verticalChineseMaxRunesPerLine)
				totalTime := endTime - startTime
				for i, line := range chineseLines {
					iStart := startTime + time.Duration(float64(i)*float64(totalTime)/float64(len(chineseLines)))
					iEnd := startTime + time.Duration(float64(i+1)*float64(totalTime)/float64(len(chineseLines)))
					if iEnd > endTime {
						iEnd = endTime
					}
					startFormatted := formatTimestamp(iStart)
					endFormatted := formatTimestamp(iEnd)
					combinedText := fmt.Sprintf("{\\an2}{\\rMajor}%s", line)
					_, _ = assFile.WriteString(fmt.Sprintf("Dialogue: 0,%s,%s,Major,,0,0,0,,%s\n", startFormatted, endFormatted, combinedText))
				}
			} else {
				// 处理英文字幕
				startFormatted := formatTimestamp(startTime)
				endFormatted := formatTimestamp(endTime)
				cleanedText := util.CleanPunction(content)
				combinedText := fmt.Sprintf("{\\an2}{\\rMinor}%s", cleanedText)
				_, _ = assFile.WriteString(fmt.Sprintf("Dialogue: 0,%s,%s,Minor,,0,0,0,,%s\n", startFormatted, endFormatted, combinedText))
			}
		}
	}
	return nil
}

func embedSubtitles(stepParam *types.SubtitleTaskStepParam, isHorizontal bool, withTts bool) error {
	outputFileName := types.SubtitleTaskVerticalEmbedVideoFileName
	if isHorizontal {
		outputFileName = types.SubtitleTaskHorizontalEmbedVideoFileName
	}
	input := stepParam.InputVideoPath
	if withTts {
		input = stepParam.VideoWithTtsFilePath
	}

	_, err := renderSubtitleFile(context.Background(), RenderVideoRequest{
		Workdir:      stepParam.TaskBasePath,
		InputVideo:   input,
		SubtitleFile: stepParam.BilingualSrtFilePath,
		OutputFile:   filepath.Join(stepParam.TaskBasePath, "output", outputFileName),
		Horizontal:   isHorizontal,
		StepParam:    stepParam,
	})
	return err
}

func getFontPaths() (string, string, error) {
	return fontPathsForOS(runtime.GOOS, pathExists)
}

func fontPathsForOS(goos string, exists func(string) bool) (string, string, error) {
	if exists == nil {
		exists = pathExists
	}
	candidates, err := fontCandidatesForOS(goos)
	if err != nil {
		return "", "", err
	}
	return chooseFontPair(candidates, exists)
}

type fontPair struct {
	bold    string
	regular string
}

func fontCandidatesForOS(goos string) ([]fontPair, error) {
	switch goos {
	case "windows":
		return []fontPair{
			{bold: "C\\:/Windows/Fonts/msyhbd.ttc", regular: "C\\:/Windows/Fonts/msyh.ttc"},
			{bold: "C\\:/Windows/Fonts/simhei.ttf", regular: "C\\:/Windows/Fonts/msyh.ttc"},
			{bold: "C\\:/Windows/Fonts/simsun.ttc", regular: "C\\:/Windows/Fonts/simsun.ttc"},
		}, nil
	case "darwin":
		return []fontPair{
			{bold: "/System/Library/Fonts/Hiragino Sans GB.ttc", regular: "/System/Library/Fonts/Hiragino Sans GB.ttc"},
			{bold: "/System/Library/Fonts/Supplemental/Arial Unicode.ttf", regular: "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"},
			{bold: "/System/Library/Fonts/STHeiti Medium.ttc", regular: "/System/Library/Fonts/STHeiti Light.ttc"},
			{bold: "/System/Library/Fonts/Supplemental/Songti.ttc", regular: "/System/Library/Fonts/Supplemental/Songti.ttc"},
		}, nil
	case "linux":
		return []fontPair{
			{bold: "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", regular: "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"},
			{bold: "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc", regular: "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"},
			{bold: "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", regular: "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"},
			{bold: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", regular: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"},
		}, nil
	default:
		return nil, fmt.Errorf("unsupported OS: %s", goos)
	}
}

func chooseFontPair(candidates []fontPair, exists func(string) bool) (string, string, error) {
	for _, candidate := range candidates {
		if exists(candidate.bold) && exists(candidate.regular) {
			return candidate.bold, candidate.regular, nil
		}
	}
	if len(candidates) == 0 {
		return "", "", errors.New("no font candidates configured")
	}
	// Fall back to the first candidate so containerized builds can still run when
	// font discovery is unavailable, while normal hosts use existing fonts.
	return candidates[0].bold, candidates[0].regular, nil
}

func pathExists(path string) bool {
	normalized := strings.ReplaceAll(path, `C\:/`, `C:/`)
	_, err := os.Stat(normalized)
	return err == nil
}

func getResolution(inputVideo string) (int, int, error) {
	// 获取视频信息
	cmdArgs := []string{
		"-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=width,height",
		"-of", "csv=s=x:p=0",
		inputVideo,
	}
	cmd := exec.Command(storage.FfprobePath, cmdArgs...)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out

	if err := cmd.Run(); err != nil {
		log.GetLogger().Error("获取视频分辨率失败", zap.String("output", out.String()), zap.Error(err))
		return 0, 0, err
	}

	output := strings.TrimSpace(out.String())
	output = strings.TrimSuffix(output, "x") // 去除尾部可能存在的x,例如1920x1080x

	re := regexp.MustCompile(`^(\d+)x(\d+)$`)
	dimensions := re.FindStringSubmatch(output)
	if len(dimensions) != 3 {
		log.GetLogger().Error("获取视频分辨率失败", zap.String("output", output))
		return 0, 0, fmt.Errorf("invalid resolution format: %s", output)
	}

	width, _ := strconv.Atoi(dimensions[1])
	height, _ := strconv.Atoi(dimensions[2])
	return width, height, nil
}

func convertToVertical(inputVideo, outputVideo, majorTitle, minorTitle string) error {
	if _, err := os.Stat(outputVideo); err == nil {
		log.GetLogger().Info("竖屏视频已存在", zap.String("outputVideo", outputVideo))
		return nil
	}

	fontBold, fontRegular, err := getFontPaths()
	if err != nil {
		log.GetLogger().Error("获取字体路径失败", zap.Error(err))
		return err
	}

	cmdArgs := []string{
		"-i", inputVideo,
		"-vf", buildVerticalFilter(majorTitle, minorTitle, fontBold, fontRegular),
		"-r", "30",
		"-b:v", "7587k",
		"-c:a", "aac",
		"-b:a", "192k",
		"-c:v", "libx264",
		"-preset", "fast",
		"-y",
		outputVideo,
	}
	cmd := exec.Command(storage.FfmpegPath, cmdArgs...)
	var output []byte
	output, err = cmd.CombinedOutput()
	if err != nil {
		log.GetLogger().Error("视频转竖屏失败", zap.String("output", string(output)), zap.Error(err))
		return err
	}

	fmt.Printf("竖屏视频已保存到: %s\n", outputVideo)
	return nil
}

func buildVerticalFilter(majorTitle, minorTitle, fontBold, fontRegular string) string {
	return fmt.Sprintf(
		"scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:250,drawbox=y=0:h=250:c=black@1:t=fill,drawtext=text='%s':x=(w-text_w)/2:y=120:fontsize=44:fontcolor=yellow:box=0:fontfile='%s',drawtext=text='%s':x=(w-text_w)/2:y=178:fontsize=30:fontcolor=yellow:box=0:fontfile='%s'",
		escapeDrawtextText(majorTitle),
		escapeFilterPath(fontBold),
		escapeDrawtextText(minorTitle),
		escapeFilterPath(fontRegular),
	)
}

func escapeDrawtextText(text string) string {
	replacer := strings.NewReplacer(
		`\\`, `\\\\`,
		`'`, `\\'`,
		`:`, `\:`,
		`,`, `\,`,
		`[`, `\[`,
		`]`, `\]`,
	)
	return replacer.Replace(text)
}

func escapeFilterPath(path string) string {
	return strings.ReplaceAll(path, ":", `\:`)
}
