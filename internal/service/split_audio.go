package service

import (
	"fmt"
	"io"
	"krillin-ai/internal/storage"
	"krillin-ai/pkg/util"
	"math"
	"os/exec"
	"runtime"

	"golang.org/x/sync/errgroup"
)

// MIN_SEGMENT_DURATION >= MIN_DURATION + TOLERANCE_DURATION * 2 > ENERGY_WINDOW_DURATION > 0
const (
	SAMPLE_RATE            = 3000
	ENERGY_WINDOW_DURATION = 1.5 // 计算音频能量的时间长度
	TOLERANCE_DURATION     = 8   // 容忍的时间误差
	MIN_DURATION           = 10  // 最小音频时长
	MIN_SEGMENT_DURATION   = 20  // 最小分割时长
)

func buildFFmpegCmd(input string, start, end float64) (*exec.Cmd, error) {
	if start < 0 || end <= start {
		return nil, fmt.Errorf("invalid start or end time: start=%f, end=%f", start, end)
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

func getQuietestTimePoint(input string, start, end float64) (second float64, err error) {
	cmd, err := buildFFmpegCmd(input, start, end)
	if err != nil {
		return 0, fmt.Errorf("failed to build ffmpeg command: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return 0, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return 0, fmt.Errorf("failed to start ffmpeg command: [%s] %w", cmd.String(), err)
	}

	originBuffer := make([]byte, 1024)
	headBuffer := [2]byte{}
	circularQueue := util.NewCircularQueue[float32](SAMPLE_RATE * ENERGY_WINDOW_DURATION)
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
			return 0, fmt.Errorf("error reading from stdout: [%s] %w", cmd.String(), err)
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
				minEnergyIndex = index - SAMPLE_RATE*ENERGY_WINDOW_DURATION/2
			}
		}
	}
	if err := cmd.Wait(); err != nil {
		return 0, fmt.Errorf("ffmpeg command run failed: [%s] %w", cmd.String(), err)
	}
	return float64(minEnergyIndex)/SAMPLE_RATE + start, nil
}

func GetSplitPoints(input string, segmentDuration float64) ([]float64, error) {
	if segmentDuration < MIN_SEGMENT_DURATION {
		return nil, fmt.Errorf("segment duration must be greater than %v seconds", MIN_SEGMENT_DURATION)
	}

	audioDuration, err := util.GetAudioDuration(input)
	if err != nil {
		return nil, fmt.Errorf("failed to get audio duration: %w", err)
	}
	segmentNum := int(math.Ceil(audioDuration / segmentDuration))
	timePoints := make([]float64, segmentNum+1)
	for i := range segmentNum {
		timePoints[i] = float64(i) * segmentDuration
	}
	eg := errgroup.Group{}
	eg.SetLimit(runtime.NumCPU())
	for i := 1; i < segmentNum; i++ {
		i := i
		eg.Go(func() error {
			start := timePoints[i] - TOLERANCE_DURATION
			end := timePoints[i] + TOLERANCE_DURATION
			timePoint, err := getQuietestTimePoint(input, start, end)
			if err != nil {
				return fmt.Errorf("failed to get quietest time point: %w", err)
			}
			timePoints[i] = timePoint
			return nil
		})
	}
	if err := eg.Wait(); err != nil {
		return nil, fmt.Errorf("failed to get quietest time points: %w", err)
	}
	// 如果最后一个片段短于最小分割时长，则将其合并到前一个片段
	if audioDuration-timePoints[segmentNum-1] < MIN_DURATION {
		timePoints = timePoints[:segmentNum]
	}
	timePoints[len(timePoints)-1] = audioDuration
	return timePoints, nil
}

func ClipAudio(input, output string, start, end float64) error {
	if start < 0 || end <= start {
		return fmt.Errorf("invalid start or end time: start=%f, end=%f", start, end)
	}
	cmd := exec.Command(
		storage.FfmpegPath,
		"-y",
		"-ss", fmt.Sprintf("%.3f", start), // 起始时间
		"-to", fmt.Sprintf("%.3f", end), // 结束时间
		"-i", input,
		output,
	)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to clip audio: [%s] %w", cmd.String(), err)
	}
	return nil
}
