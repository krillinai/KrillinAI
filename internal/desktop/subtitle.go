package desktop

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"krillin-ai/internal/api"
	"krillin-ai/internal/handler"
	"krillin-ai/log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"
	"go.uber.org/zap"
)

// SubtitleManager 字幕管理器
type SubtitleManager struct {
	window             fyne.Window
	handler            *handler.Handler
	videoUrl           string // 统一使用这个字段存储视频URL（本地上传后的URL或直接输入的URL）
	audioPath          string
	uploadedAudioURL   string
	sourceLang         string
	targetLang         string
	bilingualEnabled   bool
	bilingualPosition  int
	voiceoverEnabled   bool
	voiceoverGender    int // 1-女声，2-男声
	fillerFilter       bool
	wordReplacements   []api.WordReplacement
	embedSubtitle      string // none, horizontal, vertical, all
	verticalTitles     [2]string
	progressBar        *widget.ProgressBar
	progressLabel      *widget.Label // 进度百分比标签
	downloadContainer  *fyne.Container
	tipsLabel          *widget.Label
	onVideoSelected    func(string)
	onAudioSelected    func(string)
	voiceoverAudioPath string
}

// NewSubtitleManager 创建字幕管理器
func NewSubtitleManager(window fyne.Window) *SubtitleManager {
	return &SubtitleManager{
		window:            window,
		sourceLang:        "en",
		targetLang:        "zh_cn",
		bilingualEnabled:  true,
		bilingualPosition: 1,
		fillerFilter:      true,
		voiceoverEnabled:  false,
		voiceoverGender:   2,
		embedSubtitle:     "none",
		downloadContainer: container.NewVBox(),
		tipsLabel:         widget.NewLabel(""),
	}
}

func (sm *SubtitleManager) SetVideoSelectedCallback(callback func(string)) {
	sm.onVideoSelected = callback
}

