package desktop

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"
)

// customTheme 自定义主题
type customTheme struct {
	baseTheme fyne.Theme
	forceDark bool
}

func NewCustomTheme(forceDark bool) fyne.Theme {
	if forceDark {
		return &customTheme{baseTheme: theme.DefaultTheme(), forceDark: true}
	}
	return &customTheme{baseTheme: theme.DefaultTheme(), forceDark: false}
}

func (t *customTheme) Color(name fyne.ThemeColorName, variant fyne.ThemeVariant) color.Color {
	if t.forceDark || variant == theme.VariantDark {
		return t.darkColors(name)
	}
	return t.lightColors(name)
}

// lightColors 浅色主题配色方案
func (t *customTheme) lightColors(name fyne.ThemeColorName) color.Color {
	switch name {
	// 主色系
	case theme.ColorNamePrimary:
		return color.NRGBA{R: 100, G: 150, B: 240, A: 255}

	// 背景与前景
	case theme.ColorNameBackground:
		return color.NRGBA{R: 248, G: 249, B: 252, A: 255} // 极浅灰背景
	case theme.ColorNameForeground:
		return color.NRGBA{R: 30, G: 35, B: 45, A: 255} // 深灰文字
	case theme.ColorNameDisabled:
		return color.NRGBA{R: 180, G: 185, B: 190, A: 150} // 柔和禁用色

	// 按钮状态
	case theme.ColorNameButton:
		return color.NRGBA{R: 70, G: 130, B: 230, A: 255}
	case theme.ColorNameHover:
		return color.NRGBA{R: 90, G: 150, B: 240, A: 255} // 浅蓝悬停
	case theme.ColorNamePressed:
		return color.NRGBA{R: 50, G: 110, B: 210, A: 255} // 深蓝按下

	// 输入组件
	case theme.ColorNameInputBackground:
		return color.NRGBA{R: 255, G: 255, B: 255, A: 255} // 纯白输入框
	case theme.ColorNameInputBorder:
		return color.NRGBA{R: 210, G: 215, B: 220, A: 255} // 浅灰边框
	case theme.ColorNamePlaceHolder:
		return color.NRGBA{R: 160, G: 165, B: 170, A: 200} // 灰占位符

	// 其他
	case theme.ColorNameSelection:
		return color.NRGBA{R: 200, G: 225, B: 255, A: 180} // 淡蓝选中
	case theme.ColorNameScrollBar:
		return color.NRGBA{R: 200, G: 205, B: 210, A: 200}
	case theme.ColorNameShadow:
		return color.NRGBA{R: 0, G: 0, B: 0, A: 25} // 柔和阴影

	// 状态色
	case theme.ColorNameError:
		return color.NRGBA{R: 230, G: 70, B: 70, A: 255} // 红色错误
	case theme.ColorNameWarning:
		return color.NRGBA{R: 245, G: 160, B: 50, A: 255} // 橙色警告
	case theme.ColorNameSuccess:
		return color.NRGBA{R: 60, G: 180, B: 120, A: 255} // 绿色成功
	case theme.ColorNameFocus:
		return color.NRGBA{R: 70, G: 130, B: 230, A: 100} // 半透明焦点

	default:
		return t.baseTheme.Color(name, theme.VariantLight)
	}
}

// darkColors 深色主题配色方案
func (t *customTheme) darkColors(name fyne.ThemeColorName) color.Color {
	switch name {
	// 主色系
	case theme.ColorNamePrimary:
		return color.NRGBA{R: 90, G: 150, B: 250, A: 255} // 稍亮的蓝色

	// 背景与前景
	case theme.ColorNameBackground:
		return color.NRGBA{R: 20, G: 22, B: 30, A: 255} // 更深的灰蓝背景
	case theme.ColorNameForeground:
		return color.NRGBA{R: 230, G: 235, B: 240, A: 255} // 浅灰文字
	case theme.ColorNameDisabled:
		return color.NRGBA{R: 100, G: 105, B: 110, A: 150} // 深色禁用

	// 按钮状态
	case theme.ColorNameButton:
		return color.NRGBA{R: 50, G: 55, B: 65, A: 255} // 更深的按钮背景
	case theme.ColorNameHover:
		return color.NRGBA{R: 70, G: 75, B: 85, A: 255} // 浅灰悬停
	case theme.ColorNamePressed:
		return color.NRGBA{R: 30, G: 35, B: 45, A: 255} // 更深按下

	// 输入组件
	case theme.ColorNameInputBackground:
		return color.NRGBA{R: 35, G: 38, B: 48, A: 255} // 更深的输入框背景
	case theme.ColorNameInputBorder:
		return color.NRGBA{R: 60, G: 65, B: 75, A: 255} // 更深的边框
	case theme.ColorNamePlaceHolder:
		return color.NRGBA{R: 120, G: 125, B: 130, A: 200} // 灰占位符

	// 其他
	case theme.ColorNameSelection:
		return color.NRGBA{R: 70, G: 130, B: 230, A: 180} // 蓝色选中
	case theme.ColorNameScrollBar:
		return color.NRGBA{R: 60, G: 65, B: 75, A: 200} // 更深的滚动条
	case theme.ColorNameShadow:
		return color.NRGBA{R: 0, G: 0, B: 0, A: 50} // 深色阴影

	// 状态色（更鲜艳）
	case theme.ColorNameError:
		return color.NRGBA{R: 240, G: 80, B: 80, A: 255}
	case theme.ColorNameWarning:
		return color.NRGBA{R: 255, G: 170, B: 60, A: 255}
	case theme.ColorNameSuccess:
		return color.NRGBA{R: 70, G: 190, B: 130, A: 255}
	case theme.ColorNameFocus:
		return color.NRGBA{R: 80, G: 140, B: 240, A: 100}

	default:
		return t.baseTheme.Color(name, theme.VariantDark)
	}
}

// Icon 主题图标
func (t *customTheme) Icon(name fyne.ThemeIconName) fyne.Resource {
	return t.baseTheme.Icon(name)
}

// Font 主题字体
func (t *customTheme) Font(style fyne.TextStyle) fyne.Resource {
	return t.baseTheme.Font(style)
}

// Size 主题尺寸设置
func (t *customTheme) Size(name fyne.ThemeSizeName) float32 {
	switch name {
	case theme.SizeNamePadding:
		return 10
	case theme.SizeNameInlineIcon:
		return 20
	case theme.SizeNameScrollBar:
		return 10
	case theme.SizeNameScrollBarSmall:
		return 4
	case theme.SizeNameSeparatorThickness:
		return 1
	case theme.SizeNameText:
		return 14
	case theme.SizeNameInputBorder:
		return 1.5
	case theme.SizeNameInputRadius:
		return 5
	default:
		return t.baseTheme.Size(name)
	}
}
