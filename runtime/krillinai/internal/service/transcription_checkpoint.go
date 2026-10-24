package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"os"
	"path/filepath"
)

// Reusing a verified transcript also keeps the translation source stable after
// interruption. Never reuse it for different audio, language or ASR settings.
func audioTranscriptionCheckpointPath(audio, workdir, language string) string {
	if workdir == "" {
		return ""
	}
	file, err := os.Open(audio)
	if err != nil {
		return ""
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return ""
	}
	settings := config.Conf.Transcribe
	// Credentials do not change the recognition result identity.
	identity, _ := json.Marshal([]any{"audio-transcription-v1", hex.EncodeToString(hash.Sum(nil)), types.NormalizeLanguage(language), settings.Provider,
		settings.Openai.BaseUrl, settings.Openai.Model, settings.Openai.OfficialModel,
		settings.Fasterwhisper.Model, settings.Whisperkit.Model, settings.Whispercpp.Model,
		settings.FunASR.BaseUrl, settings.FunASR.Model, settings.Volcengine.BaseUrl, settings.Volcengine.ResourceId})
	key := sha256.Sum256(identity)
	return filepath.Join(workdir, "audio-transcription-checkpoints", hex.EncodeToString(key[:])+".json")
}

func validAudioTranscriptionCheckpoint(data *types.TranscriptionData) bool {
	if data == nil || !hasSubtitleContent(data.Text) || len(data.Words) == 0 {
		return false
	}
	for _, word := range data.Words {
		if !hasSubtitleContent(word.Text) || word.Start < 0 || word.End <= word.Start {
			return false
		}
	}
	return true
}
