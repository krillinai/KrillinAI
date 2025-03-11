package desktop

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"krillin-ai/internal/handler"
	"krillin-ai/log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"mime/multipart"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/storage"
	"fyne.io/fyne/v2/widget"
	"go.uber.org/zap"
)

type SubtitleManager struct {
	window             fyne.Window
	handler            *handler.Handler
	videoUrl           string // 统一使用这个字段存储视频URL（本地上传后的URL或直接输入的URL）
	audioPath          string
	uploadedAudioURL   string
	sourceLanguage     string
	targetLanguage     string
	bilingualEnabled   bool
	bilingualPosition  int
	voiceoverEnabled   bool
	voiceoverGender    int // 1-女声，2-男声
	fillerFilter       bool
	wordReplacements   []WordReplacement
	embedSubtitle      string // none, horizontal, vertical, all
	verticalMajorTitle string
	verticalMinorTitle string
	progressBar        *widget.ProgressBar
	downloadContainer  *fyne.Container
}

type WordReplacement struct {
	Original string
	Replace  string
}

func NewSubtitleManager(window fyne.Window) *SubtitleManager {
	return &SubtitleManager{
		window:            window,
		handler:           handler.NewHandler(),
		sourceLanguage:    "zh_cn",
		targetLanguage:    "none",
		bilingualPosition: 1,
		voiceoverGender:   2,
		fillerFilter:      true,
		embedSubtitle:     "none",
		downloadContainer: container.NewVBox(),
	}
}

func (sm *SubtitleManager) ShowFileDialog() {
	fd := dialog.NewFileOpen(func(reader fyne.URIReadCloser, err error) {
		if err != nil {
			dialog.ShowError(err, sm.window)
			return
		}
		if reader == nil {
			return
		}
		localPath := reader.URI().Path()
		log.GetLogger().Info("选择视频文件", zap.String("path", localPath))

		// 上传文件
		err = sm.uploadVideo(localPath)
		if err != nil {
			dialog.ShowError(err, sm.window)
			return
		}
	}, sm.window)

	fd.SetFilter(storage.NewExtensionFileFilter([]string{".mp4", ".avi", ".mkv"}))
	fd.Show()
}

func (sm *SubtitleManager) ShowAudioFileDialog() {
	fd := dialog.NewFileOpen(func(reader fyne.URIReadCloser, err error) {
		if err != nil {
			dialog.ShowError(err, sm.window)
			return
		}
		if reader == nil {
			return
		}
		sm.audioPath = reader.URI().Path()
		log.GetLogger().Info("选择音频文件", zap.String("path", sm.audioPath))

		// 上传文件
		err = sm.uploadAudio()
		if err != nil {
			dialog.ShowError(err, sm.window)
			return
		}
	}, sm.window)

	fd.SetFilter(storage.NewExtensionFileFilter([]string{".mp3", ".wav", ".m4a"}))
	fd.Show()
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

	// 发送请求
	resp, err := http.Post("http://localhost:8080/api/file", writer.FormDataContentType(), body)
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

	// 发送请求
	resp, err := http.Post("http://localhost:8080/api/file", writer.FormDataContentType(), body)
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
	sm.sourceLanguage = lang
}

func (sm *SubtitleManager) SetTargetLang(lang string) {
	sm.targetLanguage = lang
}

func (sm *SubtitleManager) SetBilingualEnabled(enabled bool) {
	sm.bilingualEnabled = enabled
}

func (sm *SubtitleManager) SetBilingualPosition(pos int) {
	sm.bilingualPosition = pos
}

func (sm *SubtitleManager) SetVoiceoverEnabled(enabled bool) {
	sm.voiceoverEnabled = enabled
}

func (sm *SubtitleManager) SetVoiceoverGender(gender int) {
	sm.voiceoverGender = gender
}

func (sm *SubtitleManager) SetFillerFilter(enabled bool) {
	sm.fillerFilter = enabled
}

func (sm *SubtitleManager) SetWordReplacements(replacements []WordReplacement) {
	sm.wordReplacements = replacements
}

func (sm *SubtitleManager) SetEmbedSubtitle(embedType string) {
	sm.embedSubtitle = embedType
}

func (sm *SubtitleManager) SetVerticalTitles(major, minor string) {
	sm.verticalMajorTitle = major
	sm.verticalMinorTitle = minor
}

func (sm *SubtitleManager) SetProgressBar(bar *widget.ProgressBar) {
	sm.progressBar = bar
}

func (sm *SubtitleManager) SetDownloadContainer(c *fyne.Container) {
	sm.downloadContainer = c
}

func (sm *SubtitleManager) SetVideoUrl(url string) {
	sm.videoUrl = url
}

func (sm *SubtitleManager) GetVideoUrl() string {
	return sm.videoUrl
}

