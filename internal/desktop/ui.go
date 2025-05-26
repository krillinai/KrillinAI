package desktop

import (
	"fmt"
	"image/color"
	"krillin-ai/config"
	"krillin-ai/internal/deps"
	"krillin-ai/internal/server"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"path/filepath"
	"strconv"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/data/binding"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
	"go.uber.org/zap"
)

// 创建配置界面
func CreateConfigTab(window fyne.Window) fyne.CanvasObject {
	// 创建页面标题
	pageTitle := TitleText("应用配置")

	appGroup := createAppConfigGroup()
	serverGroup := createServerConfigGroup()
	llmGroup := createLlmConfigGroup()
	transcribeGroup := createTranscribeConfigGroup()
	ttsGroup := createTtsConfigGroup()

	// 创建一个背景效果
	background := canvas.NewRectangle(color.NRGBA{R: 248, G: 250, B: 253, A: 255})

	// 添加一些视觉分隔和间距
	spacer1 := canvas.NewRectangle(color.NRGBA{R: 0, G: 0, B: 0, A: 0})
	spacer1.SetMinSize(fyne.NewSize(0, 10))
	spacer2 := canvas.NewRectangle(color.NRGBA{R: 0, G: 0, B: 0, A: 0})
	spacer2.SetMinSize(fyne.NewSize(0, 10))

	configContainer := container.NewVBox(
		container.NewPadded(pageTitle),
		spacer1,
		container.NewPadded(appGroup),
		container.NewPadded(serverGroup),
		container.NewPadded(llmGroup),
		container.NewPadded(transcribeGroup),
		container.NewPadded(ttsGroup),
		spacer2,
	)

	scroll := container.NewScroll(configContainer)

	// 使用一个Stack将背景和滚动内容组合
	configStack := container.NewStack(background, scroll)

	return container.NewPadded(configStack)
}

// 创建字幕任务界面
func CreateSubtitleTab(window fyne.Window) fyne.CanvasObject {
	sm := NewSubtitleManager(window)

	// 创建标题
	title := TitleText("视频翻译配音Video Translate & Dubbing")

	// 创建视频输入区域
	videoInputContainer := createVideoInputContainer(sm)

	// 创建字幕设置区域
	subtitleSettingsCard := createSubtitleSettingsCard(sm)

	// 创建配音设置区域
	voiceSettingsCard := createVoiceSettingsCard(sm)

	// 创建视频合成区域
	embedSettingsCard := createEmbedSettingsCard(sm)

	// 创建进度和下载区域
	progress, downloadContainer, tipsLabel := createProgressAndDownloadArea(sm)

	// 创建开始按钮
	startButton := createStartButton(window, sm, videoInputContainer, embedSettingsCard, progress, downloadContainer)
	startButtonContainer := container.NewHBox(layout.NewSpacer(), startButton, layout.NewSpacer())

	// 创建一个背景效果
	background := canvas.NewRectangle(color.NRGBA{R: 248, G: 250, B: 253, A: 255})

	// 添加一些视觉分隔和间距
	spacer1 := canvas.NewRectangle(color.NRGBA{R: 0, G: 0, B: 0, A: 0})
	spacer1.SetMinSize(fyne.NewSize(0, 10))
	spacer2 := canvas.NewRectangle(color.NRGBA{R: 0, G: 0, B: 0, A: 0})
	spacer2.SetMinSize(fyne.NewSize(0, 10))
	spacer3 := canvas.NewRectangle(color.NRGBA{R: 0, G: 0, B: 0, A: 0})
	spacer3.SetMinSize(fyne.NewSize(0, 10))

	// 创建进度区域容器
	progressArea := container.NewVBox(progress)

	// 创建主布局
	mainContent := container.NewVBox(
		container.NewPadded(title),
		spacer1,
		container.NewPadded(videoInputContainer),
		container.NewPadded(subtitleSettingsCard),
		container.NewPadded(voiceSettingsCard),
		container.NewPadded(embedSettingsCard),
		spacer2,
		container.NewPadded(startButtonContainer),
		spacer3,
		progressArea,
		downloadContainer,
		tipsLabel,
	)

	scroll := container.NewScroll(mainContent)

	// 使用一个Stack将背景和滚动内容组合
	contentStack := container.NewStack(background, scroll)

	return container.NewPadded(contentStack)
}

