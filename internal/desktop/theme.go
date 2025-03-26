package desktop

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"
)

// CustomTheme 自定义主题
type CustomTheme struct {
	baseTheme fyne.Theme
}

func NewCustomTheme() fyne.Theme {
	return &CustomTheme{baseTheme: theme.DefaultTheme()}
}

// Color 返回主题颜色
func (t *CustomTheme) Color(name fyne.ThemeColorName, variant fyne.ThemeVariant) color.Color {
	switch name {
	case theme.ColorNamePrimary:
		return color.NRGBA{R: 88, G: 157, B: 246, A: 255} // 清新蓝色
	case theme.ColorNameBackground:
		return color.NRGBA{R: 250, G: 251, B: 254, A: 255} // 浅白色背景
	case theme.ColorNameButton:
		return color.NRGBA{R: 88, G: 157, B: 246, A: 255} // 同主色
	case theme.ColorNameDisabled:
		return color.NRGBA{R: 200, G: 210, B: 230, A: 128} // 柔和禁用色
	case theme.ColorNameForeground:
		return color.NRGBA{R: 40, G: 45, B: 60, A: 255} // 深蓝灰色文字
	case theme.ColorNameHover:
		return color.NRGBA{R: 129, G: 186, B: 249, A: 255} // 淡蓝色悬停
	case theme.ColorNamePlaceHolder:
		return color.NRGBA{R: 160, G: 170, B: 185, A: 255} // 柔和占位符颜色
	case theme.ColorNamePressed:
		return color.NRGBA{R: 56, G: 136, B: 239, A: 255} // 深蓝色按下效果
	case theme.ColorNameScrollBar:
		return color.NRGBA{R: 210, G: 220, B: 240, A: 255} // 淡蓝色滚动条
	case theme.ColorNameShadow:
		return color.NRGBA{R: 0, G: 10, B: 30, A: 40} // 淡蓝色阴影
	case theme.ColorNameInputBackground:
		return color.NRGBA{R: 240, G: 246, B: 252, A: 255} // 淡蓝色输入框背景
	case theme.ColorNameFocus:
		return color.NRGBA{R: 88, G: 157, B: 246, A: 180} // 半透明主色焦点
	case theme.ColorNameSelection:
		return color.NRGBA{R: 180, G: 215, B: 250, A: 128} // 淡蓝色选择背景
	case theme.ColorNameError:
		return color.NRGBA{R: 242, G: 84, B: 91, A: 255} // 柔和错误色
	case theme.ColorNameSuccess:
		return color.NRGBA{R: 88, G: 214, B: 141, A: 255} // 清新绿色成功提示
	}
	return t.baseTheme.Color(name, variant)
}

// Icon 主题图标
func (t *CustomTheme) Icon(name fyne.ThemeIconName) fyne.Resource {
	return t.baseTheme.Icon(name)
}

// Font 主题字体
func (t *CustomTheme) Font(style fyne.TextStyle) fyne.Resource {
	return t.baseTheme.Font(style)
}

// Size 主题元素尺寸
func (t *CustomTheme) Size(name fyne.ThemeSizeName) float32 {
	switch name {
	case theme.SizeNamePadding:
		return 8
	case theme.SizeNameInlineIcon:
		return 24
	case theme.SizeNameScrollBar:
		return 8
	case theme.SizeNameScrollBarSmall:
		return 3
	case theme.SizeNameSeparatorThickness:
		return 1
	case theme.SizeNameText:
		return 14 
	case theme.SizeNameInputBorder:
		return 1 
	}
	return t.baseTheme.Size(name)
}
