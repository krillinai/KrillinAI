package aliyun

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"krillin-ai/config"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/google/uuid"
)

// type CosyClone struct{}

// _encodeText URL-编码文本，保证符合规范
func _encodeText(text string) string {
	encoded := url.QueryEscape(text)
	// 根据规范替换特殊字符
	return strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(encoded, "+", "%20"), "*", "%2A"), "%7E", "~")
}

// _encodeDict URL-编码字典（map）为查询字符串
func _encodeDict(dic map[string]string) string {
	var keys []string
	for key := range dic {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	values := url.Values{}

	for _, k := range keys {
		values.Add(k, dic[k])
	}
	encodedText := values.Encode()
	// 对整个查询字符串进行编码
	return strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(encodedText, "+", "%20"), "*", "%2A"), "%7E", "~")
}

// 生成签名
func GenerateSignature(secret, stringToSign string) string {
	key := []byte(secret + "&")
	data := []byte(stringToSign)
	hash := hmac.New(sha1.New, key)
	hash.Write(data)
	signature := base64.StdEncoding.EncodeToString(hash.Sum(nil))
	// 对签名进行URL编码
	return _encodeText(signature)
}

type CosyCloneClient struct {
	restyClient     *resty.Client
	accessKeyID     string
	accessKeySecret string
	appkey          string
	wsUrl           string
}

func NewCosyCloneClient() *CosyCloneClient {
	cli := resty.New()
	return &CosyCloneClient{
		restyClient:     cli,
		accessKeyID:     config.Conf.Aliyun.AccessKeyId,
		accessKeySecret: config.Conf.Aliyun.AccessKeySecret,
		appkey:          config.Conf.Aliyun.AppKey,
		wsUrl:           config.Conf.Aliyun.CosyVoiceWsAddr,
	}
}

func (client *CosyCloneClient) CosyVoiceClone(voicePrefix, audioURL string) {
	parameters := map[string]string{
		"AccessKeyId":      client.accessKeyID,
		"Action":           "CosyVoiceClone",
		"Format":           "JSON",
		"RegionId":         "cn-shanghai",
		"SignatureMethod":  "HMAC-SHA1",
		"SignatureNonce":   uuid.New().String(),
		"SignatureVersion": "1.0",
		"Timestamp":        time.Now().UTC().Format("2006-01-02T15:04:05Z"),
		"Version":          "2019-08-19",
		"VoicePrefix":      voicePrefix,
		"Url":              audioURL,
	}

	queryString := _encodeDict(parameters)
	fmt.Println("规范化的请求字符串:", queryString)
	stringToSign := "POST" + "&" + _encodeText("/") + "&" + _encodeText(queryString)
	fmt.Println("待签名的字符串:", stringToSign)
	signature := GenerateSignature(client.accessKeySecret, stringToSign)
	fmt.Println("URL编码后的签名:", signature)
	fullURL := fmt.Sprintf("https://nls-slp.cn-shanghai.aliyuncs.com/?Signature=%s&%s", signature, queryString)
	fmt.Printf("url: %s\n", fullURL)

	// Make the POST request using resty
	values := url.Values{}
	for key, value := range parameters {
		values.Add(key, value)
	}
	// resp, err := client.restyClient.R().SetQueryParam("Signature", signature).SetQueryParamsFromValues(values).Post(fullURL)
	resp, err := client.restyClient.R().Post(fullURL)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	fmt.Println("Response:", resp.String())
}

func (client *CosyCloneClient) CosyCloneList(voicePrefix string, pageIndex, pageSize int) {
	parameters := map[string]string{
		"AccessKeyId":      client.accessKeyID,
		"Action":           "ListCosyVoice",
		"Format":           "JSON",
		"RegionId":         "cn-shanghai",
		"SignatureMethod":  "HMAC-SHA1",
		"SignatureNonce":   uuid.New().String(),
		"SignatureVersion": "1.0",
		"Timestamp":        time.Now().UTC().Format("2006-01-02T15:04:05Z"),
		"Version":          "2019-08-19",
		"VoicePrefix":      voicePrefix,
		"PageIndex":        fmt.Sprintf("%d", pageIndex),
		"PageSize":         fmt.Sprintf("%d", pageSize),
	}

	queryString := _encodeDict(parameters)
	fmt.Println("规范化的请求字符串:", queryString)
	stringToSign := "POST" + "&" + _encodeText("/") + "&" + _encodeText(queryString)
	fmt.Println("待签名的字符串:", stringToSign)
	signature := GenerateSignature(client.accessKeySecret, stringToSign)
	fmt.Println("URL编码后的签名:", signature)
	fullURL := fmt.Sprintf("https://nls-slp.cn-shanghai.aliyuncs.com/?Signature=%s&%s", signature, queryString)
	fmt.Printf("url: %s\n", fullURL)

	// Make the POST request using resty
	values := url.Values{}
	for key, value := range parameters {
		values.Add(key, value)
	}
	resp, err := client.restyClient.R().Post(fullURL)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	fmt.Println("Response:", resp.String())
}

func (client *CosyCloneClient) Text2Speech(text, voice, outputFile string) error {
	file, err := os.OpenFile(outputFile, os.O_CREATE|os.O_WRONLY, 0666)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer file.Close()

	onTextMessage := func(message string) {
		fmt.Println("Received text message:", message)
	}

	onBinaryMessage := func(data []byte) {
		if _, err := file.Write(data); err != nil {
			fmt.Println("Failed to write data to file:", err)
		}
	}

	speechClient, err := NewSpeechClient(client.wsUrl, client.appkey, onTextMessage, onBinaryMessage)
	if err != nil {
		return fmt.Errorf("failed to create speech client: %w", err)
	}
	defer speechClient.Close()

	startPayload := StartSynthesisPayload{
		Voice:      voice,
		Format:     "wav",
		SampleRate: 44100,
		Volume:     50,
		SpeechRate: 0,
		PitchRate:  0,
	}
	if err := speechClient.StartSynthesis(startPayload); err != nil {
		return fmt.Errorf("failed to start synthesis: %w", err)
	}

	if err := speechClient.RunSynthesis(text); err != nil {
		return fmt.Errorf("failed to run synthesis: %w", err)
	}

	if err := speechClient.StopSynthesis(); err != nil {
		return fmt.Errorf("failed to stop synthesis: %w", err)
	}

	return nil
}