func (sm *SubtitleManager) StartTask() error {
	if sm.videoUrl == "" {
		return fmt.Errorf("请先选择视频文件或输入视频链接")
	}

	// 准备请求参数
	params := map[string]interface{}{
		"url":                       sm.videoUrl,
		"language":                  "zh_cn",
		"origin_lang":               sm.sourceLanguage,
		"target_lang":               sm.targetLanguage,
		"bilingual":                 1,
		"translation_subtitle_pos":  sm.bilingualPosition,
		"tts":                       2,
		"modal_filter":              1,
		"embed_subtitle_video_type": sm.embedSubtitle,
	}

	if sm.voiceoverEnabled {
		params["tts"] = 1
		params["tts_voice_code"] = sm.voiceoverGender
		if sm.uploadedAudioURL != "" {
			params["tts_voice_clone_src_file_url"] = sm.uploadedAudioURL
		}
	}

	if len(sm.wordReplacements) > 0 {
		replaces := make([]string, 0, len(sm.wordReplacements))
		for _, r := range sm.wordReplacements {
			replaces = append(replaces, fmt.Sprintf("%s|%s", r.Original, r.Replace))
		}
		params["replace"] = replaces
	}

	if sm.embedSubtitle == "vertical" || sm.embedSubtitle == "all" {
		params["vertical_major_title"] = sm.verticalMajorTitle
		params["vertical_minor_title"] = sm.verticalMinorTitle
	}

	// 发送请求
	taskID, err := sm.startSubtitleTask(params)
	if err != nil {
		return fmt.Errorf("启动任务失败: %w", err)
	}

	// 开始轮询任务进度
	go sm.pollTaskProgress(taskID)

	return nil
}

func (sm *SubtitleManager) startSubtitleTask(params map[string]interface{}) (string, error) {
	jsonData, err := json.Marshal(params)
	if err != nil {
		return "", err
	}

	resp, err := http.Post("http://localhost:8080/api/capability/subtitleTask", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Error int    `json:"error"`
		Msg   string `json:"msg"`
		Data  struct {
			TaskID string `json:"task_id"`
		} `json:"data"`
	}

	err = json.NewDecoder(resp.Body).Decode(&result)
	if err != nil {
		return "", err
	}

	if result.Error != 0 && result.Error != 200 {
		return "", fmt.Errorf(result.Msg)
	}

	return result.Data.TaskID, nil
}

func (sm *SubtitleManager) pollTaskProgress(taskID string) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		resp, err := http.Get(fmt.Sprintf("http://localhost:8080/api/capability/subtitleTask?taskId=%s", taskID))
		if err != nil {
			log.GetLogger().Error("查询任务进度失败", zap.Error(err))
			continue
		}

		var result struct {
			Error int    `json:"error"`
			Msg   string `json:"msg"`
			Data  struct {
				ProcessPercent float64 `json:"process_percent"`
				SubtitleInfo   []struct {
					Name        string `json:"name"`
					DownloadURL string `json:"download_url"`
				} `json:"subtitle_info"`
				SpeechDownloadURL string `json:"speech_download_url"`
				TaskID            string `json:"task_id"`
			} `json:"data"`
		}

		err = json.NewDecoder(resp.Body).Decode(&result)
		resp.Body.Close()
		if err != nil {
			log.GetLogger().Error("解析任务进度失败", zap.Error(err))
			continue
		}

		if result.Error != 0 && result.Error != 200 {
			log.GetLogger().Error("查询任务进度失败", zap.String("msg", result.Msg))
			continue
		}

		// 更新进度
		sm.updateProgress(result.Data.ProcessPercent)

		// 任务完成
		if result.Data.ProcessPercent >= 100 {
			//sm.showDownloadLinks(result.Data.SubtitleInfo, result.Data.SpeechDownloadURL, result.Data.TaskID)
			break
		}
	}
}

func (sm *SubtitleManager) updateProgress(percent float64) {
	if sm.progressBar != nil {
		sm.progressBar.SetValue(percent / 100.0)
	}
}

func (sm *SubtitleManager) showDownloadLinks(subtitles []struct{ Name, DownloadURL string }, speechURL string, taskID string) {
	// 清空现有的下载链接
	sm.downloadContainer.Objects = nil

	// 添加字幕文件下载链接
	for _, subtitle := range subtitles {
		button := widget.NewButton("下载: "+subtitle.Name, func() {
			dialog.ShowFileSave(func(writer fyne.URIWriteCloser, err error) {
				if err != nil {
					dialog.ShowError(err, sm.window)
					return
				}
				if writer == nil {
					return
				}

				// 下载文件
				resp, err := http.Get(subtitle.DownloadURL)
				if err != nil {
					dialog.ShowError(err, sm.window)
					return
				}
				defer resp.Body.Close()

				_, err = io.Copy(writer, resp.Body)
				if err != nil {
					dialog.ShowError(err, sm.window)
					return
				}

				writer.Close()
				dialog.ShowInformation("成功", "文件下载完成", sm.window)
			}, sm.window)
		})
		sm.downloadContainer.Add(button)
	}

	// 添加配音文件下载链接
	if speechURL != "" {
		sArr := strings.Split(speechURL, "/")
		sName := sArr[len(sArr)-1]
		button := widget.NewButton("下载配音: "+sName, func() {
			dialog.ShowFileSave(func(writer fyne.URIWriteCloser, err error) {
				if err != nil {
					dialog.ShowError(err, sm.window)
					return
				}
				if writer == nil {
					return
				}

				// 下载文件
				resp, err := http.Get(speechURL)
				if err != nil {
					dialog.ShowError(err, sm.window)
					return
				}
				defer resp.Body.Close()

				_, err = io.Copy(writer, resp.Body)
				if err != nil {
					dialog.ShowError(err, sm.window)
					return
				}

				writer.Close()
				dialog.ShowInformation("成功", "配音文件下载完成", sm.window)
			}, sm.window)
		})
		sm.downloadContainer.Add(button)
	}

	// 添加输出目录提示
	message := widget.NewLabel(fmt.Sprintf("输出文件位于: /tasks/%s/output/", taskID))
	sm.downloadContainer.Add(message)

	// 刷新UI
	sm.downloadContainer.Refresh()
}