func (sm *SubtitleManager) ShowFileDialog() {
	dialog.ShowFileOpen(func(reader fyne.URIReadCloser, err error) {
		if err != nil {
			dialog.ShowError(err, sm.window)
			return
		}
		if reader == nil {
			return
		}
		defer reader.Close()

		// 创建multipart form
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile("file", reader.URI().Name())
		if err != nil {
			dialog.ShowError(err, sm.window)
			return
		}
		_, err = io.Copy(part, reader)
		if err != nil {
			dialog.ShowError(err, sm.window)
			return
		}
		writer.Close()

		resp, err := http.Post("http://localhost:8888/api/file", writer.FormDataContentType(), body)
		if err != nil {
			dialog.ShowError(err, sm.window)
			return
		}
		defer resp.Body.Close()

		var result struct {
			Error int    `json:"error"`
			Msg   string `json:"msg"`
			Data  struct {
				FilePath string `json:"file_path"`
			} `json:"data"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			dialog.ShowError(err, sm.window)
			return
		}

		if result.Error != 0 && result.Error != 200 {
			dialog.ShowError(fmt.Errorf(result.Msg), sm.window)
			return
		}

		if sm.onVideoSelected != nil {
			sm.onVideoSelected(result.Data.FilePath)
		}
	}, sm.window)
}

func (sm *SubtitleManager) ShowAudioFileDialog() {
	dialog.ShowFileOpen(func(reader fyne.URIReadCloser, err error) {
		if err != nil {
			dialog.ShowError(err, sm.window)
			return
		}
		if reader == nil {
			return
		}
		defer reader.Close()

		tempFile, err := os.CreateTemp("", "audio-*.wav")
		if err != nil {
			dialog.ShowError(err, sm.window)
			return
		}
		defer tempFile.Close()

		_, err = io.Copy(tempFile, reader)
		if err != nil {
			dialog.ShowError(err, sm.window)
			return
		}

		// 设置音频路径
		sm.voiceoverAudioPath = tempFile.Name()
		if sm.onAudioSelected != nil {
			sm.onAudioSelected(tempFile.Name())
		}
	}, sm.window)
}

func (sm *SubtitleManager) uploadVideo(localPath string) error {
	file, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("打开文件失败: %w", err)
	}
	defer file.Close()

	// 创建multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", filepath.Base(localPath))
	if err != nil {
		return fmt.Errorf("创建form失败: %w", err)
	}
	_, err = io.Copy(part, file)
	if err != nil {
		return fmt.Errorf("复制文件内容失败: %w", err)
	}
	writer.Close()

	resp, err := http.Post("http://localhost:8888/api/file", writer.FormDataContentType(), body)
	if err != nil {
		return fmt.Errorf("上传文件失败: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Error int    `json:"error"`
		Msg   string `json:"msg"`
		Data  struct {
			FilePath string `json:"file_path"`
		} `json:"data"`
	}

	err = json.NewDecoder(resp.Body).Decode(&result)
	if err != nil {
		return fmt.Errorf("解析响应失败: %w", err)
	}

	if result.Error != 0 && result.Error != 200 {
		return fmt.Errorf(result.Msg)
	}

	sm.videoUrl = result.Data.FilePath
	return nil
}

func (sm *SubtitleManager) uploadAudio() error {
	file, err := os.Open(sm.audioPath)
	if err != nil {
		return fmt.Errorf("打开文件失败: %w", err)
	}
	defer file.Close()

	// 创建multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", filepath.Base(sm.audioPath))
	if err != nil {
		return fmt.Errorf("创建form失败: %w", err)
	}
	_, err = io.Copy(part, file)
	if err != nil {
		return fmt.Errorf("复制文件内容失败: %w", err)
	}
	writer.Close()

	resp, err := http.Post("http://localhost:8888/api/file", writer.FormDataContentType(), body)
	if err != nil {
		return fmt.Errorf("上传文件失败: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Error int    `json:"error"`
		Msg   string `json:"msg"`
		Data  struct {
			FilePath string `json:"file_path"`
		} `json:"data"`
	}

	err = json.NewDecoder(resp.Body).Decode(&result)
	if err != nil {
		return fmt.Errorf("解析响应失败: %w", err)
	}

	if result.Error != 0 && result.Error != 200 {
		return fmt.Errorf(result.Msg)
	}

	sm.uploadedAudioURL = result.Data.FilePath
	return nil
}

func (sm *SubtitleManager) SetSourceLang(lang string) {
	sm.sourceLang = lang
}

func (sm *SubtitleManager) SetTargetLang(lang string) {
	sm.targetLang = lang
}

// SetBilingualEnabled 设置是否启用双语字幕
func (sm *SubtitleManager) SetBilingualEnabled(enabled bool) {
	sm.bilingualEnabled = enabled
}

// SetBilingualPosition 设置双语字幕位置
func (sm *SubtitleManager) SetBilingualPosition(position int) {
	sm.bilingualPosition = position
}

// SetFillerFilter 设置是否启用语气词过滤
func (sm *SubtitleManager) SetFillerFilter(enabled bool) {
	sm.fillerFilter = enabled
}

// SetVoiceoverEnabled 设置是否启用配音
func (sm *SubtitleManager) SetVoiceoverEnabled(enabled bool) {
	sm.voiceoverEnabled = enabled
}

// SetVoiceoverGender 设置配音性别
func (sm *SubtitleManager) SetVoiceoverGender(gender int) {
	sm.voiceoverGender = gender
}

// SetEmbedSubtitle 设置字幕嵌入方式
func (sm *SubtitleManager) SetEmbedSubtitle(mode string) {
	sm.embedSubtitle = mode
}

// SetVerticalTitles 设置竖屏标题
func (sm *SubtitleManager) SetVerticalTitles(mainTitle, subTitle string) {
	sm.verticalTitles = [2]string{mainTitle, subTitle}
}

// SetProgressBar 设置进度条
func (sm *SubtitleManager) SetProgressBar(progress *widget.ProgressBar) {
	sm.progressBar = progress
}

// SetDownloadContainer 设置下载容器
func (sm *SubtitleManager) SetDownloadContainer(container *fyne.Container) {
	sm.downloadContainer = container
}

// SetTipsLabel 设置提示标签
func (sm *SubtitleManager) SetTipsLabel(label *widget.Label) {
	sm.tipsLabel = label
}

// SetAudioSelectedCallback 设置音频选择回调
func (sm *SubtitleManager) SetAudioSelectedCallback(callback func(string)) {
	sm.onAudioSelected = callback
}

// SetVideoUrl 设置视频URL
func (sm *SubtitleManager) SetVideoUrl(url string) {
	sm.videoUrl = url
}

// GetVideoUrl 获取视频URL
func (sm *SubtitleManager) GetVideoUrl() string {
	return sm.videoUrl
}

// SetProgressLabel 设置进度百分比标签
func (sm *SubtitleManager) SetProgressLabel(label *widget.Label) {
	sm.progressLabel = label
}

func (sm *SubtitleManager) StartTask() error {
	task := &api.SubtitleTask{
		URL:                     sm.videoUrl,
		Language:                "zh_cn",
		OriginLang:              sm.sourceLang,
		TargetLang:              sm.targetLang,
		Bilingual:               boolToInt(sm.bilingualEnabled),
		TranslationSubtitlePos:  sm.bilingualPosition,
		TTS:                     boolToInt(sm.voiceoverEnabled),
		TTSVoiceCode:            sm.voiceoverGender,
		TTSVoiceCloneSrcFileURL: sm.voiceoverAudioPath,
		ModalFilter:             boolToInt(sm.fillerFilter),
		EmbedSubtitleVideoType:  sm.embedSubtitle,
		VerticalMajorTitle:      sm.verticalTitles[0],
		VerticalMinorTitle:      sm.verticalTitles[1],
	}

	jsonData, err := json.Marshal(task)
	if err != nil {
		return fmt.Errorf("序列化任务数据失败: %w", err)
	}

	resp, err := http.Post("http://localhost:8888/api/capability/subtitleTask", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("发送任务请求失败: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Error int    `json:"error"`
		Msg   string `json:"msg"`
		Data  struct {
			TaskId string `json:"task_id"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("解析响应失败: %w", err)
	}

	if result.Error != 0 && result.Error != 200 {
		return fmt.Errorf(result.Msg)
	}

	// 开始轮询任务状态
	go sm.pollTaskStatus(result.Data.TaskId)
	return nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 2
}

// pollTaskStatus 轮询任务状态
func (sm *SubtitleManager) pollTaskStatus(taskId string) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		resp, err := http.Get(fmt.Sprintf("http://localhost:8888/api/capability/subtitleTask?taskId=%s", taskId))
		if err != nil {
			log.GetLogger().Error("获取任务状态失败", zap.Error(err))
			continue
		}

		var result struct {
			Error int    `json:"error"`
			Msg   string `json:"msg"`
			Data  struct {
				ProcessPercent    int                  `json:"process_percent"`
				SubtitleInfo      []api.SubtitleResult `json:"subtitle_info"`
				SpeechDownloadURL string               `json:"speech_download_url"`
				TaskId            string               `json:"task_id"`
			} `json:"data"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			log.GetLogger().Error("解析响应失败", zap.Error(err))
			resp.Body.Close()
			continue
		}
		resp.Body.Close()

		if result.Error != 0 && result.Error != 200 {
			log.GetLogger().Error("获取任务状态失败", zap.String("msg", result.Msg))
			continue
		}

		// 更新进度条
		progress := float64(result.Data.ProcessPercent) / 100.0
		sm.progressBar.SetValue(progress)

		// 同时更新进度标签
		if sm.progressLabel != nil {
			sm.progressLabel.SetText(fmt.Sprintf("%d%%", result.Data.ProcessPercent))
			sm.progressLabel.Show()
		}

		if result.Data.ProcessPercent >= 100 {
			sm.displayDownloadLinks(result.Data.SubtitleInfo, result.Data.SpeechDownloadURL)
			sm.tipsLabel.SetText(fmt.Sprintf("若需要查看合成的视频或者文字稿，请到软件目录下的/tasks/%s/output 目录下查看。", result.Data.TaskId))
			sm.tipsLabel.Show()
			break
		}
	}
}

// displayDownloadLinks 显示下载链接
func (sm *SubtitleManager) displayDownloadLinks(subtitleInfo []api.SubtitleResult, speechDownloadURL string) {
	// 清空现有链接
	sm.downloadContainer.Objects = []fyne.CanvasObject{}

	// 添加字幕文件下载按钮
	for _, result := range subtitleInfo {
		downloadURL := result.DownloadURL
		fileName := result.Name
		btn := widget.NewButton("下载"+fileName, func() {
			go func() {
				resp, err := http.Get("http://localhost:8888" + downloadURL)
				if err != nil {
					dialog.ShowError(fmt.Errorf("下载失败: %v", err), sm.window)
					return
				}

				saveDialog := dialog.NewFileSave(func(writer fyne.URIWriteCloser, err error) {
					if err != nil {
						dialog.ShowError(err, sm.window)
						return
					}
					if writer == nil {
						return // 用户取消了
					}
					defer writer.Close()
					defer resp.Body.Close()

					_, err = io.Copy(writer, resp.Body)
					if err != nil {
						dialog.ShowError(fmt.Errorf("保存文件失败: %v", err), sm.window)
						return
					}

					dialog.ShowInformation("下载完成", "文件已保存", sm.window)
				}, sm.window)

				// 设置建议的文件名
				saveDialog.SetFileName(filepath.Base(downloadURL))
				saveDialog.Show()
			}()
		})
		btn.Importance = widget.HighImportance
		sm.downloadContainer.Add(btn)
	}

	// 如果有配音文件，添加配音下载按钮
	if speechDownloadURL != "" {
		btn := widget.NewButton("下载配音文件", func() {
			go func() {
				resp, err := http.Get("http://localhost:8888" + speechDownloadURL)
				if err != nil {
					dialog.ShowError(fmt.Errorf("下载失败: %v", err), sm.window)
					return
				}

				// 创建保存文件的对话框
				saveDialog := dialog.NewFileSave(func(writer fyne.URIWriteCloser, err error) {
					if err != nil {
						dialog.ShowError(err, sm.window)
						return
					}
					if writer == nil {
						return
					}
					defer writer.Close()
					defer resp.Body.Close() // 移到这里，确保数据复制完成后再关闭

					_, err = io.Copy(writer, resp.Body)
					if err != nil {
						dialog.ShowError(fmt.Errorf("保存文件失败: %v", err), sm.window)
						return
					}

					dialog.ShowInformation("下载完成", "文件已保存", sm.window)
				}, sm.window)

				// 设置建议的文件名
				fileName := filepath.Base(speechDownloadURL)
				// 确保音频文件有正确的扩展名
				if !strings.HasSuffix(strings.ToLower(fileName), ".mp3") &&
					!strings.HasSuffix(strings.ToLower(fileName), ".wav") &&
					!strings.HasSuffix(strings.ToLower(fileName), ".aac") {
					fileName += ".mp3" // 默认添加.mp3扩展名
				}
				saveDialog.SetFileName(fileName)
				saveDialog.Show()
			}()
		})
		btn.Importance = widget.HighImportance
		sm.downloadContainer.Add(btn)
	}

	sm.downloadContainer.Show()
}

func parseURL(urlStr string) *url.URL {
	u, err := url.Parse(urlStr)
	if err != nil {
		log.GetLogger().Error("解析URL失败", zap.Error(err), zap.String("url", urlStr))
		return &url.URL{Path: urlStr} // 如果解析失败，返回一个简单的URL
	}
	return u
}
