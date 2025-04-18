package aliyun

import (
	"encoding/json"
	"fmt"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"os"
	"time"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

type TtsClient struct {
	AccessKeyID     string
	AccessKeySecret string
	Appkey          string
}

type TtsHeader struct {
	Appkey    string `json:"appkey"`
	MessageID string `json:"message_id"`
	TaskID    string `json:"task_id"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
}

type StartSynthesisPayload struct {
	Voice                  string `json:"voice,omitempty"`
	Format                 string `json:"format,omitempty"`
	SampleRate             int    `json:"sample_rate,omitempty"`
	Volume                 int    `json:"volume,omitempty"`
	SpeechRate             int    `json:"speech_rate,omitempty"`
	PitchRate              int    `json:"pitch_rate,omitempty"`
	EnableSubtitle         bool   `json:"enable_subtitle,omitempty"`
	EnablePhonemeTimestamp bool   `json:"enable_phoneme_timestamp,omitempty"`
}

type RunSynthesisPayload struct {
	Text string `json:"text"`
}

type Message struct {
	Header  TtsHeader   `json:"header"`
	Payload interface{} `json:"payload,omitempty"`
}

func NewTtsClient(accessKeyId, accessKeySecret, appkey string) *TtsClient {
	return &TtsClient{
		AccessKeyID:     accessKeyId,
		AccessKeySecret: accessKeySecret,
		Appkey:          appkey,
	}
}

func (c *TtsClient) TextToSpeech(text, voice, outputFile string) error {
	file, err := os.OpenFile(outputFile, os.O_CREATE|os.O_WRONLY, 0666)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer file.Close()

	var conn *websocket.Conn
	token, _ := CreateToken(c.AccessKeyID, c.AccessKeySecret)
	fullURL := "wss://nls-gateway-cn-beijing.aliyuncs.com/ws/v1?token=" + token
	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 10 * time.Second
	conn, _, err = dialer.Dial(fullURL, nil)
	if err != nil {
		return err
	}
	_ = conn.SetReadDeadline(time.Now().Add(time.Second * 60))
	defer c.Close(conn)

	onTextMessage := func(message string) {
		log.GetLogger().Info("Received text message", zap.String("Message", message))
	}

	onBinaryMessage := func(data []byte) {
		if _, err := file.Write(data); err != nil {
			log.GetLogger().Error("Failed to write data to file", zap.Error(err))
		}
	}

	var (
		synthesisStarted  = make(chan struct{})
		synthesisComplete = make(chan struct{})
	)

	startPayload := StartSynthesisPayload{
		Voice:      voice,
		Format:     "wav",
		SampleRate: 44100,
		Volume:     50,
		SpeechRate: 0,
		PitchRate:  0,
	}

	go c.receiveMessages(conn, onTextMessage, onBinaryMessage, synthesisStarted, synthesisComplete)

	taskId := util.GenerateID()
	log.GetLogger().Info("SpeechClient StartSynthesis", zap.String("taskId", taskId), zap.Any("payload", startPayload))
	if err := c.StartSynthesis(conn, taskId, startPayload, synthesisStarted); err != nil {
		return fmt.Errorf("failed to start synthesis: %w", err)
	}

	if err := c.RunSynthesis(conn, taskId, text); err != nil {
		return fmt.Errorf("failed to run synthesis: %w", err)
	}

	if err := c.StopSynthesis(conn, taskId, synthesisComplete); err != nil {
		return fmt.Errorf("failed to stop synthesis: %w", err)
	}

	return nil
}

func (c *TtsClient) sendMessage(conn *websocket.Conn, taskId, name string, payload interface{}) error {
	message := Message{
		Header: TtsHeader{
			Appkey:    c.Appkey,
			MessageID: util.GenerateID(),
			TaskID:    taskId,
			Namespace: "FlowingSpeechSynthesizer",
			Name:      name,
		},
		Payload: payload,
	}
	jsonData, _ := json.Marshal(message)
	log.GetLogger().Debug("SpeechClient sendMessage", zap.String("message", string(jsonData)))
	return conn.WriteJSON(message)
}

func (c *TtsClient) StartSynthesis(conn *websocket.Conn, taskId string, payload StartSynthesisPayload, synthesisStarted chan struct{}) error {
	err := c.sendMessage(conn, taskId, "StartSynthesis", payload)
	if err != nil {
		return err
	}

	// 阻塞等待 SynthesisStarted 事件
	<-synthesisStarted

	return nil
}

func (c *TtsClient) RunSynthesis(conn *websocket.Conn, taskId, text string) error {
	return c.sendMessage(conn, taskId, "RunSynthesis", RunSynthesisPayload{Text: text})
}

func (c *TtsClient) StopSynthesis(conn *websocket.Conn, taskId string, synthesisComplete chan struct{}) error {
	err := c.sendMessage(conn, taskId, "StopSynthesis", nil)
	if err != nil {
		return err
	}

	// 阻塞等待 SynthesisCompleted 事件
	<-synthesisComplete

	return nil
}

func (c *TtsClient) Close(conn *websocket.Conn) error {
	err := conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	if err != nil {
		return err
	}
	return conn.Close()
}

func (c *TtsClient) receiveMessages(conn *websocket.Conn, onTextMessage func(string), onBinaryMessage func([]byte), synthesisStarted, synthesisComplete chan struct{}) {
	defer close(synthesisComplete)
	for {
		messageType, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
				log.GetLogger().Error("SpeechClient receiveMessages websocket非正常关闭", zap.Error(err))
				return
			}
			return
		}
		if messageType == websocket.TextMessage {
			var msg Message
			if err := json.Unmarshal(message, &msg); err != nil {
				log.GetLogger().Error("SpeechClient receiveMessages json解析失败", zap.Error(err))
				return
			}
			if msg.Header.Name == "SynthesisCompleted" {
				log.GetLogger().Info("SynthesisCompleted event received")
				// 收到结束消息退出
				break
			} else if msg.Header.Name == "SynthesisStarted" {
				log.GetLogger().Info("SynthesisStarted event received")
				close(synthesisStarted)
			} else {
				onTextMessage(string(message))
			}
		} else if messageType == websocket.BinaryMessage {
			onBinaryMessage(message)
		}
	}
}
