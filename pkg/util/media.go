package util

import (
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
)

// ReplaceAudioInVideo replaces the audio in a video file with a given audio file.
// videoFile: path to the input video file.
// audioFile: path to the input audio file (wav format).
// outputFile: path to the output video file with replaced audio.
func ReplaceAudioInVideo(videoFile string, audioFile string, outputFile string) error {
	// Construct the ffmpeg command to replace audio
	cmd := exec.Command("ffmpeg", "-i", videoFile, "-i", audioFile, "-c:v", "copy", "-map", "0:v:0", "-map", "1:a:0", outputFile)

	// Run the command and capture any errors
	if err := cmd.Run(); err != nil {
		return err
	}

	return nil
}

type NewGenerateSilenceReq struct {
	OutputAudio string
	Duration    float64
}

func NewGenerateSilence(req *NewGenerateSilenceReq) error {
	// 生成 PCM 格式的静音文件
	cmd := exec.Command("ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=44100", "-t",
		fmt.Sprintf("%.3f", req.Duration), "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", req.OutputAudio)
	cmd.Stderr = os.Stderr
	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("failed to generate PCM silence: %w", err)
	}

	return nil
}

type ConcatenateAudioFilesReq struct {
	AudioFiles           []string
	OutputFile           string
	BasePath             string
	UseFormat            bool
	SilenceFile          string
	FrontBackSilenceFile string
}

// ConcatenateAudioFiles 拼接音频文件
func ConcatenateAudioFiles(req *ConcatenateAudioFilesReq) error {
	// 创建一个临时文件保存音频文件列表
	listFile := filepath.Join(req.BasePath, "audio_list.txt")
	f, err := os.Create(listFile)
	if err != nil {
		return err
	}
	defer os.Remove(listFile)
	if len(req.FrontBackSilenceFile) > 0 {
		_, err = f.WriteString(fmt.Sprintf("file '%s'\n", req.FrontBackSilenceFile))
		if err != nil {
			return err
		}
	}
	for i, file := range req.AudioFiles {
		audioFile := filepath.Base(file)
		_, err := f.WriteString(fmt.Sprintf("file '%s'\n", audioFile))
		if err != nil {
			return err
		}
		if len(req.SilenceFile) > 0 {
			if i == len(req.AudioFiles)-1 {
				_, err = f.WriteString(fmt.Sprintf("file '%s'\n", req.FrontBackSilenceFile))
			} else {
				_, err = f.WriteString(fmt.Sprintf("file '%s'\n", req.SilenceFile))
			}
			if err != nil {
				return err
			}
		}
	}
	f.Close()

	args := []string{"-y", "-f", "concat", "-safe", "0", "-i", listFile}
	if req.UseFormat {
		args = append(args, "-c:a", "pcm_s16le")
	} else {
		args = append(args, "-c", "copy")
	}
	args = append(args, req.OutputFile)
	cmd := exec.Command("ffmpeg", args...)
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

type AdjustAudioDurationReq struct {
	InputFile  string
	OutputFile string
	BasePath   string
	Duration   float64
}

// AdjustAudioDuration 调整音频时长，确保音频与要求的时长一致
func AdjustAudioDuration(req *AdjustAudioDurationReq) (float64, error) {
	// 获取音频时长
	audioDuration, err := GetAudioDuration(req.InputFile)
	if err != nil {
		return 0, err
	}

	// 如果音频时长短于字幕时长，插入静音延长音频
	if audioDuration < req.Duration {
		// 计算需要插入的静音时长
		silenceDuration := req.Duration - audioDuration

		// 生成静音音频
		silenceFile := filepath.Join(req.BasePath, "silence.wav")
		err := NewGenerateSilence(&NewGenerateSilenceReq{OutputAudio: silenceFile, Duration: silenceDuration})
		if err != nil {
			return 0, fmt.Errorf("error generating silence: %v", err)
		}

		// 拼接音频和静音
		err = ConcatenateAudioFiles(&ConcatenateAudioFilesReq{
			AudioFiles: []string{req.InputFile, silenceFile},
			OutputFile: req.OutputFile,
			BasePath:   req.BasePath,
		})
		if err != nil {
			return silenceDuration, fmt.Errorf("error concatenating audio and silence: %v", err)
		}
		return silenceDuration, nil
	}

	// 如果音频时长长于字幕时长，缩放音频的播放速率
	if audioDuration > req.Duration {
		// 计算播放速率
		speed := audioDuration / req.Duration
		//if speed < 0.5 || speed > 2.0 {
		//	// 速率在 FFmpeg 支持的范围内一般是 [0.5, 2.0]
		//	return fmt.Errorf("speed factor %.2f is out of range (0.5 to 2.0)", speed)
		//}
		// 使用 atempo 滤镜调整音频播放速率
		if speed > 1.3 {
			log.Printf("Warning: speed factor %.2f is greater than 1.3, using atempo twice\n", speed)
		}
		cmd := exec.Command("ffmpeg", "-y", "-i", req.InputFile, "-filter:a", fmt.Sprintf("atempo=%.2f", speed), req.OutputFile)
		cmd.Stderr = os.Stderr
		return 0, cmd.Run()
	}

	// 如果音频时长和字幕时长相同，则直接复制文件
	return 0, copyFile(req.InputFile, req.OutputFile)
}

// copyFile 复制文件
func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destinationFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destinationFile.Close()

	_, err = io.Copy(destinationFile, sourceFile)
	if err != nil {
		return err
	}

	return destinationFile.Sync()
}
