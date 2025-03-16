package desktop

import (
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/deps"
	"krillin-ai/log"
	"path/filepath"
	"strconv"

	"fyne.io/fyne/v2/data/binding"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
	"go.uber.org/zap"
)

// 创建配置界面
func CreateConfigTab(window fyne.Window) fyne.CanvasObject {
	// app 配置
	appGroup := createAppConfigGroup()
	localModelGroup := createLocalModelGroup()
	openaiGroup := createOpenAIConfigGroup()
	whisperGroup := createWhisperConfigGroup()
	aliyunOssGroup := createAliyunOSSConfigGroup()
	aliyunSpeechGroup := createAliyunSpeechConfigGroup()
	aliyunBailianGroup := createAliyunBailianConfigGroup()

	// 保存按钮
	saveButton := createSaveButton(window)

	// 创建滚动容器
	scroll := container.NewScroll(container.NewVBox(
		appGroup,
		localModelGroup,
		openaiGroup,
		whisperGroup,
		aliyunOssGroup,
		aliyunSpeechGroup,
		aliyunBailianGroup,
		saveButton,
	))

	return container.NewBorder(nil, nil, nil, nil, scroll)
}

// 创建字幕任务界面
func CreateSubtitleTab(window fyne.Window) fyne.CanvasObject {
	sm := NewSubtitleManager(window)

	// 创建标题
	title := widget.NewLabelWithStyle("视频字幕生成", fyne.TextAlignCenter, fyne.TextStyle{Bold: true})

	// 创建视频输入区域
	videoInputContainer := createVideoInputContainer(sm)

	// 创建字幕设置区域
	subtitleSettingsCard := createSubtitleSettingsCard(sm)

	// 创建配音设置区域
	voiceSettingsCard := createVoiceSettingsCard(sm)

	// 创建字幕嵌入设置区域
	embedSettingsCard := createEmbedSettingsCard(sm)

	// 创建进度和下载区域
	progress, downloadContainer, tipsLabel := createProgressAndDownloadArea(sm)

	// 创建开始按钮
	startButton := createStartButton(window, sm, videoInputContainer, embedSettingsCard, progress, downloadContainer)

	// 创建主布局
	mainContent := container.NewVBox(
		container.NewPadded(title),
		container.NewVBox(
			videoInputContainer,
			subtitleSettingsCard,
			voiceSettingsCard,
			embedSettingsCard,
			container.NewPadded(startButton),
			progress,
			downloadContainer,
			tipsLabel,
		),
	)

	return container.NewPadded(mainContent)
}

// 创建应用配置组
func createAppConfigGroup() *widget.Card {
	appSegmentDurationEntry := widget.NewEntry()
	appSegmentDurationEntry.SetPlaceHolder("字幕分段处理时长(分钟)")
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

	appTranslateParallelNumEntry := widget.NewEntry()
	appTranslateParallelNumEntry.SetPlaceHolder("翻译并行数量")
	appTranslateParallelNumEntry.Bind(binding.IntToString(binding.BindInt(&config.Conf.App.TranslateParallelNum)))
	appTranslateParallelNumEntry.Validator = func(s string) error {
		val, err := strconv.Atoi(s)
		if err != nil {
			return fmt.Errorf("请输入数字")
		}
		if val < 1 || val > 10 {
			return fmt.Errorf("请输入1-10之间的数字")
		}
		return nil
	}

	appProxyEntry := widget.NewEntry()
	appProxyEntry.SetPlaceHolder("网络代理地址")
	appProxyEntry.Bind(binding.BindString(&config.Conf.App.Proxy))
	//appProxyEntry.Text = config.Conf.App.Proxy
	//appProxyEntry.OnChanged = func(text string) {
	//	config.Conf.App.Proxy = text
	//}

	appTranscribeProviderEntry := widget.NewSelect([]string{"openai", "fasterwhisper", "whisperkit", "aliyun"}, func(s string) {
		config.Conf.App.TranscribeProvider = s
	})
	appTranscribeProviderEntry.SetSelected(config.Conf.App.TranscribeProvider)

	appLlmProviderEntry := widget.NewSelect([]string{"openai", "aliyun"}, func(s string) {
		config.Conf.App.LlmProvider = s
	})
	appLlmProviderEntry.SetSelected(config.Conf.App.LlmProvider)

	return widget.NewCard("应用配置", "", container.NewVBox(
		widget.NewForm(
			widget.NewFormItem("字幕分段处理时长(分钟)", appSegmentDurationEntry),
			widget.NewFormItem("翻译并行数量", appTranslateParallelNumEntry),
			widget.NewFormItem("网络代理地址", appProxyEntry),
			widget.NewFormItem("语音识别服务源", appTranscribeProviderEntry),
			widget.NewFormItem("LLM服务源", appLlmProviderEntry),
		),
	))
}

