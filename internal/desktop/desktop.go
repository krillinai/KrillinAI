package desktop

import (
	"image/color"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
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
	myApp.Settings().SetTheme(NewCustomTheme())

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

	// 内容区域
	content := AnimatedContainer()

	currentSelectedIndex := 0

	// 创建导航项
	for i, item := range navItems {
		index := i // 捕获变量
		isSelected := (i == currentSelectedIndex)

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

			// 更新当前选中的索引
			currentSelectedIndex = index

			// 刷新容器
			navContainer.Refresh()

			// 更新内容
			updateContent(index, content)
		})

		// 将导航按钮添加到列表和容器中
		navButtons = append(navButtons, navBtn)
		navContainer.Add(container.NewPadded(navBtn))
	}

	updateContent(0, content)

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
	split := container.NewHSplit(navWithBackground, content)
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
}

// 更新内容区域
func updateContent(index int, content *fyne.Container) {
	var newContent fyne.CanvasObject

	switch index {
	case 0:
		newContent = CreateSubtitleTab(fyne.CurrentApp().Driver().AllWindows()[0])
	case 1:
		newContent = CreateConfigTab(fyne.CurrentApp().Driver().AllWindows()[0])
	}

	// 使用淡入淡出动画切换内容
	SwitchContent(content, newContent, 300*time.Millisecond)
}
