package dto

import "krillin-ai/internal/types"

type StartVideoSubtitleTaskReq struct {
	AppId                     uint32   `json:"app_id"`
	Url                       string   `json:"url"`
	OriginLanguage            string   `json:"origin_lang"`
	TargetLang                string   `json:"target_lang"`
	Bilingual                 uint8    `json:"bilingual"`
	TranslationSubtitlePos    uint8    `json:"translation_subtitle_pos"`
	ModalFilter               uint8    `json:"modal_filter"`
	Tts                       uint8    `json:"tts"`
	TtsVoiceCode              uint8    `json:"tts_voice_code"`
	TtsVoiceCloneSrcFileUrl   string   `json:"tts_voice_clone_src_file_url"`
	Replace                   []string `json:"replace"`
	Language                  string   `json:"language"`
	EmbedSubtitleVideoType    string   `json:"embed_subtitle_video_type"`
	VerticalMajorTitle        string   `json:"vertical_major_title"`
	VerticalMinorTitle        string   `json:"vertical_minor_title"`
	OriginLanguageWordOneLine int      `json:"origin_language_word_one_line"`
}

type StartVideoSubtitleTaskResData struct {
	TaskId string `json:"task_id"`
}

type StartVideoSubtitleTaskRes struct {
	Error int32                          `json:"error"`
	Msg   string                         `json:"msg"`
	Data  *StartVideoSubtitleTaskResData `json:"data"`
}

type GetVideoSubtitleTaskReq struct {
	TaskId string `form:"taskId"`
}

type VideoInfo struct {
	Title                 string `json:"title"`
	Description           string `json:"description"`
	TranslatedTitle       string `json:"translated_title"`
	TranslatedDescription string `json:"translated_description"`
	Language              string `json:"language"`
}

type SubtitleInfo struct {
	Name        string `json:"name"`
	DownloadUrl string `json:"download_url"`
}

type GetVideoSubtitleTaskResData struct {
	TaskId            string          `json:"task_id"`
	ProcessPercent    uint8           `json:"process_percent"`
	VideoInfo         *VideoInfo      `json:"video_info"`
	SubtitleInfo      []*SubtitleInfo `json:"subtitle_info"`
	TargetLanguage    string          `json:"target_language"`
	SpeechDownloadUrl string          `json:"speech_download_url"`
}

// 获取所有任务
type GetAllTaskReq struct {
}

type GetOneTask struct {
	TaskID   string `json:"task_id"`
	TaskName string `json:"task_name"`
	Status   string `json:"status"`
	Progress int    `json:"progress"`
}
type GetAllTaskRes struct {
	Tasks []GetOneTask `json:"tasks"`
}

type TranslatedItemDTO struct {
	OriginText     string
	TranslatedText string
}
type TaskStatusDTO struct {
	TaskId          string                     `json:"taskId"`
	TaskBasePath    string                     `json:"taskBasePath"`
	Status          uint8                      `json:"status"`
	ProcessPct      uint8                      `json:"processPct"`
	Message         string                     `json:"message,omitempty"`
	OriginLanguage  types.StandardLanguageCode `json:"originLanguage"`
	TargetLanguage  types.StandardLanguageCode `json:"targetLanguage"`
	InterruptStatus string                     `json:"interruptStatus"`
	// 新增：已处理的音频片段状态
	ProcessedAudios       map[int]AudioProcessStatus `json:"processedAudios"`
	PendingTranscriptions []QueueItem[string]        `json:"pendingTranscriptions"`
	PendingTranslations   []QueueItem[string]        `json:"pendingTranslations"`
	LastSavedTime         string                     `json:"lastSavedTime"`
}

type QueueItem[T any] struct {
	Data T   `json:"data"`
	Id   int `json:"id"`
}

type AudioProcessStatus struct {
	Transcribed  bool `json:"transcribed"`
	Translated   bool `json:"translated"`
	SrtGenerated bool `json:"srtGenerated"`
}
type GetVideoSubtitleTaskRes struct {
	Error int32                        `json:"error"`
	Msg   string                       `json:"msg"`
	Data  *GetVideoSubtitleTaskResData `json:"data"`
}
