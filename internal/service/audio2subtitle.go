package service

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"

	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
	"golang.org/x/sync/semaphore"
)

func (s Service) audioToSubtitle(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	var err error
	err = s.splitAudio(ctx, stepParam)
	if err != nil {
		return fmt.Errorf("audioToSubtitle splitAudio error: %w", err)
	}
	err = s.audioToSrt_Parallel(ctx, stepParam) // 这里进度更新到90%了
	if err != nil {
		return fmt.Errorf("audioToSubtitle audioToSrt error: %w", err)
	}
	err = s.splitSrt(ctx, stepParam)
	if err != nil {
		return fmt.Errorf("audioToSubtitle splitSrt error: %w", err)
	}
	// 更新字幕任务信息
	stepParam.TaskPtr.ProcessPct = 95
	return nil
}

func (s Service) splitAudio(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	log.GetLogger().Info("audioToSubtitle.splitAudio start", zap.String("task id", stepParam.TaskId))
	var err error
	// 使用ffmpeg分割音频
	outputPattern := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskSplitAudioFileNamePattern) // 输出文件格式
	segmentDuration := config.Conf.App.SegmentDuration * 60

	cmd := exec.Command(
		storage.FfmpegPath,
		"-i", stepParam.AudioFilePath, // 输入
		"-f", "segment", // 输出文件格式为分段
		"-segment_time", fmt.Sprintf("%d", segmentDuration), // 每段时长（以秒为单位）
		"-reset_timestamps", "1", // 重置每段时间戳
		"-y", // 覆盖输出文件
		outputPattern,
	)
	err = cmd.Run()
	if err != nil {
		log.GetLogger().Error("audioToSubtitle splitAudio ffmpeg err", zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("audioToSubtitle splitAudio ffmpeg err: %w", err)
	}

	// 获取分割后的文件列表
	audioFiles, err := filepath.Glob(filepath.Join(stepParam.TaskBasePath, fmt.Sprintf("%s_*.mp3", types.SubtitleTaskSplitAudioFileNamePrefix)))
	if err != nil {
		log.GetLogger().Error("audioToSubtitle splitAudio filepath.Glob err", zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("audioToSubtitle splitAudio filepath.Glob err: %w", err)
	}
	if len(audioFiles) == 0 {
		log.GetLogger().Error("audioToSubtitle splitAudio no audio files found", zap.Any("stepParam", stepParam))
		return errors.New("audioToSubtitle splitAudio no audio files found")
	}

	num := 0
	for _, audioFile := range audioFiles {
		stepParam.SmallAudios = append(stepParam.SmallAudios, &types.SmallAudio{
			AudioFile: audioFile,
			Num:       num,
		})
		num++
	}

	// 更新字幕任务信息
	stepParam.TaskPtr.ProcessPct = 20

	log.GetLogger().Info("audioToSubtitle.splitAudio end", zap.String("task id", stepParam.TaskId))
	return nil
}

func (s Service) audioToSrt(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	log.GetLogger().Info("audioToSubtitle.audioToSrt start", zap.Any("taskId", stepParam.TaskId))
	var (
		cancel              context.CancelFunc
		stepNum             = 0
		parallelControlChan = make(chan struct{}, config.Conf.App.TranslateParallelNum)
		eg                  *errgroup.Group
		stepNumMu           sync.Mutex
		err                 error
	)
	ctx, cancel = context.WithCancel(ctx)
	defer cancel()
	eg, ctx = errgroup.WithContext(ctx)
	for _, audioFileItem := range stepParam.SmallAudios {
		parallelControlChan <- struct{}{}
		audioFile := audioFileItem
		eg.Go(func() error {
			defer func() {
				<-parallelControlChan
				if r := recover(); r != nil {
					log.GetLogger().Error("audioToSubtitle.audioToSrt panic recovered", zap.Any("panic", r), zap.String("stack", string(debug.Stack())))
				}
			}()
			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
			}
			// 语音转文字
			var transcriptionData *types.TranscriptionData
			for i := 0; i < 3; i++ {
				language := string(stepParam.OriginLanguage)
				if language == "zh_cn" {
					language = "zh" // 切换一下
				}
				transcriptionData, err = s.Transcriber.Transcription(audioFile.AudioFile, language, stepParam.TaskBasePath)
				if err == nil {
					break
				}
			}
			if err != nil {
				cancel()
				log.GetLogger().Error("audioToSubtitle audioToSrt Transcription err", zap.Any("stepParam", stepParam), zap.String("audio file", audioFile.AudioFile), zap.Error(err))
				return fmt.Errorf("audioToSubtitle audioToSrt Transcription err: %w", err)
			}

			if transcriptionData.Text == "" {
				log.GetLogger().Info("audioToSubtitle audioToSrt TranscriptionData.Text is empty", zap.Any("stepParam", stepParam), zap.String("audio file", audioFile.AudioFile))
			}

			audioFile.TranscriptionData = transcriptionData

			// 更新字幕任务信息
			stepNumMu.Lock()
			stepNum++
			processPct := uint8(20 + 70*stepNum/(len(stepParam.SmallAudios)*2))
			stepParam.TaskPtr.ProcessPct = processPct
			stepNumMu.Unlock()

			// 拆分字幕并翻译
			err = s.splitTextAndTranslate(stepParam.TaskId, stepParam.TaskBasePath, stepParam.TargetLanguage, stepParam.EnableModalFilter, audioFile)
			if err != nil {
				cancel()
				log.GetLogger().Error("audioToSubtitle audioToSrt splitTextAndTranslate err", zap.Any("stepParam", stepParam), zap.String("audio file", audioFile.AudioFile), zap.Error(err))
				return fmt.Errorf("audioToSubtitle audioToSrt err: %w", err)
			}

			stepNumMu.Lock()
			stepNum++
			processPct = uint8(20 + 70*stepNum/(len(stepParam.SmallAudios)*2))
			stepParam.TaskPtr.ProcessPct = processPct
			stepNumMu.Unlock()

			// 生成时间戳
			err = s.generateTimestamps(stepParam.TaskId, stepParam.TaskBasePath, stepParam.OriginLanguage, stepParam.SubtitleResultType, audioFile, stepParam.MaxWordOneLine)
			if err != nil {
				cancel()
				log.GetLogger().Error("audioToSubtitle audioToSrt generateTimestamps err", zap.Any("stepParam", stepParam), zap.String("audio file", audioFile.AudioFile), zap.Error(err))
				return fmt.Errorf("audioToSubtitle audioToSrt err: %w", err)
			}
			return nil
		})
	}

	if err = eg.Wait(); err != nil {
		log.GetLogger().Error("audioToSubtitle audioToSrt eg.Wait err", zap.Any("taskId", stepParam.TaskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle audioToSrt eg.Wait err: %w", err)
	}

	// 合并文件
	originNoTsFiles := make([]string, 0)
	bilingualFiles := make([]string, 0)
	shortOriginMixedFiles := make([]string, 0)
	shortOriginFiles := make([]string, 0)
	for i := 0; i < len(stepParam.SmallAudios); i++ {
		splitOriginNoTsFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskSplitSrtNoTimestampFileNamePattern, i))
		originNoTsFiles = append(originNoTsFiles, splitOriginNoTsFile)
		splitBilingualFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskSplitBilingualSrtFileNamePattern, i))
		bilingualFiles = append(bilingualFiles, splitBilingualFile)
		shortOriginMixedFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskSplitShortOriginMixedSrtFileNamePattern, i))
		shortOriginMixedFiles = append(shortOriginMixedFiles, shortOriginMixedFile)
		shortOriginFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskSplitShortOriginSrtFileNamePattern, i))
		shortOriginFiles = append(shortOriginFiles, shortOriginFile)
	}

	// 合并原始无时间戳字幕
	originNoTsFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskSrtNoTimestampFileName)
	err = util.MergeFile(originNoTsFile, originNoTsFiles...)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle audioToSrt merge originNoTsFile err",
			zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("audioToSubtitle audioToSrt merge originNoTsFile err: %w", err)
	}

	// 合并最终双语字幕
	bilingualFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskBilingualSrtFileName)
	err = util.MergeSrtFiles(bilingualFile, bilingualFiles...)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle audioToSrt merge BilingualFile err",
			zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("audioToSubtitle audioToSrt merge BilingualFile err: %w", err)
	}

	//合并最终双语字幕 长中文+短英文
	shortOriginMixedFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskShortOriginMixedSrtFileName)
	err = util.MergeSrtFiles(shortOriginMixedFile, shortOriginMixedFiles...)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle audioToSrt merge shortOriginMixedFile err",
			zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("audioToSrt merge shortOriginMixedFile err: %w", err)
	}
	stepParam.ShortOriginMixedSrtFilePath = shortOriginMixedFile

	// 合并最终原始字幕 短英文
	shortOriginFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskShortOriginSrtFileName)
	err = util.MergeSrtFiles(shortOriginFile, shortOriginFiles...)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle audioToSrt mergeShortOriginFile err",
			zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("audioToSrt mergeShortOriginFile err: %w", err)
	}

	// 供后续分割单语使用
	stepParam.BilingualSrtFilePath = bilingualFile

	// 更新字幕任务信息
	stepParam.TaskPtr.ProcessPct = 90

	log.GetLogger().Info("audioToSubtitle.audioToSrt end", zap.Any("taskId", stepParam.TaskId))

	return nil
}

