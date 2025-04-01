package desktop

import (
	"fmt"
	"image/color"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"
)

// FadeAnimation 淡入淡出动画
func FadeAnimation(content fyne.CanvasObject, duration time.Duration, startOpacity, endOpacity float64) {
	// 使用更柔和的动画效果
	rect := canvas.NewRectangle(color.NRGBA{R: 240, G: 246, B: 252, A: 0})
	rect.FillColor = color.NRGBA{R: 240, G: 246, B: 252, A: uint8(startOpacity * 255)}

	anim := canvas.NewColorRGBAAnimation(
		color.NRGBA{R: 240, G: 246, B: 252, A: uint8(startOpacity * 255)},
		color.NRGBA{R: 240, G: 246, B: 252, A: uint8(endOpacity * 255)},
		duration,
		func(c color.Color) {
			rect.FillColor = c
			content.Refresh()
		})

	anim.Start()
}

// PrimaryButton 创建主要按钮
func PrimaryButton(text string, icon fyne.Resource, action func()) *widget.Button {
	btn := widget.NewButtonWithIcon(text, icon, action)
	btn.Importance = widget.HighImportance
	return btn
}

// SecondaryButton 创建次要按钮
func SecondaryButton(text string, icon fyne.Resource, action func()) *widget.Button {
	btn := widget.NewButtonWithIcon(text, icon, action)
	btn.Importance = widget.MediumImportance
	return btn
}

// TitleText 创建标题文本
func TitleText(text string) *canvas.Text {
	title := canvas.NewText(text, color.NRGBA{R: 88, G: 157, B: 246, A: 255})
	title.TextSize = 22
	title.TextStyle = fyne.TextStyle{Bold: true}
	title.Alignment = fyne.TextAlignCenter
	return title
}

// SubtitleText 创建副标题文本
func SubtitleText(text string) *canvas.Text {
	subtitle := canvas.NewText(text, color.NRGBA{R: 100, G: 120, B: 160, A: 255})
	subtitle.TextSize = 16
	subtitle.TextStyle = fyne.TextStyle{Italic: true}
	subtitle.Alignment = fyne.TextAlignCenter
	return subtitle
}

func createShadowRectangle(fillColor color.Color, cornerRadius float32) *canvas.Rectangle {
	rect := canvas.NewRectangle(fillColor)
	rect.CornerRadius = cornerRadius
	return rect
}

func GlassCard(title, subtitle string, content fyne.CanvasObject) *fyne.Container {
	glassBackground := createShadowRectangle(color.NRGBA{R: 255, G: 255, B: 255, A: 200}, 12)

	titleLabel := canvas.NewText(title, color.NRGBA{R: 60, G: 80, B: 120, A: 255})
	titleLabel.TextSize = 16
	titleLabel.TextStyle = fyne.TextStyle{Bold: true}

	// 副标题
	var subtitleLabel *canvas.Text
	if subtitle != "" {
		subtitleLabel = canvas.NewText(subtitle, color.NRGBA{R: 100, G: 120, B: 150, A: 200})
		subtitleLabel.TextSize = 12
	}

	// 标题容器
	var headerContainer *fyne.Container
	if subtitleLabel != nil {
		headerContainer = container.NewVBox(titleLabel, subtitleLabel)
	} else {
		headerContainer = container.NewVBox(titleLabel)
	}

	// 分隔线
	divider := canvas.NewLine(color.NRGBA{R: 220, G: 230, B: 240, A: 255})
	divider.StrokeWidth = 1

	contentWithPadding := container.NewPadded(content)

	// 布局
	cardContent := container.NewBorder(
		container.NewVBox(container.NewPadded(headerContainer), divider),
		nil, nil, nil,
		contentWithPadding,
	)

	// 阴影
	shadow := canvas.NewRectangle(color.NRGBA{R: 0, G: 0, B: 0, A: 20})
	shadow.Move(fyne.NewPos(3, 3))
	shadow.Resize(fyne.NewSize(cardContent.Size().Width, cardContent.Size().Height))
	shadow.CornerRadius = 12

	return container.NewStack(shadow, glassBackground, cardContent)
}

