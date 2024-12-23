package types

func GetStandardLanguageName(code StandardLanguageName) string {
	switch code {
	case LanguageNameSimplifiedChinese:
		return "简体中文"
	case LanguageNameTraditionalChinese:
		return "繁體中文"
	case LanguageNameEnglish:
		return "English"
	case LanguageNameJapanese:
		return "日本語"
	case LanguageNameIndonesian:
		return "bahasa Indonesia"
	case LanguageNameArabic:
		return "اَلْعَرَبِيَّةُ"
	case LanguageNameFilipino:
		return "Wikang Filipino"
	case LanguageNameFrench:
		return "Français"
	case LanguageNameGerman:
		return "Deutsch"
	case LanguageNameItalian:
		return "Italiano"
	case LanguageNameKorean:
		return "한국어"
	case LanguageNameMalaysian:
		return "Bahasa Melayu"
	case LanguageNamePortuguese:
		return "Português"
	case LanguageNameRussian:
		return "Русский язык"
	case LanguageNameSpanish:
		return "Español"
	case LanguageNameThai:
		return "ภาษาไทย"
	case LanguageNameVietnamese:
		return "Tiếng Việt"
	case LanguageNameHindi:
		return "हिन्दी"
	case LanguageNameBengali:
		return "বাংলা"
	case LanguageNameHebrew:
		return "עברית"
	case LanguageNamePersian:
		return "فارسی"
	case LanguageNameAfrikaans:
		return "Afrikaans"
	case LanguageNameSwedish:
		return "Svenska"
	case LanguageNameFinnish:
		return "Suomi"
	case LanguageNameDanish:
		return "Dansk"
	case LanguageNameNorwegian:
		return "Norsk"
	case LanguageNameDutch:
		return "Nederlands"
	case LanguageNameGreek:
		return "Νέα Ελληνικά;"
	case LanguageNameUkrainian:
		return "Українська"
	case LanguageNameHungarian:
		return "Magyar nyelv"
	case LanguageNamePolish:
		return "Polski"
	case LanguageNameTurkish:
		return "Türkçe"
	case LanguageNameSerbian:
		return "Српски"
	case LanguageNameCroatian:
		return "Hrvatski"
	case LanguageNameCzech:
		return "čeština"
	case LanguageNamePinyin:
		return "Pin yin"
	case LanguageNameSwahili:
		return "Kiswahili"
	case LanguageNameYoruba:
		return "èdè Yorùbá"
	case LanguageNameHausa:
		return "هَرْشٜن هَوْس"
	case LanguageNameAmharic:
		return "አማርኛ"
	case LanguageNameOromo:
		return "afaan Oromoo"
	case LanguageNameIcelandic:
		return "Íslenska"
	case LanguageNameLuxembourgish:
		return "Lëtzebuergesch"
	case LanguageNameCatalan:
		return "Català"
	case LanguageNameRomanian:
		return "Românã"
	// LanguageNameMoldovan 和 LanguageNameRomanian 共用
	case LanguageNameSlovak:
		return "Slovenčina"
	case LanguageNameBosnian:
		return "Босански"
	case LanguageNameMacedonian:
		return "Македонски"
	case LanguageNameSlovenian:
		return "Slovenščina"
	case LanguageNameBulgarian:
		return "Български"
	case LanguageNameLatvian:
		return "Latviski"
	case LanguageNameLithuanian:
		return "Lietuviškai"
	case LanguageNameEstonian:
		return "Eesti keel"
	case LanguageNameMaltese:
		return "Malti"
	case LanguageNameAlbanian:
		return "Shqip"
	default:
		return "未知"
	}
}
