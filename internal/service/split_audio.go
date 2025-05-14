package service

import (
	"fmt"
	"io"
	"krillin-ai/internal/storage"
	"krillin-ai/pkg/util"
	"math"
	"os/exec"
)

const (
	SAMPLE_RATE     = 3000
	DURATION_SECOND = 2 // 计算音频能量的时间长度
)

func buildFFmpegCmd(input string, start, end float32) (*exec.Cmd, error) {
	if start < 0 || end <= start {
		return nil, fmt.Errorf("invalid start or end time")
	}
	cmd := exec.Command(
		storage.FfmpegPath,
		"-y",
		"-ss", fmt.Sprintf("%.3f", start), // 起始时间
		"-to", fmt.Sprintf("%.3f", end), // 结束时间
		"-i", input,

		"-f", "s16le",
		"-ar", fmt.Sprintf("%d", SAMPLE_RATE),
		"-ac", "1",
		"-af", "lowpass=f=3000,highpass=f=300",
		"pipe:1",
	)
	return cmd, nil
}

func getSilenceTimePoint(input string, start, end float32) (second float32, err error) {
	cmd, err := buildFFmpegCmd(input, start, end)
	if err != nil {
		return 0, fmt.Errorf("failed to build ffmpeg command: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return 0, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return 0, fmt.Errorf("failed to start ffmpeg command: %w", err)
	}

	originBuffer := make([]byte, 1024)
	headBuffer := [2]byte{}
	circularQueue := util.NewCircularQueue[float32](SAMPLE_RATE * DURATION_SECOND)
	currentEnergy := float32(0)
	index := 0
	var (
		minEnergy      float32 = math.MaxFloat32
		minEnergyIndex int
	)
	for {
		n, err := stdout.Read(originBuffer)
		if err == io.EOF {
			break
		}
		if err != nil {
			return 0, fmt.Errorf("error reading from stdout: %w", err)
		}
		for i := range n {
			if i%2 == 0 {
				headBuffer[0] = originBuffer[i]
				continue
			}
			headBuffer[1] = originBuffer[i]
			index++
			sample := int16(headBuffer[0]) | int16(headBuffer[1])<<8
			sampleEnergy := float32(sample) * float32(sample)
			if !circularQueue.IsFull() {
				circularQueue.Enqueue(sampleEnergy)
				currentEnergy += sampleEnergy
				continue
			}
			earliestEnergy, _ := circularQueue.Dequeue()
			currentEnergy -= earliestEnergy
			circularQueue.Enqueue(sampleEnergy)
			currentEnergy += sampleEnergy

			if currentEnergy <= minEnergy {
				minEnergy = currentEnergy
				minEnergyIndex = index - SAMPLE_RATE*DURATION_SECOND/2
			}
		}
	}
	if err := cmd.Wait(); err != nil {
		return 0, fmt.Errorf("ffmpeg command failed: %w", err)
	}
	return float32(minEnergyIndex)/SAMPLE_RATE + start, nil
}