// 创建应用配置组
func createAppConfigGroup() *fyne.Container {
	appSegmentDurationEntry := StyledEntry("字幕分段处理时长(分钟)")
	appSegmentDurationEntry.Bind(binding.IntToString(binding.BindInt(&config.Conf.App.SegmentDuration)))
	appSegmentDurationEntry.Validator = func(s string) error {
		val, err := strconv.Atoi(s)
		if err != nil {
			return fmt.Errorf("请输入数字")
		}
		if val < 1 || val > 30 {
			return fmt.Errorf("请输入1-30之间的数字")
		}
		return nil
	}

	appTranscribeParallelNumEntry := StyledEntry("转录并行数量")
	appTranscribeParallelNumEntry.Bind(binding.IntToString(binding.BindInt(&config.Conf.App.TranscribeParallelNum)))
	appTranscribeParallelNumEntry.Validator = func(s string) error {
		val, err := strconv.Atoi(s)
		if err != nil {
			return fmt.Errorf("请输入数字")
		}
		if val < 1 || val > 10 {
			return fmt.Errorf("请输入1-10之间的数字")
		}
		return nil
	}

	appTranslateParallelNumEntry := StyledEntry("翻译并行数量")
	appTranslateParallelNumEntry.Bind(binding.IntToString(binding.BindInt(&config.Conf.App.TranslateParallelNum)))
	appTranslateParallelNumEntry.Validator = func(s string) error {
		val, err := strconv.Atoi(s)
		if err != nil {
			return fmt.Errorf("请输入数字")
		}
		if val < 1 || val > 20 {
			return fmt.Errorf("请输入1-20之间的数字")
		}
		return nil
	}

	appTranscribeMaxAttemptsEntry := StyledEntry("转录最大尝试次数")
	appTranscribeMaxAttemptsEntry.Bind(binding.IntToString(binding.BindInt(&config.Conf.App.TranscribeMaxAttempts)))
	appTranscribeMaxAttemptsEntry.Validator = func(s string) error {
		val, err := strconv.Atoi(s)
		if err != nil {
			return fmt.Errorf("请输入数字")
		}
		if val < 1 || val > 10 {
			return fmt.Errorf("请输入1-10之间的数字")
		}
		return nil
	}

	appTranslateMaxAttemptsEntry := StyledEntry("翻译最大尝试次数")
	appTranslateMaxAttemptsEntry.Bind(binding.IntToString(binding.BindInt(&config.Conf.App.TranslateMaxAttempts)))
	appTranslateMaxAttemptsEntry.Validator = func(s string) error {
		val, err := strconv.Atoi(s)
		if err != nil {
			return fmt.Errorf("请输入数字")
		}
		if val < 1 || val > 20 {
			return fmt.Errorf("请输入1-20之间的数字")
		}
		return nil
	}

	appProxyEntry := StyledEntry("网络代理地址")
	appProxyEntry.Bind(binding.BindString(&config.Conf.App.Proxy))

	appTranscribeProviderEntry := StyledSelect([]string{"openai", "fasterwhisper", "whispercpp", "whisperkit", "aliyun"}, func(s string) {
		config.Conf.Transcribe.Provider = s
	})
	appTranscribeProviderEntry.SetSelected(config.Conf.Transcribe.Provider)

	form := widget.NewForm(
		widget.NewFormItem("字幕分段处理时长(分钟) Segment duration (minutes)", appSegmentDurationEntry),
		widget.NewFormItem("转录最大并行数量 Transcribe parallel num", appTranscribeParallelNumEntry),
		widget.NewFormItem("翻译最大并行数量 Translate parallel num", appTranslateParallelNumEntry),
		widget.NewFormItem("转录最大尝试次数 Transcribe max attempts", appTranscribeMaxAttemptsEntry),
		widget.NewFormItem("翻译最大尝试次数 Translate max attempts", appTranslateMaxAttemptsEntry),
		widget.NewFormItem("网络代理地址 proxy", appProxyEntry),
		widget.NewFormItem("语音识别服务源 Transcriber provider", appTranscribeProviderEntry),
	)

	return GlassCard("应用配置 App Config", "基本参数 Basic config", form)
}

