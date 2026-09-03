package types

type ChatCompleter interface {
	ChatCompletion(query string) (string, error)
}

type Transcriber interface {
	Transcription(audioFile, language, wordDir string) (*TranscriptionData, error)
}

type ProgressTranscriber interface {
	TranscriptionWithProgress(
		audioFile, language, workDir string,
		reportProgress func(percent int),
	) (*TranscriptionData, error)
}

type Ttser interface {
	Text2Speech(text string, voice string, outputFile string) error
}
