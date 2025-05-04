package desktop

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image/color"
	"io"
	"krillin-ai/config"
	"krillin-ai/internal/api"
	"krillin-ai/internal/handler"
	"krillin-ai/log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/storage"
	"fyne.io/fyne/v2/widget"
	"go.uber.org/zap"
)

// SubtitleManager 字幕管理器
type SubtitleManager struct {
	window             fyne.Window
	handler            *handler.Handler
	videoUrl           string   // 统一使用这个字段存储视频URL（本地上传后的URL或直接输入的URL）
	videoPaths         []string // 存储多个视频路径
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
	onVideosSelected   func([]string) // 多文件选择回调
	onAudioSelected    func(string)
	voiceoverAudioPath string
	multiTaskResults   []taskResult // 存储多任务的结果
}

// 用于存储每个任务的结果信息
type taskResult struct {
	fileName          string // 原始文件名
	subtitleInfo      []api.SubtitleResult
	speechDownloadURL string
	taskId            string
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
		videoPaths:        make([]string, 0),
	}
}

func (sm *SubtitleManager) SetVideoSelectedCallback(callback func(string)) {
	sm.onVideoSelected = callback
}

// 多文件选择回调设
func (sm *SubtitleManager) SetVideosSelectedCallback(callback func([]string)) {
	sm.onVideosSelected = callback
}

func (sm *SubtitleManager) ShowFileDialog() {
	sm.videoPaths = make([]string, 0)

	sm.addVideoFile(false)
}

// addVideoFile 添加视频文件
// continueAdding为true表示这是继续添加的文件
func (sm *SubtitleManager) addVideoFile(continueAdding bool) {
	fd := dialog.NewFileOpen(func(reader fyne.URIReadCloser, err error) {
		if err != nil {
			dialog.ShowError(err, sm.window)
			return
		}
		if reader == nil {
			// 用户取消选择
			if len(sm.videoPaths) > 0 {
				// 询问是否上传
				confirmDialog := dialog.NewConfirm(
					"上传文件",
					fmt.Sprintf("已选择 %d 个文件，是否开始上传？", len(sm.videoPaths)),
					func(confirm bool) {
						if confirm {
							sm.uploadMultipleFiles()
						}
					},
					sm.window)
				confirmDialog.Show()
			}
			return
		}
		defer reader.Close()

		filePath := reader.URI().Path()

		sm.videoPaths = append(sm.videoPaths, filePath)

		// 询问是否继续添加
		// 构建已选文件消息
		filesMessage := fmt.Sprintf("已选择 %d 个文件:\n", len(sm.videoPaths))
		for i, path := range sm.videoPaths {
			filesMessage += fmt.Sprintf("%d. %s\n", i+1, filepath.Base(path))
		}
		filesMessage += "\n是否继续添加更多文件？"

		confirmDialog := dialog.NewConfirm(
			"继续选择",
			filesMessage,
			func(cont bool) {
				if cont {
					// 继续添加文件
					sm.addVideoFile(true)
				} else {
					// 开始上传
					sm.uploadMultipleFiles()
				}
			},
			sm.window,
		)
		confirmDialog.Show()
	}, sm.window)

	fd.SetFilter(storage.NewExtensionFileFilter([]string{".mp4", ".mov", ".avi", ".mkv", ".wmv"}))
	fd.Show()
}

