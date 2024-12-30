package aliyun

import (
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
	"io"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type AsrClient struct {
	BailianApiKey string
}

func NewAsrClient(bailianApiKey string) *AsrClient {
	return &AsrClient{
		BailianApiKey: bailianApiKey,
	}
}

const (
	wsURL = "wss://dashscope.aliyuncs.com/api-ws/v1/inference/" // WebSocket服务器地址
)

var dialer = websocket.DefaultDialer

func (c AsrClient) Transcription(audioFile, language string) (*types.TranscriptionData, error) {
	// 处理音频
	processedAudioFile, err := processAudio(audioFile)
	if err != nil {
		log.GetLogger().Error("处理音频失败", zap.Error(err), zap.String("audio file", audioFile))
		return nil, err
	}

	// 连接WebSocket服务
	conn, err := connectWebSocket(c.BailianApiKey)
	if err != nil {
		log.GetLogger().Error("连接WebSocket失败", zap.Error(err), zap.String("audio file", audioFile))
		return nil, err
	}
	defer closeConnection(conn)

	// 启动一个goroutine来接收结果
	taskStarted := make(chan bool)
	taskDone := make(chan bool)

	words := make([]types.Word, 0)
	text := ""
	startResultReceiver(conn, &words, &text, taskStarted, taskDone)

	// 发送run-task指令
	taskID, err := sendRunTaskCmd(conn, language)
	if err != nil {
		log.GetLogger().Error("发送run-task指令失败", zap.Error(err), zap.String("audio file", audioFile))
	}

	// 等待task-started事件
	waitForTaskStarted(taskStarted)

	// 发送待识别音频文件流
	if err := sendAudioData(conn, processedAudioFile); err != nil {
		log.GetLogger().Error("发送音频数据失败", zap.Error(err))
	}

	// 发送finish-task指令
	if err := sendFinishTaskCmd(conn, taskID); err != nil {
		log.GetLogger().Error("发送finish-task指令失败", zap.Error(err), zap.String("audio file", audioFile))
	}

	// 等待任务完成或失败
	<-taskDone

	if len(words) == 0 {
		log.GetLogger().Info("识别结果为空", zap.String("audio file", audioFile))
	}
	log.GetLogger().Debug("识别结果", zap.Any("words", words), zap.String("text", text), zap.String("audio file", audioFile))

	transcriptionData := &types.TranscriptionData{
		Text:  text,
		Words: words,
	}

	return transcriptionData, nil
}

// 定义结构体来表示JSON数据
type AsrHeader struct {
	Action       string                 `json:"action"`
	TaskID       string                 `json:"task_id"`
	Streaming    string                 `json:"streaming"`
	Event        string                 `json:"event"`
	ErrorCode    string                 `json:"error_code,omitempty"`
	ErrorMessage string                 `json:"error_message,omitempty"`
	Attributes   map[string]interface{} `json:"attributes"`
}

type Output struct {
	Sentence struct {
		BeginTime int64  `json:"begin_time"`
		EndTime   *int64 `json:"end_time"`
		Text      string `json:"text"`
		Words     []struct {
			BeginTime   int64  `json:"begin_time"`
			EndTime     *int64 `json:"end_time"`
			Text        string `json:"text"`
			Punctuation string `json:"punctuation"`
		} `json:"words"`
	} `json:"sentence"`
	Usage interface{} `json:"usage"`
}

type Payload struct {
	TaskGroup  string     `json:"task_group"`
	Task       string     `json:"task"`
	Function   string     `json:"function"`
	Model      string     `json:"model"`
	Parameters Params     `json:"parameters"`
	Resources  []Resource `json:"resources"`
	Input      Input      `json:"input"`
	Output     Output     `json:"output,omitempty"`
}

type Params struct {
	Format                   string   `json:"format"`
	SampleRate               int      `json:"sample_rate"`
	VocabularyID             string   `json:"vocabulary_id"`
	DisfluencyRemovalEnabled bool     `json:"disfluency_removal_enabled"`
	LanguageHints            []string `json:"language_hints"`
}

type Resource struct {
	ResourceID   string `json:"resource_id"`
	ResourceType string `json:"resource_type"`
}

type Input struct {
}

type Event struct {
	Header  AsrHeader `json:"header"`
	Payload Payload   `json:"payload"`
}

// 把音频处理成单声道、16k采样率
func processAudio(filePath string) (string, error) {
	dest := strings.ReplaceAll(filePath, filepath.Ext(filePath), "_mono_16K.mp3")
	cmdArgs := []string{"-i", filePath, "-ac", "1", "-ar", "16000", "-b:a", "192k", dest}
	cmd := exec.Command("ffmpeg", cmdArgs...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.GetLogger().Error("处理音频失败", zap.Error(err), zap.String("audio file", filePath), zap.String("output", string(output)))
		return "", err
	}
	return dest, nil
}

// 连接WebSocket服务
func connectWebSocket(apiKey string) (*websocket.Conn, error) {
	header := make(http.Header)
	header.Add("X-DashScope-DataInspection", "enable")
	header.Add("Authorization", fmt.Sprintf("bearer %s", apiKey))
	conn, _, err := dialer.Dial(wsURL, header)
	return conn, err
}

// 启动一个goroutine异步接收WebSocket消息
func startResultReceiver(conn *websocket.Conn, words *[]types.Word, text *string, taskStarted chan<- bool, taskDone chan<- bool) {
	go func() {
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.GetLogger().Error("解析服务器消息失败：", zap.Error(err))
				continue
			}
			currentEvent := Event{}
			err = json.Unmarshal(message, &currentEvent)
			if err != nil {
				log.GetLogger().Error("解析服务器消息失败：", zap.Error(err))
				continue
			}
			if currentEvent.Payload.Output.Sentence.EndTime != nil {
				// 本句结束，添加当前的words和text
				*text += currentEvent.Payload.Output.Sentence.Text
				currentNum := 0
				if len(*words) > 0 {
					currentNum = (*words)[len(*words)-1].Num + 1
				}
				for _, word := range currentEvent.Payload.Output.Sentence.Words {
					*words = append(*words, types.Word{
						Num:   currentNum,
						Text:  strings.TrimSpace(word.Text), // 阿里云这边的word后面会有空格
						Start: float64(word.BeginTime) / 1000,
						End:   float64(*word.EndTime) / 1000,
					})
					currentNum++
				}
			}
			if handleEvent(conn, &currentEvent, taskStarted, taskDone) {
				return
			}
		}
	}()
}

