package util

import (
	"bufio"
	"fmt"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// 处理每一个字幕块
func ProcessBlock(block []string, targetLanguageFile, targetLanguageTextFile, originLanguageFile, originLanguageTextFile *os.File, isTargetOnTop bool) {
	var targetLines, originLines []string
	// 匹配时间戳的正则表达式
	timePattern := regexp.MustCompile(`\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}`)
	for _, line := range block {
		if timePattern.MatchString(line) || IsNumber(line) {
			// 时间戳和编号行保留在两个文件中
			targetLines = append(targetLines, line)
			originLines = append(originLines, line)
			continue
		}
		if len(targetLines) == 2 && len(originLines) == 2 { // 刚写完编号和时间戳，到了上方的文字行
			if isTargetOnTop {
				targetLines = append(targetLines, line)
				targetLanguageTextFile.WriteString(line) // 文稿文件
			} else {
				originLines = append(originLines, line)
				originLanguageTextFile.WriteString(line)
			}
			continue
		}
		// 到了下方的文字行
		if isTargetOnTop {
			originLines = append(originLines, line)
			originLanguageTextFile.WriteString(line)
		} else {
			targetLines = append(targetLines, line)
			targetLanguageTextFile.WriteString(line)
		}
	}

	if len(targetLines) > 2 {
		// 写入目标语言文件
		for _, line := range targetLines {
			targetLanguageFile.WriteString(line + "\n")
		}
		targetLanguageFile.WriteString("\n")
	}

	if len(originLines) > 2 {
		// 写入源语言文件
		for _, line := range originLines {
			originLanguageFile.WriteString(line + "\n")
		}
		originLanguageFile.WriteString("\n")
	}
}

// IsSubtitleText 是否是字幕文件中的字幕文字行
func IsSubtitleText(line string) bool {
	if line == "" {
		return false
	}
	if IsNumber(line) {
		return false
	}
	timelinePattern := regexp.MustCompile(`\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}`)
	return !timelinePattern.MatchString(line)
}

type Format struct {
	Duration string `json:"duration"`
}

type ProbeData struct {
	Format Format `json:"format"`
}

type SrtBlock struct {
	Index                  int
	Timestamp              string
	TargetLanguageSentence string
	OriginLanguageSentence string
}

func TrimString(s string) string {
	s = strings.Replace(s, "[中文翻译]", "", -1)
	s = strings.Replace(s, "[英文句子]", "", -1)
	// 去除开头的空格和 '['
	s = strings.TrimLeft(s, " [")

	// 去除结尾的空格和 ']'
	s = strings.TrimRight(s, " ]")

	//替换中文单引号
	s = strings.ReplaceAll(s, "’", "'")

	return s
}

func SplitSentence(sentence string) []string {
	// 使用正则表达式移除标点符号和特殊字符（保留各语言字母、数字和空格）
	re := regexp.MustCompile(`[^\p{L}\p{N}\s']+`)
	cleanedSentence := re.ReplaceAllString(sentence, " ")

	// 使用 strings.Fields 按空格拆分成单词
	words := strings.Fields(cleanedSentence)

	return words
}

func MergeFile(finalFile string, files ...string) error {
	// 创建最终文件
	final, err := os.Create(finalFile)
	if err != nil {
		return err
	}

	// 逐个读取文件并写入最终文件
	for _, file := range files {
		f, err := os.Open(file)
		if err != nil {
			return err
		}
		defer f.Close()

		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := scanner.Text()
			final.WriteString(line + "\n")
		}
	}

	return nil
}

func MergeSrtFiles(finalFile string, files ...string) error {
	output, err := os.Create(finalFile)
	if err != nil {
		return err
	}
	defer output.Close()
	writer := bufio.NewWriter(output)
	lineNumber := 0
	for _, file := range files {
		// 不存在某一个file就跳过
		if _, err = os.Stat(file); os.IsNotExist(err) {
			continue
		}
		// 打开当前字幕文件
		f, err := os.Open(file)
		if err != nil {
			return err
		}
		defer f.Close()
		// 处理当前字幕文件
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := scanner.Text()

			if strings.Contains(line, "```") {
				continue
			}

			if IsNumber(line) {
				lineNumber++
				line = strconv.Itoa(lineNumber)
			}

			writer.WriteString(line + "\n")
		}
	}
	writer.Flush()

	return nil
}

// 给定文件和替换map，将文件中所有的key替换成value
func ReplaceFileContent(srcFile, dstFile string, replacements map[string]string) error {
	file, err := os.Open(srcFile)
	if err != nil {
		return err
	}
	defer file.Close()

	outFile, err := os.Create(dstFile)
	if err != nil {
		return err
	}
	defer outFile.Close()

	scanner := bufio.NewScanner(file)
	writer := bufio.NewWriter(outFile) // 提高性能
	defer writer.Flush()

	for scanner.Scan() {
		line := scanner.Text()
		for before, after := range replacements {
			line = strings.ReplaceAll(line, before, after)
		}
		_, _ = writer.WriteString(line + "\n")
	}

	if err = scanner.Err(); err != nil {
		return err
	}

	return nil
}

// 获得文件名后加上后缀的新文件名，不改变扩展名，例如：/home/ubuntu/abc.srt变成/home/ubuntu/abc_tmp.srt
func AddSuffixToFileName(filePath, suffix string) string {
	dir := filepath.Dir(filePath)
	ext := filepath.Ext(filePath)
	name := strings.TrimSuffix(filepath.Base(filePath), ext)
	newName := fmt.Sprintf("%s%s%s", name, suffix, ext)
	return filepath.Join(dir, newName)
}

