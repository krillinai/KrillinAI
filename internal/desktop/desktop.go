package desktop

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

// Show 展示桌面应用
func Show() {
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
	content := container.NewStack()
	nav.OnSelected = func(id widget.ListItemID) {
		switch id {
		case 0:
			content.Objects = []fyne.CanvasObject{CreateSubtitleTab(myWindow)}
		case 1:
			content.Objects = []fyne.CanvasObject{CreateConfigTab(myWindow)}
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
