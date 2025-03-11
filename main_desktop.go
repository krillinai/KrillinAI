package main

import (
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/deps"
	"krillin-ai/internal/desktop"
	"krillin-ai/log"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"
	"go.uber.org/zap"
)

func main() {
	var err error
	log.InitLogger()
	defer log.GetLogger().Sync()

	err = config.LoadConfig()
	if err != nil {
		log.GetLogger().Error("加载配置失败", zap.Error(err))
		return
	}

	err = deps.CheckDependency()
	if err != nil {
		log.GetLogger().Error("依赖环境准备失败", zap.Error(err))
		return
	}

	myApp := app.New()
	myWindow := myApp.NewWindow("Krillin AI")

	// 创建左侧导航栏
	nav := widget.NewList(
		func() int { return 2 },
		func() fyne.CanvasObject { return widget.NewLabel("Template") },
		func(id widget.ListItemID, item fyne.CanvasObject) {
			label := item.(*widget.Label)
			switch id {
			case 0:
				label.SetText("字幕任务")
			case 1:
				label.SetText("配置")
			}
		},
	)

	// 创建内容区域
	content := container.NewMax()
	nav.OnSelected = func(id widget.ListItemID) {
		switch id {
		case 0:
			content.Objects = []fyne.CanvasObject{createSubtitleTab(myWindow)}
		case 1:
			content.Objects = []fyne.CanvasObject{createConfigTab(myWindow)}
		}
		content.Refresh()
	}

	// 设置默认选中项
	nav.Select(0)

	// 创建主布局
	split := container.NewHSplit(nav, content)
	split.SetOffset(0.2)

	myWindow.SetContent(split)
	myWindow.Resize(fyne.NewSize(1000, 700))
	myWindow.CenterOnScreen()
	myWindow.ShowAndRun()
}