// audioToSrt orchestrates the transcription, translation, and timestamping pipeline.
// Transcription: Sequential
// Translation:   Parallel (Managed by errgroup)
// Timestamping:  Sequential (Reads output from translation)
func (s Service) audioToSrt_Parallel(parentCtx context.Context, stepParam *types.SubtitleTaskStepParam) (err error) {
	log.GetLogger().Info("audioToSubtitle.audioToSrt_Parallel start", zap.String("taskId", stepParam.TaskId))
	eg, ctx := errgroup.WithContext(parentCtx)
	// Note: We don't need a separate context.WithCancel here,
	// errgroup.WithContext provides one. Its cancel func is implicitly
	// called if any eg.Go func returns an error.
	var stepNum int64
	var stepNumMu sync.Mutex
	totalSteps := int64(len(stepParam.SmallAudios) * 3) // Approx total steps
	// --- Determine Concurrency for Translation ---
	translationConcurrency := int64(config.Conf.App.TranslateParallelNum)
	if translationConcurrency <= 0 {
		translationConcurrency = 4 // Default concurrency if config is invalid
		log.GetLogger().Warn("TranslateParallelNum config is invalid, using default", zap.Int64("default", translationConcurrency))
	}
	// --- Channels ---
	// Buffer size should ideally accommodate concurrency to avoid blocking writers if reader is slow.
	chanBuffer := len(stepParam.SmallAudios)
	if chanBuffer < int(translationConcurrency) {
		chanBuffer = int(translationConcurrency) // Ensure buffer is at least concurrency level
	}
	translationInputChan := make(chan *types.SmallAudio, chanBuffer)  // Transcription -> Translation
	translationOutputChan := make(chan *types.SmallAudio, chanBuffer) // Translation -> Timestamping
	// --- Semaphore (Only for Translation) ---
	// Use golang.org/x/sync/semaphore for weighted semaphore
	translationSemaphore := semaphore.NewWeighted(translationConcurrency)
	// --- Progress Update Helper ---
	updateProgress := func(stageName string, audioFileNum int) {
		stepNumMu.Lock()
		defer stepNumMu.Unlock()
		stepNum++
		progress := uint8(0)
		if totalSteps > 0 {
			// Scale progress more reasonably within the 20-90 range
			progress = uint8(20 + (70 * stepNum / totalSteps))
		} else {
			progress = 20
		}
		// Clamp progress
		if progress < 20 {
			progress = 20
		}
		if progress > 90 {
			progress = 90
		}
		// Avoid database writes if progress hasn't changed significantly? (Optional optimization)
		// Or just update always:
		stepParam.TaskPtr.ProcessPct = progress
		// TODO: Consider if TaskPtr needs its own mutex if updated elsewhere,
		// or if the DB update handles concurrency. For now, assuming safe within this func scope.
	}
	// --- Launch Stage 1: Transcription (Sequential) ---
	eg.Go(func() error {
		// This function now returns error on failure and closes translationInputChan on success or failure.
		// It should NOT call cancel() directly; returning error handles cancellation via errgroup.
		return s.runTranscriptionStage(ctx, stepParam, translationInputChan, updateProgress)
	})
	// --- Launch Stage 2: Translation Manager & Workers (Parallel) ---
	eg.Go(func() error {
		// This function launches workers using eg.Go and closes translationOutputChan ONLY after
		// all workers it launched have completed successfully. Errors from workers propagate via errgroup.
		// It should NOT call cancel() directly.
		return s.runTranslationStageAndWorkers(ctx, stepParam, translationInputChan, translationOutputChan, translationSemaphore, updateProgress)
	})
	// --- Stage 3: Timestamping (Sequential) ---
	// This runs *after* the translation stage signals completion by closing translationOutputChan.
	// We use a separate goroutine for timestamping as well, managed by the errgroup.
	// This ensures that if timestamping fails, the main eg.Wait() will catch it.
	var timestampErr error // Capture timestamp specific error
	eg.Go(func() error {
		log.GetLogger().Info("Starting sequential timestamping stage (waiting for input)...")
		itemsTimestamped := 0
		for translatedItem := range translationOutputChan { // Read until the channel is closed
			itemsTimestamped++
			// Check context before processing each item. Crucial if a worker failed.
			select {
			case <-ctx.Done():
				log.GetLogger().Warn("Timestamping stage detected cancellation before processing item", zap.Int("audio_file_num", translatedItem.Num), zap.Error(ctx.Err()))
				// Drain the channel to allow the translation stage goroutine to finish closing the channel.
				// This prevents a potential deadlock if translation is waiting to write while timestamping has exited.
				go func() {
					log.GetLogger().Warn("Draining translationOutputChan after timestamping cancellation")
					for range translationOutputChan {
					}
				}()
				return fmt.Errorf("timestamping cancelled: %w", ctx.Err()) // Return context error
			default:
				// Process the item sequentially
				err := s.processTimestamping(ctx, stepParam, translatedItem, updateProgress)
				if err != nil {
					log.GetLogger().Error("Error during sequential timestamping processing", zap.Int("audio_file_num", translatedItem.Num), zap.Error(err))
					// No need to call cancel() here, returning error triggers errgroup cancellation
					timestampErr = err // Store specific error if needed for logging later
					// Drain the channel on error as well
					go func() {
						log.GetLogger().Warn("Draining translationOutputChan after timestamping error")
						for range translationOutputChan {
						}
					}()
					return fmt.Errorf("timestamping failed for item %d: %w", translatedItem.Num, err)
				}
			}
		}
		log.GetLogger().Info("Timestamping stage finished processing items.", zap.Int("items_processed", itemsTimestamped))
		return nil // Timestamping completed successfully
	})
	// --- Wait for all stages ---
	// Wait blocks until all eg.Go routines complete or one returns an error.
	// If an error occurs, ctx is cancelled, and Wait returns the first error.
	waitErr := eg.Wait()
	if waitErr != nil {
		// Log the primary error caught by the errgroup
		log.GetLogger().Error("Pipeline failed", zap.String("taskId", stepParam.TaskId), zap.Error(waitErr))
		// Check if the error came specifically from timestamping for more detailed logging if needed
		if timestampErr != nil && errors.Is(waitErr, timestampErr) {
			log.GetLogger().Error("Timestamping stage was the source of the pipeline error.", zap.Error(timestampErr))
		}
		// Check if the error is context cancellation (which might have originated from any stage)
		if errors.Is(waitErr, context.Canceled) || errors.Is(waitErr, context.DeadlineExceeded) {
			log.GetLogger().Warn("Pipeline context was cancelled or timed out.", zap.Error(waitErr))
		}
		return fmt.Errorf("pipeline processing error: %w", waitErr)
	}
	// --- Merge Files (Only if pipeline succeeded) ---
	log.GetLogger().Info("All processing stages finished successfully. Starting file merge.")
	mergeErr := s.mergeProcessedFiles(stepParam)
	if mergeErr != nil {
		log.GetLogger().Error("File merge failed after successful processing stages", zap.String("taskId", stepParam.TaskId), zap.Error(mergeErr))
		return mergeErr // Return merge error
	}
	// --- Final Progress Update ---
	stepNumMu.Lock()
	stepParam.TaskPtr.ProcessPct = 90 // Set to 90 after merge
	stepNumMu.Unlock()
	// TODO: Persist final progress update if needed
	log.GetLogger().Info("audioToSubtitle.audioToSrt_Parallel end successfully", zap.String("taskId", stepParam.TaskId))
	return nil // Success
}