// 发送run-task指令
func sendRunTaskCmd(conn *websocket.Conn, language string) (string, error) {
	runTaskCmd, taskID, err := generateRunTaskCmd(language)
	if err != nil {
		return "", err
	}
	err = conn.WriteMessage(websocket.TextMessage, []byte(runTaskCmd))
	return taskID, err
}

// 生成run-task指令
func generateRunTaskCmd(language string) (string, string, error) {
	taskID := uuid.New().String()
	runTaskCmd := Event{
		Header: AsrHeader{
			Action:    "run-task",
			TaskID:    taskID,
			Streaming: "duplex",
		},
		Payload: Payload{
			TaskGroup: "audio",
			Task:      "asr",
			Function:  "recognition",
			Model:     "paraformer-realtime-v2",
			Parameters: Params{
				Format:        "mp3",
				SampleRate:    16000,
				LanguageHints: []string{language},
			},
			Input: Input{},
		},
	}
	runTaskCmdJSON, err := json.Marshal(runTaskCmd)
	return string(runTaskCmdJSON), taskID, err
}

// 等待task-started事件
func waitForTaskStarted(taskStarted chan bool) {
	select {
	case <-taskStarted:
		log.GetLogger().Info("阿里云语音识别任务开启成功")
	case <-time.After(10 * time.Second):
		log.GetLogger().Error("等待task-started超时，任务开启失败")
	}
}

// 发送音频数据
func sendAudioData(conn *websocket.Conn, filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	buf := make([]byte, 1024) // 100ms的音频大约1024字节
	for {
		n, err := file.Read(buf)
		if n == 0 {
			break
		}
		if err != nil && err != io.EOF {
			return err
		}
		err = conn.WriteMessage(websocket.BinaryMessage, buf[:n])
		if err != nil {
			return err
		}
		time.Sleep(100 * time.Millisecond)
	}
	return nil
}

// 发送finish-task指令
func sendFinishTaskCmd(conn *websocket.Conn, taskID string) error {
	finishTaskCmd, err := generateFinishTaskCmd(taskID)
	if err != nil {
		return err
	}
	err = conn.WriteMessage(websocket.TextMessage, []byte(finishTaskCmd))
	return err
}

// 生成finish-task指令
func generateFinishTaskCmd(taskID string) (string, error) {
	finishTaskCmd := Event{
		Header: AsrHeader{
			Action:    "finish-task",
			TaskID:    taskID,
			Streaming: "duplex",
		},
		Payload: Payload{
			Input: Input{},
		},
	}
	finishTaskCmdJSON, err := json.Marshal(finishTaskCmd)
	return string(finishTaskCmdJSON), err
}

// 处理事件
func handleEvent(conn *websocket.Conn, event *Event, taskStarted chan<- bool, taskDone chan<- bool) bool {
	switch event.Header.Event {
	case "task-started":
		log.GetLogger().Info("收到task-started事件", zap.String("taskID", event.Header.TaskID))
		taskStarted <- true
	case "result-generated":
		log.GetLogger().Info("收到result-generated事件", zap.String("当前text", event.Payload.Output.Sentence.Text))
	case "task-finished":
		log.GetLogger().Info("收到task-finished事件，任务完成", zap.String("taskID", event.Header.TaskID))
		taskDone <- true
		return true
	case "task-failed":
		log.GetLogger().Info("收到task-failed事件", zap.String("taskID", event.Header.TaskID))
		handleTaskFailed(event, conn)
		taskDone <- true
		return true
	default:
		log.GetLogger().Info("未知事件：", zap.String("event", event.Header.Event))
	}
	return false
}

// 处理任务失败事件
func handleTaskFailed(event *Event, conn *websocket.Conn) {
	log.GetLogger().Error("任务失败：", zap.String("error", event.Header.ErrorMessage))
}

// 关闭连接
func closeConnection(conn *websocket.Conn) {
	if conn != nil {
		conn.Close()
	}
}
