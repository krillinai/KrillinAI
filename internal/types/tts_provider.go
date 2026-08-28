package types

import "context"

type TTSSpeechOptions struct {
	Text         string
	Voice        string
	OutputFile   string
	Format       string
	Speed        float64
	Instructions string
}

type TTSVoice struct {
	Code            string
	Name            string
	Language        string
	Gender          string
	Provider        string
	Scenario        string
	Kind            string
	SupportedModels []string
	Recommended     bool
}

type TTSProvider interface {
	Ttser
	ListVoices(context.Context) ([]TTSVoice, error)
	Synthesize(context.Context, TTSSpeechOptions) error
}