// runTranscriptionStage processes audio files sequentially for transcription.
// It sends results to translationInputChan and closes the channel when done or on error.
// It returns an error if transcription fails for any file or if context is cancelled.
func (s Service) runTranscriptionStage(
	ctx context.Context,
	stepParam *types.SubtitleTaskStepParam,
	translationInputChan chan<- *types.SmallAudio,
	updateProgress func(string, int),
) (err error) {
	// Ensure channel is closed regardless of how the function exits
	defer func() {
		close(translationInputChan)
		log.GetLogger().Debug("Closed translationInputChan")
		if r := recover(); r != nil {
			errMsg := fmt.Sprintf("panic during transcription stage: %v", r)
			log.GetLogger().Error("Transcription stage panic recovered", zap.Any("panic", r), zap.String("stack", string(debug.Stack())))
			// Ensure the error is returned so errgroup cancels context
			err = errors.New(errMsg)
		}
	}()
	log.GetLogger().Info("Transcription stage started.")
	for i, audioFile := range stepParam.SmallAudios {
		// Capture range variable for closure
		currentAudioFile := audioFile
		log.GetLogger().Debug("Processing transcription", zap.Int("index", i), zap.Int("num", currentAudioFile.Num))
		// Check for cancellation before starting work on an item
		select {
		case <-ctx.Done():
			log.GetLogger().Warn("Transcription stage cancelled before processing item", zap.Int("audio_file_num", currentAudioFile.Num), zap.Error(ctx.Err()))
			return ctx.Err() // Return context error to errgroup
		default:
		}
		log.GetLogger().Info("Starting transcription", zap.Int("audio_file_num", currentAudioFile.Num), zap.String("file", currentAudioFile.AudioFile))
		var transcriptionData *types.TranscriptionData
		var transcribeErr error
		for attempt := 0; attempt < 3; attempt++ { // Retry logic
			// Check for cancellation within retry loop
			select {
			case <-ctx.Done():
				log.GetLogger().Warn("Transcription cancelled during retry loop", zap.Int("audio_file_num", currentAudioFile.Num), zap.Error(ctx.Err()))
				return ctx.Err()
			default:
			}
			language := string(stepParam.OriginLanguage)
			// Handle specific language mapping if necessary
			if language == "zh_cn" {
				language = "zh"
			}
			// Perform transcription
			transcriptionData, transcribeErr = s.Transcriber.Transcription(currentAudioFile.AudioFile, language, stepParam.TaskBasePath)
			if transcribeErr == nil {
				break // Success, exit retry loop
			}
			log.GetLogger().Warn("Transcription attempt failed, retrying",
				zap.Int("audio_file_num", currentAudioFile.Num),
				zap.Int("attempt", attempt+1),
				zap.Error(transcribeErr))
			// Optional: Add delay between retries if needed
			// time.Sleep(500 * time.Millisecond)
		}
		// Check result after retries
		if transcribeErr != nil {
			log.GetLogger().Error("Transcription final error after retries", zap.Int("audio_file_num", currentAudioFile.Num), zap.Error(transcribeErr))
			// Return error to errgroup, no need to call cancel()
			return fmt.Errorf("transcription failed for file %d after retries: %w", currentAudioFile.Num, transcribeErr)
		}
		if transcriptionData == nil {
			log.GetLogger().Error("Transcription returned nil data without error", zap.Int("audio_file_num", currentAudioFile.Num))
			return fmt.Errorf("transcription returned nil data without error for file %d", currentAudioFile.Num)
		}
		// It's okay if text is empty, just log it
		if transcriptionData.Text == "" {
			log.GetLogger().Info("Transcription result text is empty", zap.Int("audio_file_num", currentAudioFile.Num))
		}
		currentAudioFile.TranscriptionData = transcriptionData
		log.GetLogger().Info("Finished transcription", zap.Int("audio_file_num", currentAudioFile.Num))
		updateProgress("transcribe", currentAudioFile.Num)
		// Send the processed item to the translation stage
		select {
		case translationInputChan <- currentAudioFile:
			log.GetLogger().Debug("Sent to translation channel", zap.Int("audio_file_num", currentAudioFile.Num))
		case <-ctx.Done():
			log.GetLogger().Warn("Context cancelled before sending to translation channel", zap.Int("audio_file_num", currentAudioFile.Num), zap.Error(ctx.Err()))
			return ctx.Err() // Return context error to errgroup
		}
	}
	log.GetLogger().Info("Transcription stage finished successfully.")
	return nil // Signal successful completion of this stage
}