func createConfigTab(window fyne.Window) fyne.CanvasObject {
	// OpenAI配置
	openaiBaseUrlEntry := widget.NewEntry()
	openaiBaseUrlEntry.SetPlaceHolder("OpenAI Base URL")
	openaiBaseUrlEntry.Text = config.Conf.Openai.BaseUrl

	openaiModelEntry := widget.NewEntry()
	openaiModelEntry.SetPlaceHolder("OpenAI Model")
	openaiModelEntry.Text = config.Conf.Openai.Model

	openaiApiKeyEntry := widget.NewPasswordEntry()
	openaiApiKeyEntry.SetPlaceHolder("OpenAI API Key")
	openaiApiKeyEntry.Text = config.Conf.Openai.ApiKey

	// Whisper配置
	whisperBaseUrlEntry := widget.NewEntry()
	whisperBaseUrlEntry.SetPlaceHolder("Whisper Base URL")
	whisperBaseUrlEntry.Text = config.Conf.Openai.Whisper.BaseUrl

	whisperApiKeyEntry := widget.NewPasswordEntry()
	whisperApiKeyEntry.SetPlaceHolder("Whisper API Key")
	whisperApiKeyEntry.Text = config.Conf.Openai.Whisper.ApiKey

	// 阿里云配置
	aliyunOssKeyIdEntry := widget.NewEntry()
	aliyunOssKeyIdEntry.SetPlaceHolder("阿里云OSS AccessKeyId")
	aliyunOssKeyIdEntry.Text = config.Conf.Aliyun.Oss.AccessKeyId

	aliyunOssKeySecretEntry := widget.NewPasswordEntry()
	aliyunOssKeySecretEntry.SetPlaceHolder("阿里云OSS AccessKeySecret")
	aliyunOssKeySecretEntry.Text = config.Conf.Aliyun.Oss.AccessKeySecret

	aliyunOssBucketEntry := widget.NewEntry()
	aliyunOssBucketEntry.SetPlaceHolder("阿里云OSS Bucket")
	aliyunOssBucketEntry.Text = config.Conf.Aliyun.Oss.Bucket

	aliyunSpeechKeyIdEntry := widget.NewEntry()
	aliyunSpeechKeyIdEntry.SetPlaceHolder("阿里云语音AccessKeyId")
	aliyunSpeechKeyIdEntry.Text = config.Conf.Aliyun.Speech.AccessKeyId

	aliyunSpeechKeySecretEntry := widget.NewPasswordEntry()
	aliyunSpeechKeySecretEntry.SetPlaceHolder("阿里云语音AccessKeySecret")
	aliyunSpeechKeySecretEntry.Text = config.Conf.Aliyun.Speech.AccessKeySecret

	aliyunSpeechAppKeyEntry := widget.NewEntry()
	aliyunSpeechAppKeyEntry.SetPlaceHolder("阿里云语音AppKey")
	aliyunSpeechAppKeyEntry.Text = config.Conf.Aliyun.Speech.AppKey

	aliyunBailianApiKeyEntry := widget.NewPasswordEntry()
	aliyunBailianApiKeyEntry.SetPlaceHolder("阿里云百炼API Key")
	aliyunBailianApiKeyEntry.Text = config.Conf.Aliyun.Bailian.ApiKey

	// 保存按钮
	saveButton := widget.NewButton("保存配置", func() {
		// 更新配置
		config.Conf.Openai.BaseUrl = openaiBaseUrlEntry.Text
		config.Conf.Openai.Model = openaiModelEntry.Text
		config.Conf.Openai.ApiKey = openaiApiKeyEntry.Text
		config.Conf.Openai.Whisper.BaseUrl = whisperBaseUrlEntry.Text
		config.Conf.Openai.Whisper.ApiKey = whisperApiKeyEntry.Text
		config.Conf.Aliyun.Oss.AccessKeyId = aliyunOssKeyIdEntry.Text
		config.Conf.Aliyun.Oss.AccessKeySecret = aliyunOssKeySecretEntry.Text
		config.Conf.Aliyun.Oss.Bucket = aliyunOssBucketEntry.Text
		config.Conf.Aliyun.Speech.AccessKeyId = aliyunSpeechKeyIdEntry.Text
		config.Conf.Aliyun.Speech.AccessKeySecret = aliyunSpeechKeySecretEntry.Text
		config.Conf.Aliyun.Speech.AppKey = aliyunSpeechAppKeyEntry.Text
		config.Conf.Aliyun.Bailian.ApiKey = aliyunBailianApiKeyEntry.Text

		// 保存到文件
		err := config.SaveConfig()
		if err != nil {
			dialog.ShowError(err, window)
			return
		}

		dialog.ShowInformation("成功", "配置已保存", window)
	})

	// 创建分组
	openaiGroup := widget.NewCard("OpenAI 配置", "", container.NewVBox(
		widget.NewForm(
			widget.NewFormItem("Base URL", openaiBaseUrlEntry),
			widget.NewFormItem("Model", openaiModelEntry),
			widget.NewFormItem("API Key", openaiApiKeyEntry),
		),
	))

	whisperGroup := widget.NewCard("Whisper 配置", "", container.NewVBox(
		widget.NewForm(
			widget.NewFormItem("Base URL", whisperBaseUrlEntry),
			widget.NewFormItem("API Key", whisperApiKeyEntry),
		),
	))

	aliyunOssGroup := widget.NewCard("阿里云 OSS 配置", "", container.NewVBox(
		widget.NewForm(
			widget.NewFormItem("AccessKeyId", aliyunOssKeyIdEntry),
			widget.NewFormItem("AccessKeySecret", aliyunOssKeySecretEntry),
			widget.NewFormItem("Bucket", aliyunOssBucketEntry),
		),
	))

	aliyunSpeechGroup := widget.NewCard("阿里云语音配置", "", container.NewVBox(
		widget.NewForm(
			widget.NewFormItem("AccessKeyId", aliyunSpeechKeyIdEntry),
			widget.NewFormItem("AccessKeySecret", aliyunSpeechKeySecretEntry),
			widget.NewFormItem("AppKey", aliyunSpeechAppKeyEntry),
		),
	))

	aliyunBailianGroup := widget.NewCard("阿里云百炼配置", "", container.NewVBox(
		widget.NewForm(
			widget.NewFormItem("API Key", aliyunBailianApiKeyEntry),
		),
	))

	// 创建滚动容器
	scroll := container.NewScroll(container.NewVBox(
		openaiGroup,
		whisperGroup,
		aliyunOssGroup,
		aliyunSpeechGroup,
		aliyunBailianGroup,
		saveButton,
	))

	return container.NewBorder(nil, nil, nil, nil, scroll)
}

