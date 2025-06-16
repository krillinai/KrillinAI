package util

import (
	"fmt"
	"krillin-ai/internal/storage"
	"os/exec"
)

func ReplaceAudioInVideo(videoFile string, audioFile string, outputFile string) error {
	cmd := exec.Command(storage.FfmpegPath, "-i", videoFile, "-i", audioFile, "-c:v", "copy", "-map", "0:v:0", "-map", "1:a:0", outputFile)

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("error replacing audio in video: %v", err)
	}

	return nil
}