// 创建server配置组
func createServerConfigGroup() *fyne.Container {
	serverHostEntry := StyledEntry("服务器地址 Server address")
	serverHostEntry.Bind(binding.BindString(&config.Conf.Server.Host))

	serverPortEntry := StyledEntry("服务器端口 Server port")
	serverPortEntry.Bind(binding.IntToString(binding.BindInt(&config.Conf.Server.Port)))
	serverPortEntry.Validator = func(s string) error {
		val, err := strconv.Atoi(s)
		if err != nil {
			return fmt.Errorf("请输入数字")
		}
		if val < 1 || val > 65535 {
			return fmt.Errorf("请输入1-65535之间的有效端口")
		}
		return nil
	}

	form := widget.NewForm(
		widget.NewFormItem("服务器地址 Server address", serverHostEntry),
		widget.NewFormItem("服务器端口 Server port", serverPortEntry),
	)

	return GlassCard("服务器配置 Server Config", "API服务器设置 API server settings", form)
}

func createLlmConfigGroup() *fyne.Container {
	baseUrlEntry := StyledEntry("API Base URL")
	baseUrlEntry.Bind(binding.BindString(&config.Conf.Llm.BaseUrl))

	apiKeyEntry := StyledPasswordEntry("API Key")
	apiKeyEntry.Bind(binding.BindString(&config.Conf.Llm.ApiKey))

	modelEntry := StyledEntry("模型名称 Model name")
	modelEntry.Bind(binding.BindString(&config.Conf.Llm.Model))

	form := widget.NewForm(
		widget.NewFormItem("API Base URL", baseUrlEntry),
		widget.NewFormItem("API Key", apiKeyEntry),
		widget.NewFormItem("模型名称 Model name", modelEntry),
	)
	return GlassCard("LLM 配置 LLM Config", "LLM配置 LLM config", form)
}

func createTranscribeConfigGroup() *fyne.Container {
	providerOptions := []string{"openai", "fasterwhisper", "whisperkit", "whispercpp", "aliyun"}
	providerSelect := widget.NewSelect(providerOptions, func(value string) {
		config.Conf.Transcribe.Provider = value
	})
	providerSelect.SetSelected(config.Conf.Transcribe.Provider)

	openaiBaseUrlEntry := StyledEntry("API Base URL")
	openaiBaseUrlEntry.Bind(binding.BindString(&config.Conf.Transcribe.Openai.BaseUrl))
	openaiApiKeyEntry := StyledPasswordEntry("API Key")
	openaiApiKeyEntry.Bind(binding.BindString(&config.Conf.Transcribe.Openai.ApiKey))
	openaiModelEntry := StyledEntry("模型名称 Model name")
	openaiModelEntry.Bind(binding.BindString(&config.Conf.Transcribe.Openai.Model))

	fasterWhisperModelEntry := StyledEntry("模型名称 Model name")
	fasterWhisperModelEntry.Bind(binding.BindString(&config.Conf.Transcribe.Fasterwhisper.Model))

	whisperKitModelEntry := StyledEntry("模型名称 Model name")
	whisperKitModelEntry.Bind(binding.BindString(&config.Conf.Transcribe.Whisperkit.Model))

	whisperCppModelEntry := StyledEntry("模型名称 Model name")
	whisperCppModelEntry.Bind(binding.BindString(&config.Conf.Transcribe.Whispercpp.Model))

	aliyunOssKeyIdEntry := StyledEntry("阿里云 Aliyun Access Key ID")
	aliyunOssKeyIdEntry.Bind(binding.BindString(&config.Conf.Transcribe.Aliyun.Oss.AccessKeyId))
	aliyunOssKeySecretEntry := StyledPasswordEntry("阿里云 Aliyun Access Key Secret")
	aliyunOssKeySecretEntry.Bind(binding.BindString(&config.Conf.Transcribe.Aliyun.Oss.AccessKeySecret))
	aliyunOssBucketEntry := StyledEntry("阿里云 Aliyun OSS Bucket名称")
	aliyunOssBucketEntry.Bind(binding.BindString(&config.Conf.Transcribe.Aliyun.Oss.Bucket))

	aliyunSpeechKeyIdEntry := StyledEntry("阿里云 Aliyun Speech Access Key ID")
	aliyunSpeechKeyIdEntry.Bind(binding.BindString(&config.Conf.Transcribe.Aliyun.Speech.AccessKeyId))
	aliyunSpeechKeySecretEntry := StyledPasswordEntry("阿里云 Aliyun Speech Access Key Secret")
	aliyunSpeechKeySecretEntry.Bind(binding.BindString(&config.Conf.Transcribe.Aliyun.Speech.AccessKeySecret))
	aliyunSpeechAppKeyEntry := StyledEntry("阿里云 Aliyun Speech App Key")
	aliyunSpeechAppKeyEntry.Bind(binding.BindString(&config.Conf.Transcribe.Aliyun.Speech.AppKey))

	form := widget.NewForm(
		widget.NewFormItem("提供商 Provider", providerSelect),

		widget.NewFormItem("OpenAI Base URL", openaiBaseUrlEntry),
		widget.NewFormItem("OpenAI API Key", openaiApiKeyEntry),
		widget.NewFormItem("OpenAI 模型 Model", openaiModelEntry),

		widget.NewFormItem("FasterWhisper 模型 Model", fasterWhisperModelEntry),

		widget.NewFormItem("WhisperKit 模型 Model", whisperKitModelEntry),

		widget.NewFormItem("WhisperCpp 模型 Model", whisperCppModelEntry),

		widget.NewFormItem("阿里云 Aliyun OSS Access Key ID", aliyunOssKeyIdEntry),
		widget.NewFormItem("阿里云 Aliyun OSS Access Key Secret", aliyunOssKeySecretEntry),
		widget.NewFormItem("阿里云 Aliyun OSS Bucket Name", aliyunOssBucketEntry),

		widget.NewFormItem("阿里云语音 Aliyun Speech Access Key ID", aliyunSpeechKeyIdEntry),
		widget.NewFormItem("阿里云语音 Aliyun Speech Access Key Secret", aliyunSpeechKeySecretEntry),
		widget.NewFormItem("阿里云语音 Aliyun Speech App Key", aliyunSpeechAppKeyEntry),
	)

	return GlassCard("语音识别配置 Transcribe Config", "语音识别配置 Transcribe config", form)
}

