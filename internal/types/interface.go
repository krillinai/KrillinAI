package types

type ChatCompleter interface {
	ChatCompletion(query string) (string, error)
}

type Transcriber interface {
	Transcription(audioFile, language, wordDir string) (*TranscriptionData, error)
}

type Ttser interface {
	TextToSpeech(text string, voice string, outputFile string) error
}
