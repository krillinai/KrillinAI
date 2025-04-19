package types

type StandardLanguageCode string

const (
	// 第一批
	LanguageNameSimplifiedChinese  StandardLanguageCode = "zh_cn"
	LanguageNameTraditionalChinese StandardLanguageCode = "zh_tw"
	LanguageNameEnglish            StandardLanguageCode = "en"
	LanguageNameJapanese           StandardLanguageCode = "ja"
	LanguageNameIndonesian         StandardLanguageCode = "id"
	LanguageNameMalaysian          StandardLanguageCode = "ms"
	LanguageNameThai               StandardLanguageCode = "th"
	LanguageNameVietnamese         StandardLanguageCode = "vi"
	LanguageNameFilipino           StandardLanguageCode = "fil"
	LanguageNameKorean             StandardLanguageCode = "ko"
	LanguageNameArabic             StandardLanguageCode = "ar"
	LanguageNameFrench             StandardLanguageCode = "fr"
	LanguageNameGerman             StandardLanguageCode = "de"
	LanguageNameItalian            StandardLanguageCode = "it"
	LanguageNameRussian            StandardLanguageCode = "ru"
	LanguageNamePortuguese         StandardLanguageCode = "pt"
	LanguageNameSpanish            StandardLanguageCode = "es"
	// 第二批
	LanguageNameHindi     StandardLanguageCode = "hi"
	LanguageNameBengali   StandardLanguageCode = "bn"
	LanguageNameHebrew    StandardLanguageCode = "he"
	LanguageNamePersian   StandardLanguageCode = "fa"
	LanguageNameAfrikaans StandardLanguageCode = "af"
	LanguageNameSwedish   StandardLanguageCode = "sv"
	LanguageNameFinnish   StandardLanguageCode = "fi"
	LanguageNameDanish    StandardLanguageCode = "da"
	LanguageNameNorwegian StandardLanguageCode = "no"
	LanguageNameDutch     StandardLanguageCode = "nl"
	LanguageNameGreek     StandardLanguageCode = "el"
	LanguageNameUkrainian StandardLanguageCode = "uk"
	LanguageNameHungarian StandardLanguageCode = "hu"
	LanguageNamePolish    StandardLanguageCode = "pl"
	LanguageNameTurkish   StandardLanguageCode = "tr"
	LanguageNameSerbian   StandardLanguageCode = "sr"
	LanguageNameCroatian  StandardLanguageCode = "hr"
	LanguageNameCzech     StandardLanguageCode = "cs"
	// 第三批
	LanguageNamePinyin        StandardLanguageCode = "pinyin"
	LanguageNameSwahili       StandardLanguageCode = "sw"
	LanguageNameYoruba        StandardLanguageCode = "yo"
	LanguageNameHausa         StandardLanguageCode = "ha"
	LanguageNameAmharic       StandardLanguageCode = "am"
	LanguageNameOromo         StandardLanguageCode = "om"
	LanguageNameIcelandic     StandardLanguageCode = "is"
	LanguageNameLuxembourgish StandardLanguageCode = "lb"
	LanguageNameCatalan       StandardLanguageCode = "ca"
	LanguageNameRomanian      StandardLanguageCode = "ro"
	LanguageNameMoldovan      StandardLanguageCode = "ro" // 和LanguageNameRomanian重复
	LanguageNameSlovak        StandardLanguageCode = "sk"
	LanguageNameBosnian       StandardLanguageCode = "bs"
	LanguageNameMacedonian    StandardLanguageCode = "mk"
	LanguageNameSlovenian     StandardLanguageCode = "sl"
	LanguageNameBulgarian     StandardLanguageCode = "bg"
	LanguageNameLatvian       StandardLanguageCode = "lv"
	LanguageNameLithuanian    StandardLanguageCode = "lt"
	LanguageNameEstonian      StandardLanguageCode = "et"
	LanguageNameMaltese       StandardLanguageCode = "mt"
	LanguageNameAlbanian      StandardLanguageCode = "sq"
	// 第四批
	LanguageNamePunjabi        StandardLanguageCode = "pa"
	LanguageNameJavanese       StandardLanguageCode = "jv"
	LanguageNameTamil          StandardLanguageCode = "ta"
	LanguageNameUrdu           StandardLanguageCode = "ur"
	LanguageNameMarathi        StandardLanguageCode = "mr"
	LanguageNameTelugu         StandardLanguageCode = "te"
	LanguageNamePashto         StandardLanguageCode = "ps"
	LanguageNameLingala        StandardLanguageCode = "ln"
	LanguageNameMalayalam      StandardLanguageCode = "ml"
	LanguageNameHakkaChin      StandardLanguageCode = "cnh"
	LanguageNameUzbek          StandardLanguageCode = "uz"
	LanguageNameKannada        StandardLanguageCode = "kn"
	LanguageNameOdia           StandardLanguageCode = "or"
	LanguageNameIgbo           StandardLanguageCode = "ig"
	LanguageNameZulu           StandardLanguageCode = "zu"
	LanguageNameXhosa          StandardLanguageCode = "xh"
	LanguageNameKhmer          StandardLanguageCode = "km"
	LanguageNameLao            StandardLanguageCode = "lo"
	LanguageNameGeorgian       StandardLanguageCode = "ka"
	LanguageNameArmenian       StandardLanguageCode = "hy"
	LanguageNameTajik          StandardLanguageCode = "tg"
	LanguageNameTurkmen        StandardLanguageCode = "tk"
	LanguageNameKazakh         StandardLanguageCode = "kk"
	LanguageNameKyrgyz         StandardLanguageCode = "ky"
	LanguageNameMongolian      StandardLanguageCode = "mn"
	LanguageNameScottishGaelic StandardLanguageCode = "gd"
	LanguageNameIrish          StandardLanguageCode = "ga"
	LanguageNameWelsh          StandardLanguageCode = "cy"
	LanguageNameBashkir        StandardLanguageCode = "ba"
	LanguageNameCebuano        StandardLanguageCode = "ceb"
	LanguageNameIlocano        StandardLanguageCode = "ilo"
	LanguageNameTatar          StandardLanguageCode = "tt"
	LanguageNamePali           StandardLanguageCode = "pi"
	LanguageNameKinyarwanda    StandardLanguageCode = "rw"
	LanguageNameBelarusian     StandardLanguageCode = "be"
	LanguageNameMalagasy       StandardLanguageCode = "mg"
	LanguageNameTuvaluan       StandardLanguageCode = "tvl"
	LanguageNameMarshallese    StandardLanguageCode = "mh"
	LanguageNameChamorro       StandardLanguageCode = "ch"
	LanguageNameSamoan         StandardLanguageCode = "sm"
	LanguageNameTongan         StandardLanguageCode = "to"
	LanguageNameMaori          StandardLanguageCode = "mi"
	LanguageNameTokPisin       StandardLanguageCode = "tpi"
	LanguageNameChuvash        StandardLanguageCode = "cv"
	LanguageNameKomi           StandardLanguageCode = "kv"
	LanguageNameManx           StandardLanguageCode = "gv"
)