func createSubtitleTab(window fyne.Window) fyne.CanvasObject {
	sm := desktop.NewSubtitleManager(window)

	// 视频输入方式选择
	inputType := widget.NewRadioGroup([]string{"本地视频", "视频链接"}, func(value string) {
		// 切换输入方式时的处理
	})

	// 视频链接输入框
	urlEntry := widget.NewEntry()
	urlEntry.SetPlaceHolder("请输入视频链接")
	urlEntry.Hide()
	urlEntry.OnChanged = func(text string) {
		sm.SetVideoUrl(text) // 当输入URL时，直接更新到SubtitleManager
	}

	// 视频选择按钮
	selectButton := widget.NewButton("选择视频文件", sm.ShowFileDialog)

	// 视频输入容器
	videoInputContainer := container.NewVBox()
	videoInputContainer.Objects = []fyne.CanvasObject{selectButton}

	// 切换输入方式
	inputType.OnChanged = func(value string) {
		if value == "本地视频" {
			urlEntry.Hide()
			selectButton.Show()
			videoInputContainer.Objects = []fyne.CanvasObject{selectButton}
			sm.SetVideoUrl("") // 清空之前可能设置的URL
		} else {
			selectButton.Hide()
			urlEntry.Show()
			videoInputContainer.Objects = []fyne.CanvasObject{urlEntry}
		}
		videoInputContainer.Refresh()
	}

	// 设置默认选中本地视频
	inputType.SetSelected("本地视频")

	// 源语言选择
	sourceLangSelect := widget.NewSelect([]string{
		"简体中文", "英文", "日文", "土耳其语", "德语", "韩语", "俄语",
	}, func(value string) {
		langMap := map[string]string{
			"简体中文": "zh_cn", "英文": "en", "日文": "ja",
			"土耳其语": "tr", "德语": "de", "韩语": "ko", "俄语": "ru",
		}
		sm.SetSourceLang(langMap[value])
	})
	sourceLangSelect.SetSelected("简体中文")

	// 目标语言选择
	targetLangSelect := widget.NewSelect([]string{
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
	})
	targetLangSelect.SetSelected("简体中文")

	// 双语字幕设置
	bilingualCheck := widget.NewCheck("启用双语字幕", func(checked bool) {
		sm.SetBilingualEnabled(checked)
	})
	bilingualCheck.SetChecked(true)

	bilingualPosSelect := widget.NewSelect([]string{
		"翻译后字幕在上方", "翻译后字幕在下方",
	}, func(value string) {
		if value == "翻译后字幕在上方" {
			sm.SetBilingualPosition(1)
		} else {
			sm.SetBilingualPosition(2)
		}
	})
	bilingualPosSelect.SetSelected("翻译后字幕在上方")

	// 配音设置
	voiceoverCheck := widget.NewCheck("启用配音", func(checked bool) {
		sm.SetVoiceoverEnabled(checked)
	})

	voiceGenderSelect := widget.NewSelect([]string{"男声", "女声"}, func(value string) {
		if value == "男声" {
			sm.SetVoiceoverGender(2)
		} else {
			sm.SetVoiceoverGender(1)
		}
	})
	voiceGenderSelect.SetSelected("男声")
	voiceGenderSelect.Disable()

	voiceCloneButton := widget.NewButton("选择音色克隆样本", sm.ShowAudioFileDialog)
	voiceCloneButton.Disable()

	voiceoverCheck.OnChanged = func(checked bool) {
		sm.SetVoiceoverEnabled(checked)
		if checked {
			voiceGenderSelect.Enable()
			voiceCloneButton.Enable()
		} else {
			voiceGenderSelect.Disable()
			voiceCloneButton.Disable()
		}
	}

	// 语气词过滤
	fillerFilterCheck := widget.NewCheck("启用语气词过滤", func(checked bool) {
		sm.SetFillerFilter(checked)
	})
	fillerFilterCheck.SetChecked(true)

	// 字幕嵌入视频设置
	embedSubtitleCheck := widget.NewCheck("合成字幕嵌入视频", func(checked bool) {
		if checked {
			sm.SetEmbedSubtitle("horizontal")
		} else {
			sm.SetEmbedSubtitle("none")
		}
	})

	embedTypeSelect := widget.NewSelect([]string{
		"横屏视频", "竖屏视频", "横屏+竖屏视频",
	}, func(value string) {
		typeMap := map[string]string{
			"横屏视频":    "horizontal",
			"竖屏视频":    "vertical",
			"横屏+竖屏视频": "all",
		}
		sm.SetEmbedSubtitle(typeMap[value])
	})
	embedTypeSelect.SetSelected("横屏视频")
	embedTypeSelect.Disable()

	verticalTitleEntry := widget.NewEntry()
	verticalTitleEntry.SetPlaceHolder("请输入竖屏视频主标题")
	verticalTitleEntry.Disable()

	verticalSubtitleEntry := widget.NewEntry()
	verticalSubtitleEntry.SetPlaceHolder("请输入竖屏视频副标题")
	verticalSubtitleEntry.Disable()

	embedSubtitleCheck.OnChanged = func(checked bool) {
		if checked {
			embedTypeSelect.Enable()
			if embedTypeSelect.Selected == "竖屏视频" || embedTypeSelect.Selected == "横屏+竖屏视频" {
				verticalTitleEntry.Enable()
				verticalSubtitleEntry.Enable()
			}
		} else {
			embedTypeSelect.Disable()
			verticalTitleEntry.Disable()
			verticalSubtitleEntry.Disable()
		}
	}

	embedTypeSelect.OnChanged = func(value string) {
		if value == "竖屏视频" || value == "横屏+竖屏视频" {
			verticalTitleEntry.Enable()
			verticalSubtitleEntry.Enable()
		} else {
			verticalTitleEntry.Disable()
			verticalSubtitleEntry.Disable()
		}
		sm.SetVerticalTitles(verticalTitleEntry.Text, verticalSubtitleEntry.Text)
	}

	// 进度条
	progress := widget.NewProgressBar()
	progress.Hide()
	sm.SetProgressBar(progress)

	// 下载容器
	downloadContainer := container.NewVBox()
	downloadContainer.Hide()
	sm.SetDownloadContainer(downloadContainer)

	// 开始按钮
	startButton := widget.NewButton("开始任务", func() {
		progress.Show()
		downloadContainer.Hide()

		// 检查是否有视频URL
		if sm.GetVideoUrl() == "" {
			if inputType.Selected == "本地视频" {
				dialog.ShowError(fmt.Errorf("请先选择视频文件"), window)
			} else {
				dialog.ShowError(fmt.Errorf("请输入视频链接"), window)
			}
			progress.Hide()
			return
		}

		err := sm.StartTask()
		if err != nil {
			dialog.ShowError(err, window)
			progress.Hide()
			return
		}
		downloadContainer.Show()
	})

	// 布局
	form := &widget.Form{
		Items: []*widget.FormItem{
			{Text: "输入方式", Widget: inputType},
			{Text: "视频", Widget: videoInputContainer},
			{Text: "源语言", Widget: sourceLangSelect},
			{Text: "目标语言", Widget: targetLangSelect},
			{Text: "双语字幕", Widget: container.NewHBox(bilingualCheck, bilingualPosSelect)},
			{Text: "配音设置", Widget: container.NewHBox(voiceoverCheck, voiceGenderSelect, voiceCloneButton)},
			{Text: "语气词过滤", Widget: fillerFilterCheck},
			{Text: "字幕嵌入", Widget: container.NewVBox(
				container.NewHBox(embedSubtitleCheck, embedTypeSelect),
				container.NewHBox(verticalTitleEntry, verticalSubtitleEntry),
			)},
		},
		OnSubmit: func() {
			startButton.OnTapped()
		},
	}

	return container.NewVBox(
		form,
		startButton,
		progress,
		downloadContainer,
	)
}
