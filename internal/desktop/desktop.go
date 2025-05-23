package desktop

import (
	"fmt"
	"image/color"
	"krillin-ai/config"
	"krillin-ai/log"
	"time"

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

	// 自定义主题
	myApp.Settings().SetTheme(NewCustomTheme(false))

	myWindow := myApp.NewWindow("Krillin AI")

	logoContainer := container.NewVBox()

	logo := canvas.NewText("Krillin AI", color.NRGBA{R: 88, G: 157, B: 246, A: 255})
	logo.TextSize = 28
	logo.TextStyle = fyne.TextStyle{Bold: true}
	logo.Alignment = fyne.TextAlignCenter

	separator := canvas.NewRectangle(color.NRGBA{R: 210, G: 225, B: 245, A: 255})
	separator.SetMinSize(fyne.NewSize(0, 2))

	slogan := canvas.NewText("智能内容创作助手", color.NRGBA{R: 100, G: 120, B: 160, A: 255})
	slogan.TextSize = 12
	slogan.Alignment = fyne.TextAlignCenter

	logoContainer.Add(logo)
	logoContainer.Add(separator)
	logoContainer.Add(slogan)

	// 创建左侧导航栏
	navItems := []string{"工作台 Workbench", "配置 Config"}
	navIcons := []fyne.Resource{theme.DocumentIcon(), theme.SettingsIcon()}

	// 存储导航按钮列表
	var navButtons []*widget.Button
	navContainer := container.NewVBox()

	// 创建内容区域，使用Stack容器来叠放多个内容
	contentStack := container.NewStack()

	// 预先创建两个tab的内容
	workbenchContent := CreateSubtitleTab(myWindow)
	configContent := CreateConfigTab(myWindow)

	// 默认显示工作台内容
	contentStack.Add(workbenchContent)
	contentStack.Add(configContent)

	configContent.Hide()

	currentSelectedIndex := 0

	// 创建导航项
	for i, item := range navItems {
		index := i // 捕获变量
		isSelected := i == currentSelectedIndex

		// 创建导航按钮以及点击处理函数
		navBtn := createNavButton(item, navIcons[i], isSelected, func() {
			// 如果已经是当前选中项，不做任何操作
			if currentSelectedIndex == index {
				return
			}

			// 更新所有导航项的状态
			for j, btn := range navButtons {
				if j == index {
					btn.Importance = widget.HighImportance
				} else {
					btn.Importance = widget.LowImportance
				}
			}

			if index == 0 {
				// tab切换出去就保存和重新加载配置
				err := config.SaveConfig()
				if err != nil {
					// 保存配置失败，弹出提示框
					dialog.ShowError(fmt.Errorf("保存配置失败: %v", err), myWindow)
					log.GetLogger().Error("保存配置失败 Failed to save config", zap.Error(err))
					return
				}
				log.GetLogger().Info("配置已保存 Config saved successfully")
				workbenchContent.Show()
				configContent.Hide()
				// 确保进度条和下载区域状态正确显示
				workbenchContent.Refresh()
				FadeAnimation(workbenchContent, 300*time.Millisecond, 0.0, 1.0)
			} else {
				workbenchContent.Hide()
				configContent.Show()
				FadeAnimation(configContent, 300*time.Millisecond, 0.0, 1.0)
			}

			// 更新当前选中的索引
			currentSelectedIndex = index
			navContainer.Refresh()
			contentStack.Refresh()
		})

		// 将导航按钮添加到列表和容器中
		navButtons = append(navButtons, navBtn)
		navContainer.Add(container.NewPadded(navBtn))
	}

	navBackground := canvas.NewRectangle(color.NRGBA{R: 250, G: 251, B: 254, A: 255})

	navWithBackground := container.NewStack(
		navBackground,
		container.NewBorder(
			container.NewPadded(logoContainer),
			nil, nil, nil,
			container.NewPadded(navContainer),
		),
	)

	// 主布局
	split := container.NewHSplit(navWithBackground, container.NewPadded(contentStack))
	split.SetOffset(0.2)

	mainContainer := container.NewPadded(split)

	// 底部状态栏
	statusText := canvas.NewText("就绪", color.NRGBA{R: 100, G: 120, B: 160, A: 180})
	statusText.TextSize = 12
	statusBar := container.NewHBox(
		layout.NewSpacer(),
		statusText,
	)

	finalContainer := container.NewBorder(nil, container.NewPadded(statusBar), nil, nil, mainContainer)

	myWindow.SetContent(finalContainer)
	myWindow.Resize(fyne.NewSize(1000, 700))
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
