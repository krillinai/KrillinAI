package types

var SplitTextPrompt = `你是一个语言处理专家，擅长翻译和处理文本，按下面的要求，根据句意和标点对给出的内容进行拆分并翻译：

- 将原句子翻译成 %s，要求翻译自然流畅，和专业翻译员的翻译效果难以区分。
- 不要漏掉和修改原文的任何一个字，要做的仅是拆分和给出对应的翻译，然后用[]将句子包裹。
- 根据标点符号进行拆分，逗号、句号、问号等终止符号，一定要拆分，确保每个句子完整的同时，把句子拆短些。
- 拆分后的句子不要超过15个单词。
- 翻译的时候一定要将对应的原句子翻译完整，不要遗漏原句中的任何信息。
- 上方翻译的句子和下方原句一一对应，不要错乱。
- 不需要任何额外的话语，直接按下面格式输出结果。

1
[翻译后的原句子1]
[原句子1]

2
[翻译后的原句子2]
[原句子2]

内容如下:
`

// 带有语气词过滤的拆分Prompt
var SplitTextPromptWithModalFilter = `你是一个语言处理专家，擅长翻译和处理文本，按下面的要求，根据句意和标点对给出的内容进行拆分并翻译：

- 将原句子翻译成 %s，和专业翻译员的翻译效果难以区分。
- 不要漏掉和修改原文的任何一个字，要做的仅是拆分和给出对应的翻译，然后用[]将句子包裹。
- 根据标点符号进行拆分，逗号、句号、问号等终止符号，一定要拆分，确保每个句子完整的同时，把句子拆短些。
- 拆分后的句子不要超过15个单词。
- 翻译的时候一定要将对应的原句子翻译完整，不要遗漏原句中的任何信息。
- 忽略文本中的语气词，比如"Oh" "Ah" "Wow"等等。
- 上方翻译的句子和下方原句一一对应，不要错乱。
- 不需要任何额外的话语，直接按下面格式输出结果。

1
[翻译后的原句子1]
[原句子1]

2
[翻译后的原句子2]
[原句子2]

内容如下:
`

var SummarizePrompt = `我有一个英文字幕文件(SRT 格式）, 请总结以下弹幕内容，并生成每条内容的简明概述，按以下格式呈现：
{时间戳} {弹幕内容概述}

视频中的弹幕可能涵盖不同主题，如评论、问题、讨论或其他反应。请确保总结保持简洁，能准确传达出每条弹幕的主要信息，并符合以下要求：
- 生成的内容条数不超过20条。
- 时间范围应该涵盖整个弹幕时间戳。
- 时间戳需与弹幕出现的时间一致。
- 内容概述应简练、明确，保留关键信息。
示例输出格式：
00:00 介绍
01:35 Jim的具身智能之旅
04:53 GEAR小组
07:32 机器人领域的三种数据`

var TextSummaryPrompt = `我将向你输入一段文字，请总结这段文字的内容并输出总结结果。
输入内容：
`

var TranslateVideoTitleAndDescriptionPrompt = `你是一个专业的翻译专家，请翻译下面给出的标题和描述信息（两者用####来分隔），要求如下：
 - 将内容翻译成 %s
 - 翻译后的内容仍然用####来分隔标题和描述两部分
 以下全部是源内容，请完整按要求翻译：
%s
`

type SmallAudio struct {
	AudioFile         string
	Num               int
	TranscriptionData *TranscriptionData
	SrtNoTsFile       string
}

type SubtitleResultType int

const (
	SubtitleResultTypeOriginOnly                   SubtitleResultType = iota + 1 // 仅返回原语言字幕
	SubtitleResultTypeTargetOnly                                                 // 仅返回翻译后语言字幕
	SubtitleResultTypeBilingualTranslationOnTop                                  // 返回双语字幕，翻译后的字幕在上
	SubtitleResultTypeBilingualTranslationOnBottom                               // 返回双语字幕，翻译后的字幕在下
)