func createTtsConfigGroup() *fyne.Container {
	providerOptions := []string{"openai", "aliyun"}
	providerSelect := widget.NewSelect(providerOptions, func(value string) {
		config.Conf.Tts.Provider = value
	})
	providerSelect.SetSelected(config.Conf.Tts.Provider)

	openaiBaseUrlEntry := StyledEntry("API Base URL")
	openaiBaseUrlEntry.Bind(binding.BindString(&config.Conf.Tts.Openai.BaseUrl))
	openaiApiKeyEntry := StyledPasswordEntry("API Key")
	openaiApiKeyEntry.Bind(binding.BindString(&config.Conf.Tts.Openai.ApiKey))
	openaiModelEntry := StyledEntry("模型名称 Model name")
	openaiModelEntry.Bind(binding.BindString(&config.Conf.Tts.Openai.Model))

	aliyunOssKeyIdEntry := StyledEntry("阿里云 Aliyun Access Key ID")
	aliyunOssKeyIdEntry.Bind(binding.BindString(&config.Conf.Tts.Aliyun.Oss.AccessKeyId))
	aliyunOssKeySecretEntry := StyledPasswordEntry("阿里云 Aliyun Access Key Secret")
	aliyunOssKeySecretEntry.Bind(binding.BindString(&config.Conf.Tts.Aliyun.Oss.AccessKeySecret))
	aliyunOssBucketEntry := StyledEntry("阿里云 Aliyun OSS Bucket名称")
	aliyunOssBucketEntry.Bind(binding.BindString(&config.Conf.Tts.Aliyun.Oss.Bucket))

	aliyunSpeechKeyIdEntry := StyledEntry("阿里云 Aliyun Speech Access Key ID")
	aliyunSpeechKeyIdEntry.Bind(binding.BindString(&config.Conf.Tts.Aliyun.Speech.AccessKeyId))
	aliyunSpeechKeySecretEntry := StyledPasswordEntry("阿里云 Aliyun Speech Access Key Secret")
	aliyunSpeechKeySecretEntry.Bind(binding.BindString(&config.Conf.Tts.Aliyun.Speech.AccessKeySecret))
	aliyunSpeechAppKeyEntry := StyledEntry("阿里云 Aliyun Speech App Key")
	aliyunSpeechAppKeyEntry.Bind(binding.BindString(&config.Conf.Tts.Aliyun.Speech.AppKey))

	form := widget.NewForm(
		widget.NewFormItem("提供商 Provider", providerSelect),

		widget.NewFormItem("OpenAI Base URL", openaiBaseUrlEntry),
		widget.NewFormItem("OpenAI API Key", openaiApiKeyEntry),
		widget.NewFormItem("OpenAI 模型 Model", openaiModelEntry),

		widget.NewFormItem("阿里云 Aliyun OSS Access Key ID", aliyunOssKeyIdEntry),
		widget.NewFormItem("阿里云 Aliyun OSS Access Key Secret", aliyunOssKeySecretEntry),
		widget.NewFormItem("阿里云 Aliyun OSS Bucket", aliyunOssBucketEntry),

		widget.NewFormItem("阿里云 Aliyun Speech Access Key ID", aliyunSpeechKeyIdEntry),
		widget.NewFormItem("阿里云 Aliyun  Speech Access Key Secret", aliyunSpeechKeySecretEntry),
		widget.NewFormItem("阿里云 Aliyun Speech App Key", aliyunSpeechAppKeyEntry),
	)

	return GlassCard("文本转语音配置 TTS Config", "文本转语音配置 TTS config", form)
}

