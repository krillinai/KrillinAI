package storage

import "os/exec"

var (
	FfmpegPath        string
	FfprobePath       string
	YtdlpPath         string
	YtdlpPrefixArgs   []string
	FasterwhisperPath string
	WhisperXPath      string
	WhisperKitPath    string
	WhispercppPath    string
	EdgeTtsPath       string
	VttToSrtPath      string
)

func YtdlpCommand(args ...string) *exec.Cmd {
	commandArgs := append(append([]string{}, YtdlpPrefixArgs...), args...)
	return exec.Command(YtdlpPath, commandArgs...)
}