// runTranslationStageAndWorkers manages launching parallel translation workers using the errgroup.
// It reads from translationInputChan, launches workers via eg.Go, waits for them,
// and closes translationOutputChan ONLY after all workers complete successfully.
// Returns an error immediately if context is cancelled or if launching a worker fails.
// Worker errors are propagated through the errgroup.
func (s Service) runTranslationStageAndWorkers(
	ctx context.Context,
	stepParam *types.SubtitleTaskStepParam,
	translationInputChan <-chan *types.SmallAudio,
	translationOutputChan chan<- *types.SmallAudio,
	translationSemaphore *semaphore.Weighted,
	updateProgress func(string, int),
) (err error) {
	// Ensure the output channel is closed when this manager function exits.
	// This is crucial for the downstream timestamping stage to terminate its loop.
	defer func() {
		close(translationOutputChan)
		log.GetLogger().Debug("Closed translationOutputChan")
		if r := recover(); r != nil {
			errMsg := fmt.Sprintf("panic during translation stage management: %v", r)
			log.GetLogger().Error("Translation stage manager panic recovered", zap.Any("panic", r), zap.String("stack", string(debug.Stack())))
			// Ensure the error is returned so errgroup cancels context
			err = errors.New(errMsg)
		}
	}()
	// Use a local errgroup to manage the workers spawned by this stage.
	// This allows us to wait for all workers to complete before closing the output channel.
	workerEg, workerCtx := errgroup.WithContext(ctx) // Inherit context from parent errgroup
	log.GetLogger().Info("Translation stage manager started, launching workers.")
	// Loop reading from the input channel and launching workers
	for audioFile := range translationInputChan {
		// Capture range variable for the goroutine closure
		currentItem := audioFile
		// Acquire semaphore - Block until a slot is available or context is cancelled
		if err := translationSemaphore.Acquire(workerCtx, 1); err != nil {
			// This error typically means the context was cancelled while waiting
			log.GetLogger().Warn("Failed to acquire translation semaphore", zap.Int("audio_file_num", currentItem.Num), zap.Error(err))
			// workerCtx.Err() should be non-nil here
			return fmt.Errorf("failed acquiring semaphore (context likely cancelled): %w", workerCtx.Err())
		}
		// Launch the worker using the local errgroup
		workerEg.Go(func() (workerErr error) {
			// Release semaphore when this worker goroutine finishes
			defer translationSemaphore.Release(1)
			// Defer panic recovery for the worker
			defer func() {
				if r := recover(); r != nil {
					log.GetLogger().Error("Translation worker panic recovered", zap.Any("panic", r), zap.String("stack", string(debug.Stack())), zap.Int("audio_file_num", currentItem.Num))
					workerErr = fmt.Errorf("panic in translation worker for item %d: %v", currentItem.Num, r)
				}
				log.GetLogger().Debug("Translation worker finished", zap.Int("item_num", currentItem.Num), zap.Error(workerErr))
			}()
			// Check context *again* immediately after starting goroutine
			select {
			case <-workerCtx.Done():
				log.GetLogger().Warn("Translation worker cancelled shortly after starting", zap.Int("audio_file_num", currentItem.Num), zap.Error(workerCtx.Err()))
				return workerCtx.Err() // Return context error
			default:
			}
			log.GetLogger().Info("Starting translation work", zap.Int("audio_file_num", currentItem.Num))
			// Perform the translation task
			translateErr := s.splitTextAndTranslate(stepParam.TaskId, stepParam.TaskBasePath, stepParam.TargetLanguage, stepParam.EnableModalFilter, currentItem)
			if translateErr != nil {
				log.GetLogger().Error("Translation worker failed", zap.Int("audio_file_num", currentItem.Num), zap.Error(translateErr))
				// Return the error to the worker errgroup. This will cancel workerCtx.
				return fmt.Errorf("translation failed for item %d: %w", currentItem.Num, translateErr)
			}
			// Translation successful, update progress
			updateProgress("translate", currentItem.Num)
			// Send the result to the output channel
			select {
			case translationOutputChan <- currentItem:
				log.GetLogger().Debug("Worker sent to translation output channel", zap.Int("audio_file_num", currentItem.Num))
			case <-workerCtx.Done():
				log.GetLogger().Warn("Context cancelled before worker could send to translation output channel", zap.Int("audio_file_num", currentItem.Num), zap.Error(workerCtx.Err()))
				return workerCtx.Err() // Return context error
			}
			return nil // Worker completed successfully
		})
	} // End of loop reading translationInputChan
	log.GetLogger().Info("Translation stage manager finished reading input. Waiting for workers...")
	// Wait for all workers launched by this manager to complete.
	// If any worker returned an error, workerEg.Wait() will return the first error encountered,
	// and workerCtx would have been cancelled.
	if waitErr := workerEg.Wait(); waitErr != nil {
		log.GetLogger().Error("Error occurred in translation worker(s)", zap.Error(waitErr))
		// Propagate the error up to the main errgroup.
		// The defer func will still close translationOutputChan, which is generally okay,
		// as the downstream consumer (timestamping) should handle context cancellation.
		return fmt.Errorf("translation stage failed: %w", waitErr)
	}
	log.GetLogger().Info("All translation workers finished successfully.")
	// If we reach here, all workers succeeded. The defer func will close translationOutputChan.
	return nil
}

// processTimestamping handles the sequential generation of timestamps for a single item.
// Returns error on failure or context cancellation.
func (s Service) processTimestamping(
	ctx context.Context,
	stepParam *types.SubtitleTaskStepParam,
	audioFile *types.SmallAudio,
	updateProgress func(string, int),
) (err error) {
	// Defer panic recovery
	defer func() {
		if r := recover(); r != nil {
			errMsg := fmt.Sprintf("panic during timestamp generation for file %d: %v", audioFile.Num, r)
			log.GetLogger().Error("Timestamp generation panic recovered", zap.Any("panic", r), zap.String("stack", string(debug.Stack())), zap.Int("audio_file_num", audioFile.Num))
			// Ensure the error is returned so errgroup cancels context
			err = errors.New(errMsg)
		}
	}()
	// Check context before starting work (redundant with check in caller loop, but safe)
	select {
	case <-ctx.Done():
		log.GetLogger().Warn("Timestamping processing skipped due to cancellation check at start", zap.Int("audio_file_num", audioFile.Num), zap.Error(ctx.Err()))
		return ctx.Err() // Return context error
	default:
	}
	log.GetLogger().Info("Starting timestamp generation", zap.Int("audio_file_num", audioFile.Num), zap.String("file", audioFile.AudioFile))
	// Perform timestamp generation
	genErr := s.generateTimestamps(stepParam.TaskId, stepParam.TaskBasePath, stepParam.OriginLanguage, stepParam.SubtitleResultType, audioFile, stepParam.MaxWordOneLine)
	if genErr != nil {
		log.GetLogger().Error("Timestamp generation failed", zap.Int("audio_file_num", audioFile.Num), zap.Error(genErr))
		// Return error to the calling eg.Go routine, which propagates to the main errgroup
		return fmt.Errorf("generateTimestamps failed for file %d: %w", audioFile.Num, genErr)
	}
	log.GetLogger().Info("Finished timestamp generation", zap.Int("audio_file_num", audioFile.Num))
	updateProgress("timestamp", audioFile.Num) // Stage 3 complete for this item
	return nil                                 // Success for this item
}