// 创建视频输入容器
func createVideoInputContainer(sm *SubtitleManager) *fyne.Container {
	// 视频输入方式选择
	inputTypeRadio := widget.NewRadioGroup([]string{"本地视频 Local video", "视频链接 Video link"}, nil)
	inputTypeRadio.Horizontal = true
	inputTypeContainer := container.NewHBox(
		widget.NewLabel("输入方式 Input type:"),
		inputTypeRadio,
	)

	// 视频链接输入框
	urlEntry := StyledEntry("请输入视频链接Please enter the video link")
	urlEntry.Hide()
	urlEntry.OnChanged = func(text string) {
		sm.SetVideoUrl(text)
	}

	// 视频选择按钮（支持多文件选择）
	selectButton := PrimaryButton("选择视频文件 Choose video files", theme.FolderOpenIcon(), sm.ShowFileDialog)

	selectedVideoLabel := widget.NewLabel("")
	selectedVideoLabel.Hide()

	// 设置视频选择回调
	sm.SetVideoSelectedCallback(func(path string) { // 设置视频地址+控制信息展示
		if path != "" {
			sm.SetVideoUrl(path)
			selectedVideoLabel.SetText("已选择Chosen: " + filepath.Base(path))
			selectedVideoLabel.Show()
		} else {
			selectedVideoLabel.Hide()
		}
	})

	// 设置多视频选择回调
	sm.SetVideosSelectedCallback(func(paths []string) {
		if len(paths) > 0 {
			// 设置第一个视频的URL
			sm.SetVideoUrl(paths[0])

			// 显示已选择的文件数量
			fileNames := make([]string, 0, len(paths))
			for _, path := range paths {
				fileNames = append(fileNames, filepath.Base(path))
			}

			// 构建文件列表，每行显示一个文件
			displayText := fmt.Sprintf("已选择 %d 个文件:\n", len(paths))
			for i, name := range fileNames {
				displayText += fmt.Sprintf("%d. %s\n", i+1, name)
			}

			selectedVideoLabel.SetText(displayText)
			selectedVideoLabel.Show()
		} else {
			selectedVideoLabel.Hide()
		}
	})

	// 视频输入容器
	videoInputContainer := container.NewVBox()
	videoInputContainer.Objects = []fyne.CanvasObject{selectButton, selectedVideoLabel}

	// 切换输入方式
	inputTypeRadio.SetSelected("本地视频 Local video")
	inputTypeRadio.OnChanged = func(value string) {
		if value == "本地视频 Local video" {
			urlEntry.Hide()
			selectButton.Show()
			selectedVideoLabel.Show()
			videoInputContainer.Objects = []fyne.CanvasObject{selectButton, selectedVideoLabel}
			sm.SetVideoUrl("")
		} else {
			selectButton.Hide()
			selectedVideoLabel.Hide()
			urlEntry.Show()
			videoInputContainer.Objects = []fyne.CanvasObject{urlEntry}
		}
		videoInputContainer.Refresh()
	}

	// 创建容器
	content := container.NewVBox(
		container.NewPadded(inputTypeContainer),
		container.NewPadded(videoInputContainer),
	)

	return GlassCard("1. 视频源设置 Video Source", "选择视频和语言 Choose video & language", content)
}

