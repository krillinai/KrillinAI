package aliyun

import (
	"encoding/json"
	"github.com/aliyun/alibaba-cloud-sdk-go/sdk"
	"github.com/aliyun/alibaba-cloud-sdk-go/sdk/requests"
	"github.com/wulien/jupiter/pkg/xlog"
	"krillin-ai/config"
)

type TokenResult struct {
	ErrMsg string
	Token  struct {
		UserId     string
		Id         string
		ExpireTime int64
	}
}

func CreateToken() (string, error) {
	client, err := sdk.NewClientWithAccessKey("cn-shanghai", config.Conf.Aliyun.AccessKeyId, config.Conf.Aliyun.AccessKeySecret)
	if err != nil {
		return "", err
	}
	request := requests.NewCommonRequest()
	request.Method = "POST"
	request.Domain = "nls-meta.cn-shanghai.aliyuncs.com"
	request.ApiName = "CreateToken"
	request.Version = "2019-02-28"
	response, err := client.ProcessCommonRequest(request)
	if err != nil {
		xlog.Default().Error("aliyun sdk create token request error:", xlog.Any("err", err))
		return "", err
	}

	var tr TokenResult
	err = json.Unmarshal([]byte(response.GetHttpContentString()), &tr)
	if err != nil {
		xlog.Default().Error("aliyun sdk json unmarshal error:", xlog.Any("err", err))
		return "", err
	}
	return tr.Token.Id, nil
}
