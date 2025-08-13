package desktop

import (
	"fmt"
	"image/color"
	"krillin-ai/config"
	"krillin-ai/log"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
	"go.uber.org/zap"
)

func createNavButton(text string, icon fyne.Resource, isSelected bool, onTap func()) *widget.Button {
	btn := widget.NewButtonWithIcon(text, icon, onTap)

	// 根据选中状态设置颜色
	if isSelected {
		btn.Importance = widget.HighImportance
	} else {
		btn.Importance = widget.LowImportance
	}

	return btn
}

// Show 展示桌面
func Show() {
	myApp := app.New()
	myWindow := myApp.NewWindow("Klic Studio")

	// 创建主题管理器
	themeManager := NewThemeManager(myApp, myWindow)

	// 设置全局主题管理器
	SetGlobalThemeManager(themeManager)

	logoContainer := container.NewVBox()

	logo := canvas.NewText("Klic Studio", color.NRGBA{R: 59, G: 130, B: 246, A: 255})
	logo.TextSize = 28
	logo.TextStyle = fyne.TextStyle{Bold: true}
	logo.Alignment = fyne.TextAlignCenter

	separator := canvas.NewRectangle(color.NRGBA{R: 209, G: 213, B: 219, A: 255})
	separator.SetMinSize(fyne.NewSize(0, 2))

	slogan := canvas.NewText("AI Video Translation & Dubbing by Krillin AI", color.NRGBA{R: 107, G: 114, B: 128, A: 255})
	slogan.TextSize = 12
	slogan.Alignment = fyne.TextAlignCenter

	logoContainer.Add(logo)
	logoContainer.Add(separator)
	logoContainer.Add(slogan)

	navItems := []string{"工作台 Dashboard", "LLM 配置", "配置 Settings"}
	navIcons := []fyne.Resource{theme.DocumentIcon(), theme.ComputerIcon(), theme.SettingsIcon()}

	var navButtons []*widget.Button
	navContainer := container.NewVBox()

	contentStack := container.NewStack()
	currentSelectedIndex := 0

	var workbenchContent, llmContent, configContent fyne.CanvasObject

	var refreshContent = func() {
		contentStack.Objects = []fyne.CanvasObject{}

		workbenchContent = CreateSubtitleTab(myWindow)
		llmContent = CreateLlmTab()
		configContent = CreateConfigTab(myWindow)

		switch currentSelectedIndex {
		case 0:
			contentStack.Add(workbenchContent)
			contentStack.Add(llmContent)
			contentStack.Add(configContent)
			llmContent.Hide()
			configContent.Hide()
		case 1:
			contentStack.Add(workbenchContent)
			contentStack.Add(llmContent)
			contentStack.Add(configContent)
			workbenchContent.Hide()
			configContent.Hide()
		case 2:
			contentStack.Add(workbenchContent)
			contentStack.Add(llmContent)
			contentStack.Add(configContent)
			workbenchContent.Hide()
			llmContent.Hide()
		}

		contentStack.Refresh()
	}

	refreshContent()

	// 添加主题切换回调来刷新内容
	themeManager.AddThemeChangeCallback(func(isDark bool) {
		refreshContent()
	})

	for i, item := range navItems {
		index := i // 捕获变量
		isSelected := i == currentSelectedIndex

		navBtn := createNavButton(item, navIcons[i], isSelected, func() {
			if currentSelectedIndex == index {
				return
			}

			for j, btn := range navButtons {
				if j == index {
					btn.Importance = widget.HighImportance
				} else {
					btn.Importance = widget.LowImportance
				}
			}

			// 保存配置并切换界面
			err := config.SaveConfig()
			if err != nil {
				dialog.ShowError(fmt.Errorf("保存配置失败: %v", err), myWindow)
			}

			switch index {
			case 0:
				workbenchContent.Show()
				llmContent.Hide()
				configContent.Hide()
			case 1:
				workbenchContent.Hide()
				llmContent.Show()
				configContent.Hide()
			case 2:
				workbenchContent.Hide()
				llmContent.Hide()
				configContent.Show()
			}

			currentSelectedIndex = index
		})

		navButtons = append(navButtons, navBtn)
		navContainer.Add(navBtn)
	}

	themeToggleContainer := themeManager.CreateThemeToggleButton()

	navBottomContainer := container.NewVBox(
		layout.NewSpacer(),
		themeToggleContainer,
	)

	navBackground := themeManager.CreateGlassmorphismBackground()

	navWithBackground := container.NewStack(
		navBackground,
		container.NewBorder(
			container.NewPadded(logoContainer),
			container.NewPadded(navBottomContainer),
			nil, nil,
			container.NewPadded(navContainer),
		),
	)

	split := container.NewHSplit(navWithBackground, container.NewPadded(contentStack))
	split.SetOffset(0.25)

	mainContainer := container.NewPadded(split)

	var statusTextColor, statusBgColor color.Color
	if themeManager.IsDarkMode() {
		statusTextColor = color.NRGBA{R: 148, G: 163, B: 184, A: 180}
		statusBgColor = color.NRGBA{R: 30, G: 41, B: 59, A: 150}
	} else {
		statusTextColor = color.NRGBA{R: 107, G: 114, B: 128, A: 180}
		statusBgColor = color.NRGBA{R: 255, G: 255, B: 255, A: 150}
	}

	statusText := canvas.NewText("就绪", statusTextColor)
	statusText.TextSize = 12

	statusBarBackground := canvas.NewRectangle(statusBgColor)
	statusBarBackground.CornerRadius = 8

	statusBar := container.NewStack(
		statusBarBackground,
		container.NewHBox(
			layout.NewSpacer(),
			statusText,
		),
	)

	finalContainer := container.NewBorder(nil, container.NewPadded(statusBar), nil, nil, mainContainer)

	myWindow.SetContent(finalContainer)
	myWindow.Resize(fyne.NewSize(1200, 800))
	myWindow.CenterOnScreen()
	myWindow.ShowAndRun()

	// 关闭窗口时保存配置
	err := config.SaveConfig()
	if err != nil {
		log.GetLogger().Error("保存配置失败 Failed to save config", zap.Error(err))
		return
	}
	log.GetLogger().Info("配置已保存 Config saved successfully")
}
