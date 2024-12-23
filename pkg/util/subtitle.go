package util

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// 判断是否包含中文字符
func containsChinese(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}

// 处理每一个字幕块
func ProcessBlock(block []string, targetLanguageFile, originLanguageFile *os.File, isTargetOnTop bool) {
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
			} else {
				originLines = append(originLines, line)
			}
			continue
		}
		// 到了下方的文字行
		if isTargetOnTop {
			originLines = append(originLines, line)
		} else {
			targetLines = append(targetLines, line)
		}
	}

	if len(targetLines) > 2 {
		// 写入中文文件
		for _, line := range targetLines {
			targetLanguageFile.WriteString(line + "\n")
		}
		targetLanguageFile.WriteString("\n")
	}

	if len(originLines) > 2 {
		// 写入英文文件
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

// 获取 MP3 文件的时长（秒）
func GetMP3Duration(filePath string) (uint32, error) {
	// 调用ffprobe获取音频文件的时长
	cmd := exec.Command("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", filePath)
	output, err := cmd.Output()
	if err != nil {
		return 0, err
	}

	// 解析ffprobe返回的JSON数据
	var probeData ProbeData
	err = json.Unmarshal(output, &probeData)
	if err != nil {
		return 0, err
	}

	// 将时长字符串转换为浮点数
	duration, err := strconv.ParseFloat(probeData.Format.Duration, 64)
	if err != nil {
		return 0, err
	}

	return uint32(duration), nil
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

	return s
}

func ParseSrtNoTsToSrtBlock(srtNoTsFile string) ([]*SrtBlock, error) {
	file, err := os.Open(srtNoTsFile)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var blocks []*SrtBlock
	var currentBlock SrtBlock
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := TrimString(scanner.Text())
		if line == "" { // 空行表示一个块的结束
			if currentBlock.Index != 0 {
				cur := currentBlock
				blocks = append(blocks, &cur)
				currentBlock = SrtBlock{} // 重置
			}
			continue
		}

		if currentBlock.Index == 0 { // 按文件内容依次赋值
			var index int
			_, err = fmt.Sscanf(line, "%d", &index)
			if err != nil {
				return nil, err
			}
			currentBlock.Index = index
		} else if currentBlock.TargetLanguageSentence == "" {
			currentBlock.TargetLanguageSentence = line
		} else if currentBlock.OriginLanguageSentence == "" {
			currentBlock.OriginLanguageSentence = line
		}
	}
	// 最后的块
	if currentBlock.Index != 0 {
		cur := currentBlock
		blocks = append(blocks, &cur)
	}

	if err = scanner.Err(); err != nil {
		return nil, err
	}
	return blocks, nil
}

func SplitSentence(sentence string) []string {
	// 使用正则表达式移除标点符号和特殊字符（除了字母、数字和空格）
	re := regexp.MustCompile(`[^\w\s']+`)
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