// 创建字幕设置卡片
func createSubtitleSettingsCard(sm *SubtitleManager) *fyne.Container {
	positionSelect := widget.NewSelect([]string{
		"翻译后字幕在上方 Translation subtitle on top",
		"翻译后字幕在下方 Translation subtitle on bottom",
	}, func(value string) {
		if value == "翻译后字幕在上方 Translation subtitle on top" {
			sm.SetBilingualPosition(1)
		} else {
			sm.SetBilingualPosition(2)
		}
	})
	positionSelect.SetSelected("翻译后字幕在上方 Translation subtitle on top")

	bilingualCheck := widget.NewCheck("启用双语字幕 Enable bilingual subtitles", func(checked bool) {
		sm.SetBilingualEnabled(checked)
		if checked {
			positionSelect.Enable()
		} else {
			positionSelect.Disable()
		}
	})
	bilingualCheck.SetChecked(true)

	var targetSelectOptions []string
	targetLangMap := make(map[string]string)
	for code, name := range types.StandardLanguageCode2Name {
		targetSelectOptions = append(targetSelectOptions, name)
		targetLangMap[name] = string(code)
	}
	targetLangSelector := StyledSelect(targetSelectOptions, func(value string) {
		sm.SetTargetLang(targetLangMap[value])
	})

	langContainer := container.NewVBox(
		container.NewHBox(
			widget.NewLabel("源语言 Origin language:"),
			StyledSelect([]string{
				"简体中文", "English", "日文", "土耳其语", "德语", "韩语", "俄语", "Bahasa Melayu",
			}, func(value string) {
				sourceLangMap := map[string]string{
					"简体中文": "zh_cn", "English": "en", "日文": "ja",
					"土耳其语": "tr", "德语": "de", "韩语": "ko", "俄语": "ru",
					"Bahasa Melayu": "ms",
				}
				sm.SetSourceLang(sourceLangMap[value])
			}),
		),
		container.NewHBox(
			widget.NewLabel("目标语言 Target language:"),
			targetLangSelector,
		),
	)

	// 设置默认语言
	langContainer.Objects[0].(*fyne.Container).Objects[1].(*widget.Select).SetSelected("English")
	langContainer.Objects[1].(*fyne.Container).Objects[1].(*widget.Select).SetSelected("简体中文")

	fillerCheck := widget.NewCheck("启用语气词过滤 Use modal filter", func(checked bool) {
		sm.SetFillerFilter(checked)
	})
	fillerCheck.SetChecked(true)

	content := container.NewVBox(
		container.NewHBox(bilingualCheck, fillerCheck),
		langContainer,
		positionSelect,
	)

	return StyledCard("2. 字幕设置 Subtitle setting", content)
}

// 创建配音设置卡片
func createVoiceSettingsCard(sm *SubtitleManager) *fyne.Container {
	voiceCodeEntry := widget.NewEntry()
	voiceCodeEntry.SetPlaceHolder("输入声音代码 Enter voice code")
	voiceCodeEntry.OnChanged = func(text string) {
		sm.SetTtsVoiceCode(text)
	}
	voiceCodeEntry.Disable()

	// todo 限制为仅阿里云
	audioSampleButton := SecondaryButton("选择音色克隆样本(仅支持阿里云tts) Choose voice clone sample(Aliyun tts only)", theme.MediaMusicIcon(), sm.ShowAudioFileDialog)
	audioSampleButton.Disable()

	voiceoverCheck := widget.NewCheck("启用配音 Enable dubbing", func(checked bool) {
		sm.SetVoiceoverEnabled(checked)
		if checked {
			voiceCodeEntry.Enable()
			audioSampleButton.Enable()
		} else {
			voiceCodeEntry.Disable()
			audioSampleButton.Disable()
		}
	})

	grid := container.NewVBox(
		container.NewHBox(voiceoverCheck),
		container.NewHBox(container.NewBorder(voiceCodeEntry, nil, nil, audioSampleButton)),
	)

	return StyledCard("3. 配音设置 Dubbing setting", grid)
}