const (
	SubtitleTaskBilingualYes uint8 = iota + 1
	SubtitleTaskBilingualNo
)

const (
	SubtitleTaskTranslationSubtitlePosTop uint8 = iota + 1
	SubtitleTaskTranslationSubtitlePosBelow
)

const (
	SubtitleTaskModalFilterYes uint8 = iota + 1
	SubtitleTaskModalFilterNo
)

const (
	SubtitleTaskTtsYes uint8 = iota + 1
	SubtitleTaskTtsNo
)

const (
	SubtitleTaskTtsVoiceCodeLongyu uint8 = iota + 1
	SubtitleTaskTtsVoiceCodeLongchen
)

const (
	SubtitleTaskStatusProcessing uint8 = iota + 1
	SubtitleTaskStatusSuccess
	SubtitleTaskStatusFailed
)

const (
	SubtitleTaskAudioFileName                           = "origin_audio.mp3"
	SubtitleTaskSplitAudioFileNamePrefix                = "split_audio"
	SubtitleTaskSplitAudioFileNamePattern               = SubtitleTaskSplitAudioFileNamePrefix + "_%03d.mp3"
	SubtitleTaskSplitAudioTxtFileNamePattern            = "split_audio_txt_%d.txt"
	SubtitleTaskSplitAudioWordsFileNamePattern          = "split_audio_words_%d.txt"
	SubtitleTaskSplitSrtNoTimestampFileNamePattern      = "srt_no_ts_%d.srt"
	SubtitleTaskSrtNoTimestampFileName                  = "srt_no_ts.srt"
	SubtitleTaskSplitBilingualSrtFileNamePattern        = "split_bilingual_srt_%d.srt"
	SubtitleTaskSplitShortOriginMixedSrtFileNamePattern = "split_short_origin_mixed_srt_%d.srt" //长中文+短英文
	SubtitleTaskSplitShortOriginSrtFileNamePattern      = "split_short_origin_srt_%d.srt"       //短英文
	SubtitleTaskBilingualSrtFileName                    = "bilingual_srt.srt"
	SubtitleTaskShortOriginMixedSrtFileName             = "short_origin_mixed_srt.srt" //长中文+短英文
	SubtitleTaskShortOriginSrtFileName                  = "short_origin_srt.srt"       //短英文
	SubtitleTaskOriginLanguageSrtFileName               = "origin_language_srt.srt"
	SubtitleTaskOriginLanguageTextFileName              = "origin_language.txt"
	SubtitleTaskTargetLanguageSrtFileName               = "target_language_srt.srt"
	SubtitleTaskTargetLanguageTextFileName              = "target_language.txt"
	SubtitleTaskStepParamGobPersistenceFileName         = "step_param.gob"
	SubtitleTaskTransferredVerticalVideoFileName        = "transferred_vertical_video.mp4"
	SubtitleTaskHorizontalEmbedVideoFileName            = "horizontal_embed.mp4"
	SubtitleTaskVerticalEmbedVideoFileName              = "vertical_embed.mp4"
)

const (
	TtsAudioDurationDetailsFileName = "audio_duration_details.txt"
	TtsResultAudioFileName          = "tts_final_audio.wav"
)

const (
	AsrMono16kAudioFileName = "mono_16k_audio.mp3"
)

type StandardLanguageName string

