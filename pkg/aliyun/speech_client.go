package aliyun

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type SpeechClient struct {
	conn              *websocket.Conn
	appkey            string
	taskID            string
	synthesisStarted  chan struct{}
	synthesisComplete chan struct{}
}

type Header struct {
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
	Header  Header      `json:"header"`
	Payload interface{} `json:"payload,omitempty"`
}

func NewSpeechClient(url, appkey string, onTextMessage func(string), onBinaryMessage func([]byte)) (*SpeechClient, error) {
	token, _ := CreateToken()
	fullURL := "wss://nls-gateway-cn-beijing.aliyuncs.com/ws/v1?token=" + token
	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 10 * time.Second
	conn, _, err := dialer.Dial(fullURL, nil)
	if err != nil {
		return nil, err
	}
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	client := &SpeechClient{
		conn:              conn,
		appkey:            appkey,
		taskID:            generateID(),
		synthesisComplete: make(chan struct{}),
		synthesisStarted:  make(chan struct{}),
	}

	go client.receiveMessages(onTextMessage, onBinaryMessage)

	return client, nil
}

func generateID() string {
	return strings.ReplaceAll(uuid.New().String(), "-", "")
}

func (c *SpeechClient) sendMessage(name string, payload interface{}) error {
	message := Message{
		Header: Header{
			Appkey:    c.appkey,
			MessageID: generateID(),
			TaskID:    c.taskID,
			Namespace: "FlowingSpeechSynthesizer",
			Name:      name,
		},
		Payload: payload,
	}
	//打印message，转成json字符串格式
	jsonData, _ := json.Marshal(message)
	// 打印 JSON 字符串
	fmt.Println(string(jsonData))
	return c.conn.WriteJSON(message)
}

func (c *SpeechClient) StartSynthesis(payload StartSynthesisPayload) error {
	err := c.sendMessage("StartSynthesis", payload)
	if err != nil {
		return err
	}

	// 阻塞等待 SynthesisStarted 事件
	<-c.synthesisStarted

	return nil
}

func (c *SpeechClient) RunSynthesis(text string) error {
	return c.sendMessage("RunSynthesis", RunSynthesisPayload{Text: text})
}

func (c *SpeechClient) StopSynthesis() error {
	err := c.sendMessage("StopSynthesis", nil)
	if err != nil {
		return err
	}

	// 阻塞等待 SynthesisCompleted 事件
	<-c.synthesisComplete

	return nil
}

func (c *SpeechClient) Close() error {
	err := c.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	if err != nil {
		log.Println("write close:", err)
		return err
	}
	return c.conn.Close()
}

func (c *SpeechClient) receiveMessages(onTextMessage func(string), onBinaryMessage func([]byte)) {
	defer close(c.synthesisComplete)
	for {
		messageType, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
				log.Println("connection closed normally")
				return
			}
			fmt.Println("read:", err)
			return
		}
		if messageType == websocket.TextMessage {
			var msg Message
			if err := json.Unmarshal(message, &msg); err != nil {
				fmt.Println("failed to unmarshal message:", err)
				return
			}
			if msg.Header.Name == "SynthesisCompleted" {
				fmt.Println("SynthesisCompleted event received")
				// 收到结束消息退出
				break
			} else if msg.Header.Name == "SynthesisStarted" {
				fmt.Println("SynthesisStarted event received")
				close(c.synthesisStarted)
			} else {
				onTextMessage(string(message))
			}
		} else if messageType == websocket.BinaryMessage {
			onBinaryMessage(message)
		}
	}
}