func StyledCard(title string, content fyne.CanvasObject) *fyne.Container {
	bg := createShadowRectangle(color.NRGBA{R: 250, G: 251, B: 254, A: 255}, 8)

	titleLabel := canvas.NewText(title, color.NRGBA{R: 60, G: 80, B: 120, A: 255})
	titleLabel.TextSize = 16
	titleLabel.TextStyle = fyne.TextStyle{Bold: true}

	divider := canvas.NewRectangle(color.NRGBA{R: 230, G: 235, B: 240, A: 255})
	divider.SetMinSize(fyne.NewSize(0, 1))

	// 组合
	contentContainer := container.NewBorder(
		container.NewVBox(
			container.NewPadded(titleLabel),
			divider,
		),
		nil, nil, nil,
		container.NewPadded(content),
	)

	shadow := canvas.NewRectangle(color.NRGBA{R: 0, G: 0, B: 0, A: 15})
	shadow.Move(fyne.NewPos(2, 2))
	shadow.SetMinSize(fyne.NewSize(contentContainer.Size().Width+4, contentContainer.Size().Height+4))
	shadow.CornerRadius = 8

	return container.NewStack(shadow, bg, contentContainer)
}

func StyledSelect(options []string, selected func(string)) *widget.Select {
	sel := widget.NewSelect(options, selected)

	// 针对包含"翻译后字幕"的选项增加宽度
	for _, option := range options {
		if len(option) > 8 {

			extraOptions := make([]string, len(options))
			copy(extraOptions, options)

			maxOption := ""
			for _, opt := range options {
				if len(opt) > len(maxOption) {
					maxOption = opt
				}
			}

			// 添加额外空格来扩展宽度
			padding := "                          "
			if len(maxOption) < 20 {
				maxOption = maxOption + padding
			}

			sel = widget.NewSelect(extraOptions, selected)
			break
		}
	}

	return sel
}

func StyledEntry(placeholder string) *widget.Entry {
	entry := widget.NewEntry()
	entry.SetPlaceHolder(placeholder)
	return entry
}

func StyledPasswordEntry(placeholder string) *widget.Entry {
	entry := widget.NewPasswordEntry()
	entry.SetPlaceHolder(placeholder)
	return entry
}

func DividedContainer(vertical bool, items ...fyne.CanvasObject) *fyne.Container {
	if len(items) <= 1 {
		if len(items) == 1 {
			return container.NewPadded(items[0])
		}
		return container.NewPadded()
	}

	var dividers []fyne.CanvasObject
	for i := 0; i < len(items)-1; i++ {
		dividers = append(dividers, createDivider(vertical))
	}

	var objects []fyne.CanvasObject
	for i, item := range items {
		objects = append(objects, item)
		if i < len(dividers) {
			objects = append(objects, dividers[i])
		}
	}

	if vertical {
		return container.New(layout.NewVBoxLayout(), objects...)
	}
	return container.New(layout.NewHBoxLayout(), objects...)
}

func createDivider(vertical bool) fyne.CanvasObject {
	divider := canvas.NewRectangle(color.NRGBA{R: 210, G: 220, B: 240, A: 255})
	if vertical {
		divider.SetMinSize(fyne.NewSize(0, 1))
	} else {
		divider.SetMinSize(fyne.NewSize(1, 0))
	}
	return divider
}

func ProgressWithLabel(initial float64) (*widget.ProgressBar, *widget.Label, *fyne.Container) {
	progress := widget.NewProgressBar()
	progress.SetValue(initial)

	label := widget.NewLabel("0%")

	container := container.NewBorder(nil, nil, nil, label, progress)

	return progress, label, container
}

// UpdateProgressLabel 更新进度条标签
func UpdateProgressLabel(progress *widget.ProgressBar, label *widget.Label) {
	percentage := int(progress.Value * 100)
	label.SetText(fmt.Sprintf("%d%%", percentage))
}

func AnimatedContainer() *fyne.Container {
	return container.NewStack()
}

func SwitchContent(container *fyne.Container, content fyne.CanvasObject, duration time.Duration) {
	if container == nil || content == nil {
		return 
	}

	if len(container.Objects) > 0 {
		oldContent := container.Objects[0]
		FadeAnimation(oldContent, duration/2, 1.0, 0.0)

		go func() {
			defer func() {
				if r := recover(); r != nil {
					fmt.Println("内容切换时发生错误:", r)
				}
			}()

			time.Sleep(duration / 2)
			container.Objects = []fyne.CanvasObject{content}
			container.Refresh()
			FadeAnimation(content, duration/2, 0.0, 1.0)
		}()
	} else {
		container.Objects = []fyne.CanvasObject{content}
		container.Refresh()
		FadeAnimation(content, duration/2, 0.0, 1.0)
	}
}