const (
	// 第一批
	LanguageNameSimplifiedChinese  StandardLanguageName = "zh_cn"
	LanguageNameTraditionalChinese StandardLanguageName = "zh_tw"
	LanguageNameEnglish            StandardLanguageName = "en"
	LanguageNameJapanese           StandardLanguageName = "ja"
	LanguageNameIndonesian         StandardLanguageName = "id"
	LanguageNameMalaysian          StandardLanguageName = "ms"
	LanguageNameThai               StandardLanguageName = "th"
	LanguageNameVietnamese         StandardLanguageName = "vi"
	LanguageNameFilipino           StandardLanguageName = "fil"
	LanguageNameKorean             StandardLanguageName = "ko"
	LanguageNameArabic             StandardLanguageName = "ar"
	LanguageNameFrench             StandardLanguageName = "fr"
	LanguageNameGerman             StandardLanguageName = "de"
	LanguageNameItalian            StandardLanguageName = "it"
	LanguageNameRussian            StandardLanguageName = "ru"
	LanguageNamePortuguese         StandardLanguageName = "pt"
	LanguageNameSpanish            StandardLanguageName = "es"
	// 第二批
	LanguageNameHindi     StandardLanguageName = "hi"
	LanguageNameBengali   StandardLanguageName = "bn"
	LanguageNameHebrew    StandardLanguageName = "he"
	LanguageNamePersian   StandardLanguageName = "fa"
	LanguageNameAfrikaans StandardLanguageName = "af"
	LanguageNameSwedish   StandardLanguageName = "sv"
	LanguageNameFinnish   StandardLanguageName = "fi"
	LanguageNameDanish    StandardLanguageName = "da"
	LanguageNameNorwegian StandardLanguageName = "no"
	LanguageNameDutch     StandardLanguageName = "nl"
	LanguageNameGreek     StandardLanguageName = "el"
	LanguageNameUkrainian StandardLanguageName = "uk"
	LanguageNameHungarian StandardLanguageName = "hu"
	LanguageNamePolish    StandardLanguageName = "pl"
	LanguageNameTurkish   StandardLanguageName = "tr"
	LanguageNameSerbian   StandardLanguageName = "sr"
	LanguageNameCroatian  StandardLanguageName = "hr"
	LanguageNameCzech     StandardLanguageName = "cs"
	// 第三批
	LanguageNamePinyin        StandardLanguageName = "pinyin"
	LanguageNameSwahili       StandardLanguageName = "sw"
	LanguageNameYoruba        StandardLanguageName = "yo"
	LanguageNameHausa         StandardLanguageName = "ha"
	LanguageNameAmharic       StandardLanguageName = "am"
	LanguageNameOromo         StandardLanguageName = "om"
	LanguageNameIcelandic     StandardLanguageName = "is"
	LanguageNameLuxembourgish StandardLanguageName = "lb"
	LanguageNameCatalan       StandardLanguageName = "ca"
	LanguageNameRomanian      StandardLanguageName = "ro"
	LanguageNameMoldovan      StandardLanguageName = "ro" // 和LanguageNameRomanian重复
	LanguageNameSlovak        StandardLanguageName = "sk"
	LanguageNameBosnian       StandardLanguageName = "bs"
	LanguageNameMacedonian    StandardLanguageName = "mk"
	LanguageNameSlovenian     StandardLanguageName = "sl"
	LanguageNameBulgarian     StandardLanguageName = "bg"
	LanguageNameLatvian       StandardLanguageName = "lv"
	LanguageNameLithuanian    StandardLanguageName = "lt"
	LanguageNameEstonian      StandardLanguageName = "et"
	LanguageNameMaltese       StandardLanguageName = "mt"
	LanguageNameAlbanian      StandardLanguageName = "sq"
)

type SubtitleFileInfo struct {
	Name               string
	Path               string
	LanguageIdentifier string // 在最终下载的文件里标识语言，如zh_cn，en，bilingual
}

