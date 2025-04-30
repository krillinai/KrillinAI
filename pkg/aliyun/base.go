package aliyun

import (
	"encoding/json"
	"github.com/aliyun/alibaba-cloud-sdk-go/sdk"
	"github.com/aliyun/alibaba-cloud-sdk-go/sdk/requests"
	"go.uber.org/zap"
	"krillin-ai/config"
	"krillin-ai/log"
)

type TokenResult struct {
	ErrMsg string
	Token  struct {
		UserId     string
		Id         string
		ExpireTime int64
	}
}

func CreateToken(ak, sk string) (string, error) {
	client, err := sdk.NewClientWithAccessKey("cn-shanghai", ak, sk)
	if err != nil {
		return "", err
	}
	if config.Conf.App.Proxy != "" {
		client.SetHttpProxy(config.Conf.App.Proxy)
	}
	request := requests.NewCommonRequest()
	request.Method = "POST"
	request.Domain = "nls-meta.cn-shanghai.aliyuncs.com"
	request.ApiName = "CreateToken"
	request.Version = "2019-02-28"
	response, err := client.ProcessCommonRequest(request)
	if err != nil {
		log.GetLogger().Error("aliyun sdk create token request error:", zap.Error(err))
		return "", err
	}

	var tr TokenResult
	err = json.Unmarshal([]byte(response.GetHttpContentString()), &tr)
	if err != nil {
		log.GetLogger().Error("aliyun sdk json unmarshal error:", zap.Error(err))
		return "", err
	}
	return tr.Token.Id, nil
}