// mergeProcessedFiles remains the same as your provided version.
// It should only be called after the errgroup has completed successfully.
func (s Service) mergeProcessedFiles(stepParam *types.SubtitleTaskStepParam) error {
	log.GetLogger().Info("Starting file merge process.", zap.String("taskId", stepParam.TaskId))
	basePath := stepParam.TaskBasePath
	// Helper function to check existence and add to list
	checkAndAdd := func(pattern string, num int, list *[]string, logName string) {
		filePath := filepath.Join(basePath, fmt.Sprintf(pattern, num))
		if _, statErr := os.Stat(filePath); statErr == nil {
			*list = append(*list, filePath)
		} else if !os.IsNotExist(statErr) {
			// Log unexpected errors checking file existence
			log.GetLogger().Error("Error checking file existence for merge", zap.String("path", filePath), zap.Error(statErr))
		} else {
			// File doesn't exist, log as warning depending on importance
			log.GetLogger().Warn("Skipping missing file for merge", zap.Int("num", num), zap.String("type", logName), zap.String("pattern", pattern))
		}
	}
	// Prepare lists of files to merge
	originNoTsFiles := make([]string, 0, len(stepParam.SmallAudios))
	bilingualFiles := make([]string, 0, len(stepParam.SmallAudios))
	shortOriginMixedFiles := make([]string, 0, len(stepParam.SmallAudios))
	shortOriginFiles := make([]string, 0, len(stepParam.SmallAudios))
	for i := 0; i < len(stepParam.SmallAudios); i++ {
		checkAndAdd(types.SubtitleTaskSplitSrtNoTimestampFileNamePattern, i, &originNoTsFiles, "originNoTs")
		checkAndAdd(types.SubtitleTaskSplitBilingualSrtFileNamePattern, i, &bilingualFiles, "bilingual")
		checkAndAdd(types.SubtitleTaskSplitShortOriginMixedSrtFileNamePattern, i, &shortOriginMixedFiles, "shortOriginMixed")
		checkAndAdd(types.SubtitleTaskSplitShortOriginSrtFileNamePattern, i, &shortOriginFiles, "shortOrigin")
	}
	var mergeErr error
	var mergedSomething bool // Track if any merge actually happened
	// --- Merge Origin No Timestamp ---
	if len(originNoTsFiles) > 0 {
		targetFile := filepath.Join(basePath, types.SubtitleTaskSrtNoTimestampFileName)
		log.GetLogger().Info("Merging originNoTs files", zap.Int("count", len(originNoTsFiles)), zap.String("output", targetFile))
		mergeErr = util.MergeFile(targetFile, originNoTsFiles...) // Assuming MergeFile is suitable for non-SRT text
		if mergeErr != nil {
			log.GetLogger().Error("Error merging originNoTsFile", zap.String("taskId", stepParam.TaskId), zap.Error(mergeErr))
			return fmt.Errorf("merge originNoTsFile error: %w", mergeErr)
		}
		mergedSomething = true
	} else {
		log.GetLogger().Warn("No originNoTs files found to merge", zap.String("taskId", stepParam.TaskId))
	}
	// --- Merge Bilingual ---
	if len(bilingualFiles) > 0 {
		targetFile := filepath.Join(basePath, types.SubtitleTaskBilingualSrtFileName)
		log.GetLogger().Info("Merging bilingual files", zap.Int("count", len(bilingualFiles)), zap.String("output", targetFile))
		mergeErr = util.MergeSrtFiles(targetFile, bilingualFiles...)
		if mergeErr != nil {
			log.GetLogger().Error("Error merging BilingualFile", zap.String("taskId", stepParam.TaskId), zap.Error(mergeErr))
			return fmt.Errorf("merge BilingualFile error: %w", mergeErr)
		}
		stepParam.BilingualSrtFilePath = targetFile // Set path for subsequent steps
		mergedSomething = true
	} else {
		log.GetLogger().Warn("No bilingual files found to merge", zap.String("taskId", stepParam.TaskId))
		// Depending on requirements, this might be a critical error if BilingualSrtFilePath is needed later.
		// Consider returning an error if this specific file MUST exist:
		// return errors.New("critical error: no bilingual SRT files generated or found for merging")
	}
	// --- Merge Short Origin Mixed ---
	if len(shortOriginMixedFiles) > 0 {
		targetFile := filepath.Join(basePath, types.SubtitleTaskShortOriginMixedSrtFileName)
		log.GetLogger().Info("Merging shortOriginMixed files", zap.Int("count", len(shortOriginMixedFiles)), zap.String("output", targetFile))
		mergeErr = util.MergeSrtFiles(targetFile, shortOriginMixedFiles...)
		if mergeErr != nil {
			log.GetLogger().Error("Error merging shortOriginMixedFile", zap.String("taskId", stepParam.TaskId), zap.Error(mergeErr))
			return fmt.Errorf("merge shortOriginMixedFile error: %w", mergeErr)
		}
		stepParam.ShortOriginMixedSrtFilePath = targetFile
		mergedSomething = true
	} else {
		log.GetLogger().Warn("No shortOriginMixed files found to merge", zap.String("taskId", stepParam.TaskId))
	}
	// --- Merge Short Origin ---
	if len(shortOriginFiles) > 0 {
		targetFile := filepath.Join(basePath, types.SubtitleTaskShortOriginSrtFileName)
		log.GetLogger().Info("Merging shortOrigin files", zap.Int("count", len(shortOriginFiles)), zap.String("output", targetFile))
		mergeErr = util.MergeSrtFiles(targetFile, shortOriginFiles...)
		if mergeErr != nil {
			log.GetLogger().Error("Error merging shortOriginFile", zap.String("taskId", stepParam.TaskId), zap.Error(mergeErr))
			return fmt.Errorf("merge shortOriginFile error: %w", mergeErr)
		}
		mergedSomething = true
		// Assuming stepParam doesn't need shortOriginFile path directly stored
	} else {
		log.GetLogger().Warn("No shortOrigin files found to merge", zap.String("taskId", stepParam.TaskId))
	}
	if !mergedSomething {
		log.GetLogger().Warn("No files were found to merge for any category.", zap.String("taskId", stepParam.TaskId))
		// Decide if this is an error condition. If at least one merged file is expected, return an error.
		// return errors.New("no subtitle files were generated or found to merge")
	}
	log.GetLogger().Info("File merge process finished.", zap.String("taskId", stepParam.TaskId))
	return nil // No merge errors encountered
}

func (s Service) splitSrt(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	log.GetLogger().Info("audioToSubtitle.splitSrt start", zap.Any("task id", stepParam.TaskId))

	originLanguageSrtFilePath := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskOriginLanguageSrtFileName)
	originLanguageTextFilePath := filepath.Join(stepParam.TaskBasePath, "output", types.SubtitleTaskOriginLanguageTextFileName)
	targetLanguageSrtFilePath := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskTargetLanguageSrtFileName)
	targetLanguageTextFilePath := filepath.Join(stepParam.TaskBasePath, "output", types.SubtitleTaskTargetLanguageTextFileName)
	// 打开双语字幕文件
	file, err := os.Open(stepParam.BilingualSrtFilePath)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle splitSrt open bilingual srt file error", zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("audioToSubtitle splitSrt open bilingual srt file error: %w", err)
	}
	defer file.Close()

	// 打开输出字幕和文稿文件
	originLanguageSrtFile, err := os.Create(originLanguageSrtFilePath)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle splitSrt create originLanguageSrtFile error", zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("audioToSubtitle splitSrt create originLanguageSrtFile error: %w", err)
	}
	defer originLanguageSrtFile.Close()

	originLanguageTextFile, err := os.Create(originLanguageTextFilePath)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle splitSrt create originLanguageTextFile error", zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("audioToSubtitle splitSrt create originLanguageTextFile error: %w", err)
	}
	defer originLanguageTextFile.Close()

	targetLanguageSrtFile, err := os.Create(targetLanguageSrtFilePath)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle.splitSrt create targetLanguageSrtFile error", zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("audioToSubtitle.splitSrt create targetLanguageSrtFile error: %w", err)
	}
	defer targetLanguageSrtFile.Close()

	targetLanguageTextFile, err := os.Create(targetLanguageTextFilePath)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle.splitSrt create targetLanguageTextFile error", zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("audioToSubtitle.splitSrt create targetLanguageTextFile error: %w", err)
	}
	defer targetLanguageTextFile.Close()

	isTargetOnTop := stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnTop

	scanner := bufio.NewScanner(file)
	var block []string

	for scanner.Scan() {
		line := scanner.Text()
		// 空行代表一个字幕块的结束
		if line == "" {
			if len(block) > 0 {
				util.ProcessBlock(block, targetLanguageSrtFile, targetLanguageTextFile, originLanguageSrtFile, originLanguageTextFile, isTargetOnTop)
				block = nil
			}
		} else {
			block = append(block, line)
		}
	}
	// 处理文件末尾的字幕块
	if len(block) > 0 {
		util.ProcessBlock(block, targetLanguageSrtFile, targetLanguageTextFile, originLanguageSrtFile, originLanguageTextFile, isTargetOnTop)
	}

	if err = scanner.Err(); err != nil {
		log.GetLogger().Error("audioToSubtitle splitSrt scan bilingual srt file error", zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("audioToSubtitle splitSrt scan bilingual srt file error: %w", err)
	}
	// 添加原语言单语字幕
	subtitleInfo := types.SubtitleFileInfo{
		Path:               originLanguageSrtFilePath,
		LanguageIdentifier: string(stepParam.OriginLanguage),
	}
	if stepParam.UserUILanguage == types.LanguageNameEnglish {
		subtitleInfo.Name = types.GetStandardLanguageName(stepParam.OriginLanguage) + " Subtitle"
	} else if stepParam.UserUILanguage == types.LanguageNameSimplifiedChinese {
		subtitleInfo.Name = types.GetStandardLanguageName(stepParam.OriginLanguage) + " 单语字幕"
	}
	stepParam.SubtitleInfos = append(stepParam.SubtitleInfos, subtitleInfo)
	// 添加目标语言单语字幕
	if stepParam.SubtitleResultType == types.SubtitleResultTypeTargetOnly || stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnBottom || stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnTop {
		subtitleInfo = types.SubtitleFileInfo{
			Path:               targetLanguageSrtFilePath,
			LanguageIdentifier: string(stepParam.TargetLanguage),
		}
		if stepParam.UserUILanguage == types.LanguageNameEnglish {
			subtitleInfo.Name = types.GetStandardLanguageName(stepParam.TargetLanguage) + " Subtitle"
		} else if stepParam.UserUILanguage == types.LanguageNameSimplifiedChinese {
			subtitleInfo.Name = types.GetStandardLanguageName(stepParam.TargetLanguage) + " 单语字幕"
		}
		stepParam.SubtitleInfos = append(stepParam.SubtitleInfos, subtitleInfo)
	}
	// 添加双语字幕
	if stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnTop || stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnBottom {
		subtitleInfo = types.SubtitleFileInfo{
			Path:               stepParam.BilingualSrtFilePath,
			LanguageIdentifier: "bilingual",
		}
		if stepParam.UserUILanguage == types.LanguageNameEnglish {
			subtitleInfo.Name = "Bilingual Subtitle"
		} else if stepParam.UserUILanguage == types.LanguageNameSimplifiedChinese {
			subtitleInfo.Name = "双语字幕"
		}
		stepParam.SubtitleInfos = append(stepParam.SubtitleInfos, subtitleInfo)
		// 供生成配音使用
		stepParam.TtsSourceFilePath = stepParam.BilingualSrtFilePath
	}

	log.GetLogger().Info("audioToSubtitle.splitSrt end", zap.Any("task id", stepParam.TaskId))
	return nil
}