// 创建本地模型配置组
func createLocalModelGroup() *widget.Card {
	localModelFasterwhisperEntry := widget.NewSelect([]string{"tiny", "medium", "large-v2"}, func(s string) {
		config.Conf.LocalModel.Fasterwhisper = s
	})
	localModelFasterwhisperEntry.SetSelected(config.Conf.LocalModel.Fasterwhisper)

	localModelWhisperkitEntry := widget.NewSelect([]string{"large-v2"}, func(s string) {
		config.Conf.LocalModel.Whisperkit = s
	})
	localModelWhisperkitEntry.SetSelected(config.Conf.LocalModel.Whisperkit)

	return widget.NewCard("本地模型配置", "", container.NewVBox(
		widget.NewForm(
			widget.NewFormItem("Fasterwhisper模型", localModelFasterwhisperEntry),
			widget.NewFormItem("Whisperkit模型", localModelWhisperkitEntry),
		),
	))
}

// 创建视频输入容器
func createVideoInputContainer(sm *SubtitleManager) fyne.CanvasObject {
	// 视频输入方式选择
	inputTypeContainer := container.NewHBox(
		widget.NewLabel("输入方式:"),
		widget.NewRadioGroup([]string{"本地视频", "视频链接"}, nil),
	)

	// 视频链接输入框
	urlEntry := widget.NewEntry()
	urlEntry.SetPlaceHolder("请输入视频链接")
	urlEntry.Hide()
	urlEntry.OnChanged = func(text string) {
		sm.SetVideoUrl(text)
	}

	// 视频选择按钮
	selectButton := widget.NewButtonWithIcon("选择视频文件", theme.FolderOpenIcon(), sm.ShowFileDialog)
	selectedVideoLabel := widget.NewLabel("")
	selectedVideoLabel.Hide()

	// 设置视频选择回调
	sm.SetVideoSelectedCallback(func(path string) { // 设置视频地址+控制信息展示
		if path != "" {
			sm.SetVideoUrl(path)
			selectedVideoLabel.SetText("已选择: " + filepath.Base(path))
			selectedVideoLabel.Show()
		} else {
			selectedVideoLabel.Hide()
		}
	})

	// 视频输入容器
	videoInputContainer := container.NewVBox()
	videoInputContainer.Objects = []fyne.CanvasObject{selectButton, selectedVideoLabel}

	// 切换输入方式
	inputTypeContainer.Objects[1].(*widget.RadioGroup).OnChanged = func(value string) {
		if value == "本地视频" {
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

	// 创建语言选择容器
	langContainer := container.NewGridWithColumns(2,
		container.NewHBox(
			widget.NewLabel("源语言:"),
			widget.NewSelect([]string{
				"简体中文", "英文", "日文", "土耳其语", "德语", "韩语", "俄语",
			}, func(value string) {
				langMap := map[string]string{
					"简体中文": "zh_cn", "英文": "en", "日文": "ja",
					"土耳其语": "tr", "德语": "de", "韩语": "ko", "俄语": "ru",
				}
				sm.SetSourceLang(langMap[value])
			}),
		),
		container.NewHBox(
			widget.NewLabel("目标语言:"),
			widget.NewSelect([]string{
				"简体中文", "繁体中文", "英语", "日语", "韩语", "法语", "德语", "俄语",
				"西班牙语", "葡萄牙语", "意大利语", "阿拉伯语", "土耳其语",
			}, func(value string) {
				langMap := map[string]string{
					"简体中文": "zh_cn", "繁体中文": "zh_tw", "英语": "en",
					"日语": "ja", "韩语": "ko", "法语": "fr", "德语": "de",
					"俄语": "ru", "西班牙语": "es", "葡萄牙语": "pt",
					"意大利语": "it", "阿拉伯语": "ar", "土耳其语": "tr",
				}
				sm.SetTargetLang(langMap[value])
			}),
		),
	)

	// 设置默认语言
	langContainer.Objects[0].(*fyne.Container).Objects[1].(*widget.Select).SetSelected("简体中文")
	langContainer.Objects[1].(*fyne.Container).Objects[1].(*widget.Select).SetSelected("简体中文")

	// 创建卡片容器
	return widget.NewCard("视频源设置", "", container.NewVBox(
		inputTypeContainer,
		videoInputContainer,
		langContainer,
	))
}

// 创建字幕设置卡片
func createSubtitleSettingsCard(sm *SubtitleManager) *widget.Card {
	return widget.NewCard("字幕设置", "",
		container.NewVBox(
			container.NewGridWithColumns(2,
				container.NewHBox(
					widget.NewCheck("启用双语字幕", func(checked bool) {
						sm.SetBilingualEnabled(checked)
					}),
					widget.NewSelect([]string{
						"翻译后字幕在上方", "翻译后字幕在下方",
					}, func(value string) {
						if value == "翻译后字幕在上方" {
							sm.SetBilingualPosition(1)
						} else {
							sm.SetBilingualPosition(2)
						}
					}),
				),
				widget.NewCheck("启用语气词过滤", func(checked bool) {
					sm.SetFillerFilter(checked)
				}),
			),
		),
	)
}

// 创建配音设置卡片
func createVoiceSettingsCard(sm *SubtitleManager) *widget.Card {
	return widget.NewCard("配音设置", "",
		container.NewVBox(
			container.NewGridWithColumns(2,
				container.NewHBox(
					widget.NewCheck("启用配音", func(checked bool) {
						sm.SetVoiceoverEnabled(checked)
					}),
					widget.NewSelect([]string{"男声", "女声"}, func(value string) {
						if value == "男声" {
							sm.SetVoiceoverGender(2)
						} else {
							sm.SetVoiceoverGender(1)
						}
					}),
				),
				widget.NewButtonWithIcon("选择音色克隆样本", theme.MediaMusicIcon(), sm.ShowAudioFileDialog),
			),
		),
	)
}

// 创建字幕嵌入设置卡片
func createEmbedSettingsCard(sm *SubtitleManager) *widget.Card {
	embedTypeSelect := widget.NewSelect([]string{
		"横屏视频", "竖屏视频", "横屏+竖屏视频",
	}, func(value string) {
		switch value {
		case "横屏视频":
			sm.SetEmbedSubtitle("horizontal")
		case "竖屏视频":
			sm.SetEmbedSubtitle("vertical")
		case "横屏+竖屏视频":
			sm.SetEmbedSubtitle("all")
		}
	})
	embedTypeSelect.Disable()

	// 创建标题输入区域
	titleInputContainer := container.NewVBox(
		container.NewGridWithColumns(2,
			widget.NewLabel("主标题:"),
			widget.NewMultiLineEntry(),
		),
		container.NewGridWithColumns(2,
			widget.NewLabel("副标题:"),
			widget.NewMultiLineEntry(),
		),
	)
	titleInputContainer.Hide()

	card := widget.NewCard("字幕嵌入设置", "",
		container.NewVBox(
			container.NewHBox(
				widget.NewCheck("合成字幕嵌入视频", func(checked bool) {
					if checked {
						embedTypeSelect.Enable()
						embedTypeSelect.SetSelected("横屏视频")
						sm.SetEmbedSubtitle("horizontal")
						if embedTypeSelect.Selected == "竖屏视频" || embedTypeSelect.Selected == "横屏+竖屏视频" {
							titleInputContainer.Show()
						}
					} else {
						embedTypeSelect.Disable()
						sm.SetEmbedSubtitle("none")
						titleInputContainer.Hide()
					}
				}),
				embedTypeSelect,
			),
			titleInputContainer,
		),
	)

	// 更新标题输入区域的显示状态
	embedTypeSelect.OnChanged = func(value string) {
		if value == "竖屏视频" || value == "横屏+竖屏视频" {
			titleInputContainer.Show()
		} else {
			titleInputContainer.Hide()
		}
	}

	return card
}

// 创建进度和下载区域
func createProgressAndDownloadArea(sm *SubtitleManager) (*widget.ProgressBar, *fyne.Container, *widget.Label) {
	progress := widget.NewProgressBar()
	progress.Hide()
	sm.SetProgressBar(progress)

	downloadContainer := container.NewVBox()
	downloadContainer.Hide()
	sm.SetDownloadContainer(downloadContainer)

	tipsLabel := widget.NewLabel("")
	tipsLabel.Hide()
	sm.SetTipsLabel(tipsLabel)

	return progress, downloadContainer, tipsLabel
}

// 创建开始按钮
func createStartButton(window fyne.Window, sm *SubtitleManager, videoInputContainer fyne.CanvasObject, embedSettingsCard *widget.Card, progress *widget.ProgressBar, downloadContainer *fyne.Container) *widget.Button {
	return widget.NewButtonWithIcon("开始任务", theme.MediaPlayIcon(), func() {
		sm.SetVerticalTitles(
			embedSettingsCard.Content.(*fyne.Container).Objects[1].(*fyne.Container).Objects[0].(*fyne.Container).Objects[1].(*widget.Entry).Text,
			embedSettingsCard.Content.(*fyne.Container).Objects[1].(*fyne.Container).Objects[1].(*fyne.Container).Objects[1].(*widget.Entry).Text,
		)
		progress.Show()
		downloadContainer.Hide()

		// 检查是否有视频URL
		if sm.GetVideoUrl() == "" {
			if videoInputContainer.(*fyne.Container).Objects[0].(*fyne.Container).Objects[1].(*widget.RadioGroup).Selected == "本地视频" {
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
		}
		err = deps.CheckDependency() // todo 提示优化
		if err != nil {
			dialog.ShowError(fmt.Errorf("依赖环境准备失败: %v", err), window)
			log.GetLogger().Error("依赖环境准备失败", zap.Error(err))
		}
		log.GetLogger().Info("配置内容", zap.Any("config", config.Conf))

		if err = sm.StartTask(); err != nil {
			dialog.ShowError(err, window)
			progress.Hide()
			return
		}
		downloadContainer.Show()
	})
}

// 创建OpenAI配置组
func createOpenAIConfigGroup() *widget.Card {
	openaiBaseUrlEntry := widget.NewEntry()
	openaiBaseUrlEntry.SetPlaceHolder("OpenAI API base url")
	openaiBaseUrlEntry.Bind(binding.BindString(&config.Conf.Openai.BaseUrl))

	openaiModelEntry := widget.NewEntry()
	openaiModelEntry.SetPlaceHolder("OpenAI模型名称")
	openaiModelEntry.Bind(binding.BindString(&config.Conf.Openai.Model))

	openaiApiKeyEntry := widget.NewPasswordEntry()
	openaiApiKeyEntry.SetPlaceHolder("OpenAI API密钥")
	openaiApiKeyEntry.Bind(binding.BindString(&config.Conf.Openai.ApiKey))

	return widget.NewCard("OpenAI配置", "", container.NewVBox(
		widget.NewForm(
			widget.NewFormItem("API base url", openaiBaseUrlEntry),
			widget.NewFormItem("模型名称", openaiModelEntry),
			widget.NewFormItem("API密钥", openaiApiKeyEntry),
		),
	))
}

// 创建Whisper配置组
func createWhisperConfigGroup() *widget.Card {
	whisperBaseUrlEntry := widget.NewEntry()
	whisperBaseUrlEntry.SetPlaceHolder("Whisper API base url")
	whisperBaseUrlEntry.Text = config.Conf.Openai.Whisper.BaseUrl

	whisperApiKeyEntry := widget.NewPasswordEntry()
	whisperApiKeyEntry.SetPlaceHolder("Whisper API密钥")
	whisperApiKeyEntry.Text = config.Conf.Openai.Whisper.ApiKey

	return widget.NewCard("Whisper配置", "", container.NewVBox(
		widget.NewForm(
			widget.NewFormItem("API base url", whisperBaseUrlEntry),
			widget.NewFormItem("API密钥", whisperApiKeyEntry),
		),
	))
}

// 创建阿里云OSS配置组
func createAliyunOSSConfigGroup() *widget.Card {
	ossAccessKeyIdEntry := widget.NewEntry()
	ossAccessKeyIdEntry.SetPlaceHolder("阿里云AccessKey ID")
	ossAccessKeyIdEntry.Text = config.Conf.Aliyun.Oss.AccessKeyId

	ossAccessKeySecretEntry := widget.NewPasswordEntry()
	ossAccessKeySecretEntry.SetPlaceHolder("阿里云AccessKey Secret")
	ossAccessKeySecretEntry.Text = config.Conf.Aliyun.Oss.AccessKeySecret

	ossBucketEntry := widget.NewEntry()
	ossBucketEntry.SetPlaceHolder("OSS Bucket名称")
	ossBucketEntry.Text = config.Conf.Aliyun.Oss.Bucket

	return widget.NewCard("阿里云OSS配置", "", container.NewVBox(
		widget.NewForm(
			widget.NewFormItem("AccessKey ID", ossAccessKeyIdEntry),
			widget.NewFormItem("AccessKey Secret", ossAccessKeySecretEntry),
			widget.NewFormItem("Bucket名称", ossBucketEntry),
		),
	))
}

// 创建阿里云语音配置组
func createAliyunSpeechConfigGroup() *widget.Card {
	speechAppKeyEntry := widget.NewEntry()
	speechAppKeyEntry.SetPlaceHolder("阿里云语音服务AppKey")
	speechAppKeyEntry.Text = config.Conf.Aliyun.Speech.AppKey

	return widget.NewCard("阿里云语音配置", "", container.NewVBox(
		widget.NewForm(
			widget.NewFormItem("AppKey", speechAppKeyEntry),
		),
	))
}

// 创建阿里云百炼配置组
func createAliyunBailianConfigGroup() *widget.Card {
	bailianApiKeyEntry := widget.NewPasswordEntry()
	bailianApiKeyEntry.SetPlaceHolder("阿里云百炼API密钥")
	bailianApiKeyEntry.Text = config.Conf.Aliyun.Bailian.ApiKey

	return widget.NewCard("阿里云百炼配置", "", container.NewVBox(
		widget.NewForm(
			widget.NewFormItem("API密钥", bailianApiKeyEntry),
		),
	))
}

// 创建保存按钮
func createSaveButton(window fyne.Window) *widget.Button {
	return widget.NewButtonWithIcon("保存配置", theme.DocumentSaveIcon(), func() {
		err := config.SaveConfig()
		if err != nil {
			dialog.ShowError(fmt.Errorf("保存配置失败: %v", err), window)
			log.GetLogger().Error("保存配置失败", zap.Error(err))
			return
		}
		config.LoadConfig()
		dialog.ShowInformation("成功", "配置已保存", window)
	})
}
