package aliyun

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"go.uber.org/zap"
	"krillin-ai/log"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/google/uuid"
)

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

type VoiceCloneResp struct {
	RequestId string `json:"RequestId"`
	Message   string `json:"Message"`
	Code      int    `json:"Code"`
	VoiceName string `json:"VoiceName"`
}

type VoiceCloneClient struct {
	restyClient     *resty.Client
	accessKeyID     string
	accessKeySecret string
	appkey          string
}

func NewVoiceCloneClient(accessKeyID, accessKeySecret, appkey string) *VoiceCloneClient {
	return &VoiceCloneClient{
		restyClient:     resty.New(),
		accessKeyID:     accessKeyID,
		accessKeySecret: accessKeySecret,
		appkey:          appkey,
	}
}

func (c *VoiceCloneClient) CosyVoiceClone(voicePrefix, audioURL string) (string, error) {
	log.GetLogger().Info("CosyVoiceClone请求开始", zap.String("voicePrefix", voicePrefix), zap.String("audioURL", audioURL))
	parameters := map[string]string{
		"AccessKeyId":      c.accessKeyID,
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
	stringToSign := "POST" + "&" + _encodeText("/") + "&" + _encodeText(queryString)
	signature := GenerateSignature(c.accessKeySecret, stringToSign)
	fullURL := fmt.Sprintf("https://nls-slp.cn-shanghai.aliyuncs.com/?Signature=%s&%s", signature, queryString)

	values := url.Values{}
	for key, value := range parameters {
		values.Add(key, value)
	}
	var res VoiceCloneResp
	resp, err := c.restyClient.R().SetResult(&res).Post(fullURL)
	if err != nil {
		log.GetLogger().Error("CosyVoiceClone post error", zap.Error(err))
		return "", fmt.Errorf("CosyVoiceClone post error: %w: ", err)
	}
	log.GetLogger().Info("CosyVoiceClone请求完毕", zap.String("Response", resp.String()))
	if res.Message != "SUCCESS" {
		log.GetLogger().Error("CosyVoiceClone res message is not success", zap.String("Request Id", res.RequestId), zap.Int("Code", res.Code), zap.String("Message", res.Message))
		return "", fmt.Errorf("CosyVoiceClone res message is not success, message: %s", res.Message)
	}
	return res.VoiceName, nil
}

func (c *VoiceCloneClient) CosyCloneList(voicePrefix string, pageIndex, pageSize int) {
	parameters := map[string]string{
		"AccessKeyId":      c.accessKeyID,
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
	stringToSign := "POST" + "&" + _encodeText("/") + "&" + _encodeText(queryString)
	signature := GenerateSignature(c.accessKeySecret, stringToSign)
	fullURL := fmt.Sprintf("https://nls-slp.cn-shanghai.aliyuncs.com/?Signature=%s&%s", signature, queryString)

	values := url.Values{}
	for key, value := range parameters {
		values.Add(key, value)
	}
	resp, err := c.restyClient.R().Post(fullURL)
	if err != nil {
		log.GetLogger().Error("CosyCloneList请求失败", zap.Error(err))
		return
	}
	log.GetLogger().Info("CosyCloneList请求成功", zap.String("Response", resp.String()))
}