var StandardLanguageCode2Name = map[StandardLanguageCode]string{
	LanguageNameSimplifiedChinese:  "简体中文",
	LanguageNameTraditionalChinese: "繁體中文",
	LanguageNameEnglish:            "English",
	LanguageNameJapanese:           "日本語",
	LanguageNameIndonesian:         "bahasa Indonesia",
	LanguageNameArabic:             "اَلْعَرَبِيَّةُ",
	LanguageNameFilipino:           "Wikang Filipino",
	LanguageNameFrench:             "Français",
	LanguageNameGerman:             "Deutsch",
	LanguageNameItalian:            "Italiano",
	LanguageNameKorean:             "한국어",
	LanguageNameMalaysian:          "Bahasa Melayu",
	LanguageNamePortuguese:         "Português",
	LanguageNameRussian:            "Русский язык",
	LanguageNameSpanish:            "Español",
	LanguageNameThai:               "ภาษาไทย",
	LanguageNameVietnamese:         "Tiếng Việt",
	LanguageNameHindi:              "हिन्दी",
	LanguageNameBengali:            "বাংলা",
	LanguageNameHebrew:             "עברית",
	LanguageNamePersian:            "فارسی",
	LanguageNameAfrikaans:          "Afrikaans",
	LanguageNameSwedish:            "Svenska",
	LanguageNameFinnish:            "Suomi",
	LanguageNameDanish:             "Dansk",
	LanguageNameNorwegian:          "Norsk",
	LanguageNameDutch:              "Nederlands",
	LanguageNameGreek:              "Νέα Ελληνικά;",
	LanguageNameUkrainian:          "Українська",
	LanguageNameHungarian:          "Magyar nyelv",
	LanguageNamePolish:             "Polski",
	LanguageNameTurkish:            "Türkçe",
	LanguageNameSerbian:            "Српски",
	LanguageNameCroatian:           "Hrvatski",
	LanguageNameCzech:              "čeština",
	LanguageNamePinyin:             "Pin yin",
	LanguageNameSwahili:            "Kiswahili",
	LanguageNameYoruba:             "èdè Yorùbá",
	LanguageNameHausa:              "هَرْشٜن هَوْس",
	LanguageNameAmharic:            "አማርኛ",
	LanguageNameOromo:              "afaan Oromoo",
	LanguageNameIcelandic:          "Íslenska",
	LanguageNameLuxembourgish:      "Lëtzebuergesch",
	LanguageNameCatalan:            "Català",
	LanguageNameRomanian:           "Românã",
	LanguageNameSlovak:             "Slovenčina",
	LanguageNameBosnian:            "Босански",
	LanguageNameMacedonian:         "Македонски",
	LanguageNameSlovenian:          "Slovenščina",
	LanguageNameBulgarian:          "Български",
	LanguageNameLatvian:            "Latviski",
	LanguageNameLithuanian:         "Lietuviškai",
	LanguageNameEstonian:           "Eesti keel",
	LanguageNameMaltese:            "Malti",
	LanguageNameAlbanian:           "Shqip",
	LanguageNamePunjabi:            "ਪੰਜਾਬੀ",
	LanguageNameJavanese:           "ꦧꦱꦗꦮ",
	LanguageNameTamil:              "தமிழ்",
	LanguageNameUrdu:               "اردو",
	LanguageNameMarathi:            "मराठी",
	LanguageNameTelugu:             "తెలుగు",
	LanguageNamePashto:             "پښتو",
	LanguageNameLingala:            "Lingála",
	LanguageNameMalayalam:          "മലയാളം",
	LanguageNameHakkaChin:          "客家话",
	LanguageNameUzbek:              "Oʻzbekcha",
	LanguageNameKannada:            "ಕನ್ನಡ",
	LanguageNameOdia:               "ଓଡ଼ିଆ",
	LanguageNameIgbo:               "Igbo",
	LanguageNameZulu:               "isiZulu",
	LanguageNameXhosa:              "isiXhosa",
	LanguageNameKhmer:              "ភាសាខ្មែរ",
	LanguageNameLao:                "ພາສາລາວ",
	LanguageNameGeorgian:           "ქართული",
	LanguageNameArmenian:           "Հայերեն",
	LanguageNameTajik:              "Тоҷикӣ",
	LanguageNameTurkmen:            "Türkmençe",
	LanguageNameKazakh:             "Қазақша",
	LanguageNameKyrgyz:             "Кыргызча",
	LanguageNameMongolian:          "Монгол хэл",
	LanguageNameScottishGaelic:     "Gàidhlig",
	LanguageNameIrish:              "Gaeilge",
	LanguageNameWelsh:              "Cymraeg",
	LanguageNameBashkir:            "Башҡортса",
	LanguageNameCebuano:            "Bisaya",
	LanguageNameIlocano:            "Ilokano",
	LanguageNameTatar:              "Татарча",
	LanguageNamePali:               "पाऴि",
	LanguageNameKinyarwanda:        "Ikinyarwanda",
	LanguageNameBelarusian:         "Беларуская",
	LanguageNameMalagasy:           "Malagasy",
	LanguageNameTuvaluan:           "Te Ggana Tuuvalu",
	LanguageNameMarshallese:        "Kajin M̧ajeļ",
	LanguageNameChamorro:           "Chamoru",
	LanguageNameSamoan:             "Gagana Samoa",
	LanguageNameTongan:             "Lea faka-Tonga",
	LanguageNameMaori:              "Māori",
	LanguageNameTokPisin:           "Tok Pisin",
	LanguageNameChuvash:            "Чӑвашла",
	LanguageNameKomi:               "Коми кыв",
	LanguageNameManx:               "Gaelg",
}

func GetStandardLanguageName(code StandardLanguageCode) string {
	if name, ok := StandardLanguageCode2Name[code]; ok {
		return name
	}
	return "未知"
}