func getSentenceTimestamps(words []types.Word, sentence string, lastTs float64, language types.StandardLanguageCode) (types.SrtSentence, []types.Word, float64, error) {
	var srtSt types.SrtSentence
	var sentenceWordList []string
	sentenceWords := make([]types.Word, 0)
	if language == types.LanguageNameEnglish || language == types.LanguageNameGerman || language == types.LanguageNameTurkish || language == types.LanguageNameRussian { // 处理方式不同
		sentenceWordList = util.SplitSentence(sentence)
		if len(sentenceWordList) == 0 {
			return srtSt, sentenceWords, 0, fmt.Errorf("getSentenceTimestamps sentence is empty")
		}

		thisLastTs := lastTs
		sentenceWordIndex := 0
		wordNow := words[sentenceWordIndex]
		for _, sentenceWord := range sentenceWordList {
			for sentenceWordIndex < len(words) {
				for sentenceWordIndex < len(words) && !strings.EqualFold(words[sentenceWordIndex].Text, sentenceWord) {
					sentenceWordIndex++
				}

				if sentenceWordIndex >= len(words) {
					break
				}

				wordNow = words[sentenceWordIndex]
				if wordNow.Start < thisLastTs {
					sentenceWordIndex++
					continue
				} else {
					break
				}
			}

			if sentenceWordIndex >= len(words) {
				sentenceWords = append(sentenceWords, types.Word{
					Text: sentenceWord,
				})
				sentenceWordIndex = 0
				continue
			}

			sentenceWords = append(sentenceWords, wordNow)
			sentenceWordIndex = 0
		}

		beginWordIndex, endWordIndex := findMaxIncreasingSubArray(sentenceWords)
		if (endWordIndex - beginWordIndex) == 0 {
			return srtSt, sentenceWords, 0, errors.New("getSentenceTimestamps no valid sentence")
		}

		// 找到最大连续子数组后，再去找整个句子开始和结束的时间戳
		beginWord := sentenceWords[beginWordIndex]
		endWord := sentenceWords[endWordIndex-1]
		if endWordIndex-beginWordIndex == len(sentenceWords) {
			srtSt.Start = beginWord.Start
			srtSt.End = endWord.End
			thisLastTs = endWord.End
			return srtSt, sentenceWords, thisLastTs, nil
		}

		if beginWordIndex > 0 {
			for i, j := beginWordIndex-1, beginWord.Num-1; i >= 0 && j >= 0; {
				if words[j].Text == "" {
					j--
					continue
				}
				if strings.EqualFold(words[j].Text, sentenceWords[i].Text) {
					beginWord = words[j]
					sentenceWords[i] = beginWord
				} else {
					break
				}

				i--
				j--
			}
		}

		if endWordIndex < len(sentenceWords) {
			for i, j := endWordIndex, endWord.Num+1; i < len(sentenceWords) && j < len(words); {
				if words[j].Text == "" {
					j++
					continue
				}
				if strings.EqualFold(words[j].Text, sentenceWords[i].Text) {
					endWord = words[j]
					sentenceWords[i] = endWord
				} else {
					break
				}

				i++
				j++
			}
		}

		if beginWord.Num > sentenceWords[0].Num && beginWord.Num-sentenceWords[0].Num < 10 {
			beginWord = sentenceWords[0]
		}

		if sentenceWords[len(sentenceWords)-1].Num > endWord.Num && sentenceWords[len(sentenceWords)-1].Num-endWord.Num < 10 {
			endWord = sentenceWords[len(sentenceWords)-1]
		}

		srtSt.Start = beginWord.Start
		if srtSt.Start < thisLastTs {
			srtSt.Start = thisLastTs
		}
		srtSt.End = endWord.End
		if beginWord.Num != endWord.Num && endWord.End > thisLastTs {
			thisLastTs = endWord.End
		}

		return srtSt, sentenceWords, thisLastTs, nil
	} else {
		sentenceWordList = strings.Split(util.GetRecognizableString(sentence), "")
		if len(sentenceWordList) == 0 {
			return srtSt, sentenceWords, 0, errors.New("getSentenceTimestamps sentence is empty")
		}

		// 这里的sentence words不是字面上连续的，而是可能有重复，可读连续的用下面的readable
		readableSentenceWords := make([]types.Word, 0)
		thisLastTs := lastTs
		sentenceWordIndex := 0
		wordNow := words[sentenceWordIndex]
		for _, sentenceWord := range sentenceWordList {
			for sentenceWordIndex < len(words) {
				if !strings.EqualFold(words[sentenceWordIndex].Text, sentenceWord) && !strings.HasPrefix(words[sentenceWordIndex].Text, sentenceWord) {
					sentenceWordIndex++
				} else {
					wordNow = words[sentenceWordIndex]
					if wordNow.Start >= thisLastTs {
						// 记录下来，但还要继续往后找
						sentenceWords = append(sentenceWords, wordNow)
					}
					sentenceWordIndex++
				}
			}
			// 当前sentenceWord已经找完了
			sentenceWordIndex = 0

		}
		// 对于sentence每个词，已经尝试找到了它的[]Word
		var beginWordIndex, endWordIndex int
		beginWordIndex, endWordIndex, readableSentenceWords = jumpFindMaxIncreasingSubArray(sentenceWords)
		if (endWordIndex - beginWordIndex) == 0 {
			return srtSt, readableSentenceWords, 0, errors.New("getSentenceTimestamps no valid sentence")
		}

		beginWord := sentenceWords[beginWordIndex]
		endWord := sentenceWords[endWordIndex]

		srtSt.Start = beginWord.Start
		if srtSt.Start < thisLastTs {
			srtSt.Start = thisLastTs
		}
		srtSt.End = endWord.End
		if beginWord.Num != endWord.Num && endWord.End > thisLastTs {
			thisLastTs = endWord.End
		}

		return srtSt, readableSentenceWords, thisLastTs, nil
	}
}

// 找到 Num 值递增的最大连续子数组
func findMaxIncreasingSubArray(words []types.Word) (int, int) {
	if len(words) == 0 {
		return 0, 0
	}

	// 用于记录当前最大递增子数组的起始索引和长度
	maxStart, maxLen := 0, 1
	// 用于记录当前递增子数组的起始索引和长度
	currStart, currLen := 0, 1

	for i := 1; i < len(words); i++ {
		if words[i].Num == words[i-1].Num+1 {
			// 当前元素比前一个元素大，递增序列继续
			currLen++
		} else {
			// 递增序列结束，检查是否是最长的递增序列
			if currLen > maxLen {
				maxStart = currStart
				maxLen = currLen
			}
			// 重新开始新的递增序列
			currStart = i
			currLen = 1
		}
	}

	// 最后需要再检查一次，因为最大递增子数组可能在数组的末尾
	if currLen > maxLen {
		maxStart = currStart
		maxLen = currLen
	}

	// 返回最大递增子数组
	return maxStart, maxStart + maxLen
}