// uploadMultipleFiles 上传多个文件
func (sm *SubtitleManager) uploadMultipleFiles() {
	if len(sm.videoPaths) == 0 {
		return
	}

	// 创建进度对话框
	filesList := fmt.Sprintf("上传 %d 个文件:\n", len(sm.videoPaths))
	for i, path := range sm.videoPaths {
		filesList += fmt.Sprintf("%d. %s\n", i+1, filepath.Base(path))
	}

	progressDialog := dialog.NewProgress("上传中", filesList, sm.window)
	progressDialog.Show()

	go func() {
		defer progressDialog.Hide()

		// 创建multipart form
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)

		// 添加多个文件到表单
		for i, filePath := range sm.videoPaths {
			file, err := os.Open(filePath)
			if err != nil {
				dialog.ShowError(err, sm.window)
				return
			}

			part, err := writer.CreateFormFile("file", filepath.Base(filePath))
			if err != nil {
				file.Close()
				dialog.ShowError(err, sm.window)
				return
			}

			_, err = io.Copy(part, file)
			file.Close()
			if err != nil {
				dialog.ShowError(err, sm.window)
				return
			}

			// 更新进度
			progressDialog.SetValue(float64(i+1) / float64(len(sm.videoPaths)))
		}

		err := writer.Close()
		if err != nil {
			dialog.ShowError(err, sm.window)
			return
		}

		// 发送请求
		resp, err := http.Post(fmt.Sprintf("http://%s:%d/api/file", config.Conf.Server.Host, config.Conf.Server.Port), writer.FormDataContentType(), body)
		if err != nil {
			dialog.ShowError(err, sm.window)
			return
		}
		defer resp.Body.Close()

		var result struct {
			Error int    `json:"error"`
			Msg   string `json:"msg"`
			Data  struct {
				FilePath []string `json:"file_path"`
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

		tempPaths := make([]string, len(result.Data.FilePath))
		copy(tempPaths, result.Data.FilePath)
		sm.videoPaths = tempPaths

		// 如果只有一个文件，也设置videoUrl
		if len(result.Data.FilePath) > 0 {
			sm.videoUrl = result.Data.FilePath[0]
		}

		if sm.onVideosSelected != nil {
			sm.onVideosSelected(result.Data.FilePath)
		} else if sm.onVideoSelected != nil && len(result.Data.FilePath) > 0 {
			sm.onVideoSelected(result.Data.FilePath[0])
		}

		// 构建消息
		successMessage := fmt.Sprintf("已成功上传 %d 个文件:\n", len(result.Data.FilePath))
		for i, url := range result.Data.FilePath {
			successMessage += fmt.Sprintf("%d. %s\n", i+1, filepath.Base(url))
		}

		dialog.ShowInformation("上传成功", successMessage, sm.window)
	}()
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

	resp, err := http.Post(fmt.Sprintf("http://%s:%d/api/file", config.Conf.Server.Host, config.Conf.Server.Port), writer.FormDataContentType(), body)
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

	resp, err := http.Post(fmt.Sprintf("http://%s:%d/api/file", config.Conf.Server.Host, config.Conf.Server.Port), writer.FormDataContentType(), body)
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

// StartTask 启动字幕任务
func (sm *SubtitleManager) StartTask() error {
	// 检查是否有多个视频路径需要处理
	if len(sm.videoPaths) > 1 {
		// 对多个视频依次启动任务
		go sm.processMultipleVideos()
		return nil
	} else if len(sm.videoPaths) == 1 {
		// 确保使用videoPaths中的第一个URL
		sm.videoUrl = sm.videoPaths[0]
	}

	// 单个视频处理
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

	resp, err := http.Post(fmt.Sprintf("http://%s:%d/api/capability/subtitleTask", config.Conf.Server.Host, config.Conf.Server.Port), "application/json", bytes.NewBuffer(jsonData))
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

// 处理多个视频
func (sm *SubtitleManager) processMultipleVideos() {
	// 原始视频URL
	originalURL := sm.videoUrl

	// 清空之前的任务结果
	sm.multiTaskResults = make([]taskResult, 0, len(sm.videoPaths))

	// 重置进度条
	sm.progressBar.SetValue(0)
	sm.progressBar.Show()

	// 更新进度标签
	if sm.progressLabel != nil {
		sm.progressLabel.SetText("0%")
		sm.progressLabel.Show()
	}

	// 清空下载容器
	sm.downloadContainer.Objects = []fyne.CanvasObject{}
	sm.downloadContainer.Hide()

	// 隐藏提示标签
	sm.tipsLabel.Hide()

	go func() {
		for i, url := range sm.videoPaths {
			fileName := filepath.Base(url)

			percentage := float64(i) / float64(len(sm.videoPaths))
			sm.progressBar.SetValue(percentage)

			if sm.progressLabel != nil {
				displayName := fileName
				if len(displayName) > 20 {
					displayName = displayName[:17] + "..."
				}
				sm.progressLabel.SetText(fmt.Sprintf("处理: %d/%d\n%s", i+1, len(sm.videoPaths), displayName))
				sm.progressLabel.Show()
			}

			sm.videoUrl = url

			task := &api.SubtitleTask{
				URL:                     url,
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
				log.GetLogger().Error("序列化任务数据失败", zap.Error(err))
				continue
			}

			resp, err := http.Post(fmt.Sprintf("http://%s:%d/api/capability/subtitleTask", config.Conf.Server.Host, config.Conf.Server.Port), "application/json", bytes.NewBuffer(jsonData))
			if err != nil {
				log.GetLogger().Error("发送任务请求失败", zap.Error(err))
				continue
			}

			var result struct {
				Error int    `json:"error"`
				Msg   string `json:"msg"`
				Data  struct {
					TaskId string `json:"task_id"`
				} `json:"data"`
			}

			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
				resp.Body.Close()
				log.GetLogger().Error("解析响应失败", zap.Error(err))
				continue
			}
			resp.Body.Close()

			if result.Error != 0 && result.Error != 200 {
				log.GetLogger().Error("任务创建失败", zap.String("msg", result.Msg))
				continue
			}

			taskRes := sm.waitTaskCompleted(result.Data.TaskId, fileName)

			sm.multiTaskResults = append(sm.multiTaskResults, taskRes)
		}

		sm.videoUrl = originalURL

		// 显示所有文件下载链接
		sm.displayMultiTaskDownloadLinks()

		// 完成所有视频处理
		dialog.ShowInformation("完成", "所有视频处理完成", sm.window)
	}()
}

// 等待任务完成，并返回任务结果
func (sm *SubtitleManager) waitTaskCompleted(taskId string, originalFileName string) taskResult {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	// 上次进度
	lastPercent := 0

	// 准备任务结果
	res := taskResult{
		fileName: originalFileName,
		taskId:   taskId,
	}

	// 轮询任务状态
	for {
		resp, err := http.Get(fmt.Sprintf("http://%s:%d/api/capability/subtitleTask?taskId=%s", config.Conf.Server.Host, config.Conf.Server.Port, taskId))
		if err != nil {
			log.GetLogger().Error("获取任务状态失败", zap.Error(err))
			time.Sleep(5 * time.Second)
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
			time.Sleep(2 * time.Second)
			continue
		}
		resp.Body.Close()

		if result.Data.ProcessPercent != lastPercent {
			progress := float64(result.Data.ProcessPercent) / 100.0
			sm.progressBar.SetValue(progress)

			// 更新进度标签
			if sm.progressLabel != nil {
				sm.progressLabel.SetText(fmt.Sprintf("%d%%", result.Data.ProcessPercent))
				sm.progressLabel.Show()
			}

			// 更新上次进度
			lastPercent = result.Data.ProcessPercent
		}

		if result.Data.ProcessPercent >= 100 {
			res.subtitleInfo = result.Data.SubtitleInfo
			res.speechDownloadURL = result.Data.SpeechDownloadURL
			break
		}

		time.Sleep(2 * time.Second)
	}

	return res
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 2
}

// pollTaskStatus 轮询任务状态
func (sm *SubtitleManager) pollTaskStatus(taskId string) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	// 记录上次进度，避免频繁更新
	lastPercent := 0

	for range ticker.C {
		resp, err := http.Get(fmt.Sprintf("http://%s:%d/api/capability/subtitleTask?taskId=%s", config.Conf.Server.Host, config.Conf.Server.Port, taskId))
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

		if result.Data.ProcessPercent != lastPercent {
			progress := float64(result.Data.ProcessPercent) / 100.0
			sm.progressBar.SetValue(progress)

			if sm.progressLabel != nil {
				sm.progressLabel.SetText(fmt.Sprintf("%d%%", result.Data.ProcessPercent))
				sm.progressLabel.Show()
			}

			// 更新上次进度
			lastPercent = result.Data.ProcessPercent
		}

		if result.Data.ProcessPercent >= 100 {
			// 对于单文件任务，创建一个任务结果并显示
			taskRes := taskResult{
				fileName:          filepath.Base(sm.videoUrl),
				subtitleInfo:      result.Data.SubtitleInfo,
				speechDownloadURL: result.Data.SpeechDownloadURL,
				taskId:            result.Data.TaskId,
			}

			sm.multiTaskResults = []taskResult{taskRes}

			sm.displayMultiTaskDownloadLinks()

			sm.tipsLabel.SetText(fmt.Sprintf("若需要查看合成的视频或者文字稿，请到软件目录下的/tasks/%s/output 目录下查看。", result.Data.TaskId))
			sm.tipsLabel.Show()

			break
		}
	}
}

// 显示多任务的下载链接
func (sm *SubtitleManager) displayMultiTaskDownloadLinks() {
	// 清空现有链接
	sm.downloadContainer.Objects = []fyne.CanvasObject{}

	if len(sm.multiTaskResults) == 0 {
		return
	}

	allTasksContainer := container.NewVBox()

	for _, taskRes := range sm.multiTaskResults {
		taskLabel := widget.NewLabelWithStyle(
			fmt.Sprintf("文件: %s", taskRes.fileName),
			fyne.TextAlignLeading,
			fyne.TextStyle{Bold: true},
		)

		taskContainer := container.NewVBox(taskLabel)

		for _, result := range taskRes.subtitleInfo {
			downloadURL := result.DownloadURL
			fileName := result.Name

			btn := widget.NewButton("下载"+fileName, func(url string) func() {
				return func() {
					go sm.downloadFile(url, filepath.Base(url))
				}
			}(downloadURL))
			btn.Importance = widget.MediumImportance
			taskContainer.Add(btn)
		}

		if taskRes.speechDownloadURL != "" {
			url := taskRes.speechDownloadURL
			ttsFileName := fmt.Sprintf("tts_%s.wav", filepath.Base(taskRes.speechDownloadURL))

			speechBtn := widget.NewButton("下载配音文件", func(u, f string) func() {
				return func() {
					go sm.downloadFile(u, f)
				}
			}(url, ttsFileName))
			speechBtn.Importance = widget.MediumImportance
			taskContainer.Add(speechBtn)
		}

		taskTip := widget.NewLabel(fmt.Sprintf("查看视频或文字稿: /tasks/%s/output", taskRes.taskId))
		taskTip.Alignment = fyne.TextAlignCenter
		taskContainer.Add(taskTip)

		if &taskRes != &sm.multiTaskResults[len(sm.multiTaskResults)-1] {
			divider := canvas.NewLine(color.NRGBA{R: 200, G: 200, B: 200, A: 128})
			divider.StrokeWidth = 1
			taskContainer.Add(divider)
		}

		allTasksContainer.Add(taskContainer)
	}

	// 所有任务容器添加到下载容器
	sm.downloadContainer.Add(allTasksContainer)
	sm.downloadContainer.Show()
}

// 下载文件的通用方法
func (sm *SubtitleManager) downloadFile(downloadURL, suggestedFileName string) {
	resp, err := http.Get(fmt.Sprintf("http://%s:%d", config.Conf.Server.Host, config.Conf.Server.Port) + downloadURL)
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

	saveDialog.SetFileName(suggestedFileName)
	saveDialog.Show()
}
