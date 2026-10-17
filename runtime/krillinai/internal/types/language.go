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

var StandardLanguageCode2Name = func() map[StandardLanguageCode]string {
	result := make(map[StandardLanguageCode]string, len(LanguageCatalog))
	for _, language := range LanguageCatalog {
		result[StandardLanguageCode(language.Code)] = language.NativeName
	}
	return result
}()

func GetStandardLanguageName(code StandardLanguageCode) string {
	if name, ok := StandardLanguageCode2Name[NormalizeLanguage(string(code))]; ok {
		return name
	}
	return string(code)
}