// 视频合成卡片
func createEmbedSettingsCard(sm *SubtitleManager) *fyne.Container {
	embedCheck := widget.NewCheck("合成视频 Composite video", nil)

	// 创建视频类型选择
	embedTypeSelect := StyledSelect([]string{
		"横屏视频 Landscape video", "竖屏视频 Portrait video", "横屏+竖屏视频 Landscape+Portrait video",
	}, nil)
	embedTypeSelect.Disable()

	// 创建标题输入区域
	mainTitleEntry := StyledEntry("请输入主标题 Enter main title")
	subTitleEntry := StyledEntry("请输入副标题 Enter sub title")

	titleInputContainer := container.NewVBox(
		container.NewGridWithColumns(2,
			widget.NewLabel("主标题 Main title:"),
			mainTitleEntry,
		),
		container.NewGridWithColumns(2,
			widget.NewLabel("副标题 Sub title:"),
			subTitleEntry,
		),
	)
	titleInputContainer.Hide()

	// 设置复选框行为
	embedCheck.OnChanged = func(checked bool) {
		if checked {
			embedTypeSelect.Enable()
			embedTypeSelect.SetSelected("横屏视频 Landscape video")
		} else {
			embedTypeSelect.Disable()
			sm.SetEmbedSubtitle("none")
		}
	}

	// 更新标题输入区域的显示状态
	embedTypeSelect.OnChanged = func(value string) {
		switch value {
		case "横屏视频 Landscape video":
			titleInputContainer.Hide()
			sm.SetEmbedSubtitle("horizontal")
		case "竖屏视频 Portrait video":
			titleInputContainer.Show()
			sm.SetEmbedSubtitle("vertical")
		case "横屏+竖屏视频 Landscape+Portrait video":
			titleInputContainer.Show()
			sm.SetEmbedSubtitle("all")
		}
	}

	// 创建顶部控制区域
	topContainer := container.NewHBox(embedCheck, embedTypeSelect)

	// 创建主容器
	mainContainer := container.NewVBox(
		topContainer,
		container.NewPadded(titleInputContainer),
	)

	return StyledCard("视频合成设置 Subtitle embed setting", mainContainer)
}

// 创建进度和下载区域
func createProgressAndDownloadArea(sm *SubtitleManager) (*widget.ProgressBar, *fyne.Container, *fyne.Container) {
	// 创建进度条
	progress := widget.NewProgressBar()
	progress.Hide()

	//进度百分比标签
	percentLabel := widget.NewLabel("0%")
	percentLabel.Hide()
	percentLabel.Alignment = fyne.TextAlignTrailing

	// 进度条容器
	progressContainer := container.NewBorder(nil, nil, nil, percentLabel, progress)
	progressContainer.Hide()

	// 添加半透明背景和阴影
	progressBg := canvas.NewRectangle(color.NRGBA{R: 240, G: 245, B: 250, A: 230})
	progressBg.SetMinSize(fyne.NewSize(0, 40))
	progressBg.CornerRadius = 8

	progressShadow := canvas.NewRectangle(color.NRGBA{R: 0, G: 0, B: 0, A: 20})
	progressShadow.Move(fyne.NewPos(2, 2))
	progressShadow.SetMinSize(fyne.NewSize(0, 40))
	progressShadow.CornerRadius = 8

	progressWithBg := container.NewStack(
		progressShadow,
		progressBg,
		container.NewPadded(progressContainer),
	)
	progressWithBg.Hide()

	// 设置进度条和标签
	sm.SetProgressBar(progress)
	sm.SetProgressLabel(percentLabel)

	// 创建下载容器背景
	downloadBg := canvas.NewRectangle(color.NRGBA{R: 240, G: 250, B: 255, A: 230})
	downloadBg.CornerRadius = 10

	// 创建下载容器
	downloadContainer := container.NewVBox()
	downloadContainer.Hide()
	sm.SetDownloadContainer(downloadContainer)

	// 包装下载容器和背景
	downloadWithBg := container.NewStack(
		downloadBg,
		container.NewPadded(downloadContainer),
	)
	downloadWithBg.Hide()

	// 创建提示标签
	tipsLabel := widget.NewLabel("")
	tipsLabel.Hide()
	tipsLabel.Alignment = fyne.TextAlignCenter
	tipsLabel.Wrapping = fyne.TextWrapWord
	sm.SetTipsLabel(tipsLabel)

	tipsBg := canvas.NewRectangle(color.NRGBA{R: 255, G: 250, B: 230, A: 200})
	tipsBg.CornerRadius = 6

	tipsWithBg := container.NewStack(
		tipsBg,
		container.NewPadded(tipsLabel),
	)
	tipsWithBg.Hide()

	return progress, downloadWithBg, tipsWithBg
}

