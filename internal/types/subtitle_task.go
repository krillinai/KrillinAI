package types

// var SplitTextPrompt = `你是一个英语处理专家，擅长翻译成%s和处理英文文本，根据句意和标点对句子进行拆分。

// - 不要漏掉原英文任何一个单词
// - 翻译一定要流畅，完整表达原文意思
// - 优先根据标点符号进行拆分，遇到逗号、句号、问号，一定要拆分，必须把句子拆短些。
// - 遇到定语从句、并列句等复杂句式，根据连词（如and, but, which, when）进行拆分。
// - 拆分后的单行句子英文不能超过15个单词。
// - 翻译的时候确保每个原始字幕块单独存在且编号和格式正确。
// - 不需要任何额外的话语，直接按下面格式输出结果。

// 1
// [中文翻译]
// [英文句子]

// 2
// [中文翻译]
// [英文句子]

// 内容如下:`

var SplitTextPrompt = `你是一个语言处理专家，专注于自然语言处理和翻译任务。按照以下步骤和要求，以最大程度实现准确和高质量的字幕翻译：

1. 将原句翻译为%s，确保译文流畅、自然，达到专业翻译水平，保持意思不变。
2. 严格依据标点符号（逗号、句号、问号等）将内容拆分成单独的句子，并依据以下规则确保拆分粒度合理：
   - 每个句子在保证句意完整的情况下原文和译文均分别尽量不超过15字符，以免字幕过长影响观感和阅读体验。
   - 可以根据连词（例如 "and", "but", "which", "when", "so", "所以", "但是", "因此", "考虑到" 等）进一步拆分句子，避免语句太长。
3. 对每个拆分的句子分别翻译，确保不遗漏或修改任何字词。
4. 将每对翻译后的句子与原句用独立编号表示，并分别以方括号[]包裹内容。
5. 输出的翻译与原文应保持对应，严格按照原文顺序呈现，不得有错位，与原文表达的意思保持一致，且原文尽可能使用原文。

翻译输出应采用如下格式：
**正常翻译的示例（注意每块3部分，每个部分都独占一行，空格分块）**：
1
[翻译后的句子1]
[原句子1]

2
[翻译后的句子2]
[原句子2]

**无文本需要翻译的输出示例**：
[无文本]

确保高效、精确地完成上述翻译任务，输入内容如下：
`

// 带有语气词过滤的拆分Prompt
var SplitTextPromptWithModalFilter = `你是一个语言处理专家，专注于自然语言处理和翻译任务。按照以下步骤和要求，以最大程度实现准确和高质量的字幕翻译：

1. 将原句翻译为%s，确保译文流畅、自然，达到专业翻译水平，保持意思不变。
2. 严格依据标点符号（逗号、句号、问号等）将内容拆分成单独的句子，并依据以下规则确保拆分粒度合理：
   - 每个句子在保证句意完整的情况下原文和译文均分别尽量不超过15字符，以免字幕过长影响观感和阅读体验。
   - 可以根据连词（例如 "and", "but", "which", "when", "so", "所以", "但是", "因此", "考虑到" 等）进一步拆分句子，避免语句太长。
3. 对每个拆分的句子分别翻译，确保不遗漏或修改任何字词。
4. 将每对翻译后的句子与原句用独立编号表示，并分别以方括号[]包裹内容。
5. 输出的翻译与原文应保持对应，严格按照原文顺序呈现，不得有错位，与原文表达的意思保持一致，且原文尽可能使用原文。
6. 忽略文本中的语气词，比如"Oh" "Ah" "Wow"等等。

翻译输出应采用如下格式：
**正常翻译的示例（注意每块3部分，每个部分都独占一行，空格分块）**：
1
[翻译后的句子1]
[原句子1]

2
[翻译后的句子2]
[原句子2]

**无文本需要翻译的输出示例**：
[无文本]

确保高效、精确地完成上述翻译任务，输入内容如下：
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
	SubtitleTaskVideoFileName                           = "origin_video.mp4"
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
	TaskPtr                     *SubtitleTask // 和storage里面对应
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
	MaxWordOneLine              int // 字幕一行最多显示多少个字
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