// 跳跃（非连续）找到 Num 值递增的最大子数组
func jumpFindMaxIncreasingSubArray(words []types.Word) (int, int, []types.Word) {
	if len(words) == 0 {
		return -1, -1, nil
	}

	// dp[i] 表示以 words[i] 结束的递增子数组的长度
	dp := make([]int, len(words))
	// prev[i] 用来记录与当前递增子数组相连的前一个元素的索引
	prev := make([]int, len(words))

	// 初始化，所有的 dp[i] 都是 1，因为每个元素本身就是一个长度为 1 的子数组
	for i := 0; i < len(words); i++ {
		dp[i] = 1
		prev[i] = -1
	}

	maxLen := 0
	startIdx := -1
	endIdx := -1

	// 遍历每一个元素
	for i := 1; i < len(words); i++ {
		// 对比每个元素与之前的元素，检查是否可以构成递增子数组
		for j := 0; j < i; j++ {
			if words[i].Num == words[j].Num+1 {
				if dp[i] < dp[j]+1 {
					dp[i] = dp[j] + 1
					prev[i] = j
				}
			}
		}

		// 更新最大子数组长度和索引
		if dp[i] > maxLen {
			maxLen = dp[i]
			endIdx = i
		}
	}

	// 如果未找到递增子数组，直接返回
	if endIdx == -1 {
		return -1, -1, nil
	}

	// 回溯找到子数组的起始索引
	startIdx = endIdx
	for prev[startIdx] != -1 {
		startIdx = prev[startIdx]
	}

	// 构造结果子数组
	result := []types.Word{}
	for i := startIdx; i != -1; i = prev[i] {
		result = append(result, words[i])
	}

	// 由于是从后往前构造的子数组，需要反转
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}

	return startIdx, endIdx, result
}

func (s Service) generateTimestamps(taskId, basePath string, originLanguage types.StandardLanguageCode,
	resultType types.SubtitleResultType, audioFile *types.SmallAudio, originLanguageWordOneLine int) error {
	// 判断有没有文本
	srtNoTsFile, err := os.Open(audioFile.SrtNoTsFile)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle generateTimestamps open SrtNoTsFile error", zap.String("taskId", taskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle generateTimestamps open SrtNoTsFile error: %w", err)
	}
	scanner := bufio.NewScanner(srtNoTsFile)
	if scanner.Scan() {
		if strings.Contains(scanner.Text(), "[无文本]") {
			return nil
		}
	}
	srtNoTsFile.Close()
	// 获取原始无时间戳字幕内容
	srtBlocks, err := util.ParseSrtNoTsToSrtBlock(audioFile.SrtNoTsFile)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle generateTimestamps read SrtBlocks error", zap.String("taskId", taskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle generateTimestamps read SrtBlocks error: %w", err)
	}
	if len(srtBlocks) == 0 {
		return nil
	}

	// 获取每个字幕块的时间戳
	var lastTs float64
	shortOriginSrtMap := make(map[int][]util.SrtBlock, 0)
	for _, srtBlock := range srtBlocks {
		if srtBlock.OriginLanguageSentence == "" {
			continue
		}
		sentenceTs, sentenceWords, ts, err := getSentenceTimestamps(audioFile.TranscriptionData.Words, srtBlock.OriginLanguageSentence, lastTs, originLanguage)
		if err != nil || ts < lastTs {
			continue
		}

		tsOffset := float64(config.Conf.App.SegmentDuration) * 60 * float64(audioFile.Num)
		srtBlock.Timestamp = fmt.Sprintf("%s --> %s", util.FormatTime(float32(sentenceTs.Start+tsOffset)), util.FormatTime(float32(sentenceTs.End+tsOffset)))

		// 生成短句子的英文字幕
		var (
			originSentence string
			startWord      types.Word
			endWord        types.Word
		)

		if len(sentenceWords) <= originLanguageWordOneLine {
			shortOriginSrtMap[srtBlock.Index] = append(shortOriginSrtMap[srtBlock.Index], util.SrtBlock{
				Index:                  srtBlock.Index,
				Timestamp:              fmt.Sprintf("%s --> %s", util.FormatTime(float32(sentenceTs.Start+tsOffset)), util.FormatTime(float32(sentenceTs.End+tsOffset))),
				OriginLanguageSentence: srtBlock.OriginLanguageSentence,
			})
			lastTs = ts
			continue
		}

		thisLineWord := originLanguageWordOneLine
		if len(sentenceWords) > originLanguageWordOneLine && len(sentenceWords) <= 2*originLanguageWordOneLine {
			thisLineWord = len(sentenceWords)/2 + 1
		} else if len(sentenceWords) > 2*originLanguageWordOneLine && len(sentenceWords) <= 3*originLanguageWordOneLine {
			thisLineWord = len(sentenceWords)/3 + 1
		} else if len(sentenceWords) > 3*originLanguageWordOneLine && len(sentenceWords) <= 4*originLanguageWordOneLine {
			thisLineWord = len(sentenceWords)/4 + 1
		} else if len(sentenceWords) > 4*originLanguageWordOneLine && len(sentenceWords) <= 5*originLanguageWordOneLine {
			thisLineWord = len(sentenceWords)/5 + 1
		}

		i := 1
		nextStart := true
		for _, word := range sentenceWords {
			if nextStart {
				startWord = word
				if startWord.Start < lastTs {
					startWord.Start = lastTs
				}
				if startWord.Start < endWord.End {
					startWord.Start = endWord.End
				}

				if startWord.Start < sentenceTs.Start {
					startWord.Start = sentenceTs.Start
				}
				// 首个单词的开始时间戳大于句子的结束时间戳，说明这个单词找错了，放弃掉
				if startWord.End > sentenceTs.End {
					originSentence += word.Text + " "
					continue
				}
				originSentence += word.Text + " "
				endWord = startWord
				i++
				nextStart = false
				continue
			}

			originSentence += word.Text + " "
			if endWord.End < word.End {
				endWord = word
			}

			if endWord.End > sentenceTs.End {
				endWord.End = sentenceTs.End
			}

			if i%thisLineWord == 0 && i > 1 {
				shortOriginSrtMap[srtBlock.Index] = append(shortOriginSrtMap[srtBlock.Index], util.SrtBlock{
					Index:                  srtBlock.Index,
					Timestamp:              fmt.Sprintf("%s --> %s", util.FormatTime(float32(startWord.Start+tsOffset)), util.FormatTime(float32(endWord.End+tsOffset))),
					OriginLanguageSentence: originSentence,
				})
				originSentence = ""
				nextStart = true
			}
			i++
		}

		if originSentence != "" {
			shortOriginSrtMap[srtBlock.Index] = append(shortOriginSrtMap[srtBlock.Index], util.SrtBlock{
				Index:                  srtBlock.Index,
				Timestamp:              fmt.Sprintf("%s --> %s", util.FormatTime(float32(startWord.Start+tsOffset)), util.FormatTime(float32(endWord.End+tsOffset))),
				OriginLanguageSentence: originSentence,
			})
		}
		lastTs = ts
	}

	// 保存带时间戳的原始字幕
	finalBilingualSrtFileName := fmt.Sprintf("%s/%s", basePath, fmt.Sprintf(types.SubtitleTaskSplitBilingualSrtFileNamePattern, audioFile.Num))
	finalBilingualSrtFile, err := os.Create(finalBilingualSrtFileName)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle generateTimestamps create bilingual srt file error", zap.String("taskId", taskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle generateTimestamps create bilingual srt file error: %w", err)
	}
	defer finalBilingualSrtFile.Close()

	// 写入字幕文件
	for _, srtBlock := range srtBlocks {
		_, _ = finalBilingualSrtFile.WriteString(fmt.Sprintf("%d\n", srtBlock.Index))
		_, _ = finalBilingualSrtFile.WriteString(srtBlock.Timestamp + "\n")
		if resultType == types.SubtitleResultTypeBilingualTranslationOnTop {
			_, _ = finalBilingualSrtFile.WriteString(srtBlock.TargetLanguageSentence + "\n")
			_, _ = finalBilingualSrtFile.WriteString(srtBlock.OriginLanguageSentence + "\n\n")
		} else {
			// on bottom 或者单语类型，都用on bottom
			_, _ = finalBilingualSrtFile.WriteString(srtBlock.OriginLanguageSentence + "\n")
			_, _ = finalBilingualSrtFile.WriteString(srtBlock.TargetLanguageSentence + "\n\n")
		}
	}

	// 保存带时间戳的字幕,长中文+短英文（示意，也支持其他语言）
	srtShortOriginMixedFileName := fmt.Sprintf("%s/%s", basePath, fmt.Sprintf(types.SubtitleTaskSplitShortOriginMixedSrtFileNamePattern, audioFile.Num))
	srtShortOriginMixedFile, err := os.Create(srtShortOriginMixedFileName)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle generateTimestamps create srtShortOriginMixedFile err", zap.String("taskId", taskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle generateTimestamps create srtShortOriginMixedFile err: %w", err)
	}
	defer srtShortOriginMixedFile.Close()

	// 保存带时间戳的短英文字幕
	srtShortOriginFileName := fmt.Sprintf("%s/%s", basePath, fmt.Sprintf(types.SubtitleTaskSplitShortOriginSrtFileNamePattern, audioFile.Num))
	srtShortOriginFile, err := os.Create(srtShortOriginFileName)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle generateTimestamps create srtShortOriginFile err", zap.String("taskId", taskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle generateTimestamps create srtShortOriginFile err: %w", err)
	}
	defer srtShortOriginMixedFile.Close()

	mixedSrtNum := 1
	shortSrtNum := 1
	// 写入短英文混合字幕文件
	for _, srtBlock := range srtBlocks {
		srtShortOriginMixedFile.WriteString(fmt.Sprintf("%d\n", mixedSrtNum))
		srtShortOriginMixedFile.WriteString(srtBlock.Timestamp + "\n")
		srtShortOriginMixedFile.WriteString(srtBlock.TargetLanguageSentence + "\n\n")
		mixedSrtNum++
		shortOriginSentence := shortOriginSrtMap[srtBlock.Index]
		for _, shortOriginBlock := range shortOriginSentence {
			srtShortOriginMixedFile.WriteString(fmt.Sprintf("%d\n", mixedSrtNum))
			srtShortOriginMixedFile.WriteString(shortOriginBlock.Timestamp + "\n")
			srtShortOriginMixedFile.WriteString(shortOriginBlock.OriginLanguageSentence + "\n\n")
			mixedSrtNum++

			srtShortOriginFile.WriteString(fmt.Sprintf("%d\n", shortSrtNum))
			srtShortOriginFile.WriteString(shortOriginBlock.Timestamp + "\n")
			srtShortOriginFile.WriteString(shortOriginBlock.OriginLanguageSentence + "\n\n")
			shortSrtNum++
		}
	}

	return nil
}