// 创建开始按钮
func createStartButton(window fyne.Window, sm *SubtitleManager, videoInputContainer *fyne.Container, embedSettingsCard *fyne.Container, progress *widget.ProgressBar, downloadContainer *fyne.Container) *widget.Button {
	btn := widget.NewButtonWithIcon("开始任务 Start task", theme.MediaPlayIcon(), nil)
	btn.Importance = widget.HighImportance

	btn.OnTapped = func() {
		// 按钮动画效果替换为简单的刷新
		originalImportance := btn.Importance
		btn.Importance = widget.DangerImportance
		btn.Refresh()

		go func() {
			time.Sleep(300 * time.Millisecond)
			btn.Importance = originalImportance
			btn.Refresh()
		}()

		var mainTitle, subTitle string

		if embedSettingsCard != nil && len(embedSettingsCard.Objects) > 1 {
			if titleContainer, ok := embedSettingsCard.Objects[1].(*fyne.Container); ok && titleContainer != nil && len(titleContainer.Objects) >= 2 {
				// 获取主标题
				if mainTitleRow, ok := titleContainer.Objects[0].(*fyne.Container); ok && mainTitleRow != nil && len(mainTitleRow.Objects) >= 2 {
					if mainTitleEntry, ok := mainTitleRow.Objects[1].(*widget.Entry); ok {
						mainTitle = mainTitleEntry.Text
					}
				}

				// 获取副标题
				if subTitleRow, ok := titleContainer.Objects[1].(*fyne.Container); ok && subTitleRow != nil && len(subTitleRow.Objects) >= 2 {
					if subTitleEntry, ok := subTitleRow.Objects[1].(*widget.Entry); ok {
						subTitle = subTitleEntry.Text
					}
				}
			}
		}

		sm.SetVerticalTitles(mainTitle, subTitle)

		// 显示进度条并隐藏下载容器
		progress.Show()
		sm.progressBar.SetValue(0) // 直接访问进度条
		downloadContainer.Hide()

		// 检查是否有视频URL
		if sm.GetVideoUrl() == "" {
			inputType := "本地视频" // 默认值

			if videoInputContainer != nil && len(videoInputContainer.Objects) > 0 {
				for i := 0; i < len(videoInputContainer.Objects); i++ {
					// 如果对象是Container，查找其中的RadioGroup
					if container, ok := videoInputContainer.Objects[i].(*fyne.Container); ok {
						for j := 0; j < len(container.Objects); j++ {
							if radio, ok := container.Objects[j].(*widget.RadioGroup); ok {
								inputType = radio.Selected
								break
							}
						}
					}
				}
			}

			if inputType == "本地视频" {
				dialog.ShowError(fmt.Errorf("请先选择视频文件"), window)
			} else {
				dialog.ShowError(fmt.Errorf("请输入视频链接"), window)
			}
			progress.Hide()
			return
		}

		// 桌面端的启动之前要check config
		err := config.CheckConfig()
		if err != nil {
			dialog.ShowError(fmt.Errorf("配置不正确: %v", err), window)
			log.GetLogger().Error("配置不正确", zap.Error(err))
			progress.Hide()
			return
		}

		err = deps.CheckDependency()
		if err != nil {
			dialog.ShowError(fmt.Errorf("依赖环境准备失败: %v", err), window)
			log.GetLogger().Error("依赖环境准备失败", zap.Error(err))
			progress.Hide()
			return
		}
		// 隐藏开始按钮
		btn.Hide()

		if config.ConfigBackup != config.Conf {
			// 重启后端服务以刷新配置
			if err = server.StopBackend(); err != nil {
				dialog.ShowError(fmt.Errorf("停止后端服务失败: %v", err), window)
				log.GetLogger().Error("停止后端服务失败", zap.Error(err))
				progress.Hide()
				return
			}

			go func() {
				err := server.StartBackend()
				if err != nil {
					dialog.ShowError(fmt.Errorf("启动后端服务失败: %v", err), window)
					log.GetLogger().Error("启动后端服务失败", zap.Error(err))
					progress.Hide()
					return
				}
			}()

			// 延迟一段时间以确保后端服务启动
			time.Sleep(1 * time.Second)
			config.ConfigBackup = config.Conf
		}

		if err = sm.StartTask(); err != nil {
			dialog.ShowError(err, window)
			progress.Hide()
			return
		}

		// 监听进度条
		go func() {
			for {
				time.Sleep(1 * time.Second)
				if sm.progressBar.Value < 1 {
					continue
				}
				// 多任务时防抖
				time.Sleep(1 * time.Second)
				if sm.progressBar.Value < 1 {
					continue
				}
				break
			}
			// 显示下载按钮
			btn.Show()
			// 显示下载容器
			downloadContainer.Show()
		}()
		sm.progressBar.Refresh()
	}

	return btn
}