// 去除字符串中的标点符号等字符，确保字符中的内容都是whisper模型可以识别出来的，便于时间戳对齐
func GetRecognizableString(s string) string {
	var result []rune
	for _, v := range s {
		// 英文字母和数字
		if unicode.Is(unicode.Latin, v) || unicode.Is(unicode.Number, v) {
			result = append(result, v)
		}
		// 中文
		if unicode.Is(unicode.Han, v) {
			result = append(result, v)
		}
		// 韩文
		if unicode.Is(unicode.Hangul, v) {
			result = append(result, v)
		}
		// 日文平假片假
		if unicode.Is(unicode.Hiragana, v) || unicode.Is(unicode.Katakana, v) {
			result = append(result, v)
		}
	}
	return string(result)
}

func GetAudioDuration(inputFile string) (float64, error) {
	// 使用 ffprobe 获取精确时长
	cmd := exec.Command(storage.FfprobePath, "-i", inputFile, "-show_entries", "format=duration", "-v", "quiet", "-of", "csv=p=0")
	cmdOutput, err := cmd.Output()
	if err != nil {
		return 0, fmt.Errorf("GetAudioDuration failed to get audio duration: %w", err)
	}

	// 解析时长
	duration, err := strconv.ParseFloat(strings.TrimSpace(string(cmdOutput)), 64)
	if err != nil {
		return 0, fmt.Errorf("GetAudioDuration failed to parse audio duration: %w", err)
	}

	return duration, nil
}

// todo 后续再补充
func IsAsianLanguage(code types.StandardLanguageCode) bool {
	return code == types.LanguageNameSimplifiedChinese || code == types.LanguageNameTraditionalChinese || code == types.LanguageNameJapanese || code == types.LanguageNameKorean || code == types.LanguageNameThai
}

func BeautifyAsianLanguageSentence(input string) string {
	if len(input) == 0 {
		return input
	}

	// 不处理的
	pairPunctuations := map[rune]rune{
		'「': '」', '『': '』', '“': '”', '‘': '’',
		'《': '》', '<': '>', '【': '】', '〔': '〕',
		'(': ')', '[': ']', '{': '}',
	}

	// 需要处理的单标点
	singlePunctuations := ",.;:!?~，、。！？；：…"

	// 先处理字符串末尾的标点
	runes := []rune(input)
	i := len(runes) - 1
	for i >= 0 {
		r := runes[i]
		// 如果是空格，继续检查前一个字符
		if unicode.IsSpace(r) {
			i--
			continue
		}
		// 如果是单标点，去除
		if strings.ContainsRune(singlePunctuations, r) {
			runes = runes[:i]
			i--
		} else {
			// 遇到非标点或成对标点，停止
			break
		}
	}

	// 中间的单标点替换为空格
	var inPair bool
	var expectedClose rune
	var result []rune

	for i := 0; i < len(runes); i++ {
		r := runes[i]

		// 检查是否在成对标点内
		if inPair {
			if r == expectedClose {
				inPair = false
			}
			result = append(result, r)
			continue
		}

		// 检查是否是成对标点的开始
		if close, isPair := pairPunctuations[r]; isPair {
			inPair = true
			expectedClose = close
			result = append(result, r)
			continue
		}

		// 检查是否是数字中的小数点
		if r == '.' && i > 0 && i < len(runes)-1 {
			prev := runes[i-1]
			next := runes[i+1]
			if unicode.IsDigit(prev) && unicode.IsDigit(next) {
				result = append(result, r)
				continue
			}
		}

		// 处理单标点
		if strings.ContainsRune(singlePunctuations, r) {
			// 替换为空格，但避免连续空格
			if len(result) > 0 && !unicode.IsSpace(result[len(result)-1]) {
				result = append(result, ' ')
			}
		} else {
			result = append(result, r)
		}
	}

	return strings.TrimSpace(string(result))
}

// SplitTextSentences 将文本按常见的半全角分隔符号切分成句子，会考虑一些特殊的不用切分的情况
func SplitTextSentences(text string) []string {
	const (
		dotPlaceholder   = "\u0001"
		commaPlaceholder = "\u0002"
		timePlaceholder  = "\u0003"
	)

	// 时间
	timeRegex := regexp.MustCompile(`\b\d{1,2}(?::|\.)\d{2}\s+[ap]\.m\.`)
	text = timeRegex.ReplaceAllStringFunc(text, func(m string) string {
		return strings.ReplaceAll(m, ".", timePlaceholder)
	})

	// 千位分隔符
	text = regexp.MustCompile(`\b\d{1,3}(?:,\d{3})+\b`).ReplaceAllStringFunc(text, func(m string) string {
		return strings.ReplaceAll(m, ",", commaPlaceholder)
	})

	// 小数
	text = regexp.MustCompile(`\b\d+\.\d+\b`).ReplaceAllStringFunc(text, func(m string) string {
		return strings.ReplaceAll(m, ".", dotPlaceholder)
	})

	// 缩写词
	text = regexp.MustCompile(`\b(?:[A-Za-z]\.){2,}[A-Za-z]?\b|\b[A-Z][a-z]*\.(?:[A-Z][a-z]*\.)+`).ReplaceAllStringFunc(text, func(m string) string {
		return strings.ReplaceAll(m, ".", dotPlaceholder)
	})

	text = regexp.MustCompile(`([。.！!？?；;，,\n]+)`).ReplaceAllString(text, "${1}\u0000")

	parts := strings.Split(text, "\u0000")

	var sentences []string
	for _, part := range parts {
		s := strings.TrimSpace(part)
		s = strings.ReplaceAll(s, timePlaceholder, ".")
		s = strings.ReplaceAll(s, dotPlaceholder, ".")
		s = strings.ReplaceAll(s, commaPlaceholder, ",")
		if s != "" {
			sentences = append(sentences, s)
		}
	}

	return sentences
}