func (s Service) splitTextAndTranslate(taskId, baseTaskPath string, targetLanguage types.StandardLanguageCode, enableModalFilter bool, audioFile *types.SmallAudio) error {
	var (
		splitContent string
		splitPrompt  string
		err          error
	)
	if enableModalFilter {
		splitPrompt = fmt.Sprintf(types.SplitTextPromptWithModalFilter, types.GetStandardLanguageName(targetLanguage))
	} else {
		splitPrompt = fmt.Sprintf(types.SplitTextPrompt, types.GetStandardLanguageName(targetLanguage))
	}
	if audioFile.TranscriptionData.Text == "" {
		splitContent = ""
	} else {
		// 最多尝试4次获取有效的翻译结果
		for i := range 100 {
			splitContent, err = s.ChatCompleter.ChatCompletion(splitPrompt + audioFile.TranscriptionData.Text)
			re := regexp.MustCompile(`(?s)<think>.*?</think>`)
			splitContent = strings.TrimSpace(re.ReplaceAllString(splitContent, ""))
			if err != nil {
				log.GetLogger().Warn("audioToSubtitle splitTextAndTranslate ChatCompletion error, retrying...",
					zap.Any("taskId", taskId), zap.Int("attempt", i+1), zap.Error(err))
				continue
			}

			// 验证返回内容的格式和原文匹配度
			if isValidSplitContent(splitContent, audioFile.TranscriptionData.Text) {
				break
			}

			// save splitContent to a file
			originTextFileName := filepath.Join(baseTaskPath, "error_output.txt")
			os.WriteFile(originTextFileName, []byte(splitContent), 0644)

			log.GetLogger().Warn("audioToSubtitle splitTextAndTranslate invalid response format or content mismatch, retrying...",
				zap.Any("taskId", taskId), zap.Int("audioFileNum", audioFile.Num), zap.Int("attempt", i+1))
			err = fmt.Errorf("invalid split content format or content mismatch, audio file num: %d", audioFile.Num)
		}

		if err != nil {
			log.GetLogger().Error("audioToSubtitle splitTextAndTranslate failed after retries", zap.Any("taskId", taskId), zap.Error(err))
			return fmt.Errorf("audioToSubtitle splitTextAndTranslate error: %w", err)
		}
	}

	// 保存不带时间戳的原始字幕
	originNoTsSrtFileName := filepath.Join(baseTaskPath, fmt.Sprintf(types.SubtitleTaskSplitSrtNoTimestampFileNamePattern, audioFile.Num))
	originNoTsSrtFile, err := os.Create(originNoTsSrtFileName)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle splitTextAndTranslate create srt file err", zap.Any("taskId", taskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle splitTextAndTranslate create srt file err: %w", err)
	}
	defer originNoTsSrtFile.Sync()
	defer originNoTsSrtFile.Close()
	_, err = originNoTsSrtFile.WriteString(splitContent)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle splitTextAndTranslate write originNoTsSrtFile err", zap.Any("taskId", taskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle splitTextAndTranslate write originNoTsSrtFile err: %w", err)
	}
	audioFile.SrtNoTsFile = originNoTsSrtFileName
	return nil
}

// isValidSplitContent 验证分割后的内容是否符合格式要求，并检查原文字数是否与输入文本相近
func isValidSplitContent(splitContent, originalText string) bool {
	// 处理空内容情况
	if splitContent == "" || originalText == "" {
		return splitContent == "" && originalText == ""
	}

	// 处理无文本标记
	if strings.Contains(splitContent, "[无文本]") {
		return originalText == "" || len(strings.TrimSpace(originalText)) < 10
	}

	lines := strings.Split(splitContent, "\n")
	if len(lines) < 3 { // 至少需要一个完整的块
		//log.GetLogger().Warn("audioToSubtitle invaild Format, not enough lines", zap.Any("splitContent", splitContent))
		return false
	}

	var originalLines []string
	var isValidFormat bool

	// 验证格式并提取原文
	for i := 0; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}

		// 检查是否为序号行
		if _, err := strconv.Atoi(line); err == nil {
			if i+2 >= len(lines) {
				log.GetLogger().Warn("audioToSubtitle invaild Format, block is not complete", zap.Any("splitContent", splitContent), zap.Any("line", line))
				return false
			}
			// 收集原文行（第三行），并去除方括号
			originalLine := strings.TrimSpace(lines[i+2])
			originalLine = strings.TrimPrefix(originalLine, "[")
			originalLine = strings.TrimSuffix(originalLine, "]")
			originalLines = append(originalLines, originalLine)
			i += 2 // 跳过翻译行和原文行
			isValidFormat = true
		}
	}

	if !isValidFormat || len(originalLines) == 0 {
		log.GetLogger().Warn("audioToSubtitle invaild Format, original line misiing", zap.Any("splitContent", splitContent))
		return false
	}

	// 合并原文并比较字数
	combinedOriginal := strings.Join(originalLines, "")
	originalTextLength := len(strings.TrimSpace(originalText))
	combinedLength := len(strings.TrimSpace(combinedOriginal))

	// 允许300字符的误差
	return math.Abs(float64(originalTextLength-combinedLength)) <= 300
}
