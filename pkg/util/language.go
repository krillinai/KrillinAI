package util

// 将内部语言代码映射为YouTube字幕语言代码
func MapLanguageForYouTube(language string) string {
	languageMap := map[string]string{
		// 中文相关
		"zh_cn": "zh-Hans", // 简体中文
		"zh_tw": "zh-Hant", // 繁体中文

		"en":  "en",  // 英语
		"es":  "es",  // 西班牙语
		"fr":  "fr",  // 法语
		"de":  "de",  // 德语
		"ja":  "ja",  // 日语
		"ko":  "ko",  // 韩语
		"ru":  "ru",  // 俄语
		"pt":  "pt",  // 葡萄牙语
		"it":  "it",  // 意大利语
		"ar":  "ar",  // 阿拉伯语
		"hi":  "hi",  // 印地语
		"th":  "th",  // 泰语
		"vi":  "vi",  // 越南语
		"tr":  "tr",  // 土耳其语
		"pl":  "pl",  // 波兰语
		"nl":  "nl",  // 荷兰语
		"sv":  "sv",  // 瑞典语
		"da":  "da",  // 丹麦语
		"no":  "no",  // 挪威语
		"fi":  "fi",  // 芬兰语
		"id":  "id",  // 印度尼西亚语
		"ms":  "ms",  // 马来语
		"fil": "fil", // 菲律宾语
		"bn":  "bn",  // 孟加拉语
		"he":  "iw",  // 希伯来语 (YouTube使用iw)
		"fa":  "fa",  // 波斯语
		"af":  "af",  // 南非语
		"el":  "el",  // 希腊语
		"uk":  "uk",  // 乌克兰语
		"hu":  "hu",  // 匈牙利语
		"sr":  "sr",  // 塞尔维亚语
		"hr":  "hr",  // 克罗地亚语
		"cs":  "cs",  // 捷克语
		"sw":  "sw",  // 斯瓦希里语
		"yo":  "yo",  // 约鲁巴语
		"ha":  "ha",  // 豪萨语
		"am":  "am",  // 阿姆哈拉语
		"om":  "om",  // 奥罗莫语
		"is":  "is",  // 冰岛语
		"lb":  "lb",  // 卢森堡语
		"ca":  "ca",  // 加泰罗尼亚语
		"ro":  "ro",  // 罗马尼亚语
		"sk":  "sk",  // 斯洛伐克语
		"bs":  "bs",  // 波斯尼亚语
		"mk":  "mk",  // 马其顿语
		"sl":  "sl",  // 斯洛文尼亚语
		"bg":  "bg",  // 保加利亚语
		"lv":  "lv",  // 拉脱维亚语
		"lt":  "lt",  // 立陶宛语
		"et":  "et",  // 爱沙尼亚语
		"mt":  "mt",  // 马耳他语
		"sq":  "sq",  // 阿尔巴尼亚语
		"pa":  "pa",  // 旁遮普语
		"jv":  "jv",  // 爪哇语
		"ta":  "ta",  // 泰米尔语
		"ur":  "ur",  // 乌尔都语
		"mr":  "mr",  // 马拉地语
		"te":  "te",  // 泰卢固语
		"ps":  "ps",  // 普什图语
		"ln":  "ln",  // 林加拉语
		"ml":  "ml",  // 马拉雅拉姆语
		"uz":  "uz",  // 乌兹别克语
		"kn":  "kn",  // 卡纳达语
		"or":  "or",  // 奥里亚语
		"ig":  "ig",  // 伊博语
		"zu":  "zu",  // 祖鲁语
		"xh":  "xh",  // 科萨语
		"km":  "km",  // 高棉语
		"lo":  "lo",  // 老挝语
		"ka":  "ka",  // 格鲁吉亚语
		"hy":  "hy",  // 亚美尼亚语
		"tg":  "tg",  // 塔吉克语
		"tk":  "tk",  // 土库曼语
		"kk":  "kk",  // 哈萨克语
		"ky":  "ky",  // 吉尔吉斯语
		"mn":  "mn",  // 蒙古语
		"gd":  "gd",  // 苏格兰盖尔语
		"ga":  "ga",  // 爱尔兰语
		"cy":  "cy",  // 威尔士语
		"ba":  "ba",  // 巴什基尔语
		"ceb": "ceb", // 宿务语
		"tt":  "tt",  // 鞑靼语
		"rw":  "rw",  // 卢旺达语
		"be":  "be",  // 白俄罗斯语
		"mg":  "mg",  // 马达加斯加语
		"sm":  "sm",  // 萨摩亚语
		"to":  "to",  // 汤加语
		"mi":  "mi",  // 毛利语
		"gv":  "gv",  // 马恩岛语
	}

	if mappedLang, exists := languageMap[language]; exists {
		return mappedLang
	}

	return language
}