type SubtitleTaskStepParam struct {
	TaskId                      string
	TaskBasePath                string
	Link                        string
	AudioFilePath               string
	SmallAudios                 []*SmallAudio
	SubtitleResultType          SubtitleResultType
	EnableModalFilter           bool
	EnableTts                   bool
	TtsVoiceCode                string // 人声语音编码
	VoiceCloneAudioUrl          string // 音色克隆的源音频oss地址
	ReplaceWordsMap             map[string]string
	OriginLanguage              StandardLanguageName // 视频源语言
	TargetLanguage              StandardLanguageName // 用户希望的目标翻译语言
	UserUILanguage              StandardLanguageName // 用户的使用语言
	BilingualSrtFilePath        string
	ShortOriginMixedSrtFilePath string
	SubtitleInfos               []SubtitleFileInfo
	TtsSourceFilePath           string
	TtsResultFilePath           string
	InputVideoPath              string // 源视频路径
	EmbedSubtitleVideoType      string // 合成字幕嵌入的视频类型 none不嵌入 horizontal横屏 vertical竖屏
	VerticalVideoMajorTitle     string // 合成竖屏视频的主标题
	VerticalVideoMinorTitle     string
	OriginLanguageWordOneLine   int // 源语言字幕一行显示多少个字
}

type SrtSentence struct {
	Text  string
	Start float64
	End   float64
}

type SrtSentenceWithStrTime struct {
	Text  string
	Start string
	End   string
}

type SubtitleInfo struct {
	Id          uint64 `json:"id" gorm:"column:id"`                                  // 自增id
	TaskId      string `json:"task_id" gorm:"column:task_id"`                        // task_id
	Uid         uint32 `json:"uid" gorm:"column:uid"`                                // 用户id
	Name        string `json:"name" gorm:"column:name"`                              // 字幕名称
	DownloadUrl string `json:"download_url" gorm:"column:download_url"`              // 字幕地址
	CreateTime  int64  `json:"create_time" gorm:"column:create_time;autoCreateTime"` // 创建时间
}

type SubtitleTask struct {
	Id                    uint64         `json:"id" gorm:"column:id"`                                         // 自增id
	TaskId                string         `json:"task_id" gorm:"column:task_id"`                               // 任务id
	Title                 string         `json:"title" gorm:"column:title"`                                   // 标题
	Description           string         `json:"description" gorm:"column:description"`                       // 描述
	TranslatedTitle       string         `json:"translated_title" gorm:"column:translated_title"`             // 翻译后的标题
	TranslatedDescription string         `json:"translated_description" gorm:"column:translated_description"` // 翻译后的描述
	OriginLanguage        string         `json:"origin_language" gorm:"column:origin_language"`               // 视频原语言
	TargetLanguage        string         `json:"target_language" gorm:"column:target_language"`               // 翻译任务的目标语言
	VideoSrc              string         `json:"video_src" gorm:"column:video_src"`                           // 视频地址
	Status                uint8          `json:"status" gorm:"column:status"`                                 // 1-处理中,2-成功,3-失败
	LastSuccessStepNum    uint8          `json:"last_success_step_num" gorm:"column:last_success_step_num"`   // 最后成功的子任务序号，用于任务恢复
	FailReason            string         `json:"fail_reason" gorm:"column:fail_reason"`                       // 失败原因
	ProcessPct            uint8          `json:"process_percent" gorm:"column:process_percent"`               // 处理进度
	Duration              uint32         `json:"duration" gorm:"column:duration"`                             // 视频时长
	SrtNum                int            `json:"srt_num" gorm:"column:srt_num"`                               // 字幕数量
	SubtitleInfos         []SubtitleInfo `gorm:"foreignKey:TaskId;references:TaskId"`
	Cover                 string         `json:"cover" gorm:"column:cover"`                             // 封面
	SpeechDownloadUrl     string         `json:"speech_download_url" gorm:"column:speech_download_url"` // 语音文件下载地址
	CreateTime            int64          `json:"create_time" gorm:"column:create_time;autoCreateTime"`  // 创建时间
	UpdateTime            int64          `json:"update_time" gorm:"column:update_time;autoUpdateTime"`  // 更新时间
}

type Word struct {
	Num   int
	Text  string
	Start float64
	End   float64
}

type TranscriptionData struct {
	Language string
	Text     string
	Words    []Word
}
